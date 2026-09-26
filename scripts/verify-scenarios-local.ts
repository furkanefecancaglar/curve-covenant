import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import { DynamicBondingCurveClient, deriveDbcPoolAddress, deriveTokenBadgeAddress, SwapMode } from '@meteora-ag/dynamic-bonding-curve-sdk'
import BN from 'bn.js'
import { buildControlledCurves } from '../src/scenarios'
import { ScenarioSimulator } from '../src/scenario-engine'
import type { ScenarioEvent } from '../src/scenario-engine'
import { PRESETS } from '../src/studio'
import { QUOTES } from '../src/quotes'
import { buildLaunchPlan } from '../src/launch-plan'
import { toPlain } from '../src/dbc'

// Endpoint cannot be changed to a public network. Signers and funds are local test fixtures only.
const port = Number(process.env.LOCAL_RPC_PORT ?? 18899)
assert(Number.isInteger(port) && port >= 1024 && port < 65535)
const connection = new Connection(`http://127.0.0.1:${port}`, 'confirmed')
const fixture = process.env.STOCK_FIXTURE_DIR
const payer = fixture ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(await readFile(join(fixture, 'signer.json'), 'utf8')))) : Keypair.generate()
const assets = fixture ? [QUOTES.SOL, QUOTES.XRXx] : [QUOTES.SOL]
const funding = await connection.requestAirdrop(payer.publicKey, 50 * LAMPORTS_PER_SOL)
await connection.confirmTransaction(funding, 'confirmed')
const client = DynamicBondingCurveClient.create(connection, 'confirmed')
const results: unknown[] = []
for (const asset of assets) {
  for (const feeSchedule of ['fixed', 'decaying'] as const) {
    const terms = { ...PRESETS.steady.values, initialMarketCap: 1, migrationMarketCap: 10,
      ...(feeSchedule === 'decaying' ? { startingFeeBps: 300, endingFeeBps: 50, feeDurationHours: 0.01 } : {}) }
    const curves = buildControlledCurves(terms, asset.decimals)
    for (const curve of curves) {
      const key = Keypair.generate(), mint = Keypair.generate()
      const quoteMint = new PublicKey(asset.mint)
      const tokenBadge = asset.id === 'SOL' ? undefined : deriveTokenBadgeAddress(quoteMint)
      const params = { ...curve.config, payer: payer.publicKey, config: key.publicKey,
        feeClaimer: payer.publicKey, leftoverReceiver: payer.publicKey, quoteMint, tokenBadge,
        preCreatePoolParam: { name: 'Scenario Validation', symbol: 'SCENARIO',
          uri: 'https://furkanefecancaglar.github.io/curve-covenant/metadata/demo-token.json',
          poolCreator: payer.publicKey, baseMint: mint.publicKey } }
      const plan = await buildLaunchPlan(client, params)
      const signatures = [await sendAndConfirmTransaction(connection, plan.transaction,
        plan.mode === 'split' ? [payer, key] : [payer, key, mint], { commitment: 'confirmed' })]
      if (plan.mode === 'split') {
        signatures.push(await sendAndConfirmTransaction(connection, await client.creator.createPool({
          ...params.preCreatePoolParam, config: key.publicKey, payer: payer.publicKey, tokenBadge,
        }), [payer, mint], { commitment: 'confirmed' }))
      }
      const pool = deriveDbcPoolAddress(quoteMint, mint.publicKey, key.publicKey)
      const initial = (await client.state.getPool(pool))!
      const simulator = new ScenarioSimulator(curve.config, asset.decimals)
      assert.equal(initial.poolState.baseReserve.toString(), simulator.snapshot().baseReserveRaw, 'Initial base reserve')
      assert.equal(initial.poolState.sqrtPrice.toString(), simulator.snapshot().sqrtPriceRaw, 'Initial price')
      const evidence: unknown[] = []
      const scale = 10n ** BigInt(asset.decimals)
      // Repeat buys, then sell half the accumulated inventory, buy again, sell
      // a fraction again, and cross the threshold with a partially filled buy.
      for (let i = 0; i < 7; i++) {
        const selling = i === 2 || i === 4
        const raw = selling ? BigInt(simulator.inventory('trader')) / (i === 2 ? 2n : 3n)
          : i === 6 ? BigInt(curve.config.migrationQuoteThreshold.toString()) * 3n : scale / 10n
        const beforePool = (await client.state.getPool(pool))!
        const beforeQuoteVault = BigInt((await connection.getTokenAccountBalance(beforePool.poolState.quoteVault)).value.amount)
        const swap = await client.pool.swap2({ pool, owner: payer.publicKey, payer: payer.publicKey,
          swapBaseForQuote: selling, swapMode: SwapMode.PartialFill, amountIn: new BN(raw.toString()), minimumAmountOut: new BN(1), referralTokenAccount: null })
        const signature = await sendAndConfirmTransaction(connection, swap, [payer], { commitment: 'confirmed' })
        const transaction = await connection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 })
        assert(transaction?.blockTime != null, 'Confirmed transaction block time must be available')
        const event: ScenarioEvent = { actor: 'trader', side: selling ? 'sell' : 'buy', amountRaw: raw.toString(),
          atSeconds: transaction.blockTime - Number(initial.poolState.activationPoint.toString()) }
        const predicted = simulator.execute(event)
        const actual = (await client.state.getPool(pool))!
        const state = actual.poolState
        assert.equal(state.sqrtPrice.toString(), predicted.after.sqrtPriceRaw, `Price after ${i}`)
        assert.equal(state.baseReserve.toString(), predicted.after.baseReserveRaw, `Base reserve after ${i}`)
        assert.equal(state.quoteReserve.toString(), predicted.after.quoteReserveRaw, `Quote reserve after ${i}`)
        assert.equal(state.protocolQuoteFee.add(state.partnerQuoteFee).add(state.creatorQuoteFee).toString(), predicted.after.feeQuoteRaw, `Fees after ${i}`)
        const baseBalance = (await connection.getTokenAccountBalance(getAssociatedTokenAddressSync(mint.publicKey, payer.publicKey))).value.amount
        assert.equal(baseBalance, simulator.inventory('trader'), `Actor inventory after ${i}`)
        const afterQuoteVault = BigInt((await connection.getTokenAccountBalance(state.quoteVault)).value.amount)
        assert.equal(selling ? beforeQuoteVault - afterQuoteVault : afterQuoteVault - beforeQuoteVault,
          BigInt(selling ? predicted.outputRaw : predicted.filledInputRaw), `Quote transfer after ${i}`)
        evidence.push({ signature, event, predicted, actual: { sqrtPriceRaw: state.sqrtPrice.toString(), baseReserveRaw: state.baseReserve.toString(),
          quoteReserveRaw: state.quoteReserve.toString(), feeQuoteRaw: state.protocolQuoteFee.add(state.partnerQuoteFee).add(state.creatorQuoteFee).toString(), baseBalance } })
      }
      assert(simulator.snapshot().completed, 'Last buy must complete the pool')
      assert(BigInt(simulator.trades.at(-1)!.unfilledInputRaw) > 0n, 'Last buy must return unfilled input')
      const result = { quote: asset.id, decimals: asset.decimals, curve: curve.id, feeSchedule, pool: pool.toBase58(),
        config: key.publicKey.toBase58(), launchSignatures: signatures, sdkConfig: toPlain(curve.config), checks: evidence }
      results.push(result)
      console.log(JSON.stringify({ quote: asset.id, curve: curve.id, feeSchedule, pool: pool.toBase58(), exactMatches: evidence.length }))
    }
  }
}
const report = { format: 'curve-covenant/scenario-chain-proof-v1', network: 'local-validator', generatedAt: new Date().toISOString(),
  sdkVersion: '1.5.13', syntheticStockBalance: Boolean(fixture), results }
const output = process.env.SCENARIO_PROOF_OUTPUT ?? '/tmp/curve-scenario-proof.json'
await writeFile(output, JSON.stringify(report, null, 2) + '\n')
console.log(`Exact local-chain parity confirmed. Evidence: ${output}`)

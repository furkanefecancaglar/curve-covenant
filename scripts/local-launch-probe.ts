import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, sendAndConfirmTransaction } from '@solana/web3.js'
import { DynamicBondingCurveClient, deriveDbcPoolAddress, deriveTokenBadgeAddress,
  deriveDammV2PoolAddress, deriveDbcPoolAuthority, DAMM_V2_MIGRATION_FEE_ADDRESS, SwapMode } from '@meteora-ag/dynamic-bonding-curve-sdk'
import BN from 'bn.js'
import { buildStudioConfig, PRESETS } from '../src/studio'
import { QUOTES } from '../src/quotes'
import type { QuoteId } from '../src/quotes'
import { buildLaunchPlan } from '../src/launch-plan'
import { readLifecycle } from '../src/lifecycle'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { PresetId } from '../src/studio'

const port = Number(process.env.LOCAL_RPC_PORT ?? 18899)
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid local RPC port')
const connection = new Connection(`http://127.0.0.1:${port}`, 'confirmed')
const fixture = process.env.STOCK_FIXTURE_DIR
const payer = fixture ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(await readFile(join(fixture, 'signer.json'), 'utf8')))) : Keypair.generate()
const config = Keypair.generate()
const mint = Keypair.generate()
const quoteId = (process.env.QUOTE ?? 'SOL') as QuoteId
const quoteAsset = QUOTES[quoteId]
if (!quoteAsset) throw new Error(`Unknown quote asset: ${quoteId}`)
const quoteMint = new PublicKey(quoteAsset.mint)
const graduate = process.env.GRADUATE === '1'
if (graduate && quoteId !== 'SOL' && !fixture) throw new Error('A synthetic local stock balance fixture is required.')
const preset = PRESETS[(process.env.PRESET ?? 'steady') as PresetId]
if (!preset) throw new Error('Unknown curve preset')

try {
  const airdrop = await connection.requestAirdrop(payer.publicKey, 10 * LAMPORTS_PER_SOL)
  await connection.confirmTransaction(airdrop, 'confirmed')
  const client = DynamicBondingCurveClient.create(connection, 'confirmed')
  const tokenBadge = quoteId === 'SOL' ? undefined : deriveTokenBadgeAddress(quoteMint)
  const curveConfig = buildStudioConfig(graduate
    ? { ...preset.values, initialMarketCap: 1, migrationMarketCap: 10 }
    : preset.values, quoteAsset.decimals)
  const plan = await buildLaunchPlan(client, {
    ...curveConfig,
    payer: payer.publicKey, config: config.publicKey,
    feeClaimer: payer.publicKey, leftoverReceiver: payer.publicKey, quoteMint, tokenBadge,
    preCreatePoolParam: {
      name: 'Curve Covenant Demo', symbol: 'CCDEMO',
      uri: 'https://furkanefecancaglar.github.io/curve-covenant/metadata/demo-token.json',
      poolCreator: payer.publicKey, baseMint: mint.publicKey,
    },
  })
  const transaction = plan.transaction
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
  transaction.feePayer = payer.publicKey
  transaction.recentBlockhash = blockhash
  transaction.sign(...(plan.mode === 'split' ? [payer, config] : [payer, config, mint]))
  const signature = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false })
  const confirmation = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')
  if (confirmation.value.err) throw new Error(JSON.stringify(confirmation.value.err))
  if (plan.mode === 'split') {
    const poolTx = await client.creator.createPool({ config: config.publicKey, baseMint: mint.publicKey,
      payer: payer.publicKey, poolCreator: payer.publicKey, tokenBadge,
      name: 'Curve Covenant Demo', symbol: 'CCDEMO',
      uri: 'https://furkanefecancaglar.github.io/curve-covenant/metadata/demo-token.json' })
    await sendAndConfirmTransaction(connection, poolTx, [payer, mint], { commitment: 'confirmed' })
  }
  console.log(JSON.stringify({ launchMode: plan.mode, firstTransactionBytes: plan.bytes }))
  const pool = deriveDbcPoolAddress(quoteMint, mint.publicKey, config.publicKey)
  const [configInfo, mintInfo, poolInfo] = await Promise.all([
    connection.getAccountInfo(config.publicKey), connection.getAccountInfo(mint.publicKey), connection.getAccountInfo(pool),
  ])
  console.log(JSON.stringify({ quoteId, signature, config: config.publicKey.toBase58(), mint: mint.publicKey.toBase58(),
    pool: pool.toBase58(), accounts: { config: Boolean(configInfo), mint: Boolean(mintInfo), pool: Boolean(poolInfo) } }))
  if (!configInfo || !mintInfo || !poolInfo) process.exitCode = 1
  if (graduate) {
    const swap = await client.pool.swap2({ pool, owner: payer.publicKey, payer: payer.publicKey,
      swapBaseForQuote: false, swapMode: SwapMode.PartialFill,
      amountIn: curveConfig.migrationQuoteThreshold.muln(2), minimumAmountOut: new BN(1), referralTokenAccount: null })
    const swapSignature = await sendAndConfirmTransaction(connection, swap, [payer], { commitment: 'confirmed' })
    const afterBuy = await client.state.getPool(pool)
    if (!afterBuy || afterBuy.poolState.quoteReserve.lt(curveConfig.migrationQuoteThreshold)) throw new Error('Threshold not reached')
    // The migration program pays position account rent from this authority on the local fixture.
    const authorityFunding = await connection.requestAirdrop(deriveDbcPoolAuthority(), LAMPORTS_PER_SOL)
    await connection.confirmTransaction(authorityFunding, 'confirmed')
    const dammConfig = DAMM_V2_MIGRATION_FEE_ADDRESS[curveConfig.migrationFeeOption]
    const migration = await client.migration.migrateToDammV2({ pool, dammConfig, payer: payer.publicKey })
    const migrationSignature = await sendAndConfirmTransaction(connection, migration.transaction,
      [payer, migration.firstPositionNftKeypair, migration.secondPositionNftKeypair], { commitment: 'confirmed' })
    const afterMigration = await client.state.getPool(pool)
    const dammPool = deriveDammV2PoolAddress(dammConfig, mint.publicKey, quoteMint)
    const dammAccount = await connection.getAccountInfo(dammPool)
    if (afterMigration?.poolState.isMigrated !== 1 || !dammAccount) throw new Error('Migration verification failed')
    console.log(JSON.stringify({ network: 'local-validator', swapSignature, migrationSignature,
      dammPool: dammPool.toBase58(), isMigrated: afterMigration.poolState.isMigrated,
      dammOwner: dammAccount.owner.toBase58() }))
    const lifecycle = await readLifecycle(pool.toBase58(), 'devnet', connection.rpcEndpoint)
    if (!lifecycle.migrated || !lifecycle.reserves || Number(lifecycle.reserves.quote) <= 0) throw new Error('Product lifecycle reader failed')
    console.log(JSON.stringify({ localLifecycleReader: 'passed', reserves: lifecycle.reserves }))
  }
} catch (error) {
  console.error(error)
  process.exitCode = 1
}

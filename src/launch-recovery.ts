import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import type { Transaction } from '@solana/web3.js'
import { deriveDbcPoolAddress, DYNAMIC_BONDING_CURVE_PROGRAM_ID, DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { QUOTES, verifyQuoteAsset } from './quotes'
import { RPC, formatUnits } from './dbc'
import { readTransactionOutcome, rpcDeadline, TransactionOutcomeError } from './confirmation'
import { archiveLaunchReceipt, loadLaunchReceipt, saveLaunchReceipt, withLaunchLock } from './launch-receipts'
import type { LaunchReceipt } from './launch-receipts'
import { connectWallet, sendWalletTransaction } from './wallet'
import { reviewTransaction } from './transaction-review'
import type { TransactionReview } from './transaction-review'

export type RecoveryState = { kind: 'created'; poolAddress: string } | { kind: 'pending'; message: string }
  | { kind: 'not-created' } | { kind: 'config-only'; threshold: string }
export type PreparedRecovery = { receipt: LaunchReceipt; mint: Keypair; transaction: Transaction; review: TransactionReview }
const connectionFor = (receipt: LaunchReceipt) => new Connection(RPC[QUOTES[receipt.quoteId].network], 'confirmed')
const poolFor = (receipt: LaunchReceipt) => deriveDbcPoolAddress(new PublicKey(QUOTES[receipt.quoteId].mint), new PublicKey(receipt.mintAddress), new PublicKey(receipt.configAddress))

export async function inspectLaunchReceipt(receipt: LaunchReceipt, connection = connectionFor(receipt)): Promise<RecoveryState> {
  const quote = QUOTES[receipt.quoteId]
  const poolAddress = poolFor(receipt)
  const configAddress = new PublicKey(receipt.configAddress)
  const [poolAccount, configAccount] = await Promise.all([
    rpcDeadline(connection.getAccountInfo(poolAddress)), rpcDeadline(connection.getAccountInfo(configAddress)),
  ])
  const client = DynamicBondingCurveClient.create(connection, 'confirmed')
  if (poolAccount) {
    if (!poolAccount.owner.equals(DYNAMIC_BONDING_CURVE_PROGRAM_ID)) throw new Error('The saved pool address is not owned by Meteora DBC.')
    const pool = await rpcDeadline(client.state.getPool(poolAddress))
    if (!pool?.poolState.config.equals(configAddress) || !pool.poolState.baseMint.equals(new PublicKey(receipt.mintAddress)) || !pool.poolState.creator.equals(new PublicKey(receipt.payer))) throw new Error('The saved pool does not match this launch receipt.')
    return { kind: 'created', poolAddress: poolAddress.toBase58() }
  }
  if (receipt.poolAttempt) {
    const result = await readTransactionOutcome(connection, receipt.poolAttempt)
    if (result.state === 'pending' || result.state === 'confirmed') return { kind: 'pending', message: result.state === 'confirmed'
      ? 'The transaction is confirmed. This RPC has not returned its pool yet; check again.' : 'The previous token creation is unresolved. Check this transaction before starting another attempt.' }
  }
  if (!configAccount) {
    const result = await readTransactionOutcome(connection, receipt.configAttempt)
    return result.state === 'failed' || result.state === 'expired' ? { kind: 'not-created' }
      : { kind: 'pending', message: 'The configuration transaction still needs checking. No new transaction will be sent.' }
  }
  if (!configAccount.owner.equals(DYNAMIC_BONDING_CURVE_PROGRAM_ID)) throw new Error('The saved configuration is not owned by Meteora DBC.')
  const config = await rpcDeadline(client.state.getPoolConfig(configAddress))
  const payer = new PublicKey(receipt.payer)
  if (!config || !config.quoteMint.equals(new PublicKey(quote.mint)) || !config.feeClaimer.equals(payer) || !config.leftoverReceiver.equals(payer)) throw new Error('The configuration quote or recipient addresses do not match this launch receipt.')
  return { kind: 'config-only', threshold: formatUnits(config.migrationQuoteThreshold.toString(), quote.decimals) }
}

function currentReceipt(receipt: LaunchReceipt) {
  const saved = loadLaunchReceipt(receipt.configAddress)
  if (!saved || JSON.stringify(saved) !== JSON.stringify(receipt)) throw new Error('This launch receipt changed in another tab. Check the saved launch again.')
}
export async function prepareLaunchRecovery(receipt: LaunchReceipt): Promise<PreparedRecovery> {
  currentReceipt(receipt)
  const connection = connectionFor(receipt)
  if ((await inspectLaunchReceipt(receipt, connection)).kind !== 'config-only') throw new Error('Check the saved launch status again before preparing token creation.')
  const { publicKey: payer } = await connectWallet()
  if (payer.toBase58() !== receipt.payer) throw new Error('Reconnect the wallet that paid for this configuration.')
  const tokenBadge = await verifyQuoteAsset(connection, QUOTES[receipt.quoteId])
  // The original unused mint signer was ephemeral. Reuse the paid config with a
  // fresh mint only after the previous pool attempt is known not to be pending.
  const mint = Keypair.generate()
  const client = DynamicBondingCurveClient.create(connection, 'confirmed')
  const transaction = await client.creator.createPool({ config: new PublicKey(receipt.configAddress), baseMint: mint.publicKey, payer, poolCreator: payer,
    name: receipt.identity.name, symbol: receipt.identity.symbol, uri: receipt.identity.metadataUri, tokenBadge })
  return { receipt, mint, transaction, review: await reviewTransaction(connection, payer, transaction) }
}
export async function resumeLaunchRecovery(prepared: PreparedRecovery) {
  const { receipt, mint, transaction } = prepared
  return withLaunchLock(receipt.configAddress, async () => {
    currentReceipt(receipt)
    const connection = connectionFor(receipt)
    const state = await inspectLaunchReceipt(receipt, connection)
    if (state.kind === 'created') { archiveLaunchReceipt(receipt, state.poolAddress); return state.poolAddress }
    if (state.kind !== 'config-only') throw new Error('The previous transaction still needs checking. No new transaction was sent.')
    const { wallet, publicKey: payer } = await connectWallet()
    if (payer.toBase58() !== receipt.payer) throw new Error('Reconnect the wallet that paid for this configuration.')
    await verifyQuoteAsset(connection, QUOTES[receipt.quoteId])
    const fresh = await reviewTransaction(connection, payer, transaction)
    if (fresh.estimatedDebitLamports > prepared.review.estimatedDebitLamports) throw new Error('The token creation cost increased. Check the cost again before signing.')
    let updated: LaunchReceipt | undefined
    try {
      await sendWalletTransaction(connection, wallet, payer, transaction, [mint], (_signature, poolAttempt) => {
        currentReceipt(receipt)
        updated = { ...receipt, mintAddress: mint.publicKey.toBase58(), poolAttempt }
        saveLaunchReceipt(updated)
      })
    } catch (issue) {
      if (updated && issue instanceof TransactionOutcomeError && issue.state !== 'pending') saveLaunchReceipt({ ...updated, poolAttempt: undefined })
      throw issue
    }
    if (!updated) throw new Error('The signed launch receipt is unavailable. Check the saved launch.')
    const result = await inspectLaunchReceipt(updated, connection)
    if (result.kind !== 'created') throw new Error('Token creation needs another status check. Its receipt is saved in this browser.')
    archiveLaunchReceipt(updated, result.poolAddress)
    return result.poolAddress
  })
}

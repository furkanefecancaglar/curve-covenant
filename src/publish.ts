import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { DynamicBondingCurveClient, deriveDbcPoolAddress } from '@meteora-ag/dynamic-bonding-curve-sdk'
import type { ConfigParameters } from '@meteora-ag/dynamic-bonding-curve-sdk'
import type { QuoteAsset } from './quotes'
import { verifyQuoteAsset } from './quotes'
import { connectWallet, sendWalletTransaction } from './wallet'
import { buildLaunchPlan } from './launch-plan'
import { reviewTransaction } from './transaction-review'
import type { TransactionReview } from './transaction-review'
import { readTokenBalance } from './balances'
import { readTransactionOutcome, TransactionOutcomeError } from './confirmation'
import type { TransactionAttempt } from './confirmation'
import { archiveLaunchReceipt, loadLaunchReceipt, removeLaunchReceipt, saveLaunchReceipt, withLaunchLock } from './launch-receipts'
import type { LaunchReceipt } from './launch-receipts'

import { RPC } from './rpc-settings'
const SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112')

export async function publishDevnetConfig(config: ConfigParameters): Promise<{ configAddress: string; signature: string }> {
  const { wallet, publicKey: payer } = await connectWallet()
  const connection = new Connection(RPC.devnet, 'confirmed')
  const account = Keypair.generate()
  const client = DynamicBondingCurveClient.create(connection, 'confirmed')
  const transaction = await client.partner.createConfig({
    ...config, payer, config: account.publicKey, feeClaimer: payer,
    leftoverReceiver: payer, quoteMint: SOL_MINT,
  })
  const signature = await sendWalletTransaction(connection, wallet, payer, transaction, [account])
  const chainAccount = await connection.getAccountInfo(account.publicKey, 'confirmed')
  if (!chainAccount) throw new Error(`Transaction ${signature} was sent, but the new config is not yet visible. Check the devnet explorer.`)
  return { configAddress: account.publicKey.toBase58(), signature }
}

export type TokenIdentity = { name: string; symbol: string; metadataUri: string }
export type PreparedLaunch = {
  payer: PublicKey; configAccount: Keypair; mint: Keypair; identity: TokenIdentity; quoteAsset: QuoteAsset
  plan: Awaited<ReturnType<typeof buildLaunchPlan>>; review: TransactionReview; quoteBalance: string | null
}
export type PendingLaunch = { configAddress: string; configSignature: string; mint: Keypair;
  payer: string; identity: TokenIdentity; quoteAsset: QuoteAsset; signature?: string; attempt?: TransactionAttempt; receipt?: LaunchReceipt }
export class LaunchNotCreatedError extends Error {}
export class IncompleteLaunchError extends Error {
  pending: PendingLaunch
  constructor(pending: PendingLaunch, cause: unknown) {
    super(`Launch unfinished. Its transaction references are saved in this browser: ${cause instanceof Error ? cause.message : String(cause)}`)
    this.pending = pending
  }
}

export async function finishLaunch(pending: PendingLaunch) {
  return withLaunchLock(pending.configAddress, () => finishLaunchInTab(pending))
}
async function finishLaunchInTab(pending: PendingLaunch) {
  const stored = loadLaunchReceipt(pending.configAddress)
  if (pending.receipt && !stored) throw new Error('This launch was completed or changed in another tab. Reload to open it from Saved pools.')
  if (stored && stored.mintAddress !== pending.mint.publicKey.toBase58()) throw new Error('This launch was resumed in another tab. Check its receipt in Unfinished launches.')
  const { wallet, publicKey: payer } = await connectWallet()
  if (payer.toBase58() !== pending.payer) throw new Error('Reconnect the wallet that created this launch configuration.')
  const connection = new Connection(RPC[pending.quoteAsset.network], 'confirmed')
  const quoteMint = new PublicKey(pending.quoteAsset.mint)
  const config = new PublicKey(pending.configAddress)
  const pool = deriveDbcPoolAddress(quoteMint, pending.mint.publicKey, config)
  if (!(await connection.getAccountInfo(pool))) {
    const configInfo = await connection.getAccountInfo(config)
    if (pending.attempt) {
      const outcome = await readTransactionOutcome(connection, pending.attempt)
      if (outcome.state === 'pending') throw new TransactionOutcomeError(pending.attempt, 'pending')
      if ((outcome.state === 'failed' || outcome.state === 'expired') && !configInfo) {
        if (pending.receipt) removeLaunchReceipt(pending.receipt)
        throw new LaunchNotCreatedError('The configuration transaction did not complete. Check the launch cost again before starting a new attempt.')
      }
      if (outcome.state === 'confirmed' && pending.signature) throw new Error('The transaction is confirmed, but its pool is not visible from this RPC yet. Check the same launch again.')
      pending.attempt = undefined
    }
    if (!configInfo) throw new Error('The submitted configuration is not visible yet. Check its transaction before retrying. This tab keeps the same launch addresses.')
    const tokenBadge = await verifyQuoteAsset(connection, pending.quoteAsset)
    const client = DynamicBondingCurveClient.create(connection, 'confirmed')
    const tx = await client.creator.createPool({ config, baseMint: pending.mint.publicKey, payer, poolCreator: payer,
      name: pending.identity.name, symbol: pending.identity.symbol, uri: pending.identity.metadataUri, tokenBadge })
    await reviewTransaction(connection, payer, tx)
    try {
      await sendWalletTransaction(connection, wallet, payer, tx, [pending.mint], (signature, attempt) => {
        if (pending.receipt) {
          const current = loadLaunchReceipt(pending.configAddress)
          if (!current || current.mintAddress !== pending.mint.publicKey.toBase58()) throw new Error('This launch changed in another tab. Check its saved receipt before continuing.')
          const next = { ...pending.receipt, poolAttempt: attempt }
          saveLaunchReceipt(next); pending.receipt = next
        }
        pending.signature = signature; pending.attempt = attempt
      })
    } catch (issue) {
      if (issue instanceof TransactionOutcomeError && issue.state !== 'pending') {
        pending.attempt = undefined; pending.signature = undefined
        if (pending.receipt) { pending.receipt = { ...pending.receipt, poolAttempt: undefined }; saveLaunchReceipt(pending.receipt) }
      }
      throw issue
    }
  }
  if (!(await connection.getAccountInfo(pool))) throw new Error('Pool confirmation is pending. Retry to check the same pool.')
  if (pending.receipt) archiveLaunchReceipt(pending.receipt, pool.toBase58())
  return { configAddress: pending.configAddress, mintAddress: pending.mint.publicKey.toBase58(),
    poolAddress: pool.toBase58(), signature: pending.signature ?? pending.configSignature }
}

export async function launchPool(config: ConfigParameters, identity: TokenIdentity, quoteAsset: QuoteAsset,
  onProgress: (message: string) => void = () => {}) {
  return launchPrepared(await prepareLaunch(config, identity, quoteAsset), onProgress)
}

export async function prepareLaunch(config: ConfigParameters, identity: TokenIdentity, quoteAsset: QuoteAsset,
  onConnected?: (address: string, balanceLamports: number) => void): Promise<PreparedLaunch> {
  const name = identity.name.trim()
  const symbol = identity.symbol.trim().toUpperCase()
  if (!name || new TextEncoder().encode(name).length > 32) throw new Error('Token name must be 1–32 UTF-8 bytes.')
  if (!/^[A-Z0-9]{2,10}$/.test(symbol)) throw new Error('Ticker must have 2–10 letters or digits.')
  let uri: URL
  try { uri = new URL(identity.metadataUri.trim()) } catch { throw new Error('Enter a public HTTPS metadata JSON URL.') }
  if (uri.protocol !== 'https:' || uri.toString().length > 200) throw new Error('Metadata must be a public HTTPS URL under 200 characters.')
  if (uri.pathname.endsWith('/metadata/demo-token.json') && (name !== 'Curve Covenant Demo' || symbol !== 'CCDEMO')) {
    throw new Error('The example metadata is only for the CCDEMO test token. Host matching metadata for your token.')
  }
  const { publicKey: payer } = await connectWallet()
  const endpoint = RPC[quoteAsset.network]
  const connection = new Connection(endpoint, 'confirmed')
  const balance = await connection.getBalance(payer, 'confirmed')
  onConnected?.(payer.toBase58(), balance)
  if (balance === 0) throw new Error(quoteAsset.network === 'devnet'
    ? 'This wallet has no devnet SOL. Use “Get free devnet SOL”, then check the launch again.'
    : 'This wallet has no mainnet SOL for account rent and fees. Fund it before checking the launch again.')
  const quoteMint = new PublicKey(quoteAsset.mint)
  const tokenBadge = await verifyQuoteAsset(connection, quoteAsset)
  const configAccount = Keypair.generate()
  const mint = Keypair.generate()
  const client = DynamicBondingCurveClient.create(connection, 'confirmed')
  const plan = await buildLaunchPlan(client, {
    ...config, payer, config: configAccount.publicKey, feeClaimer: payer,
    leftoverReceiver: payer, quoteMint, tokenBadge,
    preCreatePoolParam: { name, symbol, uri: uri.toString(), poolCreator: payer, baseMint: mint.publicKey },
  })
  const review = await reviewTransaction(connection, payer, plan.transaction)
  const quoteBalance = quoteAsset.id === 'SOL' ? null : (await readTokenBalance(connection, payer, quoteMint)).amount
  return { payer, configAccount, mint, identity: { name, symbol, metadataUri: uri.toString() }, quoteAsset, plan, review, quoteBalance }
}

export async function launchPrepared(prepared: PreparedLaunch, onProgress: (message: string) => void = () => {}): Promise<{
  configAddress: string; mintAddress: string; poolAddress: string; signature: string
}> {
  const { plan, configAccount, mint, identity, quoteAsset } = prepared
  const { wallet, publicKey: payer } = await connectWallet()
  if (!payer.equals(prepared.payer)) throw new Error('Your Phantom account changed. Check the launch again with the account you want to use.')
  const connection = new Connection(RPC[quoteAsset.network], 'confirmed')
  const quoteMint = new PublicKey(quoteAsset.mint)
  await verifyQuoteAsset(connection, quoteAsset)
  onProgress('Refreshing the balance and transaction check before requesting your signature…')
  const refreshed = await reviewTransaction(connection, payer, plan.transaction)
  if (refreshed.estimatedDebitLamports > prepared.review.estimatedDebitLamports) {
    throw new Error('The estimated creation cost increased. Check the launch again to review the new amount before signing.')
  }
  onProgress(plan.mode === 'split' ? 'Step 1 of 2: approve the curve configuration. Token creation follows in a second approval.' : 'Approve the token and pool launch in your wallet.')
  let submitted = ''
  let attempt: TransactionAttempt | undefined
  let receipt: LaunchReceipt | undefined
  let signature: string
  try {
    signature = await sendWalletTransaction(connection, wallet, payer, plan.transaction,
      plan.mode === 'split' ? [configAccount] : [configAccount, mint], (value, context) => {
        receipt = { version: 1, configAddress: configAccount.publicKey.toBase58(), mintAddress: mint.publicKey.toBase58(),
          payer: payer.toBase58(), quoteId: quoteAsset.id, identity, configAttempt: context,
          ...(plan.mode === 'combined' ? { poolAttempt: context } : {}) }
        saveLaunchReceipt(receipt)
        submitted = value; attempt = context
      })
  } catch (issue) {
    if (issue instanceof TransactionOutcomeError && issue.state !== 'pending' && receipt) removeLaunchReceipt(receipt)
    if (!submitted || (issue instanceof TransactionOutcomeError && issue.state !== 'pending')) throw issue
    throw new IncompleteLaunchError({ configAddress: configAccount.publicKey.toBase58(), configSignature: submitted,
      mint, payer: payer.toBase58(), quoteAsset, identity, attempt, receipt, signature: plan.mode === 'combined' ? submitted : undefined }, issue)
  }
  if (plan.mode === 'split') {
    const pending: PendingLaunch = { configAddress: configAccount.publicKey.toBase58(), configSignature: signature,
      mint, payer: payer.toBase58(), quoteAsset, identity, receipt }
    onProgress('Step 2 of 2: configuration confirmed. Approve token and pool creation.')
    try { return await finishLaunch(pending) }
    catch (error) { throw new IncompleteLaunchError(pending, error) }
  }
  const poolAddress = deriveDbcPoolAddress(quoteMint, mint.publicKey, configAccount.publicKey)
  try {
    const [configInfo, poolInfo] = await Promise.all([
      connection.getAccountInfo(configAccount.publicKey, 'confirmed'),
      connection.getAccountInfo(poolAddress, 'confirmed'),
    ])
    if (!configInfo || !poolInfo) throw new Error('Confirmation is still pending. Retry to check the same pool.')
  } catch (issue) {
    throw new IncompleteLaunchError({ configAddress: configAccount.publicKey.toBase58(), configSignature: signature,
      mint, payer: payer.toBase58(), quoteAsset, identity, signature, attempt, receipt }, issue)
  }
  if (receipt) archiveLaunchReceipt(receipt, poolAddress.toBase58())
  return { configAddress: configAccount.publicKey.toBase58(), mintAddress: mint.publicKey.toBase58(),
    poolAddress: poolAddress.toBase58(), signature }
}

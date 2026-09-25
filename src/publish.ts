import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { DynamicBondingCurveClient, deriveDbcPoolAddress } from '@meteora-ag/dynamic-bonding-curve-sdk'
import type { ConfigParameters } from '@meteora-ag/dynamic-bonding-curve-sdk'
import type { QuoteAsset } from './quotes'
import { verifyQuoteAsset } from './quotes'
import { connectWallet, sendWalletTransaction } from './wallet'
import { buildLaunchPlan } from './launch-plan'

const DEVNET_RPC = 'https://api.devnet.solana.com'
const SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112')

export async function publishDevnetConfig(config: ConfigParameters): Promise<{ configAddress: string; signature: string }> {
  const { wallet, publicKey: payer } = await connectWallet()
  const connection = new Connection(DEVNET_RPC, 'confirmed')
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
export type PendingLaunch = { configAddress: string; configSignature: string; mint: Keypair;
  payer: string; identity: TokenIdentity; quoteAsset: QuoteAsset; signature?: string }
export class IncompleteLaunchError extends Error {
  pending: PendingLaunch
  constructor(pending: PendingLaunch, cause: unknown) {
    super(`Config created. Token creation is unfinished: ${cause instanceof Error ? cause.message : String(cause)}`)
    this.pending = pending
  }
}

export async function finishLaunch(pending: PendingLaunch) {
  const { wallet, publicKey: payer } = await connectWallet()
  if (payer.toBase58() !== pending.payer) throw new Error('Reconnect the wallet that created this launch configuration.')
  const connection = new Connection(pending.quoteAsset.network === 'devnet' ? DEVNET_RPC : 'https://solana-rpc.publicnode.com', 'confirmed')
  const quoteMint = new PublicKey(pending.quoteAsset.mint)
  const config = new PublicKey(pending.configAddress)
  const pool = deriveDbcPoolAddress(quoteMint, pending.mint.publicKey, config)
  if (!(await connection.getAccountInfo(pool))) {
    const tokenBadge = await verifyQuoteAsset(connection, pending.quoteAsset)
    const client = DynamicBondingCurveClient.create(connection, 'confirmed')
    const tx = await client.creator.createPool({ config, baseMint: pending.mint.publicKey, payer, poolCreator: payer,
      name: pending.identity.name, symbol: pending.identity.symbol, uri: pending.identity.metadataUri, tokenBadge })
    await sendWalletTransaction(connection, wallet, payer, tx, [pending.mint], signature => { pending.signature = signature })
  }
  if (!(await connection.getAccountInfo(pool))) throw new Error('Pool confirmation is pending. Retry to check the same pool.')
  return { configAddress: pending.configAddress, mintAddress: pending.mint.publicKey.toBase58(),
    poolAddress: pool.toBase58(), signature: pending.signature ?? pending.configSignature }
}

export async function launchPool(config: ConfigParameters, identity: TokenIdentity, quoteAsset: QuoteAsset,
  onProgress: (message: string) => void = () => {}): Promise<{
  configAddress: string; mintAddress: string; poolAddress: string; signature: string
}> {
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
  const { wallet, publicKey: payer } = await connectWallet()
  const endpoint = quoteAsset.network === 'devnet' ? DEVNET_RPC : 'https://solana-rpc.publicnode.com'
  const connection = new Connection(endpoint, 'confirmed')
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
  onProgress(plan.mode === 'split' ? 'Step 1 of 2: approve the curve configuration. Token creation follows in a second approval.' : 'Approve the token and pool launch in your wallet.')
  const signature = await sendWalletTransaction(connection, wallet, payer, plan.transaction,
    plan.mode === 'split' ? [configAccount] : [configAccount, mint])
  if (plan.mode === 'split') {
    const pending: PendingLaunch = { configAddress: configAccount.publicKey.toBase58(), configSignature: signature,
      mint, payer: payer.toBase58(), quoteAsset, identity: { name, symbol, metadataUri: uri.toString() } }
    onProgress('Step 2 of 2: configuration confirmed. Approve token and pool creation.')
    try { return await finishLaunch(pending) }
    catch (error) { throw new IncompleteLaunchError(pending, error) }
  }
  const poolAddress = deriveDbcPoolAddress(quoteMint, mint.publicKey, configAccount.publicKey)
  const [configInfo, poolInfo] = await Promise.all([
    connection.getAccountInfo(configAccount.publicKey, 'confirmed'),
    connection.getAccountInfo(poolAddress, 'confirmed'),
  ])
  if (!configInfo || !poolInfo) throw new Error(`Transaction ${signature} was sent, but config or pool is not yet visible. Check the ${quoteAsset.network} explorer.`)
  return { configAddress: configAccount.publicKey.toBase58(), mintAddress: mint.publicKey.toBase58(),
    poolAddress: poolAddress.toBase58(), signature }
}

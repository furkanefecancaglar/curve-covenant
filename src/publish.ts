import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { DynamicBondingCurveClient, deriveDbcPoolAddress } from '@meteora-ag/dynamic-bonding-curve-sdk'
import type { ConfigParameters } from '@meteora-ag/dynamic-bonding-curve-sdk'
import type { QuoteAsset } from './quotes'
import { verifyQuoteAsset } from './quotes'
import { connectWallet, sendWalletTransaction } from './wallet'

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

export async function launchPool(config: ConfigParameters, identity: TokenIdentity, quoteAsset: QuoteAsset): Promise<{
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
  const transaction = await client.partner.createConfigAndPool({
    ...config, payer, config: configAccount.publicKey, feeClaimer: payer,
    leftoverReceiver: payer, quoteMint, tokenBadge,
    preCreatePoolParam: { name, symbol, uri: uri.toString(), poolCreator: payer, baseMint: mint.publicKey },
  })
  const signature = await sendWalletTransaction(connection, wallet, payer, transaction, [configAccount, mint])
  const poolAddress = deriveDbcPoolAddress(quoteMint, mint.publicKey, configAccount.publicKey)
  const [configInfo, poolInfo] = await Promise.all([
    connection.getAccountInfo(configAccount.publicKey, 'confirmed'),
    connection.getAccountInfo(poolAddress, 'confirmed'),
  ])
  if (!configInfo || !poolInfo) throw new Error(`Transaction ${signature} was sent, but config or pool is not yet visible. Check the ${quoteAsset.network} explorer.`)
  return { configAddress: configAccount.publicKey.toBase58(), mintAddress: mint.publicKey.toBase58(),
    poolAddress: poolAddress.toBase58(), signature }
}

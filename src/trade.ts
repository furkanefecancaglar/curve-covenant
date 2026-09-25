import { Connection, PublicKey } from '@solana/web3.js'
import { DynamicBondingCurveClient, SwapMode } from '@meteora-ag/dynamic-bonding-curve-sdk'
import BN from 'bn.js'
import { loadLaunch, parseUnits, quoteBuy, RPC } from './dbc'
import type { BuyQuote, Network } from './dbc'
import { connectWallet, sendWalletTransaction } from './wallet'
import { QUOTES, verifyQuoteAsset } from './quotes'

export type TradePreview = { pool: string; network: Network; quoteDecimals: number; quote: BuyQuote }

export async function previewBuy(pool: string, network: Network, amount: string): Promise<TradePreview> {
  const launch = await loadLaunch(pool, network)
  const knownQuote = Object.values(QUOTES).find(asset => asset.mint === launch.quoteMint)
  if (knownQuote) await verifyQuoteAsset(new Connection(RPC[network], 'confirmed'), knownQuote)
  return { pool: launch.poolAddress!, network, quoteDecimals: launch.quoteDecimals, quote: await quoteBuy(launch, amount) }
}

export function validateTradePreview(preview: TradePreview, now = Date.now()) {
  const age = now - Date.parse(preview.quote.fetchedAt)
  if (!Number.isFinite(age) || age < 0 || age > 60_000) throw new Error('This quote expired. Calculate a fresh quote before buying.')
  const amountIn = new BN(parseUnits(preview.quote.input, preview.quoteDecimals))
  const minimumAmountOut = new BN(parseUnits(preview.quote.minimumTokens, preview.quote.baseDecimals))
  return { amountIn, minimumAmountOut }
}

export async function executeBuy(preview: TradePreview) {
  const amounts = validateTradePreview(preview)
  const connection = new Connection(RPC[preview.network], 'confirmed')
  const { wallet, publicKey: payer } = await connectWallet()
  const client = DynamicBondingCurveClient.create(connection, 'confirmed')
  const transaction = await client.pool.swap2({ pool: new PublicKey(preview.pool), owner: payer, payer,
    swapBaseForQuote: false, swapMode: SwapMode.PartialFill, ...amounts, referralTokenAccount: null })
  return sendWalletTransaction(connection, wallet, payer, transaction)
}

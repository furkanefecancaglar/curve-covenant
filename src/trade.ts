import { Connection, PublicKey } from '@solana/web3.js'
import { DynamicBondingCurveClient, SwapMode } from '@meteora-ag/dynamic-bonding-curve-sdk'
import BN from 'bn.js'
import { loadLaunch, parseUnits, quoteSwap, RPC } from './dbc'
import type { Network, SwapQuote, TradeSide } from './dbc'
import { connectWallet, sendWalletTransaction } from './wallet'
import { QUOTES, verifyQuoteAsset } from './quotes'

export type TradePreview = { pool: string; network: Network; quote: SwapQuote }

export async function previewTrade(pool: string, network: Network, amount: string, side: TradeSide): Promise<TradePreview> {
  const launch = await loadLaunch(pool, network)
  const knownQuote = Object.values(QUOTES).find(asset => asset.mint === launch.quoteMint)
  if (knownQuote) await verifyQuoteAsset(new Connection(RPC[network], 'confirmed'), knownQuote)
  return { pool: launch.poolAddress!, network, quote: await quoteSwap(launch, amount, side) }
}

export function validateTradePreview(preview: TradePreview, now = Date.now()) {
  const age = now - Date.parse(preview.quote.fetchedAt)
  if (!Number.isFinite(age) || age < 0 || age > 60_000) throw new Error('This quote expired. Calculate a fresh quote before trading.')
  const amountIn = new BN(parseUnits(preview.quote.input, preview.quote.inputDecimals))
  const minimumAmountOut = new BN(parseUnits(preview.quote.minimumOutput, preview.quote.outputDecimals))
  return { amountIn, minimumAmountOut }
}

export async function executeTrade(preview: TradePreview) {
  validateTradePreview(preview)
  const connection = new Connection(RPC[preview.network], 'confirmed')
  const { wallet, publicKey: payer } = await connectWallet()
  const client = DynamicBondingCurveClient.create(connection, 'confirmed')
  const transaction = await client.pool.swap2({ pool: new PublicKey(preview.pool), owner: payer, payer,
    swapBaseForQuote: preview.quote.side === 'sell', swapMode: SwapMode.PartialFill,
    ...validateTradePreview(preview), referralTokenAccount: null })
  validateTradePreview(preview)
  return sendWalletTransaction(connection, wallet, payer, transaction)
}

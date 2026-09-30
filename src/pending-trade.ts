import { PublicKey } from '@solana/web3.js'
import bs58 from 'bs58'
import type { Network, TradeSide } from './dbc'
import type { TransactionAttempt } from './confirmation'

export type PendingTrade = { pool: string; network: Network; side: TradeSide; input: string; inputSymbol: string; attempt: TransactionAttempt }
export const pendingTradeKey = (pool: string, network: Network) => `curve-covenant:pending-trade:v1:${network}:${pool}`

export function parsePendingTrade(raw: string | null, pool: string, network: Network): PendingTrade | null {
  try {
    const value = JSON.parse(raw ?? 'null')
    if (!value || value.pool !== pool || value.network !== network || !['buy', 'sell'].includes(value.side)) return null
    new PublicKey(value.pool)
    if (typeof value.input !== 'string' || !/^\d+(\.\d+)?$/.test(value.input) || value.input.length > 100) return null
    if (typeof value.inputSymbol !== 'string' || value.inputSymbol.length > 40) return null
    const attempt = value.attempt
    if (!attempt || typeof attempt.signature !== 'string' || attempt.signature.length > 88 || bs58.decode(attempt.signature).length !== 64) return null
    new PublicKey(attempt.blockhash)
    if (!Number.isSafeInteger(attempt.lastValidBlockHeight) || attempt.lastValidBlockHeight < 0 || !Number.isFinite(Date.parse(attempt.startedAt))) return null
    return { pool, network, side: value.side, input: value.input, inputSymbol: value.inputSymbol,
      attempt: { signature: attempt.signature, blockhash: attempt.blockhash, lastValidBlockHeight: attempt.lastValidBlockHeight, startedAt: attempt.startedAt } }
  } catch { return null }
}

export function loadPendingTrade(pool: string, network: Network): PendingTrade | null {
  try { return parsePendingTrade(localStorage.getItem(pendingTradeKey(pool, network)), pool, network) } catch { return null }
}

export function savePendingTrade(trade: PendingTrade): boolean {
  try { localStorage.setItem(pendingTradeKey(trade.pool, trade.network), JSON.stringify(trade)); return true } catch { return false }
}

export function removePendingTrade(trade: PendingTrade) {
  try {
    const current = loadPendingTrade(trade.pool, trade.network)
    if (current?.attempt.signature === trade.attempt.signature) localStorage.removeItem(pendingTradeKey(trade.pool, trade.network))
  } catch { /* The in-memory receipt still allows recovery during this visit. */ }
}

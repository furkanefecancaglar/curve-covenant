import { PublicKey } from '@solana/web3.js'
import bs58 from 'bs58'
import type { Network } from './dbc'
import type { TransactionAttempt } from './confirmation'

const key = (pool: string, network: Network) => `curve-covenant:pending-migration:v1:${network}:${pool}`
export function loadPendingMigration(pool: string, network: Network): TransactionAttempt | null {
  try {
    const value = JSON.parse(localStorage.getItem(key(pool, network)) ?? 'null')
    if (!value || typeof value.signature !== 'string' || value.signature.length > 88 || bs58.decode(value.signature).length !== 64) return null
    new PublicKey(value.blockhash)
    if (!Number.isSafeInteger(value.lastValidBlockHeight) || value.lastValidBlockHeight < 0 || typeof value.startedAt !== 'string' || !Number.isFinite(Date.parse(value.startedAt))) return null
    return { signature: value.signature, blockhash: value.blockhash, lastValidBlockHeight: value.lastValidBlockHeight, startedAt: value.startedAt }
  } catch { return null }
}
export function savePendingMigration(pool: string, network: Network, attempt: TransactionAttempt) {
  // Stop before broadcasting if a durable receipt cannot be retained.
  localStorage.setItem(key(pool, network), JSON.stringify(attempt))
}
export function removePendingMigration(pool: string, network: Network, signature: string) {
  if (loadPendingMigration(pool, network)?.signature === signature) localStorage.removeItem(key(pool, network))
}

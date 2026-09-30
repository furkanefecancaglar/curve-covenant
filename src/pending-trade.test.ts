import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'
import { loadPendingTrade, parsePendingTrade, removePendingTrade, savePendingTrade } from './pending-trade'
import type { PendingTrade } from './pending-trade'
import { loadPendingMigration, removePendingMigration, savePendingMigration } from './pending-migration'
let entries: Map<string, string>
beforeEach(() => {
  entries = new Map()
  vi.stubGlobal('localStorage', { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => entries.set(key, value), removeItem: (key: string) => entries.delete(key) })
})
afterEach(() => vi.unstubAllGlobals())
function fixture(): PendingTrade {
  return { pool: Keypair.generate().publicKey.toBase58(), network: 'devnet', side: 'buy', input: '0.1', inputSymbol: 'SOL',
    attempt: { signature: bs58.encode(new Uint8Array(64).fill(1)), blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 100, startedAt: new Date().toISOString() } }
}
it('recovers a public transaction receipt scoped to its pool and network', () => {
  const trade = fixture(); expect(savePendingTrade(trade)).toBe(true)
  expect(loadPendingTrade(trade.pool, trade.network)).toEqual(trade)
  expect(loadPendingTrade(trade.pool, 'mainnet-beta')).toBeNull()
  expect(loadPendingTrade(Keypair.generate().publicKey.toBase58(), trade.network)).toBeNull()
})
it('ignores malformed receipts and strips unexpected fields', () => {
  const trade = fixture()
  expect(parsePendingTrade('broken JSON', trade.pool, trade.network)).toBeNull()
  expect(parsePendingTrade(JSON.stringify({ ...trade, attempt: { ...trade.attempt, signature: 'bad' } }), trade.pool, trade.network)).toBeNull()
  expect(parsePendingTrade(JSON.stringify({ ...trade, secret: 'not part of a receipt' }), trade.pool, trade.network)).toEqual(trade)
})
it('does not delete a newer receipt when an older callback finishes', () => {
  const old = fixture(); const fresh = { ...old, attempt: { ...old.attempt, signature: bs58.encode(new Uint8Array(64).fill(2)) } }
  savePendingTrade(fresh); removePendingTrade(old)
  expect(loadPendingTrade(old.pool, old.network)).toEqual(fresh)
  removePendingTrade(fresh); expect(loadPendingTrade(old.pool, old.network)).toBeNull()
})
it('reports unavailable storage without losing the in-memory trade receipt', () => {
  vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } })
  const trade = fixture(); expect(savePendingTrade(trade)).toBe(false); expect(loadPendingTrade(trade.pool, trade.network)).toBeNull()
})
it('retains and scopes pending migration IDs, removing only the matching receipt', () => {
  const trade = fixture(); savePendingMigration(trade.pool, trade.network, trade.attempt)
  expect(loadPendingMigration(trade.pool, trade.network)).toEqual(trade.attempt)
  expect(loadPendingMigration(trade.pool, 'mainnet-beta')).toBeNull()
  removePendingMigration(trade.pool, trade.network, 'old-id'); expect(entries.size).toBe(1)
  removePendingMigration(trade.pool, trade.network, trade.attempt.signature); expect(entries.size).toBe(0)
})

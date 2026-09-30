import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'
import { archiveLaunchReceipt, listLaunchReceipts, loadLaunchReceipt, parseLaunchReceipt, removeLaunchReceipt, saveLaunchReceipt, withLaunchLock } from './launch-receipts'
import type { LaunchReceipt } from './launch-receipts'
import { POOL_LIBRARY_KEY, readPoolLibrary } from './pool-library'
let entries: Map<string, string>
beforeEach(() => {
  entries = new Map()
  vi.stubGlobal('localStorage', { get length() { return entries.size }, key: (i: number) => [...entries.keys()][i] ?? null,
    getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => entries.set(key, value), removeItem: (key: string) => entries.delete(key) })
})
afterEach(() => vi.unstubAllGlobals())
function receipt(): LaunchReceipt {
  return { version: 1, configAddress: Keypair.generate().publicKey.toBase58(), mintAddress: Keypair.generate().publicKey.toBase58(), payer: Keypair.generate().publicKey.toBase58(), quoteId: 'SOL',
    identity: { name: 'Demo', symbol: 'DEMO', metadataUri: 'https://example.com/meta.json' },
    configAttempt: { signature: bs58.encode(new Uint8Array(64).fill(1)), blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 100, startedAt: new Date().toISOString() } }
}
it('recovers the same public references after a reload', () => {
  const value = receipt(); saveLaunchReceipt(value)
  expect(loadLaunchReceipt(value.configAddress)).toEqual(value)
  expect(listLaunchReceipts()).toEqual([value])
})
it('does not serialize unexpected private key or transaction fields', () => {
  const value = { ...receipt(), mint: Keypair.generate(), signedTransaction: 'not a receipt field', secretKey: 'must not persist' }
  saveLaunchReceipt(value)
  expect([...entries.values()][0]).not.toMatch(/secretKey|signedTransaction|_keypair/)
})
it('rejects malformed addresses, metadata, signatures and quote IDs', () => {
  const value = receipt()
  for (const invalid of [{ ...value, configAddress: 'bad' }, { ...value, quoteId: 'toString' }, { ...value, identity: { ...value.identity, metadataUri: 'javascript:alert(1)' } }, { ...value, configAttempt: { ...value.configAttempt, signature: 'bad' } }]) {
    expect(parseLaunchReceipt(JSON.stringify(invalid))).toBeNull()
  }
})
it('keeps a newer pool attempt when an older callback tries to remove it', () => {
  const value = receipt(); const newer = { ...value, poolAttempt: { ...value.configAttempt, signature: bs58.encode(new Uint8Array(64).fill(2)) } }
  saveLaunchReceipt(newer); removeLaunchReceipt(value)
  expect(loadLaunchReceipt(value.configAddress)).toEqual(newer)
})
it('archives a verified pool before removing its launch receipt', () => {
  const value = receipt(); const pool = Keypair.generate().publicKey.toBase58(); saveLaunchReceipt(value)
  archiveLaunchReceipt(value, pool)
  expect(listLaunchReceipts()).toEqual([])
  expect(readPoolLibrary(localStorage.getItem(POOL_LIBRARY_KEY))).toEqual([expect.objectContaining({ address: pool, network: 'devnet', label: 'Demo / SOL' })])
})
it('keeps the launch receipt if saving the pool bookmark fails', () => {
  const value = receipt(); saveLaunchReceipt(value)
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('Storage full') })
  expect(() => archiveLaunchReceipt(value, Keypair.generate().publicKey.toBase58())).toThrow('Storage full')
  expect(loadLaunchReceipt(value.configAddress)).toEqual(value)
})
it('stops before broadcast if a receipt cannot be saved', () => {
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('Storage denied') })
  expect(() => saveLaunchReceipt(receipt())).toThrow('No transaction was sent')
})

it('does not run a second recovery when another tab owns the launch lock', async () => {
  vi.stubGlobal('navigator', { locks: { request: (_key: string, _options: unknown, work: (lock: null) => unknown) => work(null) } })
  const work = vi.fn()
  await expect(withLaunchLock(receipt().configAddress, work)).rejects.toThrow('another tab')
  expect(work).not.toHaveBeenCalled()
})

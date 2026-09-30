import { afterEach, expect, it, vi } from 'vitest'
import { Connection, Keypair } from '@solana/web3.js'
import { readPoolEvidence } from './pool-evidence'
vi.mock('./dbc', async original => ({ ...await original<typeof import('./dbc')>(), loadLaunch: vi.fn().mockResolvedValue({ kind: 'pool' }) }))
vi.mock('./lifecycle', () => ({ readLifecycle: vi.fn().mockResolvedValue({ migrated: true }) }))
afterEach(() => vi.restoreAllMocks())
const pool = Keypair.generate().publicKey.toBase58()
function setup(genesis: string) {
  vi.spyOn(Connection.prototype, 'getGenesisHash').mockResolvedValue(genesis)
  vi.spyOn(Connection.prototype, 'getSignaturesForAddress').mockResolvedValue([{ signature: 'receipt', slot: 20, blockTime: 1, err: null, memo: null }])
  vi.spyOn(Connection.prototype, 'getTransaction').mockResolvedValue(null)
}
it('leaves a pruned transaction unverified rather than claiming success from its signature', async () => {
  setup('EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG')
  const evidence = await readPoolEvidence(pool, 'devnet')
  expect(evidence.observedNetwork).toBe('public-devnet')
  expect(evidence.receipts[0].succeeded).toBeNull()
  expect(evidence.receipts[0].transactionAvailable).toBe(false)
  expect(evidence.receipts[0].explorerUrl).toContain('cluster=devnet')
})
it('never attaches public explorer links to a local or unknown genesis', async () => {
  setup('local-validator-genesis')
  const evidence = await readPoolEvidence(pool, 'devnet')
  expect(evidence.observedNetwork).toBe('unrecognized-network')
  expect(evidence.receipts[0].explorerUrl).toBeNull()
})
it('rejects a public network mismatch', async () => {
  setup('5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')
  await expect(readPoolEvidence(pool, 'devnet')).rejects.toThrow('network does not match')
})

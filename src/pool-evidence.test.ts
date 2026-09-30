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

it('exports verified pool state with an explicit warning when history access is denied', async () => {
  setup('EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG')
  vi.mocked(Connection.prototype.getSignaturesForAddress).mockRejectedValue(new Error('403 personal token required; request ID abc429def'))
  const report = await readPoolEvidence(pool, 'devnet')
  expect(report.history.signaturesAvailable).toBe(false)
  expect(report.receipts).toEqual([])
  expect(report.warnings).toContain('This RPC does not provide access to the requested transaction history.')
})
it('keeps a detail lookup failure unverified and omits endpoint credentials from the report', async () => {
  setup('EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG')
  vi.mocked(Connection.prototype.getTransaction).mockRejectedValue(new Error('failed at https://secret:password@example.com/key?api-key=abc123'))
  const report = await readPoolEvidence(pool, 'devnet', 'https://secret:password@example.com/key?api-key=abc123')
  expect(report.history.rpcOrigin).toBe('https://example.com')
  expect(report.receipts[0]).toMatchObject({ verified: false, succeeded: null, transactionAvailable: false })
  expect(JSON.stringify(report)).not.toMatch(/password|abc123/)
})
it('does not claim a successful receipt for a transaction that does not reference the pool', async () => {
  setup('EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG')
  vi.mocked(Connection.prototype.getTransaction).mockResolvedValue({ slot: 20, meta: { err: null, fee: 5000 }, transaction: { signatures: ['receipt'], message: { staticAccountKeys: [Keypair.generate().publicKey], header: { numRequiredSignatures: 1 } } } } as never)
  const report = await readPoolEvidence(pool, 'devnet')
  expect(report.receipts[0]).toMatchObject({ transactionAvailable: true, verified: false, succeeded: null })
})
it('verifies the signature, slot and pool reference before recording execution success', async () => {
  setup('EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG')
  vi.mocked(Connection.prototype.getTransaction).mockResolvedValue({ slot: 20, meta: { err: null, fee: 5000 }, transaction: { signatures: ['receipt'], message: { staticAccountKeys: [new (await import('@solana/web3.js')).PublicKey(pool)], header: { numRequiredSignatures: 1 } } } } as never)
  const report = await readPoolEvidence(pool, 'devnet')
  expect(report.receipts[0]).toMatchObject({ verified: true, succeeded: true, feeLamports: 5000 })
  expect(report.history.verifiedReceipts).toBe(1)
})

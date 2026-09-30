import { afterEach, expect, it, vi } from 'vitest'
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js'
import { DynamicBondingCurveClient, DYNAMIC_BONDING_CURVE_PROGRAM_ID } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { inspectLaunchReceipt, prepareLaunchRecovery, resumeLaunchRecovery } from './launch-recovery'
import type { PreparedRecovery } from './launch-recovery'
import type { LaunchReceipt } from './launch-receipts'
import { loadLaunchReceipt } from './launch-receipts'
import { connectWallet, sendWalletTransaction } from './wallet'
import * as confirmation from './confirmation'
import { QUOTES } from './quotes'
import { reviewTransaction } from './transaction-review'
vi.mock('./transaction-review', () => ({ reviewTransaction: vi.fn() }))
vi.mock('./wallet', () => ({ connectWallet: vi.fn(), sendWalletTransaction: vi.fn() }))
vi.mock('./launch-receipts', () => ({ loadLaunchReceipt: vi.fn(), saveLaunchReceipt: vi.fn(), archiveLaunchReceipt: vi.fn(), withLaunchLock: (_key: string, work: () => Promise<unknown>) => work() }))
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks() })
function fixture() {
  const record: LaunchReceipt = { version: 1, configAddress: Keypair.generate().publicKey.toBase58(), mintAddress: Keypair.generate().publicKey.toBase58(), payer: Keypair.generate().publicKey.toBase58(), quoteId: 'SOL',
    identity: { name: 'Demo', symbol: 'DEMO', metadataUri: 'https://example.com/meta.json' },
    configAttempt: { signature: 'config-id', blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 100, startedAt: new Date().toISOString() } }
  const config = { quoteMint: new PublicKey(QUOTES.SOL.mint), feeClaimer: new PublicKey(record.payer), leftoverReceiver: new PublicKey(record.payer), migrationQuoteThreshold: 2402506708n }
  const pool = { poolState: { config: new PublicKey(record.configAddress), baseMint: new PublicKey(record.mintAddress), creator: new PublicKey(record.payer) } }
  const state = { getPool: vi.fn().mockResolvedValue(pool), getPoolConfig: vi.fn().mockResolvedValue(config) }
  vi.spyOn(DynamicBondingCurveClient, 'create').mockReturnValue({ state } as unknown as DynamicBondingCurveClient)
  const getAccountInfo = vi.spyOn(Connection.prototype, 'getAccountInfo').mockResolvedValue({ owner: DYNAMIC_BONDING_CURVE_PROGRAM_ID } as never)
  vi.mocked(loadLaunchReceipt).mockReturnValue(record)
  return { record, state, config, getAccountInfo, connection: new Connection('http://localhost:8899', 'confirmed') }
}
it('finds an already-created pool without connecting or signing', async () => {
  const f = fixture()
  expect(await inspectLaunchReceipt(f.record, f.connection)).toMatchObject({ kind: 'created' })
  expect(connectWallet).not.toHaveBeenCalled(); expect(sendWalletTransaction).not.toHaveBeenCalled()
})
it('does not accept an account outside the DBC program', async () => {
  const f = fixture(); f.getAccountInfo.mockResolvedValue({ owner: PublicKey.default } as never)
  await expect(inspectLaunchReceipt(f.record, f.connection)).rejects.toThrow('not owned')
})
it('does not accept a pool belonging to another creator', async () => {
  const f = fixture(); f.state.getPool.mockResolvedValue({ poolState: { config: new PublicKey(f.record.configAddress), baseMint: new PublicKey(f.record.mintAddress), creator: PublicKey.default } })
  await expect(inspectLaunchReceipt(f.record, f.connection)).rejects.toThrow('does not match')
})
it('does not prepare another token while the last pool attempt is pending', async () => {
  const f = fixture(); f.record.poolAttempt = f.record.configAttempt
  f.getAccountInfo.mockResolvedValue(null)
  vi.spyOn(confirmation, 'readTransactionOutcome').mockResolvedValue({ state: 'pending' })
  expect(await inspectLaunchReceipt(f.record, f.connection)).toMatchObject({ kind: 'pending' })
  await expect(prepareLaunchRecovery(f.record)).rejects.toThrow('Check the saved launch status')
  expect(connectWallet).not.toHaveBeenCalled()
})
it('reuses a paid configuration after verifying quote and recipient addresses', async () => {
  const f = fixture(); f.getAccountInfo.mockResolvedValueOnce(null)
  expect(await inspectLaunchReceipt(f.record, f.connection)).toEqual({ kind: 'config-only', threshold: '2.402506708' })
})
it('refuses a configuration with different fee recipients', async () => {
  const f = fixture(); f.getAccountInfo.mockResolvedValueOnce(null)
  f.state.getPoolConfig.mockResolvedValue({ ...f.config, feeClaimer: PublicKey.default })
  await expect(inspectLaunchReceipt(f.record, f.connection)).rejects.toThrow('do not match')
})
it('releases an expired initial attempt only when no accounts exist', async () => {
  const f = fixture(); f.getAccountInfo.mockResolvedValue(null)
  vi.spyOn(confirmation, 'readTransactionOutcome').mockResolvedValue({ state: 'expired' })
  expect(await inspectLaunchReceipt(f.record, f.connection)).toEqual({ kind: 'not-created' })
})
it('requires the original payer before preparing the remaining cost', async () => {
  const f = fixture(); f.getAccountInfo.mockResolvedValueOnce(null)
  vi.mocked(connectWallet).mockResolvedValue({ publicKey: PublicKey.default, wallet: { connect: vi.fn(), signTransaction: vi.fn() } })
  await expect(prepareLaunchRecovery(f.record)).rejects.toThrow('wallet that paid')
  expect(sendWalletTransaction).not.toHaveBeenCalled()
})
it('rejects a stale cost review after another tab changes the receipt', async () => {
  const f = fixture(); vi.mocked(loadLaunchReceipt).mockReturnValue({ ...f.record, mintAddress: Keypair.generate().publicKey.toBase58() })
  await expect(resumeLaunchRecovery({ receipt: f.record } as PreparedRecovery)).rejects.toThrow('changed in another tab')
  expect(sendWalletTransaction).not.toHaveBeenCalled()
})

it('requires another review when the remaining launch cost increases', async () => {
  const f = fixture(); f.getAccountInfo.mockResolvedValueOnce(null)
  vi.mocked(connectWallet).mockResolvedValue({ publicKey: new PublicKey(f.record.payer), wallet: { connect: vi.fn(), signTransaction: vi.fn() } })
  const review = { balanceLamports: 1e9, estimatedDebitLamports: 10000000, networkFeeLamports: 10000, remainingLamports: 990000000, checkedAt: new Date().toISOString() }
  vi.mocked(reviewTransaction).mockResolvedValue({ ...review, estimatedDebitLamports: 20000000 })
  await expect(resumeLaunchRecovery({ receipt: f.record, mint: Keypair.generate(), transaction: new Transaction(), review })).rejects.toThrow('cost increased')
  expect(sendWalletTransaction).not.toHaveBeenCalled()
})
it('blocks a quote-mint mismatch in a saved configuration', async () => {
  const f = fixture(); f.getAccountInfo.mockResolvedValueOnce(null)
  f.state.getPoolConfig.mockResolvedValue({ ...f.config, quoteMint: PublicKey.default })
  await expect(inspectLaunchReceipt(f.record, f.connection)).rejects.toThrow('do not match')
})

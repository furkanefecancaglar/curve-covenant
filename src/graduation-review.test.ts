import { afterEach, expect, it, vi } from 'vitest'
import { Keypair, Transaction } from '@solana/web3.js'
import { graduatePrepared, MigrationSubmittedError } from './lifecycle'
import type { PreparedGraduation } from './lifecycle'
import { connectWallet, sendWalletTransaction } from './wallet'
import { reviewTransaction } from './transaction-review'
vi.mock('./wallet', () => ({ connectWallet: vi.fn(), sendWalletTransaction: vi.fn() }))
vi.mock('./pending-migration', () => ({ loadPendingMigration: vi.fn().mockReturnValue(null), savePendingMigration: vi.fn(), removePendingMigration: vi.fn() }))
vi.mock('./transaction-review', () => ({ reviewTransaction: vi.fn() }))
afterEach(() => vi.clearAllMocks())
function fixture(): PreparedGraduation {
  const payer = Keypair.generate().publicKey
  vi.mocked(connectWallet).mockResolvedValue({ publicKey: payer, wallet: { connect: vi.fn(), signTransaction: vi.fn() } })
  return { address: Keypair.generate().publicKey.toBase58(), network: 'devnet', payer,
    migration: { transaction: new Transaction(), firstPositionNftKeypair: Keypair.generate(), secondPositionNftKeypair: Keypair.generate() },
    review: { balanceLamports: 1e9, estimatedDebitLamports: 10000000, networkFeeLamports: 15000, remainingLamports: 990000000, checkedAt: new Date().toISOString() } }
}
it('requires a new graduation review after a wallet account change', async () => {
  const prepared = fixture()
  vi.mocked(connectWallet).mockResolvedValue({ publicKey: Keypair.generate().publicKey, wallet: { connect: vi.fn(), signTransaction: vi.fn() } })
  await expect(graduatePrepared(prepared)).rejects.toThrow('account changed')
  expect(sendWalletTransaction).not.toHaveBeenCalled()
})
it('does not request graduation signing when its refreshed cost has increased', async () => {
  const prepared = fixture()
  vi.mocked(reviewTransaction).mockResolvedValue({ ...prepared.review, estimatedDebitLamports: 20000000 })
  await expect(graduatePrepared(prepared)).rejects.toThrow('cost increased')
  expect(sendWalletTransaction).not.toHaveBeenCalled()
})

it('keeps the submitted migration signature when confirmation is interrupted', async () => {
  const prepared = fixture()
  vi.mocked(reviewTransaction).mockResolvedValue(prepared.review)
  vi.mocked(sendWalletTransaction).mockImplementation(async (_connection, _wallet, _payer, _transaction, _signers, onSubmitted) => {
    onSubmitted?.('migration-receipt', { signature: 'migration-receipt', blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 100, startedAt: new Date().toISOString() }); throw new Error('Confirmation disconnected')
  })
  try { await graduatePrepared(prepared); throw new Error('Expected submitted migration') }
  catch (issue) {
    expect(issue).toBeInstanceOf(MigrationSubmittedError)
    expect((issue as MigrationSubmittedError).signature).toBe('migration-receipt')
  }
})

it('allows a fresh review after a definite migration failure', async () => {
  const { TransactionOutcomeError } = await import('./confirmation')
  const { removePendingMigration } = await import('./pending-migration')
  const prepared = fixture(); vi.mocked(reviewTransaction).mockResolvedValue(prepared.review)
  const attempt = { signature: 'failed-id', blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 100, startedAt: new Date().toISOString() }
  vi.mocked(sendWalletTransaction).mockImplementation(async (_connection, _wallet, _payer, _transaction, _signers, submitted) => {
    submitted?.(attempt.signature, attempt); throw new TransactionOutcomeError(attempt, 'failed')
  })
  await expect(graduatePrepared(prepared)).rejects.toMatchObject({ state: 'failed' })
  expect(removePendingMigration).toHaveBeenCalledWith(prepared.address, prepared.network, attempt.signature)
})

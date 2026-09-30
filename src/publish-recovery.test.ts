import { afterEach, expect, it, vi } from 'vitest'
import { Connection, Keypair, Transaction } from '@solana/web3.js'
import { launchPrepared, IncompleteLaunchError } from './publish'
import type { PreparedLaunch } from './publish'
import { connectWallet, sendWalletTransaction } from './wallet'
import { reviewTransaction } from './transaction-review'
import { QUOTES } from './quotes'
import * as confirmation from './confirmation'
vi.mock('./wallet', () => ({ connectWallet: vi.fn(), sendWalletTransaction: vi.fn() }))
vi.mock('./launch-receipts', () => ({ loadLaunchReceipt: vi.fn().mockReturnValue(null), saveLaunchReceipt: vi.fn(), removeLaunchReceipt: vi.fn(), archiveLaunchReceipt: vi.fn(), withLaunchLock: (_address: string, work: () => Promise<unknown>) => work() }))
vi.mock('./transaction-review', () => ({ reviewTransaction: vi.fn() }))
vi.mock('./quotes', async original => ({ ...await original<typeof import('./quotes')>(), verifyQuoteAsset: vi.fn() }))
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks() })
function fixture() {
  const payer = Keypair.generate().publicKey
  const review = { balanceLamports: 1e9, estimatedDebitLamports: 30000000, networkFeeLamports: 15000, remainingLamports: 970000000, checkedAt: new Date().toISOString() }
  const prepared: PreparedLaunch = { payer, configAccount: Keypair.generate(), mint: Keypair.generate(),
    identity: { name: 'Demo', symbol: 'DEMO', metadataUri: 'https://example.com/token.json' }, quoteAsset: QUOTES.SOL,
    plan: { mode: 'combined', transaction: new Transaction(), bytes: 1000 }, review, quoteBalance: null }
  vi.mocked(connectWallet).mockResolvedValue({ publicKey: payer, wallet: { connect: vi.fn(), signTransaction: vi.fn() } })
  vi.mocked(reviewTransaction).mockResolvedValue(review)
  return prepared
}
it('does not sign if the user switched accounts after reviewing', async () => {
  const prepared = fixture()
  vi.mocked(connectWallet).mockResolvedValue({ publicKey: Keypair.generate().publicKey, wallet: { connect: vi.fn(), signTransaction: vi.fn() } })
  await expect(launchPrepared(prepared)).rejects.toThrow('account changed')
  expect(sendWalletTransaction).not.toHaveBeenCalled()
})
it('requires another review if the debit increases before signing', async () => {
  const prepared = fixture()
  vi.mocked(reviewTransaction).mockResolvedValue({ ...prepared.review, estimatedDebitLamports: 40000000 })
  await expect(launchPrepared(prepared)).rejects.toThrow('cost increased')
  expect(sendWalletTransaction).not.toHaveBeenCalled()
})
it('keeps the same mint and config when confirmation fails after submission', async () => {
  const prepared = fixture()
  vi.mocked(sendWalletTransaction).mockImplementation(async (_connection, _wallet, _payer, _transaction, _signers, submitted) => {
    submitted?.('submitted-signature', { signature: 'submitted-signature', blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 100, startedAt: new Date().toISOString() }); throw new Error('Confirmation timed out')
  })
  try { await launchPrepared(prepared); throw new Error('Expected pending launch') }
  catch (issue) {
    expect(issue).toBeInstanceOf(IncompleteLaunchError)
    const pending = (issue as IncompleteLaunchError).pending
    expect(pending.mint).toBe(prepared.mint)
    expect(pending.configAddress).toBe(prepared.configAccount.publicKey.toBase58())
    expect(pending.signature).toBe('submitted-signature')
  }
})
it('does not label a rejected signature as a submitted transaction', async () => {
  const prepared = fixture()
  const declined = new Error('User rejected')
  vi.mocked(sendWalletTransaction).mockRejectedValue(declined)
  await expect(launchPrepared(prepared)).rejects.toBe(declined)
})
it('retains submitted addresses when the post-confirmation RPC read fails', async () => {
  const prepared = fixture()
  vi.mocked(sendWalletTransaction).mockResolvedValue('confirmed-signature')
  vi.spyOn(Connection.prototype, 'getAccountInfo').mockRejectedValue(new Error('RPC disconnected'))
  await expect(launchPrepared(prepared)).rejects.toBeInstanceOf(IncompleteLaunchError)
})

it('does not turn a preflight rejection into an unfinished launch', async () => {
  const { TransactionOutcomeError } = await import('./confirmation')
  const prepared = fixture()
  vi.mocked(sendWalletTransaction).mockImplementation(async (_connection, _wallet, _payer, _transaction, _signers, submitted) => {
    const attempt = { signature: 'rejected-id', blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 100, startedAt: new Date().toISOString() }
    submitted?.(attempt.signature, attempt)
    throw new TransactionOutcomeError(attempt, 'rejected')
  })
  await expect(launchPrepared(prepared)).rejects.toMatchObject({ state: 'rejected' })
})
it('does not sign another launch while the tracked configuration is unresolved', async () => {
  const { finishLaunch } = await import('./publish')
  const prepared = fixture()
  vi.spyOn(Connection.prototype, 'getAccountInfo').mockResolvedValue(null)
  vi.spyOn(confirmation, 'readTransactionOutcome').mockResolvedValue({ state: 'pending' })
  await expect(finishLaunch({ configAddress: prepared.configAccount.publicKey.toBase58(), configSignature: 'pending-id', mint: prepared.mint, payer: prepared.payer.toBase58(), identity: prepared.identity, quoteAsset: prepared.quoteAsset,
    attempt: { signature: 'pending-id', blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 100, startedAt: new Date().toISOString() } })).rejects.toMatchObject({ state: 'pending' })
  expect(sendWalletTransaction).not.toHaveBeenCalled()
})
it('releases an expired launch with no config for a fresh cost review', async () => {
  const { finishLaunch, LaunchNotCreatedError } = await import('./publish')
  const prepared = fixture()
  vi.spyOn(Connection.prototype, 'getAccountInfo').mockResolvedValue(null)
  vi.spyOn(confirmation, 'readTransactionOutcome').mockResolvedValue({ state: 'expired' })
  await expect(finishLaunch({ configAddress: prepared.configAccount.publicKey.toBase58(), configSignature: 'expired-id', mint: prepared.mint, payer: prepared.payer.toBase58(), identity: prepared.identity, quoteAsset: prepared.quoteAsset,
    attempt: { signature: 'expired-id', blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 100, startedAt: new Date().toISOString() } })).rejects.toBeInstanceOf(LaunchNotCreatedError)
  expect(sendWalletTransaction).not.toHaveBeenCalled()
})

it('blocks an old in-memory launch after its saved receipt was completed elsewhere', async () => {
  const { finishLaunch } = await import('./publish')
  const prepared = fixture()
  const attempt = { signature: 'old-id', blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 100, startedAt: new Date().toISOString() }
  await expect(finishLaunch({ configAddress: prepared.configAccount.publicKey.toBase58(), configSignature: 'old-id', mint: prepared.mint, payer: prepared.payer.toBase58(), identity: prepared.identity, quoteAsset: prepared.quoteAsset,
    receipt: { version: 1, configAddress: prepared.configAccount.publicKey.toBase58(), mintAddress: prepared.mint.publicKey.toBase58(), payer: prepared.payer.toBase58(), identity: prepared.identity, quoteId: 'SOL', configAttempt: attempt } })).rejects.toThrow('completed or changed in another tab')
  expect(sendWalletTransaction).not.toHaveBeenCalled()
})

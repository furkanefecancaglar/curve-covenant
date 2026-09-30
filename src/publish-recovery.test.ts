import { afterEach, expect, it, vi } from 'vitest'
import { Connection, Keypair, Transaction } from '@solana/web3.js'
import { launchPrepared, IncompleteLaunchError } from './publish'
import type { PreparedLaunch } from './publish'
import { connectWallet, sendWalletTransaction } from './wallet'
import { reviewTransaction } from './transaction-review'
import { QUOTES } from './quotes'
vi.mock('./wallet', () => ({ connectWallet: vi.fn(), sendWalletTransaction: vi.fn() }))
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
    submitted?.('submitted-signature'); throw new Error('Confirmation timed out')
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

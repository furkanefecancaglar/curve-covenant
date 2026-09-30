import { afterEach, describe, expect, it, vi } from 'vitest'
import { Connection, Keypair, SendTransactionError, SystemProgram, Transaction } from '@solana/web3.js'
import bs58 from 'bs58'
import { sendWalletTransaction, walletError } from './wallet'

afterEach(() => vi.useRealTimers())
function fixture() {
  const payer = Keypair.generate()
  const connection = {
    getLatestBlockhash: vi.fn().mockResolvedValue({ blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 123 }),
    sendRawTransaction: vi.fn().mockResolvedValue('rpc-response'),
    getSignatureStatuses: vi.fn().mockResolvedValue({ value: [{ confirmationStatus: 'confirmed', err: null, slot: 10 }] }),
    confirmTransaction: vi.fn(),
  }
  const transaction = new Transaction().add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: Keypair.generate().publicKey, lamports: 1 }))
  const wallet = { connect: vi.fn(), signTransaction: vi.fn(async (tx: Transaction) => { tx.partialSign(payer); return tx }) }
  return { connection, transaction, wallet, send: (submitted = vi.fn()) => sendWalletTransaction(connection as unknown as Connection, wallet, payer.publicKey, transaction, [], submitted) }
}
describe('wallet transaction confirmation', () => {
  it('confirms the actual signed ID through HTTP without a WebSocket subscription', async () => {
    const f = fixture(); const submitted = vi.fn()
    const signature = await f.send(submitted)
    expect(signature).toBe(bs58.encode(f.transaction.signature!))
    expect(submitted).toHaveBeenCalledWith(signature, expect.objectContaining({ signature, lastValidBlockHeight: 123 }))
    expect(submitted.mock.invocationCallOrder[0]).toBeLessThan(f.connection.sendRawTransaction.mock.invocationCallOrder[0])
    expect(f.connection.getSignatureStatuses).toHaveBeenCalledWith([signature], { searchTransactionHistory: true })
    expect(f.connection.confirmTransaction).not.toHaveBeenCalled()
  })
  it('recovers a lost send response without signing or sending twice', async () => {
    const f = fixture(); f.connection.sendRawTransaction.mockRejectedValue(new Error('Failed to fetch'))
    await expect(f.send()).resolves.toBeTypeOf('string')
    expect(f.connection.sendRawTransaction).toHaveBeenCalledOnce(); expect(f.wallet.signTransaction).toHaveBeenCalledOnce()
  })
  it('rejects an on-chain failure despite a successful send response', async () => {
    const f = fixture(); f.connection.getSignatureStatuses.mockResolvedValue({ value: [{ confirmationStatus: 'confirmed', err: { InstructionError: [0, 'InvalidArgument'] }, slot: 10 }] })
    await expect(f.send()).rejects.toMatchObject({ state: 'failed' })
  })
  it('recognizes an explicit preflight rejection as not broadcast', async () => {
    const f = fixture(); f.connection.sendRawTransaction.mockRejectedValue(new SendTransactionError({ action: 'simulate', signature: '', transactionMessage: 'Insufficient funds', logs: [] }))
    await expect(f.send()).rejects.toMatchObject({ state: 'rejected' })
    expect(f.connection.getSignatureStatuses).not.toHaveBeenCalled()
  })
  it('does not broadcast when receipt retention fails', async () => {
    const f = fixture()
    await expect(f.send(vi.fn(() => { throw new Error('Receipt storage failed') }))).rejects.toThrow('Receipt storage failed')
    expect(f.connection.sendRawTransaction).not.toHaveBeenCalled()
  })
  it('retains the signed ID when confirmation RPC is unavailable', async () => {
    vi.useFakeTimers(); const f = fixture(); f.connection.getSignatureStatuses.mockRejectedValue(new Error('RPC offline'))
    const result = f.send().catch(error => error)
    await vi.runAllTimersAsync()
    expect(await result).toMatchObject({ state: 'pending', attempt: { signature: bs58.encode(f.transaction.signature!) } })
    expect(f.connection.sendRawTransaction).toHaveBeenCalledOnce()
  })
})

it('explains denied RPC access without exposing credentials from the original error', () => {
  const message = walletError(new Error('403 denied https://example.com/private-access-key'))
  expect(message).toContain('Open RPC connection')
  expect(message).not.toContain('private-access-key')
})

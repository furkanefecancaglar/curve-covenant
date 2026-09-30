import { afterEach, expect, it, vi } from 'vitest'
import type { Connection } from '@solana/web3.js'
import { readTransactionOutcome, waitForTransaction } from './confirmation'
const attempt = { signature: 'known-signature', blockhash: 'known-blockhash', lastValidBlockHeight: 100, startedAt: '2026-09-30T00:00:00Z' }
const confirmed = { confirmationStatus: 'confirmed', slot: 20, err: null }
afterEach(() => vi.useRealTimers())
function fixture(status: unknown = null, height = 100) {
  const rpc = { getSignatureStatuses: vi.fn().mockResolvedValue({ value: [status] }), getBlockHeight: vi.fn().mockResolvedValue(height) }
  return { rpc, connection: rpc as unknown as Connection }
}
it('keeps processed errors pending until the fork is confirmed', async () => {
  const { connection } = fixture({ ...confirmed, confirmationStatus: 'processed', err: 'fork error' }, 101)
  expect(await readTransactionOutcome(connection, attempt)).toMatchObject({ state: 'pending' })
})
it('keeps missing signatures pending while their validity window is open', async () => {
  const { connection } = fixture()
  expect(await readTransactionOutcome(connection, attempt)).toEqual({ state: 'pending' })
})
it('rechecks history after finalized expiry before allowing a retry', async () => {
  const { connection, rpc } = fixture(null, 101)
  expect(await readTransactionOutcome(connection, attempt)).toEqual({ state: 'expired' })
  expect(rpc.getSignatureStatuses).toHaveBeenCalledTimes(2)
  expect(rpc.getBlockHeight).toHaveBeenCalledWith('finalized')
})
it('recognizes a confirmation appearing during the expiry check', async () => {
  const { connection, rpc } = fixture(null, 101)
  rpc.getSignatureStatuses.mockResolvedValueOnce({ value: [null] }).mockResolvedValueOnce({ value: [confirmed] })
  expect(await readTransactionOutcome(connection, attempt)).toEqual({ state: 'confirmed', slot: 20 })
})
it('never treats a failed RPC request as transaction expiry', async () => {
  const { connection, rpc } = fixture(null, 101)
  rpc.getSignatureStatuses.mockRejectedValue(new Error('offline'))
  await expect(readTransactionOutcome(connection, attempt)).rejects.toThrow('offline')
})
it('bounds hung confirmation requests and preserves the pending attempt', async () => {
  vi.useFakeTimers(); const { connection, rpc } = fixture()
  rpc.getSignatureStatuses.mockImplementation(() => new Promise(() => {}))
  const result = waitForTransaction(connection, attempt, { timeoutMs: 50, pollMs: 1 }).catch(error => error)
  await vi.advanceTimersByTimeAsync(50)
  expect(await result).toMatchObject({ state: 'pending', attempt })
  vi.clearAllTimers()
})
it('polls processed transactions until confirmed', async () => {
  const { connection, rpc } = fixture(confirmed)
  rpc.getSignatureStatuses.mockResolvedValueOnce({ value: [{ ...confirmed, confirmationStatus: 'processed' }] })
  await expect(waitForTransaction(connection, attempt, { pollMs: 1 })).resolves.toBeUndefined()
  expect(rpc.getSignatureStatuses).toHaveBeenCalledTimes(2)
})

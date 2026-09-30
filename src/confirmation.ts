import type { Connection } from '@solana/web3.js'
import { rpcDeadline } from './rpc-timeout'
import { transactionHistoryConnection } from './rpc-history'
export { rpcDeadline } from './rpc-timeout'

export type TransactionAttempt = {
  signature: string
  blockhash: string
  lastValidBlockHeight: number
  startedAt: string
}
export type TransactionOutcome = { state: 'confirmed' | 'failed' | 'expired' | 'pending'; slot?: number; error?: string }

export class TransactionOutcomeError extends Error {
  attempt: TransactionAttempt
  state: Exclude<TransactionOutcome['state'], 'confirmed'> | 'rejected'
  constructor(attempt: TransactionAttempt, state: Exclude<TransactionOutcome['state'], 'confirmed'> | 'rejected', detail?: string) {
    const message = state === 'pending' ? 'The transaction status is not yet verified. Check this transaction before trying again.'
      : state === 'expired' ? 'The transaction expired without a recorded confirmation. Request a fresh quote or cost check before trying again.'
        : state === 'rejected' ? `The network rejected this transaction before broadcast${detail ? `: ${detail}` : '.'}`
          : `The transaction failed on chain${detail ? `: ${detail}` : '.'}`
    super(message)
    this.attempt = attempt; this.state = state
  }
}


function statusOutcome(status: Awaited<ReturnType<Connection['getSignatureStatuses']>>['value'][number]): TransactionOutcome {
  if (!status) return { state: 'pending' }
  // A processed transaction may still be on a fork, including a processed error.
  if (status.confirmationStatus !== 'confirmed' && status.confirmationStatus !== 'finalized') return { state: 'pending', slot: status.slot }
  return status.err ? { state: 'failed', slot: status.slot, error: JSON.stringify(status.err) } : { state: 'confirmed', slot: status.slot }
}

export async function readTransactionOutcome(connection: Connection, attempt: TransactionAttempt): Promise<TransactionOutcome> {
  const result = await rpcDeadline(connection.getSignatureStatuses([attempt.signature], { searchTransactionHistory: true }))
  const status = result.value[0]
  if (status) return statusOutcome(status)
  // Use a finalized height, then re-read history, to avoid expiring an accepted
  // transaction while it is landing or while confirmed banks are still moving.
  const height = await rpcDeadline(connection.getBlockHeight('finalized'))
  if (height <= attempt.lastValidBlockHeight) return { state: 'pending' }
  const history = await transactionHistoryConnection(connection)
  const recheck = await rpcDeadline(history.getSignatureStatuses([attempt.signature], { searchTransactionHistory: true }))
  return recheck.value[0] ? statusOutcome(recheck.value[0]) : { state: 'expired' }
}

export async function waitForTransaction(connection: Connection, attempt: TransactionAttempt,
  options: { timeoutMs?: number; pollMs?: number } = {}): Promise<void> {
  const deadline = Date.now() + (options.timeoutMs ?? 30_000)
  let failures = 0
  while (Date.now() < deadline) {
    let outcome: TransactionOutcome
    try {
      outcome = await rpcDeadline(readTransactionOutcome(connection, attempt), Math.min(8000, deadline - Date.now()))
      failures = 0
    } catch {
      if (++failures >= 3) throw new TransactionOutcomeError(attempt, 'pending')
      outcome = { state: 'pending' }
    }
    if (outcome.state === 'confirmed') return
    if (outcome.state !== 'pending') throw new TransactionOutcomeError(attempt, outcome.state, outcome.error)
    const remaining = deadline - Date.now()
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, Math.min(options.pollMs ?? 1500, remaining)))
  }
  throw new TransactionOutcomeError(attempt, 'pending')
}

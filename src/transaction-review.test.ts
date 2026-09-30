import { expect, it, vi } from 'vitest'
import { Connection, Keypair, SystemProgram, Transaction } from '@solana/web3.js'
import { reviewTransaction } from './transaction-review'

const payer = Keypair.generate().publicKey
function fixture(value: { err: unknown; accounts?: ({ lamports: number } | null)[]; logs?: string[] }, fee: number | null = 5000) {
  const simulateTransaction = vi.fn().mockResolvedValue({ value })
  const connection = {
    getBalanceAndContext: vi.fn().mockResolvedValue({ context: { slot: 20 }, value: 1_000_000_000 }),
    getLatestBlockhash: vi.fn().mockResolvedValue({ blockhash: Keypair.generate().publicKey.toBase58() }),
    getFeeForMessage: vi.fn().mockResolvedValue({ value: fee }), simulateTransaction,
  } as unknown as Connection
  const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: payer, toPubkey: Keypair.generate().publicKey, lamports: 100 }))
  return { connection, tx, simulateTransaction }
}

it('simulates without a wallet signature and includes rent in the estimated debit', async () => {
  const { connection, tx, simulateTransaction } = fixture({ err: null, accounts: [{ lamports: 973429280 }] }, 15000)
  const review = await reviewTransaction(connection, payer, tx)
  expect(review.estimatedDebitLamports).toBe(26570720)
  expect(review.networkFeeLamports).toBe(15000)
  const [transaction, options] = simulateTransaction.mock.calls[0]
  expect(options.sigVerify).toBe(false)
  expect(options.minContextSlot).toBe(20)
  expect(transaction.signatures.every((bytes: Uint8Array) => bytes.every(value => value === 0))).toBe(true)
})

it('blocks a program failure and retains an actionable insufficient-funds message', async () => {
  const { connection, tx } = fixture({ err: { InstructionError: [0, 'Custom'] }, logs: ['Program log: insufficient lamports'] })
  await expect(reviewTransaction(connection, payer, tx)).rejects.toThrow('insufficient lamports')
})

it.each([null, undefined])('does not invent a cost when the network omits the simulated balance', async after => {
  const { connection, tx } = fixture({ err: null, accounts: after === null ? [null] : undefined })
  await expect(reviewTransaction(connection, payer, tx)).rejects.toThrow('did not return')
})

it('requires a fresh check when concurrent balance changes make the debit impossible', async () => {
  const { connection, tx } = fixture({ err: null, accounts: [{ lamports: 1_100_000_000 }] })
  await expect(reviewTransaction(connection, payer, tx)).rejects.toThrow('balance changed')
})

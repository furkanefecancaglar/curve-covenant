import { VersionedTransaction } from '@solana/web3.js'
import type { Connection, PublicKey, Transaction } from '@solana/web3.js'

export type TransactionReview = {
  balanceLamports: number
  estimatedDebitLamports: number
  networkFeeLamports: number
  remainingLamports: number
  checkedAt: string
}

// Simulation is unsigned: connecting a wallet never authorizes spending.
export async function reviewTransaction(connection: Connection, payer: PublicKey, transaction: Transaction): Promise<TransactionReview> {
  const [{ context, value: balance }, latest] = await Promise.all([
    connection.getBalanceAndContext(payer, 'confirmed'), connection.getLatestBlockhash('confirmed'),
  ])
  transaction.feePayer = payer
  transaction.recentBlockhash = latest.blockhash
  const message = transaction.compileMessage()
  const [fee, simulation] = await Promise.all([
    connection.getFeeForMessage(message, 'confirmed'),
    connection.simulateTransaction(new VersionedTransaction(message), {
      sigVerify: false, commitment: 'confirmed', minContextSlot: context.slot,
      accounts: { encoding: 'base64', addresses: [payer.toBase58()] },
    }),
  ])
  if (simulation.value.err) {
    const logs = simulation.value.logs ?? []
    const detail = logs.find(line => /insufficient|Error Message:/i.test(line))
    if (simulation.value.err === 'InsufficientFundsForFee') throw new Error('There is not enough SOL to pay the network fee. Add SOL on the selected network, then check again. No transaction was sent.')
    throw new Error(`The transaction could not pass the network check. ${detail ?? JSON.stringify(simulation.value.err)} No transaction was sent.`)
  }
  const after = simulation.value.accounts?.[0]?.lamports
  if (after == null || fee.value == null) throw new Error('The network did not return a fee and balance estimate. Retry the check before signing.')
  const debit = balance - after
  if (!Number.isSafeInteger(debit) || debit < fee.value || after < 0) {
    throw new Error('The wallet balance changed during the check. Check the launch again for an updated estimate.')
  }
  return { balanceLamports: balance, estimatedDebitLamports: debit, networkFeeLamports: fee.value,
    remainingLamports: after, checkedAt: new Date().toISOString() }
}

import type { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js'
import { SendTransactionError } from '@solana/web3.js'
import bs58 from 'bs58'
import { rpcDeadline, TransactionOutcomeError, waitForTransaction } from './confirmation'
import type { TransactionAttempt } from './confirmation'

export type Phantom = {
  isPhantom?: boolean
  connect: () => Promise<{ publicKey: PublicKey }>
  signTransaction: (transaction: Transaction) => Promise<Transaction>
}

export function phantomWallet() {
  return (window as typeof window & { phantom?: { solana?: Phantom } }).phantom?.solana
}

export function walletError(issue: unknown): string {
  const message = issue instanceof Error ? issue.message : 'The wallet request failed.'
  if ((issue as { code?: number })?.code === 4001 || /user rejected|user denied|user cancelled/i.test(message)) {
    return 'You declined the wallet request. You can retry when ready.'
  }
  if (/401|403|access forbidden|personal token|indexed requests/i.test(message)) return 'This RPC blocked the request. Open RPC connection, check your own endpoint, then retry this step.'
  if (/429|too many requests/i.test(message)) return 'The Solana RPC is busy. Wait a moment, then retry this step.'
  if (/failed to fetch|network request failed/i.test(message)) return 'Could not reach Solana. Check your connection and retry this step.'
  return message
}

export async function connectWallet() {
  const wallet = phantomWallet()
  if (!wallet?.isPhantom) throw new Error('Phantom is not available in this browser. On mobile, open this page inside Phantom. On desktop, enable the Phantom extension and reload.')
  try {
    const { publicKey } = await wallet.connect()
    return { wallet, publicKey }
  } catch (issue) { throw new Error(walletError(issue)) }
}

export async function sendWalletTransaction(connection: Connection, wallet: Phantom,
  payer: PublicKey, transaction: Transaction, signers: Keypair[] = [], onSubmitted?: (signature: string, attempt: TransactionAttempt) => void) {
  const { blockhash, lastValidBlockHeight } = await rpcDeadline(connection.getLatestBlockhash('confirmed'))
  transaction.feePayer = payer
  transaction.recentBlockhash = blockhash
  if (signers.length) transaction.partialSign(...signers)
  const signed = await wallet.signTransaction(transaction)
  if (!signed.feePayer?.equals(payer) || signed.recentBlockhash !== blockhash) {
    throw new Error('The wallet changed the transaction payer or expiry. Check the transaction again before submitting.')
  }
  const bytes = signed.serialize()
  if (!signed.signature) throw new Error('The wallet did not return a transaction signature.')
  const signature = bs58.encode(signed.signature)
  const attempt: TransactionAttempt = { signature, blockhash, lastValidBlockHeight, startedAt: new Date().toISOString() }
  // Retain the transaction ID before the RPC call: a lost response does not
  // establish that the signed transaction failed to reach the network.
  onSubmitted?.(signature, attempt)
  // Send through the same RPC used for construction, rather than the wallet's selected network.
  try { await rpcDeadline(connection.sendRawTransaction(bytes, { skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 3 })) }
  catch (issue) {
    if (issue instanceof SendTransactionError && issue.message.startsWith('Simulation failed.')) {
      throw new TransactionOutcomeError(attempt, 'rejected', issue.transactionError.message)
    }
    // An interrupted request is ambiguous. Resolve this exact signed ID.
  }
  await waitForTransaction(connection, attempt)
  return signature
}

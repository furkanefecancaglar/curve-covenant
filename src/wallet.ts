import type { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js'

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
  payer: PublicKey, transaction: Transaction, signers: Keypair[] = [], onSubmitted?: (signature: string) => void) {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
  transaction.feePayer = payer
  transaction.recentBlockhash = blockhash
  if (signers.length) transaction.partialSign(...signers)
  const signed = await wallet.signTransaction(transaction)
  // Send through the same RPC used for construction, rather than the wallet's selected network.
  const signature = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 3 })
  onSubmitted?.(signature)
  const confirmation = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')
  if (confirmation.value.err) throw new Error(`Transaction ${signature} failed: ${JSON.stringify(confirmation.value.err)}`)
  return signature
}

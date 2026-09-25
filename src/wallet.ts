import type { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js'

type Phantom = {
  isPhantom?: boolean
  connect: () => Promise<{ publicKey: PublicKey }>
  signTransaction: (transaction: Transaction) => Promise<Transaction>
}

export async function connectWallet() {
  const wallet = (window as typeof window & { phantom?: { solana?: Phantom } }).phantom?.solana
  if (!wallet?.isPhantom) throw new Error('Install Phantom to sign this transaction.')
  const { publicKey } = await wallet.connect()
  return { wallet, publicKey }
}

export async function sendWalletTransaction(connection: Connection, wallet: Phantom,
  payer: PublicKey, transaction: Transaction, signers: Keypair[] = []) {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
  transaction.feePayer = payer
  transaction.recentBlockhash = blockhash
  if (signers.length) transaction.partialSign(...signers)
  const signed = await wallet.signTransaction(transaction)
  // Send through the same RPC used for construction, rather than the wallet's selected network.
  const signature = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 3 })
  const confirmation = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')
  if (confirmation.value.err) throw new Error(`Transaction ${signature} failed: ${JSON.stringify(confirmation.value.err)}`)
  return signature
}

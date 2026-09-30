import type { Connection, PublicKey } from '@solana/web3.js'

const TOKEN_PROGRAMS = ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb']
function validDecimals(value: unknown): value is number { return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255 }

// Mint precision and token balances are encoded in directly readable accounts.
// These reads do not require an RPC provider's indexed token-supply API.
export async function readMintDecimals(connection: Connection, mint: PublicKey): Promise<number> {
  const account = await connection.getParsedAccountInfo(mint, 'confirmed')
  const data = account.value?.data
  if (!account.value || !TOKEN_PROGRAMS.includes(account.value.owner.toBase58()) || !data || !('parsed' in data)
    || data.parsed?.type !== 'mint' || !validDecimals(data.parsed.info?.decimals)) throw new Error('Token mint precision could not be verified from its account.')
  return data.parsed.info.decimals
}
export async function readTokenAccount(connection: Connection, address: PublicKey, mint: PublicKey) {
  const account = await connection.getParsedAccountInfo(address, 'confirmed')
  const data = account.value?.data
  const info = data && 'parsed' in data && data.parsed?.type === 'account' ? data.parsed.info : undefined
  if (!account.value || !TOKEN_PROGRAMS.includes(account.value.owner.toBase58()) || info?.mint !== mint.toBase58()
    || !validDecimals(info?.tokenAmount?.decimals) || typeof info?.tokenAmount?.amount !== 'string'
    || !/^\d{1,20}$/.test(info.tokenAmount.amount) || BigInt(info.tokenAmount.amount) > 18446744073709551615n) throw new Error('Token vault balance could not be verified from its account.')
  return { amountRaw: info.tokenAmount.amount as string, decimals: info.tokenAmount.decimals as number }
}

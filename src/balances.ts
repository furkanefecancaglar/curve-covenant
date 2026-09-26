import { Connection, PublicKey } from '@solana/web3.js'
import { formatUnits, loadLaunch, RPC } from './dbc'
import type { Network } from './dbc'

const NATIVE_MINT = 'So11111111111111111111111111111111111111112'
const TOKEN_PROGRAMS = ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb']
const ASSOCIATED_TOKEN_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')

export type AssetBalance = { amount: string; account: string; decimals: number }
export type PoolBalances = { owner: string; base: AssetBalance; quote: AssetBalance; quoteSymbol: string; sol: string; fetchedAt: string }

// swap2 uses the associated account for each mint, not the sum of all token accounts.
export async function readTokenBalance(connection: Connection, owner: PublicKey, mint: PublicKey): Promise<AssetBalance> {
  const mintAccount = await connection.getParsedAccountInfo(mint, 'confirmed')
  const program = mintAccount.value?.owner
  const data = mintAccount.value?.data
  if (!program || !TOKEN_PROGRAMS.includes(program.toBase58()) || !data || !('parsed' in data)) {
    throw new Error('Token mint could not be verified.')
  }
  const decimals = data.parsed?.info?.decimals
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) throw new Error('Token precision could not be verified.')
  const [account] = PublicKey.findProgramAddressSync([owner.toBuffer(), program.toBuffer(), mint.toBuffer()], ASSOCIATED_TOKEN_PROGRAM)
  const result = await connection.getParsedAccountInfo(account, 'confirmed')
  if (!result.value) return { amount: '0', account: account.toBase58(), decimals }
  const tokenData = result.value.data
  const info = 'parsed' in tokenData ? tokenData.parsed?.info : undefined
  if (!result.value.owner.equals(program) || info?.mint !== mint.toBase58() || info?.owner !== owner.toBase58()
    || info?.tokenAmount?.decimals !== decimals || !/^\d+$/.test(info?.tokenAmount?.amount ?? '')) {
    throw new Error('Wallet token account could not be verified.')
  }
  return { amount: formatUnits(info.tokenAmount.amount, decimals), account: account.toBase58(), decimals }
}

export async function readPoolBalances(pool: string, network: Network, owner: PublicKey): Promise<PoolBalances> {
  const launch = await loadLaunch(pool, network)
  if (!launch.baseMint) throw new Error('A pool is required to read wallet balances.')
  const connection = new Connection(RPC[network], 'confirmed')
  const [base, lamports, tokenQuote] = await Promise.all([
    readTokenBalance(connection, owner, new PublicKey(launch.baseMint)),
    connection.getBalance(owner, 'confirmed'),
    launch.quoteMint === NATIVE_MINT ? Promise.resolve(null) : readTokenBalance(connection, owner, new PublicKey(launch.quoteMint)),
  ])
  const sol = formatUnits(String(lamports), 9)
  return { owner: owner.toBase58(), base, quote: tokenQuote ?? { amount: sol, account: owner.toBase58(), decimals: 9 },
    quoteSymbol: launch.quoteSymbol, sol, fetchedAt: new Date().toISOString() }
}

import { expect, it, vi } from 'vitest'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token'
import { readTokenBalance } from './balances'

const owner = Keypair.generate().publicKey
const mint = Keypair.generate().publicKey
function fixture(program: PublicKey, missing = false) {
  const account = getAssociatedTokenAddressSync(mint, owner, false, program)
  const read = vi.fn().mockResolvedValueOnce({ value: { owner: program, data: { parsed: { info: { decimals: 8 } } } } })
    .mockResolvedValueOnce({ value: missing ? null : { owner: program, data: { parsed: { info: {
      owner: owner.toBase58(), mint: mint.toBase58(), tokenAmount: { decimals: 8, amount: '9007199254740993123' },
    } } } } })
  return { account, read, connection: { getParsedAccountInfo: read } as unknown as Connection }
}

it.each([TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID])('reads the exact associated account and preserves large balance precision for %s', async program => {
  const { account, read, connection } = fixture(program)
  expect(await readTokenBalance(connection, owner, mint)).toEqual({ account: account.toBase58(), amount: '90071992547.40993123', decimals: 8 })
  expect(read.mock.calls[1][0].equals(account)).toBe(true)
})

it('shows zero for an absent associated account', async () => {
  const { connection } = fixture(TOKEN_2022_PROGRAM_ID, true)
  expect((await readTokenBalance(connection, owner, mint)).amount).toBe('0')
})

it('does not present an RPC failure as a zero balance', async () => {
  const connection = { getParsedAccountInfo: vi.fn().mockRejectedValue(new Error('RPC unavailable')) } as unknown as Connection
  await expect(readTokenBalance(connection, owner, mint)).rejects.toThrow('RPC unavailable')
})

it('rejects an account belonging to another wallet', async () => {
  const { connection, read } = fixture(TOKEN_PROGRAM_ID)
  read.mockReset().mockResolvedValueOnce({ value: { owner: TOKEN_PROGRAM_ID, data: { parsed: { info: { decimals: 8 } } } } })
    .mockResolvedValueOnce({ value: { owner: TOKEN_PROGRAM_ID, data: { parsed: { info: {
      owner: Keypair.generate().publicKey.toBase58(), mint: mint.toBase58(), tokenAmount: { decimals: 8, amount: '100' },
    } } } } })
  await expect(readTokenBalance(connection, owner, mint)).rejects.toThrow('could not be verified')
})

import { expect, it, vi } from 'vitest'
import { Connection, Keypair } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token'
import { readMintDecimals, readTokenAccount } from './token-accounts'
const mint = Keypair.generate().publicKey
const address = Keypair.generate().publicKey
const rpc = (value: unknown) => ({ getParsedAccountInfo: vi.fn().mockResolvedValue({ value }) }) as unknown as Connection
it.each([TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID])('reads mint precision directly from a verified token program account %s', async owner => {
  await expect(readMintDecimals(rpc({ owner, data: { parsed: { type: 'mint', info: { decimals: 8 } } } }), mint)).resolves.toBe(8)
})
it('rejects precision read from an unrelated account owner', async () => {
  await expect(readMintDecimals(rpc({ owner: Keypair.generate().publicKey, data: { parsed: { type: 'mint', info: { decimals: 8 } } } }), mint)).rejects.toThrow('could not be verified')
})
it('reads exact large integer vault balances without floating point conversion', async () => {
  await expect(readTokenAccount(rpc({ owner: TOKEN_2022_PROGRAM_ID, data: { parsed: { type: 'account', info: { mint: mint.toBase58(), tokenAmount: { amount: '9007199254740993123', decimals: 8 } } } } }), address, mint)).resolves.toEqual({ amountRaw: '9007199254740993123', decimals: 8 })
})
it('rejects a vault for another mint', async () => {
  await expect(readTokenAccount(rpc({ owner: TOKEN_PROGRAM_ID, data: { parsed: { type: 'account', info: { mint: address.toBase58(), tokenAmount: { amount: '1', decimals: 8 } } } } }), address, mint)).rejects.toThrow('could not be verified')
})
it('does not turn an absent vault into a zero balance', async () => {
  await expect(readTokenAccount(rpc(null), address, mint)).rejects.toThrow('could not be verified')
})

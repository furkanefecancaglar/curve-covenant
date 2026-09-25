import { describe, expect, it, vi } from 'vitest'
import { Connection, Keypair, Transaction } from '@solana/web3.js'
import { sendWalletTransaction } from './wallet'

describe('wallet transaction confirmation', () => {
  it('rejects an on-chain failure even when the RPC successfully returns a signature', async () => {
    const connection = {
      getLatestBlockhash: vi.fn().mockResolvedValue({ blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 123 }),
      sendRawTransaction: vi.fn().mockResolvedValue('sent-signature'),
      confirmTransaction: vi.fn().mockResolvedValue({ value: { err: { InstructionError: [0, 'InvalidArgument'] } } }),
    } as unknown as Connection
    const wallet = { connect: vi.fn(), signTransaction: vi.fn().mockResolvedValue({ serialize: () => new Uint8Array([1]) }) }
    await expect(sendWalletTransaction(connection, wallet, Keypair.generate().publicKey, new Transaction())).rejects.toThrow('sent-signature failed')
    expect(connection.sendRawTransaction).toHaveBeenCalledOnce()
  })
})

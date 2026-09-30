import { afterEach, expect, it, vi } from 'vitest'
import { Connection } from '@solana/web3.js'
import { MAINNET_GENESIS, MAINNET_HISTORY_RPC, transactionHistoryConnection } from './rpc-history'
import { readTransactionOutcome } from './confirmation'
afterEach(() => vi.restoreAllMocks())
it('uses the official mainnet history service after verifying both networks', async () => {
  const source = new Connection('https://solana-rpc.publicnode.com')
  const genesis = vi.spyOn(Connection.prototype, 'getGenesisHash').mockResolvedValue(MAINNET_GENESIS)
  const history = await transactionHistoryConnection(source)
  expect(history.rpcEndpoint).toBe(MAINNET_HISTORY_RPC)
  expect(await transactionHistoryConnection(source)).toBe(history)
  expect(genesis).toHaveBeenCalledTimes(2)
})
it('never joins a locally intercepted mainnet RPC to public history', async () => {
  const source = new Connection('https://solana-rpc.publicnode.com')
  const genesis = vi.spyOn(Connection.prototype, 'getGenesisHash').mockResolvedValue('local-genesis')
  expect(await transactionHistoryConnection(source)).toBe(source)
  expect(genesis).toHaveBeenCalledOnce()
})
it('leaves custom and devnet endpoints on their selected network', async () => {
  const source = new Connection('https://example.com/custom-rpc')
  const genesis = vi.spyOn(Connection.prototype, 'getGenesisHash')
  expect(await transactionHistoryConnection(source)).toBe(source)
  expect(genesis).not.toHaveBeenCalled()
})
it('rejects a history RPC returning a different genesis', async () => {
  const source = new Connection('https://solana-rpc.publicnode.com')
  vi.spyOn(Connection.prototype, 'getGenesisHash').mockResolvedValueOnce(MAINNET_GENESIS).mockResolvedValueOnce('different-genesis')
  await expect(transactionHistoryConnection(source)).rejects.toThrow('different network')
})
it('retries network selection after a transient lookup failure', async () => {
  const source = new Connection('https://solana-rpc.publicnode.com')
  vi.spyOn(Connection.prototype, 'getGenesisHash').mockRejectedValueOnce(new Error('offline')).mockResolvedValue(MAINNET_GENESIS)
  await expect(transactionHistoryConnection(source)).rejects.toThrow('offline')
  expect((await transactionHistoryConnection(source)).rpcEndpoint).toBe(MAINNET_HISTORY_RPC)
})
it('finds a finalized historical transaction instead of expiring it from the state RPC null', async () => {
  const source = new Connection('https://solana-rpc.publicnode.com')
  vi.spyOn(Connection.prototype, 'getGenesisHash').mockResolvedValue(MAINNET_GENESIS)
  const read = vi.spyOn(Connection.prototype, 'getSignatureStatuses').mockImplementation(async function(this: Connection) {
    return { context: { slot: 100 }, value: this.rpcEndpoint === MAINNET_HISTORY_RPC ? [{ slot: 20, confirmations: null, err: null, confirmationStatus: 'finalized' }] : [null] }
  })
  vi.spyOn(source, 'getBlockHeight').mockResolvedValue(100)
  const result = await readTransactionOutcome(source, { signature: 'old-signature', blockhash: '', lastValidBlockHeight: 50, startedAt: '2026-09-20T00:00:00Z' })
  expect(result).toEqual({ state: 'confirmed', slot: 20 })
  expect(read).toHaveBeenCalledTimes(2)
})

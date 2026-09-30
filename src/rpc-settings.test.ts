import { afterEach, expect, it, vi } from 'vitest'
import { Connection } from '@solana/web3.js'
import { configureNetworkRpc, DEFAULT_RPC, NETWORK_GENESIS, resetNetworkRpc, RPC, rpcSettingsError } from './rpc-settings'
afterEach(() => { resetNetworkRpc('devnet'); resetNetworkRpc('mainnet-beta'); vi.restoreAllMocks() })
it('adopts a verified devnet endpoint only in memory', async () => {
  vi.spyOn(Connection.prototype, 'getGenesisHash').mockResolvedValue(NETWORK_GENESIS.devnet)
  const result = await configureNetworkRpc('devnet', 'https://rpc.example.com/access-secret?key=private-token')
  expect(result).toEqual({ network: 'devnet', origin: 'https://rpc.example.com', historyChecked: false })
  expect(JSON.stringify(result)).not.toMatch(/access-secret|private-token/)
  expect(RPC.devnet).toBe('https://rpc.example.com/access-secret?key=private-token')
  resetNetworkRpc('devnet'); expect(RPC.devnet).toBe(DEFAULT_RPC.devnet)
})
it('rejects the wrong network without changing the current endpoint', async () => {
  vi.spyOn(Connection.prototype, 'getGenesisHash').mockResolvedValue(NETWORK_GENESIS['mainnet-beta'])
  await expect(configureNetworkRpc('devnet', 'https://rpc.example.com')).rejects.toThrow('not on devnet')
  expect(RPC.devnet).toBe(DEFAULT_RPC.devnet)
})
it('refuses insecure URLs before making a request', async () => {
  const read = vi.spyOn(Connection.prototype, 'getGenesisHash')
  await expect(configureNetworkRpc('devnet', 'http://rpc.example.com')).rejects.toThrow('HTTPS')
  expect(read).not.toHaveBeenCalled()
})
it('keeps the existing mainnet endpoint when historical receipts are unavailable', async () => {
  vi.spyOn(Connection.prototype, 'getGenesisHash').mockResolvedValue(NETWORK_GENESIS['mainnet-beta'])
  vi.spyOn(Connection.prototype, 'getSignaturesForAddress').mockResolvedValue([])
  await expect(configureNetworkRpc('mainnet-beta', 'https://rpc.example.com')).rejects.toThrow('transaction-history access')
  expect(RPC['mainnet-beta']).toBe(DEFAULT_RPC['mainnet-beta'])
})
it('checks both full transaction data and historical status before using a mainnet RPC', async () => {
  vi.spyOn(Connection.prototype, 'getGenesisHash').mockResolvedValue(NETWORK_GENESIS['mainnet-beta'])
  vi.spyOn(Connection.prototype, 'getSignaturesForAddress').mockResolvedValue([{ signature: 'historical-id', slot: 100, err: null, memo: null }])
  vi.spyOn(Connection.prototype, 'getTransaction').mockResolvedValue({ transaction: { signatures: ['historical-id'] }, meta: { err: null } } as never)
  vi.spyOn(Connection.prototype, 'getSignatureStatuses').mockResolvedValue({ context: { slot: 200 }, value: [{ slot: 100, err: null, confirmationStatus: 'finalized', confirmations: null }] })
  expect((await configureNetworkRpc('mainnet-beta', 'https://rpc.example.com')).historyChecked).toBe(true)
  expect(RPC['mainnet-beta']).toBe('https://rpc.example.com/')
})
it('does not expose endpoint credentials in a connection error', () => {
  expect(rpcSettingsError(new Error('Failed at https://example.com/secret?api-key=private'))).not.toMatch(/secret|api-key|private/)
})

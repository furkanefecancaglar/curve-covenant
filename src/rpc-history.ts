import { Connection } from '@solana/web3.js'
import { rpcDeadline } from './rpc-timeout'

export const MAINNET_GENESIS = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'
export const MAINNET_HISTORY_RPC = 'https://api.mainnet-beta.solana.com'
const selected = new WeakMap<Connection, Promise<Connection>>()

export async function transactionHistoryConnection(connection: Connection): Promise<Connection> {
  // The default mainnet state RPC restricts indexed history and can return null
  // for historical signatures that the official RPC still returns as finalized.
  // Local/custom RPCs must never be joined to a public chain's history.
  if (connection.rpcEndpoint?.replace(/\/$/, '') !== 'https://solana-rpc.publicnode.com') return connection
  const cached = selected.get(connection)
  if (cached) return cached
  const pending = (async () => {
    if (await rpcDeadline(connection.getGenesisHash()) !== MAINNET_GENESIS) return connection
    const history = new Connection(MAINNET_HISTORY_RPC, { commitment: 'confirmed', disableRetryOnRateLimit: true })
    if (await rpcDeadline(history.getGenesisHash()) !== MAINNET_GENESIS) throw new Error('The transaction history RPC returned a different network. Its results were not used.')
    return history
  })()
  selected.set(connection, pending)
  try { return await pending } catch (issue) { selected.delete(connection); throw issue }
}

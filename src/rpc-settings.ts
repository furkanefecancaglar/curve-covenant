import { Connection, PublicKey } from '@solana/web3.js'
import type { Network } from './dbc'
import { rpcDeadline } from './rpc-timeout'

export const DEFAULT_RPC: Record<Network, string> = { 'mainnet-beta': 'https://solana-rpc.publicnode.com', devnet: 'https://api.devnet.solana.com' }
// Deliberately memory-only: endpoint access tokens must not enter bookmarks,
// launch receipts, share links, exported reports or browser persistence.
export const RPC: Record<Network, string> = { ...DEFAULT_RPC }
export const RPC_SETTINGS_CHANGED = 'curve-covenant:rpc-settings-changed'
export const NETWORK_GENESIS: Record<Network, string> = { 'mainnet-beta': '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d', devnet: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG' }
export const PUBLIC_REFERENCE_POOL = '4L9LJ3B5niCSLWujRJjPU6scZVbNJz4zw6A9B3aPxTeT'
const notify = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event(RPC_SETTINGS_CHANGED)) }
export function resetNetworkRpc(network: Network) { RPC[network] = DEFAULT_RPC[network]; notify() }
export async function configureNetworkRpc(network: Network, input: string) {
  let url: URL
  try { url = new URL(input.trim()) } catch { throw new Error('Enter a complete HTTPS Solana RPC URL.') }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('Use an HTTPS RPC URL without embedded username/password or a fragment.')
  const connection = new Connection(url.toString(), { commitment: 'confirmed', disableRetryOnRateLimit: true })
  const genesis = await rpcDeadline(connection.getGenesisHash())
  if (genesis !== NETWORK_GENESIS[network]) throw new Error(`This RPC is not on ${network}. The existing connection was kept.`)
  if (network === 'mainnet-beta') {
    const signatures = await rpcDeadline(connection.getSignaturesForAddress(new PublicKey(PUBLIC_REFERENCE_POOL), { limit: 1 }, 'confirmed'))
    const signature = signatures[0]?.signature
    if (!signature) throw new Error('The RPC could not return the public reference pool history. Use an endpoint with transaction-history access.')
    const [transaction, statuses] = await Promise.all([
      rpcDeadline(connection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 })),
      rpcDeadline(connection.getSignatureStatuses([signature], { searchTransactionHistory: true })),
    ])
    if (!transaction?.meta || transaction.transaction.signatures[0] !== signature || !['confirmed', 'finalized'].includes(statuses.value[0]?.confirmationStatus ?? '')) {
      throw new Error('This endpoint did not verify the historical transaction. The existing connection was kept.')
    }
  }
  RPC[network] = url.toString(); notify()
  return { network, origin: url.origin, historyChecked: network === 'mainnet-beta' }
}
export function rpcSettingsError(issue: unknown): string {
  const message = issue instanceof Error ? issue.message : ''
  if (/^(Enter a complete|Use an HTTPS|This RPC is not|The RPC could not|This endpoint did not)/.test(message)) return message
  if (/\b(?:403|401)\b|access|forbidden/i.test(message)) return 'The RPC denied access. Check the access key and allowed website origins in your provider dashboard.'
  if (/\b429\b|too many requests/i.test(message)) return 'The RPC is rate limited. Wait before checking it again.'
  return 'The RPC check failed. Check the endpoint and its browser access settings, then retry.'
}

import { PublicKey } from '@solana/web3.js'
import type { Network } from './dbc'

export type SavedPool = { address: string; network: Network; label: string; savedAt: string }
export const POOL_LIBRARY_KEY = 'curve-covenant:pools:v1'

export function poolLocation(address: unknown, network: unknown): { address: string; network: Network } {
  if (typeof address !== 'string' || (network !== 'devnet' && network !== 'mainnet-beta')) throw new Error('Invalid pool link. Select a Solana network and a valid pool address.')
  return { address: new PublicKey(address.trim()).toBase58(), network }
}

export function readPoolLibrary(raw: string | null): SavedPool[] {
  try {
    const value = JSON.parse(raw ?? '[]')
    if (!Array.isArray(value)) return []
    const entries: SavedPool[] = []
    for (const item of value.slice(0, 100)) {
      try {
        const location = poolLocation(item.address, item.network)
        if (!Number.isFinite(Date.parse(item.savedAt))) continue
        if (entries.some(pool => pool.address === location.address && pool.network === location.network)) continue
        entries.push({ ...location, label: typeof item.label === 'string' ? item.label.slice(0, 64) : 'DBC pool', savedAt: item.savedAt })
      } catch { /* Ignore a damaged bookmark, keeping the rest of the library usable. */ }
    }
    return entries.slice(0, 30)
  } catch { return [] }
}

export function rememberPool(pools: SavedPool[], location: { address: string; network: Network }, label?: string): SavedPool[] {
  const verified = poolLocation(location.address, location.network)
  const existing = pools.find(pool => pool.address === verified.address && pool.network === verified.network)
  return [{ ...verified, label: (label || existing?.label || 'DBC pool').slice(0, 64), savedAt: new Date().toISOString() },
    ...pools.filter(pool => pool.address !== verified.address || pool.network !== verified.network)].slice(0, 30)
}

export function poolShareUrl(base: string, pool: { address: string; network: Network }): string {
  const location = poolLocation(pool.address, pool.network)
  const url = new URL(base)
  url.search = ''; url.hash = 'graduate'
  url.searchParams.set('pool', location.address)
  url.searchParams.set('network', location.network)
  return url.toString()
}

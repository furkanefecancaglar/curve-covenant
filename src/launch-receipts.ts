import { PublicKey } from '@solana/web3.js'
import bs58 from 'bs58'
import { QUOTES } from './quotes'
import type { QuoteId } from './quotes'
import type { TokenIdentity } from './publish'
import type { TransactionAttempt } from './confirmation'
import { POOL_LIBRARY_KEY, readPoolLibrary, rememberPool } from './pool-library'

export type LaunchReceipt = {
  version: 1; configAddress: string; mintAddress: string; payer: string; quoteId: QuoteId
  identity: TokenIdentity; configAttempt: TransactionAttempt; poolAttempt?: TransactionAttempt
}
export const LAUNCH_RECEIPTS_CHANGED = 'curve-covenant:launch-receipts-changed'
const PREFIX = 'curve-covenant:launch:v1:'
const key = (configAddress: string) => PREFIX + configAddress
function notify() { if (typeof window !== 'undefined') window.dispatchEvent(new Event(LAUNCH_RECEIPTS_CHANGED)) }
function attempt(value: unknown): TransactionAttempt {
  if (!value || typeof value !== 'object') throw new Error('Invalid attempt')
  const data = value as TransactionAttempt
  if (typeof data.signature !== 'string' || data.signature.length > 88 || bs58.decode(data.signature).length !== 64) throw new Error('Invalid signature')
  if (typeof data.blockhash !== 'string') throw new Error('Invalid blockhash')
  new PublicKey(data.blockhash)
  if (!Number.isSafeInteger(data.lastValidBlockHeight) || data.lastValidBlockHeight < 0 || typeof data.startedAt !== 'string' || !Number.isFinite(Date.parse(data.startedAt))) throw new Error('Invalid expiry')
  return { signature: data.signature, blockhash: data.blockhash, lastValidBlockHeight: data.lastValidBlockHeight, startedAt: data.startedAt }
}
export function parseLaunchReceipt(raw: string | null): LaunchReceipt | null {
  try {
    const value = JSON.parse(raw ?? 'null')
    if (!value || value.version !== 1 || !Object.hasOwn(QUOTES, value.quoteId)) return null
    for (const field of ['configAddress', 'mintAddress', 'payer']) { if (typeof value[field] !== 'string') return null; new PublicKey(value[field]) }
    const identity = value.identity
    if (!identity || typeof identity.name !== 'string' || !identity.name.trim() || new TextEncoder().encode(identity.name).length > 32 || typeof identity.symbol !== 'string' || !/^[A-Z0-9]{2,10}$/.test(identity.symbol)) return null
    if (typeof identity.metadataUri !== 'string' || identity.metadataUri.length > 200 || new URL(identity.metadataUri).protocol !== 'https:') return null
    return { version: 1, configAddress: value.configAddress, mintAddress: value.mintAddress, payer: value.payer, quoteId: value.quoteId,
      identity: { name: identity.name, symbol: identity.symbol, metadataUri: identity.metadataUri },
      configAttempt: attempt(value.configAttempt), ...(value.poolAttempt ? { poolAttempt: attempt(value.poolAttempt) } : {}) }
  } catch { return null }
}
export function loadLaunchReceipt(configAddress: string): LaunchReceipt | null {
  try { const receipt = parseLaunchReceipt(localStorage.getItem(key(configAddress))); return receipt?.configAddress === configAddress ? receipt : null } catch { return null }
}
export function listLaunchReceipts(): LaunchReceipt[] {
  try {
    const receipts: LaunchReceipt[] = []
    for (let index = 0; index < localStorage.length; index++) {
      const name = localStorage.key(index)
      if (!name?.startsWith(PREFIX)) continue
      const receipt = loadLaunchReceipt(name.slice(PREFIX.length))
      if (receipt) receipts.push(receipt)
    }
    return receipts.sort((a, b) => b.configAttempt.startedAt.localeCompare(a.configAttempt.startedAt))
  } catch { return [] }
}
export function saveLaunchReceipt(receipt: LaunchReceipt) {
  // Public references only. Never serialize the in-memory mint/config signers.
  const clean = parseLaunchReceipt(JSON.stringify(receipt))
  if (!clean) throw new Error('Could not retain a valid launch receipt. No transaction was sent.')
  try { localStorage.setItem(key(clean.configAddress), JSON.stringify(clean)) }
  catch { throw new Error('This browser cannot save your launch receipt. Allow site storage before trying again. No transaction was sent.') }
  notify()
}
export function removeLaunchReceipt(receipt: LaunchReceipt) {
  const current = loadLaunchReceipt(receipt.configAddress)
  if (current && JSON.stringify(current) === JSON.stringify(receipt)) { localStorage.removeItem(key(receipt.configAddress)); notify() }
}
export function archiveLaunchReceipt(receipt: LaunchReceipt, poolAddress: string) {
  const pools = rememberPool(readPoolLibrary(localStorage.getItem(POOL_LIBRARY_KEY)),
    { address: poolAddress, network: QUOTES[receipt.quoteId].network }, `${receipt.identity.name} / ${receipt.quoteId}`)
  // Write the bookmark first so a reload cannot lose an already-created pool.
  localStorage.setItem(POOL_LIBRARY_KEY, JSON.stringify(pools))
  removeLaunchReceipt(receipt)
}
export async function withLaunchLock<T>(configAddress: string, work: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(key(configAddress), { ifAvailable: true }, lock => {
      if (!lock) throw new Error('This launch is being handled in another tab. Wait for that attempt, then check its status.')
      return work()
    })
  }
  return work()
}

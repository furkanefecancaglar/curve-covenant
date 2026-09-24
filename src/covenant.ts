import type { LaunchData } from './dbc'
import { PublicKey } from '@solana/web3.js'
import nacl from 'tweetnacl'

export type PromiseField = 'initialTradingFeePct' | 'migrationQuoteThresholdRaw' | 'migrationTarget' | 'creatorFeeSharePct' | 'partnerLiquidityPct' | 'creatorLiquidityPct' | 'tokenAuthority'
export const PROMISE_FIELDS: { key: PromiseField; label: string; suffix?: string }[] = [
  { key: 'initialTradingFeePct', label: 'Initial trading fee', suffix: '%' },
  { key: 'migrationQuoteThresholdRaw', label: 'Graduation threshold (raw units)' },
  { key: 'migrationTarget', label: 'Graduation destination' },
  { key: 'creatorFeeSharePct', label: 'Creator share of trading fees', suffix: '%' },
  { key: 'partnerLiquidityPct', label: 'Partner migrated liquidity', suffix: '%' },
  { key: 'creatorLiquidityPct', label: 'Creator migrated liquidity', suffix: '%' },
  { key: 'tokenAuthority', label: 'Token authority' },
]

export type Covenant = {
  schema: 'curve-covenant/v1'
  network: LaunchData['network']
  configAddress: string
  poolAddress?: string
  project: string
  description: string
  claims: Partial<Record<PromiseField, string | number>>
  createdAt: string
  signature?: {
    scheme: 'ed25519'
    signer: string
    bytesBase64: string
  }
}

export type Check = { key: PromiseField; label: string; expected: string; actual: string; matches: boolean }

export function compareCovenant(covenant: Covenant, launch: LaunchData): Check[] {
  if (covenant.network !== launch.network || covenant.configAddress !== launch.configAddress ||
    (covenant.poolAddress && covenant.poolAddress !== launch.poolAddress)) {
    throw new Error('This covenant refers to a different DBC launch.')
  }
  return PROMISE_FIELDS.flatMap(({ key, label }) => {
    const expected = covenant.claims[key]
    if (expected === undefined || expected === '') return []
    const actual = launch[key]
    return [{ key, label, expected: String(expected), actual: String(actual), matches: String(expected) === String(actual) }]
  })
}

export function createCovenant(launch: LaunchData, project: string, description: string, claims: Partial<Record<PromiseField, string | number>>): Covenant {
  if (!project.trim()) throw new Error('A project name is required.')
  if (Object.values(claims).every(value => value === '' || value === undefined)) throw new Error('Select at least one on-chain promise.')
  return {
    schema: 'curve-covenant/v1', network: launch.network, configAddress: launch.configAddress,
    poolAddress: launch.poolAddress, project: project.trim(), description: description.trim(),
    claims, createdAt: new Date().toISOString(),
  }
}

export function parseCovenant(value: unknown): Covenant {
  if (!value || typeof value !== 'object') throw new Error('The file is not a covenant.')
  const obj = value as Partial<Covenant>
  if (obj.schema !== 'curve-covenant/v1' || !obj.configAddress || !['mainnet-beta', 'devnet'].includes(obj.network ?? '') || !obj.claims || typeof obj.claims !== 'object') {
    throw new Error('Unsupported covenant file.')
  }
  return obj as Covenant
}

export function covenantMessage(covenant: Covenant): Uint8Array {
  const { schema, network, configAddress, poolAddress, project, description, claims, createdAt } = covenant
  const payload = JSON.stringify({ schema, network, configAddress, poolAddress: poolAddress ?? null,
    project, description, claims: Object.fromEntries(PROMISE_FIELDS.flatMap(({ key }) => claims[key] === undefined ? [] : [[key, claims[key]]])), createdAt })
  return new TextEncoder().encode(`Curve Covenant signed disclosure v1\n${payload}`)
}

export type SignatureCheck = { valid: boolean; authorizedRole: string | null; signer: string; reason?: string }

export function verifyCovenantSignature(covenant: Covenant, launch: LaunchData): SignatureCheck | null {
  const signature = covenant.signature
  if (!signature) return null
  try {
    if (signature.scheme !== 'ed25519') throw new Error('Unsupported signature scheme')
    const signer = new PublicKey(signature.signer)
    const bytes = Uint8Array.from(atob(signature.bytesBase64), char => char.charCodeAt(0))
    if (bytes.length !== 64 || !nacl.sign.detached.verify(covenantMessage(covenant), bytes, signer.toBytes())) {
      throw new Error('Signature does not match this document')
    }
    const role = signer.toBase58() === launch.feeClaimer ? 'DBC fee claimer' : signer.toBase58() === launch.creator ? 'pool creator' : null
    return { valid: true, authorizedRole: role, signer: signer.toBase58() }
  } catch (error) {
    return { valid: false, authorizedRole: null, signer: signature.signer, reason: error instanceof Error ? error.message : 'Invalid signature' }
  }
}

type PhantomProvider = {
  isPhantom?: boolean
  connect: () => Promise<{ publicKey: PublicKey }>
  signMessage: (message: Uint8Array, display?: 'utf8') => Promise<{ signature: Uint8Array; publicKey?: PublicKey }>
}

export async function signCovenantWithPhantom(covenant: Covenant, launch: LaunchData): Promise<Covenant> {
  const windowWithWallet = window as typeof window & { phantom?: { solana?: PhantomProvider } }
  const provider = windowWithWallet.phantom?.solana
  if (!provider?.isPhantom) throw new Error('Phantom was not found in this browser. Install its wallet extension to sign.')
  const { publicKey } = await provider.connect()
  const signer = publicKey.toBase58()
  if (signer !== launch.feeClaimer && signer !== launch.creator) {
    throw new Error('The connected wallet is neither this DBC config fee claimer nor its pool creator.')
  }
  const signed = await provider.signMessage(covenantMessage(covenant), 'utf8')
  const bytesBase64 = btoa(String.fromCharCode(...signed.signature))
  const result: Covenant = { ...covenant, signature: { scheme: 'ed25519', signer, bytesBase64 } }
  const verification = verifyCovenantSignature(result, launch)
  if (!verification?.valid || !verification.authorizedRole) throw new Error('Wallet signature could not be verified against the DBC role.')
  return result
}

export function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

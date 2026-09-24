import type { LaunchData } from './dbc'

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
  if (obj.schema !== 'curve-covenant/v1' || !obj.configAddress || !obj.network || !obj.claims || typeof obj.claims !== 'object') {
    throw new Error('Unsupported covenant file.')
  }
  return obj as Covenant
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

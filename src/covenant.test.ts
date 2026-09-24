import { describe, expect, it } from 'vitest'
import { compareCovenant, covenantMessage, createCovenant, parseCovenant, verifyCovenantSignature } from './covenant'
import { formatUnits, parseUnits } from './dbc'
import type { LaunchData } from './dbc'
import { Keypair } from '@solana/web3.js'
import nacl from 'tweetnacl'

const launch = {
  network: 'mainnet-beta', configAddress: 'config', poolAddress: 'pool',
  initialTradingFeePct: 2, migrationQuoteThresholdRaw: '8696938456',
  migrationTarget: 'Meteora DAMM v2', creatorFeeSharePct: 0,
  partnerLiquidityPct: 0, creatorLiquidityPct: 0,
  tokenAuthority: 'Immutable metadata',
} as LaunchData

describe('covenants', () => {
  it('checks exact on-chain values and exposes a changed promise', () => {
    const covenant = createCovenant(launch, 'Example', 'Disclosure', { initialTradingFeePct: 2, migrationQuoteThresholdRaw: '8696938456' })
    expect(compareCovenant(covenant, launch).every(check => check.matches)).toBe(true)
    expect(compareCovenant(covenant, { ...launch, initialTradingFeePct: 3 })[0].matches).toBe(false)
  })
  it('rejects a covenant for a different config', () => {
    const covenant = createCovenant(launch, 'Example', '', { creatorFeeSharePct: 0 })
    expect(() => compareCovenant(covenant, { ...launch, configAddress: 'other' })).toThrow()
  })
  it('rejects malformed files and missing claims', () => {
    expect(() => parseCovenant({ schema: 'unknown' })).toThrow()
    expect(() => createCovenant(launch, 'Example', '', {})).toThrow()
  })
  it('verifies issuer signatures and detects tampering', () => {
    const signer = Keypair.generate()
    const associatedLaunch = { ...launch, feeClaimer: signer.publicKey.toBase58() }
    const covenant = createCovenant(associatedLaunch, 'Example', 'Disclosure', { initialTradingFeePct: 2 })
    const signature = nacl.sign.detached(covenantMessage(covenant), signer.secretKey)
    const signed = { ...covenant, signature: { scheme: 'ed25519' as const, signer: signer.publicKey.toBase58(), bytesBase64: btoa(String.fromCharCode(...signature)) } }
    expect(verifyCovenantSignature(signed, associatedLaunch)?.authorizedRole).toBe('DBC fee claimer')
    expect(verifyCovenantSignature({ ...signed, description: 'Changed' }, associatedLaunch)?.valid).toBe(false)
  })
})

describe('quote units', () => {
  it('preserves large raw values without floating-point rounding', () => {
    expect(formatUnits('9007199254740993123', 6)).toBe('9007199254740.993123')
    expect(formatUnits('1000000', 6)).toBe('1')
    expect(parseUnits('1.000001', 6)).toBe('1000001')
    expect(() => parseUnits('1.0000001', 6)).toThrow()
  })
})

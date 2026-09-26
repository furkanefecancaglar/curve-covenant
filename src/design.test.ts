import { expect, it } from 'vitest'
import { decodeDesign, encodeDesign } from './design'
import { PRESETS } from './studio'

it('round-trips edited stock launch terms through a share link', () => {
  const inputs = { ...PRESETS.long.values, migrationMarketCap: 60_000, creatorFeeSharePct: 15 }
  expect(decodeDesign(encodeDesign('XRXx', inputs))).toEqual({ version: 1, quoteId: 'XRXx', inputs })
})

it('rejects malformed or contradictory shared terms', () => {
  for (const value of ['bogus', 'a'.repeat(5000), btoa('{"version":1,"quoteId":"__proto__"}')]) {
    expect(() => decodeDesign(value)).toThrow('shared design')
  }
  expect(() => decodeDesign(encodeDesign('SOL', { ...PRESETS.steady.values, supply: -1 }))).toThrow('shared design')
})

it('shares the exact controlled scenario configuration rather than approximating it from endpoint terms', async () => {
  const { buildControlledCurves } = await import('./scenarios')
  const { toPlain } = await import('./dbc')
  const reference = { ...PRESETS.steady.values, initialMarketCap: 1, migrationMarketCap: 10 }
  const curve = buildControlledCurves(reference, 8)[1]
  const decoded = decodeDesign(encodeDesign('XRXx', curve.inputs, { model: 'long', reference }))
  expect(decoded.version).toBe(2)
  const restored = buildControlledCurves(decoded.controlled!.reference, 8).find(item => item.id === decoded.controlled!.model)!
  expect(toPlain(restored.config)).toEqual(toPlain(curve.config))
  expect(() => decodeDesign(encodeDesign('XRXx', { ...curve.inputs, supply: curve.inputs.supply * 2 }, { model: 'long', reference }))).toThrow('shared design')
})

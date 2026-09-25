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

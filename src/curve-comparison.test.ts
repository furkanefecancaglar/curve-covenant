import { expect, it } from 'vitest'
import { compareCurves } from './curve-comparison'
import { PRESETS } from './studio'

it('compares geometry with identical fees and keeps partial-fill cost independent of excess budget', () => {
  const inputs = { ...PRESETS.long.values, initialMarketCap: 1, migrationMarketCap: 10 }
  const normal = compareCurves(inputs, '10', 0, 8)
  const excess = compareCurves(inputs, '100000000000', 0, 8)
  for (let i = 0; i < normal.length; i++) {
    expect(normal[i].error).toBe('')
    expect(excess[i].result!.quote.filledQuote).toBe(normal[i].result!.quote.filledQuote)
    expect(excess[i].result!.averageCostMultiple).toBe(normal[i].result!.averageCostMultiple)
  }
  const early = compareCurves(PRESETS.long.values, '0.1', 0, 8)
  expect(new Set(early.map(row => row.result!.quote.totalFeeQuote)).size).toBe(1)
})

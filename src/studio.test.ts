import { describe, expect, it } from 'vitest'
import { buildStudioConfig, PRESETS, sampleLaunchCurve, simulateOpeningBuy, studioSummary } from './studio'

describe('DBC launch presets', () => {
  it('builds SDK-valid configurations for every preset', () => {
    for (const preset of Object.values(PRESETS)) {
      const config = buildStudioConfig(preset.values)
      const summary = studioSummary(config)
      expect(summary.migrationQuoteThreshold).toBeGreaterThan(0)
      expect(config.migrationOption).toBe(1)
      expect(config.curve.length).toBeGreaterThan(0)
    }
  })

  it('changes the real graduation threshold when market caps change', () => {
    const base = PRESETS.steady.values
    const first = studioSummary(buildStudioConfig(base)).migrationQuoteThreshold
    const second = studioSummary(buildStudioConfig({ ...base, migrationMarketCap: 20_000 })).migrationQuoteThreshold
    expect(second).toBeGreaterThan(first)
  })

  it('rejects contradictory fees before building a transaction', () => {
    expect(() => buildStudioConfig({ ...PRESETS.discovery.values, feeDurationHours: 0 })).toThrow('positive duration')
  })

  it('uses Meteora quote math to reflect a decaying fee', () => {
    const config = buildStudioConfig(PRESETS.discovery.values)
    const opening = simulateOpeningBuy(config, '1', 0)
    const afterSchedule = simulateOpeningBuy(config, '1', 24)
    expect(opening.totalFeeQuote).toBe('0.03')
    expect(Number(afterSchedule.totalFeeQuote)).toBeLessThan(Number(opening.totalFeeQuote))
    expect(Number(afterSchedule.outputTokens)).toBeGreaterThan(Number(opening.outputTokens))
  })

  it('builds a 16-segment stock-quoted long curve with quote-token precision', () => {
    const config = buildStudioConfig(PRESETS.long.values, 8)
    expect(config.curve).toHaveLength(16)
    expect(config.curve[0].liquidity.gt(config.curve[15].liquidity)).toBe(true)
    expect(studioSummary(config, 8).migrationQuoteThreshold).toBeGreaterThan(1000)
    expect(simulateOpeningBuy(config, '1', 0, 8).unfilledQuote).toBe('0')
  })

  it('plots all four curves through the configured graduation value without exceeding the reserve threshold', () => {
    for (const preset of Object.values(PRESETS)) {
      const config = buildStudioConfig(preset.values, 8)
      const points = sampleLaunchCurve(config, preset.values.supply, 8)
      expect(points[0].marketCap).toBeCloseTo(preset.values.initialMarketCap, 2)
      expect(points.at(-1)!.marketCap).toBeCloseTo(preset.values.migrationMarketCap, 1)
      expect(points.at(-1)!.quoteReserve).toBeCloseTo(studioSummary(config, 8).migrationQuoteThreshold, 6)
      for (let i = 1; i < points.length; i++) {
        expect(points[i].marketCap).toBeGreaterThanOrEqual(points[i - 1].marketCap)
      }
    }
  })
})

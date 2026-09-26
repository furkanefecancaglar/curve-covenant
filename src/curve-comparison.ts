import { buildStudioConfig, sampleLaunchCurve, simulateOpeningBuy, studioSummary } from './studio'
import type { StudioInputs } from './studio'

export const CURVE_MODELS = [
  { id: 'steady' as const, label: 'One segment', description: 'Continuous price discovery', leftoverPct: .001, color: '#90cfff' },
  { id: 'momentum' as const, label: 'Two stages', description: 'Two liquidity segments', leftoverPct: 35, color: '#d6afff' },
  { id: 'long' as const, label: 'Long curve', description: '16 segments, more opening liquidity weight', leftoverPct: .001, color: '#b6ed90' },
]
export type CurveModelId = typeof CURVE_MODELS[number]['id']

export function compareCurves(input: StudioInputs, amount: string, elapsedHours: number, quoteDecimals: number) {
  return CURVE_MODELS.map(model => {
    try {
      const config = buildStudioConfig({ ...input, preset: model.id }, quoteDecimals)
      const quote = simulateOpeningBuy(config, amount, elapsedHours, quoteDecimals)
      const filledQuote = Number(quote.filledQuote)
      const openingPrice = input.initialMarketCap / input.supply
      const output = Number(quote.outputTokens)
      return { ...model, error: '', result: {
        threshold: studioSummary(config, quoteDecimals).migrationQuoteThreshold,
        quote, filledQuote, averageCostMultiple: output > 0 ? filledQuote / output / openingPrice : null,
        points: sampleLaunchCurve(config, input.supply, quoteDecimals),
      } }
    } catch (error) {
      return { ...model, result: null, error: error instanceof Error ? error.message : 'This curve cannot use these terms.' }
    }
  })
}

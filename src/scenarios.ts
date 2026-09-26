import BN from 'bn.js'
import { PublicKey } from '@solana/web3.js'
import { getMigrationThresholdPrice, getPriceFromSqrtPrice, getSqrtPriceFromPrice, validateConfigParameters } from '@meteora-ag/dynamic-bonding-curve-sdk'
import type { ConfigParameters } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { buildStudioConfig } from './studio'
import type { StudioInputs } from './studio'
import { formatUnits, parseUnits, toPlain } from './dbc'
import { ScenarioSimulator } from './scenario-engine'
import type { ScenarioEvent, ScenarioTrade } from './scenario-engine'

export const SCENARIOS = [
  { id: 'retail', label: 'Retail drip', description: '30 equal buys, one minute apart.' },
  { id: 'whale', label: 'Early whale', description: '40% of the buy budget at opening, then 30 retail buys.' },
  { id: 'sell-pressure', label: 'Sell pressure', description: '30% opening buy, sell half its tokens, then 30 retail buys.' },
  { id: 'graduation', label: 'Graduation progress', description: '40 equal buys. Identical thresholds may produce identical completion steps.' },
] as const
export type ScenarioId = typeof SCENARIOS[number]['id']
export type ControlledCurve = { id: 'steady' | 'long'; label: string; color: string; config: ConfigParameters; inputs: StudioInputs }

export function buildControlledCurves(input: StudioInputs, quoteDecimals: number): ControlledCurve[] {
  const steadyInput = { ...input, preset: 'steady' as const }
  const baseline = buildStudioConfig(steadyInput, quoteDecimals)
  const target = baseline.migrationQuoteThreshold
  const start = getSqrtPriceFromPrice((input.initialMarketCap / input.supply).toString(), 6, quoteDecimals)
  baseline.sqrtStartPrice = start.clone()
  validateConfigParameters({ ...baseline, leftoverReceiver: new PublicKey('So11111111111111111111111111111111111111112') })
  // Endpoint price is the free variable. Supply, start price, fees and the
  // reserve threshold are held constant; do not compare different thresholds.
  let low = input.initialMarketCap * 1.01
  let high = Math.max(input.migrationMarketCap, low * 2)
  const build = (cap: number) => buildStudioConfig({ ...input, preset: 'long', migrationMarketCap: cap }, quoteDecimals)
  if (build(low).migrationQuoteThreshold.gt(target)) throw new Error('No controlled long curve exists within the supported endpoint range.')
  while (build(high).migrationQuoteThreshold.lt(target)) {
    high = Math.min(high * 2, 10_000_000_000)
    if (high === 10_000_000_000 && build(high).migrationQuoteThreshold.lt(target)) throw new Error('Could not match the reserve threshold.')
  }
  let cap = high
  let long = build(cap)
  for (let i = 0; i < 64; i++) {
    cap = (low + high) / 2
    long = build(cap)
    const difference = long.migrationQuoteThreshold.sub(target)
    if (!difference.isNeg() && difference.lten(1)) break
    if (difference.isNeg()) low = cap
    else high = cap
  }
  if (long.migrationQuoteThreshold.sub(target).abs().gtn(1)) throw new Error('The controlled threshold could not be matched to one quote base unit.')
  // Resolve the final integer rounding unit and revalidate actual deployability.
  long = { ...long, migrationQuoteThreshold: target.clone(), sqrtStartPrice: start.clone() }
  validateConfigParameters({ ...long, leftoverReceiver: new PublicKey('So11111111111111111111111111111111111111112') })
  return [
    { id: 'steady', label: 'One segment', color: '#90cfff', config: baseline, inputs: steadyInput },
    { id: 'long', label: 'Long · 16 segments', color: '#b6ed90', config: long, inputs: { ...input, preset: 'long', migrationMarketCap: cap } },
  ]
}

function split(raw: bigint, count: number): string[] {
  const each = raw / BigInt(count)
  if (each === 0n) throw new Error('Budget is too small for the scenario trade count.')
  return Array.from({ length: count }, (_, i) => (each + (BigInt(i) < raw % BigInt(count) ? 1n : 0n)).toString())
}
export function scenarioSchedule(id: ScenarioId, grossBudgetRaw: string): ScenarioEvent[] {
  if (!SCENARIOS.some(item => item.id === id)) throw new Error('Unknown scenario.')
  if (!/^\d+$/.test(grossBudgetRaw) || BigInt(grossBudgetRaw) <= 0n || BigInt(grossBudgetRaw) > 18446744073709551615n) throw new Error('Invalid scenario budget.')
  const budget = BigInt(grossBudgetRaw)
  const count = id === 'graduation' ? 40 : 30
  const opening = id === 'whale' ? budget * 40n / 100n : id === 'sell-pressure' ? budget * 30n / 100n : 0n
  const events: ScenarioEvent[] = []
  if (opening > 0n) events.push({ actor: 'early-opening', side: 'buy', amountRaw: opening.toString(), atSeconds: 0 })
  const remainder = split(budget - opening, count)
  remainder.forEach((raw, i) => events.push({ actor: `${i < count / 3 ? 'early' : i < count * 2 / 3 ? 'middle' : 'late'}-${i}`,
    side: 'buy', amountRaw: raw, atSeconds: (i + (opening > 0n ? (id === 'sell-pressure' ? 2 : 1) : 0)) * 60 }))
  return events
}

export function runScenario(curve: ControlledCurve, id: ScenarioId, budgetRaw: string, quoteDecimals: number) {
  const simulator = new ScenarioSimulator(curve.config, quoteDecimals)
  const initial = simulator.snapshot()
  const scheduled = scenarioSchedule(id, budgetRaw)
  for (const event of scheduled) {
    if (simulator.snapshot().completed) break
    simulator.execute(event)
    if (id === 'sell-pressure' && event.actor === 'early-opening' && !simulator.snapshot().completed) {
      const sell = BigInt(simulator.inventory(event.actor)) / 2n
      if (sell > 0n) simulator.execute({ actor: event.actor, side: 'sell', amountRaw: sell.toString(), atSeconds: 60 })
    }
  }
  const trades = simulator.trades
  const final = simulator.snapshot()
  const buys = trades.filter(trade => trade.side === 'buy')
  const sells = trades.filter(trade => trade.side === 'sell')
  const sum = (values: string[]) => values.reduce((a, b) => a + BigInt(b), 0n)
  const bought = sum(buys.map(t => t.outputRaw))
  const spent = sum(buys.map(t => t.filledInputRaw))
  const returned = sum(sells.map(t => t.outputRaw))
  const openingPrice = getPriceFromSqrtPrice(curve.config.sqrtStartPrice, 6, quoteDecimals).toNumber()
  const cohorts = (['early', 'middle', 'late'] as const).map(name => {
    const entries = buys.filter(t => t.actor.startsWith(`${name}-`))
    const tokens = sum(entries.map(t => t.outputRaw))
    const grossQuote = sum(entries.map(t => t.filledInputRaw))
    return { name, baseReceived: formatUnits(tokens.toString(), 6), quoteSpent: formatUnits(grossQuote.toString(), quoteDecimals),
      averageCost: tokens > 0n ? Number(grossQuote) / 10 ** quoteDecimals / (Number(tokens) / 1e6) : null,
      shareOfBuyOutputPct: bought > 0n ? Number(tokens) / Number(bought) * 100 : 0 }
  })
  const firstSell = sells[0]
  let recovery: { additionalBuys: number; grossQuote: string } | null = null
  if (firstSell) {
    const target = new BN(firstSell.before.sqrtPriceRaw)
    const later = trades.filter(t => t.index > firstSell.index && t.side === 'buy')
    const recoveredAt = later.findIndex(t => new BN(t.after.sqrtPriceRaw).gte(target))
    if (recoveredAt >= 0) recovery = { additionalBuys: recoveredAt + 1,
      grossQuote: formatUnits(sum(later.slice(0, recoveredAt + 1).map(t => t.filledInputRaw)).toString(), quoteDecimals) }
  }
  const threshold = BigInt(curve.config.migrationQuoteThreshold.toString())
  const remaining = threshold > BigInt(final.quoteReserveRaw) ? threshold - BigInt(final.quoteReserveRaw) : 0n
  const actors = [...new Set(trades.map(t => t.actor))]
  return { id: curve.id, label: curve.label, color: curve.color, initial, final, trades, scheduledBuys: scheduled,
    config: toPlain(curve.config), inputs: curve.inputs, openingPrice,
    migrationPrice: getPriceFromSqrtPrice(getMigrationThresholdPrice(curve.config.migrationQuoteThreshold, curve.config.sqrtStartPrice, curve.config.curve), 6, quoteDecimals).toNumber(),
    metrics: { grossQuoteSpent: formatUnits(spent.toString(), quoteDecimals), quoteReturned: formatUnits(returned.toString(), quoteDecimals),
      netQuoteReserve: formatUnits(final.quoteReserveRaw, quoteDecimals), totalQuoteFees: formatUnits(final.feeQuoteRaw, quoteDecimals),
      remainingQuoteToGraduate: formatUnits(remaining.toString(), quoteDecimals), baseReserve: formatUnits(final.baseReserveRaw, 6),
      totalBaseBought: formatUnits(bought.toString(), 6),
      unspentBuyBudget: formatUnits((BigInt(budgetRaw) - spent).toString(), quoteDecimals),
      progressPct: Math.min(100, Number(BigInt(final.quoteReserveRaw)) / Number(threshold) * 100),
      graduationEvent: final.completed ? trades.at(-1)!.index + 1 : null,
      firstBuyPriceChangePct: buys.length ? (buys[0].spotPrice / openingPrice - 1) * 100 : 0,
      cohorts, recovery, finalHoldings: actors.map(actor => ({ actor, baseRaw: simulator.inventory(actor) })) },
  }
}

export function scenarioReport(curves: ControlledCurve[], scenario: ScenarioId, budget: string, quoteAsset: { id: string; mint: string; decimals: number }, generatedAt = new Date().toISOString()) {
  const budgetRaw = parseUnits(budget, quoteAsset.decimals)
  return { format: 'curve-covenant/scenario-v1', generatedAt, engine: 'stateful-dbc-quote-fees-v1', sdkVersion: '1.5.13',
    scenario, quoteAsset, budget, budgetRaw,
    controls: { sameSupply: true, sameOpeningPrice: true, sameQuoteThreshold: true, sameFeeSchedule: true, sameLeftoverTarget: true, leftoverTargetPct: 0.001,
      endpointPriceEqualized: false, thresholdRaw: curves[0].config.migrationQuoteThreshold.toString() },
    assumptions: ['Hypothetical scheduled trades; not observed demand.', 'Quote-token fees, timestamp activation, no dynamic fees or vesting.',
      'Quote USD price and external quote-token liquidity are not modeled.', 'All raw accounting uses integers; display ratios use floating point.',
      'After graduation, later DBC events are not executed. Lower price impact does not imply less early token capture.'],
    curves: curves.map(curve => runScenario(curve, scenario, budgetRaw, quoteAsset.decimals)) }
}
export type ScenarioReport = ReturnType<typeof scenarioReport>
export function tradeOutput(trade: ScenarioTrade, decimals: number) { return formatUnits(trade.outputRaw, trade.side === 'buy' ? 6 : decimals) }

import { expect, it } from 'vitest'
import { ScenarioSimulator } from './scenario-engine'
import { buildStudioConfig, PRESETS, simulateOpeningBuy } from './studio'
import { parseUnits } from './dbc'
import { buildControlledCurves, runScenario, scenarioSchedule } from './scenarios'

const input = { ...PRESETS.steady.values, initialMarketCap: 1, migrationMarketCap: 10 }
const config = buildStudioConfig(input, 8)

it('advances price, reserves and buyer inventory between buys', () => {
  const simulator = new ScenarioSimulator(config, 8)
  const first = simulator.execute({ actor: 'alice', side: 'buy', amountRaw: '10000000', atSeconds: 0 })
  const second = simulator.execute({ actor: 'bob', side: 'buy', amountRaw: '10000000', atSeconds: 60 })
  const opening = simulateOpeningBuy(config, '0.1', 0, 8)
  expect(first.outputRaw).toBe(parseUnits(opening.outputTokens, 6))
  expect(BigInt(second.outputRaw)).toBeLessThan(BigInt(first.outputRaw))
  expect(second.spotPrice).toBeGreaterThan(first.spotPrice)
  expect(second.before).toEqual(first.after)
  expect(BigInt(simulator.snapshot().baseReserveRaw) + BigInt(first.outputRaw) + BigInt(second.outputRaw)).toBe(BigInt(config.tokenSupply!.preMigrationTokenSupply.toString()))
})

it('charges both sides of a round trip and preserves quote/base accounting', () => {
  const simulator = new ScenarioSimulator(config, 8)
  const buy = simulator.execute({ actor: 'alice', side: 'buy', amountRaw: '10000000', atSeconds: 0 })
  const sell = simulator.execute({ actor: 'alice', side: 'sell', amountRaw: buy.outputRaw, atSeconds: 60 })
  expect(BigInt(sell.outputRaw)).toBeLessThan(BigInt(buy.filledInputRaw))
  expect(simulator.inventory('alice')).toBe('0')
  const state = simulator.snapshot()
  expect(BigInt(state.quoteReserveRaw) + BigInt(state.feeQuoteRaw) + BigInt(sell.outputRaw)).toBe(BigInt(buy.filledInputRaw))
  expect(state.baseReserveRaw).toBe(config.tokenSupply!.preMigrationTokenSupply.toString())
})

it('rejects unowned sales and backwards time without changing pool state', () => {
  const simulator = new ScenarioSimulator(config, 8)
  simulator.execute({ actor: 'alice', side: 'buy', amountRaw: '10000000', atSeconds: 60 })
  const before = simulator.snapshot()
  expect(() => simulator.execute({ actor: 'bob', side: 'sell', amountRaw: '1', atSeconds: 61 })).toThrow('hold')
  expect(() => simulator.execute({ actor: 'alice', side: 'buy', amountRaw: '1', atSeconds: 59 })).toThrow('ordered')
  expect(simulator.snapshot()).toEqual(before)
})

it('reports the gross unfilled budget and stops at graduation', () => {
  const simulator = new ScenarioSimulator(config, 8)
  const raw = config.migrationQuoteThreshold.muln(3).toString()
  const trade = simulator.execute({ actor: 'whale', side: 'buy', amountRaw: raw, atSeconds: 0 })
  expect(trade.after.completed).toBe(true)
  expect(BigInt(trade.filledInputRaw) + BigInt(trade.unfilledInputRaw)).toBe(BigInt(raw))
  expect(BigInt(trade.unfilledInputRaw)).toBeGreaterThan(0n)
  expect(() => simulator.execute({ actor: 'whale', side: 'sell', amountRaw: '1', atSeconds: 1 })).toThrow('completed')
})

it('uses elapsed time for the declining fee schedule', () => {
  const decaying = buildStudioConfig({ ...input, startingFeeBps: 300, endingFeeBps: 50, feeDurationHours: 1 }, 8)
  const simulator = new ScenarioSimulator(decaying, 8)
  const first = simulator.execute({ actor: 'alice', side: 'buy', amountRaw: '10000000', atSeconds: 0 })
  const later = simulator.execute({ actor: 'bob', side: 'buy', amountRaw: '10000000', atSeconds: 3600 })
  expect(BigInt(first.tradingFeeRaw) + BigInt(first.protocolFeeRaw)).toBe(300000n)
  expect(BigInt(later.tradingFeeRaw) + BigInt(later.protocolFeeRaw)).toBe(50001n) // The SDK rounds the per-period fee reduction in integer numerator units.
})

it('rejects unsupported fee modes instead of producing approximate results', () => {
  expect(() => new ScenarioSimulator({ ...config, collectFeeMode: 1 }, 8)).toThrow('quote-token')
  expect(() => new ScenarioSimulator({ ...config, enableFirstSwapWithMinFee: true }, 8)).toThrow('discounts')
})

it.each([8, 9])('holds starting conditions and threshold equal for %i quote decimals', decimals => {
  const [baseline, long] = buildControlledCurves(input, decimals)
  expect(long.config.migrationQuoteThreshold.toString()).toBe(baseline.config.migrationQuoteThreshold.toString())
  expect(long.config.sqrtStartPrice.toString()).toBe(baseline.config.sqrtStartPrice.toString())
  expect(long.config.tokenSupply!.preMigrationTokenSupply.toString()).toBe(baseline.config.tokenSupply!.preMigrationTokenSupply.toString())
  expect(long.config.curve.length).toBe(16)
  expect(long.inputs.migrationMarketCap).not.toBe(baseline.inputs.migrationMarketCap)
})

it('allocates identical gross budgets and returns deterministic scenario runs', () => {
  const curve = buildControlledCurves(input, 8)[1]
  for (const id of ['retail', 'whale', 'sell-pressure', 'graduation'] as const) {
    const budget = '300000007'
    const events = scenarioSchedule(id, budget)
    expect(events.reduce((sum, e) => sum + BigInt(e.amountRaw), 0n)).toBe(BigInt(budget))
    const result = runScenario(curve, id, budget, 8)
    expect(result).toEqual(runScenario(curve, id, budget, 8))
    if (id === 'sell-pressure') expect(result.trades.some(t => t.side === 'sell')).toBe(true)
  }
})

it('rejects dust swaps that cannot execute with a nonzero output', () => {
  const simulator = new ScenarioSimulator(config, 8)
  simulator.execute({ actor: 'alice', side: 'buy', amountRaw: '10000000', atSeconds: 0 })
  const before = simulator.snapshot()
  expect(() => simulator.execute({ actor: 'alice', side: 'sell', amountRaw: '1', atSeconds: 1 })).toThrow('nonzero output')
  expect(simulator.snapshot()).toEqual(before)
})

it.each(Object.keys(PRESETS) as (keyof typeof PRESETS)[])('can compare both shapes using %s preset terms', preset => {
  const [baseline, long] = buildControlledCurves(PRESETS[preset].values, 8)
  expect(long.config.sqrtStartPrice.toString()).toBe(baseline.config.sqrtStartPrice.toString())
  expect(long.config.migrationQuoteThreshold.toString()).toBe(baseline.config.migrationQuoteThreshold.toString())
})

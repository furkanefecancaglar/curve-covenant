import BN from 'bn.js'
import { ActivationType, CollectFeeMode, BaseFeeMode, getMigrationThresholdPrice, getPriceFromSqrtPrice, swapQuotePartialFill } from '@meteora-ag/dynamic-bonding-curve-sdk'
import type { ConfigParameters, PoolConfig, VirtualPool } from '@meteora-ag/dynamic-bonding-curve-sdk'

export type ScenarioEvent = { actor: string; side: 'buy' | 'sell'; amountRaw: string; atSeconds: number }
export type ScenarioSnapshot = { sqrtPriceRaw: string; baseReserveRaw: string; quoteReserveRaw: string; feeQuoteRaw: string; completed: boolean }
export type ScenarioTrade = ScenarioEvent & {
  index: number; filledInputRaw: string; unfilledInputRaw: string; outputRaw: string
  tradingFeeRaw: string; protocolFeeRaw: string; before: ScenarioSnapshot; after: ScenarioSnapshot
  spotPrice: number; averageCost: number; actorBaseRaw: string
}
const U64_MAX = new BN('18446744073709551615')

function amount(raw: string): BN {
  if (!/^\d+$/.test(raw)) throw new Error('Scenario amounts must be positive integer base units.')
  const value = new BN(raw)
  if (value.lten(0) || value.gt(U64_MAX)) throw new Error('Scenario amount is outside the u64 range.')
  return value
}

// Only the product's supported fee/activation modes are modeled. Never silently
// approximate dynamic fees, output-token fees, vesting or first-swap discounts.
export function scenarioQuoteConfig(config: ConfigParameters): PoolConfig {
  if (config.collectFeeMode !== CollectFeeMode.QuoteToken) throw new Error('Scenarios require quote-token fees.')
  if (config.activationType !== ActivationType.Timestamp) throw new Error('Scenarios require timestamp activation.')
  if (config.poolFees.dynamicFee) throw new Error('Dynamic fees are not supported by this scenario engine.')
  if (config.poolFees.baseFee.baseFeeMode !== BaseFeeMode.FeeSchedulerLinear) throw new Error('Scenarios require a linear fee schedule.')
  if (config.enableFirstSwapWithMinFee) throw new Error('First-swap fee discounts are not supported.')
  if (!config.tokenSupply || !config.lockedVesting.cliffUnlockAmount.isZero() || !config.lockedVesting.amountPerPeriod.isZero()) {
    throw new Error('Scenarios require a fixed supply without vesting.')
  }
  return { ...config,
    migrationSqrtPrice: getMigrationThresholdPrice(config.migrationQuoteThreshold, config.sqrtStartPrice, config.curve),
    poolFees: { ...config.poolFees, dynamicFee: { initialized: 0, binStep: 0, variableFeeControl: 0 } },
  } as unknown as PoolConfig
}

export class ScenarioSimulator {
  private readonly config: PoolConfig
  private readonly pool: VirtualPool
  private readonly holdings = new Map<string, BN>()
  private fees = new BN(0)
  private lastSeconds = 0
  readonly trades: ScenarioTrade[] = []
  constructor(config: ConfigParameters, readonly quoteDecimals: number) {
    if (!Number.isInteger(quoteDecimals) || quoteDecimals < 6 || quoteDecimals > 9) throw new Error('Unsupported quote decimals.')
    this.config = scenarioQuoteConfig(config)
    this.pool = { poolState: {
      sqrtPrice: config.sqrtStartPrice.clone(), baseReserve: config.tokenSupply!.preMigrationTokenSupply.clone(), quoteReserve: new BN(0),
      activationPoint: new BN(0), volatilityTracker: { lastUpdateTimestamp: new BN(0), sqrtPriceReference: new BN(0),
        volatilityAccumulator: new BN(0), volatilityReference: new BN(0), padding: [] },
    } } as unknown as VirtualPool
  }
  snapshot(): ScenarioSnapshot {
    const state = this.pool.poolState
    return { sqrtPriceRaw: state.sqrtPrice.toString(), baseReserveRaw: state.baseReserve.toString(),
      quoteReserveRaw: state.quoteReserve.toString(), feeQuoteRaw: this.fees.toString(),
      completed: state.quoteReserve.gte(this.config.migrationQuoteThreshold) }
  }
  inventory(actor: string): string { return (this.holdings.get(actor) ?? new BN(0)).toString() }
  execute(event: ScenarioEvent): ScenarioTrade {
    if (!event.actor.trim()) throw new Error('A scenario actor is required.')
    if (event.side !== 'buy' && event.side !== 'sell') throw new Error('Invalid trade direction.')
    if (!Number.isSafeInteger(event.atSeconds) || event.atSeconds < this.lastSeconds || event.atSeconds > 720 * 3600) {
      throw new Error('Event times must be ordered integer seconds within 720 hours.')
    }
    const input = amount(event.amountRaw)
    const before = this.snapshot()
    if (before.completed) throw new Error('The pool has completed; subsequent DBC trades are not allowed.')
    const held = this.holdings.get(event.actor) ?? new BN(0)
    const selling = event.side === 'sell'
    if (selling && input.gt(held)) throw new Error('A scenario actor cannot sell more base tokens than they hold.')
    const quote = swapQuotePartialFill(this.pool, this.config, selling, input, 0, false, new BN(event.atSeconds), false)
    if (quote.outputAmount.isZero() || quote.includedFeeInputAmount.isZero()) throw new Error('Trade is too small to produce a nonzero output.')
    const fee = quote.tradingFee.add(quote.protocolFee).add(quote.referralFee)
    const state = this.pool.poolState
    const baseReserve = selling ? state.baseReserve.add(quote.excludedFeeInputAmount) : state.baseReserve.sub(quote.outputAmount)
    const quoteReserve = selling ? state.quoteReserve.sub(quote.outputAmount.add(fee)) : state.quoteReserve.add(quote.excludedFeeInputAmount)
    if (baseReserve.isNeg() || quoteReserve.isNeg()) throw new Error('Swap would create a negative pool reserve.')
    const actorBase = selling ? held.sub(quote.includedFeeInputAmount) : held.add(quote.outputAmount)
    if (actorBase.isNeg()) throw new Error('Swap would create negative actor inventory.')
    if (quote.includedFeeInputAmount.gt(input)) throw new Error('Swap exceeded its input budget.')
    state.baseReserve = baseReserve; state.quoteReserve = quoteReserve; state.sqrtPrice = quote.nextSqrtPrice.clone()
    this.holdings.set(event.actor, actorBase); this.fees = this.fees.add(fee); this.lastSeconds = event.atSeconds
    const baseScale = 10 ** this.config.tokenDecimal
    const quoteScale = 10 ** this.quoteDecimals
    const baseAmount = Number((selling ? quote.includedFeeInputAmount : quote.outputAmount).toString()) / baseScale
    const quoteAmount = Number((selling ? quote.outputAmount : quote.includedFeeInputAmount).toString()) / quoteScale
    const trade: ScenarioTrade = { ...event, index: this.trades.length,
      filledInputRaw: quote.includedFeeInputAmount.toString(), unfilledInputRaw: input.sub(quote.includedFeeInputAmount).toString(),
      outputRaw: quote.outputAmount.toString(), tradingFeeRaw: quote.tradingFee.toString(), protocolFeeRaw: quote.protocolFee.toString(),
      before, after: this.snapshot(), spotPrice: getPriceFromSqrtPrice(state.sqrtPrice, this.config.tokenDecimal, this.quoteDecimals).toNumber(),
      averageCost: baseAmount > 0 ? quoteAmount / baseAmount : 0, actorBaseRaw: actorBase.toString() }
    this.trades.push(trade)
    return trade
  }
}

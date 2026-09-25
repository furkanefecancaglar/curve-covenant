import {
  ActivationType, BaseFeeMode, CollectFeeMode,
  MigrationFeeOption, MigrationOption,
  TokenAuthorityOption, TokenDecimal, TokenType,
  DynamicBondingCurveClient, SwapMode, buildCurveWithLiquidityWeights, buildCurveWithMarketCap, buildCurveWithTwoSegments, validateConfigParameters, getPriceFromSqrtPrice,
} from '@meteora-ag/dynamic-bonding-curve-sdk'
import type { ConfigParameters } from '@meteora-ag/dynamic-bonding-curve-sdk'
import type { BuildCurveBaseParams } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { PublicKey } from '@solana/web3.js'
import { Connection } from '@solana/web3.js'
import BN from 'bn.js'
import { formatUnits, parseUnits } from './dbc'

export type PresetId = 'steady' | 'discovery' | 'momentum' | 'long'
export type StudioInputs = {
  preset: PresetId
  supply: number
  initialMarketCap: number
  migrationMarketCap: number
  startingFeeBps: number
  endingFeeBps: number
  feeDurationHours: number
  creatorFeeSharePct: number
  partnerLockedPct: number
}

export const PRESETS: Record<PresetId, { name: string; audience: string; thesis: string; values: StudioInputs }> = {
  steady: {
    name: 'Steady launch', audience: 'Community assets',
    thesis: 'A single segment, fixed trading fee and permanently locked post-graduation liquidity.',
    values: { preset: 'steady', supply: 1_000_000_000, initialMarketCap: 100, migrationMarketCap: 10_000,
      startingFeeBps: 100, endingFeeBps: 100, feeDurationHours: 0, creatorFeeSharePct: 0, partnerLockedPct: 100 },
  },
  discovery: {
    name: 'Measured discovery', audience: 'Thin markets',
    thesis: 'A higher opening fee decays over time while the curve graduates into DAMM v2.',
    values: { preset: 'discovery', supply: 1_000_000_000, initialMarketCap: 50, migrationMarketCap: 25_000,
      startingFeeBps: 300, endingFeeBps: 50, feeDurationHours: 24, creatorFeeSharePct: 20, partnerLockedPct: 100 },
  },
  momentum: {
    name: 'Two-stage momentum', audience: 'High-conviction launches',
    thesis: 'Two curve segments change price discovery halfway to migration; a time schedule reduces trading fees.',
    values: { preset: 'momentum', supply: 1_000_000_000, initialMarketCap: 100, migrationMarketCap: 50_000,
      startingFeeBps: 200, endingFeeBps: 50, feeDurationHours: 12, creatorFeeSharePct: 10, partnerLockedPct: 100 },
  },
  long: {
    name: 'Long discovery curve', audience: 'Stock-quoted launches',
    thesis: 'Sixteen price segments with more liquidity near the opening range to slow early price movement.',
    values: { preset: 'long', supply: 1_000_000_000, initialMarketCap: 100, migrationMarketCap: 50_000,
      startingFeeBps: 150, endingFeeBps: 50, feeDurationHours: 24, creatorFeeSharePct: 10, partnerLockedPct: 100 },
  },
}

function finiteRange(value: number, min: number, max: number, label: string): void {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${label} must be between ${min} and ${max}.`)
}

export function buildStudioConfig(input: StudioInputs, quoteDecimals = 9): ConfigParameters {
  finiteRange(input.supply, 1_000_000, 1_000_000_000_000, 'Token supply')
  finiteRange(input.initialMarketCap, 1, 1_000_000_000, 'Initial market cap')
  finiteRange(input.migrationMarketCap, input.initialMarketCap * 1.01, 10_000_000_000, 'Migration market cap')
  finiteRange(input.startingFeeBps, 1, 1000, 'Opening trading fee')
  finiteRange(input.endingFeeBps, 1, input.startingFeeBps, 'Final trading fee')
  finiteRange(input.feeDurationHours, 0, 720, 'Fee duration')
  finiteRange(input.creatorFeeSharePct, 0, 100, 'Creator fee share')
  finiteRange(input.partnerLockedPct, 10, 100, 'Permanently locked liquidity')
  if (!Number.isInteger(input.supply)) throw new Error('Token supply must be a whole number.')
  if (!Number.isInteger(quoteDecimals) || quoteDecimals < 6 || quoteDecimals > 9) throw new Error('Unsupported quote token precision.')
  if (input.startingFeeBps !== input.endingFeeBps && input.feeDurationHours === 0) {
    throw new Error('A changing fee needs a positive duration.')
  }

  const feeChanges = input.startingFeeBps === input.endingFeeBps ? 0 : 12
  const common: BuildCurveBaseParams = {
    token: { tokenType: TokenType.SPLToken, tokenBaseDecimal: TokenDecimal.SIX,
      tokenQuoteDecimal: quoteDecimals, tokenAuthorityOption: TokenAuthorityOption.Immutable,
      totalTokenSupply: input.supply, leftover: input.preset === 'momentum' ? Math.floor(input.supply * 0.35) : Math.floor(input.supply * 0.00001) },
    fee: { baseFeeParams: { baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
      feeSchedulerParam: { startingFeeBps: input.startingFeeBps, endingFeeBps: input.endingFeeBps,
        numberOfPeriod: feeChanges, totalDuration: input.feeDurationHours * 3600 } },
      dynamicFeeEnabled: false, collectFeeMode: CollectFeeMode.QuoteToken,
      creatorTradingFeePercentage: input.creatorFeeSharePct, poolCreationFee: 0,
      enableFirstSwapWithMinFee: false },
    migration: { migrationOption: MigrationOption.MET_DAMM_V2,
      migrationFeeOption: MigrationFeeOption.FixedBps100,
      migrationFee: { feePercentage: 0, creatorFeePercentage: 0 } },
    liquidityDistribution: { partnerLiquidityPercentage: 100 - input.partnerLockedPct,
      partnerPermanentLockedLiquidityPercentage: input.partnerLockedPct,
      creatorLiquidityPercentage: 0, creatorPermanentLockedLiquidityPercentage: 0 },
    lockedVesting: { totalLockedVestingAmount: 0, numberOfVestingPeriod: 0, cliffUnlockAmount: 0,
      totalVestingDuration: 0, cliffDurationFromMigrationTime: 0 },
    activationType: ActivationType.Timestamp,
  }
  const marketCaps = { initialMarketCap: input.initialMarketCap, migrationMarketCap: input.migrationMarketCap }
  const result = input.preset === 'momentum'
    ? buildCurveWithTwoSegments({ ...common, ...marketCaps, percentageSupplyOnMigration: 20 })
    : input.preset === 'long'
      ? buildCurveWithLiquidityWeights({ ...common, ...marketCaps,
        liquidityWeights: [4, 4, 4, 3.5, 3.5, 3, 3, 2.5, 2.5, 2, 2, 1.5, 1.5, 1, 1, 1] })
      : buildCurveWithMarketCap({ ...common, ...marketCaps })
  // The receiver is replaced with the connected wallet at transaction time.
  validateConfigParameters({ ...result, leftoverReceiver: new PublicKey('So11111111111111111111111111111111111111112') })
  return result
}

export function studioSummary(config: ConfigParameters, quoteDecimals = 9) {
  return {
    migrationQuoteThreshold: Number(config.migrationQuoteThreshold.toString()) / 10 ** quoteDecimals,
    curveSegments: config.curve.length,
    migration: 'Meteora DAMM v2',
  }
}

export function simulateOpeningBuy(config: ConfigParameters, amountQuote: string, elapsedHours = 0, quoteDecimals = 9) {
  if (!Number.isFinite(elapsedHours) || elapsedHours < 0 || elapsedHours > 720) throw new Error('Elapsed time must be between 0 and 720 hours.')
  const client = DynamicBondingCurveClient.create(new Connection('https://api.devnet.solana.com'))
  const quote = client.pool.getQuoteFromInputAmount({
    config, swapBaseForQuote: false, amountIn: new BN(parseUnits(amountQuote, quoteDecimals)),
    swapMode: SwapMode.PartialFill, slippageBps: 100,
    currentPoint: new BN(Math.floor(elapsedHours * 3600)),
  })
  return {
    outputTokens: formatUnits(quote.outputAmount.toString(), 6),
    minimumTokens: formatUnits(quote.minimumAmountOut!.toString(), 6),
    tradingFeeQuote: formatUnits(quote.tradingFee.toString(), quoteDecimals),
    totalFeeQuote: formatUnits(quote.tradingFee.add(quote.protocolFee).add(quote.referralFee).toString(), quoteDecimals),
    unfilledQuote: formatUnits(quote.amountLeft.toString(), quoteDecimals),
  }
}

export function sampleLaunchCurve(config: ConfigParameters, supply: number, quoteDecimals = 9) {
  const client = DynamicBondingCurveClient.create(new Connection('https://api.devnet.solana.com'))
  const samples = [{ quoteReserve: 0, marketCap: getPriceFromSqrtPrice(config.sqrtStartPrice, 6, quoteDecimals).mul(supply).toNumber() }]
  // Budget includes the opening fee; PartialFill caps the final sample at graduation.
  const feeNumerator = config.poolFees.baseFee.cliffFeeNumerator
  const grossThreshold = config.migrationQuoteThreshold.mul(new BN(1_000_000_000))
    .div(new BN(1_000_000_000).sub(feeNumerator)).addn(1)
  for (let step = 1; step <= 32; step++) {
    const quote = client.pool.getQuoteFromInputAmount({ config, swapBaseForQuote: false,
      amountIn: grossThreshold.muln(step).divn(32), swapMode: SwapMode.PartialFill, currentPoint: new BN(0) })
    samples.push({ quoteReserve: Number(quote.excludedFeeInputAmount.toString()) / 10 ** quoteDecimals,
      marketCap: getPriceFromSqrtPrice(quote.nextSqrtPrice, 6, quoteDecimals).mul(supply).toNumber() })
  }
  return samples
}

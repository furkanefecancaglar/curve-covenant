import { Connection, PublicKey } from '@solana/web3.js'
import { DynamicBondingCurveClient, FEE_DENOMINATOR, getCurrentPoint, SwapMode } from '@meteora-ag/dynamic-bonding-curve-sdk'
import type { PoolConfig, VirtualPool } from '@meteora-ag/dynamic-bonding-curve-sdk'
import BN from 'bn.js'

export const DBC_PROGRAM = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN'
export type Network = 'mainnet-beta' | 'devnet'
export const RPC: Record<Network, string> = {
  'mainnet-beta': 'https://solana-rpc.publicnode.com',
  devnet: 'https://api.devnet.solana.com',
}

export type LaunchData = {
  network: Network
  address: string
  kind: 'pool' | 'config'
  poolAddress?: string
  configAddress: string
  fetchedAt: string
  slot: number
  quoteMint: string
  quoteDecimals: number
  quoteSymbol: string
  baseMint?: string
  creator?: string
  feeClaimer: string
  leftoverReceiver: string
  initialTradingFeePct: number
  feeMode: string
  dynamicFeeEnabled: boolean
  creatorFeeSharePct: number
  migrationTarget: string
  migrationQuoteThresholdRaw: string
  migrationQuoteThreshold: string
  currentQuoteReserveRaw?: string
  currentQuoteReserve?: string
  graduationProgress?: number
  migrated?: boolean
  partnerLiquidityPct: number
  creatorLiquidityPct: number
  partnerPermanentLockPct: number
  creatorPermanentLockPct: number
  fixedSupply: boolean
  tokenAuthority: string
  tokenType: string
  poolCreationFeeRaw: string
  migrationFeePct: number
  creatorMigrationFeePct: number
  raw: Record<string, unknown>
}

export function formatUnits(raw: string, decimals: number): string {
  const n = BigInt(raw)
  const scale = 10n ** BigInt(decimals)
  const whole = n / scale
  const fraction = (n % scale).toString().padStart(decimals, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole.toString()
}

export function parseUnits(input: string, decimals: number): string {
  if (!/^\d+(\.\d+)?$/.test(input.trim())) throw new Error('Enter a positive decimal amount.')
  const [whole, fraction = ''] = input.trim().split('.')
  if (fraction.length > decimals) throw new Error(`This quote asset supports at most ${decimals} decimal places.`)
  const raw = BigInt(whole) * 10n ** BigInt(decimals) + BigInt((fraction || '0').padEnd(decimals, '0'))
  if (raw <= 0n) throw new Error('Amount must be greater than zero.')
  if (raw > 18446744073709551615n) throw new Error('Amount exceeds the DBC input limit.')
  return raw.toString()
}

export type BuyQuote = {
  input: string
  quoteSymbol: string
  estimatedTokens: string
  minimumTokens: string
  baseDecimals: number
  tradingFee: string
  protocolFee: string
  feeAsset: string
  unfilledInput: string
  slippageBps: number
  fetchedAt: string
}

export async function quoteBuy(launch: LaunchData, amount: string, endpoint = RPC[launch.network]): Promise<BuyQuote> {
  if (!launch.poolAddress || !launch.baseMint) throw new Error('A live pool is required to quote a trade.')
  if (launch.migrated) throw new Error('This pool has migrated; DBC quotes no longer apply.')
  const amountRaw = parseUnits(amount, launch.quoteDecimals)
  const connection = new Connection(endpoint, 'confirmed')
  const client = DynamicBondingCurveClient.create(connection, 'confirmed')
  const pool = await client.state.getPool(launch.poolAddress)
  if (!pool) throw new Error('Pool could not be read.')
  const config = await client.state.getPoolConfig(pool.poolState.config)
  if (!config) throw new Error('Pool config could not be read.')
  const baseDecimals = await decimalsFor(connection, new PublicKey(launch.baseMint))
  const currentPoint = await getCurrentPoint(connection, config.activationType)
  const slippageBps = 100
  const quote = client.pool.swapQuote2({
    virtualPool: pool, config, swapBaseForQuote: false, swapMode: SwapMode.PartialFill,
    amountIn: new BN(amountRaw), hasReferral: false, eligibleForFirstSwapWithMinFee: false,
    currentPoint, slippageBps,
  })
  const feeInBase = config.collectFeeMode === 1
  return {
    input: amount, quoteSymbol: launch.quoteSymbol,
    estimatedTokens: formatUnits(quote.outputAmount.toString(), baseDecimals),
    minimumTokens: formatUnits(quote.minimumAmountOut!.toString(), baseDecimals),
    baseDecimals,
    tradingFee: formatUnits(quote.tradingFee.toString(), feeInBase ? baseDecimals : launch.quoteDecimals),
    protocolFee: formatUnits(quote.protocolFee.toString(), feeInBase ? baseDecimals : launch.quoteDecimals),
    feeAsset: feeInBase ? 'base tokens' : launch.quoteSymbol,
    unfilledInput: formatUnits(quote.amountLeft.toString(), launch.quoteDecimals),
    slippageBps, fetchedAt: new Date().toISOString(),
  }
}

export function toPlain(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof PublicKey) return value.toBase58()
  if (Array.isArray(value)) return value.map(toPlain)
  if (typeof value === 'object') {
    if ('toArrayLike' in value && typeof (value as { toString?: unknown }).toString === 'function') return String(value)
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toPlain(item)]))
  }
  return value
}

function authorityName(value: number): string {
  return [
    'Creator can update metadata', 'Immutable metadata', 'Partner can update metadata',
    'Creator retains mint + metadata authority', 'Partner retains mint + metadata authority',
  ][value] ?? `Unknown (${value})`
}

async function decimalsFor(connection: Connection, mint: PublicKey): Promise<number> {
  if (mint.toBase58() === 'So11111111111111111111111111111111111111112') return 9
  const account = await connection.getParsedAccountInfo(mint, 'confirmed')
  const data = account.value?.data
  if (data && typeof data === 'object' && 'parsed' in data) {
    const decimals = (data.parsed as { info?: { decimals?: number } }).info?.decimals
    if (typeof decimals === 'number') return decimals
  }
  throw new Error('Quote mint decimals could not be verified from chain.')
}

function symbolFor(mint: string): string {
  if (mint === 'So11111111111111111111111111111111111111112') return 'SOL'
  if (mint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') return 'USDC'
  return 'quote tokens'
}

export async function loadLaunch(address: string, network: Network, endpoint = RPC[network]): Promise<LaunchData> {
  const key = new PublicKey(address.trim())
  const connection = new Connection(endpoint, 'confirmed')
  const accountInfo = await connection.getAccountInfo(key, 'confirmed')
  if (!accountInfo) throw new Error('No account exists at this address on the selected network.')
  if (accountInfo.owner.toBase58() !== DBC_PROGRAM) throw new Error('This account is not owned by Meteora DBC.')

  const client = DynamicBondingCurveClient.create(connection, 'confirmed')
  let pool: VirtualPool | null = null
  let config: PoolConfig | null = null
  try { pool = await client.state.getPool(key) } catch { /* Try as config below. */ }
  const configKey = pool?.poolState.config ?? key
  try { config = await client.state.getPoolConfig(configKey) } catch { /* Handled below. */ }
  if (!config) throw new Error('DBC account was found, but it is neither a supported pool nor a config.')

  const quoteMint = config.quoteMint.toBase58()
  const quoteDecimals = await decimalsFor(connection, config.quoteMint)
  const slot = await connection.getSlot('confirmed')
  const fee = Number(config.poolFees.baseFee.cliffFeeNumerator.toString()) / FEE_DENOMINATOR * 100
  const thresholdRaw = config.migrationQuoteThreshold.toString()
  const reserveRaw = pool?.poolState.quoteReserve.toString()
  const progress = reserveRaw && BigInt(thresholdRaw) > 0n
    ? Math.min(100, Number(BigInt(reserveRaw) * 10000n / BigInt(thresholdRaw)) / 100)
    : undefined

  return {
    network, address: key.toBase58(), kind: pool ? 'pool' : 'config',
    poolAddress: pool ? key.toBase58() : undefined, configAddress: configKey.toBase58(),
    fetchedAt: new Date().toISOString(), slot,
    quoteMint, quoteDecimals, quoteSymbol: symbolFor(quoteMint),
    baseMint: pool?.poolState.baseMint.toBase58(), creator: pool?.poolState.creator.toBase58(),
    feeClaimer: config.feeClaimer.toBase58(), leftoverReceiver: config.leftoverReceiver.toBase58(),
    initialTradingFeePct: fee,
    feeMode: ['Linear schedule', 'Exponential schedule', 'Rate limiter'][config.poolFees.baseFee.baseFeeMode] ?? `Mode ${config.poolFees.baseFee.baseFeeMode}`,
    dynamicFeeEnabled: config.poolFees.dynamicFee.initialized === 1,
    creatorFeeSharePct: config.creatorTradingFeePercentage,
    migrationTarget: config.migrationOption === 1 ? 'Meteora DAMM v2' : 'Meteora DAMM v1 (legacy)',
    migrationQuoteThresholdRaw: thresholdRaw,
    migrationQuoteThreshold: formatUnits(thresholdRaw, quoteDecimals),
    currentQuoteReserveRaw: reserveRaw,
    currentQuoteReserve: reserveRaw ? formatUnits(reserveRaw, quoteDecimals) : undefined,
    graduationProgress: progress, migrated: pool ? pool.poolState.isMigrated === 1 : undefined,
    partnerLiquidityPct: config.partnerLiquidityPercentage,
    creatorLiquidityPct: config.creatorLiquidityPercentage,
    partnerPermanentLockPct: config.partnerPermanentLockedLiquidityPercentage,
    creatorPermanentLockPct: config.creatorPermanentLockedLiquidityPercentage,
    fixedSupply: config.fixedTokenSupplyFlag === 1,
    tokenAuthority: authorityName(config.tokenUpdateAuthority),
    tokenType: config.tokenType === 1 ? 'Token-2022' : 'SPL Token',
    poolCreationFeeRaw: config.poolCreationFee.toString(),
    migrationFeePct: config.migrationFeePercentage,
    creatorMigrationFeePct: config.creatorMigrationFeePercentage,
    raw: { config: toPlain(config), pool: toPlain(pool) } as Record<string, unknown>,
  }
}

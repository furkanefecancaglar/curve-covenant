import { Connection, PublicKey } from '@solana/web3.js'
import { DAMM_V2_MIGRATION_FEE_ADDRESS, DAMM_V2_PROGRAM_ID, deriveDammV2PoolAddress,
  deriveDammV2TokenVaultAddress, DynamicBondingCurveClient, createDammV2Program } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { formatUnits, RPC } from './dbc'
import type { Network } from './dbc'
import { connectWallet, sendWalletTransaction } from './wallet'
import { reviewTransaction } from './transaction-review'
import type { TransactionReview } from './transaction-review'
import { TransactionOutcomeError } from './confirmation'
import type { TransactionAttempt } from './confirmation'
import { loadPendingMigration, savePendingMigration, removePendingMigration } from './pending-migration'

export async function readLifecycle(address: string, network: Network, endpoint = RPC[network]) {
  const connection = new Connection(endpoint, 'confirmed')
  const pool = new PublicKey(address.trim())
  const client = DynamicBondingCurveClient.create(connection, 'confirmed')
  const state = await client.state.getPool(pool)
  if (!state) throw new Error('DBC pool not found on this network.')
  const config = await client.state.getPoolConfig(state.poolState.config)
  if (!config) throw new Error('DBC configuration not found.')
  if (config.migrationOption !== 1) throw new Error('This pool targets DAMM v1. Select a DAMM v2 launch.')
  const dammConfig = DAMM_V2_MIGRATION_FEE_ADDRESS[config.migrationFeeOption]
  if (!dammConfig) throw new Error('Unsupported DAMM v2 migration configuration.')
  const migrationConfig = await createDammV2Program(connection).account.config.fetch(dammConfig)
  const baseFeeBytes = migrationConfig.poolFees.baseFee.data.slice(0, 8)
  const baseFeeNumerator = baseFeeBytes.reduce((sum, value, index) => sum + BigInt(value) * (256n ** BigInt(index)), 0n)
  const destinationFees = config.migrationFeeOption === 6
    ? { baseFeePct: config.migratedPoolFeeBps / 100, dynamicEnabled: config.migratedDynamicFee !== 0 }
    : { baseFeePct: Number(baseFeeNumerator) / 10_000_000, dynamicEnabled: migrationConfig.poolFees.dynamicFee.initialized !== 0 }
  const quoteSupply = await connection.getTokenSupply(config.quoteMint)
  const dammPool = deriveDammV2PoolAddress(dammConfig, state.poolState.baseMint, config.quoteMint)
  const migrated = state.poolState.isMigrated === 1
  const threshold = config.migrationQuoteThreshold
  const reserve = state.poolState.quoteReserve
  let reserves: { base: string; quote: string } | null = null
  if (migrated) {
    const account = await connection.getAccountInfo(dammPool)
    if (!account?.owner.equals(DAMM_V2_PROGRAM_ID)) throw new Error('Graduated DAMM v2 account could not be verified.')
    const [base, quote] = await Promise.all([
      connection.getTokenAccountBalance(deriveDammV2TokenVaultAddress(dammPool, state.poolState.baseMint)),
      connection.getTokenAccountBalance(deriveDammV2TokenVaultAddress(dammPool, config.quoteMint)),
    ])
    reserves = { base: base.value.uiAmountString!, quote: quote.value.uiAmountString! }
  }
  return { address: pool.toBase58(), network, baseMint: state.poolState.baseMint.toBase58(), quoteMint: config.quoteMint.toBase58(),
    dammConfig: dammConfig.toBase58(), dammPool: dammPool.toBase58(), migrated,
    ready: !migrated && reserve.gte(threshold), reserves, destinationFees,
    progress: migrated ? 100 : Math.min(100, Number(reserve.muln(10000).div(threshold).toString()) / 100),
    reserve: formatUnits(reserve.toString(), quoteSupply.value.decimals),
    threshold: formatUnits(threshold.toString(), quoteSupply.value.decimals), fetchedAt: new Date().toISOString() }
}

export type PreparedGraduation = {
  address: string; network: Network; payer: PublicKey
  migration: Awaited<ReturnType<DynamicBondingCurveClient['migration']['migrateToDammV2']>>
  review: TransactionReview
}

export class MigrationSubmittedError extends Error {
  signature: string
  attempt?: TransactionAttempt
  constructor(signature: string, issue: unknown, attempt?: TransactionAttempt) {
    super(`Migration status needs checking. Read the pool before retrying. ${issue instanceof Error ? issue.message : String(issue)}`)
    this.signature = signature; this.attempt = attempt
  }
}

export async function prepareGraduation(address: string, network: Network): Promise<PreparedGraduation> {
  const status = await readLifecycle(address, network)
  if (status.migrated) throw new Error('This pool has already graduated.')
  if (!status.ready) throw new Error('The DBC quote reserve has not reached its graduation threshold.')
  const connection = new Connection(RPC[network], 'confirmed')
  const { publicKey: payer } = await connectWallet()
  const client = DynamicBondingCurveClient.create(connection, 'confirmed')
  const migration = await client.migration.migrateToDammV2({ pool: new PublicKey(address),
    dammConfig: new PublicKey(status.dammConfig), payer })
  return { address, network, payer, migration, review: await reviewTransaction(connection, payer, migration.transaction) }
}

export async function graduatePrepared(prepared: PreparedGraduation) {
  const { address, network, migration } = prepared
  const existing = loadPendingMigration(address, network)
  if (existing) throw new MigrationSubmittedError(existing.signature, new Error('A previous transaction still needs checking.'), existing)
  const { wallet, publicKey: payer } = await connectWallet()
  if (!payer.equals(prepared.payer)) throw new Error('Your Phantom account changed. Check the graduation cost again with the account you want to use.')
  const connection = new Connection(RPC[network], 'confirmed')
  const fresh = await reviewTransaction(connection, payer, migration.transaction)
  if (fresh.estimatedDebitLamports > prepared.review.estimatedDebitLamports) throw new Error('The estimated graduation cost increased. Check the cost again before signing.')
  let submitted = ''
  let attempt: TransactionAttempt | undefined
  try {
    const signature = await sendWalletTransaction(connection, wallet, payer, migration.transaction,
      [migration.firstPositionNftKeypair, migration.secondPositionNftKeypair], (value, context) => {
        const prior = loadPendingMigration(address, network)
        if (prior) throw new MigrationSubmittedError(prior.signature, new Error('Another tab started this migration.'), prior)
        try { savePendingMigration(address, network, context) }
        catch { throw new Error('This browser could not save the migration receipt. Allow site storage before signing again.') }
        submitted = value; attempt = context
      })
    submitted = signature
    const status = await readLifecycle(address, network)
    if (status.migrated) removePendingMigration(address, network, signature)
    return { signature, status }
  } catch (issue) {
    if (issue instanceof TransactionOutcomeError && issue.state !== 'pending') { removePendingMigration(address, network, issue.attempt.signature); throw issue }
    if (submitted) throw new MigrationSubmittedError(submitted, issue, attempt)
    throw issue
  }
}

export async function graduatePool(address: string, network: Network) {
  return graduatePrepared(await prepareGraduation(address, network))
}

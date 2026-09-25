import { Connection, PublicKey } from '@solana/web3.js'
import { DAMM_V2_MIGRATION_FEE_ADDRESS, DAMM_V2_PROGRAM_ID, deriveDammV2PoolAddress,
  deriveDammV2TokenVaultAddress, DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { formatUnits, RPC } from './dbc'
import type { Network } from './dbc'
import { connectWallet, sendWalletTransaction } from './wallet'

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
    ready: !migrated && reserve.gte(threshold), reserves,
    progress: migrated ? 100 : Math.min(100, Number(reserve.muln(10000).div(threshold).toString()) / 100),
    reserve: formatUnits(reserve.toString(), quoteSupply.value.decimals),
    threshold: formatUnits(threshold.toString(), quoteSupply.value.decimals), fetchedAt: new Date().toISOString() }
}

export async function graduatePool(address: string, network: Network) {
  const status = await readLifecycle(address, network)
  if (status.migrated) throw new Error('This pool has already graduated.')
  if (!status.ready) throw new Error('The DBC quote reserve has not reached its graduation threshold.')
  const connection = new Connection(RPC[network], 'confirmed')
  const { wallet, publicKey: payer } = await connectWallet()
  const client = DynamicBondingCurveClient.create(connection, 'confirmed')
  const result = await client.migration.migrateToDammV2({ pool: new PublicKey(address),
    dammConfig: new PublicKey(status.dammConfig), payer })
  const signature = await sendWalletTransaction(connection, wallet, payer, result.transaction,
    [result.firstPositionNftKeypair, result.secondPositionNftKeypair])
  return { signature, status: await readLifecycle(address, network) }
}

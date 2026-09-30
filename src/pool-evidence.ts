import { Connection, PublicKey } from '@solana/web3.js'
import { loadLaunch, RPC } from './dbc'
import type { Network } from './dbc'
import { readLifecycle } from './lifecycle'
import { MAINNET_GENESIS, transactionHistoryConnection } from './rpc-history'
import { rpcDeadline } from './rpc-timeout'

const GENESIS: Record<Network, string> = {
  devnet: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
  'mainnet-beta': MAINNET_GENESIS,
}
export function evidenceNetwork(genesis: string) {
  return genesis === GENESIS.devnet ? 'public-devnet' : genesis === GENESIS['mainnet-beta'] ? 'mainnet-beta' : 'unrecognized-network'
}
function unavailable(issue: unknown): string {
  const message = issue instanceof Error ? issue.message : ''
  if (/\b429\b|too many requests/i.test(message)) return 'RPC rate limit: retry the export later.'
  if (/\b(?:403|401)\b|access|personal token/i.test(message)) return 'This RPC does not provide access to the requested transaction history.'
  if (/different network/i.test(message)) return 'The history RPC network did not match; its results were not used.'
  return 'Transaction history could not be read from RPC. Retry the export later.'
}
export async function readPoolEvidence(address: string, network: Network, endpoint = RPC[network]) {
  const connection = new Connection(endpoint, { commitment: 'confirmed', disableRetryOnRateLimit: true })
  const pool = new PublicKey(address)
  const genesisHash = await rpcDeadline(connection.getGenesisHash())
  const observedNetwork = evidenceNetwork(genesisHash)
  const publicNetwork = observedNetwork !== 'unrecognized-network'
  if (publicNetwork && genesisHash !== GENESIS[network]) throw new Error('The RPC network does not match the selected network. No evidence report was exported.')
  const [launch, lifecycle] = await Promise.all([
    rpcDeadline(loadLaunch(address, network, endpoint), 20000), rpcDeadline(readLifecycle(address, network, endpoint), 20000),
  ])
  const warnings: string[] = []
  let history: Connection | undefined
  let signatures: Awaited<ReturnType<Connection['getSignaturesForAddress']>> = []
  let signaturesAvailable = false
  try {
    history = await transactionHistoryConnection(connection)
    signatures = await rpcDeadline(history.getSignaturesForAddress(pool, { limit: 20 }, 'confirmed'))
    signaturesAvailable = true
  } catch (issue) { warnings.push(unavailable(issue)) }
  const receipts = []
  const detailDeadline = Date.now() + 30_000
  // Bound each lookup. An unavailable transaction must not erase the valid pool
  // snapshot or be converted into a successful receipt.
  for (const entry of signatures) {
    let transaction: Awaited<ReturnType<Connection['getTransaction']>> = null
    let readError: string | null = null
    if (Date.now() >= detailDeadline) readError = 'The transaction lookup time limit was reached; retry later.'
    else {
      try { transaction = await rpcDeadline(history!.getTransaction(entry.signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 }), Math.min(8000, detailDeadline - Date.now())) }
      catch (issue) { readError = unavailable(issue) }
    }
    if (!transaction && !readError) readError = 'The RPC did not return this transaction; its outcome is unverified.'
    const accounts = transaction?.transaction.message.staticAccountKeys ?? []
    const loaded = transaction?.meta?.loadedAddresses
    const referencesPool = [...accounts, ...(loaded?.writable ?? []), ...(loaded?.readonly ?? [])].some(key => key.equals(pool))
    const transactionMatches = !!transaction && transaction.transaction.signatures[0] === entry.signature && transaction.slot === entry.slot && referencesPool
    const verified = transactionMatches && !!transaction?.meta
    if (transaction && !verified) readError = 'The RPC transaction could not be matched to this pool, signature and slot with execution metadata.'
    receipts.push({ signature: entry.signature, slot: entry.slot, blockTime: entry.blockTime,
      signatureStatusError: entry.err, transactionAvailable: !!transaction, verified, readError,
      succeeded: verified ? transaction!.meta!.err === null : null,
      feeLamports: verified ? transaction!.meta!.fee : null,
      signers: verified ? accounts.slice(0, transaction!.transaction.message.header.numRequiredSignatures).map(key => key.toBase58()) : [],
      instructions: verified ? transaction!.meta!.logMessages?.filter(line => line.startsWith('Program log: Instruction:')) ?? [] : [],
      explorerUrl: publicNetwork ? `https://solscan.io/tx/${entry.signature}${observedNetwork === 'public-devnet' ? '?cluster=devnet' : ''}` : null,
    })
    // Avoid bursting the public history service. Do not retry denied/rate-limited
    // detail reads repeatedly; remaining entries stay explicitly unverified.
    if (readError?.startsWith('RPC rate limit') || readError?.startsWith('This RPC does not provide') || readError?.startsWith('The transaction lookup time limit')) {
      warnings.push(readError)
      for (const remaining of signatures.slice(receipts.length)) receipts.push({ signature: remaining.signature, slot: remaining.slot, blockTime: remaining.blockTime,
        signatureStatusError: remaining.err, transactionAvailable: false, verified: false, readError: 'Not requested after a history access or time limit was reached.',
        succeeded: null, feeLamports: null, signers: [], instructions: [],
        explorerUrl: publicNetwork ? `https://solscan.io/tx/${remaining.signature}${observedNetwork === 'public-devnet' ? '?cluster=devnet' : ''}` : null })
      break
    }
    if (publicNetwork && receipts.length < signatures.length) await new Promise(resolve => setTimeout(resolve, Math.max(0, Math.min(1100, detailDeadline - Date.now()))))
  }
  const verifiedReceipts = receipts.filter(receipt => receipt.verified).length
  if (verifiedReceipts < receipts.length) warnings.push(`${receipts.length - verifiedReceipts} listed transaction(s) have unverified details.`)
  return { format: 'curve-covenant/pool-evidence-v1', fetchedAt: new Date().toISOString(),
    requestedNetwork: network, observedNetwork, genesisHash,
    scope: 'Latest 20 transactions referencing this pool; not a complete history, organic volume, or proof of which wallet application signed.',
    history: { signaturesAvailable, listedReceipts: signatures.length, verifiedReceipts, rpcOrigin: history ? new URL(history.rpcEndpoint).origin : null },
    warnings, pool: address, launch, lifecycle, receipts }
}

export function evidenceSummary(report: Awaited<ReturnType<typeof readPoolEvidence>>): string {
  if (!report.history.signaturesAvailable) return 'Pool state exported. Transaction history was unavailable and is not verified. Use RPC connection to check an endpoint with history access, then export again.'
  if (report.history.listedReceipts === 0) return 'Pool state exported. The RPC returned no recent transaction signatures.'
  return `Pool state exported. ${report.history.verifiedReceipts} of ${report.history.listedReceipts} listed transaction receipts verified.${report.warnings.length ? ' Unavailable details remain unverified; see the report warnings.' : ''}`
}

export function downloadPoolEvidence(evidence: Awaited<ReturnType<typeof readPoolEvidence>>) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(evidence, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url; link.download = `pool-${evidence.pool}-evidence.json`; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

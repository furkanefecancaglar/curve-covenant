import { useEffect, useState } from 'react'
import { Connection } from '@solana/web3.js'
import { readTransactionOutcome, TransactionOutcomeError } from './confirmation'
import { loadPendingMigration, removePendingMigration } from './pending-migration'
import { ArrowRight, ExternalLink, RefreshCw } from 'lucide-react'
import { graduatePrepared, MigrationSubmittedError, prepareGraduation, readLifecycle } from './lifecycle'
import type { PreparedGraduation } from './lifecycle'
import { formatUnits, RPC } from './dbc'
import { walletError } from './wallet'
import type { Network } from './dbc'
import TradePanel from './TradePanel'
import WalletBalances from './WalletBalances'
import { downloadPoolEvidence, evidenceSummary, readPoolEvidence } from './pool-evidence'

export default function LifecyclePanel({ initialPool, onObserved }: { initialPool: { address: string; network: Network } | null; onObserved: (pool: { address: string; network: Network }) => void }) {
  const [address, setAddress] = useState(initialPool?.address ?? '')
  const [network, setNetwork] = useState<Network>(initialPool?.network ?? 'devnet')
  const [status, setStatus] = useState<Awaited<ReturnType<typeof readLifecycle>> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [signature, setSignature] = useState('')
  const [migrationReview, setMigrationReview] = useState<PreparedGraduation | null>(null)
  const [migrationSubmitted, setMigrationSubmitted] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [exportNote, setExportNote] = useState('')
  async function exportEvidence() {
    if (!status) return
    setExporting(true); setExportError(''); setExportNote('')
    try { const report = await readPoolEvidence(status.address, status.network); downloadPoolEvidence(report); setExportNote(evidenceSummary(report)) }
    catch (issue) { setExportError(issue instanceof Error ? issue.message : 'Could not read transaction evidence. Retry the export.') }
    finally { setExporting(false) }
  }
  async function reconcileMigration(result: Awaited<ReturnType<typeof readLifecycle>>) {
    const attempt = loadPendingMigration(result.address, result.network)
    if (!attempt) { setMigrationSubmitted(false); return }
    setSignature(attempt.signature); setMigrationSubmitted(true)
    if (result.migrated) {
      removePendingMigration(result.address, result.network, attempt.signature); setMigrationSubmitted(false); return
    }
    const outcome = await readTransactionOutcome(new Connection(RPC[result.network], 'confirmed'), attempt)
    if (outcome.state === 'failed' || outcome.state === 'expired') {
      removePendingMigration(result.address, result.network, attempt.signature); setMigrationSubmitted(false)
      setError(`Previous migration ${outcome.state}. Check the cost again before signing a new transaction.`)
    }
  }
  async function read() {
    setBusy(true); setError(''); setStatus(null); setMigrationReview(null)
    try { const result = await readLifecycle(address, network); setStatus(result); await reconcileMigration(result); onObserved(result) }
    catch (issue) { setError(issue instanceof Error ? issue.message : 'Could not read the pool.') }
    finally { setBusy(false) }
  }
  useEffect(() => {
    if (!initialPool) return
    let current = true
    setBusy(true)
    readLifecycle(initialPool.address, initialPool.network).then(async result => {
      if (current) { setStatus(result); onObserved(result); await reconcileMigration(result) }
    }).catch(issue => { if (current) setError(issue instanceof Error ? issue.message : 'Could not read this pool.') })
      .finally(() => { if (current) setBusy(false) })
    return () => { current = false }
  }, [initialPool, onObserved])
  async function graduate() {
    if (!status) return
    setBusy(true); setError('')
    try {
      if (!migrationReview) { setMigrationReview(await prepareGraduation(status.address, status.network)); return }
      const result = await graduatePrepared(migrationReview)
      setStatus(result.status); setSignature(result.signature); setMigrationReview(null); await reconcileMigration(result.status)
    } catch (issue) {
      if (issue instanceof MigrationSubmittedError) { setSignature(issue.signature); setMigrationReview(null); setMigrationSubmitted(true) }
      if (issue instanceof TransactionOutcomeError && issue.state !== 'pending') { setMigrationReview(null); setSignature(issue.attempt.signature) }
      setError(walletError(issue))
    }
    finally { setBusy(false) }
  }
  const explorer = status?.network === 'devnet' ? '?cluster=devnet' : ''
  return <section className="lifecycle-panel" id="graduate">
    <div className="studio-section-head"><span>05 / GRADUATION</span><h2>Carry the launch into DAMM v2.</h2><p>Read a DBC pool's live reserves. Once its threshold is met, submit the migration with your wallet. Graduated pools show their verified DAMM v2 destination and vault balances.</p></div>
    <form className="lifecycle-form" onSubmit={event => { event.preventDefault(); void read() }}>
      <label>Solana network<select aria-label="Graduation network" value={network} disabled={busy} onChange={event => { setNetwork(event.target.value as Network); setStatus(null); setSignature(''); setMigrationReview(null); setMigrationSubmitted(false) }}><option value="devnet">Devnet</option><option value="mainnet-beta">Mainnet</option></select></label>
      <label>DBC pool address<input aria-label="Graduation pool address" value={address} disabled={busy} onChange={event => { setAddress(event.target.value); setStatus(null); setSignature(''); setMigrationReview(null); setMigrationSubmitted(false) }} placeholder="Paste a DBC pool address" required/></label>
      <button disabled={busy || !address.trim()}><RefreshCw size={16} className={busy ? 'spin' : ''}/> Read pool</button>
    </form>
    {error && <p className="publish-error" role="alert">{error}</p>}
    {signature && <a className="migration-receipt" href={`https://solscan.io/tx/${signature}${network === 'devnet' ? '?cluster=devnet' : ''}`} target="_blank" rel="noreferrer">Migration transaction <ExternalLink size={14}/></a>}
    {migrationSubmitted && <p className="allocation-note">A signed migration needs checking. Use “Read pool” to check its transaction and destination before starting another attempt.</p>}
    {status && <div className="lifecycle-result"><div className="lifecycle-status"><strong>{status.migrated ? 'Graduated to DAMM v2' : status.ready ? 'Ready to graduate' : 'Price discovery in progress'}</strong><span>{status.progress.toFixed(2)}%</span></div><progress max={100} value={status.progress}/>
      {!status.migrated && <p>{status.reserve} / {status.threshold} quote tokens in reserve</p>}
      <p>DAMM v2 starting base fee: {status.destinationFees.baseFeePct}%{status.destinationFees.dynamicEnabled ? ' + dynamic fee' : ''}. Read from the migration settings on chain.</p>
      {status.ready && !migrationSubmitted && <><p>Migration creates the DAMM v2 pool and liquidity positions. Check the actual transaction cost before signing on {status.network === 'devnet' ? 'devnet' : 'mainnet'}.</p>{migrationReview && <div className="migration-review" role="region" aria-label="Graduation cost review"><strong>Estimated wallet debit: {formatUnits(String(migrationReview.review.estimatedDebitLamports), 9)} SOL</strong><p>Includes network fees and rent charged to this wallet. Estimated remaining balance: {formatUnits(String(migrationReview.review.remainingLamports), 9)} SOL.</p><small>Wallet: {migrationReview.payer.toBase58()} · checked at {new Date(migrationReview.review.checkedAt).toLocaleTimeString()}</small><button disabled={busy} onClick={() => { setMigrationReview(null); setError('') }}>Recheck graduation cost</button></div>}<button disabled={busy} onClick={graduate}>{busy ? 'Checking wallet / network…' : migrationReview ? 'Graduate with wallet' : 'Check graduation cost'} <ArrowRight size={16}/></button></>}
      {status.migrated && <><a href={`https://solscan.io/account/${status.dammPool}${explorer}`} target="_blank" rel="noreferrer">DAMM v2 pool: {status.dammPool} <ExternalLink size={14}/></a><div className="lifecycle-balances"><div><span>BASE VAULT</span><strong>{status.reserves?.base}</strong></div><div><span>QUOTE VAULT</span><strong>{status.reserves?.quote}</strong></div></div><p>Vault balances include amounts held by the pool; they are not trading volume.</p></>}
      {status.migrated && status.network === 'mainnet-beta' && <a className="market-link" href={`https://www.meteora.ag/dammv2/${status.dammPool}`} target="_blank" rel="noreferrer">Open this DAMM v2 market on Meteora <ExternalLink size={14}/></a>}
      <small>Read at {new Date(status.fetchedAt).toLocaleTimeString()} · {status.network}</small>
      <div className="pool-evidence"><button disabled={exporting} onClick={() => void exportEvidence()}>{exporting ? 'Reading on-chain receipts…' : 'Export on-chain evidence · JSON'}</button><p>Includes current pool terms, graduation status and up to 20 recent transactions checked through RPC. You can share the report with their explorer links.</p>{exportNote && <p className="allocation-note" role="status">{exportNote}</p>}{exportError && <p className="publish-error" role="alert">{exportError}</p>}</div>
      <WalletBalances key={`balances:${status.network}:${status.address}`} pool={status.address} network={status.network} refreshKey={status.fetchedAt}/>
      {!status.migrated && !status.ready && <TradePanel key={`${status.network}:${status.address}`} pool={status.address} network={status.network} onTrade={async () => { setStatus(await readLifecycle(status.address, status.network)) }}/>}
    </div>}
  </section>
}

import { useState } from 'react'
import { ArrowRight, ExternalLink, RefreshCw } from 'lucide-react'
import { graduatePool, readLifecycle } from './lifecycle'
import type { Network } from './dbc'
import TradePanel from './TradePanel'

export default function LifecyclePanel({ initialPool }: { initialPool: { address: string; network: Network } | null }) {
  const [address, setAddress] = useState(initialPool?.address ?? '')
  const [network, setNetwork] = useState<Network>(initialPool?.network ?? 'devnet')
  const [status, setStatus] = useState<Awaited<ReturnType<typeof readLifecycle>> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [signature, setSignature] = useState('')
  async function read() {
    setBusy(true); setError(''); setStatus(null); setSignature('')
    try { setStatus(await readLifecycle(address, network)) }
    catch (issue) { setError(issue instanceof Error ? issue.message : 'Could not read the pool.') }
    finally { setBusy(false) }
  }
  async function graduate() {
    if (!status) return
    setBusy(true); setError('')
    try {
      const result = await graduatePool(status.address, status.network)
      setStatus(result.status); setSignature(result.signature)
    } catch (issue) { setError(issue instanceof Error ? issue.message : 'Migration failed.') }
    finally { setBusy(false) }
  }
  const explorer = status?.network === 'devnet' ? '?cluster=devnet' : ''
  return <section className="lifecycle-panel" id="graduate">
    <div className="studio-section-head"><span>04 / GRADUATION</span><h2>Carry the launch into DAMM v2.</h2><p>Read a DBC pool's live reserves. Once its threshold is met, submit the migration with your wallet. Graduated pools show their verified DAMM v2 destination and vault balances.</p></div>
    <form className="lifecycle-form" onSubmit={event => { event.preventDefault(); void read() }}>
      <label>Solana network<select aria-label="Graduation network" value={network} disabled={busy} onChange={event => { setNetwork(event.target.value as Network); setStatus(null) }}><option value="devnet">Devnet</option><option value="mainnet-beta">Mainnet</option></select></label>
      <label>DBC pool address<input aria-label="Graduation pool address" value={address} disabled={busy} onChange={event => { setAddress(event.target.value); setStatus(null) }} placeholder="Paste a DBC pool address" required/></label>
      <button disabled={busy || !address.trim()}><RefreshCw size={16} className={busy ? 'spin' : ''}/> Read pool</button>
    </form>
    {error && <p className="publish-error" role="alert">{error}</p>}
    {status && <div className="lifecycle-result"><div className="lifecycle-status"><strong>{status.migrated ? 'Graduated to DAMM v2' : status.ready ? 'Ready to graduate' : 'Price discovery in progress'}</strong><span>{status.progress.toFixed(2)}%</span></div><progress max={100} value={status.progress}/>
      {!status.migrated && <p>{status.reserve} / {status.threshold} quote tokens in reserve</p>}
      <p>DAMM v2 starting base fee: {status.destinationFees.baseFeePct}%{status.destinationFees.dynamicEnabled ? ' + dynamic fee' : ''}. Read from the migration settings on chain.</p>
      {status.ready && <><p>Migration creates the DAMM v2 pool and liquidity positions. Your wallet pays SOL rent and transaction fees on {status.network === 'devnet' ? 'devnet' : 'mainnet'}.</p><button disabled={busy} onClick={graduate}>Graduate with wallet <ArrowRight size={16}/></button></>}
      {status.migrated && <><a href={`https://solscan.io/account/${status.dammPool}${explorer}`} target="_blank" rel="noreferrer">DAMM v2 pool: {status.dammPool} <ExternalLink size={14}/></a><div className="lifecycle-balances"><div><span>BASE VAULT</span><strong>{status.reserves?.base}</strong></div><div><span>QUOTE VAULT</span><strong>{status.reserves?.quote}</strong></div></div><p>Vault balances include amounts held by the pool; they are not trading volume.</p></>}
      {signature && <a href={`https://solscan.io/tx/${signature}${explorer}`} target="_blank" rel="noreferrer">Migration transaction <ExternalLink size={14}/></a>}
      {status.migrated && status.network === 'mainnet-beta' && <a className="market-link" href={`https://www.meteora.ag/dammv2/${status.dammPool}`} target="_blank" rel="noreferrer">Open this DAMM v2 market on Meteora <ExternalLink size={14}/></a>}
      <small>Read at {new Date(status.fetchedAt).toLocaleTimeString()} · {status.network}</small>
      {!status.migrated && !status.ready && <TradePanel key={`${status.network}:${status.address}`} pool={status.address} network={status.network} onTrade={async () => { setStatus(await readLifecycle(status.address, status.network)) }}/>}
    </div>}
  </section>
}

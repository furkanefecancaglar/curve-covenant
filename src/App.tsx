import { useEffect, useRef, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, Check, ChevronRight, CircleHelp, Code2, Copy, Download, ExternalLink, FileCheck2, Globe2, LockKeyhole, Radar, RefreshCw, Search, ShieldCheck, X } from 'lucide-react'
import { DBC_PROGRAM, loadLaunch, quoteBuy, RPC } from './dbc'
import type { BuyQuote, LaunchData, Network } from './dbc'
import { compareCovenant, createCovenant, downloadJson, parseCovenant, PROMISE_FIELDS, signCovenantWithPhantom, verifyCovenantSignature } from './covenant'
import type { Covenant, PromiseField } from './covenant'

const short = (value: string, chars = 7) => `${value.slice(0, chars)}…${value.slice(-chars)}`
const pct = (value: number) => `${value.toLocaleString('en-US', { maximumFractionDigits: 4 })}%`
const explorer = (address: string, network: Network) => `https://solscan.io/account/${address}${network === 'devnet' ? '?cluster=devnet' : ''}`
const SAMPLE_POOL = '4L9LJ3B5niCSLWujRJjPU6scZVbNJz4zw6A9B3aPxTeT'

function Address({ value, network }: { value: string; network: Network }) {
  return <a className="address" href={explorer(value, network)} target="_blank" rel="noreferrer" title={value}>{short(value)} <ExternalLink size={13} /></a>
}

function InfoRow({ label, value, hint, mono = false }: { label: string; value: React.ReactNode; hint?: string; mono?: boolean }) {
  return <div className="info-row"><div className="info-label">{label}{hint && <span title={hint}><CircleHelp size={13}/></span>}</div><div className={mono ? 'info-value mono' : 'info-value'}>{value}</div></div>
}

function App() {
  const [network, setNetwork] = useState<Network>('mainnet-beta')
  const [rpcUrl, setRpcUrl] = useState('')
  const [address, setAddress] = useState('')
  const [launch, setLaunch] = useState<LaunchData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [project, setProject] = useState('')
  const [description, setDescription] = useState('')
  const [selected, setSelected] = useState<PromiseField[]>(PROMISE_FIELDS.map(field => field.key))
  const [covenant, setCovenant] = useState<Covenant | null>(null)
  const [tab, setTab] = useState<'overview' | 'scenario' | 'covenant' | 'raw'>('overview')
  const [buyAmount, setBuyAmount] = useState('10')
  const [buyQuote, setBuyQuote] = useState<BuyQuote | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteError, setQuoteError] = useState('')
  const [signing, setSigning] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const booted = useRef(false)

  useEffect(() => {
    if (booted.current) return
    booted.current = true
    const query = new URLSearchParams(window.location.search)
    const urlAddress = query.get('address')
    const urlNetwork = query.get('network')
    const chain: Network = urlNetwork === 'devnet' ? 'devnet' : 'mainnet-beta'
    if (urlAddress) { setAddress(urlAddress); inspect(urlAddress, chain) }
    if (urlNetwork === 'devnet') setNetwork(chain)
  }, [])

  async function inspect(input = address, chain = network) {
    if (!input.trim()) return setError('Enter a DBC pool or config address.')
    setLoading(true); setError(''); setLaunch(null); setCovenant(null); setBuyQuote(null)
    try {
      const result = await loadLaunch(input, chain, rpcUrl.trim() || RPC[chain])
      setLaunch(result)
      setTab('overview')
      const url = new URL(window.location.href)
      url.searchParams.set('address', result.address)
      url.searchParams.set('network', chain)
      window.history.replaceState({}, '', url)
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not read this launch.') }
    finally { setLoading(false) }
  }

  async function importFile(file?: File) {
    if (!file) return
    try {
      const parsed = parseCovenant(JSON.parse(await file.text()))
      setCovenant(parsed)
      setAddress(parsed.poolAddress || parsed.configAddress)
      setNetwork(parsed.network)
      setError('')
      await inspect(parsed.poolAddress || parsed.configAddress, parsed.network)
      setCovenant(parsed)
      setTab('covenant')
    } catch (err) { setError(err instanceof Error ? err.message : 'Invalid covenant file.') }
  }

  const checks = covenant && launch ? (() => { try { return compareCovenant(covenant, launch) } catch { return null } })() : null
  const signatureCheck = covenant && launch ? verifyCovenantSignature(covenant, launch) : null
  const claimCount = checks?.length ?? 0
  const passCount = checks?.filter(check => check.matches).length ?? 0

  async function exportCovenant(sign = false) {
    if (!launch) return
    setError('')
    if (sign) setSigning(true)
    try {
      const claims = Object.fromEntries(selected.map(key => [key, launch[key]])) as Partial<Record<PromiseField, string | number>>
      let next = createCovenant(launch, project, description, claims)
      if (sign) next = await signCovenantWithPhantom(next, launch)
      setCovenant(next)
      downloadJson(`${project.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'launch'}-covenant.json`, next)
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not export covenant.') }
    finally { setSigning(false) }
  }

  async function share() {
    await navigator.clipboard.writeText(window.location.href)
  }

  async function runQuote() {
    if (!launch) return
    setQuoteLoading(true); setQuoteError(''); setBuyQuote(null)
    try { setBuyQuote(await quoteBuy(launch, buyAmount, rpcUrl.trim() || RPC[launch.network])) }
    catch (err) { setQuoteError(err instanceof Error ? err.message : 'Could not calculate a quote.') }
    finally { setQuoteLoading(false) }
  }

  return <div className="app-shell">
    <header className="site-header">
      <a className="brand" href="/"><div className="brand-icon"><Radar size={23} strokeWidth={2.2}/></div><span>curve<span className="brand-accent">covenant</span></span><span className="beta">BETA</span></a>
      <nav className="top-nav"><a href="#how-it-works">How it works</a><a href="https://github.com/furkanefecancaglar/curve-covenant" target="_blank" rel="noreferrer"><Code2 size={16}/> GitHub</a><a href="https://docs.meteora.ag/core-products/dbc/what-is-dbc" target="_blank" rel="noreferrer">About DBC <ArrowUpRight size={15}/></a></nav>
    </header>

    <main>
      <section className="hero">
        <div className="hero-glow"/>
        <div className="eyebrow"><span className="live-dot"/> BUILT ON METEORA DBC <span className="eyebrow-sep">/</span> OPEN SOURCE</div>
        <h1>Every token launch<br/><em>has a story.</em><br/>Read the contract.</h1>
        <p className="hero-copy">Turn any Meteora Dynamic Bonding Curve launch into a clear, verifiable disclosure. Inspect the actual on-chain terms. Publish a covenant your community can check for themselves.</p>
        <div className="hero-pills"><span><ShieldCheck size={16}/> On-chain verified</span><span><LockKeyhole size={16}/> No wallet required</span><span><Globe2 size={16}/> Open by default</span></div>
        <div className="hero-orb"><div className="orb-ring ring-one"/><div className="orb-ring ring-two"/><div className="orb-core">DBC<span>↗</span></div></div>
      </section>

      <section className="workspace" id="inspect">
        <div className="section-heading"><div><span className="section-kicker">01 / INSPECT</span><h2>Know what you're launching into.</h2></div><span className="section-note">Direct from Solana RPC · Meteora SDK</span></div>
        <div className="search-panel">
          <div className="search-head"><span>POOL OR CONFIG ADDRESS</span><div className="network-switch"><button className={network === 'mainnet-beta' ? 'active' : ''} onClick={() => setNetwork('mainnet-beta')}>Mainnet</button><button className={network === 'devnet' ? 'active' : ''} onClick={() => setNetwork('devnet')}>Devnet</button></div></div>
          <form className="search-form" onSubmit={event => { event.preventDefault(); inspect() }}><Search size={20}/><input aria-label="DBC pool or config address" placeholder="Paste a Meteora DBC pool or config address" value={address} onChange={event => setAddress(event.target.value)} spellCheck={false}/><button className="primary-button" disabled={loading}>{loading ? <><RefreshCw size={17} className="spin"/> Reading chain</> : <>Inspect launch <ArrowUpRight size={18}/></>}</button></form>
          <details className="rpc-settings"><summary>Advanced: custom RPC endpoint</summary><input aria-label="Custom Solana RPC endpoint" placeholder={RPC[network]} value={rpcUrl} onChange={event => setRpcUrl(event.target.value)}/><p>Public RPCs may rate limit requests. Your endpoint stays in this browser session.</p></details>
          {error && <div className="error"><X size={16}/>{error}</div>}
          <div className="search-footer"><span><span className="tiny-dot"/> Supports pool and config accounts, including Token-2022 transfer hooks</span><div className="search-footer-actions"><button onClick={() => { setNetwork('mainnet-beta'); setAddress(SAMPLE_POOL); inspect(SAMPLE_POOL, 'mainnet-beta') }}>Try a live pool <ArrowUpRight size={15}/></button><button onClick={() => fileRef.current?.click()}><FileCheck2 size={15}/> Verify a covenant</button></div><input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={event => importFile(event.target.files?.[0])}/></div>
        </div>

        {launch && <div className="result-panel">
          <div className="result-header"><div><div className="result-label"><span className="live-dot"/> VERIFIED ON-CHAIN <span className="muted">·</span> SLOT {launch.slot.toLocaleString()}</div><h3>{launch.kind === 'pool' ? 'Launch pool' : 'Launch configuration'} <span>{short(launch.address, 5)}</span></h3><p>Read at {new Date(launch.fetchedAt).toLocaleString()} · {launch.network === 'devnet' ? 'Solana devnet' : 'Solana mainnet'}</p></div><div className="result-actions"><button onClick={share}><Copy size={15}/> Copy link</button><button onClick={() => downloadJson('dbc-onchain-snapshot.json', launch)}><Download size={15}/> Snapshot</button></div></div>
          <div className="tabs"><button className={tab === 'overview' ? 'selected' : ''} onClick={() => setTab('overview')}>Overview</button><button className={tab === 'scenario' ? 'selected' : ''} onClick={() => setTab('scenario')}>Scenario lab</button><button className={tab === 'covenant' ? 'selected' : ''} onClick={() => setTab('covenant')}>Covenant</button><button className={tab === 'raw' ? 'selected' : ''} onClick={() => setTab('raw')}>Raw chain data</button></div>
          {tab === 'overview' && <div className="overview">
            <div className="metric-grid"><div className="metric"><span>INITIAL TRADING FEE</span><strong>{pct(launch.initialTradingFeePct)}</strong><small>{launch.feeMode}{launch.dynamicFeeEnabled ? ' + dynamic fee' : ''}</small></div><div className="metric"><span>GRADUATION TARGET</span><strong>{launch.migrationQuoteThreshold}</strong><small>{launch.quoteSymbol} contributed to curve</small></div><div className="metric"><span>MIGRATION DESTINATION</span><strong className="medium-value">{launch.migrationTarget}</strong><small>{launch.migrated === undefined ? 'Configuration' : launch.migrated ? 'Already migrated' : 'Awaiting threshold'}</small></div></div>
            {launch.graduationProgress !== undefined && <div className="progress-card"><div><span>GRADUATION PROGRESS</span><strong>{pct(launch.graduationProgress)}</strong></div><div className="progress-track"><span style={{ width: `${launch.graduationProgress}%` }}/></div><p>{launch.currentQuoteReserve} of {launch.migrationQuoteThreshold} {launch.quoteSymbol} in quote reserve</p></div>}
            <div className="detail-grid"><div className="detail-card"><h4><span className="detail-icon"><ArrowDownRight size={19}/></span> Fees & flow</h4><InfoRow label="Initial trading fee" value={pct(launch.initialTradingFeePct)}/><InfoRow label="Fee schedule" value={launch.feeMode}/><InfoRow label="Dynamic fee" value={launch.dynamicFeeEnabled ? 'Enabled' : 'Disabled'}/><InfoRow label="Creator share of trading fees" value={pct(launch.creatorFeeSharePct)}/><InfoRow label="Fee claimer" value={<Address value={launch.feeClaimer} network={launch.network}/>}/><InfoRow label="Migration fee allocation" value={`${pct(launch.migrationFeePct)} partner / ${pct(launch.creatorMigrationFeePct)} creator`}/></div><div className="detail-card"><h4><span className="detail-icon purple"><ArrowUpRight size={19}/></span> Migration & control</h4><InfoRow label="Quote asset" value={<Address value={launch.quoteMint} network={launch.network}/>}/><InfoRow label="Migration target" value={launch.migrationTarget}/><InfoRow label="Partner liquidity share" value={pct(launch.partnerLiquidityPct)}/><InfoRow label="Creator liquidity share" value={pct(launch.creatorLiquidityPct)}/><InfoRow label="Partner permanent lock" value={pct(launch.partnerPermanentLockPct)}/><InfoRow label="Creator permanent lock" value={pct(launch.creatorPermanentLockPct)}/><InfoRow label="Token authority" value={launch.tokenAuthority}/></div></div>
            <div className="addresses"><InfoRow label="DBC config" value={<Address value={launch.configAddress} network={launch.network}/>} mono/>{launch.poolAddress && <InfoRow label="DBC pool" value={<Address value={launch.poolAddress} network={launch.network}/>} mono/>}{launch.baseMint && <InfoRow label="Base token" value={<Address value={launch.baseMint} network={launch.network}/>} mono/>}{launch.creator && <InfoRow label="Creator" value={<Address value={launch.creator} network={launch.network}/>} mono/>}<InfoRow label="DBC program" value={<Address value={DBC_PROGRAM} network={launch.network}/>} mono/></div>
          </div>}
          {tab === 'scenario' && <div className="scenario-view"><div className="covenant-intro"><div><span className="section-kicker">02 / SCENARIO LAB</span><h3>Explore a trade before it happens.</h3><p>Use Meteora's official DBC quote math on the latest pool state. See the estimated token output, fee split and unfilled amount when a buy approaches graduation. No wallet or transaction is involved.</p></div><Radar size={50}/></div>{launch.poolAddress && !launch.migrated ? <div className="scenario-form"><label>SIMULATED BUY AMOUNT <span>in {launch.quoteSymbol}</span></label><div className="scenario-entry"><input aria-label="Simulated buy amount" value={buyAmount} onChange={event => setBuyAmount(event.target.value)} inputMode="decimal"/><span>{launch.quoteSymbol}</span><button className="primary-button" onClick={runQuote} disabled={quoteLoading}>{quoteLoading ? <RefreshCw size={17} className="spin"/> : <ArrowUpRight size={17}/>} Calculate</button></div><div className="quick-amounts">{['1','10','100','1000'].map(value => <button key={value} onClick={() => setBuyAmount(value)}>{value} {launch.quoteSymbol}</button>)}</div>{quoteError && <div className="error"><X size={16}/>{quoteError}</div>}{buyQuote && <div className="quote-result"><div className="quote-main"><span>ESTIMATED BASE TOKENS</span><strong>{Number(buyQuote.estimatedTokens).toLocaleString('en-US', { maximumFractionDigits: 6 })}</strong><small>Minimum with 1% slippage: {Number(buyQuote.minimumTokens).toLocaleString('en-US', { maximumFractionDigits: 6 })}</small></div><InfoRow label="Trading fee" value={`${buyQuote.tradingFee} ${buyQuote.feeAsset}`}/><InfoRow label="Protocol fee" value={`${buyQuote.protocolFee} ${buyQuote.feeAsset}`}/><InfoRow label="Unfilled input near graduation" value={`${buyQuote.unfilledInput} ${launch.quoteSymbol}`}/><p>Calculated at {new Date(buyQuote.fetchedAt).toLocaleTimeString()}. Quotes are estimates based on a changing pool; this does not execute a trade.</p></div>}</div> : <div className="scenario-unavailable">{launch.migrated ? 'This pool has already graduated from DBC.' : 'Paste a live DBC pool address to simulate a buy.'}</div>}</div>}
          {tab === 'covenant' && <div className="covenant-view"><div className="covenant-intro"><div><span className="section-kicker">02 / PUBLISH</span><h3>Make your launch terms a promise.</h3><p>Export a machine-readable covenant from the live DBC configuration. Share it with your community. Anyone can import it later and compare every claim with the chain.</p></div><FileCheck2 size={50}/></div>
            {covenant && <div className={`verification ${checks && passCount === claimCount ? 'passed' : 'failed'}`}><div className="verification-head">{checks && passCount === claimCount ? <Check size={21}/> : <X size={21}/>}<strong>{checks ? `${passCount} of ${claimCount} promises match the chain` : 'This covenant belongs to a different launch'}</strong></div><div className="signature-status">{signatureCheck ? signatureCheck.valid && signatureCheck.authorizedRole ? <><ShieldCheck size={16}/> Signed by on-chain {signatureCheck.authorizedRole}: {short(signatureCheck.signer)}</> : signatureCheck.valid ? <><CircleHelp size={16}/> Valid signature from a wallet with no verified DBC role</> : <><X size={16}/> Invalid signature: {signatureCheck.reason}</> : <><CircleHelp size={16}/> Unsigned: issuer identity has not been verified</>}</div>{checks?.map(check => <div className="check-row" key={check.key}><span>{check.matches ? <Check size={15}/> : <X size={15}/>} {check.label}</span><span>{check.expected}{check.expected !== check.actual ? ` → ${check.actual}` : ''}</span></div>)}</div>}
            <div className="covenant-form"><label>PROJECT NAME<input placeholder="Your launch or platform name" value={project} onChange={event => setProject(event.target.value)}/></label><label>WHAT THIS LAUNCH IS FOR<textarea placeholder="A plain-language description your community can understand" value={description} onChange={event => setDescription(event.target.value)} rows={3}/></label><div className="claim-heading">PROMISES TO INCLUDE <span>read directly from the current config</span></div><div className="claim-list">{PROMISE_FIELDS.map(field => <label className="claim" key={field.key}><input type="checkbox" checked={selected.includes(field.key)} onChange={event => setSelected(current => event.target.checked ? [...current, field.key] : current.filter(key => key !== field.key))}/><span>{field.label}</span><strong>{String(launch[field.key])}{field.suffix}</strong></label>)}</div><div className="export-actions"><button className="primary-button" onClick={() => exportCovenant(false)}><Download size={17}/> Download unsigned</button><button className="primary-button outline" onClick={() => exportCovenant(true)} disabled={signing}>{signing ? <RefreshCw size={17} className="spin"/> : <LockKeyhole size={17}/>} Sign with Phantom & download</button></div>{error && <div className="error"><X size={16}/>{error}</div>}<p className="form-note">Only the DBC fee claimer or pool creator can create a role-verified signed covenant. Signing a message costs no network fee. The file describes current terms; it does not guarantee future actions.</p></div>
          </div>}
          {tab === 'raw' && <div className="raw-view"><p>The full decoded Meteora SDK account state used in this report. Values too large for JavaScript numbers remain strings.</p><pre>{JSON.stringify(launch.raw, null, 2)}</pre></div>}
        </div>}
      </section>

      <section className="how-section" id="how-it-works"><div className="section-heading"><div><span className="section-kicker">03 / THE METHOD</span><h2>Trust is a process. Make it visible.</h2></div></div><div className="steps"><div><span className="step-num">01</span><div className="step-icon"><Search size={26}/></div><h3>Inspect</h3><p>Paste a DBC pool or config address. We decode the live Meteora account with the official SDK.</p><ChevronRight className="step-arrow" size={23}/></div><div><span className="step-num">02</span><div className="step-icon"><FileCheck2 size={26}/></div><h3>Declare</h3><p>Select the terms that matter. Export a portable covenant tied to that exact on-chain config.</p><ChevronRight className="step-arrow" size={23}/></div><div><span className="step-num">03</span><div className="step-icon"><ShieldCheck size={26}/></div><h3>Verify</h3><p>Anyone can import the covenant and check each promise against fresh chain data.</p></div></div></section>
    </main>
    <footer><div><div className="brand footer-brand"><div className="brand-icon"><Radar size={20}/></div><span>curve<span className="brand-accent">covenant</span></span></div><p>Open launch terms for open markets.</p></div><div className="footer-links"><a href="https://github.com/MeteoraAg/dynamic-bonding-curve-sdk" target="_blank" rel="noreferrer">Meteora SDK <ArrowUpRight size={14}/></a><a href="https://solana.com" target="_blank" rel="noreferrer">Solana <ArrowUpRight size={14}/></a><a href="https://github.com/furkanefecancaglar/curve-covenant" target="_blank" rel="noreferrer">Source code <ArrowUpRight size={14}/></a></div><span className="footnote">Independent tool. Not affiliated with Meteora.</span></footer>
  </div>
}

export default App

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, CheckCircle2, Code2, Copy, Download, ExternalLink, Info, Layers3, Rocket, SlidersHorizontal } from 'lucide-react'
import { buildStudioConfig, PRESETS, simulateOpeningBuy, studioSummary } from './studio'
import type { PresetId, StudioInputs } from './studio'
import { QUOTES } from './quotes'
import type { QuoteId } from './quotes'
import { toPlain } from './dbc'
import LaunchPanel from './LaunchPanel'
import LifecyclePanel from './LifecyclePanel'
import CurveChart from './CurveChart'
import { decodeDesign, encodeDesign } from './design'
import type { Network } from './dbc'
import PoolLibrary from './PoolLibrary'
import { POOL_LIBRARY_KEY, poolLocation, poolShareUrl, readPoolLibrary, rememberPool } from './pool-library'
import type { SavedPool } from './pool-library'
import CurveComparison from './CurveComparison'
import './studio.css'

const comma = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n)
const inputFields: { key: keyof Omit<StudioInputs, 'preset'>; label: string; unit: string; min: number; step: number; help: string }[] = [
  { key: 'supply', label: 'Token supply', unit: 'tokens', min: 1_000_000, step: 1_000_000, help: 'Total tokens before the curve and DAMM v2 migration.' },
  { key: 'initialMarketCap', label: 'Opening market cap', unit: 'quote', min: 1, step: 1, help: 'Implied fully diluted value at the start of the DBC curve, in quote token units.' },
  { key: 'migrationMarketCap', label: 'Graduation market cap', unit: 'quote', min: 2, step: 10, help: 'Target value when liquidity migrates to DAMM v2, in quote token units.' },
  { key: 'startingFeeBps', label: 'Opening trading fee', unit: 'bps', min: 1, step: 1, help: '100 basis points equals 1%.' },
  { key: 'endingFeeBps', label: 'Final trading fee', unit: 'bps', min: 1, step: 1, help: 'Fee after the time schedule finishes.' },
  { key: 'feeDurationHours', label: 'Fee decay', unit: 'hours', min: 0, step: 1, help: 'Linear fee schedule duration. Set zero for a fixed fee.' },
  { key: 'creatorFeeSharePct', label: 'Creator fee share', unit: '%', min: 0, step: 1, help: 'Percentage of DBC trading fees allocated to the creator.' },
  { key: 'partnerLockedPct', label: 'Liquidity locked forever', unit: '%', min: 10, step: 1, help: 'Partner liquidity share permanently locked after DAMM v2 migration.' },
]

function saveJson(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function Studio() {
  const [shared] = useState(() => {
    const encoded = new URLSearchParams(window.location.search).get('design')
    if (!encoded) return { design: null, error: '' }
    try { return { design: decodeDesign(encoded), error: '' } }
    catch (error) { return { design: null, error: error instanceof Error ? error.message : 'Invalid shared design.' } }
  })
  const [input, setInput] = useState<StudioInputs>(shared.design?.inputs ?? { ...PRESETS.steady.values })
  const [quoteId, setQuoteId] = useState<QuoteId>(shared.design?.quoteId ?? 'SOL')
  const [shareMessage, setShareMessage] = useState('')
  const [launchLocked, setLaunchLocked] = useState(false)
  const [linkedPool] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    if (!params.has('pool')) return { pool: null, error: '' }
    try { return { pool: poolLocation(params.get('pool'), params.get('network')), error: '' } }
    catch { return { pool: null, error: 'Invalid pool link. Enter a valid DBC pool address and network below.' } }
  })
  const [createdPool, setCreatedPool] = useState<{ address: string; network: Network } | null>(linkedPool.pool)
  const [savedPools, setSavedPools] = useState(() => {
    try { return readPoolLibrary(localStorage.getItem(POOL_LIBRARY_KEY)) } catch { return [] }
  })
  const [storageWarning, setStorageWarning] = useState('')
  useEffect(() => {
    try { localStorage.setItem(POOL_LIBRARY_KEY, JSON.stringify(savedPools)); setStorageWarning('') }
    catch { setStorageWarning('Browser storage is unavailable. Pools will be remembered only until you close this page.') }
  }, [savedPools])
  const observePool = useCallback((pool: { address: string; network: Network }, label?: string) => {
    setSavedPools(previous => rememberPool(previous, pool, label))
    window.history.replaceState(null, '', poolShareUrl(window.location.href, pool))
  }, [])
  function openPool(pool: { address: string; network: Network }) {
    setCreatedPool({ address: pool.address, network: pool.network })
    window.history.replaceState(null, '', poolShareUrl(window.location.href, pool))
    document.getElementById('graduate')?.scrollIntoView({ behavior: 'smooth' })
  }
  function removePool(pool: SavedPool) {
    setSavedPools(previous => previous.filter(item => item.address !== pool.address || item.network !== pool.network))
  }
  const [buyAmount, setBuyAmount] = useState('1')
  const [elapsedHours, setElapsedHours] = useState('0')
  const quoteAsset = QUOTES[quoteId]
  const result = useMemo(() => {
    try {
      const config = buildStudioConfig(input, quoteAsset.decimals)
      return { config, summary: studioSummary(config, quoteAsset.decimals), error: '' }
    } catch (error) {
      return { config: null, summary: null, error: error instanceof Error ? error.message : 'Invalid configuration.' }
    }
  }, [input, quoteAsset.decimals])
  const scenario = useMemo(() => {
    if (!result.config) return { quote: null, error: '' }
    try {
      return { quote: simulateOpeningBuy(result.config, buyAmount, Number(elapsedHours), quoteAsset.decimals), error: '' }
    } catch (error) {
      return { quote: null, error: error instanceof Error ? error.message : 'Could not calculate a quote.' }
    }
  }, [result.config, buyAmount, elapsedHours, quoteAsset.decimals])

  function change(key: keyof Omit<StudioInputs, 'preset'>, value: string) {
    setInput(current => ({ ...current, [key]: Number(value) }))
  }
  function exportConfig() {
    if (!result.config) return
    saveJson(`dbc-${quoteId.toLowerCase()}-${input.preset}-config.json`, {
      format: 'curve-covenant/config-v1', quoteAsset, preset: input.preset,
      inputs: input, sdkConfig: toPlain(result.config),
    })
  }
  async function shareDesign() {
    const url = new URL(window.location.href)
    url.search = ''; url.hash = 'workbench'
    url.searchParams.set('design', encodeDesign(quoteId, input))
    try { await navigator.clipboard.writeText(url.toString()); setShareMessage('Design link copied. It includes this quote asset and all launch terms.') }
    catch { setShareMessage('Clipboard unavailable. Use Download SDK config JSON to save this design.') }
  }

  return <div className="studio-shell">
    <header className="studio-header">
      <a className="studio-brand" href={import.meta.env.BASE_URL}><span className="studio-mark"><Layers3 size={22}/></span><span>curve<span>covenant</span></span><small>PAIR LAUNCH</small></a>
      <nav><a href="#workbench">Build</a><a href="#launch">Launch</a><a href="#saved-pools">Saved pools</a><a href={`${import.meta.env.BASE_URL}?view=inspector`}>Live inspector <ArrowRight size={14}/></a><a href="https://github.com/furkanefecancaglar/curve-covenant" target="_blank" rel="noreferrer"><Code2 size={16}/> Source</a></nav>
    </header>
    <main>
      <section className="studio-hero"><div className="hero-noise"/>
        <div className="studio-hero-content"><div className="studio-eyebrow"><span/> STOCK-QUOTED LAUNCHES · METEORA DBC</div>
          <h1>Launch a token<br/><em>priced in a stock.</em></h1>
          <p>Build a DBC token launch quoted in a verified tokenized stock. Design the curve, simulate early trades, and create the token and pool with your wallet. Try the same flow with SOL on devnet first.</p>
          <div className="studio-hero-actions"><a className="studio-main-btn" href="#workbench">Design a launch <ArrowRight size={18}/></a><a className="studio-text-link" href={`${import.meta.env.BASE_URL}?view=inspector`}>Inspect a live DBC pool <ExternalLink size={15}/></a></div>
          <div className="studio-hero-proof"><span><CheckCircle2 size={15}/> Issuer-listed quote mints</span><span><CheckCircle2 size={15}/> Meteora DBC + DAMM v2</span><span><CheckCircle2 size={15}/> SDK quote simulation</span></div>
        </div>
        <div className="studio-diagram" aria-hidden="true"><div className="diagram-node">01<span>Pick a stock quote</span></div><div className="diagram-line"/><div className="diagram-node">02<span>Launch on DBC</span></div><div className="diagram-line"/><div className="diagram-node">03<span>Graduate to DAMM v2</span></div></div>
      </section>

      <section className="workbench" id="workbench">
        {shared.error && <p className="publish-error" role="alert">{shared.error}</p>}
        {shared.design && <p className="shared-design-note">Shared design loaded. Review the curve and terms before creating a pool.</p>}
        <div className="studio-section-head"><span>01 / QUOTE ASSET</span><h2>Choose what buyers pay with.</h2><p>A new token can be quoted in a tokenized stock instead of SOL. These mints come from the xStocks issuer asset feed; mint precision and Meteora token badge are checked on chain before a mainnet launch transaction is built.</p></div>
        <div className="quote-grid">{Object.values(QUOTES).map(asset => <button disabled={launchLocked} key={asset.id} className={`quote-card ${asset.id === quoteId ? 'active' : ''}`} onClick={() => setQuoteId(asset.id)}><span>{asset.category}</span><strong>{asset.id}</strong><small>{asset.name}</small><span className="quote-network">{asset.network === 'devnet' ? 'DEVNET TEST' : 'MAINNET'}</span></button>)}</div>
        <p className="quote-disclosure">The newly launched token is a separate asset priced against the selected quote token. It is not a share of the underlying company. Stock-token trading restrictions can still apply.</p>

        <div className="studio-section-head preset-heading"><span>02 / LAUNCH MECHANICS</span><h2>Choose a curve and fee model.</h2><p>Each preset is editable and validated by Meteora's DBC SDK. Market cap values are denominated in {quoteId} units.</p></div>
        <div className="preset-grid">{(Object.entries(PRESETS) as [PresetId, typeof PRESETS[PresetId]][]).map(([id, item], index) => <button disabled={launchLocked} key={id} className={`preset-card ${input.preset === id ? 'active' : ''}`} onClick={() => setInput({ ...item.values })}><span className="preset-top"><span>0{index + 1} / {item.audience.toUpperCase()}</span><span className="preset-radio">{input.preset === id && <CheckCircle2 size={17}/>}</span></span><strong>{item.name}</strong><p>{item.thesis}</p><span className="preset-end">{id === 'long' ? '16 SEGMENTS' : id === 'momentum' ? 'TWO CURVE STAGES' : id === 'discovery' ? 'DECAYING FEE' : 'FIXED FEE'} <ArrowRight size={15}/></span></button>)}</div>

        <div className="studio-work-grid">
          <div className="studio-editor"><div className="panel-title"><SlidersHorizontal size={20}/><div><h3>Shape the launch</h3><p>Quote: {quoteId} · Base token: SPL · Graduation: DAMM v2</p></div></div>
            <div className="studio-input-grid">{inputFields.map(field => <label key={field.key}><span>{field.label}<span className="field-help" title={field.help}><Info size={13}/></span></span><div className="studio-input"><input type="number" disabled={launchLocked} min={field.min} step={field.step} value={input[field.key]} onChange={event => change(field.key, event.target.value)}/><span>{field.unit === 'quote' ? quoteId : field.unit}</span></div></label>)}</div>
            <p className="editor-footnote">Config values describe your DBC launch economics. The wallet flow below creates the config and token pool.</p>
            <p className="allocation-note">Leftover allocation: <strong>{input.preset === 'momentum' ? '35%' : '0.001%'} of supply</strong>, with your launch wallet set as the receiver. DAMM v2 starts with a 1% base trading fee plus a dynamic fee after graduation.</p>
            {result.config && <CurveChart config={result.config} supply={input.supply} quoteDecimals={quoteAsset.decimals} symbol={quoteId}/>}
          </div>
          <div className="studio-output"><div className="panel-title"><Rocket size={20}/><div><h3>SDK result</h3><p>Recomputed whenever you change the design</p></div></div>
            {result.config && result.summary ? <>
              <div className="result-hero"><span>GRADUATION QUOTE THRESHOLD</span><strong>{comma(result.summary.migrationQuoteThreshold)} <small>{quoteId}</small></strong><p>Meteora's curve builder computes the quote reserve needed before DAMM v2 migration.</p></div>
              <div className="studio-metrics"><div><span>OPENING VALUE</span><strong>{comma(input.initialMarketCap)} {quoteId}</strong></div><div><span>GRADUATION VALUE</span><strong>{comma(input.migrationMarketCap)} {quoteId}</strong></div><div><span>TRADING FEE</span><strong>{input.startingFeeBps / 100}% → {input.endingFeeBps / 100}%</strong></div><div><span>LIQUIDITY LOCK</span><strong>{input.partnerLockedPct}% permanent</strong></div></div>
              <div className="migration-flow"><span>DBC<br/><small>Price discovery</small></span><span className="flow-arrow">→</span><span>DAMM v2<br/><small>Graduated liquidity</small></span></div>
              <div className="prelaunch-scenario"><div className="scenario-title"><strong>Pre-launch buy simulation</strong><span>OFFICIAL DBC QUOTE MATH</span></div><div className="scenario-fields"><label>Buy amount<div className="studio-input"><input aria-label="Pre-launch buy amount" type="number" min="0.00000001" step="0.1" value={buyAmount} onChange={event => setBuyAmount(event.target.value)}/><span>{quoteId}</span></div></label><label>Hours after opening<div className="studio-input"><input aria-label="Hours after opening" type="number" min="0" max="720" step="1" value={elapsedHours} onChange={event => setElapsedHours(event.target.value)}/><span>hours</span></div></label></div>{scenario.quote ? <div className="scenario-result"><div><span>ESTIMATED TOKENS</span><strong>{comma(Number(scenario.quote.outputTokens))}</strong></div><div><span>TOTAL DBC FEE</span><strong>{scenario.quote.totalFeeQuote} {quoteId}</strong></div><div><span>UNFILLED INPUT</span><strong>{scenario.quote.unfilledQuote} {quoteId}</strong></div></div> : <p className="scenario-error">{scenario.error}</p>}<p>Hypothetical quote with zero earlier buys. Real reserves and outcomes change after launch.</p></div>
              <div className="studio-actions"><button onClick={exportConfig}><Download size={17}/> Download SDK config JSON</button><button onClick={shareDesign}><Copy size={17}/> Copy design link</button></div>
              {shareMessage && <p className="shared-design-note" role="status">{shareMessage}</p>}
            </> : <div className="config-error">{result.error}</div>}
          </div>
        </div>
        <CurveComparison input={input} amount={buyAmount} elapsedHours={Number(elapsedHours)} symbol={quoteId} quoteDecimals={quoteAsset.decimals} locked={launchLocked} onChoose={preset => setInput(current => ({ ...current, preset }))}/>
        <LaunchPanel key={quoteId} config={result.config} quoteAsset={quoteAsset} onLockChange={setLaunchLocked} onCreated={(address, label) => {
          const pool = { address, network: quoteAsset.network }
          observePool(pool, label); setCreatedPool(pool)
        }}/>
        <PoolLibrary pools={savedPools} onOpen={openPool} onRemove={removePool} warning={storageWarning}/>
        {linkedPool.error && <p className="publish-error" role="alert">{linkedPool.error}</p>}
        <LifecyclePanel key={createdPool ? `${createdPool.network}:${createdPool.address}` : 'empty'} initialPool={createdPool} onObserved={observePool}/>
      </section>
      <section className="studio-how" id="how"><div className="studio-section-head"><span>06 / PRODUCT FLOW</span><h2>From pair design to DBC pool.</h2><p>The config and pool launch are real SDK operations. Check the quote reserve, graduate an eligible pool, and follow its liquidity into DAMM v2.</p></div><div className="how-grid"><article><span>01</span><Code2 size={24}/><h3>Verify the quote</h3><p>Stock mint decimals and Meteora token badge are rechecked on Solana mainnet before construction.</p></article><article><span>02</span><Rocket size={24}/><h3>Create the launch</h3><p>Create config, token mint and DBC pool. Long curves use two wallet approvals; smaller designs can use one.</p></article><article><span>03</span><Layers3 size={24}/><h3>Track graduation</h3><p>Track the reserve threshold, submit graduation, and inspect the resulting DAMM v2 vault balances.</p></article></div></section>
    </main>
    <footer className="studio-footer"><span>curve<span>covenant</span> / Pair Launch</span><span>Independent tool. Not affiliated with Meteora or the stock issuer.</span><a href={`${import.meta.env.BASE_URL}?view=inspector`}>Live pool inspector <ArrowRight size={14}/></a></footer>
  </div>
}

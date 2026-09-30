import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { ConfigParameters } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { ArrowRight, CheckCircle2, ExternalLink, Loader2, Rocket } from 'lucide-react'
import { launchPrepared, prepareLaunch, finishLaunch, IncompleteLaunchError, LaunchNotCreatedError } from './publish'
import type { PendingLaunch, PreparedLaunch } from './publish'
import type { QuoteAsset } from './quotes'
import { walletError } from './wallet'
import { TransactionOutcomeError } from './confirmation'
import { formatUnits } from './dbc'
import { RPC_SETTINGS_CHANGED } from './rpc-settings'

const sol = (lamports: number) => formatUnits(String(lamports), 9)
export default function LaunchPanel({ config, quoteAsset, designUrl, onCreated, onLockChange, recoveryBlocked = false, externalBusy = false }: { recoveryBlocked?: boolean; externalBusy?: boolean; config: ConfigParameters | null; quoteAsset: QuoteAsset; designUrl: string; onCreated: (address: string, label: string) => void; onLockChange: (locked: boolean) => void }) {
  const [name, setName] = useState(quoteAsset.network === 'devnet' ? 'Curve Covenant Demo' : '')
  const [symbol, setSymbol] = useState(quoteAsset.network === 'devnet' ? 'CCDEMO' : '')
  const [metadataUri, setMetadataUri] = useState(quoteAsset.network === 'devnet' ? 'https://furkanefecancaglar.github.io/curve-covenant/metadata/demo-token.json' : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  const [connected, setConnected] = useState<{ address: string; balance: number } | null>(null)
  const [prepared, setPrepared] = useState<PreparedLaunch | null>(null)
  const [pending, setPending] = useState<PendingLaunch | null>(null)
  const [mainnetAcknowledged, setMainnetAcknowledged] = useState(false)
  const [launched, setLaunched] = useState<Awaited<ReturnType<typeof launchPrepared>> | null>(null)
  const isMainnet = quoteAsset.network === 'mainnet-beta'
  const cluster = isMainnet ? '' : '?cluster=devnet'
  const networkLabel = isMainnet ? 'mainnet' : 'devnet'
  const threshold = config ? formatUnits(config.migrationQuoteThreshold.toString(), quoteAsset.decimals) : null
  const browseUrl = `https://phantom.app/ul/browse/${encodeURIComponent(designUrl)}?ref=${encodeURIComponent(window.location.origin)}`
  useEffect(() => { onLockChange(busy || !!pending) }, [busy, pending, onLockChange])
  useEffect(() => { setPrepared(null); setError(''); setProgress(''); setMainnetAcknowledged(false) }, [config, name, symbol, metadataUri])

  useEffect(() => {
    const invalidate = () => { setPrepared(null); setMainnetAcknowledged(false) }
    window.addEventListener(RPC_SETTINGS_CHANGED, invalidate)
    return () => window.removeEventListener(RPC_SETTINGS_CHANGED, invalidate)
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (externalBusy || (recoveryBlocked && !pending) || (!config && !pending) || busy || ((prepared || pending) && isMainnet && !mainnetAcknowledged)) return
    setBusy(true); setError(''); setProgress('')
    try {
      if (!pending && !prepared) {
        setProgress('Open Phantom to connect. Then we check your balance and simulate the launch. No signature is requested yet.')
        const result = await prepareLaunch(config!, { name, symbol, metadataUri }, quoteAsset, (address, balance) => {
          setConnected({ address, balance }); setProgress('Wallet connected. Checking the transaction on Solana…')
        })
        setPrepared(result); setProgress('Network check passed. Review the estimated debit below, then launch.')
        return
      }
      const result = pending ? await finishLaunch(pending) : await launchPrepared(prepared!, setProgress)
      setLaunched(result); setPending(null); setPrepared(null); setProgress(''); onCreated(result.poolAddress, `${name} / ${quoteAsset.id}`)
    } catch (issue) {
      if (issue instanceof IncompleteLaunchError) setPending(issue.pending)
      if (issue instanceof TransactionOutcomeError && issue.state !== 'pending') setPrepared(null)
      if (issue instanceof LaunchNotCreatedError) { setPending(null); setPrepared(null) }
      setError(walletError(issue)); setProgress('')
    } finally { setBusy(false) }
  }

  return <section className="launch-panel" id="launch">
    <div className="launch-panel-head"><div><span>03 / {isMainnet ? 'MAINNET LAUNCH' : 'DEVNET REHEARSAL'}</span><h2>Launch a {quoteAsset.id}-paired token.</h2><p>Connect Phantom, check the cost, then approve creation. {isMainnet ? 'This uses real SOL for rent and fees.' : 'This uses free test SOL. Keep Phantom set to Solana Devnet.'} Longer curves need two transaction approvals.</p></div></div>
    <ol className="launch-steps" aria-label="Launch progress"><li aria-current={!prepared && !pending && !launched ? 'step' : undefined}>1. Connect & check</li><li aria-current={prepared || pending ? 'step' : undefined}>2. Review & launch</li><li aria-current={launched ? 'step' : undefined}>3. Trade & graduate</li></ol>
    {!launched && <div className="launch-help"><strong>Using Phantom on your phone?</strong><p>Open this design inside Phantom to connect your wallet. On desktop, use a browser with the Phantom extension enabled.</p><a href={browseUrl}>Open this design in Phantom <ExternalLink size={14}/></a>{!isMainnet && <a href="https://faucet.solana.com/" target="_blank" rel="noreferrer">Get free devnet SOL <ExternalLink size={14}/></a>}</div>}
    {connected && !launched && <div className="launch-wallet"><span>Connected wallet · {networkLabel}</span><strong>{sol(connected.balance)} {isMainnet ? 'SOL' : 'test SOL'}</strong><small>{connected.address}</small></div>}
    {threshold && !launched && <p className="allocation-note">Graduation needs <strong>{threshold} {quoteAsset.id}</strong> in the pool reserve. This is trading liquidity accumulated after launch, separate from creation costs. {quoteAsset.id === 'SOL' && connected && Number(threshold) >= connected.balance / 1e9 && 'Your current balance cannot fund this threshold alone. Choose the small devnet rehearsal above, or plan for additional buyers.'}</p>}
    {recoveryBlocked && !pending && !busy && !launched && <p className="shared-design-note" role="status">A previous {quoteAsset.id} launch needs checking. <a href="#unfinished-launches">Continue your saved launch above</a> before starting another.</p>}
    {!launched && <form className="launch-form" onSubmit={submit}>
      <label>Token name<input disabled={busy || !!pending} value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Research Commons" maxLength={32} required/></label>
      <label>Ticker<input disabled={busy || !!pending} value={symbol} onChange={event => setSymbol(event.target.value.toUpperCase())} placeholder="e.g. RES" maxLength={10} required/></label>
      <label className="metadata-label">Public metadata JSON URL<input disabled={busy || !!pending} value={metadataUri} onChange={event => setMetadataUri(event.target.value)} placeholder="https://example.com/token-metadata.json" type="url" required/><small>{isMainnet ? 'Host JSON with matching name, symbol and image at an HTTPS URL.' : 'The CCDEMO test metadata is ready to use. Keep the demo name and ticker for this rehearsal.'}</small></label>
      {prepared && <div className="launch-review" role="region" aria-label="Launch cost review"><h3>Network check passed</h3>{prepared.quoteBalance !== null && <p>Available for trading: <strong>{prepared.quoteBalance} {quoteAsset.id}</strong>. {Number(prepared.quoteBalance) === 0 && 'You can create the pool, but this wallet needs quote tokens before it can buy.'}</p>}<div className="launch-costs"><div><span>{prepared.plan.mode === 'split' ? 'Step 1 · config only' : 'Config + token + pool'}</span><strong>{sol(prepared.review.estimatedDebitLamports)} SOL</strong></div><div><span>Network fee included</span><strong>{sol(prepared.review.networkFeeLamports)} SOL</strong></div><div><span>Estimated balance after this step</span><strong>{sol(prepared.review.remainingLamports)} SOL</strong></div></div><p>{prepared.plan.mode === 'split' ? 'The second approval creates the token and pool and costs additional SOL. It is checked after the configuration confirms; review its amount in Phantom.' : 'One transaction approval creates all three accounts. The estimate includes account rent and the network fee.'} Checked at {new Date(prepared.review.checkedAt).toLocaleTimeString()}; checked again before signing.</p><button type="button" disabled={busy} onClick={() => { setPrepared(null); setProgress(''); setMainnetAcknowledged(false) }}>Change wallet or recheck</button></div>}
      {isMainnet && (prepared || pending) && <label className="mainnet-confirm"><input type="checkbox" disabled={busy} checked={mainnetAcknowledged} onChange={event => setMainnetAcknowledged(event.target.checked)}/> I understand that this creates a real mainnet token and spends SOL for rent and fees.</label>}
      <button type="submit" disabled={externalBusy || (recoveryBlocked && !pending) || (!config && !pending) || busy || (!!(prepared || pending) && isMainnet && !mainnetAcknowledged)}>{busy ? <Loader2 size={17} className="spin"/> : <Rocket size={17}/>} {busy ? 'Waiting for wallet / network…' : pending ? 'Resume token creation' : prepared ? `Launch token + DBC pool on ${networkLabel}` : 'Check launch with Phantom'}</button>
    </form>}
    {progress && <p className="shared-design-note" role="status">{progress}</p>}
    {pending && <p className="allocation-note">Your launch receipt is saved in this browser. Resume here to keep the same mint address, or reopen this page to check the saved launch. <a href={`https://solscan.io/tx/${pending.signature ?? pending.configSignature}${cluster}`} target="_blank" rel="noreferrer">View tracked transaction</a></p>}
    {error && <div className="publish-error" role="alert">{error}</div>}
    {launched && <><div className="launch-success"><CheckCircle2 size={20}/><div><strong>DBC pool created on {networkLabel}</strong><a href={`https://solscan.io/tx/${launched.signature}${cluster}`} target="_blank" rel="noreferrer">Confirmed launch transaction <ExternalLink size={13}/></a><a href={`https://solscan.io/account/${launched.poolAddress}${cluster}`} target="_blank" rel="noreferrer">Pool {launched.poolAddress} <ExternalLink size={13}/></a><a href={`https://solscan.io/token/${launched.mintAddress}${cluster}`} target="_blank" rel="noreferrer">Token mint {launched.mintAddress} <ExternalLink size={13}/></a></div></div><p>Your pool is ready. Read your wallet balances, quote a small buy, then try a sale before filling the graduation reserve.</p><a className="track-created-pool" href="#graduate">Continue to balances, buy & sell <ArrowRight size={16}/></a><button className="new-launch" onClick={() => { setLaunched(null); setConnected(null); setMainnetAcknowledged(false) }}>Create another pool</button></>}
  </section>
}

import { useState } from 'react'
import type { FormEvent } from 'react'
import type { ConfigParameters } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { ArrowRight, CheckCircle2, ExternalLink, Loader2, Rocket } from 'lucide-react'
import { launchPool } from './publish'
import type { QuoteAsset } from './quotes'

export default function LaunchPanel({ config, quoteAsset }: { config: ConfigParameters | null; quoteAsset: QuoteAsset }) {
  const [name, setName] = useState(quoteAsset.network === 'devnet' ? 'Curve Covenant Demo' : '')
  const [symbol, setSymbol] = useState(quoteAsset.network === 'devnet' ? 'CCDEMO' : '')
  const [metadataUri, setMetadataUri] = useState(quoteAsset.network === 'devnet' ? 'https://furkanefecancaglar.github.io/curve-covenant/metadata/demo-token.json' : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [mainnetAcknowledged, setMainnetAcknowledged] = useState(false)
  const [launched, setLaunched] = useState<Awaited<ReturnType<typeof launchPool>> | null>(null)
  const isMainnet = quoteAsset.network === 'mainnet-beta'
  const cluster = isMainnet ? '' : '?cluster=devnet'
  const networkLabel = isMainnet ? 'mainnet' : 'devnet'

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!config || (isMainnet && !mainnetAcknowledged)) return
    setBusy(true); setError(''); setLaunched(null)
    try { setLaunched(await launchPool(config, { name, symbol, metadataUri }, quoteAsset)) }
    catch (issue) { setError(issue instanceof Error ? issue.message : 'Launch failed.') }
    finally { setBusy(false) }
  }

  return <section className="launch-panel" id="launch">
    <div className="launch-panel-head"><div><span>03 / CREATE A REAL POOL</span><h2>Launch a {quoteAsset.id}-paired token.</h2><p>The official SDK creates the DBC config, SPL token mint and virtual pool in one wallet-confirmed transaction. The new token trades against {quoteAsset.name} on {networkLabel}.</p></div><div className="launch-panel-flow"><span>CONFIG</span><ArrowRight size={15}/><span>TOKEN MINT</span><ArrowRight size={15}/><span>DBC POOL</span></div></div>
    <form className="launch-form" onSubmit={submit}>
      <label>Token name<input value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Research Commons" maxLength={32} required/></label>
      <label>Ticker<input value={symbol} onChange={event => setSymbol(event.target.value.toUpperCase())} placeholder="e.g. RES" maxLength={10} required/></label>
      <label className="metadata-label">Public metadata JSON URL<input value={metadataUri} onChange={event => setMetadataUri(event.target.value)} placeholder="https://example.com/token-metadata.json" type="url" required/><small>Host JSON with name, symbol and image at an HTTPS URL you control. This URL is stored on chain.</small></label>
      {isMainnet && <label className="mainnet-confirm"><input type="checkbox" checked={mainnetAcknowledged} onChange={event => setMainnetAcknowledged(event.target.checked)}/> I understand that this creates a real mainnet token and spends SOL for rent and fees.</label>}
      <button type="submit" disabled={!config || busy || (isMainnet && !mainnetAcknowledged)}>{busy ? <Loader2 size={17} className="spin"/> : <Rocket size={17}/>} Launch token + DBC pool on {networkLabel}</button>
    </form>
    <p className="launch-caution">Set Phantom to Solana {networkLabel}. Review the transaction before confirming. The token is paired with {quoteAsset.id}; it does not represent equity in {quoteAsset.name}. {isMainnet ? 'The issuer mint and Meteora token badge are checked from chain before the transaction is built.' : 'CCDEMO is a devnet-only example. Devnet SOL is required for account rent and fees.'}</p>
    {error && <div className="publish-error">{error}</div>}
    {launched && <div className="launch-success"><CheckCircle2 size={20}/><div><strong>DBC pool created on {networkLabel}</strong><a href={`https://solscan.io/account/${launched.poolAddress}${cluster}`} target="_blank" rel="noreferrer">Pool {launched.poolAddress} <ExternalLink size={13}/></a><a href={`https://solscan.io/token/${launched.mintAddress}${cluster}`} target="_blank" rel="noreferrer">Token mint {launched.mintAddress} <ExternalLink size={13}/></a></div></div>}
  </section>
}

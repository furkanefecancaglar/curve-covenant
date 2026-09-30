import { useEffect, useState } from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { QUOTES, quoteSymbol } from './quotes'
import { formatUnits } from './dbc'
import { archiveLaunchReceipt, removeLaunchReceipt } from './launch-receipts'
import type { LaunchReceipt } from './launch-receipts'
import { inspectLaunchReceipt, prepareLaunchRecovery, resumeLaunchRecovery } from './launch-recovery'
import type { PreparedRecovery, RecoveryState } from './launch-recovery'
import { walletError } from './wallet'
import type { Network } from './dbc'

type Props = { receipts: LaunchReceipt[]; locked: boolean; onBusy: (busy: boolean) => void;
  onRecovered: (pool: { address: string; network: Network }, label: string) => void }
function RecoveryCard({ receipt, locked, onBusy, onRecovered }: Omit<Props, 'receipts'> & { receipt: LaunchReceipt }) {
  const [state, setState] = useState<RecoveryState | null>(null)
  const [prepared, setPrepared] = useState<PreparedRecovery | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const quote = QUOTES[receipt.quoteId]
  const cluster = quote.network === 'devnet' ? '?cluster=devnet' : ''
  useEffect(() => { setState(null); setPrepared(null); setAcknowledged(false) }, [receipt])
  async function action(kind: 'check' | 'prepare' | 'resume') {
    if (locked || busy || (kind === 'resume' && quote.network !== 'devnet' && !acknowledged)) return
    setBusy(true); onBusy(true); setError('')
    try {
      if (kind === 'check') { setPrepared(null); setState(await inspectLaunchReceipt(receipt)) }
      if (kind === 'prepare') { setPrepared(await prepareLaunchRecovery(receipt)); setAcknowledged(false) }
      if (kind === 'resume' && prepared) {
        const address = await resumeLaunchRecovery(prepared)
        onRecovered({ address, network: quote.network }, `${receipt.identity.name} / ${quoteSymbol(quote)}`)
      }
    } catch (issue) { setError(walletError(issue)); setPrepared(null) }
    finally { setBusy(false); onBusy(false) }
  }
  function openCreated() {
    if (state?.kind !== 'created' || locked || busy) return
    try {
      archiveLaunchReceipt(receipt, state.poolAddress)
      onRecovered({ address: state.poolAddress, network: quote.network }, `${receipt.identity.name} / ${quoteSymbol(quote)}`)
    } catch (issue) { setError(walletError(issue)) }
  }
  return <article className="recovery-card" aria-label={`Recover ${receipt.identity.symbol} launch`}>
    <div className="saved-pool-top"><strong>{receipt.identity.name} · {receipt.identity.symbol} / {quoteSymbol(quote)}</strong><span>{quote.network === 'devnet' ? 'DEVNET' : 'MAINNET'}</span></div>
    <p>Wallet: <span className="saved-address">{receipt.payer}</span></p>
    <a href={`https://solscan.io/account/${receipt.configAddress}${cluster}`} target="_blank" rel="noreferrer">Saved curve configuration <ExternalLink size={13}/></a>
    <a href={`https://solscan.io/tx/${(receipt.poolAttempt ?? receipt.configAttempt).signature}${cluster}`} target="_blank" rel="noreferrer">Last tracked transaction <ExternalLink size={13}/></a>
    {state?.kind === 'pending' && <p role="status">{state.message}</p>}
    {state?.kind === 'created' && <><p>The token and pool already exist. Open them to continue trading.</p><button disabled={locked || busy} onClick={openCreated}>Open recovered pool</button></>}
    {state?.kind === 'not-created' && <><p>The configuration transaction failed or expired and no configuration was found. Start again from the launch form.</p><button disabled={locked || busy} onClick={() => { try { removeLaunchReceipt(receipt) } catch (issue) { setError(walletError(issue)) } }}>Dismiss checked attempt</button></>}
    {state?.kind === 'config-only' && <><p>Your curve configuration is already paid for. Graduation reserve: {state.threshold} {quoteSymbol(quote)}.</p><p>Continue with the same on-chain curve and token metadata. Because the tab was closed, token creation will use a new mint address.</p>
      {!prepared && <button disabled={locked || busy} onClick={() => void action('prepare')}>Check remaining launch cost</button>}</>}
    {prepared && <div className="migration-review" role="region" aria-label="Recovered launch cost review"><strong>Token + pool: {formatUnits(String(prepared.review.estimatedDebitLamports), 9)} SOL</strong><p>Includes rent and network fees for this step. The saved configuration is reused. Estimated balance afterwards: {formatUnits(String(prepared.review.remainingLamports), 9)} SOL.</p><small>New mint: <span className="saved-address">{prepared.mint.publicKey.toBase58()}</span></small>
      {quote.network !== 'devnet' && <label className="mainnet-confirm"><input type="checkbox" checked={acknowledged} disabled={locked || busy} onChange={event => setAcknowledged(event.target.checked)}/> I understand this spends real mainnet SOL to create the token and pool.</label>}
      <button disabled={locked || busy || (quote.network !== 'devnet' && !acknowledged)} onClick={() => void action('resume')}>Finish saved launch with wallet</button></div>}
    <button disabled={locked || busy} onClick={() => void action('check')}><RefreshCw size={14}/>{busy ? 'Checking wallet / network…' : 'Check saved launch'}</button>
    {error && <p className="publish-error" role="alert">{error}</p>}
  </article>
}
export default function LaunchRecoveryPanel(props: Props) {
  if (!props.receipts.length) return null
  return <section className="launch-recovery" id="unfinished-launches" aria-label="Unfinished launches"><h2>Continue an unfinished launch.</h2><p>These transaction references are saved in this browser. Check the chain to find an existing pool or finish a configuration you already paid for.</p>{props.receipts.map(receipt => <RecoveryCard key={receipt.configAddress} receipt={receipt} locked={props.locked} onBusy={props.onBusy} onRecovered={props.onRecovered}/>)}</section>
}

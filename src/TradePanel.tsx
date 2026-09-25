import { useState } from 'react'
import type { Network } from './dbc'
import { executeBuy, previewBuy } from './trade'
import type { TradePreview } from './trade'
import { ArrowRight, ExternalLink } from 'lucide-react'

export default function TradePanel({ pool, network, onTrade }: { pool: string; network: Network; onTrade: () => Promise<void> }) {
  const [amount, setAmount] = useState('1')
  const [preview, setPreview] = useState<TradePreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [signature, setSignature] = useState('')
  async function quote() {
    setBusy(true); setPreview(null); setError(''); setSignature('')
    try { setPreview(await previewBuy(pool, network, amount)) }
    catch (issue) { setError(issue instanceof Error ? issue.message : 'Could not quote this buy.') }
    finally { setBusy(false) }
  }
  async function buy() {
    if (!preview) return
    setBusy(true); setError('')
    try {
      const result = await executeBuy(preview)
      setSignature(result); setPreview(null)
      await onTrade()
    } catch (issue) { setError(issue instanceof Error ? issue.message : 'Buy failed.') }
    finally { setBusy(false) }
  }
  return <div className="trade-panel"><h3>Buy from this DBC pool</h3><p>Get a live quote, review the minimum output, then confirm with your wallet.</p>
    <form onSubmit={event => { event.preventDefault(); void quote() }}><label>Amount in quote tokens<input aria-label="Live buy amount" inputMode="decimal" value={amount} disabled={busy} onChange={event => { setAmount(event.target.value); setPreview(null); setSignature('') }}/></label><button disabled={busy || !amount.trim()}>Get buy quote</button></form>
    {preview && <div className="trade-preview"><div><span>ESTIMATED TOKENS</span><strong>{Number(preview.quote.estimatedTokens).toLocaleString('en-US', { maximumFractionDigits: 6 })}</strong></div><div><span>MINIMUM TOKENS · 1% SLIPPAGE</span><strong>{preview.quote.minimumTokens}</strong></div><p>Input budget: {preview.quote.input} {preview.quote.quoteSymbol}. Estimated unfilled input at graduation: {preview.quote.unfilledInput} {preview.quote.quoteSymbol}. Quote expires after 60 seconds.</p><p>Your wallet spends the filled quote-token amount plus SOL network fees on {network === 'devnet' ? 'devnet' : 'mainnet'}. The transaction enforces the displayed minimum output.</p><button disabled={busy} onClick={buy}>Buy with wallet <ArrowRight size={16}/></button></div>}
    {error && <p className="publish-error" role="alert">{error}</p>}
    {signature && <a href={`https://solscan.io/tx/${signature}${network === 'devnet' ? '?cluster=devnet' : ''}`} target="_blank" rel="noreferrer">Buy confirmed · view transaction <ExternalLink size={14}/></a>}
  </div>
}

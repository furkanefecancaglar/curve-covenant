import { useState } from 'react'
import type { Network, TradeSide } from './dbc'
import { executeTrade, previewTrade } from './trade'
import type { TradePreview } from './trade'
import { ArrowRight, ExternalLink } from 'lucide-react'
import { connectWallet, walletError } from './wallet'
import { readPoolBalances } from './balances'
import { formatUnits, parseUnits } from './dbc'

export default function TradePanel({ pool, network, onTrade }: { pool: string; network: Network; onTrade: () => Promise<void> }) {
  const [side, setSide] = useState<TradeSide>('buy')
  const [amount, setAmount] = useState(network === 'devnet' ? '0.1' : '')
  const [preview, setPreview] = useState<TradePreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [signature, setSignature] = useState('')
  const action = side === 'buy' ? 'Buy' : 'Sell'
  function changeSide(value: TradeSide) { setSide(value); setPreview(null); setSignature(''); setError(''); setAmount(value === 'buy' && network === 'devnet' ? '0.1' : '') }
  async function halfBalance() {
    setBusy(true); setError(''); setPreview(null); setSignature('')
    try {
      const { publicKey } = await connectWallet()
      const balances = await readPoolBalances(pool, network, publicKey)
      if (Number(balances.base.amount) === 0) throw new Error('This wallet has no base tokens to sell. Buy a small amount first, or connect the wallet that holds them.')
      const half = BigInt(parseUnits(balances.base.amount, balances.base.decimals)) / 2n
      if (half === 0n) throw new Error('Your balance is too small to split in half. Enter an amount within your balance.')
      setAmount(formatUnits(half.toString(), balances.base.decimals))
    } catch (issue) { setError(walletError(issue)) }
    finally { setBusy(false) }
  }
  async function quote() {
    setBusy(true); setPreview(null); setError(''); setSignature('')
    try { setPreview(await previewTrade(pool, network, amount, side)) }
    catch (issue) { setError(issue instanceof Error ? issue.message : 'Could not quote this trade.') }
    finally { setBusy(false) }
  }
  async function trade() {
    if (!preview) return
    setBusy(true); setError('')
    try {
      const result = await executeTrade(preview)
      setSignature(result); setPreview(null)
      try { await onTrade() } catch { setError('Trade confirmed, but pool refresh failed. Read the pool again to update reserves and balances.') }
    } catch (issue) { setError(issue instanceof Error ? issue.message : 'Trade failed.') }
    finally { setBusy(false) }
  }
  return <div className="trade-panel"><h3>Trade in this DBC pool</h3><p>Get a live quote, review the minimum output, then confirm with your wallet.</p>
    <div className="trade-sides" role="group" aria-label="Trade direction">{(['buy', 'sell'] as const).map(value => <button key={value} aria-pressed={side === value} disabled={busy} onClick={() => changeSide(value)}>{value === 'buy' ? 'Buy' : 'Sell'}</button>)}</div>
    {side === 'sell' && <button disabled={busy} onClick={() => void halfBalance()}>Use half my token balance</button>}
    <form onSubmit={event => { event.preventDefault(); void quote() }}><label>Amount in {side === 'buy' ? 'quote' : 'base'} tokens<input aria-label={`Live ${side} amount`} inputMode="decimal" value={amount} disabled={busy} onChange={event => { setAmount(event.target.value); setPreview(null); setSignature('') }}/></label><button disabled={busy || !amount.trim()}>Get {side} quote</button></form>
    {preview && <div className="trade-preview"><div><span>ESTIMATED OUTPUT · {preview.quote.outputSymbol}</span><strong>{preview.quote.estimatedOutput}</strong></div><div><span>MINIMUM OUTPUT · 1% SLIPPAGE · {preview.quote.outputSymbol}</span><strong>{preview.quote.minimumOutput}</strong></div><p>Input budget: {preview.quote.input} {preview.quote.inputSymbol}. Estimated unfilled input: {preview.quote.unfilledInput} {preview.quote.inputSymbol}. Quote expires after 60 seconds.</p><p>Trading fee: {preview.quote.tradingFee} {preview.quote.feeAsset}. Protocol fee: {preview.quote.protocolFee} {preview.quote.feeAsset}.</p><p>Your wallet spends the filled input amount plus SOL network fees on {network === 'devnet' ? 'devnet' : 'mainnet'}. The transaction enforces the displayed minimum output.</p><button disabled={busy} onClick={trade}>{action} with wallet <ArrowRight size={16}/></button></div>}
    {error && <p className="publish-error" role="alert">{error}</p>}
    {signature && <a href={`https://solscan.io/tx/${signature}${network === 'devnet' ? '?cluster=devnet' : ''}`} target="_blank" rel="noreferrer">{action} confirmed · view transaction <ExternalLink size={14}/></a>}
  </div>
}

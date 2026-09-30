import { useEffect, useState } from 'react'
import { Connection } from '@solana/web3.js'
import type { Network, TradeSide } from './dbc'
import { executeTrade, previewTrade } from './trade'
import type { TradePreview } from './trade'
import { ArrowRight, ExternalLink } from 'lucide-react'
import { connectWallet, walletError } from './wallet'
import { readPoolBalances } from './balances'
import { formatUnits, parseUnits, RPC } from './dbc'
import { readTransactionOutcome, TransactionOutcomeError } from './confirmation'
import { loadPendingTrade, pendingTradeKey, removePendingTrade, savePendingTrade } from './pending-trade'
import type { PendingTrade } from './pending-trade'

export default function TradePanel({ pool, network, onTrade }: { pool: string; network: Network; onTrade: () => Promise<void> }) {
  const [side, setSide] = useState<TradeSide>('buy')
  const [amount, setAmount] = useState(network === 'devnet' ? '0.1' : '')
  const [preview, setPreview] = useState<TradePreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<{ signature: string; label: string } | null>(null)
  const [pending, setPending] = useState<PendingTrade | null>(() => loadPendingTrade(pool, network))
  const [storageWarning, setStorageWarning] = useState('')
  const action = side === 'buy' ? 'Buy' : 'Sell'
  const locked = busy || !!pending
  const explorer = (signature: string) => `https://solscan.io/tx/${signature}${network === 'devnet' ? '?cluster=devnet' : ''}`
  useEffect(() => {
    function sync(event: StorageEvent) {
      if (event.key === pendingTradeKey(pool, network)) setPending(loadPendingTrade(pool, network))
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [pool, network])
  function unresolved() {
    const current = loadPendingTrade(pool, network) ?? pending
    if (current) { setPending(current); setPreview(null); return true }
    return false
  }
  function changeSide(value: TradeSide) { if (locked) return; setSide(value); setPreview(null); setReceipt(null); setError(''); setAmount(value === 'buy' && network === 'devnet' ? '0.1' : '') }
  async function halfBalance() {
    if (busy || unresolved()) return
    setBusy(true); setError(''); setPreview(null); setReceipt(null)
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
    if (busy || unresolved()) return
    setBusy(true); setPreview(null); setError(''); setReceipt(null)
    try { setPreview(await previewTrade(pool, network, amount, side)) }
    catch (issue) { setError(walletError(issue)) }
    finally { setBusy(false) }
  }
  async function refreshAfterTrade() {
    try { await onTrade() } catch { setError('Trade confirmed, but pool refresh failed. Read the pool again to update reserves and balances.') }
  }
  async function checkPending() {
    if (!pending || busy) return
    setBusy(true); setError('')
    try {
      const outcome = await readTransactionOutcome(new Connection(RPC[network], { commitment: 'confirmed', disableRetryOnRateLimit: true }), pending.attempt)
      if (outcome.state === 'pending') { setError('This trade is still unconfirmed. Keep its receipt and check again; no new trade has been sent.'); return }
      removePendingTrade(pending); setPending(null); setPreview(null)
      setReceipt({ signature: pending.attempt.signature, label: `${pending.side === 'buy' ? 'Buy' : 'Sell'} ${outcome.state}` })
      if (outcome.state === 'confirmed') await refreshAfterTrade()
      else setError(new TransactionOutcomeError(pending.attempt, outcome.state, outcome.error).message)
    } catch (issue) { setError(walletError(issue)) }
    finally { setBusy(false) }
  }
  async function trade() {
    if (!preview || busy || unresolved()) return
    setBusy(true); setError(''); setStorageWarning('')
    let attempted: PendingTrade | null = null
    try {
      const result = await executeTrade(preview, (_signature, attempt) => {
        // Check again after wallet approval in case another tab started a trade.
        const previous = loadPendingTrade(pool, network)
        if (previous) { setPending(previous); throw new Error('Another trade for this pool is unresolved. Check its receipt before sending a new one.') }
        attempted = { pool, network, side: preview.quote.side, input: preview.quote.input, inputSymbol: preview.quote.inputSymbol, attempt }
        if (!savePendingTrade(attempted)) setStorageWarning('This browser cannot save the receipt. Keep this tab open until the trade status is confirmed.')
        setPending(attempted); setPreview(null)
      })
      if (attempted) removePendingTrade(attempted)
      setPending(null); setReceipt({ signature: result, label: `${action} confirmed` }); setPreview(null)
      await refreshAfterTrade()
    } catch (issue) {
      if (issue instanceof TransactionOutcomeError && issue.state !== 'pending') {
        if (attempted) removePendingTrade(attempted)
        setPending(null); setPreview(null)
        setReceipt({ signature: issue.attempt.signature, label: `${action} ${issue.state}` })
      }
      setError(walletError(issue))
    } finally { setBusy(false) }
  }
  return <div className="trade-panel"><h3>Trade in this DBC pool</h3><p>Get a live quote, review the minimum output, then confirm with your wallet.</p>
    {pending && <div className="pending-trade" role="region" aria-label="Unconfirmed trade"><strong>Check your previous {pending.side} before trading again.</strong><p>{pending.input} {pending.inputSymbol} · signed at {new Date(pending.attempt.startedAt).toLocaleTimeString()}. Its outcome is not yet verified.</p><a href={explorer(pending.attempt.signature)} target="_blank" rel="noreferrer">View tracked transaction <ExternalLink size={14}/></a><button disabled={busy} onClick={() => void checkPending()}>{busy ? 'Waiting for transaction status…' : 'Check trade status'}</button><p>Checking reads the existing transaction. It does not request another signature or send another trade.</p></div>}
    {storageWarning && <p className="allocation-note" role="status">{storageWarning}</p>}
    <div className="trade-sides" role="group" aria-label="Trade direction">{(['buy', 'sell'] as const).map(value => <button key={value} aria-pressed={side === value} disabled={locked} onClick={() => changeSide(value)}>{value === 'buy' ? 'Buy' : 'Sell'}</button>)}</div>
    {side === 'sell' && <button disabled={locked} onClick={() => void halfBalance()}>Use half my token balance</button>}
    <form onSubmit={event => { event.preventDefault(); void quote() }}><label>Amount in {side === 'buy' ? 'quote' : 'base'} tokens<input aria-label={`Live ${side} amount`} inputMode="decimal" value={amount} disabled={locked} onChange={event => { setAmount(event.target.value); setPreview(null); setReceipt(null) }}/></label><button disabled={locked || !amount.trim()}>Get {side} quote</button></form>
    {preview && <div className="trade-preview"><div><span>ESTIMATED OUTPUT · {preview.quote.outputSymbol}</span><strong>{preview.quote.estimatedOutput}</strong></div><div><span>MINIMUM OUTPUT · 1% SLIPPAGE · {preview.quote.outputSymbol}</span><strong>{preview.quote.minimumOutput}</strong></div><p>Input budget: {preview.quote.input} {preview.quote.inputSymbol}. Estimated unfilled input: {preview.quote.unfilledInput} {preview.quote.inputSymbol}. Quote expires after 60 seconds.</p><p>Trading fee: {preview.quote.tradingFee} {preview.quote.feeAsset}. Protocol fee: {preview.quote.protocolFee} {preview.quote.feeAsset}.</p><p>Your wallet spends the filled input amount plus SOL network fees on {network === 'devnet' ? 'devnet' : 'mainnet'}. The transaction enforces the displayed minimum output.</p><button disabled={locked} onClick={trade}>{action} with wallet <ArrowRight size={16}/></button></div>}
    {error && <p className="publish-error" role="alert">{error}</p>}
    {receipt && <a href={explorer(receipt.signature)} target="_blank" rel="noreferrer">{receipt.label} · view transaction <ExternalLink size={14}/></a>}
  </div>
}

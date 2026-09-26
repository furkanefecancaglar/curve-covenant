import { useEffect, useRef, useState } from 'react'
import type { Network } from './dbc'
import { readPoolBalances } from './balances'
import type { PoolBalances } from './balances'
import { connectWallet } from './wallet'

export default function WalletBalances({ pool, network, refreshKey }: { pool: string; network: Network; refreshKey: string }) {
  const [balances, setBalances] = useState<PoolBalances | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const owner = useRef<Awaited<ReturnType<typeof connectWallet>>['publicKey'] | null>(null)
  const request = useRef(0)
  useEffect(() => {
    const id = ++request.current
    if (owner.current) {
      setBusy(true); setBalances(null); setError('')
      readPoolBalances(pool, network, owner.current).then(value => { if (id === request.current) setBalances(value) })
        .catch(issue => { if (id === request.current) setError(issue instanceof Error ? issue.message : 'Could not read balances.') })
        .finally(() => { if (id === request.current) setBusy(false) })
    }
    return () => { request.current++ }
  }, [pool, network, refreshKey])
  async function refresh() {
    const id = ++request.current
    setBusy(true); setBalances(null); setError('')
    try {
      const { publicKey } = await connectWallet()
      if (id !== request.current) return
      owner.current = publicKey
      const value = await readPoolBalances(pool, network, publicKey)
      if (id === request.current) setBalances(value)
    } catch (issue) { if (id === request.current) setError(issue instanceof Error ? issue.message : 'Could not read balances.') }
    finally { if (id === request.current) setBusy(false) }
  }
  return <div className="wallet-balances"><div className="wallet-balance-heading"><h3>Wallet balances</h3><button disabled={busy} onClick={() => void refresh()}>{busy ? 'Reading balances…' : owner.current ? 'Refresh wallet balances' : 'Connect wallet for balances'}</button></div>
    {balances && <><p className="wallet-owner">Snapshot for {balances.owner} · {network}</p><div className="wallet-balance-grid">
      <div><span>BASE TOKENS</span><strong data-testid="wallet-base-balance">{balances.base.amount}</strong></div>
      <div><span>{balances.quoteSymbol} BALANCE</span><strong data-testid="wallet-quote-balance">{balances.quote.amount}</strong></div>
      {balances.quoteSymbol !== 'SOL' && <div><span>SOL FOR FEES</span><strong>{balances.sol}</strong></div>}
    </div><p>Token balances show the associated accounts used for trading. Keep SOL available for network fees and account rent.</p><small>Read at {new Date(balances.fetchedAt).toLocaleTimeString()}. Refresh after changing wallets.</small></>}
    {error && <p className="publish-error" role="alert">{error}</p>}
  </div>
}

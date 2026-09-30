import { useState } from 'react'
import type { Network } from './dbc'
import { configureNetworkRpc, DEFAULT_RPC, resetNetworkRpc, RPC, rpcSettingsError } from './rpc-settings'

export default function RpcSettings() {
  const [network, setNetwork] = useState<Network>('mainnet-beta')
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  async function apply() {
    if (busy) return
    setBusy(true); setError(''); setMessage('')
    try {
      const checked = await configureNetworkRpc(network, input)
      setInput(''); setMessage(`Connected to ${checked.network} at ${checked.origin}.${checked.historyChecked ? ' Transaction history was also verified.' : ''} This setting lasts until the page is reloaded.`)
    } catch (issue) { setError(rpcSettingsError(issue)) }
    finally { setBusy(false) }
  }
  return <details className="connection-settings" id="rpc-connection"><summary>RPC connection · optional</summary><p>Public RPCs can block or limit requests. You can use your own Solana endpoint for launch, trades and transaction checks. Mainnet endpoints must pass a network and transaction-history check.</p>
    <form onSubmit={event => { event.preventDefault(); void apply() }}><label>Network<select aria-label="RPC connection network" value={network} disabled={busy} onChange={event => { setNetwork(event.target.value as Network); setInput(''); setMessage(''); setError('') }}><option value="mainnet-beta">Mainnet</option><option value="devnet">Devnet</option></select></label><label>HTTPS RPC endpoint<input aria-label="Session RPC endpoint" type="password" autoComplete="off" spellCheck={false} placeholder="https://your-provider/your-access-key" value={input} disabled={busy} onChange={event => setInput(event.target.value)}/></label><button disabled={busy || !input.trim()}>{busy ? 'Checking connection…' : 'Check and use RPC'}</button></form>
    <p>Current service: {new URL(RPC[network]).origin}. Access keys stay in this tab’s memory and are excluded from saved pools, shared links and reports. No wallet signature is requested.</p>
    {RPC[network] !== DEFAULT_RPC[network] && <button disabled={busy} onClick={() => { resetNetworkRpc(network); setInput(''); setError(''); setMessage('Default public RPC restored.') }}>Restore default RPC</button>}
    {message && <p role="status">{message}</p>}{error && <p className="publish-error" role="alert">{error}</p>}
  </details>
}

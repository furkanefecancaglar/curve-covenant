import { ArrowRight, Copy, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { poolShareUrl } from './pool-library'
import type { SavedPool } from './pool-library'

export default function PoolLibrary({ pools, onOpen, onRemove, warning }: {
  pools: SavedPool[]; onOpen: (pool: SavedPool) => void; onRemove: (pool: SavedPool) => void; warning: string
}) {
  const [message, setMessage] = useState('')
  async function share(pool: SavedPool) {
    try { await navigator.clipboard.writeText(poolShareUrl(window.location.href, pool)); setMessage('Pool link copied. It opens this pool on the correct network.') }
    catch { setMessage('Could not access the clipboard. Open the pool and copy its page link from your browser.') }
  }
  return <section className="pool-library" id="saved-pools">
    <div className="studio-section-head"><span>04 / YOUR WORKSPACE</span><h2>Pick up where your launch left off.</h2><p>Created and inspected pools stay in this browser. Open a saved pool to refresh its reserves, trade, or follow its DAMM v2 graduation.</p></div>
    {warning && <p className="publish-error" role="status">{warning}</p>}
    {pools.length ? <div className="saved-pool-grid">{pools.map(pool => <article key={`${pool.network}:${pool.address}`} className="saved-pool-card">
      <div className="saved-pool-top"><span>{pool.network === 'devnet' ? 'DEVNET' : 'MAINNET'}</span><button aria-label={`Remove ${pool.label} from saved pools`} onClick={() => onRemove(pool)} title="Remove from this browser's list"><Trash2 size={15}/></button></div>
      <h3>{pool.label}</h3><p className="saved-address" title={pool.address}>{pool.address}</p><small>Last opened {new Date(pool.savedAt).toLocaleDateString()}</small>
      <div className="saved-pool-actions"><button onClick={() => onOpen(pool)}>Open pool <ArrowRight size={15}/></button><button onClick={() => share(pool)} aria-label={`Copy link to ${pool.label}`}><Copy size={15}/></button></div>
    </article>)}</div> : <div className="library-empty"><strong>Your first pool belongs here.</strong><p>Create a launch above or read an existing DBC pool below. Its address will be saved here for your next visit.</p><a href="#graduate">Open an existing pool <ArrowRight size={15}/></a></div>}
    {message && <p className="shared-design-note" role="status">{message}</p>}
  </section>
}

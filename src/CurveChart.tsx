import { useId, useMemo, useState } from 'react'
import type { ConfigParameters } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { sampleLaunchCurve } from './studio'

const number = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, notation: 'compact' }).format(n)
export default function CurveChart({ config, supply, quoteDecimals, symbol }: {
  config: ConfigParameters; supply: number; quoteDecimals: number; symbol: string
}) {
  const id = useId().replace(/:/g, '')
  const [hover, setHover] = useState<number | null>(null)
  const result = useMemo(() => {
    try { return { samples: sampleLaunchCurve(config, supply, quoteDecimals), error: '' } }
    catch { return { samples: [], error: 'Curve preview unavailable for these inputs.' } }
  }, [config, supply, quoteDecimals])
  if (result.error) return <p>{result.error}</p>
  const points = result.samples
  const maxX = Math.max(...points.map(p => p.quoteReserve))
  const maxY = Math.max(...points.map(p => p.marketCap))
  const x = (v: number) => 60 + v / maxX * 440
  const y = (v: number) => 205 - v / maxY * 165
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.quoteReserve)},${y(p.marketCap)}`).join(' ')
  const active = points[hover ?? points.length - 1]
  return <div className="curve-preview"><div className="scenario-title"><strong>Price discovery curve</strong><span>SDK SIMULATION</span></div>
    <div className="curve-readout"><span>{hover === null ? 'At graduation' : 'Selected point'} · {number(active.quoteReserve)} {symbol} reserve</span><strong>{number(active.marketCap)} {symbol}<small> implied market cap</small></strong></div>
    <svg viewBox="0 0 530 250" role="img" aria-label={`Simulated market cap against quote reserves, from ${number(points[0].marketCap)} to ${number(maxY)} ${symbol}.`} onMouseLeave={() => setHover(null)}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#b6ed90" stopOpacity=".25"/><stop offset="100%" stopColor="#b6ed90" stopOpacity="0"/></linearGradient></defs>
      {[0, .5, 1].map(f => <g key={f}><line x1="60" x2="500" y1={y(maxY * f)} y2={y(maxY * f)} stroke="#314436" strokeDasharray="4 5"/><text x="50" y={y(maxY * f) + 4} textAnchor="end">{number(maxY * f)}</text></g>)}
      <path d={`${path} L500,205 L60,205 Z`} fill={`url(#${id})`}/><path d={path} fill="none" stroke="#b6ed90" strokeWidth="3"/>
      {points.map((p, i) => <rect key={i} x={x(p.quoteReserve) - 7} y="30" width="14" height="180" fill="transparent" onMouseEnter={() => setHover(i)}><title>{number(p.quoteReserve)} {symbol} reserve → {number(p.marketCap)} {symbol} market cap</title></rect>)}
      <circle cx={x(active.quoteReserve)} cy={y(active.marketCap)} r="5" fill="#e5ffd4"/>
      <text x="60" y="228">0</text><text x="500" y="228" textAnchor="end">{number(maxX)} {symbol}</text><text x="280" y="247" textAnchor="middle">Quote reserve →</text>
    </svg><p>Opening fee, one hypothetical buy per point, no earlier trades. Market cap is a curve-implied value.</p>
  </div>
}

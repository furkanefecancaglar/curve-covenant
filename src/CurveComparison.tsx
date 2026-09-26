import { useMemo } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { compareCurves } from './curve-comparison'
import type { CurveModelId } from './curve-comparison'
import type { StudioInputs } from './studio'

const compact = (value: number) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value)
export default function CurveComparison({ input, amount, elapsedHours, symbol, quoteDecimals, locked, onChoose }: {
  input: StudioInputs; amount: string; elapsedHours: number; symbol: string; quoteDecimals: number; locked: boolean; onChoose: (model: CurveModelId) => void
}) {
  const models = useMemo(() => compareCurves(input, amount, elapsedHours, quoteDecimals), [input, amount, elapsedHours, quoteDecimals])
  const valid = models.filter(model => model.result)
  const maxX = Math.max(1, ...valid.map(model => model.result!.threshold))
  const maxY = Math.max(1, ...valid.flatMap(model => model.result!.points.map(point => point.marketCap)))
  const selected = input.preset === 'discovery' ? 'steady' : input.preset
  const x = (value: number) => 70 + value / maxX * 760
  const y = (value: number) => 210 - value / maxY * 180
  return <section className="curve-comparison" aria-labelledby="comparison-title">
    <div className="comparison-heading"><div><span>COMPARE CURVE SHAPES</span><h3 id="comparison-title">See what changes when the curve changes.</h3><p>Your supply, opening and graduation values, and fee schedule stay the same. Each model's leftover allocation is shown below.</p></div><div className="comparison-budget"><span>SIMULATED BUY</span><strong>{amount || '—'} {symbol}</strong><small>{elapsedHours} hours after opening</small></div></div>
    {valid.length > 0 && <div className="comparison-chart"><svg viewBox="0 0 870 255" role="img" aria-label={`Comparison of curve-implied market cap against ${symbol} reserves for three curve shapes.`}>
      {[0, .5, 1].map(f => <g key={f}><line x1="70" x2="830" y1={y(maxY * f)} y2={y(maxY * f)} stroke="#344737" strokeDasharray="4 6"/><text x="60" y={y(maxY * f) + 4} textAnchor="end">{compact(maxY * f)}</text></g>)}
      {valid.map(model => <path key={model.id} d={model.result!.points.map((point, i) => `${i ? 'L' : 'M'}${x(point.quoteReserve)},${y(point.marketCap)}`).join(' ')} fill="none" stroke={model.color} strokeWidth={model.id === selected ? 3.5 : 2} strokeDasharray={model.id === selected ? undefined : '7 5'}/>)}
      <text x="70" y="235">0</text><text x="830" y="235" textAnchor="end">{compact(maxX)} {symbol}</text><text x="450" y="253" textAnchor="middle">Quote reserve → · vertical axis: implied market cap</text>
    </svg><div className="comparison-legend">{models.map(model => <span key={model.id}><i style={{ background: model.color }}/>{model.label}</span>)}</div></div>}
    <div className="comparison-table-wrap"><table><caption>Live SDK calculations using the buy amount and elapsed time above. Curve paths use the opening fee; no earlier trades are assumed.</caption><thead><tr><th>Curve</th><th>Reserve to graduate</th><th>Tokens received</th><th>Avg. cost / opening price</th><th>Unfilled {symbol}</th><th>Leftover supply</th></tr></thead><tbody>
      {models.map(model => <tr key={model.id} className={model.id === selected ? 'selected' : ''}><th><button disabled={locked || !model.result} onClick={() => onChoose(model.id)}>{model.id === selected && <CheckCircle2 size={15}/>} {model.label}</button></th>{model.result ? <><td>{compact(model.result.threshold)} {symbol}</td><td>{compact(Number(model.result.quote.outputTokens))}</td><td>{model.result.averageCostMultiple?.toFixed(3) ?? '—'}×</td><td>{compact(Number(model.result.quote.unfilledQuote))}</td><td>{model.leftoverPct}%</td></> : <td colSpan={5}>{model.error}</td>}</tr>)}
    </tbody></table></div>
    <p className="comparison-note">Average cost includes launch trading fees. Click a curve name to use that shape with your current terms. These estimates describe the curve mechanics; they do not predict demand or trading returns.</p>
  </section>
}

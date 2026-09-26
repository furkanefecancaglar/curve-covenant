import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import type { StudioInputs } from './studio'
import type { QuoteAsset } from './quotes'
import { formatUnits } from './dbc'
import { buildControlledCurves, scenarioReport, SCENARIOS, tradeOutput } from './scenarios'
import type { ControlledCurve, ScenarioId } from './scenarios'
import { downloadScenarioFile, scenarioPlot, scenarioSvg } from './scenario-report'

const compact = (n: number) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 3 }).format(n)
const percent = (n: number) => `${n.toFixed(2)}%`
export default function ScenarioLab({ input, quoteAsset, locked, onChoose }: { input: StudioInputs; quoteAsset: QuoteAsset; locked: boolean; onChoose: (curve: ControlledCurve) => void }) {
  const [scenario, setScenario] = useState<ScenarioId>('whale')
  const [budgetInput, setBudgetInput] = useState('')
  const [seconds, setSeconds] = useState(0)
  const models = useMemo(() => {
    try { return { curves: buildControlledCurves(input, quoteAsset.decimals), error: '' } }
    catch (issue) { return { curves: null, error: issue instanceof Error ? issue.message : 'Could not equalize the curve controls.' } }
  }, [input, quoteAsset.decimals])
  const defaultBudget = models.curves ? formatUnits(models.curves[0].config.migrationQuoteThreshold.muln(120).divn(100).toString(), quoteAsset.decimals) : '1'
  const budget = budgetInput || defaultBudget
  const result = useMemo(() => {
    if (!models.curves) return { report: null, error: models.error }
    try { return { report: scenarioReport(models.curves, scenario, budget, quoteAsset), error: '' } }
    catch (issue) { return { report: null, error: issue instanceof Error ? issue.message : 'Could not run the scenario.' } }
  }, [models, scenario, budget, quoteAsset])
  const report = result.report
  const plot = report ? scenarioPlot(report) : null
  const comparison = report ? (() => {
    const [one, long] = report.curves
    const delta = long.metrics.cohorts[0].shareOfBuyOutputPct - one.metrics.cohorts[0].shareOfBuyOutputPct
    return `The long curve gives the early cohort ${Math.abs(delta).toFixed(2)} percentage points ${delta >= 0 ? 'more' : 'less'} of total buy output in this schedule. This is an allocation measurement, not a fairness score.`
  })() : ''
  return <section className="scenario-lab" id="scenarios" aria-labelledby="scenario-lab-title">
    <div className="studio-section-head"><span>SCENARIO LAB · SEQUENTIAL TRADES</span><h2 id="scenario-lab-title">Measure the trade-offs before launch.</h2><p>Each trade changes the next trade's price and reserves. Compare two curves with the same supply, opening price, quote reserve threshold and fee schedule.</p></div>
    <div className="scenario-controls"><label>Trading scenario<select aria-label="Trading scenario" value={scenario} onChange={event => { setScenario(event.target.value as ScenarioId); setSeconds(0) }}>{SCENARIOS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label>Total buy budget · {quoteAsset.id}<input aria-label="Scenario total buy budget" inputMode="decimal" value={budget} onChange={event => setBudgetInput(event.target.value)}/></label><button onClick={() => setBudgetInput('')}>Use 120% of threshold</button></div>
    <p>{SCENARIOS.find(item => item.id === scenario)!.description} The early cohort includes the opening buyer and the first third of retail buyers. The nominal leftover target is 0.001% for both curves; ending prices are allowed to differ.</p>
    {result.error && <p role="alert" className="publish-error">{result.error}</p>}
    {report && plot && <>
      <div className="scenario-controls-summary"><span>Common reserve threshold: <strong>{formatUnits(report.controls.thresholdRaw, quoteAsset.decimals)} {quoteAsset.id}</strong></span><span>Fees: {input.startingFeeBps / 100}% → {input.endingFeeBps / 100}% over {input.feeDurationHours} h</span></div>
      <div className="comparison-chart"><svg viewBox="0 0 900 310" role="img" aria-label="Sequential spot price paths for one-segment and long curves">
        {[0, .5, 1].map(f => <g key={f}><line x1="70" x2="830" y1={plot.y(plot.maxMultiple * f)} y2={plot.y(plot.maxMultiple * f)} stroke="#344737" strokeDasharray="4 6"/><text x="60" y={plot.y(plot.maxMultiple * f) + 4} textAnchor="end">{compact(plot.maxMultiple * f)}×</text></g>)}
        {plot.paths.map(path => <path key={path.id} d={path.d} fill="none" stroke={path.color} strokeWidth="3"><title>{path.label}</title></path>)}
        <line x1={plot.x(seconds)} x2={plot.x(seconds)} y1="35" y2="260" stroke="#e4efd9" strokeDasharray="3 5"/>
        <text x="70" y="282">0 min</text><text x="830" y="282" textAnchor="end">{plot.maxSeconds / 60} min</text><text x="450" y="306" textAnchor="middle">Elapsed scenario time → · Spot price / opening price</text>
      </svg><label className="scenario-scrubber">Inspect time: {(seconds / 60).toFixed(0)} min<input aria-label="Inspect scenario time" type="range" min="0" max={plot.maxSeconds} step="60" value={seconds} onChange={event => setSeconds(Number(event.target.value))}/></label><div className="comparison-legend">{report.curves.map(curve => {
        const active = curve.trades.filter(t => t.atSeconds <= seconds).at(-1)
        return <span key={curve.id}><i style={{ background: curve.color }}/>{curve.label}: {active ? (active.spotPrice / curve.openingPrice).toFixed(3) : '1.000'}×{active?.after.completed ? ' · completed' : ''}</span>
      })}</div></div>
      <p className="scenario-finding" data-testid="scenario-finding">{comparison}</p>
      <div className="comparison-table-wrap"><table><caption>Executed trades only. Unspent budgets include unfilled input and buys scheduled after graduation.</caption><thead><tr><th>Curve</th><th>Base received</th><th>Early share</th><th>Quote fees</th><th>Reserve / progress</th><th>Quote still needed</th><th>Unspent budget</th></tr></thead><tbody>{report.curves.map(curve => <tr key={curve.id}><th>{curve.label}</th><td>{compact(Number(curve.metrics.totalBaseBought))}</td><td>{percent(curve.metrics.cohorts[0].shareOfBuyOutputPct)}</td><td>{curve.metrics.totalQuoteFees}</td><td>{compact(Number(curve.metrics.netQuoteReserve))} · {percent(curve.metrics.progressPct)}</td><td>{curve.metrics.remainingQuoteToGraduate}</td><td>{curve.metrics.unspentBuyBudget}</td></tr>)}</tbody></table></div>
      <div className="scenario-details-grid">{report.curves.map(curve => <article key={curve.id}><h3 style={{ color: curve.color }}>{curve.label}</h3><p>Graduation price / opening: {(curve.migrationPrice / curve.openingPrice).toFixed(3)}×. Base reserve after this scenario: {compact(Number(curve.metrics.baseReserve))}.</p><table><caption>Average buy cost / opening price, including fees</caption><thead><tr><th>Early</th><th>Middle</th><th>Late</th></tr></thead><tbody><tr>{curve.metrics.cohorts.map(cohort => <td key={cohort.name}>{cohort.averageCost === null ? 'No executed buys' : `${(cohort.averageCost / curve.openingPrice).toFixed(3)}×`}</td>)}</tr></tbody></table>
        <p>{scenario === 'sell-pressure' ? curve.metrics.recovery ? `Pre-sale price recovered after ${curve.metrics.recovery.additionalBuys} further buys spending ${curve.metrics.recovery.grossQuote} ${quoteAsset.id}.` : 'Pre-sale price was not recovered in the executed schedule, or the sale could not run before graduation.' : `First buy spot-price change: ${percent(curve.metrics.firstBuyPriceChangePct)}.`}</p>
        <button disabled={locked} onClick={() => onChoose(models.curves!.find(model => model.id === curve.id)!)}>Use {curve.id === 'long' ? 'long curve' : 'one segment'} for launch</button>
        <p>{curve.final.completed ? `Reached graduation on event ${curve.metrics.graduationEvent}. Later DBC trades stop.` : 'The executed schedule did not reach graduation.'}</p>
      </article>)}</div>
      <details className="scenario-ledger"><summary>Inspect the complete trade ledger</summary>{report.curves.map(curve => <div key={curve.id} className="comparison-table-wrap"><table><caption>{curve.label} · {curve.trades.length} executed events</caption><thead><tr><th>Time</th><th>Actor</th><th>Side</th><th>Filled input</th><th>Output</th><th>Quote reserve</th></tr></thead><tbody>{curve.trades.map(t => <tr key={t.index}><td>{t.atSeconds / 60} min</td><td>{t.actor}</td><td>{t.side}</td><td>{formatUnits(t.filledInputRaw, t.side === 'buy' ? quoteAsset.decimals : 6)}</td><td>{tradeOutput(t, quoteAsset.decimals)}</td><td>{formatUnits(t.after.quoteReserveRaw, quoteAsset.decimals)}</td></tr>)}</tbody></table></div>)}</details>
      <div className="studio-actions"><button onClick={() => downloadScenarioFile(`scenario-${quoteAsset.id}-${scenario}.json`, JSON.stringify(report, null, 2), 'application/json')}><Download size={17}/> Export Scenario Report · JSON</button><button onClick={() => downloadScenarioFile(`scenario-${quoteAsset.id}-${scenario}.svg`, scenarioSvg(report), 'image/svg+xml')}><Download size={17}/> Export visual summary · SVG</button></div>
      <p className="scenario-limitations">Hypothetical order flow, not a market forecast. External quote liquidity and USD price changes are not modeled. The two-stage preset is excluded because its allocation differs. Reports include the exact compared configurations. Choose “Use for launch” to transfer a compared configuration into the launch form.</p>
    </>}
  </section>
}

import type { ScenarioReport } from './scenarios'

export function scenarioPlot(report: ScenarioReport) {
  const series = report.curves.map(curve => ({ id: curve.id, label: curve.label, color: curve.color,
    points: [{ seconds: 0, multiple: 1 }, ...curve.trades.map(t => ({ seconds: t.atSeconds, multiple: t.spotPrice / curve.openingPrice }))] }))
  const maxSeconds = Math.max(60, ...report.curves.flatMap(curve => curve.scheduledBuys.map(t => t.atSeconds)))
  const maxMultiple = Math.max(1, ...series.flatMap(s => s.points.map(p => p.multiple))) * 1.08
  const x = (seconds: number) => 70 + seconds / maxSeconds * 760
  const y = (multiple: number) => 260 - multiple / maxMultiple * 220
  return { series, maxSeconds, maxMultiple, x, y,
    paths: series.map(s => ({ ...s, d: s.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.seconds).toFixed(2)},${y(p.multiple).toFixed(2)}`).join(' ') })) }
}
const xml = (value: string | number) => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]!))
const number = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(n)

export function scenarioSvg(report: ScenarioReport): string {
  const plot = scenarioPlot(report)
  const rows = report.curves.map((curve, i) => {
    const y = 430 + i * 74
    return `<g fill="#e4efd9"><text x="40" y="${y}" fill="${curve.color}" font-weight="700">${xml(curve.label)}</text>
      <text x="290" y="${y}">${xml(number(curve.metrics.cohorts[0].shareOfBuyOutputPct))}%</text>
      <text x="450" y="${y}">${xml(number(curve.metrics.progressPct))}%</text>
      <text x="590" y="${y}">${xml(curve.metrics.totalQuoteFees)}</text>
      <text x="40" y="${y + 25}" font-size="12">Quote left to graduate: ${xml(curve.metrics.remainingQuoteToGraduate)} · Final event: ${curve.trades.length} · Graduated: ${curve.final.completed ? 'yes' : 'no'}</text></g>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="710" viewBox="0 0 900 710" role="img" aria-label="Curve Covenant scenario report">
  <rect width="900" height="710" fill="#101c14"/><g font-family="Arial, sans-serif" fill="#e4efd9">
  <text x="40" y="36" font-size="23" font-weight="700">Curve Covenant · ${xml(report.scenario)}</text>
  <text x="40" y="62" font-size="13">Hypothetical trades · Budget ${xml(report.budget)} ${xml(report.quoteAsset.id)} · SDK ${xml(report.sdkVersion)}</text>
  <g transform="translate(0,65)" font-size="12">
    ${[0, .5, 1].map(f => `<line x1="70" x2="830" y1="${plot.y(plot.maxMultiple * f)}" y2="${plot.y(plot.maxMultiple * f)}" stroke="#344737"/><text x="60" y="${plot.y(plot.maxMultiple * f) + 4}" text-anchor="end">${number(plot.maxMultiple * f)}×</text>`).join('')}
    ${plot.paths.map(s => `<path d="${s.d}" fill="none" stroke="${s.color}" stroke-width="3"/>`).join('')}
    <text x="70" y="286">0 min</text><text x="830" y="286" text-anchor="end">${number(plot.maxSeconds / 60)} min</text>
    <text x="450" y="310" text-anchor="middle">Elapsed scenario time → · Spot price / opening price</text>
  </g>
  <g fill="#a4b79d" font-size="12"><text x="40" y="400">CURVE</text><text x="290" y="400">EARLY BUY OUTPUT</text><text x="450" y="400">PROGRESS</text><text x="590" y="400">FEES · ${xml(report.quoteAsset.id)}</text></g>
  ${rows}
  <g fill="#a4b79d" font-size="12"><text x="40" y="596">Same supply, start price, quote threshold, fee schedule and nominal leftover target.</text>
  <text x="40" y="618">Endpoint prices differ. Lower price impact does not imply less early capture.</text>
  <text x="40" y="640">No external quote liquidity, USD-price model or observed demand. Full raw-unit ledger: JSON report.</text>
  <text x="40" y="678">${xml(report.generatedAt)} · curve-covenant/scenario-v1</text></g></g></svg>`
}

export function downloadScenarioFile(name: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }))
  const link = document.createElement('a'); link.href = url; link.download = name; link.click()
  URL.revokeObjectURL(url)
}

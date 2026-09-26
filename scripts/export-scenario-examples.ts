import { mkdir, writeFile } from 'node:fs/promises'
import { buildControlledCurves, scenarioReport, SCENARIOS } from '../src/scenarios'
import { scenarioSvg } from '../src/scenario-report'
import { PRESETS } from '../src/studio'
import { QUOTES } from '../src/quotes'
import { formatUnits } from '../src/dbc'

const input = { ...PRESETS.steady.values, initialMarketCap: 1, migrationMarketCap: 10 }
const curves = buildControlledCurves(input, QUOTES.XRXx.decimals)
const budget = formatUnits(curves[0].config.migrationQuoteThreshold.muln(120).divn(100).toString(), QUOTES.XRXx.decimals)
await mkdir('docs/evidence/scenarios', { recursive: true })
for (const scenario of SCENARIOS) {
  const report = scenarioReport(curves, scenario.id, budget, QUOTES.XRXx)
  await writeFile(`docs/evidence/scenarios/${scenario.id}.json`, JSON.stringify(report, null, 2) + '\n')
  await writeFile(`docs/evidence/scenarios/${scenario.id}.svg`, scenarioSvg(report))
  console.log(JSON.stringify({ scenario: scenario.id, curves: report.curves.map(c => ({ curve: c.id, earlySharePct: c.metrics.cohorts[0].shareOfBuyOutputPct,
    firstBuyPriceChangePct: c.metrics.firstBuyPriceChangePct, completed: c.final.completed })) }))
}

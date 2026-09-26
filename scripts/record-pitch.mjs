import { chromium } from 'playwright-core'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'

const work = resolve('docs/video-work')
await mkdir(work, { recursive: true })
const scenes = JSON.parse(await readFile('docs/pitch-scenes.json', 'utf8'))
const report = JSON.parse(await readFile('docs/evidence/scenarios/whale.json', 'utf8'))
const proof = JSON.parse(await readFile('docs/evidence/scenario-chain-proof-2026-09-26.json', 'utf8'))
const [one, long] = report.curves
const delta = long.metrics.cohorts[0].shareOfBuyOutputPct - one.metrics.cohorts[0].shareOfBuyOutputPct
assert.equal(delta.toFixed(2), '2.53')
assert.equal(Math.round(one.metrics.firstBuyPriceChangePct), 311)
assert.equal(Math.round(long.metrics.firstBuyPriceChangePct), 239)
const count = proof.results.reduce((sum, row) => sum + row.checks.length, 0)
assert.equal(count, 56); assert.equal(proof.results.length, 8)
const svg = await readFile('docs/evidence/scenarios/whale.svg', 'utf8')
const sample = proof.results[5].checks[2]
const table = ['sqrtPriceRaw', 'baseReserveRaw', 'quoteReserveRaw', 'feeQuoteRaw'].map(key => `<tr><th>${key}</th><td>${sample.predicted.after[key]}</td><td>${sample.actual[key]}</td></tr>`).join('')
const bodies = {
  'pitch-decision': `<p class="eyebrow">A CONCRETE CONFIGURATION DECISION</p><h1>Which trade-off should<br>a launch creator choose?</h1><div class="cards"><article><span class="label">OBJECTIVE A</span><h2>A smaller<br>opening price jump</h2></article><article><span class="label">OBJECTIVE B</span><h2>A lower share of tokens<br>for early buyers</h2></article></div><p class="statement">These outcomes can conflict. Measure both before deployment.</p><p class="foot">Initial customer hypothesis: launch creators and launchpad teams.</p>`,
  'pitch-result': `<p class="eyebrow">FIXED-FEE XRXx WHALE SCENARIO</p><h1>Lower price impact.<br>More early buy output.</h1><div class="result"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"/><div><span class="label">FIRST BUY PRICE CHANGE</span><h2>${one.metrics.firstBuyPriceChangePct.toFixed(2)}% → ${long.metrics.firstBuyPriceChangePct.toFixed(2)}%</h2><span class="label">EARLY COHORT SHARE</span><h2>${one.metrics.cohorts[0].shareOfBuyOutputPct.toFixed(2)}% → ${long.metrics.cohorts[0].shareOfBuyOutputPct.toFixed(2)}%</h2><p>+${delta.toFixed(2)} percentage points<br>of gross buy output.</p><p class="foot">Same supply, opening price, reserve threshold and fees.<br>Endpoint prices differ. Hypothetical order flow.</p></div></div>`,
  'pitch-product': `<p class="eyebrow">CURVE COVENANT · PRODUCT FLOW</p><h1>From scenario evidence<br>to the exact launch.</h1><div class="flow"><article><b>01</b><h2>Compare</h2><p>Retail · whale<br>sell pressure · graduation</p></article><article><b>02</b><h2>Inspect</h2><p>Price · fees<br>allocation · reserves</p></article><article><b>03</b><h2>Export</h2><p>Integer ledger<br>SDK config · SVG</p></article><article><b>04</b><h2>Launch</h2><p>Exact selected config<br>DBC → DAMM v2</p></article></div><p class="statement">Sequential state updates. Inventory-backed selling. Reproducible design links.</p>`,
  'pitch-proof': `<p class="eyebrow">EXECUTED LOCAL VALIDATION</p><h1>${count} swaps. ${proof.results.length} pools.<br>Exact raw-unit matches.</h1><table><tr><th>Field</th><th>Prediction</th><th>Observed</th></tr>${table}</table><p class="foot">SOL/XRXx × one/16 segments × fixed/declining fees.<br>Local browser create → buy → sell → balances → DAMM v2 also passed.<br>Local evidence with synthetic XRXx. Public Phantom execution remains unverified.</p>`,
  'pitch-next': `<p class="eyebrow">NEXT MEASURABLE MILESTONES</p><h1>Build around an actual<br>creator workflow.</h1><div class="cards"><article><span class="label">PUBLIC EXECUTION</span><h2>Phantom evidence</h2><p>Real wallet signatures<br>Reviewed spending budget<br>Verified public transaction links</p></article><article><span class="label">DEMAND VALIDATION</span><h2>3–5 builder trials</h2><p>Observe a real decision<br>Measure whether the report changes it<br>Record actual feedback</p></article></div><p class="statement">Embeddable comparison tooling is a hypothesis to test with launchpad teams.</p><p class="foot">No adoption, revenue or testimonials claimed. Live product and source: furkanefecancaglar.github.io/curve-covenant/</p>`,
}
const css = `*{box-sizing:border-box}body{margin:0;width:1920px;height:1080px;background:#0e1b12;color:#e4efd9;font:28px Arial;padding:82px 100px 130px}header{display:flex;justify-content:space-between;align-items:center;font-size:19px;color:#b6ed90;border-bottom:1px solid #344a38;padding-bottom:22px}.environment{color:#f4cd73;font-size:17px}.eyebrow{font-size:17px;letter-spacing:3px;color:#a6c495;margin-top:40px}h1{font-size:68px;line-height:1.12;letter-spacing:-2px;margin:22px 0 32px}h2{font-size:39px;line-height:1.24;margin:22px 0;color:#d6f1ba}p{line-height:1.5}.cards{display:grid;grid-template-columns:1fr 1fr;gap:30px}.cards article,.flow article{padding:30px;background:#172b1c;border:1px solid #40583e;border-radius:12px}.label{font-size:18px;letter-spacing:2px;color:#a6c495}.statement{font-size:28px;margin-top:32px}.foot{font-size:20px;color:#a4b69a;line-height:1.6}.result{display:grid;grid-template-columns:830px 1fr;gap:48px;margin-top:-8px}.result img{width:790px;height:490px;object-fit:contain;object-position:left top}.result h2{font-size:44px;margin:12px 0 22px}.result p{font-size:25px}.result .foot{font-size:18px}.flow{display:grid;grid-template-columns:repeat(4,1fr);gap:20px}.flow p{font-size:24px}.flow b{font-size:22px;color:#94bd7b}table{width:100%;border-collapse:collapse;font:23px monospace;margin:20px 0 28px}td,th{padding:20px 12px;border-bottom:1px solid #344a38;text-align:left}`
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
const timeline = []
try {
  for (const scene of scenes) {
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><header><span>CURVE COVENANT / SCENARIO-DRIVEN LAUNCHES</span><span class="environment">LOCAL EVIDENCE · SYNTHETIC NARRATION</span></header>${bodies[scene.id]}</body></html>`)
    const image = join(work, `${scene.id}.png`)
    await page.screenshot({ path: image })
    assert(await page.evaluate(() => document.documentElement.scrollHeight <= 1080), `Slide overflow: ${scene.id}`)
    const audioSeconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', join(work, `${scene.id}.mp3`)], { encoding: 'utf8' }))
    timeline.push({ id: scene.id, title: scene.title, narration: scene.text, image, audioSeconds, duration: audioSeconds + 1, start: 0 })
  }
  const duration = timeline.reduce((sum, scene) => sum + scene.duration, 0)
  assert(duration >= 120 && duration <= 180, `Pitch duration outside 2–3 minutes: ${duration}`)
  const sources = Object.fromEntries(await Promise.all(['docs/evidence/scenarios/whale.json', 'docs/evidence/scenario-chain-proof-2026-09-26.json'].map(async path => [path, createHash('sha256').update(await readFile(path)).digest('hex')])))
  await writeFile(join(work, 'pitch-recording.json'), JSON.stringify({ recordedAt: new Date().toISOString(), network: 'local-validator-evidence',
    syntheticStockBalance: true, narration: 'synthetic / en-US-AriaNeural', sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    format: 'technical presentation from checked-in evidence', sources, timeline, duration }, null, 2) + '\n')
  console.log(JSON.stringify({ slides: timeline.length, duration, sources }))
} finally { await browser.close() }

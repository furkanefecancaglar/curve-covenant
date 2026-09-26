import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'

const executablePath = process.env.CHROMIUM_PATH
if (!executablePath) throw new Error('Set CHROMIUM_PATH')
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
const errors = []
page.on('pageerror', error => errors.push(error.message))
// Offline scenarios must not require any public RPC request.
const externalRequests = []
await page.route(/https:\/\/(solana-rpc\.publicnode\.com|api\.devnet\.solana\.com)/, route => {
  externalRequests.push(route.request().url()); return route.abort()
})
async function download(button) {
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: button }).click()])
  return readFile(await file.path(), 'utf8')
}
try {
  await page.goto('http://127.0.0.1:4175', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Xerox xStock/ }).click()
  await page.getByLabel('Opening market cap', { exact: false }).fill('1')
  await page.getByLabel('Graduation market cap', { exact: false }).fill('10')
  for (const id of ['retail', 'whale', 'sell-pressure', 'graduation']) {
    await page.getByLabel('Trading scenario', { exact: true }).selectOption(id)
    await page.getByTestId('scenario-finding').waitFor()
    assert.equal(await page.locator('#scenarios [role="alert"]').count(), 0)
    const report = JSON.parse(await download('Export Scenario Report · JSON'))
    assert.equal(report.scenario, id)
    assert.equal(report.curves.length, 2)
    assert.equal(report.curves[0].config.migrationQuoteThreshold, report.curves[1].config.migrationQuoteThreshold)
    assert.equal(report.curves[0].config.sqrtStartPrice, report.curves[1].config.sqrtStartPrice)
    if (id === 'sell-pressure') assert(report.curves.every(c => c.trades.some(t => t.side === 'sell')))
  }
  await page.getByLabel('Trading scenario', { exact: true }).selectOption('whale')
  const report = JSON.parse(await download('Export Scenario Report · JSON'))
  const svg = await download('Export visual summary · SVG')
  assert(svg.includes('Hypothetical trades') && svg.includes('XRXx'))
  await page.getByLabel('Inspect scenario time').fill('600')
  await page.getByRole('button', { name: 'Use long curve for launch' }).click()
  await page.getByText('Scenario configuration selected:', { exact: false }).waitFor()
  const launch = JSON.parse(await download('Download SDK config JSON'))
  assert.deepEqual(launch.sdkConfig, report.curves[1].config)
  const unchanged = JSON.parse(await download('Export Scenario Report · JSON'))
  assert.deepEqual(unchanged.curves[1].config, report.curves[1].config, 'Choosing a curve must not silently rebase the comparison')
  // Capture the share link and verify its restored exact configuration.
  await page.evaluate(() => { navigator.clipboard.writeText = async text => { window.copiedDesign = text } })
  await page.getByRole('button', { name: 'Copy design link' }).click()
  const url = await page.evaluate(() => window.copiedDesign)
  await page.goto(url, { waitUntil: 'networkidle' })
  const restored = JSON.parse(await download('Download SDK config JSON'))
  assert.deepEqual(restored.sdkConfig, launch.sdkConfig)
  await page.locator('#scenarios').scrollIntoViewIfNeeded()
  await mkdir('/tmp/curve-scenario-browser', { recursive: true })
  await page.screenshot({ path: '/tmp/curve-scenario-browser/desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Mobile viewport overflow')
  await page.locator('#scenarios').screenshot({ path: '/tmp/curve-scenario-browser/mobile.png' })
  await page.getByLabel('Scenario total buy budget').fill('0')
  await page.locator('#scenarios [role="alert"]').waitFor()
  assert.equal(await page.getByRole('button', { name: 'Export Scenario Report · JSON' }).count(), 0, 'Invalid input must not export a stale result')
  assert.deepEqual(errors, [])
  assert.deepEqual(externalRequests, [])
  console.log(JSON.stringify({ scenarios: 4, jsonAndSvgExports: true, exactLaunchConfig: true, exactShareRestore: true, mobileWidth: 390, pageErrors: errors, externalRpcRequests: externalRequests }))
} finally { await browser.close() }

import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'

// Public-network read-only check. No wallet keys, test signing provider or local
// validator redirects. Every unexpected RPC method is blocked before sending.
const executablePath = process.env.CHROMIUM_PATH
assert(executablePath, 'Set CHROMIUM_PATH')
const pool = '4L9LJ3B5niCSLWujRJjPU6scZVbNJz4zw6A9B3aPxTeT'
const allowed = new Set(['getAccountInfo', 'getMultipleAccounts', 'getGenesisHash', 'getSlot', 'getBlockTime', 'getSignatureStatuses', 'getBlockHeight', 'getSignaturesForAddress', 'getTransaction'])
const requests = {}
const blocked = []
const errors = []
const rpcFailures = []
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } })
try {
  await page.route(/https:\/\/(solana-rpc\.publicnode\.com|api\.mainnet-beta\.solana\.com)\/?$/, async route => {
    const request = JSON.parse(route.request().postData())
    if (!allowed.has(request.method)) { blocked.push(request.method); await route.abort(); return }
    requests[request.method] = (requests[request.method] ?? 0) + 1
    await route.continue()
  })
  page.on('pageerror', error => errors.push(error.message))
  page.on('requestfailed', request => { if (/solana.*(com|org)/.test(request.url())) rpcFailures.push({ url: request.url(), failure: request.failure()?.errorText }) })
  page.on('response', response => { if (response.status() >= 400 && /solana/.test(response.url())) rpcFailures.push({ url: response.url(), status: response.status(), method: JSON.parse(response.request().postData() ?? '{}').method }) })
  const url = new URL(process.env.APP_URL ?? 'http://127.0.0.1:4175')
  url.searchParams.set('view', 'inspector'); url.searchParams.set('address', pool); url.searchParams.set('network', 'mainnet-beta')
  await page.goto(url.toString(), { waitUntil: 'networkidle' })
  await page.locator('.result-panel').waitFor({ timeout: 25000 })
  await page.getByText('Public USDC reference pool', { exact: false }).waitFor()
  const [file] = await Promise.all([page.waitForEvent('download', { timeout: 65000 }), page.getByRole('button', { name: 'Transaction evidence', exact: true }).click()])
  const report = JSON.parse(await readFile(await file.path(), 'utf8'))
  await writeFile('/tmp/curve-public-browser-evidence-last.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ history: report.history, warnings: report.warnings, rpcFailures, requests }))
  assert.equal(report.pool, pool)
  assert.equal(report.observedNetwork, 'mainnet-beta')
  assert.equal(report.genesisHash, '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')
  assert.equal(report.launch.quoteSymbol, 'USDC')
  if (process.env.EXPECT_HISTORY_UNAVAILABLE === '1') {
    assert.equal(report.history.signaturesAvailable, false); assert.equal(report.history.verifiedReceipts, 0)
    assert(report.warnings.length > 0, 'Blocked history must have an explicit warning')
  } else {
    assert.equal(report.history.signaturesAvailable, true, 'Public signature history must be available')
    assert(report.history.verifiedReceipts > 0, 'At least one full transaction receipt must be verified')
  }
  assert(report.receipts.every(receipt => receipt.verified || receipt.succeeded === null))
  const note = await page.locator('.evidence-status[role="status"]').innerText()
  assert(note.includes(report.history.signaturesAvailable ? `${report.history.verifiedReceipts} of ${report.history.listedReceipts}` : 'history was unavailable and is not verified'))
  await page.setViewportSize({ width: 390, height: 844 })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Mobile inspector overflow')
  assert.deepEqual(blocked, []); assert.deepEqual(errors, [])
  await writeFile('/tmp/curve-public-browser-evidence.json', JSON.stringify({ purpose: 'Read-only verification of an existing public reference pool. Not a Curve Covenant launch, wallet run or adoption claim.', ...report }, null, 2) + '\n')
  console.log(JSON.stringify({ network: report.observedNetwork, scope: 'existing public pool, reads only', pool, history: report.history, warnings: report.warnings, note, rpcRequests: requests, blockedRpcRequests: blocked, pageErrors: errors, mobileWidth: 390 }))
} finally { await browser.close() }

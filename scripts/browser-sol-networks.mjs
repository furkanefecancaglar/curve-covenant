import { chromium } from 'playwright-core'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

// Actual public RPC reads and unsigned simulation. This provider cannot sign.
const address = process.env.PREFLIGHT_WALLET
assert(address, 'Set PREFLIGHT_WALLET to a public address funded on devnet and empty on mainnet')
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } })
const requests = [], errors = [], blocked = []
let signatureRequests = 0
page.on('pageerror', issue => errors.push(issue.message))
const reads = new Set(['getBalance', 'getAccountInfo', 'getMultipleAccounts', 'getLatestBlockhash', 'getFeeForMessage', 'getMinimumBalanceForRentExemption', 'simulateTransaction'])
await page.route(/https:\/\/(api\.devnet\.solana\.com|solana-rpc\.publicnode\.com)\/?$/, route => {
  const { method } = route.request().postDataJSON()
  if (!reads.has(method)) { blocked.push(method); return route.abort() }
  requests.push({ network: route.request().url().includes('publicnode') ? 'mainnet-beta' : 'devnet', method })
  return route.continue()
})
await page.exposeFunction('refuseSigning', () => { signatureRequests++; throw new Error('Read-only test: signing disabled') })
async function installWallet() {
  await page.addScriptTag({ path: new URL('../node_modules/@solana/web3.js/lib/index.iife.min.js', import.meta.url).pathname })
  await page.evaluate(value => {
    window.phantom = { solana: { isPhantom: true, connect: async () => ({ publicKey: new window.solanaWeb3.PublicKey(value) }), signTransaction: () => window.refuseSigning() } }
  }, address)
}
async function config() {
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download SDK config JSON' }).click()])
  return JSON.parse(await readFile(await file.path(), 'utf8'))
}
try {
  await page.goto((process.env.APP_URL ?? 'http://127.0.0.1:4175/') + '?example=devnet#workbench', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Use long curve for launch' }).click()
  const devnet = await config()
  assert.equal(devnet.quoteAsset.id, 'SOL')
  await page.getByRole('button', { name: /Solana mainnet SOL/ }).click()
  const mainnet = await config()
  assert.equal(mainnet.quoteAsset.id, 'SOL-mainnet')
  assert.equal(mainnet.quoteAsset.network, 'mainnet-beta')
  assert.deepEqual(mainnet.sdkConfig, devnet.sdkConfig, 'SOL network switching preserves the exact compared curve')
  assert.deepEqual(mainnet.controlled, devnet.controlled)
  assert(!(await page.locator('main').innerText()).includes('SOL-mainnet'), 'Internal IDs must not appear as currency units')
  await page.evaluate(() => { navigator.clipboard.writeText = async value => { window.copiedDesign = value } })
  await page.getByRole('button', { name: 'Copy design link' }).click()
  await page.goto(await page.evaluate(() => window.copiedDesign), { waitUntil: 'networkidle' })
  assert.deepEqual(await config(), mainnet, 'A shared mainnet design restores its exact network and configuration')
  await installWallet()
  await page.getByLabel('Token name', { exact: true }).fill('Curve Covenant Demo')
  await page.getByLabel('Ticker', { exact: true }).fill('CCDEMO')
  await page.getByLabel('Public metadata JSON URL').fill('https://furkanefecancaglar.github.io/curve-covenant/metadata/demo-token.json')
  await page.getByRole('button', { name: 'Check launch with Phantom' }).click()
  await page.getByRole('alert').filter({ hasText: 'no mainnet SOL' }).waitFor({ timeout: 25000 })
  assert((await page.locator('.launch-wallet').innerText()).includes('0 SOL'))
  assert.equal(await page.getByRole('link', { name: 'Get free devnet SOL' }).count(), 0)
  assert.equal(await page.getByRole('region', { name: 'Launch cost review' }).count(), 0)
  assert.deepEqual(requests.filter(r => r.network === 'mainnet-beta').map(r => r.method), ['getBalance'])
  await page.getByRole('button', { name: /Solana devnet SOL/ }).click()
  assert.deepEqual((await config()).sdkConfig, devnet.sdkConfig)
  await page.getByRole('button', { name: 'Check launch with Phantom' }).click()
  await page.getByRole('region', { name: 'Launch cost review' }).waitFor({ timeout: 45000 })
  assert(requests.some(r => r.network === 'devnet' && r.method === 'simulateTransaction'))
  await page.getByRole('button', { name: /Solana mainnet SOL/ }).click()
  assert.equal(await page.getByRole('region', { name: 'Launch cost review' }).count(), 0, 'Changing network discards the devnet review')
  assert.equal(await page.getByLabel('Token name', { exact: true }).inputValue(), '', 'Mainnet starts with a fresh identity form')
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.locator('.quote-card').count(), 6)
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.locator('.quote-grid').screenshot({ path: '/tmp/curve-sol-network-choices.png' })
  assert.equal(signatureRequests, 0)
  assert.deepEqual(blocked, [])
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ evidence: 'public RPC reads and unsigned devnet simulation; no actual Phantom extension', mainnetEmptyWallet: 'correctly blocked', exactCurveAcrossNetworks: true, mainnetShareRestored: true, reviewInvalidated: true, mobileWidth: 390, signatureRequests, publicSends: 0, requests, errors }))
} finally { await browser.close() }

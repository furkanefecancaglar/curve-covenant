import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
import { Keypair } from '@solana/web3.js'

// Read-only devnet simulation. The provider cannot sign; public sends are blocked.
const wallet = process.env.PREFLIGHT_WALLET
if (!wallet) throw new Error('Set PREFLIGHT_WALLET to a funded devnet public address (no key).')
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } })
const errors = [], sends = []
page.on('pageerror', issue => errors.push(issue.message))
await page.route(/https:\/\/(api\.devnet\.solana\.com|solana-rpc\.publicnode\.com)\/?$/, async route => {
  const payload = route.request().postDataJSON()
  if (payload.method === 'sendTransaction') { sends.push(payload.method); return route.abort() }
  if (route.request().url().includes('publicnode')) throw new Error('Onboarding rehearsal must stay on devnet')
  return route.continue()
})
try {
  const base = process.env.APP_URL ?? 'http://127.0.0.1:4175/'
  await page.goto(base + '?example=devnet#launch', { waitUntil: 'networkidle' })
  assert.equal(await page.getByLabel('Opening market cap', { exact: false }).inputValue(), '1')
  assert.equal(await page.getByLabel('Graduation market cap', { exact: false }).inputValue(), '10')
  await page.getByRole('button', { name: 'Check launch with Phantom' }).click()
  await page.getByRole('alert').filter({ hasText: 'Phantom is not available' }).waitFor()
  assert(await page.getByRole('link', { name: 'Open this design in Phantom' }).isVisible())
  await page.evaluate(async address => {
    const { PublicKey } = await import('/node_modules/.vite/deps/@solana_web3__js.js')
    window.signAttempts = 0
    window.rejectConnection = true
    window.phantom = { solana: { isPhantom: true, connect: async () => {
      if (window.rejectConnection) throw Object.assign(new Error('User rejected'), { code: 4001 })
      return { publicKey: new PublicKey(window.changedWallet ?? address) }
    }, signTransaction: async () => { window.signAttempts++; throw new Error('Read-only verification must never sign') } } }
  }, wallet)
  await page.getByRole('button', { name: 'Check launch with Phantom' }).click()
  await page.getByRole('alert').filter({ hasText: 'You declined' }).waitFor()
  await page.evaluate(() => { window.rejectConnection = false })
  await page.getByRole('button', { name: 'Check launch with Phantom' }).click()
  await page.getByRole('region', { name: 'Launch cost review' }).waitFor({ timeout: 45000 })
  assert.equal(await page.evaluate(() => window.signAttempts), 0)
  const review = await page.getByRole('region', { name: 'Launch cost review' }).innerText()
  await page.setViewportSize({ width: 390, height: 844 })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile onboarding overflow')
  await page.locator('#launch').screenshot({ path: '/tmp/curve-launch-mobile.png' })
  await page.setViewportSize({ width: 1440, height: 1050 })
  // Switching accounts after the review must be caught before any signature.
  await page.evaluate(() => { window.changedWallet = '11111111111111111111111111111111' })
  await page.getByRole('button', { name: /Launch token/ }).click()
  await page.getByRole('alert').filter({ hasText: 'account changed' }).waitFor()
  assert.equal(await page.evaluate(() => window.signAttempts), 0)
  // A valid empty wallet gets a funding instruction, not an opaque program error.
  await page.getByRole('button', { name: 'Change wallet or recheck' }).click()
  await page.evaluate(address => { window.changedWallet = address }, Keypair.generate().publicKey.toBase58())
  await page.getByRole('button', { name: 'Check launch with Phantom' }).click()
  await page.getByRole('alert').filter({ hasText: 'no devnet SOL' }).waitFor({ timeout: 25000 })
  await page.evaluate(() => { delete window.changedWallet })
  await page.getByRole('button', { name: 'Check launch with Phantom' }).click()
  await page.getByRole('region', { name: 'Launch cost review' }).waitFor({ timeout: 45000 })
  // An edited term invalidates the fee review and requires a fresh check.
  await page.getByLabel('Graduation market cap', { exact: false }).fill('12')
  assert.equal(await page.getByRole('region', { name: 'Launch cost review' }).count(), 0)
  await page.getByRole('button', { name: 'Open the measured whale example' }).click()
  assert.equal(await page.getByLabel('Graduation market cap', { exact: false }).inputValue(), '10')
  assert((await page.getByTestId('scenario-finding').innerText()).includes('2.53'))
  await page.getByRole('group', { name: 'Trading scenario' }).getByRole('button', { name: 'Sell pressure', exact: true }).click()
  await page.getByLabel('Scenario total buy budget').fill('5')
  await page.getByRole('button', { name: 'Open the measured whale example' }).click()
  assert.equal(await page.getByRole('button', { name: 'Early whale', exact: true }).getAttribute('aria-pressed'), 'true')
  assert.notEqual(await page.getByLabel('Scenario total buy budget').inputValue(), '5')
  assert.deepEqual(errors, []); assert.deepEqual(sends, [])
  console.log(JSON.stringify({ network: 'public-devnet', evidence: 'unsigned simulation only', missingWallet: 'passed', rejectedConnection: 'passed', emptyWallet: 'funding instructions shown', accountSwitchBeforeSigning: 'blocked', changedTerms: 'review invalidated', exampleReset: 'passed', mobileWidth: 390, signatureRequests: 0, sentTransactions: 0, review, errors }))
} finally { await browser.close() }

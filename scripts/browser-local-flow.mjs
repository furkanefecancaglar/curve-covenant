import { chromium } from 'playwright-core'
import { Connection, Keypair, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js'
import assert from 'node:assert/strict'
import { deriveDbcPoolAuthority, DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// Requires the local validator helper and `npm run dev -- --port 4175`.
// All public RPC URLs are intercepted and fulfilled from localhost. No mainnet writes.
const port = Number(process.env.LOCAL_RPC_PORT ?? 18899)
assert(Number.isInteger(port) && port >= 1024 && port <= 65535)
const local = new Connection(`http://127.0.0.1:${port}`, 'confirmed')
const fixture = process.env.STOCK_FIXTURE_DIR
const longCurve = process.env.LONG_CURVE === '1'
const payer = fixture ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(await readFile(join(fixture, 'signer.json'), 'utf8')))) : Keypair.generate()
let signCount = 0
let sendCount = 0
let hideStatuses = false
const recovery = process.env.RECOVERY === '1'
const launchReload = process.env.LAUNCH_RELOAD ?? ''
assert(['', 'combined', 'split'].includes(launchReload))
assert(!launchReload || !recovery, 'Run launch reload and trade interruption fixtures separately')
let recoveredReceipt = null
assert(!recovery || !fixture, 'Recovery fault fixture uses SOL')
const funding = await local.requestAirdrop(payer.publicKey, 10 * LAMPORTS_PER_SOL)
await local.confirmTransaction(funding, 'confirmed')
// DBC's migration authority pays destination account rent in this local fixture.
const authorityFunding = await local.requestAirdrop(deriveDbcPoolAuthority(), LAMPORTS_PER_SOL)
await local.confirmTransaction(authorityFunding, 'confirmed')
const executablePath = process.env.CHROMIUM_PATH
if (!executablePath) throw new Error('Set CHROMIUM_PATH to an installed Chromium executable.')
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } })
const appUrl = process.env.APP_URL ?? 'http://127.0.0.1:4175'
// A public HTTPS page needs explicit permission to connect to this local-only fixture.
if (new URL(appUrl).protocol === 'https:') await page.context().grantPermissions(['local-network-access'], { origin: new URL(appUrl).origin })
try {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route(/https:\/\/(solana-rpc\.publicnode\.com|api\.devnet\.solana\.com)\/?$/, async route => {
    const request = JSON.parse(route.request().postData())
    if ((recovery || launchReload) && request.method === 'getSignatureStatuses' && hideStatuses) {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32005, message: 'Test: confirmation RPC unavailable' } }) }); return
    }
    if (request.method === 'sendTransaction') {
      sendCount++
      if (recovery && (sendCount === 2 || sendCount === 5)) hideStatuses = true
      if (launchReload === 'combined' && sendCount === 1) hideStatuses = true
    }
    const response = await fetch(local.rpcEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: route.request().postData() })
    if (recovery && request.method === 'sendTransaction' && sendCount === 1) { await response.text(); await route.abort('failed'); return }
    await route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() })
  })
  if (recovery) await page.addInitScript(() => {
    window.WebSocket = class { constructor() { throw new Error('Test: WebSockets are disabled') } }
  })
  else await page.addInitScript(localPort => {
    const NativeWebSocket = window.WebSocket
    window.WebSocket = class extends NativeWebSocket {
      constructor(url, protocols) {
        const endpoint = new URL(url)
        const isRpc = ['solana-rpc.publicnode.com', 'api.devnet.solana.com'].includes(endpoint.hostname)
        super(isRpc ? `ws://127.0.0.1:${localPort + 1}` : url, protocols)
      }
    }
  }, port)
  await page.exposeFunction('localTestSign', async bytes => {
    signCount++
    if (process.env.CANCEL_SECOND === '1' && signCount === 2) throw new Error('Test: wallet declined pool creation')
    const tx = Transaction.from(Buffer.from(bytes))
    assert(tx.feePayer.equals(payer.publicKey), 'Unexpected test payer')
    tx.partialSign(payer)
    return Array.from(tx.signatures.find(signer => signer.publicKey.equals(payer.publicKey)).signature)
  })
  await page.goto(appUrl, { waitUntil: 'networkidle' })
  async function installWallet() {
  await page.addScriptTag({ path: new URL('../node_modules/@solana/web3.js/lib/index.iife.min.js', import.meta.url).pathname })
  await page.evaluate(address => {
    const { PublicKey } = window.solanaWeb3
    window.phantom = { solana: { isPhantom: true,
      connect: async () => ({ publicKey: new PublicKey(address) }),
      signTransaction: async tx => {
        const signature = await window.localTestSign(Array.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false })))
        tx.addSignature(tx.feePayer, new Uint8Array(signature))
        return tx
      },
    } }
  }, payer.publicKey.toBase58())
  }
  await installWallet()
  if (fixture) {
    await page.getByRole('button', { name: /Xerox xStock/ }).click()
    await page.getByLabel('Token name', { exact: true }).fill('Curve Covenant Demo')
    await page.getByLabel('Ticker', { exact: true }).fill('CCDEMO')
    await page.getByLabel('Public metadata JSON URL').fill('https://furkanefecancaglar.github.io/curve-covenant/metadata/demo-token.json')
  }
  if (longCurve) await page.getByRole('button', { name: /Long discovery curve/ }).click()
  await page.getByLabel('Opening market cap', { exact: false }).fill('1')
  await page.getByLabel('Graduation market cap', { exact: false }).fill('10')
  let comparedConfig = null
  if (process.env.SCENARIO_CURVE === 'long') {
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export Scenario Report · JSON' }).click()])
    comparedConfig = JSON.parse(await readFile(await download.path(), 'utf8')).curves.find(curve => curve.id === 'long').config
    await page.getByRole('button', { name: 'Use long curve for launch' }).click()
  }
  await page.getByRole('button', { name: 'Check launch with Phantom' }).click()
  await page.getByRole('region', { name: 'Launch cost review' }).waitFor({ timeout: 25000 })
  if (await page.getByRole('checkbox').count()) await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: /Launch token/ }).click()
  if (launchReload) {
    await page.getByRole('button', { name: 'Resume token creation' }).waitFor({ timeout: 25000 })
    recoveredReceipt = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(key => key.startsWith('curve-covenant:launch:v1:')))))
    assert(recoveredReceipt?.configAddress, 'Signed launch must be recoverable before reload')
    assert(!JSON.stringify(recoveredReceipt).includes('secretKey'), 'Receipt must not store signers')
    const signaturesBeforeReload = signCount
    await page.reload({ waitUntil: 'networkidle' }); await installWallet()
    assert(await page.getByRole('button', { name: 'Check launch with Phantom' }).isDisabled() || fixture, 'Old launch must be checked before creating another on the same quote')
    hideStatuses = false
    await page.getByRole('button', { name: 'Check saved launch', exact: true }).click()
    assert.equal(signCount, signaturesBeforeReload, 'Checking saved state must not sign')
    if (launchReload === 'combined') {
      await page.getByRole('button', { name: 'Open recovered pool' }).click({ timeout: 15000 })
      assert.equal(signCount, 1); assert.equal(sendCount, 1)
    } else {
      await page.getByRole('button', { name: 'Check remaining launch cost' }).click({ timeout: 15000 })
      await page.getByRole('region', { name: 'Recovered launch cost review' }).waitFor({ timeout: 15000 })
      assert.equal(signCount, signaturesBeforeReload, 'Cost review must remain unsigned')
      await page.setViewportSize({ width: 390, height: 844 })
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Recovery panel must fit a phone')
      if (process.env.RECOVERY_SCREENSHOT) await page.getByRole('region', { name: 'Unfinished launches' }).screenshot({ path: process.env.RECOVERY_SCREENSHOT })
      await page.setViewportSize({ width: 1440, height: 1050 })
      const recoveryCheckbox = page.getByRole('region', { name: 'Unfinished launches' }).getByRole('checkbox')
      if (await recoveryCheckbox.count()) await recoveryCheckbox.check()
      await page.getByRole('button', { name: 'Finish saved launch with wallet' }).click()
      await page.waitForFunction(() => document.querySelector('[aria-label="Graduation pool address"]')?.value.length > 30)
      assert.equal(signCount, signaturesBeforeReload + 1); assert.equal(sendCount, 2, 'Config must not be paid for a second time')
    }
    assert.equal(await page.getByRole('region', { name: 'Unfinished launches' }).count(), 0)
  } else {
    if (process.env.CANCEL_SECOND === '1') await page.getByRole('button', { name: 'Resume token creation' }).click({ timeout: 25000 })
    await page.locator('.launch-success').waitFor({ timeout: 25000 })
  }
  const pool = await page.getByLabel('Graduation pool address').inputValue()
  assert(pool.length > 30, 'Created pool must be transferred into the graduation form')
  if (recoveredReceipt) {
    const client = DynamicBondingCurveClient.create(local, 'confirmed')
    const created = await client.state.getPool(pool)
    assert.equal(created.poolState.config.toBase58(), recoveredReceipt.configAddress, 'Recovery must reuse the original paid config')
    if (launchReload === 'split') assert.notEqual(created.poolState.baseMint.toBase58(), recoveredReceipt.mintAddress, 'A closed tab needs a fresh unused mint signer')
    else assert.equal(created.poolState.baseMint.toBase58(), recoveredReceipt.mintAddress)
  }
  if (comparedConfig) {
    const client = DynamicBondingCurveClient.create(local, 'confirmed')
    const created = await client.state.getPool(pool)
    const config = await client.state.getPoolConfig(created.poolState.config)
    assert.equal(config.sqrtStartPrice.toString(), comparedConfig.sqrtStartPrice)
    assert.equal(config.migrationQuoteThreshold.toString(), comparedConfig.migrationQuoteThreshold)
    for (let i = 0; i < comparedConfig.curve.length; i++) {
      assert.equal(config.curve[i].sqrtPrice.toString(), comparedConfig.curve[i].sqrtPrice)
      assert.equal(config.curve[i].liquidity.toString(), comparedConfig.curve[i].liquidity)
    }
  }
  await page.getByRole('button', { name: 'Read pool' }).click()
  await page.getByRole('button', { name: 'Connect wallet for balances' }).click()
  await page.waitForFunction(() => document.querySelector('[data-testid="wallet-base-balance"]')?.textContent === '0')
  const initialQuoteBalance = await page.getByTestId('wallet-quote-balance').innerText()
  await page.getByLabel('Live buy amount').fill('0.1')
  await page.getByRole('button', { name: 'Get buy quote' }).click()
  await page.getByRole('button', { name: 'Buy with wallet' }).click({ timeout: 15000 })
  if (recovery) {
    await page.getByRole('button', { name: 'Check trade status', exact: true }).waitFor({ timeout: 15000 })
    assert(await page.getByRole('button', { name: 'Get buy quote' }).isDisabled())
    assert.equal(signCount, 2); assert.equal(sendCount, 2)
    await page.reload({ waitUntil: 'networkidle' })
    await installWallet()
    await page.getByLabel('Graduation pool address').fill(pool)
    await page.getByRole('button', { name: 'Read pool' }).click()
    await page.getByRole('region', { name: 'Unconfirmed trade' }).waitFor({ timeout: 15000 })
    assert(await page.getByRole('button', { name: 'Get buy quote' }).isDisabled())
    // An unsuccessful check must retain the receipt and keep trading locked.
    await page.getByRole('button', { name: 'Check trade status', exact: true }).click()
    await page.locator('.trade-panel .publish-error').waitFor()
    assert(await page.getByRole('button', { name: 'Get buy quote' }).isDisabled())
    hideStatuses = false
    await page.getByRole('button', { name: 'Check trade status', exact: true }).click()
    assert.equal(signCount, 2); assert.equal(sendCount, 2)
    await page.getByRole('button', { name: 'Connect wallet for balances' }).click()
  }
  await page.getByRole('link', { name: /Buy confirmed/ }).waitFor({ timeout: 25000 })
  await page.waitForFunction(() => Number(document.querySelector('[data-testid="wallet-base-balance"]')?.textContent) > 0)
  const bought = await page.getByTestId('wallet-base-balance').innerText()
  const quoteAfterBuy = await page.getByTestId('wallet-quote-balance').innerText()
  assert(Number(quoteAfterBuy) < Number(initialQuoteBalance), 'Buying must decrease the quote balance')
  // Launch fixtures have six base decimals. Sell half without rounding through a JS number.
  const [whole, fraction = ''] = bought.split('.')
  const sellRaw = (BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'))) / 2n
  const sellAmount = `${sellRaw / 1_000_000n}.${(sellRaw % 1_000_000n).toString().padStart(6, '0')}`
  await page.getByRole('button', { name: 'Sell', exact: true }).click()
  await page.getByRole('button', { name: 'Use half my token balance' }).click()
  await page.waitForFunction(expected => document.querySelector('[aria-label="Live sell amount"]')?.value === expected, sellAmount.replace(/0+$/, '').replace(/\.$/, ''))
  await page.getByRole('button', { name: 'Get sell quote' }).click()
  await page.getByRole('button', { name: 'Sell with wallet' }).waitFor({ timeout: 15000 })
  const sellPreview = await page.locator('.trade-preview').innerText()
  assert(sellPreview.includes(fixture ? 'XRXx' : 'SOL'), 'Sell quote must show the quote asset')
  await page.getByRole('button', { name: 'Sell with wallet' }).click()
  await page.getByRole('link', { name: /Sell confirmed/ }).waitFor({ timeout: 25000 })
  await page.waitForFunction(before => {
    const value = document.querySelector('[data-testid="wallet-base-balance"]')?.textContent
    return value != null && Number(value) < Number(before)
  }, bought)
  const remaining = await page.getByTestId('wallet-base-balance').innerText()
  const [remainingWhole, remainingFraction = ''] = remaining.split('.')
  assert.equal(BigInt(remainingWhole) * 1_000_000n + BigInt(remainingFraction.padEnd(6, '0')),
    BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0')) - sellRaw)
  assert(Number(await page.getByTestId('wallet-quote-balance').innerText()) > Number(quoteAfterBuy), 'Selling must increase the quote balance')
  await page.setViewportSize({ width: 390, height: 844 })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Mobile page must not overflow horizontally')
  await page.setViewportSize({ width: 1440, height: 1050 })
  await page.getByRole('button', { name: 'Buy', exact: true }).click()
  assert.equal(await page.locator('.trade-preview').count(), 0, 'Changing sides clears the reviewed quote')
  await page.getByLabel('Live buy amount').fill('3')
  await page.getByRole('button', { name: 'Get buy quote' }).click()
  await page.getByRole('button', { name: 'Buy with wallet' }).click({ timeout: 15000 })
  await page.getByText('Ready to graduate', { exact: true }).waitFor({ timeout: 25000 })
  await page.getByRole('button', { name: 'Check graduation cost' }).click()
  await page.getByRole('region', { name: 'Graduation cost review' }).waitFor({ timeout: 25000 })
  await page.getByRole('button', { name: 'Graduate with wallet' }).click()
  if (recovery) {
    await page.getByText(/A signed migration needs checking/).waitFor({ timeout: 15000 })
    assert.equal(signCount, 5); assert.equal(sendCount, 5)
    assert.equal(await page.getByRole('button', { name: 'Graduate with wallet' }).count(), 0)
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByLabel('Graduation pool address').fill(pool)
    hideStatuses = false
    await page.getByRole('button', { name: 'Read pool' }).click()
  }
  await page.locator('.lifecycle-balances').waitFor({ timeout: 25000 })
  const [receiptFile] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export on-chain evidence · JSON' }).click()])
  const evidence = JSON.parse(await readFile(await receiptFile.path(), 'utf8'))
  assert.equal(evidence.observedNetwork, 'unrecognized-network', 'Local genesis must never be labeled public devnet')
  assert(evidence.receipts.length >= 5)
  assert(evidence.receipts.every(receipt => receipt.succeeded === true && receipt.explorerUrl === null))
  assert.deepEqual(errors, [])
  if (recovery) {
    assert.equal(sendCount, 5); assert.equal(signCount, 5)
    assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('curve-covenant:pending-')).length), 0)
  }
  console.log(JSON.stringify({ network: 'local-validator', flow: 'browser launch -> balances -> buy -> sell -> balance refresh -> buy -> graduate -> vault reads', quote: fixture ? 'XRXx (synthetic local balance)' : 'SOL', longCurve, recovery, launchReload, reusedConfig: recoveredReceipt?.configAddress ?? null, sendCount, scenarioCurve: process.env.SCENARIO_CURVE ?? null, comparedConfigMatchesChain: Boolean(comparedConfig), signCount, pool,
    result: await page.locator('.lifecycle-result').innerText(), pageErrors: errors }))
} catch (error) {
  console.error('Lifecycle failure:', error.message)
  console.error({ signCount, errors: await page.locator('.publish-error').allTextContents(), progress: await page.locator('[role=status]').allTextContents() })
  throw error
} finally { await browser.close() }

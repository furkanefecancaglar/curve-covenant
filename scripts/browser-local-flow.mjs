import { chromium } from 'playwright-core'
import { Connection, Keypair, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js'
import assert from 'node:assert/strict'
import { deriveDbcPoolAuthority } from '@meteora-ag/dynamic-bonding-curve-sdk'
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
const funding = await local.requestAirdrop(payer.publicKey, 10 * LAMPORTS_PER_SOL)
await local.confirmTransaction(funding, 'confirmed')
// DBC's migration authority pays destination account rent in this local fixture.
const authorityFunding = await local.requestAirdrop(deriveDbcPoolAuthority(), LAMPORTS_PER_SOL)
await local.confirmTransaction(authorityFunding, 'confirmed')
const executablePath = process.env.CHROMIUM_PATH
if (!executablePath) throw new Error('Set CHROMIUM_PATH to an installed Chromium executable.')
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } })
try {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route(/https:\/\/(solana-rpc\.publicnode\.com|api\.devnet\.solana\.com)\/?$/, async route => {
    const response = await fetch(local.rpcEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: route.request().postData() })
    await route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() })
  })
  await page.addInitScript(localPort => {
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
  await page.goto('http://127.0.0.1:4175', { waitUntil: 'networkidle' })
  await page.evaluate(async address => {
    const { PublicKey } = await import('/node_modules/.vite/deps/@solana_web3__js.js')
    window.phantom = { solana: { isPhantom: true,
      connect: async () => ({ publicKey: new PublicKey(address) }),
      signTransaction: async tx => {
        const signature = await window.localTestSign(Array.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false })))
        tx.addSignature(tx.feePayer, new Uint8Array(signature))
        return tx
      },
    } }
  }, payer.publicKey.toBase58())
  if (fixture) {
    await page.getByRole('button', { name: /Xerox xStock/ }).click()
    await page.getByLabel('Token name', { exact: true }).fill('Curve Covenant Demo')
    await page.getByLabel('Ticker', { exact: true }).fill('CCDEMO')
    await page.getByLabel('Public metadata JSON URL').fill('https://furkanefecancaglar.github.io/curve-covenant/metadata/demo-token.json')
    await page.getByRole('checkbox').check()
  }
  if (longCurve) await page.getByRole('button', { name: /Long discovery curve/ }).click()
  await page.getByLabel('Opening market cap', { exact: false }).fill('1')
  await page.getByLabel('Graduation market cap', { exact: false }).fill('10')
  await page.getByRole('button', { name: /Launch token/ }).click()
  if (process.env.CANCEL_SECOND === '1') {
    await page.getByRole('button', { name: 'Resume token creation' }).click({ timeout: 25000 })
  }
  await page.locator('.launch-success').waitFor({ timeout: 25000 })
  const pool = await page.getByLabel('Graduation pool address').inputValue()
  assert(pool.length > 30, 'Created pool must be transferred into the graduation form')
  await page.getByRole('button', { name: 'Read pool' }).click()
  await page.getByRole('button', { name: 'Connect wallet for balances' }).click()
  await page.waitForFunction(() => document.querySelector('[data-testid="wallet-base-balance"]')?.textContent === '0')
  const initialQuoteBalance = await page.getByTestId('wallet-quote-balance').innerText()
  await page.getByLabel('Live buy amount').fill('0.1')
  await page.getByRole('button', { name: 'Get buy quote' }).click()
  await page.getByRole('button', { name: 'Buy with wallet' }).click({ timeout: 15000 })
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
  await page.getByLabel('Live sell amount').fill(sellAmount)
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
  await page.getByRole('button', { name: 'Graduate with wallet' }).click()
  await page.locator('.lifecycle-balances').waitFor({ timeout: 25000 })
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ network: 'local-validator', flow: 'browser launch -> balances -> buy -> sell -> balance refresh -> buy -> graduate -> vault reads', quote: fixture ? 'XRXx (synthetic local balance)' : 'SOL', longCurve, signCount, pool,
    result: await page.locator('.lifecycle-result').innerText(), pageErrors: errors }))
} catch (error) {
  console.error({ signCount, errors: await page.locator('.publish-error').allTextContents(), progress: await page.locator('[role=status]').allTextContents() })
  throw error
} finally { await browser.close() }

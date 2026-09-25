import { chromium } from 'playwright-core'
import { Connection, Keypair, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js'
import assert from 'node:assert/strict'

// Requires the local validator helper and `npm run dev -- --port 4175`.
// All public RPC URLs are intercepted and fulfilled from localhost. No mainnet writes.
const local = new Connection('http://127.0.0.1:18899', 'confirmed')
const payer = Keypair.generate()
const funding = await local.requestAirdrop(payer.publicKey, 10 * LAMPORTS_PER_SOL)
await local.confirmTransaction(funding, 'confirmed')
const executablePath = process.env.CHROMIUM_PATH
if (!executablePath) throw new Error('Set CHROMIUM_PATH to an installed Chromium executable.')
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route(/https:\/\/(solana-rpc\.publicnode\.com|api\.devnet\.solana\.com)\/?$/, async route => {
    const response = await fetch(local.rpcEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: route.request().postData() })
    await route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() })
  })
  await page.exposeFunction('localTestSign', async bytes => {
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
  await page.getByLabel('Opening market cap', { exact: false }).fill('1')
  await page.getByLabel('Graduation market cap', { exact: false }).fill('10')
  await page.getByRole('button', { name: /Launch token/ }).click()
  await page.locator('.launch-success').waitFor({ timeout: 25000 })
  const pool = await page.getByLabel('Graduation pool address').inputValue()
  assert(pool.length > 30, 'Created pool must be transferred into the graduation form')
  await page.getByRole('button', { name: 'Read pool' }).click()
  await page.getByLabel('Live buy amount').fill('3')
  await page.getByRole('button', { name: 'Get buy quote' }).click()
  await page.getByRole('button', { name: 'Buy with wallet' }).click({ timeout: 15000 })
  await page.getByText('Ready to graduate', { exact: true }).waitFor({ timeout: 25000 })
  await page.getByRole('button', { name: 'Graduate with wallet' }).click()
  await page.locator('.lifecycle-balances').waitFor({ timeout: 25000 })
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ network: 'local-validator', flow: 'browser launch -> quote -> buy -> graduate -> vault reads', pool,
    result: await page.locator('.lifecycle-result').innerText(), pageErrors: errors }))
} finally { await browser.close() }

import { chromium } from 'playwright-core'
import { Connection, Keypair, Transaction, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { deriveDbcPoolAuthority, DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import bs58 from 'bs58'

const work = resolve('docs/video-work')
await mkdir(join(work, 'capture'), { recursive: true })
const scenes = JSON.parse(await readFile('docs/demo-scenes.json', 'utf8'))
const durations = Object.fromEntries(scenes.map(scene => [scene.id, Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', join(work, `${scene.id}.mp3`)], { encoding: 'utf8' }).trim())]))
assert(Object.values(durations).reduce((a, b) => a + b + 1, 0) < 177, 'Narration exceeds the demo duration budget')
const port = Number(process.env.LOCAL_RPC_PORT ?? 18899)
assert(Number.isInteger(port) && port >= 1024 && port < 65535)
const fixture = process.env.STOCK_FIXTURE_DIR
assert(fixture, 'A synthetic local stock fixture is required')
const connection = new Connection(`http://127.0.0.1:${port}`, 'confirmed')
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(await readFile(join(fixture, 'signer.json'), 'utf8'))))
for (const recipient of [payer.publicKey, deriveDbcPoolAuthority()]) {
  const signature = await connection.requestAirdrop(recipient, 10 * LAMPORTS_PER_SOL)
  await connection.confirmTransaction(signature, 'confirmed')
}
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox'] })
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: join(work, 'capture'), size: { width: 1920, height: 1080 } } })
const page = await context.newPage()
const origin = performance.now()
const errors = [], timeline = [], downloads = [], signedTransactions = [], receipts = []
let pool, selectedConfig, bought, initialQuote
page.on('pageerror', issue => errors.push(issue.message))
await page.route(/https:\/\/(solana-rpc\.publicnode\.com|api\.devnet\.solana\.com)\/?$/, async route => {
  const response = await fetch(connection.rpcEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: route.request().postData() })
  await route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() })
})
await page.addInitScript(localPort => {
  const Native = window.WebSocket
  window.WebSocket = class extends Native {
    constructor(url, protocols) { super(['solana-rpc.publicnode.com', 'api.devnet.solana.com'].includes(new URL(url).hostname) ? `ws://127.0.0.1:${localPort + 1}` : url, protocols) }
  }
}, port)
await page.exposeFunction('localDemoSign', async bytes => {
  const transaction = Transaction.from(Buffer.from(bytes))
  assert(transaction.feePayer.equals(payer.publicKey))
  transaction.partialSign(payer)
  // Record public signature bytes only; never serialize the fixture's key.
  signedTransactions.push(bs58.encode(transaction.signature))
  return Array.from(transaction.signatures.find(s => s.publicKey.equals(payer.publicKey)).signature)
})
async function overlay(title) {
  await page.evaluate(value => {
    document.getElementById('recording-banner')?.remove()
    const banner = document.createElement('div')
    banner.id = 'recording-banner'
    banner.style.cssText = 'position:fixed;z-index:2147483647;top:0;left:0;right:0;padding:15px 28px;background:#101910;color:#e7f5db;border-bottom:2px solid #ca9f42;font:600 20px Arial;display:flex;justify-content:space-between;box-sizing:border-box;'
    const heading = document.createElement('span'); heading.textContent = value
    const badge = document.createElement('span'); badge.style.cssText = 'color:#f4cd73;font:600 16px Arial;align-self:center'; badge.textContent = 'LOCAL VALIDATOR · SYNTHETIC XRXx · TEST SIGNER'
    banner.append(heading, badge); document.body.append(banner)
    document.documentElement.style.scrollPaddingTop = '95px'
  }, title)
}
async function focus(selector) { await page.locator(selector).first().evaluate(element => window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY - 92, behavior: 'instant' })) }
async function scene(id, action) {
  const info = scenes.find(s => s.id === id)
  await overlay(info.title)
  const start = (performance.now() - origin) / 1000
  await action()
  for (const signature of signedTransactions.slice(receipts.length)) {
    let transaction = null
    for (let attempt = 0; attempt < 5 && !transaction; attempt++) {
      transaction = await connection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 })
      if (!transaction) await new Promise(resolve => setTimeout(resolve, 200))
    }
    assert(transaction && transaction.meta && !transaction.meta.err, `Confirmed receipt missing for ${id}`)
    receipts.push({ stage: id, signature, slot: transaction.slot, blockTime: transaction.blockTime, feeLamports: transaction.meta.fee, error: transaction.meta.err })
  }
  const actionSeconds = (performance.now() - origin) / 1000 - start
  const remaining = Math.max(0, durations[id] + 1 - actionSeconds)
  if (remaining) await new Promise(resolve => setTimeout(resolve, remaining * 1000))
  const end = (performance.now() - origin) / 1000
  timeline.push({ id, title: info.title, narration: info.text, start, end, duration: end - start, actionSeconds, audioSeconds: durations[id] })
  console.log(JSON.stringify({ scene: id, seconds: end - start, actionSeconds }))
}
async function download(name) {
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name, exact: true }).click()])
  const text = await readFile(await file.path(), 'utf8')
  downloads.push({ name: file.suggestedFilename(), sha256: createHash('sha256').update(text).digest('hex') })
  return text
}
try {
  await page.goto('http://127.0.0.1:4175', { waitUntil: 'networkidle' })
  await page.evaluate(async address => {
    const { PublicKey } = await import('/node_modules/.vite/deps/@solana_web3__js.js')
    window.phantom = { solana: { isPhantom: true, connect: async () => ({ publicKey: new PublicKey(address) }), signTransaction: async tx => {
      const signature = await window.localDemoSign(Array.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false })))
      tx.addSignature(tx.feePayer, new Uint8Array(signature)); return tx
    } } }
  }, payer.publicKey.toBase58())
  await page.getByRole('button', { name: /Xerox xStock/ }).click()
  await page.getByLabel('Opening market cap', { exact: false }).fill('1')
  await page.getByLabel('Graduation market cap', { exact: false }).fill('10')
  await page.getByLabel('Token name', { exact: true }).fill('Curve Covenant Demo')
  await page.getByLabel('Ticker', { exact: true }).fill('CCDEMO')
  await page.getByLabel('Public metadata JSON URL').fill('https://furkanefecancaglar.github.io/curve-covenant/metadata/demo-token.json')
  await page.getByRole('checkbox').check()
  await scene('opening', async () => { await focus('#scenarios') })
  await scene('whale', async () => {
    await focus('#scenarios .comparison-chart')
    await page.getByLabel('Inspect scenario time').fill('0')
    assert((await page.getByTestId('scenario-finding').innerText()).includes('2.53'))
    await new Promise(resolve => setTimeout(resolve, 6000))
    await focus('.scenario-details-grid')
  })
  await scene('selling', async () => {
    await page.getByLabel('Trading scenario', { exact: true }).selectOption('sell-pressure')
    await focus('#scenarios .comparison-chart')
    await new Promise(resolve => setTimeout(resolve, 5000))
    await page.locator('.scenario-ledger summary').click()
    await focus('.scenario-ledger')
  })
  await scene('export', async () => {
    await page.getByLabel('Trading scenario', { exact: true }).selectOption('whale')
    await page.locator('.scenario-ledger summary').click()
    const report = JSON.parse(await download('Export Scenario Report · JSON'))
    await download('Export visual summary · SVG')
    selectedConfig = report.curves.find(c => c.id === 'long').config
    await page.getByRole('button', { name: 'Use long curve for launch', exact: true }).click()
    const config = JSON.parse(await download('Download SDK config JSON'))
    assert.deepEqual(config.sdkConfig, selectedConfig)
    await page.getByRole('button', { name: 'Copy design link', exact: true }).click()
    await focus('.studio-actions')
  })
  await scene('launch', async () => {
    await focus('#launch')
    await page.getByRole('button', { name: /Launch token/ }).click()
    await page.locator('.launch-success').waitFor({ timeout: 25000 })
    pool = await page.getByLabel('Graduation pool address').inputValue()
    const client = DynamicBondingCurveClient.create(connection, 'confirmed')
    const created = await client.state.getPool(pool)
    const config = await client.state.getPoolConfig(created.poolState.config)
    assert.equal(config.sqrtStartPrice.toString(), selectedConfig.sqrtStartPrice)
    assert.equal(config.migrationQuoteThreshold.toString(), selectedConfig.migrationQuoteThreshold)
    for (let i = 0; i < selectedConfig.curve.length; i++) {
      assert.equal(config.curve[i].sqrtPrice.toString(), selectedConfig.curve[i].sqrtPrice)
      assert.equal(config.curve[i].liquidity.toString(), selectedConfig.curve[i].liquidity)
    }
    await focus('.launch-success')
  })
  await scene('buy', async () => {
    await page.getByRole('button', { name: 'Read pool', exact: true }).click()
    await page.getByRole('button', { name: 'Connect wallet for balances' }).click()
    await page.waitForFunction(() => document.querySelector('[data-testid="wallet-base-balance"]')?.textContent === '0')
    initialQuote = await page.getByTestId('wallet-quote-balance').innerText()
    await page.getByLabel('Live buy amount').fill('0.1')
    await page.getByRole('button', { name: 'Get buy quote' }).click()
    await page.getByRole('button', { name: 'Buy with wallet' }).waitFor()
    await focus('.trade-preview')
    await new Promise(resolve => setTimeout(resolve, 1800))
    await page.getByRole('button', { name: 'Buy with wallet' }).click()
    await page.getByRole('link', { name: /Buy confirmed/ }).waitFor({ timeout: 25000 })
    await page.waitForFunction(() => Number(document.querySelector('[data-testid="wallet-base-balance"]')?.textContent) > 0)
    bought = await page.getByTestId('wallet-base-balance').innerText()
    assert(Number(await page.getByTestId('wallet-quote-balance').innerText()) < Number(initialQuote))
    await focus('.wallet-balances')
  })
  await scene('sell', async () => {
    const [whole, fraction = ''] = bought.split('.')
    const raw = (BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'))) / 2n
    const sell = `${raw / 1_000_000n}.${(raw % 1_000_000n).toString().padStart(6, '0')}`
    const beforeQuote = Number(await page.getByTestId('wallet-quote-balance').innerText())
    await page.getByRole('button', { name: 'Sell', exact: true }).click()
    await page.getByLabel('Live sell amount').fill(sell)
    await page.getByRole('button', { name: 'Get sell quote' }).click()
    await page.getByRole('button', { name: 'Sell with wallet' }).waitFor()
    await focus('.trade-preview')
    await new Promise(resolve => setTimeout(resolve, 1800))
    await page.getByRole('button', { name: 'Sell with wallet' }).click()
    await page.getByRole('link', { name: /Sell confirmed/ }).waitFor({ timeout: 25000 })
    await page.waitForFunction(before => {
      const value = document.querySelector('[data-testid="wallet-base-balance"]')?.textContent
      return value != null && Number(value) < Number(before)
    }, bought)
    assert(Number(await page.getByTestId('wallet-quote-balance').innerText()) > beforeQuote)
    await focus('.wallet-balances')
  })
  await scene('graduate', async () => {
    await page.getByRole('button', { name: 'Buy', exact: true }).click()
    await page.getByLabel('Live buy amount').fill('3')
    await page.getByRole('button', { name: 'Get buy quote' }).click()
    await page.getByRole('button', { name: 'Buy with wallet' }).click()
    await page.getByText('Ready to graduate', { exact: true }).waitFor({ timeout: 25000 })
    await page.getByRole('button', { name: 'Graduate with wallet' }).click()
    await page.locator('.lifecycle-balances').waitFor({ timeout: 25000 })
    await focus('.lifecycle-result')
  })
  const proofText = await readFile('docs/evidence/scenario-chain-proof-2026-09-26.json', 'utf8')
  const proof = JSON.parse(proofText)
  const manifest = JSON.parse(await readFile('docs/evidence/scenario-manifest-2026-09-26.json', 'utf8'))
  assert.equal(createHash('sha256').update(proofText).digest('hex'), manifest.sha256['docs/evidence/scenario-chain-proof-2026-09-26.json'])
  const sample = proof.results.find(r => r.quote === 'XRXx' && r.curve === 'long' && r.feeSchedule === 'fixed').checks[2]
  const rows = ['sqrtPriceRaw', 'baseReserveRaw', 'quoteReserveRaw', 'feeQuoteRaw'].map(key => `<tr><th>${key}</th><td>${sample.predicted.after[key]}</td><td>${sample.actual[key]}</td></tr>`).join('')
  await writeFile(join(work, 'proof.html'), `<!doctype html><html><head><meta charset="utf-8"><style>body{background:#0e1b12;color:#e4efd9;font:24px Arial;margin:140px 110px}h1{font-size:54px;color:#b6ed90}p{line-height:1.6;color:#b5c9ac}table{width:100%;border-collapse:collapse;font:21px monospace}th,td{padding:22px 10px;border-bottom:1px solid #355038;text-align:left}.tag{color:#f4cd73;font-size:18px}code{font-size:16px;overflow-wrap:anywhere}</style></head><body><span class="tag">CHECKED-IN EXECUTION EVIDENCE · LOCAL VALIDATOR</span><h1>56 swaps. 8 pools. Exact raw-unit matches.</h1><p>SOL + XRXx · one segment + 16 segments · fixed + declining fees<br>Example below: an actual XRXx sell, predicted versus observed.</p><table><tr><th>Field</th><th>Prediction</th><th>Observed on chain</th></tr>${rows}</table><p>Source: docs/evidence/scenario-chain-proof-2026-09-26.json<br><code>SHA-256: ${manifest.sha256['docs/evidence/scenario-chain-proof-2026-09-26.json']}</code></p></body></html>`)
  await scene('proof', async () => {
    await page.goto('http://127.0.0.1:4175/docs/video-work/proof.html')
    await overlay(scenes.find(s => s.id === 'proof').title)
  })
  await scene('close', async () => {
    await page.setContent('<html><body style="margin:0;background:#0e1b12;color:#e4efd9;font:28px Arial;padding:190px 160px"><p style="color:#b6ed90">CURVE COVENANT</p><h1 style="font-size:76px;line-height:1.15">Measure. Choose.<br>Launch. Verify.</h1><p style="line-height:1.8">Live: furkanefecancaglar.github.io/curve-covenant/<br>Source: github.com/furkanefecancaglar/curve-covenant</p><p style="color:#b5c9ac;font-size:22px;line-height:1.7">Next: public Phantom evidence and real builder trials.<br>Hypothetical scenarios · Local execution evidence · Synthetic narration</p></body></html>')
    await overlay('Explore the product and reproducible evidence')
  })
  assert.deepEqual(errors, [])
  const total = timeline.reduce((sum, item) => sum + item.duration, 0)
  assert(total <= 180, `Demo too long: ${total}`)
  const video = page.video()
  await context.close()
  const recording = await video.path()
  await writeFile(join(work, 'recording.json'), JSON.stringify({ recordedAt: new Date().toISOString(), network: 'local-validator', syntheticStockBalance: true,
    signer: 'local-test-interface', narration: 'synthetic / en-US-AriaNeural', sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    video: recording, timeline, duration: total, pool, comparedConfigMatchesChain: true, signCount: signedTransactions.length, receipts, genesisHash: await connection.getGenesisHash(), downloads, pageErrors: errors }, null, 2) + '\n')
  console.log(JSON.stringify({ recording, duration: total, pool, signs: signedTransactions.length, pageErrors: errors }))
} finally { await browser.close() }

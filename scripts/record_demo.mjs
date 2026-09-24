// Records a real browser session against the public Curve Covenant site.
// Audio is generated separately; run scripts/render_demo_audio.py first.
import { chromium } from 'playwright-core'
import { readFile, copyFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const work = path.join(root, 'docs', 'video-work')
const lengths = JSON.parse(await readFile(path.join(work, 'demo-lengths.json'), 'utf8'))
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] })
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: work, size: { width: 1280, height: 720 } }, acceptDownloads: true })
const page = await context.newPage()
page.on('pageerror', error => console.error('Browser error:', error.message))
page.on('console', message => { if (message.type() === 'error') console.error('Console error:', message.text().slice(0, 180)) })

async function stage(number, actions) {
  const started = Date.now()
  await actions()
  const wait = Math.max(0, lengths[number - 1] * 1000 - (Date.now() - started))
  await page.waitForTimeout(wait)
  console.log(`Stage ${number} complete`)
}

try {
  await stage(1, async () => {
    await page.goto('https://furkanefecancaglar.github.io/curve-covenant/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)
    await page.getByText('Try a live pool').click()
    await page.getByText('VERIFIED ON-CHAIN').waitFor({ timeout: 20000 })
    await page.locator('.result-panel').scrollIntoViewIfNeeded()
  })
  await stage(2, async () => {
    await page.locator('.metric-grid').scrollIntoViewIfNeeded()
    await page.waitForTimeout(4000)
    await page.locator('.progress-card').scrollIntoViewIfNeeded()
    await page.waitForTimeout(3000)
    await page.locator('.detail-grid').scrollIntoViewIfNeeded()
    await page.waitForTimeout(3000)
    await page.locator('.addresses').scrollIntoViewIfNeeded()
    await page.waitForTimeout(3000)
    await page.locator('.tabs').scrollIntoViewIfNeeded()
  })
  await stage(3, async () => {
    await page.getByRole('button', { name: 'Scenario lab' }).click()
    await page.getByRole('button', { name: 'Calculate' }).click()
    await page.getByText('ESTIMATED BASE TOKENS').waitFor({ timeout: 20000 })
    await page.locator('.quote-result').scrollIntoViewIfNeeded()
    await page.waitForTimeout(5000)
    await page.getByLabel('Simulated buy amount').fill('100')
    await page.getByRole('button', { name: 'Calculate' }).click()
    await page.locator('.quote-result').scrollIntoViewIfNeeded()
    await page.waitForTimeout(6000)
  })
  await stage(4, async () => {
    await page.getByRole('button', { name: 'Covenant', exact: true }).click()
    await page.getByPlaceholder('Your launch or platform name').fill('Public DBC sample')
    await page.getByPlaceholder('A plain-language description your community can understand').fill('Read-only demonstration of a public pool. Not an issuer statement.')
    await page.locator('.claim-list').scrollIntoViewIfNeeded()
    await page.waitForTimeout(3500)
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download unsigned' }).click()
    const download = await downloadPromise
    const file = path.join(work, 'public-sample-covenant.json')
    await download.saveAs(file)
    await page.waitForTimeout(2000)
    await page.locator('input[type=file]').setInputFiles(file)
    await page.getByText('Unsigned: issuer identity has not been verified').waitFor({ timeout: 20000 })
    await page.locator('.verification').scrollIntoViewIfNeeded()
  })
  await stage(5, async () => {
    await page.goto('https://furkanefecancaglar.github.io/curve-covenant/?address=4L9LJ3B5niCSLWujRJjPU6scZVbNJz4zw6A9B3aPxTeT&network=mainnet-beta&embed=1', { waitUntil: 'domcontentloaded' })
    await page.getByText('VERIFIED ON-CHAIN').waitFor({ timeout: 20000 })
    await page.waitForTimeout(4000)
    await page.locator('.detail-grid').scrollIntoViewIfNeeded()
    await page.waitForTimeout(3000)
    await page.locator('.embed-attribution').scrollIntoViewIfNeeded()
  })
  const videoPath = await page.video().path()
  await context.close()
  await copyFile(videoPath, path.join(work, 'demo-raw.webm'))
  console.log('Raw browser recording:', path.join(work, 'demo-raw.webm'))
} finally {
  await browser.close()
}

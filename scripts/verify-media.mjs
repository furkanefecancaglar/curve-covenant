import { chromium } from 'playwright-core'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'

if (!process.env.DEMO_PAGE_URL) for (const prefix of ['curve-covenant-local-demo', 'curve-covenant-pitch']) {
  const manifest = JSON.parse(await readFile(`public/media/${prefix}.manifest.json`, 'utf8'))
  const bytes = await readFile(`public/media/${prefix}.mp4`)
  if (prefix.endsWith('local-demo')) {
    assert.equal(manifest.receipts.length, 6)
    assert(manifest.receipts.every(receipt => receipt.error === null && receipt.slot > 0))
    assert.equal(new Set(manifest.receipts.map(receipt => receipt.signature)).size, 6)
  }
  assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.videoSha256)
  assert.equal(createHash('sha256').update(await readFile(`public/media/${prefix}.srt`)).digest('hex'), manifest.subtitlesSha256)
  const metadata = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', `public/media/${prefix}.mp4`], { encoding: 'utf8' }))
  assert(Number(metadata.format.duration) >= 120 && Number(metadata.format.duration) <= 180)
  assert(metadata.streams.some(s => s.codec_type === 'audio'))
  assert(metadata.streams.some(s => s.codec_type === 'video' && s.width === 1920 && s.height === 1080))
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', `public/media/${prefix}.mp4`, '-f', 'null', '-'], { stdio: 'pipe' })
  console.log(JSON.stringify({ artifact: prefix, duration: metadata.format.duration, hashVerified: true, fullDecodePassed: true }))
}
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
try {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(process.env.DEMO_PAGE_URL ?? 'http://127.0.0.1:4175/demo.html', { waitUntil: 'networkidle' })
  assert.equal(await page.locator('video').count(), 2)
  for (const video of await page.locator('video').all()) {
    await video.evaluate(async element => {
      element.muted = true
      await element.play()
    })
    await page.waitForFunction(() => [...document.querySelectorAll('video')].some(v => !v.paused && v.currentTime > 0.5))
    assert(await video.evaluate(element => element.duration >= 120 && element.duration <= 180 && element.videoWidth === 1920 && element.error === null))
    await video.evaluate(element => element.pause())
  }
  for (const href of await page.locator('a[href^="./media/"]').evaluateAll(links => links.map(link => link.href))) {
    const response = await page.request.head(href)
    assert(response.ok(), `${href}: HTTP ${response.status()}`)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
  await page.goto(new URL('./', page.url()).toString(), { waitUntil: 'networkidle' })
  assert(await page.getByRole('link', { name: 'Watch pitch & demo' }).isVisible())
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Mobile home overflow')
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ browserPlayback: 'passed', downloadLinks: 'passed', mobileWidth: 390, errors }))
} finally { await browser.close() }

// npm run screenshots: the pictures of the user guide and the tutorials (doc/images/{ko,en}-NAME.webp).
// A headless Edge or Chrome opens the dev server (npm run dev:web) with ?shot=NAME, which stages one
// screen with the sample meeting; a few pictures need a click more, done here.
//   node scripts/screenshots.mjs [http://localhost:5188]
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect, waitForTarget } from './cdp.mjs'
import { freePort } from './free-port.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.join(root, 'doc', 'images')
const base = process.argv[2] ?? 'http://localhost:5188'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
]

/** name, what to clip to (a dialog), and what to do after the screen is staged. */
const SHOTS = [
  ['start'],
  ['templates', null, `document.querySelector('[data-template]')?.closest('section')?.scrollIntoView({ block: 'start' })`],
  ['main'],
  ['info'],
  ['attendees'],
  ['editor'],
  ['icons', null, `(() => { document.getElementById('sec-discussion')?.scrollIntoView({ block: 'start' }); document.querySelector('[data-tool="icon"]')?.click() })()`],
  ['actions'],
  ['preview'],
  ['print', '.dialog'],
  ['pagesetup', '.dialog'],
  ['export', '.dialog'],
  ['settings', '.dialog'],
  ['themes', '.dialog'],
  ['chooser', '.dialog'],
  ['tutorial'],
]

const browser = BROWSERS.find((file) => fs.existsSync(file))
if (!browser) throw new Error('No Edge or Chrome found')
fs.mkdirSync(out, { recursive: true })
const port = await freePort(9333)
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mymeeting-shots-'))
const child = spawn(browser, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' })

try {
  const page = await connect(await waitForTarget(port, (target) => target.url === 'about:blank', 30000))
  await page.send('Page.enable')
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  let count = 0
  for (const language of ['ko', 'en']) {
    for (const [name, clipTo, after] of SHOTS) {
      await page.send('Page.navigate', { url: `${base}/?shot=${name}&lang=${language}&theme=light-classic` })
      await page.until(`document.querySelector('.app-shell')`, 20000)
      await sleep(900)
      if (after) {
        await page.evaluate(after)
        await sleep(500)
      }
      if (clipTo) await page.until(`document.querySelector(${JSON.stringify(clipTo)})`, 10000)
      await sleep(clipTo ? 500 : 100)
      const clip = clipTo
        ? await page.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(clipTo)}).getBoundingClientRect(); return { x: Math.floor(r.left), y: Math.floor(r.top), width: Math.ceil(r.width), height: Math.ceil(r.height), scale: 1 } })()`)
        : undefined
      const shot = await page.send('Page.captureScreenshot', { format: 'webp', quality: 86, ...(clip ? { clip } : {}) })
      fs.writeFileSync(path.join(out, `${language}-${name}.webp`), Buffer.from(shot.data, 'base64'))
      count += 1
    }
  }
  page.close()
  let total = 0
  for (const file of fs.readdirSync(out)) total += fs.statSync(path.join(out, file)).size
  console.log(`${count} pictures, ${Math.round(total / 1024)} KB in doc/images`)
} finally {
  child.kill()
  await sleep(500)
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}

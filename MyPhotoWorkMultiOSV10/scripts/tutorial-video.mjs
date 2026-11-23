// npm run tutorial:video — records the in-app tutorial (src/tutorial/steps.ts) in the
// real web app and writes MyPhotoWork-Tutorial.mp4 to out/tutorial/ and the project root.
//
//   node scripts/tutorial-video.mjs            Korean (the default language)
//   node scripts/tutorial-video.mjs --lang en  English
//   node scripts/tutorial-video.mjs --limit 3  only the first steps (a quick check)
//
// Vite + headless Edge/Chrome over CDP with a throw-away profile: a sample picture is
// opened, the tour is started from the Help menu command, and every step is held for
// its reading time while screenshots are taken. ffmpeg (on PATH) turns the frames into
// an H.264 MP4 (silent). Everything it started is stopped at the end.
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect, findBrowser, sleep, waitForTarget } from './cdp.mjs'
import { freePort } from './free-port.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const option = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback }
const language = option('lang', 'ko') === 'en' ? 'en' : 'ko'
const limit = Number(option('limit', 0)) || 0
const WIDTH = 1440
const HEIGHT = 900
const FPS = 6
const NAME = language === 'ko' ? 'MyPhotoWork-Tutorial.mp4' : 'MyPhotoWork-Tutorial-en.mp4'

/** How long a step stays on screen: enough to read its text. */
export const holdSeconds = (text) => Math.min(10, Math.max(4, 2.5 + text.length * (language === 'ko' ? 0.09 : 0.05)))

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'mpw-video-'))
const frames = path.join(scratch, 'frames')
fs.mkdirSync(frames)
const vitePort = await freePort(5620)
const debugPort = await freePort(9520)
const vite = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'], { cwd: root, stdio: 'ignore' })
const browser = spawn(findBrowser(), ['--headless=new', '--disable-gpu', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${path.join(scratch, 'profile')}`, `--window-size=${WIDTH},${HEIGHT}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' })
let page
let frameCount = 0
const list = []
try {
  for (let i = 0; i < 150; i += 1) { try { await fetch(`http://127.0.0.1:${vitePort}/`); break } catch { await sleep(200) } }
  page = await connect(await waitForTarget(debugPort, () => true))
  await page.send('Page.enable')
  await page.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false })
  await page.send('Page.navigate', { url: `http://127.0.0.1:${vitePort}/` })
  await page.until('window.__mpw && document.querySelector(".start-screen")', 90000)
  await page.evaluate(`window.__mpw.setSettings({ language: '${language}', showStartOnLaunch: true })`)
  await sleep(1200)
  // The launch question is answered "later"; the tour is started from the Help command below.
  await page.evaluate("document.querySelector('[data-action=tutorial-later]')?.click()")
  await sleep(400)
  for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })

  /** Screenshots for `seconds`, at FPS. */
  const hold = async (seconds) => {
    const count = Math.round(seconds * FPS)
    for (let i = 0; i < count; i += 1) {
      const started = Date.now()
      const data = (await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 })).data
      const file = path.join(frames, `f${String(frameCount).padStart(5, '0')}.jpg`)
      fs.writeFileSync(file, Buffer.from(data, 'base64'))
      list.push(file)
      frameCount += 1
      const rest = 1000 / FPS - (Date.now() - started)
      if (rest > 0) await sleep(rest)
    }
  }

  // A real picture on the canvas, then back to the start screen where the tour begins.
  await page.evaluate("document.querySelectorAll('.sample-tile')[1]?.click()")
  await sleep(1500)
  await page.evaluate('window.__mpw.showStart()')
  await sleep(800)
  await hold(2.5)
  await page.evaluate("window.__mpw.run('help.tutorial')")
  await page.until('document.querySelector("[data-testid=tutorial-tour]")', 15000)
  const total = await page.evaluate('document.querySelector(".tutorial-count")?.textContent?.split("/")[1]?.trim() || "0"')
  const steps = Math.min(Number(total) || 0, limit || Infinity)
  for (let index = 0; index < steps; index += 1) {
    await sleep(500)
    const text = await page.evaluate('(document.querySelector(".tutorial-card h3, .tutorial-head")?.textContent || "") + (document.querySelector(".tutorial-card p")?.textContent || "")')
    console.log(`step ${index + 1}/${steps}: ${text.slice(0, 60)}`)
    await hold(holdSeconds(text))
    if (index < steps - 1) await page.evaluate('document.querySelector("[data-action=tutorial-next]")?.click()')
  }
  await page.evaluate('document.querySelector("[data-action=tutorial-next]")?.click()')
  await sleep(600)
  await hold(2)
} finally {
  try { await page?.send('Browser.close') } catch { /* gone */ }
  for (const child of [browser, vite]) { try { child.kill() } catch { /* gone */ } }
}

if (!list.length) throw new Error('no frames were captured')
const outDir = path.join(root, 'out', 'tutorial')
fs.mkdirSync(outDir, { recursive: true })
const output = path.join(outDir, NAME)
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(frames, 'f%05d.jpg'), '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '22', '-movflags', '+faststart', output], { stdio: 'inherit' })
fs.copyFileSync(output, path.join(root, NAME))
fs.rmSync(scratch, { recursive: true, force: true })
const seconds = (list.length / FPS).toFixed(1)
console.log(`${NAME}: ${list.length} frames, ${seconds} s -> ${path.relative(root, output)} and the project root`)

// npm run tutorial:shots — the pictures in the tutorial document (doc/Tutorial*.md),
// taken from the real web app while doing the walkthrough on the red-bikini sample.
//
//   node scripts/tutorial-shots.mjs        both languages
//   node scripts/tutorial-shots.mjs ko     one language
//
// Vite + headless Edge/Chrome over CDP with a throw-away profile; writes
// doc/images/tutorial/<language>/<step>.jpg (JPEG: these ship inside the app). Everything it started is stopped at the end.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect, findBrowser, sleep, waitForTarget } from './cdp.mjs'
import { freePort } from './free-port.mjs'
import { HANDS_ON, dismissLaunchPrompts, helpers, openSample } from './tutorial-walkthrough.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const asked = process.argv.slice(2).filter((arg) => arg === 'ko' || arg === 'en')
const languages = asked.length ? asked : ['ko', 'en']
const WIDTH = 1440
const HEIGHT = 900

/** Part 1: the basics, on the same picture. Each leaves the screen showing what its text describes. */
export const BASICS = [
  { id: 'open', async act(page) { const h = helpers(page); await h.js('window.__mpw.showStart()'); await sleep(700); await h.js("document.querySelector('.sample-tile[data-sample=\"swimsuit\"]')?.scrollIntoView({ block: 'center' })"); await sleep(400) } },
  { id: 'editor', async act(page) { await openSample(page) } },
  { id: 'zoom', async act(page) { const h = helpers(page); await h.run('view.zoomIn'); await h.run('view.zoomIn'); await sleep(500) }, async undo(page) { await helpers(page).fit() } },
  { id: 'tools', async act(page) { const h = helpers(page); await h.tool('brush'); await sleep(400) }, async undo(page) { await helpers(page).tool('move') } },
  { id: 'layers', async act(page) { await helpers(page).settings({ rightTab: 'layers', rightCollapsed: false, bottomOpen: true }); await sleep(300) } },
  { id: 'output', async act(page) { await helpers(page).settings({ bottomOpen: true, bottomTab: 'log' }); await sleep(300) } },
  { id: 'history', async act(page) { const h = helpers(page); await h.run('image.invert'); await sleep(400); await h.settings({ rightTab: 'history' }); await sleep(400) }, async undo(page) { const h = helpers(page); await h.run('edit.undo'); await sleep(300); await h.settings({ rightTab: 'layers', bottomTab: 'problems' }); await sleep(300) } },
]

async function shoot(language) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'mpw-tshots-'))
  const outDir = path.join(root, 'doc', 'images', 'tutorial', language)
  fs.mkdirSync(outDir, { recursive: true })
  const vitePort = await freePort(5640)
  const debugPort = await freePort(9540)
  const vite = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'], { cwd: root, stdio: 'ignore' })
  const browser = spawn(findBrowser(), ['--headless=new', '--disable-gpu', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${path.join(scratch, 'profile')}`, `--window-size=${WIDTH},${HEIGHT}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' })
  let page
  try {
    for (let i = 0; i < 150; i += 1) { try { await fetch(`http://127.0.0.1:${vitePort}/`); break } catch { await sleep(200) } }
    page = await connect(await waitForTarget(debugPort, () => true))
    await page.send('Page.enable')
    await page.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false })
    await page.send('Page.navigate', { url: `http://127.0.0.1:${vitePort}/` })
    await page.until('window.__mpw && document.querySelector(".start-screen")', 90000)
    const h = helpers(page)
    await h.settings({ language, tutorialAskOnLaunch: false })
    await sleep(1000)
    await sleep(800)
    await dismissLaunchPrompts(page)
    const save = async (name) => {
      fs.writeFileSync(path.join(outDir, `${name}.jpg`), Buffer.from((await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 })).data, 'base64'))
      console.log(`${language}/${name}.jpg`)
    }
    for (const step of [...BASICS, ...HANDS_ON]) {
      await step.act(page)
      await save(step.id)
      if (step.undo) await step.undo(page)
    }
  } finally {
    try { await page?.send('Browser.close') } catch { /* gone */ }
    for (const child of [browser, vite]) { try { child.kill() } catch { /* gone */ } }
    // The browser may hold its profile a moment after closing; a leftover temp folder is harmless.
    await sleep(800)
    try { fs.rmSync(scratch, { recursive: true, force: true }) } catch { /* still locked */ }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const language of languages) await shoot(language)
}

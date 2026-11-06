// npm run guide-images: the pictures of the user guide, taken from the real program (target/e2e, its
// own settings and WebView2 folders) in both languages. Run npm run build:e2e first.
import { spawn, execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect, waitForTarget } from './cdp.mjs'
import { freePort } from './free-port.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.join(root, 'doc', 'images')
const exe = path.join(root, 'src-tauri', 'target', 'e2e', 'debug', process.platform === 'win32' ? 'MyMind.exe' : 'MyMind')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
fs.mkdirSync(out, { recursive: true })

async function shootLanguage(language) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'mymind-guide-'))
  fs.mkdirSync(path.join(work, 'settings'))
  fs.writeFileSync(path.join(work, 'settings', 'settings.json'), JSON.stringify({ language, theme: 'light-classic', startScreen: { askTutorial: false, background: 'mindBloom', speed: 0 } }))
  const port = await freePort(9520)
  const child = spawn(exe, [], {
    stdio: 'ignore',
    env: { ...process.env, MYMIND_SETTINGS_DIR: path.join(work, 'settings'), MYMIND_INLINE_DIALOGS: '1', WEBVIEW2_USER_DATA_FOLDER: path.join(work, 'webview'), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` },
  })
  try {
    const page = await connect(await waitForTarget(port, (t) => /tauri\.localhost|index\.html/.test(t.url), 40000))
    await page.until(`document.querySelector('[data-sample]')`, 30000)
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
    await sleep(500)
    const click = (selector) => page.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) throw new Error('no ' + ${JSON.stringify(selector)}); e.click(); return true })()`)
    const shoot = async (name, clipTo) => {
      const clip = clipTo ? await page.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(clipTo)}).getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height, scale: 1 } })()`) : undefined
      const shot = await page.send('Page.captureScreenshot', { format: 'webp', quality: 82, ...(clip ? { clip } : {}) })
      fs.writeFileSync(path.join(out, `${language}-${name}.webp`), Buffer.from(shot.data, 'base64'))
    }
    await shoot('start')

    await click('[data-sample="mindmap-project"]')
    await page.until(`!document.querySelector('[data-start-screen]')`)
    await sleep(300)
    await shoot('mindmap')

    await click('[data-diagram-theme="forest"]')
    await sleep(100)
    await page.evaluate(`document.querySelectorAll('.node-tree-item')[1].click()`)
    await sleep(100)
    await click('[data-command="memo"]')
    await sleep(150)
    await page.evaluate(`document.activeElement?.blur?.()`)
    await click('[data-lower-tab="icons"]')
    await click('[data-node-icon="rocket"]')
    await sleep(200)
    await shoot('decorated')
    await click('[data-lower-tab="themes"]')

    await click('[data-command="preferences"]')
    await click('[data-pref-tab="theme"]')
    await sleep(200)
    await shoot('settings', '[data-dialog="preferences"] .dialog')
    await click('[data-command="preferences-close"]')

    await click('[data-command="print"]')
    await page.until(`document.querySelector('.print-preview .print-page svg')`)
    await sleep(200)
    await shoot('print', '[data-dialog="print"] .dialog')
    await click('[data-command="print-close"]')

    await click('[data-command="export"]')
    await page.until(`document.querySelector('[data-export-format="avif"]')`)
    await sleep(100)
    await shoot('export', '[data-dialog="export"] .dialog')
    await click('[data-command="export-cancel"]')

    await click('[data-command="start"]')
    await page.until(`document.querySelector('[data-sample="fishbone-quality"]')`)
    await click('[data-sample="fishbone-quality"]')
    await page.until(`document.querySelector('[data-dialog="unsaved"]')`)
    await click('[data-command="unsaved-discard"]')
    await page.until(`!document.querySelector('[data-start-screen]')`)
    await sleep(300)
    await shoot('fishbone')

    await click('[data-command="start"]')
    await page.until(`document.querySelector('[data-start="hero-tutorial"]')`)
    await click('[data-start="hero-tutorial"]')
    await page.until(`document.querySelector('[data-tutorial="mindmap"]')`)
    await click('[data-tutorial="mindmap"]')
    await page.until(`document.querySelector('[data-tutorial-card]')`)
    await sleep(300)
    await shoot('tutorial')
    page.close()
  } finally {
    try {
      // This process only: it is our own child, never the user's window.
      execSync(`taskkill /T /F /PID ${child.pid}`, { stdio: 'ignore' })
    } catch {
      child.kill()
    }
    await sleep(400)
    fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
}

for (const language of ['ko', 'en']) await shootLanguage(language)
let total = 0
for (const name of fs.readdirSync(out)) total += fs.statSync(path.join(out, name)).size
console.log(`${fs.readdirSync(out).length} pictures, ${Math.round(total / 1024)} KB`)

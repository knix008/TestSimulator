// npm run doc:images — screenshots for the manuals (doc/images/ko/*.png, doc/images/en/*.png).
//
// Runs a copy of the debug program (npm run build:debug first) with its own WebView2 profile,
// settings and package folders in a temp directory, so nothing of the user's is read or
// changed. A small sample image is made in the same temp directory with the app's own host.
// The page is driven over the Chrome DevTools Protocol (WebView2 remote debugging).
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const exe = process.env.ISOMAKER_EXE || path.join(root, 'src-tauri', 'target', 'debug', process.platform === 'win32' ? 'MyISOMaker.exe' : 'MyISOMaker')
if (!fs.existsSync(exe)) {
  console.error('Build the debug program first: npm run build:debug')
  process.exit(1)
}
const PORT = Number(process.env.DOC_PORT || 9477)
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'isomaker-docimg-'))
const runExe = path.join(work, path.basename(exe))
fs.copyFileSync(exe, runExe)
const sample = path.join(work, 'sample')
for (const [rel, text] of [
  ['readme.txt', 'MyISOMaker sample image\n'],
  ['docs/guide.txt', 'Guide\n'],
  ['docs/notes.md', '# Notes\n'],
  ['tools/setup.cmd', '@echo off\n'],
  ['boot/grub/grub.cfg', 'menuentry "Sample" {}\n'],
]) {
  fs.mkdirSync(path.dirname(path.join(sample, rel)), { recursive: true })
  fs.writeFileSync(path.join(sample, rel), text)
}
const sampleIso = path.join(work, 'sample.iso')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (s) => console.log(`  ${s}`)

async function targets() {
  try {
    return await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
  } catch {
    return []
  }
}

async function connect(match) {
  for (let i = 0; i < 100; i++) {
    const t = (await targets()).find((x) => x.type === 'page' && match(x.url))
    if (t) {
      const ws = new WebSocket(t.webSocketDebuggerUrl)
      await new Promise((r, j) => {
        ws.addEventListener('open', r)
        ws.addEventListener('error', j)
      })
      let id = 0
      const pending = new Map()
      ws.addEventListener('message', (e) => {
        const m = JSON.parse(e.data)
        if (m.id && pending.has(m.id)) {
          pending.get(m.id)(m)
          pending.delete(m.id)
        }
      })
      const send = (method, params = {}) =>
        new Promise((r) => {
          const i2 = ++id
          pending.set(i2, r)
          ws.send(JSON.stringify({ id: i2, method, params }))
        })
      const evaluate = async (expr) => {
        const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
        if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'evaluate failed')
        return r.result?.result?.value
      }
      const shot = async (file) => {
        const r = await send('Page.captureScreenshot', { format: 'png' })
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'))
        log(path.relative(root, file))
      }
      return { ws, send, evaluate, shot }
    }
    await sleep(200)
  }
  throw new Error('page not found')
}

const isMain = (u) => u.endsWith('tauri.localhost/') || u.endsWith('tauri.localhost/index.html')
const isPrint = (u) => u.includes('print.html')

const env = {
  ...process.env,
  WEBVIEW2_USER_DATA_FOLDER: path.join(work, 'webview'),
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}`,
  ISOMAKER_CONFIG_DIR: path.join(work, 'config'),
  ISOMAKER_TOOLS_DIR: path.join(work, 'tools'),
}
delete env.ELECTRON_RUN_AS_NODE
const child = spawn(runExe, [], { env, stdio: 'ignore' })

const ui = {
  click: (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) throw new Error('missing ' + ${JSON.stringify(sel)}); e.click(); return true })()`,
  wait: (sel) => `(async () => { for (let i = 0; i < 80; i++) { if (document.querySelector(${JSON.stringify(sel)})) return true; await new Promise(r => setTimeout(r, 100)) } throw new Error('timeout ' + ${JSON.stringify(sel)}) })()`,
  closeDialogs: `(async () => { for (let i = 0; i < 4; i++) { const b = document.querySelector('.dialog-footer .dialog-btn:last-child'); if (!b) break; b.click(); await new Promise(r => setTimeout(r, 200)) } document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return true })()`,
}

try {
  let page = await connect(isMain)
  await page.evaluate(ui.wait('.toolbar'))
  await page.evaluate(`(async () => { for (let i = 0; i < 100 && !window.isoMaker?.createIso; i++) await new Promise(r => setTimeout(r, 100)); return !!window.isoMaker })()`)
  // The sample image, made by the app's own host
  await page.evaluate(`window.isoMaker.createIso(${JSON.stringify({ sourceDir: sample, outputIso: sampleIso, volumeLabel: 'SAMPLE' })})`)
  log(`sample image: ${sampleIso}`)

  for (const lang of ['ko', 'en']) {
    console.log(`\n${lang}`)
    const out = (name) => path.join(root, 'doc', 'images', lang, `${name}.png`)
    await page.evaluate(`(() => {
      localStorage.setItem('isomaker.locale', '${lang}')
      localStorage.setItem('isomaker.themeId', 'dark')
      localStorage.setItem('isomaker.theme', 'dark')
      localStorage.setItem('isomaker.showStartOnLaunch', '1')
      localStorage.removeItem('isomaker.dock')
      localStorage.removeItem('isomaker.startLayout')
      localStorage.setItem('isomaker.recentImages', JSON.stringify([{ path: ${JSON.stringify(sampleIso)}, at: Date.now() }]))
      location.reload()
      return true
    })()`)
    await sleep(1500)
    page.ws.close()
    page = await connect(isMain)
    await page.evaluate(ui.wait('[data-start-screen]'))
    await sleep(2500)
    await page.shot(out('start'))

    await page.evaluate(ui.click('[data-tool="home"]'))
    await page.evaluate(ui.wait('[data-work-empty]'))
    await sleep(600)
    await page.shot(out('main-empty'))

    // Open the sample through the start screen's recent list
    await page.evaluate(ui.click('[data-tool="home"]'))
    await page.evaluate(ui.wait('.start-link'))
    await page.evaluate(ui.click('.start-link'))
    await page.evaluate(ui.wait('[data-tree-path="docs"]'))
    await sleep(500)
    await page.evaluate(`(() => { const r = document.querySelector('[data-tree-path="readme.txt"]'); r.click(); return true })()`)
    await sleep(500)
    await page.shot(out('tree'))

    await page.evaluate(`(() => { const r = document.querySelector('[data-tree-path="docs/guide.txt"]') || document.querySelector('[data-tree-path="readme.txt"]'); const b = r.getBoundingClientRect(); r.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: b.x + 60, clientY: b.y + 10 })); return true })()`)
    await sleep(400)
    await page.shot(out('tree-menu'))
    await page.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); true`)
    await sleep(300)

    // The theme menu is a window of its own (two columns)
    await page.evaluate(ui.click('[data-testid=theme-menu]'))
    const menu = await connect((u) => u.includes('thememenu.html'))
    await menu.evaluate(ui.wait('[data-theme-group="light"]'))
    await sleep(600)
    await menu.shot(out('theme-menu'))
    await menu.evaluate(`window.__TAURI_INTERNALS__.invoke('hide_theme_menu').catch(() => {}); true`)
    menu.ws.close()
    await sleep(300)

    // Create and Bootable tabs with a source folder (the output name follows the folder)
    for (const tab of ['create', 'bootable']) {
      await page.evaluate(ui.click(`[data-tool="${tab}"]`))
      await sleep(400)
      await page.evaluate(`(() => { const i = document.querySelector('.path-row input'); if (!i) return false; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify(sample)}); i.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
      await sleep(500)
      await page.shot(out(tab))
    }
    // Create tab, AppImage format
    await page.evaluate(ui.click('[data-tool="create"]'))
    await sleep(300)
    await page.evaluate(`(() => { const b = document.querySelectorAll('[data-create-format] button')[1]; b.click(); return true })()`)
    await sleep(500)
    await page.shot(out('create-appimage'))
    await page.evaluate(`(() => { const b = document.querySelectorAll('[data-create-format] button')[0]; b.click(); return true })()`)
    await page.evaluate(ui.click('[data-tool="extract"]'))
    await sleep(300)

    // Settings, Help and About are windows of their own (tool.html)
    // Close a window and wait until its page is gone, so the next connect cannot pick it up.
    const closeTool = async (w, label) => {
      await w.evaluate(`window.__TAURI_INTERNALS__.invoke('plugin:window|close', { label: '${label}' }).catch(() => {}); true`).catch(() => {})
      for (let i = 0; i < 50; i++) {
        if (!(await targets()).some((x) => x.type === 'page' && x.url.includes(label === 'print' ? 'print.html' : `tool.html#${label}`))) break
        await sleep(100)
      }
    }
    await page.evaluate(ui.click('[data-tool="settings"]'))
    const settings = await connect((u) => u.includes('tool.html#settings'))
    await settings.evaluate(ui.wait('[data-settings-tab]'))
    for (const tab of ['general', 'theme', 'packages', 'start']) {
      await settings.evaluate(ui.click(`[data-settings-tab="${tab}"]`))
      await sleep(tab === 'packages' ? 1500 : 600)
      await settings.shot(out(`settings-${tab}`))
    }
    await closeTool(settings, 'settings')
    settings.ws.close()

    await page.evaluate(ui.click('[data-tool="about"]'))
    const about = await connect((u) => u.includes('tool.html#about'))
    await about.evaluate(ui.wait('.about-view'))
    await sleep(600)
    await about.shot(out('about'))
    await closeTool(about, 'about')
    about.ws.close()

    // Help, then its print window
    await page.evaluate(ui.click('[data-tool="help"]'))
    const help = await connect((u) => u.includes('tool.html#help'))
    await help.evaluate(ui.wait('.help-top'))
    await sleep(800)
    await help.shot(out('help'))
    await help.evaluate(ui.click('[data-help-print]'))
    const printPage = await connect(isPrint)
    await printPage.evaluate(ui.wait('.print-sheet'))
    await sleep(1500)
    await printPage.shot(out('print'))
    await closeTool(printPage, 'print')
    printPage.ws.close()
    await closeTool(help, 'help')
    help.ws.close()
    await sleep(500)
    await page.evaluate(`window.isoMaker.closeEditSession().then(() => true)`)
  }
  page.ws.close()
  console.log('\ndone')
} catch (err) {
  console.error(err)
  process.exitCode = 1
} finally {
  child.kill()
  await sleep(800)
  try {
    fs.rmSync(work, { recursive: true, force: true })
  } catch {
    /* WebView2 may still hold the profile for a moment */
  }
}

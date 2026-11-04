// npm run guide:shots: the pictures in the user guide, taken from the real app.
//
//   node scripts/guide-shots.mjs          both languages
//   node scripts/guide-shots.mjs ko       one language
//
// Starts the page in Vite on a free port and drives headless Edge (or Chrome) with a
// throw-away profile over CDP, at the app's minimum window width, and writes
// doc/images/<language>/*.png. Everything it started is stopped at the end.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect, findBrowser, sleep, waitForTarget } from './cdp.mjs'
import { freePort } from './free-port.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const asked = process.argv.slice(2).filter((arg) => arg === 'ko' || arg === 'en')
const languages = asked.length ? asked : ['ko', 'en']
const WIDTH = 1280
const HEIGHT = 800
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'mpw-shots-'))

const vitePort = await freePort(5173)
const debugPort = await freePort(9500)
const vite = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'], { cwd: root, stdio: 'ignore' })
const base = `http://127.0.0.1:${vitePort}/`
for (let attempt = 0; ; attempt += 1) {
  try { if ((await fetch(base)).ok) break } catch { /* not listening yet */ }
  if (attempt > 300) throw new Error('Vite did not start')
  await sleep(100)
}
const browser = spawn(findBrowser(), ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${path.join(scratch, 'profile')}`, `--window-size=${WIDTH},${HEIGHT}`, 'about:blank'], { stdio: 'ignore' })

const stopAll = () => {
  try { browser.kill() } catch { /* gone */ }
  try { vite.kill() } catch { /* gone */ }
}

async function clip(page, selector, pad = 0) {
  const box = JSON.parse(await page.evaluate(`JSON.stringify((() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })())`))
  const { data } = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.width + pad * 2, height: box.height + pad * 2, scale: 1 } })
  return Buffer.from(data, 'base64')
}

try {
  const page = await connect(await waitForTarget(debugPort, (target) => target.url === 'about:blank' || target.url === ''))
  await page.send('Page.enable')
  await page.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false })

  for (const language of languages) {
    const out = path.join(root, 'doc', 'images', language)
    fs.mkdirSync(out, { recursive: true })
    const save = (name, data) => {
      fs.writeFileSync(path.join(out, `${name}.png`), data)
      console.log(`  ${language}/${name}.png`)
    }
    const settings = { language, theme: 'dark', modelsPrompted: true, foreground: '#e53935', startBackground: { kind: 'bokeh', speed: 100, transparency: 0, shuffleSec: 0, random: false, layout: null } }
    await page.send('Page.navigate', { url: base })
    await page.until("document.readyState === 'complete'")
    await page.evaluate(`localStorage.clear(); localStorage.setItem('my-photo-work-v1-settings', ${JSON.stringify(JSON.stringify(settings))})`)
    await page.send('Page.reload')
    await sleep(800)
    await page.until("document.querySelector('.menu-bar')", 60000)
    const overflow = await page.evaluate("JSON.stringify(['.menu-bar', '.tool-bar'].map((s) => { const e = document.querySelector(s); return [s, e.scrollWidth - e.clientWidth] }))")
    console.log(`  bars past the minimum width: ${overflow}`)
    if (JSON.parse(overflow).some(([, over]) => over > 0)) throw new Error(`a bar does not fit ${WIDTH}px: ${overflow}`)

    // The popup that greets the user.
    await page.until("document.querySelector('[data-testid=\"tutorial-ask\"]')")
    await sleep(300)
    save('tutorial-ask', await page.screenshot())

    // The tour on its first step.
    await page.evaluate("document.querySelector('[data-action=\"tutorial-run\"]').click()")
    await page.until("document.querySelector('.tutorial-outline')")
    await sleep(500)
    save('tutorial-tour', await page.screenshot())
    await page.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))")
    await page.until("!document.querySelector('.tutorial-layer')")

    // The start screen.
    await sleep(1200)
    save('start', await page.screenshot())

    // The theme drop-down.
    await page.evaluate("document.querySelector('.theme-pick').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))")
    await page.until("document.querySelector('.theme-menu')")
    await sleep(200)
    save('theme-menu', await page.screenshot())
    await page.evaluate("document.querySelector('.app-shell').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))")
    await page.until("!document.querySelector('.theme-menu')")

    // Everything below happens in a document with a picture in it.
    await page.evaluate("document.querySelector('[data-sample=\"sunset\"]').click()")
    await page.until("!document.querySelector('.start-screen') && document.querySelector('.title-size').textContent.includes('1600')", 30000)
    await page.until('window.__mpw')
    await sleep(800)
    save('main', await page.screenshot())

    // The 5x5 grid, and the red marks on the rulers under a real pointer.
    await page.evaluate("window.__mpw.run('view.grid')")
    const stage = JSON.parse(await page.evaluate("JSON.stringify((() => { const r = document.querySelector('.canvas-stage').getBoundingClientRect(); return { x: r.x, y: r.y } })())"))
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: stage.x + 420, y: stage.y + 260 })
    await sleep(400)
    save('grid-rulers', await clip(page, '.canvas-stage'))
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 4, y: 4 })
    await page.evaluate("window.__mpw.run('view.grid')")
    await sleep(150)

    // The patterns panel, and the right-click menu.
    await page.evaluate("window.__mpw.run('window.patterns')")
    await sleep(350)
    save('panel-patterns', await clip(page, '.panel'))
    await page.evaluate("window.__mpw.run('window.layers')")
    await sleep(100)
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: stage.x + 200, y: stage.y + 120, button: 'right', buttons: 2, clickCount: 1 })
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: stage.x + 200, y: stage.y + 120, button: 'right', buttons: 0, clickCount: 1 })
    await sleep(250)
    save('context-menu', await page.screenshot())
    await page.evaluate("document.querySelector('.status-bar').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))")
    await sleep(100)

    // A menu with a submenu open; the hover that opens it would also raise a tooltip.
    await page.evaluate("document.head.appendChild(Object.assign(document.createElement('style'), { textContent: '.app-tooltip { display: none !important; }' }))")
    await page.evaluate("document.querySelector('[data-menu=\"filter\"] button').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))")
    await page.until("document.querySelector('.menu-tree-drop')")
    await page.evaluate("(() => { const row = [...document.querySelectorAll('.menu-tree-drop button')].find((b) => b.querySelector('.menu-chevron')); row.dispatchEvent(new PointerEvent('pointerover', { bubbles: true })); row.dispatchEvent(new PointerEvent('pointerenter', { bubbles: false })); })()")
    await sleep(300)
    save('menu-filter', await page.screenshot())
    await page.evaluate("document.querySelector('.app-shell').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))")
    await sleep(150)

    // The dialogs, each by its frame.
    const dialog = async (name, open, file, prepare) => {
      await page.evaluate(`window.__mpw.openDialog(${JSON.stringify(name)}, ${JSON.stringify(open ?? {})})`)
      await page.until('document.querySelector(\'.dialog\')')
      await sleep(300)
      if (prepare) { await prepare(); await sleep(300) }
      save(file, await clip(page, '.dialog'))
      await page.evaluate("document.querySelector('.dialog .dialog-close').click()")
      await page.until("!document.querySelector('.dialog')")
    }
    await dialog('settings', {}, 'settings-start', async () => {
      await page.evaluate("document.querySelectorAll('.settings-tabs button')[1].click()")
      await page.until("document.querySelector('.settings-page .bg-kinds')")
    })
    await dialog('settings', { settingsTab: 'customTheme' }, 'custom-theme')
    await page.evaluate("window.__mpw.run('edit.neuralModels')").catch(() => {})
    await sleep(200)
    if (await page.evaluate("!document.querySelector('.dialog')")) await page.evaluate("window.__mpw.openDialog('neuralModels', { models: { downloaded: [], webgpu: false, useWebgpu: false, threads: 4 } })")
    await page.until("document.querySelector('.dialog')")
    await sleep(400)
    save('neural-models', await clip(page, '.dialog'))
    await page.evaluate("document.querySelector('.dialog .dialog-close').click()")
    await page.until("!document.querySelector('.dialog')")
    await dialog('about', {}, 'about')
    // A browser prints through its own dialog, so the app's print window is opened by name.
    await dialog('print', { print: { dataUrl: await page.evaluate("window.__mpw.layerCanvas().toDataURL('image/jpeg', 0.7)") }, printers: [{ name: 'Office Printer', displayName: 'Office Printer', isDefault: true }] }, 'print')
    for (const [command, file] of [['image.curves', 'curves'], ['image.info', 'image-info']]) {
      await page.evaluate(`window.__mpw.run(${JSON.stringify(command)})`).catch(() => {})
      await sleep(400)
      if (await page.evaluate("Boolean(document.querySelector('.dialog'))")) {
        save(file, await clip(page, '.dialog'))
        await page.evaluate("document.querySelector('.dialog .dialog-close').click()")
        await page.until("!document.querySelector('.dialog')")
      } else {
        console.log(`  no window from ${command}`)
      }
    }
  }
} finally {
  stopAll()
}
process.exit(0)

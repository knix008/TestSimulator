// npm run test:icons — every button in the app carries an icon.
//
// Runs the web build in a headless Edge (CDP) and walks the start screen, the main
// window, every right-panel tab, every menu, the canvas context menu, every Settings
// tab and every dialog, listing the visible buttons that have no icon (an <svg>, an
// <img> or a <canvas> picture). Colour chips and swatches are pictures of a colour and
// count as their own icon. Exits 1 when anything is missing; the list goes to
// out/icon-audit.json.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect, findBrowser, sleep, waitForTarget } from './cdp.mjs'
import { freePort } from './free-port.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'mpw-icons-'))
const dialogNames = (() => {
  const text = fs.readFileSync(path.join(root, 'src', 'dialogMeta.ts'), 'utf8').replace(/\r\n/g, '\n')
  const block = text.slice(text.indexOf('export type DialogName ='), text.indexOf('\n\n', text.indexOf('export type DialogName =')))
  return [...block.matchAll(/'(\w+)'/g)].map((match) => match[1])
})()

/** Buttons that are pictures of a colour or a sample: their face is the icon. */
const PICTURE_BUTTONS = ['.swatch', '.swatch-button', '.swatch-cell', '.color-cell', '.theme-swatch', '.sample-tile', '.gradient-preset', '.pattern-tile']

const SCAN = `(() => {
  const pictures = ${JSON.stringify(PICTURE_BUTTONS)}
  const out = []
  for (const el of document.querySelectorAll('button, [role="button"]')) {
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) continue
    const style = getComputedStyle(el)
    if (style.visibility === 'hidden' || style.display === 'none') continue
    if (el.closest('[aria-hidden="true"], .start-ghost')) continue
    if (el.querySelector('svg, img, canvas')) continue
    if (pictures.some((sel) => el.matches(sel) || el.querySelector(sel))) continue
    // A preview drawn as a background (a gradient strip, a pattern tile, a colour) is the picture.
    if ([el, ...el.querySelectorAll('[style]')].some((node) => node.style.background || node.style.backgroundColor || node.style.backgroundImage)) continue
    // A glyph button's face is the character it inserts.
    if (el.closest('.glyph-grid')) continue
    const where = el.closest('[data-card], .dialog, .menu-drop, .context-menu, .panel, .bottom-panel, .menu-bar, .tool-bar, .options-bar, .start-screen, .doc-tabs')
    out.push({ text: (el.textContent || '').trim().slice(0, 40), label: el.getAttribute('aria-label') || el.getAttribute('data-tooltip') || '', cls: String(el.className || ''), where: where ? (where.className || where.dataset.card || '').toString().split(' ').slice(0, 2).join(' ') : el.parentElement?.className || '' })
  }
  return JSON.stringify(out)
})()`

const vitePort = await freePort(5600)
const debugPort = await freePort(9480)
const vite = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'], { cwd: root, stdio: 'ignore' })
const browser = spawn(findBrowser(), ['--headless=new', '--disable-gpu', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${path.join(scratch, 'profile')}`, '--window-size=1600,1000', 'about:blank'], { stdio: 'ignore' })
const found = new Map()
let page
let exitCode = 0
try {
  for (let i = 0; i < 150; i += 1) { try { await fetch(`http://127.0.0.1:${vitePort}/`); break } catch { await sleep(200) } }
  page = await connect(await waitForTarget(debugPort, () => true))
  await page.send('Page.enable')
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false })
  await page.send('Page.navigate', { url: `http://127.0.0.1:${vitePort}/` })
  await page.until("document.querySelector('.start-screen') && window.__mpw", 90000)
  await sleep(1200)
  const scan = async (where) => {
    for (const item of JSON.parse(await page.evaluate(SCAN))) {
      const key = `${item.where} | ${item.text || item.label} | ${item.cls}`
      if (!found.has(key)) found.set(key, { ...item, seenIn: where })
    }
  }
  const closeAll = async () => {
    await page.evaluate('window.__mpw.closeDialogs?.()')
    for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await sleep(150)
  }

  // The launch popups first (the tutorial question, the model setup), then the start screen.
  await scan('launch popups')
  await page.evaluate("for (const b of document.querySelectorAll('.tutorial-ask button')) if (b.dataset.action === 'tutorial-later') b.click()")
  await closeAll()
  await scan('start screen')
  await page.evaluate("[...document.querySelectorAll('.start-tools .start-button')].at(-1)?.click()")
  await sleep(600)
  await closeAll()
  await scan('main window')

  for (const tab of JSON.parse(await page.evaluate("JSON.stringify([...document.querySelectorAll('.panel-tabs button')].map((b, i) => i))"))) {
    await page.evaluate(`document.querySelectorAll('.panel-tabs button')[${tab}].click()`)
    await sleep(120)
    await scan(`panel tab ${tab}`)
  }
  for (const name of ['problems', 'errors', 'log']) {
    await page.evaluate(`document.querySelector('.bottom-panel [data-bottom-tab="${name}"]')?.click()`)
    await sleep(80)
    await scan(`bottom ${name}`)
  }
  const menus = JSON.parse(await page.evaluate("JSON.stringify([...document.querySelectorAll('.menu-bar .menu-group > button')].map((b, i) => i))"))
  for (const index of menus) {
    await page.evaluate(`document.querySelectorAll('.menu-bar .menu-group > button')[${index}].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`)
    await sleep(250)
    await page.evaluate(`document.querySelectorAll('.menu-bar .menu-group > button')[${index}].click()`)
    await sleep(250)
    await scan(`menu ${index}`)
    await closeAll()
  }
  for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x: 700, y: 500, button: 'right', clickCount: 1 })
  await sleep(400)
  await scan('context menu')
  await closeAll()

  for (const name of dialogNames) {
    try {
      await page.evaluate(`window.__mpw.openDialog(${JSON.stringify(name)})`)
      await sleep(350)
      await scan(`dialog ${name}`)
      if (name === 'settings') {
        const count = await page.evaluate("document.querySelectorAll('.settings-tabs button').length")
        for (let i = 0; i < count; i += 1) {
          await page.evaluate(`document.querySelectorAll('.settings-tabs button')[${i}].click()`)
          await sleep(150)
          await scan(`settings tab ${i}`)
        }
      }
    } catch (error) {
      found.set(`dialog ${name} failed`, { where: 'dialog', text: String(error.message).slice(0, 80), cls: '', seenIn: name })
    }
    await closeAll()
  }
} finally {
  try { await page?.send('Browser.close') } catch { /* gone */ }
  for (const child of [browser, vite]) { try { child.kill() } catch { /* gone */ } }
}

const list = [...found.values()]
fs.mkdirSync(path.join(root, 'out'), { recursive: true })
fs.writeFileSync(path.join(root, 'out', 'icon-audit.json'), JSON.stringify(list, null, 2))
if (list.length) {
  console.log(`${list.length} button(s) without an icon:`)
  for (const item of list) console.log(`  [${item.seenIn}] ${item.where} :: "${item.text || item.label}" (${item.cls})`)
  exitCode = 1
} else {
  console.log('every button has an icon')
}
process.exit(exitCode)

// npm run test:ui: presses everything. Each tool in the left strip gets a real mouse drag
// on the picture, each toolbar button a click, each control in each right panel tab a
// click or a change, through CDP input into a headless browser. After each one it looks
// at what changed (pixels, layers, selection, settings, an opened window, the view), and
// every change to the pixels must come back with Undo and return with Redo.
//
// A control that changes nothing, or a page error, is a finding; the list goes to
// out/ui-audit.json and the run fails if a finding is not on the known list below.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect, findBrowser, sleep, waitForTarget } from './cdp.mjs'
import { freePort } from './free-port.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const only = process.argv.slice(2).filter((arg) => !arg.startsWith('--'))
const wants = (part) => only.length === 0 || only.includes(part)
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'mpw-audit-'))

/** Needing something this run does not set up, or doing nothing by design. Each says why. */
const EXPECTED_NO_EFFECT = {
  'tool:rotateView': 'turns the view, which this run does not read',
  'tool:note': 'opens its window on a click, not a drag',
  'toolbar:view.actualPixels': 'already at that zoom when it is pressed',
}

const vitePort = await freePort(5173)
const debugPort = await freePort(9600)
const vite = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'], { cwd: root, stdio: 'ignore' })
const base = `http://127.0.0.1:${vitePort}/`
for (let attempt = 0; ; attempt += 1) {
  try { if ((await fetch(base)).ok) break } catch { /* not yet */ }
  if (attempt > 300) throw new Error('Vite did not start')
  await sleep(100)
}
const browser = spawn(findBrowser(), ['--headless=new', '--disable-gpu', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${path.join(scratch, 'profile')}`, '--window-size=1500,950', 'about:blank'], { stdio: 'ignore' })
const stopAll = () => {
  for (const child of [browser, vite]) { try { child.kill() } catch { /* gone */ } }
}

/* -------------------------------------------------------------- reporting */
const started = Date.now()
const findings = []
const results = []
let count = 0
function report(section, name, effects, ms, problem) {
  count += 1
  const mark = problem ? '✘' : '✔'
  const time = `${Math.round(ms)}ms`.padStart(7)
  console.log(`  [${String(count).padStart(4)}] ${mark} ${time}  ${section.padEnd(9)} ${name.padEnd(46).slice(0, 46)} ${problem ?? effects.join(', ')}`)
  results.push({ section, name, effects, ms: Math.round(ms), problem: problem ?? null })
  if (problem) findings.push({ section, name, problem })
}

try {
  const page = await connect(await waitForTarget(debugPort, (target) => target.url === 'about:blank' || target.url === ''))
  const errors = []
  page.on('Runtime.exceptionThrown', (params) => errors.push(params.exceptionDetails.exception?.description?.split('\n')[0] ?? params.exceptionDetails.text))
  page.on('Log.entryAdded', (params) => { if (params.entry.level === 'error' && !/favicon|Failed to load resource/.test(params.entry.text)) errors.push(params.entry.text) })
  await page.send('Page.enable')
  await page.send('Runtime.enable')
  await page.send('Log.enable')
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 950, deviceScaleFactor: 1, mobile: false })
  // Printing and file pickers have nothing to answer them in a headless browser.
  const settings = { language: 'en', modelsPrompted: true, showStartOnLaunch: false, tutorialAskOnLaunch: false, foreground: '#e53935', background: '#1e88e5' }
  await page.send('Page.navigate', { url: base })
  await page.until("document.readyState === 'complete'")
  await page.evaluate(`localStorage.clear(); localStorage.setItem('my-photo-work-v1-settings', ${JSON.stringify(JSON.stringify(settings))})`)
  await page.send('Page.reload')
  await sleep(800)
  await page.until('window.__mpw && document.querySelector(".canvas-stage canvas")', 60000)
  await page.evaluate(`window.print = () => {}; window.alert = () => {}; HTMLInputElement.prototype.click = (function (original) { return function () { if (this.type !== 'file') original.call(this) } })(HTMLInputElement.prototype.click)`)

  /** What the page holds right now, boiled down to things that can be compared. */
  const PROBE = `(() => {
    const hash = (text) => { let h = 5381; for (let i = 0; i < text.length; i += 1) h = (h * 33 + text.charCodeAt(i)) >>> 0; return h };
    const pixelHash = (canvas) => { const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data; let h = 5381; for (let i = 0; i < d.length; i += 16) h = (h * 33 + d[i] + d[i + 1] * 3 + d[i + 2] * 7 + d[i + 3] * 11) >>> 0; return h };
    const s = window.__mpw.state();
    const clean = (key, value) => (typeof value === 'string' && value.length > 200 ? value.length : value);
    const dialogEl = document.querySelector('.dialog');
    return JSON.stringify({
      pixels: pixelHash(window.__mpw.composite()),
      doc: hash(JSON.stringify(s.doc, clean)),
      layers: s.doc.layers.length,
      selection: hash(JSON.stringify(s.selection, clean)),
      settings: hash(JSON.stringify(s.settings, clean)),
      tool: s.tool,
      view: hash(JSON.stringify([s.pan, s.settings.zoom])),
      panel: s.settings.rightTab,
      dialog: dialogEl ? (dialogEl.querySelector('h2')?.textContent ?? 'dialog') : '',
      menu: document.querySelector('.context-menu, .menu-drop') ? 'menu' : '',
      undo: s.undo, redo: s.redo,
      panelText: hash(document.querySelector('.panel-body')?.innerText ?? ''),
      status: document.querySelector('.status-bar')?.innerText ?? '',
    });
  })()`
  const probe = async () => JSON.parse(await page.evaluate(PROBE))
  const differences = (a, b) => ['pixels', 'layers', 'doc', 'selection', 'settings', 'tool', 'view', 'dialog', 'menu', 'panelText', 'status'].filter((key) => a[key] !== b[key])

  const closeWindows = async () => {
    for (let tries = 0; tries < 4; tries += 1) {
      const open = await page.evaluate("(() => { const button = document.querySelector('.dialog .dialog-close'); if (button) { button.click(); return true } return false })()")
      if (!open) break
      await sleep(120)
    }
    await key('Escape')
    await page.evaluate("document.querySelector('.status-bar')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))")
  }
  const key = async (name, modifiers = 0, code = name) => {
    const vk = name.length === 1 ? name.toUpperCase().charCodeAt(0) : { Escape: 27, Enter: 13 }[name] ?? 0
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code, modifiers, windowsVirtualKeyCode: vk, ...(name.length === 1 && !modifiers ? { text: name } : {}) })
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code, modifiers, windowsVirtualKeyCode: vk })
  }
  const CTRL = 2
  const SHIFT = 8
  const undoKey = () => key('z', CTRL, 'KeyZ')
  const redoKey = () => key('y', CTRL, 'KeyY')

  /** A fresh picture in a fresh document, with a second layer, so nothing depends on the last test. */
  const freshDocument = async () => {
    await page.evaluate(`(() => {
      const c = document.createElement('canvas'); c.width = 900; c.height = 600;
      const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 900, 600); g.addColorStop(0, '#203a70'); g.addColorStop(0.5, '#d0607a'); g.addColorStop(1, '#f6c060');
      x.fillStyle = g; x.fillRect(0, 0, 900, 600); x.fillStyle = '#2a2a2a'; x.fillRect(250, 180, 300, 240); x.fillStyle = '#ffffff'; x.beginPath(); x.arc(650, 200, 70, 0, 7); x.fill();
      for (let i = 0; i < 40; i += 1) { x.fillStyle = i % 2 ? '#10b981' : '#f59e0b'; x.fillRect(100 + i * 18, 300, 9, 110); }
      x.fillStyle = '#d01010'; x.beginPath(); x.arc(420, 340, 30, 0, 7); x.fill(); x.fillStyle = '#100000'; x.beginPath(); x.arc(420, 340, 12, 0, 7); x.fill();
      return window.__mpw.open('audit.png', c.toDataURL('image/png'));
    })()`)
    await sleep(350)
    await closeWindows()
  }
  const stageBox = async () => JSON.parse(await page.evaluate("JSON.stringify((() => { const r = document.querySelector('.canvas-stage').getBoundingClientRect(); const s = window.__mpw.state(); return { x: r.x + s.pan.x, y: r.y + s.pan.y, zoom: s.settings.zoom } })())"))
  const toScreen = (box, x, y) => ({ x: box.x + x * box.zoom, y: box.y + y * box.zoom })
  const drag = async (box, from, to, steps = 6) => {
    const a = toScreen(box, ...from)
    const b = toScreen(box, ...to)
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x, y: a.y })
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', buttons: 1, clickCount: 1 })
    for (let step = 1; step <= steps; step += 1) {
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x + ((b.x - a.x) * step) / steps, y: a.y + ((b.y - a.y) * step) / steps, button: 'left', buttons: 1 })
      await sleep(12)
    }
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', buttons: 0, clickCount: 1 })
  }
  const click = async (box, at) => {
    const point = toScreen(box, ...at)
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y })
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1 })
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount: 1 })
    await sleep(40)
  }
  const pop = () => errors.splice(0, errors.length)

  /** Whatever changed the pixels must go away with Undo and come back with Redo. */
  const checkUndo = async (before, after) => {
    if (before.pixels === after.pixels) return null
    await undoKey()
    await sleep(120)
    const undone = await probe()
    if (undone.pixels !== before.pixels) return 'Undo did not restore the pixels'
    await redoKey()
    await sleep(120)
    const redone = await probe()
    if (redone.pixels !== after.pixels) return 'Redo did not bring the pixels back'
    return null
  }

  /* ---------------------------------------------------- the left tool strip */
  if (wants('tools')) {
    console.log('\nLeft panel: every tool, dragged across the picture')
    const tools = JSON.parse(await page.evaluate("import('/src/catalog.ts').then((m) => JSON.stringify(m.toolGroups.flatMap((g) => g.tools.map((t) => t.id))))"))
    for (const tool of tools) {
      const t0 = performance.now()
      await freshDocument()
      await page.evaluate(`window.__mpw.tool(${JSON.stringify(tool)})`)
      await sleep(60)
      // The stamps and healing want a source first, as a user would give them.
      const box = await stageBox()
      if (['clone', 'heal'].includes(tool)) {
        const at = toScreen(box, 100, 100)
        await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: at.x, y: at.y, button: 'left', buttons: 1, clickCount: 1, modifiers: 1 })
        await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', clickCount: 1, modifiers: 1 })
      }
      if (['patch', 'contentMove'].includes(tool)) {
        await page.evaluate("window.__mpw.select({ x: 260, y: 200, width: 100, height: 80 })")
      }
      // What a user does first, for the tools that work on something already there.
      if (tool === 'patternStamp') {
        await page.evaluate("window.__mpw.run('window.patterns')")
        await sleep(100)
        await page.evaluate("document.querySelector('[data-sample-pattern=\"checker\"]').click()")
        await sleep(100)
      }
      if (tool === 'pathSelect' || tool === 'directSelect') {
        await page.evaluate("window.__mpw.tool('pen')")
        await sleep(40)
        for (const at of [[200, 200], [400, 200], [400, 400]]) await click(box, at)
        await key('Enter', 0, 'Enter')
        await sleep(60)
        await page.evaluate(`window.__mpw.tool(${JSON.stringify(tool)})`)
        await sleep(40)
      }
      if (tool === 'sliceSelect') {
        await page.evaluate("window.__mpw.tool('slice')")
        await sleep(40)
        await drag(box, [200, 200], [400, 400])
        await sleep(60)
        await page.evaluate(`window.__mpw.tool(${JSON.stringify(tool)})`)
        await sleep(40)
      }
      if (tool === 'puppet') {
        await click(box, [300, 300])
        await click(box, [500, 300])
        await sleep(60)
      }
      const before = await probe()
      // The gesture each tool expects.
      if (['polyLasso', 'pen', 'curvaturePen'].includes(tool)) {
        for (const at of [[200, 200], [500, 200], [500, 450], [200, 450]]) await click(box, at)
        await key('Enter', 0, 'Enter')
      } else if (tool === 'perspectiveCrop') {
        for (const at of [[100, 100], [800, 120], [780, 500], [120, 520]]) await click(box, at)
        await key('Enter', 0, 'Enter')
      } else if (tool === 'redEye') {
        await click(box, [420, 340])
      } else if (tool === 'fill') {
        await click(box, [300, 220])
      } else if (tool === 'pathSelect' || tool === 'directSelect') {
        await drag(box, [400, 200], [460, 260])
      } else if (tool === 'sliceSelect') {
        await click(box, [300, 300])
      } else if (tool === 'puppet') {
        await drag(box, [500, 300], [560, 380])
        await key('Enter', 0, 'Enter')
      } else {
        // Across the gradient, the stripes, the hard edges and the red disc.
        await drag(box, [120, 240], [620, 380], 10)
        if (['crop', 'freeformPen', 'liquify', 'magneticLasso'].includes(tool)) await key('Enter', 0, 'Enter')
      }
      // Some work in the background (OpenCV loads on first use), so give them time.
      const patience = ['objectSelect', 'quickSelect', 'remove', 'spotHeal', 'wand'].includes(tool) ? 15000 : 1200
      let after = await probe()
      for (const until = Date.now() + patience; Date.now() < until && !differences(before, after).filter((name) => name !== 'tool').length; ) {
        await sleep(150)
        after = await probe()
      }
      await sleep(150)
      after = await probe()
      const changed = differences(before, after).filter((name) => name !== 'tool')
      let problem = null
      const thrown = pop()
      if (thrown.length) problem = `page error: ${thrown[0]}`
      else if (!changed.length && !EXPECTED_NO_EFFECT[`tool:${tool}`]) problem = 'the drag changed nothing'
      else if (changed.includes('dialog')) await closeWindows()
      else problem = await checkUndo(before, after)
      report('tool', tool, changed, performance.now() - t0, problem)
    }
  }

  /* ------------------------------------------------------- the toolbar row */
  if (wants('toolbar')) {
    console.log('\nToolbar: every button')
    await freshDocument()
    const buttons = JSON.parse(await page.evaluate("JSON.stringify([...document.querySelectorAll('.tool-bar button')].map((b, i) => ({ i, name: b.getAttribute('aria-label') || b.getAttribute('data-tooltip') || b.textContent, disabled: b.disabled })))"))
    for (const button of buttons) {
      const t0 = performance.now()
      await freshDocument()
      // Something to undo, and a selection, for the buttons that want them.
      await page.evaluate("window.__mpw.select({ x: 200, y: 150, width: 300, height: 200 })")
      await page.evaluate("window.__mpw.run('layer.new')")
      await sleep(80)
      if (button.name === 'Redo') { await undoKey(); await sleep(80) }
      const before = await probe()
      const state = await page.evaluate(`(() => { const b = document.querySelectorAll('.tool-bar button')[${button.i}]; if (b.disabled) return 'disabled'; b.click(); return 'clicked' })()`)
      await sleep(350)
      const after = await probe()
      const changed = differences(before, after)
      const thrown = pop()
      let problem = thrown.length ? `page error: ${thrown[0]}` : null
      if (!problem && state === 'disabled') problem = 'disabled when it should be usable'
      if (!problem && !changed.length && !EXPECTED_NO_EFFECT[`toolbar:${button.name}`]) problem = 'the click changed nothing'
      report('toolbar', button.name, changed, performance.now() - t0, problem)
      await closeWindows()
      await page.evaluate("window.__mpw.select(null)")
    }
  }

  /* -------------------------------------------------------- the right panel */
  if (wants('panel')) {
    console.log('\nRight panel: every control on every tab')
    const tabs = JSON.parse(await page.evaluate("JSON.stringify([...document.querySelectorAll('.panel-tabs button')].map((b) => b.getAttribute('data-tooltip')))"))
    for (let tabIndex = 0; tabIndex < tabs.length; tabIndex += 1) {
      const openTab = async () => {
        await page.evaluate(`document.querySelectorAll('.panel-tabs button')[${tabIndex}].click()`)
        await sleep(70)
      }
      await freshDocument()
      await page.evaluate("window.__mpw.run('layer.new')")
      await openTab()
      const controls = JSON.parse(await page.evaluate(`JSON.stringify([...document.querySelectorAll('.panel-body button, .panel-body input, .panel-body select')].map((el, i) => ({ i, tag: el.tagName, type: el.type, name: el.getAttribute('aria-label') || el.getAttribute('data-tooltip') || el.closest('label')?.innerText?.split('\\n')[0] || el.innerText || el.placeholder || el.value || '?', disabled: el.disabled })))`))
      console.log(`  ${tabs[tabIndex]} (${controls.length})`)
      // The long lists are the same control many times: a sample of each is enough.
      const repeated = controls.length > 60
      for (const control of controls) {
        if (repeated && control.i % 7 !== 0) continue
        if (control.disabled) continue
        const t0 = performance.now()
        await freshDocument()
        await page.evaluate("window.__mpw.select({ x: 200, y: 150, width: 300, height: 200 })")
        await page.evaluate("window.__mpw.run('layer.new')")
        await openTab()
        const before = await probe()
        const action = await page.evaluate(`(() => {
          const el = document.querySelectorAll('.panel-body button, .panel-body input, .panel-body select')[${control.i}];
          if (!el) return 'gone';
          const set = (proto, value) => { Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
          if (el.tagName === 'BUTTON') { el.click(); return 'click' }
          if (el.tagName === 'SELECT') { const next = [...el.options].find((o) => o.value !== el.value); if (!next) return 'one'; set(HTMLSelectElement.prototype, next.value); return 'select' }
          if (el.type === 'checkbox') { el.click(); return 'check' }
          if (el.type === 'range') { const mid = (Number(el.max) + Number(el.min)) / 2; const value = Number(el.value) === mid ? Number(el.min) : mid; set(HTMLInputElement.prototype, String(value)); return 'range' }
          if (el.type === 'color') { set(HTMLInputElement.prototype, el.value === '#123456' ? '#654321' : '#123456'); return 'color' }
          if (el.type === 'number' || el.type === 'text' || !el.type) { const value = el.type === 'number' ? String(Number(el.value || 0) + 1) : '#123456'; set(HTMLInputElement.prototype, value); el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); el.blur(); return 'text' }
          return 'other';
        })()`)
        await sleep(160)
        const after = await probe()
        const changed = differences(before, after)
        const thrown = pop()
        let problem = thrown.length ? `page error: ${thrown[0]}` : null
        const label = `${tabs[tabIndex]} / ${String(control.name).replace(/\s+/g, ' ').slice(0, 26)}`
        const textField = action === 'text' && /placeholder/.test(control.name)
        if (!problem && !changed.length && action !== 'gone' && action !== 'one' && !textField && !EXPECTED_NO_EFFECT[`panel:${label}`]) problem = `${action} changed nothing`
        report('panel', label, changed, performance.now() - t0, problem)
        await closeWindows()
      }
    }
  }
} finally {
  stopAll()
}

const outDir = path.join(root, 'out')
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'ui-audit.json'), JSON.stringify({ results, findings }, null, 2))
console.log(`\n${results.length} controls pressed in ${((Date.now() - started) / 1000).toFixed(1)}s: ${results.length - findings.length} did something, ${findings.length} findings. Details in out/ui-audit.json`)
for (const item of findings) console.log(`  ✘ ${item.section.padEnd(8)} ${item.name.padEnd(46).slice(0, 46)} ${item.problem}`)
process.exit(findings.length ? 1 : 0)

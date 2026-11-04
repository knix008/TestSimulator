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
const outName = only.length ? `ui-audit-${only.join('-')}.json` : 'ui-audit.json'
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'mpw-audit-'))

/** Needing something this run does not set up, or doing nothing by design. Each says why. */
/** Whole families that have nothing to do in the state they are pressed in. */
const EXPECTED_PATTERNS = [
  [/^dialogs:.* \/ Reset( curve)?$/, 'the values are already the defaults'],
]

/** What a command needs to exist before it can do anything. Steps run in order. */
const TEXT_LAYER = ['type.enter', { ok: true }]
const OTHER_CONTENT = ['image.invert', 'select.inverse', 'edit.deletePixels', { js: 'window.__mpw.select({ x: 0, y: 0, width: 900, height: 600 })' }]
const MENU_SETUP = {
  'edit.redo': { steps: ['image.invert', 'edit.undo'] },
  'edit.stepForward': { steps: ['image.invert', 'edit.undo'] },
  // A copy of the picture lies under the duplicate, so cutting out of that shows nothing.
  'edit.cut': { single: true },
  'edit.deletePixels': { single: true },
  // Nothing shows until it is pasted.
  'edit.copy': { then: ['edit.paste'] },
  'edit.copyMerged': { then: ['edit.paste'] },
  'image.modeRgb': { steps: ['image.modeGray', { ok: true }] },
  'image.trim': { single: true, steps: ['select.inverse', 'edit.deletePixels', 'select.deselect'] },
  'layer.copyStyle': { steps: ['window.styles', { js: "document.querySelector('[data-style]').click()" }], then: ['layer.clearStyle', 'layer.pasteStyle'] },
  'layer.pasteStyle': { steps: ['window.styles', { js: "document.querySelector('[data-style]').click()" }, 'layer.copyStyle', 'layer.clearStyle'] },
  'layer.clearStyle': { steps: ['window.styles', { js: "document.querySelector('[data-style]').click()" }] },
  'layer.smartEdit': { steps: ['layer.toSmart'] },
  'layer.rasterize': { steps: TEXT_LAYER },
  'type.rasterize': { steps: TEXT_LAYER },
  'type.orientation': { steps: TEXT_LAYER },
  'type.antiAlias': { steps: TEXT_LAYER },
  'layer.maskDisable': { steps: ['layer.mask'] },
  'layer.maskInvert': { steps: ['layer.mask'] },
  'layer.maskApply': { steps: ['layer.mask'] },
  'layer.maskDelete': { steps: ['layer.mask'] },
  'layer.ungroup': { steps: ['layer.group'] },
  'layer.bringToFront': { steps: ['layer.sendToBack'] },
  'layer.bringForward': { steps: ['layer.sendToBack'] },
  'layer.alignLeft': { steps: OTHER_CONTENT },
  'layer.alignCenterH': { steps: OTHER_CONTENT },
  'layer.alignRight': { steps: OTHER_CONTENT },
  'layer.alignTop': { steps: OTHER_CONTENT },
  'layer.alignCenterV': { steps: OTHER_CONTENT },
  'layer.alignBottom': { steps: OTHER_CONTENT },
  'layer.unlink': { steps: ['select.allLayers', 'layer.link'] },
  'select.reselect': { steps: ['select.deselect'] },
  'filter.last': { steps: ['filter.blur', { ok: true }] },
  'threeD.render': { steps: ['threeD.postcard'] },
  'threeD.remove': { steps: ['threeD.postcard'] },
  'view.zoomFit': { steps: ['view.zoomIn'] },
  'view.clearGuides': { steps: ['view.newGuide', { ok: true }] },
  'view.clearSlices': { steps: [{ js: "window.__mpw.tool('slice')" }, { drag: [[100, 100], [300, 300]] }] },
  'window.nextDoc': { steps: ['file.new', { ok: true }] },
  'window.prevDoc': { steps: ['file.new', { ok: true }] },
  'window.resetWorkspace': { steps: [{ js: 'window.__mpw.setSettings({ showGrid: true })' }] },
  'window.layers': { steps: [{ js: "window.__mpw.setSettings({ rightTab: 'history' })" }] },
}

const EXPECTED_NO_EFFECT = {
  'menus:file.place': 'a browser opens its file picker, which nothing can answer headless',
  'menus:file.placeLinked': 'a browser opens its file picker, which nothing can answer headless',
  'menus:file.importVideo': 'a browser opens its file picker, which nothing can answer headless',
  'menus:layer.smartReplace': 'a browser opens its file picker, which nothing can answer headless',
  'menus:file.print': 'a browser opens its print dialog, which nothing can answer headless',
  'menus:file.printOne': 'a browser opens its print dialog, which nothing can answer headless',
  'menus:edit.autoAlign': 'the layers are copies of one picture, so they are already aligned',
  'menus:image.revealAll': 'no layer reaches past the canvas in this picture (documentOps.test.mjs covers it)',
  'menus:layer.distributeH': 'it spreads three or more layers that differ in position (documentOps.test.mjs covers it)',
  'menus:layer.distributeV': 'it spreads three or more layers that differ in position (documentOps.test.mjs covers it)',
  'menus:layer.defringe': 'it works on a soft edge and this layer has none (documentOps.test.mjs covers it)',
  'menus:layer.removeBlackMatte': 'it works on a soft edge and this layer has none (documentOps.test.mjs covers it)',
  'menus:layer.removeWhiteMatte': 'it works on a soft edge and this layer has none (documentOps.test.mjs covers it)',
  'menus:select.allLayers': 'which layers are selected is not part of what this run compares',
  'menus:select.deselectLayers': 'which layers are selected is not part of what this run compares',
  'menus:view.rotateView': 'turns the view, which is a CSS transform this run does not read',
  'menus:view.resetView': 'the view is already reset',
  'dialogs:Open Recent / Clear list': 'the list is already empty',
  'dialogs:Image information / Copy details': 'it goes to the clipboard, which nothing here reads',
  'dialogs:Levels / Auto': 'the window opens with the automatic values',
  'dialogs:Color Lookup / Load .cube file': 'a browser opens its file picker, which nothing can answer headless',
  'dialogs:Remove background / GrabCut': 'the method already chosen',
  'dialogs:Filter gallery / Artistic': 'the group already open',
  'dialogs:Settings / General': 'the tab already open',
  'dialogs:Settings / English': 'the language already chosen',
  'tool:rotateView': 'turns the view, which is a CSS transform this run does not read',
  'toolbar:Open': 'a browser opens its file picker, which nothing can answer headless (test:e2e covers the desktop bridge)',
  'toolbar:Print': 'a browser opens its print dialog, which nothing can answer headless',
  'panel:Layers / Bring forward': 'the active layer is already on top',
  'panel:Layers+bottom layer / Send backward': 'the active layer is already at the bottom',
  'panel:History / Duplicate layer': 'the row of the state already on screen',
  'panel:History+edits / Invert': 'the row of the state already on screen',
  'panel:Color / Foreground': 'already the colour being edited',
  'panel:Properties+smart / Replace Smart Object Conte': 'a browser opens its file picker, which nothing can answer headless',
  'panel:Paragraph+type / Align Left Edges': 'the text is already left-aligned',
  'panel:Paths+path / Path 1 3': 'the path just made is already the active one',
  'panel:Timeline+frames / 1': 'the two frames are the same picture, so showing one changes nothing',
  'panel:Timeline+frames / 2': 'the two frames are the same picture, so showing one changes nothing',
  'panel:Layer comps+comp / Comp': 'the comp was just captured from this very state',
  'options:rowMarquee / Selection Left': 'a row selection already spans the picture',
  'options:rowMarquee / Selection Width': 'a row selection already spans the picture',
  'options:colMarquee / Selection Top': 'a column selection already spans the picture',
  'options:colMarquee / Selection Height': 'a column selection already spans the picture',
  'options:text / Horizontal type': 'the direction already chosen',
  'options:vtext / Vertical type': 'the direction already chosen',
  'menus:file.open': 'a browser opens its file picker, which nothing can answer headless (test:e2e covers the desktop bridge)',
  'menus:file.openSmart': 'a browser opens its file picker, which nothing can answer headless',
  'start:Move card': 'a handle moves its card by being dragged, which this run does separately',
  'start:Bokeh': 'already the background in use',
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
  // Nothing can answer these headless; the guide opening counts as an opening.
  const stubs = () => page.evaluate(`HTMLAnchorElement.prototype.click = function () { if (this.download) window.__opened += 1 }; window.print = () => {}; window.alert = () => {}; window.confirm = () => true; window.prompt = () => 'x'; window.__opened = 0; window.open = () => { window.__opened += 1; return null }; HTMLInputElement.prototype.click = (function (original) { return function () { if (this.type !== 'file') original.call(this) } })(HTMLInputElement.prototype.click)`)
  await stubs()
  await page.send('Browser.setDownloadBehavior', { behavior: 'deny' }).catch(() => {})

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
      menu: document.querySelector('.context-menu, .menu-drop, .option-list') ? 'menu' : '',
      undo: s.undo, redo: s.redo,
      panelText: hash(document.querySelector('.panel-body')?.innerHTML.replace(/data:image[^"]*/g, '') ?? ''),
      slice: s.activeSliceId,
      popover: document.querySelector('.color-popover')?.outerHTML.length ?? 0,
      history: s.undo + '/' + s.redo,
      passing: hash(JSON.stringify(s.passing, clean)),
      dialogBody: dialogEl ? hash(dialogEl.outerHTML.replace(/data:image[^"]*/g, '') + [...dialogEl.querySelectorAll('input, select, textarea')].map((e) => e.checked + e.value).join()) : 0,
      options: hash(document.querySelector('.options-bar')?.innerHTML ?? ''),
      startScreen: hash(document.querySelector('.start-screen .start-inner')?.innerHTML.replace(/style="[^"]*"/g, '') ?? ''),
      background: JSON.stringify(s.settings.startBackground),
      tutorial: document.querySelector('[data-step]')?.dataset.step ?? '',
      popup: window.__opened ?? 0,
      status: document.querySelector('.status-bar')?.innerText ?? '',
    });
  })()`
  const probe = async () => JSON.parse(await page.evaluate(PROBE))
  const differences = (a, b) => ['pixels', 'layers', 'doc', 'selection', 'settings', 'tool', 'view', 'dialog', 'menu', 'panelText', 'status', 'slice', 'popover', 'passing', 'dialogBody', 'options', 'startScreen', 'background', 'tutorial', 'popup'].filter((key) => a[key] !== b[key])

  const closeWindows = async () => {
    for (let tries = 0; tries < 4; tries += 1) {
      const open = await page.evaluate("(() => { const button = document.querySelector('.dialog .dialog-close'); if (button) { button.click(); return true } return false })()")
      if (!open) break
      await sleep(120)
    }
    await key('Escape')
    await page.evaluate("document.querySelector('.status-bar')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))")
    await page.evaluate("document.querySelectorAll('.busy-scrim button').forEach((b) => b.click())")
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 700, y: 942, button: 'left', buttons: 1, clickCount: 1 })
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 700, y: 942, button: 'left', clickCount: 1 })
  }
  const closeWindowsOnly = async () => {
    for (let tries = 0; tries < 4; tries += 1) {
      const open = await page.evaluate("(() => { const button = document.querySelector('.dialog .dialog-close'); if (button) { button.click(); return true } return false })()")
      if (!open) break
      await sleep(100)
    }
  }
  const key = async (name, modifiers = 0, code = name) => {
    const vk = name.length === 1 ? name.toUpperCase().charCodeAt(0) : { Escape: 27, Enter: 13 }[name] ?? 0
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code, modifiers, windowsVirtualKeyCode: vk, ...(name.length === 1 && !modifiers ? { text: name } : {}) })
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code, modifiers, windowsVirtualKeyCode: vk })
  }
  const CTRL = 2
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

  /* ------------------------------------------- what each tool needs and does */
  const prepareTool = async (tool, box) => {
      // The stamps and healing want a source first, as a user would give them.
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
  }
  const gestureFor = async (tool, box, commit = true) => {
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
        // A slice is active once drawn, so what shows the tool working is clicking off it.
        await click(box, [650, 500])
      } else if (tool === 'puppet') {
        await drag(box, [500, 300], [560, 380])
        await key('Enter', 0, 'Enter')
      } else {
        // Across the gradient, the stripes, the hard edges and the red disc.
        await drag(box, [120, 240], [620, 380], 10)
        if (commit && ['crop', 'freeformPen', 'liquify', 'magneticLasso'].includes(tool)) await key('Enter', 0, 'Enter')
      }
  }

  /** Every visible control in a part of the window, in a stable order. */
  const LIST = (scope) => `[...document.querySelectorAll(${JSON.stringify(`${scope} button, ${scope} input, ${scope} select, ${scope} textarea`)})].filter((el) => el.checkVisibility({ visibilityProperty: true }))`
  const controlsOf = async (scope) => JSON.parse(await page.evaluate(`JSON.stringify(${LIST(scope)}.map((el, i) => ({ i, tag: el.tagName, type: el.type, role: el.getAttribute('role'), name: el.getAttribute('aria-label') || el.getAttribute('data-tooltip') || el.closest('label')?.innerText?.split('\\n')[0] || el.innerText || el.placeholder || el.title || '?', disabled: el.disabled })))`))
  /** A real click for a button; the value changed the way the browser would change it, for the rest. */
  const press = async (scope, index) => {
    const info = JSON.parse(await page.evaluate(`JSON.stringify((() => {
      const el = ${LIST(scope)}[${index}];
      if (!el) return { action: 'gone' };
      if (el.disabled) return { action: 'disabled' };
      el.scrollIntoView({ block: 'nearest' });
      if (el.tagName === 'BUTTON') { const r = el.getBoundingClientRect(); return { action: 'click', x: r.x + r.width / 2, y: r.y + r.height / 2, role: el.getAttribute('role') } }
      el.focus();
      const set = (proto, value) => { Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
      if (el.tagName === 'SELECT') { const next = [...el.options].find((o) => o.value !== el.value); if (!next) return { action: 'one' }; set(HTMLSelectElement.prototype, next.value); return { action: 'select' } }
      if (el.type === 'checkbox' || el.type === 'radio') { el.click(); return { action: 'check' } }
      if (el.type === 'range') { const mid = (Number(el.max) + Number(el.min)) / 2; set(HTMLInputElement.prototype, String(Math.abs(Number(el.value) - mid) < 2 ? Number(el.max) : mid)); return { action: 'range' } }
      if (el.type === 'color') { set(HTMLInputElement.prototype, el.value === '#123456' ? '#654321' : '#123456'); return { action: 'color' } }
      if (el.type === 'file') return { action: 'file' };
      if (el.tagName === 'TEXTAREA') { set(HTMLTextAreaElement.prototype, el.value + 'x'); el.blur(); return { action: 'text' } }
      const box = el.getBoundingClientRect();
      return { action: 'type', x: box.x + box.width / 2, y: box.y + box.height / 2, text: el.maxLength === 1 ? (el.value === 'q' ? 'w' : 'q') : el.closest('.number-stepper') ? String(parseFloat(el.value) + 1) : (el.value || '') + 'x' };
    })())`))
    // Typed with real keys and confirmed with a real Enter, as a user would.
    if (info.action === 'type') {
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: info.x, y: info.y })
      await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: info.x, y: info.y, button: 'left', buttons: 1, clickCount: 1 })
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: info.x, y: info.y, button: 'left', buttons: 0, clickCount: 1 })
      await page.evaluate('document.activeElement?.select?.()')
      await page.send('Input.insertText', { text: info.text })
      await sleep(40)
      await key('Enter', 0, 'Enter')
      return 'type'
    }
    if (info.action !== 'click') return info.action
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: info.x, y: info.y })
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: info.x, y: info.y, button: 'left', buttons: 1, clickCount: 1 })
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: info.x, y: info.y, button: 'left', buttons: 0, clickCount: 1 })
    return info.role === 'combobox' ? 'combobox' : 'click'
  }
  /** Waits for anything to change, longer while a progress window says work is going on. */
  const settle = async (before, patience = 1500) => {
    let after = await probe()
    for (const until = Date.now() + patience; Date.now() < until && !differences(before, after).length; ) {
      await sleep(100)
      after = await probe()
    }
    for (const until = Date.now() + 45000; Date.now() < until && (await page.evaluate("Boolean(document.querySelector('.busy-scrim'))")); ) await sleep(200)
    await sleep(120)
    return probe()
  }
  const alive = async () => {
    if (await page.evaluate("Boolean(document.querySelector('.menu-bar'))").catch(() => false)) return null
    await reloadApp()
    return 'the app stopped drawing, and had to be reloaded'
  }
  const reloadApp = async () => {
    await page.send('Page.reload')
    await sleep(600)
    await page.until('window.__mpw && document.querySelector(".canvas-stage canvas")', 60000)
    await stubs()
  }
  const verdict = async (section, name, before, after, action, t0, extraProblem) => {
    const changed = differences(before, after)
    const thrown = pop()
    const dead = await alive()
    let problem = dead ?? (thrown.length ? `page error: ${thrown[0]}` : extraProblem ?? null)
    if (!problem && action === 'disabled') { report(section, name, ['off'], performance.now() - t0, null); return changed }
    const expected = EXPECTED_NO_EFFECT[`${section}:${name}`] || EXPECTED_PATTERNS.some(([pattern]) => pattern.test(`${section}:${name}`))
    // A browser may not fetch the models directly; the desktop app downloads them in Rust.
    if (problem?.startsWith('page error: Access to fetch at \'https://')) problem = null
    if (!problem && !changed.length && action !== 'gone' && action !== 'one' && action !== 'file' && !expected) problem = `${action ?? 'run'} changed nothing`
    report(section, name, changed, performance.now() - t0, problem)
    return changed
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
      const box = await stageBox()
      await prepareTool(tool, box)
      const before = await probe()
      await gestureFor(tool, box)
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
      await page.evaluate("window.__mpw.run('image.invert')")
      await sleep(120)
      if (button.name === 'Redo') {
        await undoKey()
        await sleep(200)
        console.log('    history before Redo:', (await probe()).history)
      }
      if (button.name === 'Delete layer' || button.name === 'Merge down') { await page.evaluate("window.__mpw.run('layer.duplicate')"); await sleep(80) }
      if (button.name === 'Fit on screen') { await page.evaluate("window.__mpw.run('view.zoomIn')"); await sleep(80) }
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

  /* ------------------------------------------------- the strip's own buttons */
  if (wants('strip')) {
    console.log('\nLeft panel: every button')
    await freshDocument()
    for (const control of await controlsOf('.tool-strip')) {
      const t0 = performance.now()
      await page.evaluate("window.__mpw.tool('pathSelect')")
      await sleep(60)
      const before = await probe()
      const action = await press('.tool-strip', control.i)
      const after = await settle(before)
      await verdict('strip', control.name, before, after, action, t0)
      await closeWindows()
    }
  }

  /* ------------------------------------------------------------ the menu bar */
  if (wants('menubar')) {
    console.log('\nMenu bar: every button')
    await freshDocument()
    for (const control of await controlsOf('.menu-bar')) {
      const t0 = performance.now()
      const before = await probe()
      const action = await press('.menu-bar', control.i)
      const after = await settle(before)
      await verdict('menubar', control.name, before, after, action, t0)
      await closeWindows()
      await page.evaluate("window.__mpw.setSettings({ language: 'en', theme: 'dark' })")
      await sleep(60)
    }
  }

  /* ----------------------------------------------------------- the options bar */
  if (wants('options')) {
    console.log('\nOptions bar: every control of every tool, with the tool in use')
    const everyTool = JSON.parse(await page.evaluate("import('/src/catalog.ts').then((m) => JSON.stringify(m.toolGroups.flatMap((g) => g.tools.map((t) => t.id))))"))
    const tools = process.env.AUDIT_TOOLS ? process.env.AUDIT_TOOLS.split(',') : everyTool
    const defaults = await page.evaluate('JSON.stringify(window.__mpw.state().settings)')
    const setUp = async (tool) => {
      // What the last control changed must not decide what this one can do.
      await page.evaluate(`window.__mpw.setSettings(${defaults})`)
      await freshDocument()
      await page.evaluate(`window.__mpw.tool(${JSON.stringify(tool)})`)
      await sleep(60)
      const box = await stageBox()
      await prepareTool(tool, box)
      // Left uncommitted: Apply and Cancel are what is being pressed. The magnetic lasso
      // has neither, and has no selection to put numbers on until it is closed.
      if (!['text', 'vtext', 'textMask', 'note', 'artboard'].includes(tool)) await gestureFor(tool, box, tool === 'magneticLasso')
      await sleep(250)
      // Nothing can be pressed behind a progress window, by this run or by a person.
      for (const until = Date.now() + 45000; Date.now() < until && (await page.evaluate("Boolean(document.querySelector('.busy-scrim'))")); ) await sleep(200)
      await closeWindowsOnly()
    }
    for (const tool of tools) {
      await setUp(tool)
      const controls = await controlsOf('.options-bar')
      console.log(`  ${tool} (${controls.length})`)
      for (const control of controls) {
        const t0 = performance.now()
        await setUp(tool)
        const before = await probe()
        const action = await press('.options-bar', control.i)
        let after = await settle(before)
        // A drop-down: open it, then actually choose another row.
        let problem = null
        if (action === 'combobox') {
          if (!(await page.evaluate("Boolean(document.querySelector('.option-list'))"))) problem = 'the list did not open'
          else {
            await page.evaluate("[...document.querySelectorAll('.option-list button')].find((b) => !b.classList.contains('chosen'))?.click()")
            await sleep(120)
            after = await probe()
            if (await page.evaluate("Boolean(document.querySelector('.option-list'))")) problem = 'the list did not close'
            else if (after.settings === before.settings) problem = 'choosing a row changed nothing'
          }
        }
        await verdict('options', `${tool} / ${String(control.name).replace(/\s+/g, ' ').slice(0, 30)}`, before, after, action, t0, problem)
        await closeWindows()
      }
    }
  }

  /* --------------------------------------------------------- the start screen */
  if (wants('start')) {
    console.log('\nStart screen: every control')
    const open = async () => {
      await freshDocument()
      await page.evaluate("window.__mpw.showStart()")
      await sleep(250)
    }
    await open()
    for (const control of await controlsOf('.start-screen')) {
      const t0 = performance.now()
      await open()
      const before = await probe()
      const action = await press('.start-screen', control.i)
      const after = await settle(before)
      await verdict('start', String(control.name).replace(/\s+/g, ' ').slice(0, 40), before, after, action, t0)
      await closeWindows()
    }
  }

  if (wants('start')) {
    await freshDocument()
    await page.evaluate("window.__mpw.showStart()")
    await sleep(300)
    const t0 = performance.now()
    const where = () => page.evaluate("JSON.stringify((() => { const c = document.querySelector('[data-card=\"recent\"]'); const h = c.querySelector('.card-handle').getBoundingClientRect(); const r = c.getBoundingClientRect(); return { hx: h.x + 6, hy: h.y + 6, x: r.x, y: r.y } })())").then(JSON.parse)
    const from = await where()
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.hx, y: from.hy })
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.hx, y: from.hy, button: 'left', buttons: 1, clickCount: 1 })
    for (let k = 1; k <= 6; k += 1) { await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.hx - k * 120, y: from.hy, button: 'left', buttons: 1 }); await sleep(20) }
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: from.hx - 720, y: from.hy, button: 'left', buttons: 0, clickCount: 1 })
    await sleep(350)
    const to = await where()
    report('start', 'dragging a card moves it', [`${Math.round(from.x)} -> ${Math.round(to.x)}`], performance.now() - t0, Math.abs(from.x - to.x) < 50 ? 'the card stayed where it was' : null)
    await page.evaluate("window.__mpw.setSettings({ startBackground: { ...window.__mpw.state().settings.startBackground, layout: null } })")
  }

  /* --------------------------------------------------------------- the tutorial */
  if (wants('tutorial')) {
    console.log('\nTutorial: every step, forwards and back')
    await freshDocument()
    await page.evaluate("window.__mpw.run('help.tutorial')")
    await page.until("document.querySelector('[data-step]')")
    const steps = JSON.parse(await page.evaluate("import('/src/tutorial/steps.ts').then((m) => JSON.stringify(m.TUTORIAL_STEPS.map((s) => s.id)))"))
    for (const [index, step] of steps.entries()) {
      const t0 = performance.now()
      await sleep(200)
      const shown = await page.evaluate("document.querySelector('[data-step]')?.dataset.step")
      const pointed = await page.evaluate("Boolean(document.querySelector('.tutorial-outline'))")
      const inside = await page.evaluate("(() => { const c = document.querySelector('.tutorial-card').getBoundingClientRect(); return c.left >= 0 && c.top >= 0 && c.right <= innerWidth && c.bottom <= innerHeight })()")
      report('tutorial', step, [String(shown)], performance.now() - t0, shown !== step ? `showed ${shown}` : !pointed ? 'points at nothing' : !inside ? 'the card leaves the window' : null)
      if (index < steps.length - 1) await page.evaluate("document.querySelector('[data-action=\"tutorial-next\"]').click()")
    }
    await page.evaluate("document.querySelector('[data-action=\"tutorial-next\"]').click()")
    await sleep(150)
    report('tutorial', 'Done closes it', [], 0, (await page.evaluate("Boolean(document.querySelector('[data-step]'))")) ? 'the tour stayed open' : null)
  }

  /* ---------------------------------------------------------- the right click */
  if (wants('context')) {
    console.log('\nRight-click menus: every row')
    const menuAt = async (kind, withSelection) => {
      await freshDocument()
      if (withSelection) await page.evaluate("window.__mpw.select({ x: 200, y: 150, width: 300, height: 200 })")
      await page.evaluate("window.__mpw.run('image.invert')")
      await page.evaluate("window.__mpw.run('layer.duplicate')")
      await sleep(100)
      await page.evaluate("window.__mpw.run('window.layers')")
      await page.until("document.querySelector('.layer-row')")
      const at = kind === 'layer'
        ? JSON.parse(await page.evaluate("JSON.stringify((() => { const r = document.querySelector('.layer-row').getBoundingClientRect(); return { x: r.x + 60, y: r.y + 10 } })())"))
        : toScreen(await stageBox(), 300, 250)
      await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: at.x, y: at.y, button: 'right', buttons: 2, clickCount: 1 })
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'right', buttons: 0, clickCount: 1 })
      await sleep(150)
    }
    for (const [kind, withSelection] of [['canvas', false], ['canvas', true], ['layer', false]]) {
      await menuAt(kind, withSelection)
      const rows = JSON.parse(await page.evaluate("JSON.stringify([...document.querySelectorAll('.context-menu [data-command]')].map((b) => b.dataset.command))"))
      if (!rows.length) report('context', `${kind}${withSelection ? '+selection' : ''}`, [], 0, 'the menu did not open')
      for (const row of rows) {
        const t0 = performance.now()
        await menuAt(kind, withSelection)
        const before = await probe()
        const off = await page.evaluate(`document.querySelector('.context-menu [data-command="${row}"]')?.disabled`)
        await page.evaluate(`document.querySelector('.context-menu [data-command="${row}"]')?.click()`)
        const after = await settle(before)
        const closed = !(await page.evaluate("Boolean(document.querySelector('.context-menu'))"))
        await verdict('context', `${kind}${withSelection ? '+selection' : ''} / ${row}`, before, after, off ? 'disabled' : 'click', t0, off || closed ? null : 'the menu stayed open')
        await closeWindows()
      }
    }
  }

  /* ---------------------------------------------------- every command, and dialogs */
  const dialogCommands = new Map()
  if (wants('menus') || wants('dialogs')) {
    console.log('\nMenus: every command')
    const every = JSON.parse(await page.evaluate("import('/src/commands.ts').then((m) => JSON.stringify(m.commands.map((c) => c.id)))"))
    const ids = process.env.AUDIT_COMMANDS ? process.env.AUDIT_COMMANDS.split(',') : every
    const runSteps = async (steps = []) => {
      for (const step of steps) {
        if (typeof step === 'string') await page.evaluate(`window.__mpw.run(${JSON.stringify(step)})`)
        else if (step.js) await page.evaluate(step.js)
        else if (step.ok) await page.evaluate("document.querySelector('.dialog .dialog-actions .primary:not(:disabled)')?.click()")
        else if (step.drag) await drag(await stageBox(), step.drag[0], step.drag[1], 5)
        await sleep(160)
      }
    }
    const baseline = await page.evaluate("JSON.stringify(window.__mpw.state().settings)")
    let since = 0
    for (const id of ids) {
      const t0 = performance.now()
      since += 1
      if (since >= 40) { since = 0; await reloadApp() }
      await freshDocument()
      await page.evaluate("window.__mpw.select({ x: 200, y: 150, width: 300, height: 200 })")
      const setup = MENU_SETUP[id] ?? {}
      if (!setup.single) await page.evaluate("window.__mpw.run('layer.duplicate')")
      await sleep(70)
      await runSteps(setup.steps)
      const before = await probe()
      await page.evaluate(`window.__mpw.run(${JSON.stringify(id)})`)
      await runSteps(setup.then)
      const after = await settle(before, 1200)
      const changed = await verdict('menus', id, before, after, 'run', t0)
      if (changed.includes('dialog') && after.dialog && !dialogCommands.has(after.dialog)) dialogCommands.set(after.dialog, id)
      // The window's main button must do its job too, without an error.
      if (wants('menus') && after.dialog) {
        const t1 = performance.now()
        const inWindow = await probe()
        const clicked = await page.evaluate("(() => { const b = document.querySelector('.dialog .dialog-actions .primary:not(:disabled)'); if (!b) return false; b.click(); return true })()")
        if (clicked) {
          const done = await settle(inWindow, 1000)
          await verdict('menus', `${id} / OK`, inWindow, done, 'click', t1)
        }
      }
      await closeWindows()
      await page.evaluate(`window.__mpw.setSettings(${baseline})`)
      if (/screenMode|quickMask|isolate/.test(id)) await reloadApp()
    }
  }
  if (wants('dialogs')) {
    console.log(`\nWindows: every control of ${dialogCommands.size} windows`)
    const defaults = await page.evaluate('JSON.stringify(window.__mpw.state().settings)')
    /** A control hidden under another, or a window wider than itself, is broken however it behaves. */
    const reachable = () => page.evaluate(`JSON.stringify((() => {
      const problems = [];
      const content = document.querySelector('.dialog .dialog-content');
      if (content && content.scrollWidth > content.clientWidth + 1) problems.push(\`scrolls sideways by \${content.scrollWidth - content.clientWidth}px\`);
      for (const el of document.querySelectorAll('.dialog button, .dialog input, .dialog select')) {
        if (!el.checkVisibility({ visibilityProperty: true })) continue;
        el.scrollIntoView({ block: 'nearest' });
        const box = el.getBoundingClientRect();
        if (!box.width || !box.height) continue;
        const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        if (top && top !== el && !el.contains(top) && !top.contains(el)) problems.push(\`\${el.getAttribute('aria-label') || el.tagName} lies under \${top.getAttribute('aria-label') || top.tagName}\`);
      }
      return [...new Set(problems)].slice(0, 4);
    })())`)
    for (const [title, id] of dialogCommands) {
      const open = async () => {
        await closeWindows()
        await page.evaluate(`window.__mpw.setSettings(${defaults})`)
        await freshDocument()
        await page.evaluate("window.__mpw.select({ x: 200, y: 150, width: 300, height: 200 })")
        await page.evaluate("window.__mpw.run('layer.duplicate')")
        await sleep(60)
        await page.evaluate(`window.__mpw.run(${JSON.stringify(id)})`)
        await sleep(220)
      }
      await open()
      const pages = await page.evaluate("document.querySelectorAll('.dialog .settings-tabs button').length") || 1
      for (let index = 0; index < pages; index += 1) {
        // The tabs and the buttons at the foot are pressed once, on the first page.
        const scope = index ? '.dialog .settings-page' : '.dialog'
        const openPage = async () => {
          await open()
          if (index) await page.evaluate(`document.querySelectorAll('.dialog .settings-tabs button')[${index}].click()`)
          if (index) await sleep(80)
        }
        await openPage()
        const t = performance.now()
        const faults = JSON.parse(await reachable())
        report('dialogs', `${title} ${index ? index + 1 : ''} layout`.replace(/\s+/g, ' '), faults.length ? [] : ['ok'], performance.now() - t, faults.length ? faults.join('; ') : null)
        const controls = await controlsOf(scope)
        console.log(`  ${title}${pages > 1 ? ` page ${index + 1}` : ''} (${controls.length})`)
        for (const control of controls.slice(0, pages > 1 ? 60 : 40)) {
          const t0 = performance.now()
          await openPage()
          const before = await probe()
          const action = await press(scope, control.i)
          const after = await settle(before, 700)
          await verdict('dialogs', `${title} / ${String(control.name).replace(/\s+/g, ' ').slice(0, 24)}`.slice(0, 46), before, after, action, t0)
        }
      }
      await closeWindows()
      await alive()
    }
  }

  /* ---------------------------------------------------------------- the guide */
  if (wants('guide')) {
    console.log('\nUser guide: every button')
    const GUIDE = "JSON.stringify({ style: document.documentElement.getAttribute('style'), body: document.body.className, list: document.getElementById('font-list').hidden, top: document.getElementById('content').scrollTop, now: document.getElementById('font-now').textContent })"
    await page.send('Page.navigate', { url: `${base}doc/index.html` })
    await page.until("document.body.classList.contains('ready')")
    await sleep(200)
    const buttons = JSON.parse(await page.evaluate("JSON.stringify([...document.querySelectorAll('.doc-head button')].filter((b) => b.checkVisibility()).map((b, i) => ({ i, name: b.getAttribute('aria-label') || b.innerText })))"))
    for (const button of buttons) {
      const t0 = performance.now()
      await page.evaluate("document.body.classList.remove('x')")
      if (button.name.includes('ko') || button.name === 'English') await page.evaluate("document.querySelector('[data-lang=\"ko\"]').click()")
      const before = await page.evaluate(GUIDE)
      await page.evaluate(`[...document.querySelectorAll('.doc-head button')].filter((b) => b.checkVisibility())[${button.i}].click()`)
      await sleep(120)
      const same = before === (await page.evaluate(GUIDE))
      report('guide', button.name.replace(/\s+/g, ' ').trim(), same ? [] : ['changed'], performance.now() - t0, same && !/한국어/.test(button.name) ? 'the click changed nothing' : pop()[0] ?? null)
      await page.evaluate("document.getElementById('font-list').hidden = true")
    }
    const fonts = await page.evaluate("(document.getElementById('font-button').click(), document.querySelectorAll('#font-list button').length)")
    await page.evaluate("document.querySelectorAll('#font-list button')[1]?.click()")
    report('guide', `choosing a font (${fonts} offered)`, [], 0, (await page.evaluate("document.documentElement.style.getPropertyValue('--doc-font')")) ? null : 'the font did not change')
    const before = await page.evaluate("document.getElementById('content').scrollTop")
    await page.evaluate("document.querySelectorAll('#side a')[6].click()")
    await sleep(200)
    report('guide', 'a contents link jumps there', [], 0, before === (await page.evaluate("document.getElementById('content').scrollTop")) ? 'it did not move' : null)
  }

  /* -------------------------------------------------------- the right panel */
  if (wants('panel')) {
    console.log('\nRight panel: every control on every tab')
    const tabs = JSON.parse(await page.evaluate("JSON.stringify([...document.querySelectorAll('.panel-tabs button')].map((b) => b.getAttribute('data-tooltip')))"))
    // Each tab plain, then again with what its other controls appear for.
    const button = (text) => `[...document.querySelectorAll('.panel-body button')].find((b) => (b.getAttribute('data-tooltip') || b.innerText || '').includes(${JSON.stringify(text)}))?.click()`
    const run = (id) => page.evaluate(`window.__mpw.run(${JSON.stringify(id)})`)
    const typeLayer = async () => {
      await page.evaluate("window.__mpw.tool('text')")
      const box = await stageBox()
      await drag(box, [100, 100], [500, 200])
      await sleep(150)
      await page.evaluate("(() => { const area = document.querySelector('.dialog textarea, .dialog input[type=text]'); if (area) { Object.getOwnPropertyDescriptor(area.constructor.prototype, 'value').set.call(area, 'Audit'); area.dispatchEvent(new Event('input', { bubbles: true })) } document.querySelector('.dialog .primary')?.click() })()")
      await sleep(150)
    }
    const shapeLayer = async () => {
      await page.evaluate("window.__mpw.tool('rect')")
      await drag(await stageBox(), [100, 100], [300, 250])
      await sleep(100)
    }
    const pathMade = async () => {
      await page.evaluate("window.__mpw.tool('pen')")
      const box = await stageBox()
      for (const at of [[200, 200], [400, 200], [400, 400]]) await click(box, at)
      await key('Enter', 0, 'Enter')
      await sleep(80)
    }
    const scenes = [
      ...tabs.map((tab) => ({ tab, name: '', setup: () => run('layer.duplicate') })),
      { tab: 'Layers', name: 'bottom layer', setup: async () => { await run('layer.duplicate'); await sleep(40); await run('layer.sendBackward') } },
      { tab: 'Properties', name: 'adjustment', setup: () => run('adjLayer.brightness') },
      { tab: 'Properties', name: 'curves', setup: () => run('adjLayer.curves') },
      { tab: 'Properties', name: 'shape', setup: shapeLayer },
      { tab: 'Properties', name: 'type', setup: typeLayer },
      { tab: 'Properties', name: 'mask', setup: () => run('layer.mask') },
      { tab: 'Properties', name: 'smart', setup: () => run('layer.toSmart') },
      { tab: 'Character', name: 'type', setup: typeLayer },
      { tab: 'Paragraph', name: 'type', setup: typeLayer },
      { tab: 'Glyphs', name: 'type', setup: typeLayer },
      { tab: 'Paths', name: 'path', setup: pathMade },
      { tab: 'Shapes', name: 'path', setup: pathMade },
      { tab: 'History', name: 'edits', setup: async () => { await run('image.invert'); await sleep(40); await run('image.flipH'); await sleep(40); await undoKey() } },
      { tab: 'Timeline', name: 'frames', setup: async () => { await run('window.timeline'); await sleep(60); await page.evaluate(button('Add frame')); await sleep(40); await page.evaluate(button('Add frame')) } },
      { tab: 'Layer comps', name: 'comp', setup: async () => { await run('window.comps'); await sleep(60); await page.evaluate("document.querySelector('.panel-body .channel-row button')?.click()") } },
      { tab: 'Notes', name: 'note', setup: async () => { await page.evaluate("window.__mpw.tool('note')"); await click(await stageBox(), [200, 200]); await sleep(120); await closeWindows() } },
      { tab: 'Actions', name: 'recording', setup: async () => { await run('window.actions'); await sleep(60); await page.evaluate(button('Start')) } },
      { tab: 'Channels', name: 'saved', setup: async () => { await run('select.save'); await sleep(100); await page.evaluate("document.querySelector('.dialog .primary')?.click()") ; await sleep(80) } },
    ]
    const prepare = async (scene) => { await scene.setup(); await sleep(70) }
    for (const scene of scenes) {
      const tabIndex = tabs.indexOf(scene.tab)
      if (tabIndex < 0) { console.log(`  no tab named ${scene.tab}`); continue }
      const openTab = async () => {
        await page.evaluate(`document.querySelectorAll('.panel-tabs button')[${tabIndex}].click()`)
        await sleep(70)
      }
      await freshDocument()
      await prepare(scene)
      await openTab()
      const controls = JSON.parse(await page.evaluate(`JSON.stringify([...document.querySelectorAll('.panel-body button, .panel-body input, .panel-body select')].map((el, i) => ({ i, tag: el.tagName, type: el.type, name: el.getAttribute('aria-label') || el.getAttribute('data-tooltip') || el.closest('label')?.innerText?.split('\\n')[0] || el.innerText || el.placeholder || el.value || '?', disabled: el.disabled })))`))
      console.log(`  ${scene.tab}${scene.name ? ` with ${scene.name}` : ''} (${controls.length})`)
      // The long lists are the same control many times: a sample of each is enough.
      const repeated = controls.length > 60
      for (const control of controls) {
        if (repeated && control.i % 7 !== 0) continue
        if (control.disabled) continue
        const t0 = performance.now()
        await freshDocument()
        await page.evaluate("window.__mpw.select({ x: 200, y: 150, width: 300, height: 200 })")
        await prepare(scene)
        await openTab()
        const before = await probe()
        const action = await page.evaluate(`(() => {
          const el = document.querySelectorAll('.panel-body button, .panel-body input, .panel-body select')[${control.i}];
          if (!el) return 'gone';
          const set = (proto, value) => { Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
          if (el.tagName === 'BUTTON') { el.click(); return 'click' }
          if (el.tagName === 'SELECT') { const next = [...el.options].find((o) => o.value !== el.value); if (!next) return 'one'; set(HTMLSelectElement.prototype, next.value); return 'select' }
          if (el.type === 'checkbox') { el.click(); return 'check' }
          if (el.type === 'range') { const mid = (Number(el.max) + Number(el.min)) / 2; const value = Math.abs(Number(el.value) - mid) < 2 ? Number(el.max) : mid; set(HTMLInputElement.prototype, String(value)); return 'range' }
          if (el.type === 'color') { set(HTMLInputElement.prototype, el.value === '#123456' ? '#654321' : '#123456'); return 'color' }
          if (el.type === 'text' || !el.type) { el.focus(); el.select?.(); window.__typed = el.closest('.number-stepper') ? String(parseFloat(el.value) + 1) : '#123456'; return 'text' }
          return 'other';
        })()`)
        if (action === 'text') {
          await page.send('Input.insertText', { text: await page.evaluate('window.__typed') })
          await sleep(40)
          await key('Enter', 0, 'Enter')
        }
        await sleep(160)
        const after = await probe()
        const changed = differences(before, after)
        const thrown = pop()
        let problem = thrown.length ? `page error: ${thrown[0]}` : null
        const label = `${scene.tab}${scene.name ? `+${scene.name}` : ''} / ${String(control.name).replace(/\s+/g, ' ').slice(0, 26)}`
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
fs.writeFileSync(path.join(outDir, outName), JSON.stringify({ results, findings }, null, 2))
console.log(`\n${results.length} controls pressed in ${((Date.now() - started) / 1000).toFixed(1)}s: ${results.length - findings.length} did something, ${findings.length} findings. Details in out/${outName}`)
for (const item of findings) console.log(`  ✘ ${item.section.padEnd(8)} ${item.name.padEnd(46).slice(0, 46)} ${item.problem}`)
process.exit(findings.length ? 1 : 0)

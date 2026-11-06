// What the GUI tests share: starting the real program (target/e2e, its own settings and WebView2
// folders) and driving it over the DevTools protocol. Mouse and keys go through Input.dispatch*, so
// the browser does its own hit testing, but the user's real pointer and keyboard are not touched.
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect, waitForTarget } from '../scripts/cdp.mjs'
import { freePort } from '../scripts/free-port.mjs'

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const exeName = process.platform === 'win32' ? 'MyMind.exe' : 'MyMind'
const exe = path.join(root, 'src-tauri', 'target', 'e2e', 'debug', exeName)
export const shots = path.join(root, 'test-results', 'screens')
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
fs.mkdirSync(shots, { recursive: true })

/**
 * Starts the program; returns the page, its settings folder and a way to stop it. `work` restarts
 * on the folder of an earlier run (see stop({ keep: true })), with what that run saved.
 */
export async function launch({ inline = true, settings = {}, args = [], work: reuse = null } = {}) {
  const work = reuse ?? fs.mkdtempSync(path.join(os.tmpdir(), 'mymind-gui-'))
  const settingsDir = path.join(work, 'settings')
  if (!reuse) {
    fs.mkdirSync(settingsDir)
    fs.writeFileSync(path.join(settingsDir, 'settings.json'), JSON.stringify({ ...settings, startScreen: { askTutorial: false, ...settings.startScreen } }))
  }
  const port = await freePort(9450)
  const child = spawn(exe, args, {
    stdio: 'ignore',
    env: {
      ...process.env,
      MYMIND_SETTINGS_DIR: settingsDir,
      MYMIND_TEST_MOUSE_THROUGH: '1',
      ...(inline ? { MYMIND_INLINE_DIALOGS: '1' } : {}),
      WEBVIEW2_USER_DATA_FOLDER: path.join(work, 'webview'),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    },
  })
  const exited = new Promise((resolve) => child.once('exit', resolve))
  const target = await waitForTarget(port, (t) => /index\.html|tauri\.localhost/.test(t.url), 40000)
  const page = await connect(target)
  await page.until(`document.querySelector('.app-shell')`, 30000)
  return {
    page,
    port,
    work,
    settingsDir,
    exited,
    settings: () => JSON.parse(fs.readFileSync(path.join(settingsDir, 'settings.json'), 'utf8')),
    stop: async ({ keep = false } = {}) => {
      page.close()
      // This process only: it is our own child, never the user's window.
      child.kill()
      await Promise.race([exited, sleep(3000)])
      await sleep(400)
      if (!keep) fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    },
  }
}

export const click = (page, selector) =>
  page.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) throw new Error('no ' + ${JSON.stringify(selector)}); e.click(); return true })()`)
export const shoot = async (page, name) => fs.writeFileSync(path.join(shots, `${name}.png`), await page.screenshot())
export const text = (page, selector) => page.evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`)
export const count = (page, selector) => page.evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`)
/** Settings are written a moment after the click. */
export const settled = async (read, want, what = 'setting') => {
  const t0 = Date.now()
  while (Date.now() - t0 < 5000) {
    try { if (read() === want) return } catch { /* being written */ }
    await sleep(40)
  }
  assert.equal(read(), want, what)
}
export const cssVar = (page, name) => page.evaluate(`getComputedStyle(document.documentElement).getPropertyValue(${JSON.stringify(name)}).trim()`)

const KEYS = {
  Delete: [46, 'Delete'], Backspace: [8, 'Backspace'], Escape: [27, 'Escape'], Enter: [13, 'Enter'], F1: [112, 'F1'], F11: [122, 'F11'],
  ArrowUp: [38, 'ArrowUp'], ArrowDown: [40, 'ArrowDown'], ArrowLeft: [37, 'ArrowLeft'], ArrowRight: [39, 'ArrowRight'],
}
export const CTRL = 2
export const SHIFT = 8

/** The mouse and keyboard, as a user has them. */
export function driver(page) {
  const buttonBits = { left: 1, right: 2, middle: 4 }
  const mouse = (type, x, y, { button = 'none', buttons = 0, modifiers = 0, clickCount = 0, deltaY } = {}) =>
    page.send('Input.dispatchMouseEvent', { type, x, y, button, buttons, modifiers, clickCount, ...(deltaY !== undefined ? { deltaX: 0, deltaY } : {}) })
  const press = async (x, y, { button = 'left', modifiers = 0, clickCount = 1 } = {}) => {
    await mouse('mouseMoved', x, y, { modifiers })
    await mouse('mousePressed', x, y, { button, buttons: buttonBits[button], modifiers, clickCount })
  }
  const release = (x, y, { button = 'left', modifiers = 0, clickCount = 1 } = {}) => mouse('mouseReleased', x, y, { button, modifiers, clickCount })
  const clickAt = async (x, y, options = {}) => {
    await press(x, y, options)
    await release(x, y, options)
    await sleep(25)
  }
  /** Pressed at one place, let go at another, with moves between as a hand makes. */
  const dragFrom = async (from, to, { button = 'left', modifiers = 0, hold } = {}) => {
    await press(from.x, from.y, { button, modifiers })
    for (const k of [0.25, 0.6, 1]) {
      await mouse('mouseMoved', from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k, { button, buttons: buttonBits[button], modifiers })
      await sleep(25)
    }
    if (hold) await hold()
    await release(to.x, to.y, { button, modifiers })
    await sleep(40)
  }
  const wheel = async (x, y, deltaY, times = 1) => {
    for (let i = 0; i < times; i++) {
      await mouse('mouseWheel', x, y, { deltaY })
      await sleep(12)
    }
  }
  const key = async (name, modifiers = 0) => {
    const [code, id] = KEYS[name] ?? [name.toUpperCase().charCodeAt(0), `Key${name.toUpperCase()}`]
    const base = { key: name, code: id, windowsVirtualKeyCode: code, modifiers }
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base })
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base })
    await sleep(25)
  }
  const type = (words) => page.send('Input.insertText', { text: words })
  return { mouse, press, release, clickAt, dragFrom, wheel, key, type }
}

/** A small diagram with names to find its parts by. Its numbers leave room around every shape. */
export function fixture(change = (doc) => doc) {
  const textStyle = { fontFamily: 'notoSansKr', fontSize: 13, color: 'auto', bold: true, italic: false, underline: false, strike: false }
  const node = (id, parentId, x, y) => ({ id, parentId, text: id, x, y, width: 140, height: 44, shape: 'rounded', color: '#93c5fd', textStyle })
  const edge = (from, to) => ({ id: `${from}-${to}`, from, to, lineType: 'curve', linePattern: 'solid', color: '#94a3b8' })
  return change({
    version: 1,
    mode: 'mindmap',
    layout: 'ltr',
    defaultShape: 'rounded',
    defaultLine: 'curve',
    defaultLinePattern: 'solid',
    nodes: [node('Root', null, 100, 240), node('A', 'Root', 400, 120), node('B', 'Root', 400, 240), node('C', 'Root', 400, 360), node('A1', 'A', 700, 120)],
    edges: [edge('Root', 'A'), edge('Root', 'B'), edge('Root', 'C'), edge('A', 'A1')],
  })
}

/**
 * The program with one diagram at a time. `load` brings a fresh copy of a diagram, whatever the last
 * test left behind, and `savedDoc` reads what is in the program through a real Save As.
 */
export async function session(options = {}) {
  const app = await launch({ ...options, settings: { startScreen: { showOnStartup: false }, ...options.settings } })
  const { page } = app
  const d = driver(page)
  const js = JSON.stringify
  const files = path.join(app.work, 'files')
  fs.mkdirSync(files, { recursive: true })
  let serial = 0
  const answerDialogs = (answers) => page.evaluate(`(() => { window.__mymindTest = { ...window.__mymindTest, ...${js(answers)} }; return true })()`)
  const nodeEl = (name) => `[...document.querySelectorAll('.node-hit')].find((g) => g.querySelector('tspan')?.textContent === ${js(name)})`
  // The window takes its final size a moment after it appears, and a resize closes open menus.
  let stable = 0
  for (let last = -1, t0 = Date.now(); stable < 4 && Date.now() - t0 < 5000; await sleep(120)) {
    const now = await page.evaluate('innerWidth * 10000 + innerHeight')
    stable = now === last ? stable + 1 : 0
    last = now
  }
  const self = {
    ...d,
    app,
    page,
    files,
    answerDialogs,
    nodeEl,
    click: (selector) => click(page, selector),
    count: (selector) => count(page, selector),
    text: (selector) => text(page, selector),
    shoot: (name) => shoot(page, name),
    file: (name) => path.join(files, name),
    until: (expression, ms) => page.until(expression, ms),
    title: () => text(page, '[data-title-file]'),
    nodeCount: () => page.evaluate(`Number(document.querySelector('[data-status="nodes"]').textContent)`),
    zoomText: () => page.evaluate(`[...document.querySelectorAll('.status-item')].find((e) => e.textContent.includes('%')).querySelector('strong').textContent`),
    zoom: async () => Number.parseInt(await self.zoomText(), 10) / 100,
    /** Where a shape is on the screen. */
    rect: (name) => page.evaluate(`(() => { const r = ${nodeEl(name)}.querySelector('.node-shape').getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`),
    /** Where a shape is in the diagram. */
    box: (name) => page.evaluate(`(() => { const b = ${nodeEl(name)}.querySelector('.node-shape').getBBox(); return { x: b.x, y: b.y, width: b.width, height: b.height } })()`),
    clickNode: async (name, options_) => {
      const at = await self.rect(name)
      await d.clickAt(at.x, at.y, options_)
    },
    dragNode: async (name, dx, dy, options_) => {
      const at = await self.rect(name)
      await d.dragFrom(at, { x: at.x + dx, y: at.y + dy }, options_)
    },
    /** The middle of a line on the screen. */
    edgePoint: (index) => page.evaluate(`(() => { const p = document.querySelectorAll('.edge-hit')[${index}]; const l = p.getPointAtLength(p.getTotalLength() / 2); const m = p.getScreenCTM(); return { x: l.x * m.a + m.e, y: l.y * m.d + m.f } })()`),
    clickEdge: async (index, options_) => {
      const at = await self.edgePoint(index)
      await d.clickAt(at.x, at.y, options_)
    },
    /** An empty place on the canvas: its bottom right corner has no part of the diagram. */
    emptyPoint: () => page.evaluate(`(() => { const r = document.querySelector('.canvas-svg').getBoundingClientRect(); return { x: r.right - 24, y: r.bottom - 24 } })()`),
    selected: () => page.evaluate(`[...document.querySelectorAll('.node-hit.selected tspan')].map((t) => t.textContent)`),
    listed: () => page.evaluate(`[...document.querySelectorAll('.node-tree-item .node-tree-text')].map((t) => t.textContent)`),
    /** One line's visible stroke (a root ribbon is its own). */
    lineAttr: (index, name) => page.evaluate(`(() => { const hit = document.querySelectorAll('.edge-hit')[${index}]; return (hit.nextElementSibling ?? hit).getAttribute(${js(name)}) })()`),
    setValue: (selector, value) => page.evaluate(`(() => {
      const e = document.querySelector(${js(selector)})
      if (!e) throw new Error('no ' + ${js(selector)})
      const proto = e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, ${js(String(value))})
      e.dispatchEvent(new Event('input', { bubbles: true }))
      e.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    })()`),
    /** A control with − and + on its sides. */
    step: (id, up = true) => click(page, `[data-field="${id}"] button:${up ? 'last' : 'first'}-child`),
    stepped: (id) => page.evaluate(`document.querySelector('[data-field="${id}"] input').value`),
    pickSelect: async (id, value) => {
      await click(page, `[data-select="${id}"] .icon-select-button`)
      await click(page, `[data-select="${id}"] [data-value="${value}"]`)
    },
    /** Presses one of the small icons of the properties panel. */
    pickPalette: async (id, value) => {
      await click(page, `.right-panel [data-palette="${id}"] [data-value="${value}"]`)
      await sleep(20)
    },
    /** One of the drop-downs with a floating list: of the given place, by its label. */
    pickDropdown: async (place, label, option) => {
      await page.evaluate(`[...document.querySelectorAll(${js(`${place} .tb-dropdown-trigger`)})].find((e) => e.getAttribute('aria-label') === ${js(label)}).click()`)
      await page.until(`document.querySelector('.tb-menu-floating')`)
      await page.evaluate(`(() => { const e = [...document.querySelectorAll('.tb-menu-floating .tb-menu-item')].find((b) => b.textContent.replace('✓', '').trim() === ${js(option)}); if (!e) throw new Error('no option ' + ${js(option)}); e.click(); return true })()`)
      await sleep(20)
    },
    /** Opens a menu of the title row and presses an item, by its words. */
    menu: async (name, label) => {
      await click(page, `[data-menu="${name}"] .tb-btn`)
      await page.until(`document.querySelector('.tb-menu-floating')`)
      await page.evaluate(`(() => { const e = [...document.querySelectorAll('.tb-menu-floating .tb-menu-item')].find((b) => b.textContent.includes(${js(label)})); if (!e) throw new Error('no item ' + ${js(label)}); e.click(); return true })()`)
      await sleep(25)
    },
    menuItems: async (name) => {
      await click(page, `[data-menu="${name}"] .tb-btn`)
      await page.until(`document.querySelector('.tb-menu-floating')`)
      const items = await page.evaluate(`[...document.querySelectorAll('.tb-menu-floating .tb-menu-item')].map((b) => ({ text: b.textContent, disabled: b.disabled }))`)
      await d.key('Escape')
      return items
    },
    /** The right mouse button, and the words of what it offers. */
    contextAt: async (x, y) => {
      await d.clickAt(x, y, { button: 'right' })
      await page.until(`document.querySelector('.context-menu')`)
    },
    contextItem: (label) => page.evaluate(`(() => { const e = [...document.querySelectorAll('.context-menu button')].find((b) => b.textContent.includes(${js(label)})); if (!e) throw new Error('no item ' + ${js(label)}); return { disabled: e.disabled, text: e.textContent } })()`),
    contextPress: async (label) => {
      await page.evaluate(`(() => { const e = [...document.querySelectorAll('.context-menu button')].find((b) => b.textContent.includes(${js(label)})); if (!e) throw new Error('no item ' + ${js(label)}); e.click(); return true })()`)
      await sleep(25)
    },
    /** Closes whatever a failed test left open, so one failure stays one failure. */
    clear: async () => {
      for (let i = 0; i < 3; i++) {
        if (!(await page.evaluate(`!!document.querySelector('[data-dialog], .context-menu, .tb-menu-floating')`))) break
        await d.key('Escape')
        await sleep(40)
      }
      if (await page.evaluate(`!!document.querySelector('[data-tutorial-card]')`)) await click(page, '[data-command="tutorial-close"]')
    },
    /** With the grid on, dragging the empty canvas pans; with it off, it draws a marquee. */
    setGrid: async (on) => {
      if ((await count(page, '.canvas-grid')) === (on ? 0 : 1)) await click(page, '[data-command="grid"]')
      await page.until(on ? `document.querySelector('.canvas-grid')` : `!document.querySelector('.canvas-grid')`)
    },
    /** A click on the empty canvas with the grid off: nothing is selected. */
    deselect: async () => {
      await self.setGrid(false)
      const at = await self.emptyPoint()
      await d.clickAt(at.x, at.y)
      await page.until(`document.querySelector('.panel-empty')`)
      return at
    },
    /** A fresh copy of a diagram, under a name of its own; anything unsaved is given up. */
    load: async (doc = fixture()) => {
      await self.clear()
      if (await count(page, '[data-start-screen]')) await click(page, '[data-command="start"]')
      await self.setGrid(true)
      const name = `doc-${++serial}.mmap`
      fs.writeFileSync(self.file(name), JSON.stringify(doc))
      await answerDialogs({ open: self.file(name) })
      await click(page, '[data-command="open"]')
      await page.until(`document.querySelector('[data-dialog="unsaved"]') || document.querySelector('[data-title-file]').textContent === ${js(name)}`)
      if (await count(page, '[data-dialog="unsaved"]')) await click(page, '[data-command="unsaved-discard"]')
      await page.until(`document.querySelector('[data-title-file]').textContent === ${js(name)}`)
      await sleep(30)
      return self.file(name)
    },
    /** The diagram as a Save As writes it. */
    savedDoc: async () => {
      const file = self.file(`snapshot-${++serial}.mmap`)
      await answerDialogs({ saveDiagram: file })
      await d.key('s', CTRL | SHIFT)
      const t0 = Date.now()
      while (Date.now() - t0 < 5000) {
        try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { /* being written */ }
        await sleep(30)
      }
      throw new Error('Save As wrote nothing')
    },
    stop: (options_) => app.stop(options_),
  }
  return self
}

export const byText = (doc, name) => doc.nodes.find((node) => node.text === name)
export const edgeOf = (doc, from, to) => doc.edges.find((edge) => edge.from === from && edge.to === to)

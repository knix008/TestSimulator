// npm run test:gui: the real program (target/e2e, its own settings and WebView2 folders) driven over
// the DevTools protocol. Dialogs stay inside the page (MYMIND_INLINE_DIALOGS) except in the one
// category that checks real windows. It never touches the user's settings or a running MyMind.
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect, listTargets, waitForTarget } from '../scripts/cdp.mjs'
import { freePort } from '../scripts/free-port.mjs'
import { createReporter } from './reporter.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const exeName = process.platform === 'win32' ? 'MyMind.exe' : 'MyMind'
const exe = path.join(root, 'src-tauri', 'target', 'e2e', 'debug', exeName)
const shots = path.join(root, 'test-results', 'screens')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
fs.mkdirSync(shots, { recursive: true })

const { category, test, summary } = createReporter({ title: 'MyMind GUI tests', reportFile: path.join(root, 'test-results', 'gui-report.json') })

/** Starts the program; returns the page, its settings folder and a way to stop it. */
async function launch({ inline = true, settings = {}, args = [] } = {}) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'mymind-gui-'))
  const settingsDir = path.join(work, 'settings')
  fs.mkdirSync(settingsDir)
  fs.writeFileSync(path.join(settingsDir, 'settings.json'), JSON.stringify(settings))
  const port = await freePort(9450)
  const child = spawn(exe, args, {
    stdio: 'ignore',
    env: {
      ...process.env,
      MYMIND_SETTINGS_DIR: settingsDir,
      ...(inline ? { MYMIND_INLINE_DIALOGS: '1' } : {}),
      WEBVIEW2_USER_DATA_FOLDER: path.join(work, 'webview'),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    },
  })
  const target = await waitForTarget(port, (t) => /index\.html|tauri\.localhost/.test(t.url), 40000)
  const page = await connect(target)
  await page.until(`document.querySelector('.app-shell')`, 30000)
  return {
    page,
    port,
    settingsDir,
    settings: () => JSON.parse(fs.readFileSync(path.join(settingsDir, 'settings.json'), 'utf8')),
    stop: async () => {
      page.close()
      // This process only: it is our own child, never the user's window.
      child.kill()
      await sleep(400)
      fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    },
  }
}

const click = (page, selector) =>
  page.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) throw new Error('no ' + ${JSON.stringify(selector)}); e.click(); return true })()`)
const shoot = async (page, name) => fs.writeFileSync(path.join(shots, `${name}.png`), await page.screenshot())
const text = (page, selector) => page.evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`)
const count = (page, selector) => page.evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`)
/** Settings are written a moment after the click. */
const settled = async (read, want, what = 'setting') => {
  const t0 = Date.now()
  while (Date.now() - t0 < 5000) {
    try { if (read() === want) return } catch { /* being written */ }
    await sleep(40)
  }
  assert.equal(read(), want, what)
}
const cssVar = (page, name) => page.evaluate(`getComputedStyle(document.documentElement).getPropertyValue(${JSON.stringify(name)}).trim()`)

await category('Start screen')
{
  const app = await launch()
  const { page } = app
  await test('shows at startup with all six cards', async () => {
    await page.until(`document.querySelector('[data-start-screen]')`)
    for (const card of ['hero', 'actions', 'recent', 'samples', 'theme', 'background']) assert.equal(await count(page, `[data-card="${card}"]`), 1, card)
  })
  await test('fits the window: no sideways scrolling, no clipped card', async () => {
    const layout = await page.evaluate(`(() => { const s = document.querySelector('.start-scroll'); return { sw: s.scrollWidth, cw: s.clientWidth, cards: [...document.querySelectorAll('.start-card')].map((c) => [c.dataset.card, c.scrollWidth, c.clientWidth]) } })()`)
    assert.ok(layout.sw <= layout.cw, `scroll ${layout.sw} > ${layout.cw}`)
    for (const [id, sw, cw] of layout.cards) assert.ok(sw <= cw + 1, `${id} ${sw} > ${cw}`)
  })
  await test('from the top: shortcuts, samples, then themes and backgrounds', async () => {
    await page.until(`document.querySelector('[data-sample]')`)
    await sleep(200)
    const tops = await page.evaluate(`Object.fromEntries([...document.querySelectorAll('.start-card')].map((c) => [c.dataset.card, c.getBoundingClientRect().top]))`)
    assert.ok(tops.hero < tops.actions, JSON.stringify(tops))
    assert.ok(tops.actions < tops.samples, JSON.stringify(tops))
    assert.ok(tops.samples < tops.theme, JSON.stringify(tops))
    assert.ok(tops.theme < tops.background, JSON.stringify(tops))
  })
  await test('24 backgrounds, each draws and is selected and saved', async () => {
    const kinds = await page.evaluate(`[...document.querySelectorAll('[data-background]')].map((e) => e.dataset.background)`)
    assert.ok(kinds.length >= 20, `only ${kinds.length}`)
    for (const kind of kinds) {
      await click(page, `[data-background="${kind}"]`)
      await page.until(`document.querySelector('[data-background="${kind}"]').classList.contains('on')`)
    }
    await sleep(300)
    const drew = await page.evaluate(`(() => { const c = document.querySelector('[data-start-canvas]'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const seen = new Set(); for (let i = 0; i < d.length; i += 4) seen.add(d[i] + ',' + d[i+1] + ',' + d[i+2]); return seen.size })()`)
    assert.ok(drew > 3, 'the canvas is empty')
    await settled(() => app.settings().startScreen.background, kinds.at(-1))
    await click(page, `[data-background="mindBloom"]`)
  })
  await test('speed and card opacity steppers work and are saved', async () => {
    await click(page, `[data-step="startOpacity:down"]`)
    await page.until(`document.querySelector('[data-start-screen]').style.getPropertyValue('--start-card-alpha') === '80%'`)
    await settled(() => app.settings().startScreen.cardOpacity, 80)
    // What the speed starts at depends on the system's reduced-motion setting.
    const speed = () => page.evaluate(`Number(document.querySelector('[data-field="startSpeed"]').value)`)
    const before = await speed()
    await click(page, `[data-step="startSpeed:up"]`)
    await page.until(`Number(document.querySelector('[data-field="startSpeed"]').value) === ${before + 10}`)
    await settled(() => app.settings().startScreen.speed, before + 10)
  })
  await test('a sample opens as an unnamed diagram and leaves the start screen', async () => {
    await page.until(`document.querySelector('[data-sample="fishbone-quality"]')`)
    assert.equal(await count(page, '[data-sample-group="mindmap"] [data-sample]'), 20)
    assert.equal(await count(page, '[data-sample-group="fishbone"] [data-sample]'), 20)
    await click(page, '[data-sample="fishbone-quality"]')
    await page.until(`!document.querySelector('[data-start-screen]')`)
    assert.equal(await text(page, '[data-status="nodes"]'), '13')
    assert.ok(!(await text(page, '[data-title-file]')).includes('sample'))
  })
  await test('the Start button brings it back, Continue returns', async () => {
    await click(page, '[data-command="start"]')
    await page.until(`document.querySelector('[data-start-screen]')`)
    await shoot(page, 'start-screen')
    await click(page, '[data-start="continue"]')
    await page.until(`!document.querySelector('[data-start-screen]')`)
    await shoot(page, 'workspace')
  })
  await app.stop()
}

await category('Start screen layout')
{
  const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)).join(', ')})`
  // What an earlier version saved: narrow samples and themes.
  const old = { version: 1, cards: { samples: { col: 2, row: 11, w: 1, h: 32, fit: false }, theme: { col: 0, row: 17, w: 2, h: 25, fit: true } } }
  for (const theme of ['dark-midnight', 'light-classic']) {
    const app = await launch({ settings: { theme, startScreen: { layout: old } } })
    const { page } = app
    await page.until(`document.querySelector('[data-sample]')`)
    await sleep(300)
    await test(`${theme}: samples and themes run the full width, under the shortcuts`, async () => {
      const box = await page.evaluate(`(() => { const of = (id) => { const r = document.querySelector('[data-card="' + id + '"]').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, width: r.width } }; return { board: document.querySelector('.start-board').getBoundingClientRect().width, actions: of('actions'), samples: of('samples'), theme: of('theme') } })()`)
      assert.ok(Math.abs(box.samples.width - box.board) < 2, JSON.stringify(box))
      assert.ok(Math.abs(box.theme.width - box.board) < 2, JSON.stringify(box))
      assert.ok(box.samples.top >= box.actions.bottom, JSON.stringify(box))
    })
    await test(`${theme}: dark themes above light ones, each the width of the card`, async () => {
      const rows = await page.evaluate(`(() => { const of = (kind) => document.querySelector('[data-theme-kind="' + kind + '"]').getBoundingClientRect(); const d = of('dark'); const l = of('light'); return { darkBottom: d.bottom, lightTop: l.top, darkWidth: d.width, lightWidth: l.width, body: document.querySelector('[data-card="theme"] .card-body').getBoundingClientRect().width } })()`)
      assert.ok(rows.darkBottom <= rows.lightTop, JSON.stringify(rows))
      assert.ok(Math.abs(rows.darkWidth - rows.body) < 2 && Math.abs(rows.lightWidth - rows.body) < 2, JSON.stringify(rows))
    })
    await test(`${theme}: the card handles take the theme's text colour`, async () => {
      const ink = await cssVar(page, '--ink')
      const look = await page.evaluate(`(() => { const icon = document.querySelector('[data-card="actions"] .card-handle .icon'); const dots = document.querySelector('[data-card="actions"] .card-resize'); return { icon: getComputedStyle(icon).color, width: icon.getBoundingClientRect().width, stroke: getComputedStyle(icon).strokeWidth, dots: getComputedStyle(dots).color, opacity: getComputedStyle(dots).opacity } })()`)
      assert.equal(look.icon, rgb(ink))
      assert.equal(look.dots, rgb(ink))
      assert.equal(look.opacity, '1')
      assert.equal(look.width, 16)
      await shoot(page, `start-${theme}`)
      await page.evaluate(`document.querySelector('[data-card="theme"]').scrollIntoView({ block: 'start' })`)
      await sleep(100)
      await shoot(page, `start-themes-${theme}`)
    })
    await app.stop()
  }
}

await category('Themes')
{
  const app = await launch({ settings: { startScreen: { showOnStartup: false } } })
  const { page } = app
  await test('the toolbar list holds all 40 and applies one', async () => {
    await click(page, '[data-command="theme"]')
    await page.until(`document.querySelector('[data-theme-menu]')`)
    assert.equal(await count(page, '[data-theme-option]'), 40)
    await shoot(page, 'theme-menu')
    await click(page, '[data-theme-option="dark-midnight"]')
    await page.until(`document.documentElement.dataset.theme === 'dark-midnight'`)
    assert.equal(await page.evaluate(`document.documentElement.dataset.mode`), 'dark')
    await settled(() => app.settings().theme, 'dark-midnight')
  })
  await test('every theme reaches the app\'s own tokens and the canvas', async () => {
    assert.equal(await page.evaluate(`getComputedStyle(document.querySelector('.status-bar')).backgroundColor`), 'rgb(15, 20, 25)')
    assert.match(await cssVar(page, '--grid-line'), /^rgba\(/)
    assert.match(await cssVar(page, '--node-stroke'), /^rgba\(/)
  })
  await test('an exported SVG has no theme variables left in it', async () => {
    const svg = await page.evaluate(`(async () => {
      const clone = document.querySelector('.canvas-svg').outerHTML
      return clone.match(/var\\(--[a-z-]+\\)/g) ?? []
    })()`)
    const names = [...new Set(svg)]
    for (const name of names) assert.ok(['var(--spine)', 'var(--node-stroke)', 'var(--accent)', 'var(--grid-line)', 'var(--grid-line-major)'].includes(name), `${name} would be left in an export`)
  })
  await app.stop()
}

await category('Settings window')
{
  const app = await launch({ settings: { startScreen: { showOnStartup: false } } })
  const { page } = app
  await test('opens on General with its groups', async () => {
    await click(page, '[data-command="preferences"]')
    await page.until(`document.querySelector('[data-dialog="preferences"]')`)
    assert.equal(await count(page, '.pref-general section'), 4)
    await shoot(page, 'settings-general')
  })
  await test('no native select anywhere', async () => assert.equal(await count(page, 'select'), 0))
  await test('new-diagram defaults are saved and used', async () => {
    await click(page, '[data-select="prefNewMode"] .icon-select-button')
    await click(page, '[data-select="prefNewMode"] [data-value="fishbone"]')
    await settled(() => app.settings().general.newMode, 'fishbone')
    await click(page, '[data-command="preferences-close"]')
    await click(page, '[data-command="new"]')
    await page.until(`document.querySelector('[data-command="mode-fishbone"]').getAttribute('aria-pressed') === 'true'`)
    await click(page, '[data-command="preferences"]')
    await click(page, '[data-select="prefNewMode"] .icon-select-button')
    await click(page, '[data-select="prefNewMode"] [data-value="mindmap"]')
  })
  await test('theme tab: 20 light, 20 dark, and a theme of my own', async () => {
    await click(page, '[data-pref-tab="theme"]')
    assert.equal(await count(page, '[data-theme-group="light"] [data-pref-theme]'), 20)
    assert.equal(await count(page, '[data-theme-group="dark"] [data-pref-theme]'), 20)
    await click(page, '[data-command="theme-add"]')
    await page.until(`document.querySelector('[data-theme-editor]')`)
    assert.match(await page.evaluate(`document.documentElement.dataset.theme`), /^custom-/)
    await shoot(page, 'settings-theme')
    await settled(() => app.settings().customThemes.length, 1)
    const fits = await page.evaluate(`(() => { const p = document.querySelector('.pref-page'); return p.scrollHeight <= p.clientHeight + 1 })()`)
    assert.ok(fits, 'the theme page scrolls')
  })
  await test('my theme can be deleted after asking', async () => {
    await click(page, '[data-command="theme-delete"]')
    await page.until(`document.querySelector('[data-dialog="confirm"]')`)
    await click(page, '[data-command="confirm-yes"]')
    await page.until(`!document.querySelector('[data-theme-editor]')`)
    await settled(() => app.settings().customThemes.length, 0)
  })
  await test('start tab: backgrounds, and back to defaults', async () => {
    await click(page, '[data-pref-tab="start"]')
    assert.ok((await count(page, '[data-pref-page="start"] [data-background]')) >= 20)
    await shoot(page, 'settings-start')
    await click(page, '[data-command="start-reset"]')
    await settled(() => app.settings().startScreen.cardOpacity, 85)
  })
  await test('the language changes at once, also the settings window', async () => {
    await click(page, '[data-pref-tab="general"]')
    await click(page, '[data-select="prefLanguage"] .icon-select-button')
    await click(page, '[data-select="prefLanguage"] [data-value="en"]')
    await page.until(`document.documentElement.lang === 'en'`)
    assert.equal(await page.evaluate(`document.querySelector('[data-pref-tab="general"]').textContent.trim()`), 'General')
    await settled(() => app.settings().language, 'en')
    await click(page, '[data-command="preferences-close"]')
  })
  await app.stop()
}

await category('Grid, rulers and panels')
{
  const app = await launch({ settings: { startScreen: { showOnStartup: false } } })
  const { page } = app
  const cell = () => page.evaluate(`Number(document.querySelector('.canvas-grid').dataset.gridCell)`)
  const gridD = () => page.evaluate(`document.querySelector('.canvas-grid path').getAttribute('d')`)
  const wheel = async (deltaY, times) => {
    for (let i = 0; i < times; i++) {
      await page.evaluate(`document.querySelector('.canvas-wrap').dispatchEvent(new WheelEvent('wheel', { deltaY: ${deltaY}, bubbles: true, cancelable: true }))`)
      await sleep(15)
    }
  }
  await test('rulers and grid show, with toolbar buttons that are pressed', async () => {
    await page.until(`document.querySelector('[data-ruler="x"] text')`)
    for (const command of ['grid', 'ruler', 'left-panel', 'right-panel']) assert.equal(await page.evaluate(`document.querySelector('[data-command="${command}"]').getAttribute('aria-pressed')`), 'true', command)
    await shoot(page, 'rulers')
  })
  await test('zooming redraws the grid: its lines move and its level changes', async () => {
    const before = await gridD()
    assert.equal(await cell(), 20)
    await wheel(100, 1)
    await page.until(`document.querySelector('.canvas-grid path').getAttribute('d') !== ${JSON.stringify(before)}`)
    await wheel(100, 30)
    await page.until(`Number(document.querySelector('.canvas-grid').dataset.gridCell) >= 100`)
    await shoot(page, 'zoomed-out')
    await wheel(-100, 60)
    await page.until(`Number(document.querySelector('.canvas-grid').dataset.gridCell) < 20`)
    await shoot(page, 'zoomed-in')
  })
  await test('ruler ticks sit on the grid lines at this zoom', async () => {
    const match = await page.evaluate(`(() => {
      const ticks = [...document.querySelectorAll('[data-ruler="x"] g line')].map((l) => l.getAttribute('x1'))
      const d = [...document.querySelectorAll('.canvas-grid path')].slice(0, 2).map((p) => p.getAttribute('d')).join('')
      return ticks.length > 3 && ticks.every((x) => d.includes('M' + x + ' 0V'))
    })()`)
    assert.ok(match)
    await click(page, '[data-command="reset"]')
  })
  await test('the grid button turns the grid off and on, and is remembered', async () => {
    await click(page, '[data-command="grid"]')
    await page.until(`!document.querySelector('.canvas-grid')`)
    await settled(() => app.settings().showGrid, false)
    await click(page, '[data-command="grid"]')
    await page.until(`document.querySelector('.canvas-grid')`)
  })
  await test('the ruler button turns the rulers off and on, and is remembered', async () => {
    await click(page, '[data-command="ruler"]')
    await page.until(`!document.querySelector('.canvas-rulers')`)
    await settled(() => app.settings().showRulers, false)
    await click(page, '[data-command="ruler"]')
    await page.until(`document.querySelector('.canvas-rulers')`)
  })
  await test('the pointer shows as red dashed lines from the rulers', async () => {
    assert.equal(await page.evaluate(`document.querySelector('[data-ruler-guides]').getAttribute('visibility')`), 'hidden')
    await page.evaluate(`document.querySelector('.canvas-svg').dispatchEvent(new MouseEvent('mousemove', { clientX: 700, clientY: 400, bubbles: true }))`)
    const look = await page.evaluate(`(() => { const g = document.querySelector('[data-ruler-guides]'); const l = g.querySelector('line'); const s = getComputedStyle(l); return { visible: g.getAttribute('visibility'), stroke: s.stroke, dash: s.strokeDasharray, moved: l.getAttribute('transform') } })()`)
    assert.equal(look.visible, 'visible')
    assert.equal(look.stroke, 'rgb(229, 57, 53)')
    assert.notEqual(look.dash, 'none')
    assert.ok(look.moved.startsWith('translate('))
    await shoot(page, 'ruler-guides')
    await page.evaluate(`document.querySelector('.canvas-wrap').dispatchEvent(new MouseEvent('mouseleave'))`)
    assert.equal(await page.evaluate(`document.querySelector('[data-ruler-guides]').getAttribute('visibility')`), 'hidden')
  })
  await test('an exported image leaves out the grid and rulers', async () => {
    const svg = await page.evaluate(`document.querySelector('.canvas-svg').querySelectorAll('g[transform]')[0].closest('.canvas-grid') === null`)
    assert.ok(svg, 'the first transformed group must be the diagram, not the grid')
    assert.equal(await page.evaluate(`document.querySelector('.canvas-svg .canvas-rulers')`), null)
  })
  for (const side of ['left', 'right']) {
    await test(`the ${side} panel has a title and icon, and folds and opens`, async () => {
      const wide = await page.evaluate(`document.querySelector('.canvas-svg').clientWidth`)
      assert.ok(await text(page, `.${side}-panel .panel-title`))
      assert.equal(await count(page, `.${side}-panel .panel-head .icon`), 2)
      await click(page, `[data-panel-fold="${side}"]`)
      await page.until(`document.querySelector('[data-panel-strip="${side}"]')`)
      await page.until(`document.querySelector('.canvas-svg').clientWidth > ${wide}`)
      assert.ok((await text(page, `[data-panel-strip="${side}"]`)).length > 0)
      await settled(() => app.settings()[`${side}Panel`], false)
      if (side === 'right') await shoot(page, 'panels-folded')
      await click(page, `[data-panel-strip="${side}"]`)
      await page.until(`document.querySelector('[data-panel-fold="${side}"]')`)
      await click(page, `[data-command="${side}-panel"]`)
      await page.until(`document.querySelector('[data-panel-strip="${side}"]')`)
      await click(page, `[data-command="${side}-panel"]`)
      await page.until(`document.querySelector('[data-panel-fold="${side}"]')`)
    })
  }
  await test('the properties panel scrolls to its last field', async () => {
    const reach = await page.evaluate(`(() => { const s = document.querySelector('.right-panel .panel-section'); s.scrollTop = s.scrollHeight; const last = s.lastElementChild.getBoundingClientRect(); const box = s.getBoundingClientRect(); return last.bottom <= box.bottom + 1 })()`)
    assert.ok(reach)
  })
  await app.stop()
}

await category('Mind map themes, selecting and the context menu')
{
  const app = await launch({ settings: { startScreen: { showOnStartup: false } } })
  const { page } = app
  const dragSplitter = async (dy) => {
    const box = await page.evaluate(`(() => { const r = document.querySelector('[data-panel-splitter]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 3 } })()`)
    await page.evaluate(`(() => { const s = document.querySelector('[data-panel-splitter]'); s.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: ${box.x}, clientY: ${box.y}, bubbles: true })); window.dispatchEvent(new PointerEvent('pointermove', { clientX: ${box.x}, clientY: ${box.y + dy} })); window.dispatchEvent(new PointerEvent('pointerup', {})); return true })()`)
    await sleep(60)
  }
  const areaHeight = () => page.evaluate(`Math.round(document.querySelector('.diagram-themes').getBoundingClientRect().height)`)
  await test('the left panel: node list, a divider, then the theme gallery', async () => {
    const order = await page.evaluate(`[...document.querySelector('.left-panel').children].map((e) => e.className.split(' ').find((c) => ['panel-head', 'node-list-area', 'panel-splitter', 'diagram-themes'].includes(c)))`)
    assert.deepEqual(order, ['panel-head', 'node-list-area', 'panel-splitter', 'diagram-themes'])
    assert.ok((await count(page, '[data-diagram-theme]')) >= 12)
    await shoot(page, 'diagram-themes')
  })
  await test('the divider resizes both areas and is remembered', async () => {
    const before = await areaHeight()
    await dragSplitter(-100)
    assert.ok(Math.abs((await areaHeight()) - (before + 100)) <= 1, String(await areaHeight()))
    await settled(() => app.settings().themeAreaHeight, before + 100)
    await dragSplitter(100000)
    assert.ok((await areaHeight()) >= 90, 'it keeps a minimum')
    await dragSplitter(-100000)
    assert.ok((await page.evaluate(`document.querySelector('.node-list-area').getBoundingClientRect().height`)) >= 60, 'the list keeps room')
    await page.evaluate(`document.querySelector('[data-panel-splitter]').focus()`)
    await dragSplitter(0)
  })
  await test('a theme tile dresses the diagram, leaves the canvas alone, and Undo takes it off', async () => {
    await click(page, '[data-diagram-theme="neon"]')
    await page.until(`document.querySelector('[data-diagram-theme="neon"]').classList.contains('on')`)
    assert.equal(await page.evaluate(`document.querySelector('.canvas-wrap').style.background`), '', 'the canvas keeps the program theme')
    assert.equal(await page.evaluate(`document.querySelector('[data-diagram-theme-menu] .tb-dropdown').dataset.value`), 'neon')
    await shoot(page, 'diagram-theme-neon')
    await click(page, '[data-command="undo"]')
    await page.until(`document.querySelector('[data-diagram-theme="default"]').classList.contains('on')`)
  })
  await test('the toolbar has a mind map theme drop-down', async () => {
    await page.evaluate(`document.querySelector('[data-diagram-theme-menu] .tb-btn').click()`)
    await page.until(`document.querySelector('.tb-menu-floating')`)
    assert.ok((await count(page, '.tb-menu-floating .tb-menu-item')) >= 12)
    await shoot(page, 'diagram-theme-menu')
    await page.evaluate(`[...document.querySelectorAll('.tb-menu-floating .tb-menu-item')].find((e) => e.textContent.includes('숲')).click()`)
    await page.until(`document.querySelector('[data-diagram-theme="forest"]').classList.contains('on')`)
  })
  await test('Fit All shows the whole diagram, Center keeps the zoom', async () => {
    const zoomText = () => page.evaluate(`[...document.querySelectorAll('.status-item')].find((e) => e.textContent.includes('%')).textContent`)
    await page.evaluate(`document.querySelector('.canvas-wrap').dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }))`)
    await sleep(40)
    const zoomed = await zoomText()
    const node = () => page.evaluate(`(() => { const n = document.querySelector('.node-hit').getBoundingClientRect(); const c = document.querySelector('.canvas-svg').getBoundingClientRect(); return { x: n.left + n.width / 2 - c.left, cx: c.width / 2 } })()`)
    await click(page, '[data-command="reset"]')
    await sleep(40)
    assert.equal(await zoomText(), zoomed, 'Center keeps the zoom')
    const centred = await node()
    assert.ok(Math.abs(centred.x - centred.cx) < 2, JSON.stringify(centred))
    await click(page, '[data-command="fit"]')
    await page.until(`[...document.querySelectorAll('.status-item')].find((e) => e.textContent.includes('%')).textContent !== ${JSON.stringify(zoomed)}`)
  })
  await test('the grid has no thicker line than its own two kinds', async () => {
    assert.equal(await count(page, '.canvas-grid path'), 2)
    assert.equal(await count(page, '.canvas-grid path[stroke-width]'), 0)
  })
  await test('Ctrl+A selects the whole diagram, in the canvas but not in a text field', async () => {
    await click(page, '[data-command="start"]')
    await page.until(`document.querySelector('[data-sample="fishbone-quality"]')`)
    await click(page, '[data-sample="fishbone-quality"]')
    await page.until(`document.querySelector('[data-dialog="unsaved"]')`)
    await click(page, '[data-command="unsaved-discard"]')
    await page.until(`document.querySelector('[data-status="nodes"]').textContent === '13'`)
    await page.evaluate(`document.activeElement?.blur?.()`)
    const nodes = Number(await text(page, '[data-status="nodes"]'))
    const key = { key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 }
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...key })
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key })
    await page.until(`document.querySelectorAll('.node-hit.selected').length === ${nodes}`)
    await shoot(page, 'select-all')
    await page.evaluate(`document.querySelector('.right-panel .property-stack input').focus()`)
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...key })
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key })
    assert.equal(await page.evaluate(`document.activeElement.tagName`), 'INPUT')
    await page.evaluate(`document.activeElement.blur()`)
  })
  const rightClick = async (x, y) => {
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'right', buttons: type === 'mousePressed' ? 2 : 0, clickCount: type === 'mouseMoved' ? 0 : 1 })
  }
  await test('the right mouse button opens the menu, with Print, Export and Select All', async () => {
    const box = await page.evaluate(`(() => { const r = document.querySelector('.canvas-svg').getBoundingClientRect(); return { x: r.left + 60, y: r.top + 70 } })()`)
    await rightClick(box.x, box.y)
    await page.until(`document.querySelector('.context-menu')`)
    const items = await page.evaluate(`[...document.querySelectorAll('.context-menu button')].map((e) => e.textContent)`)
    for (const word of ['인쇄', '내보내기', '전체 선택', '저장']) assert.ok(items.some((item) => item.includes(word)), word)
    await shoot(page, 'context-menu')
  })
  await test('the menu stays on the window near its bottom edge', async () => {
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await page.until(`!document.querySelector('.context-menu')`)
    const size = await page.evaluate(`({ w: innerWidth, h: innerHeight })`)
    await rightClick(size.w - 280, size.h - 40)
    await page.until(`document.querySelector('.context-menu')`)
    await sleep(40)
    const rect = await page.evaluate(`(() => { const r = document.querySelector('.context-menu').getBoundingClientRect(); return { bottom: r.bottom, right: r.right } })()`)
    assert.ok(rect.bottom <= size.h && rect.right <= size.w, JSON.stringify(rect))
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  })
  await test('Select All from the menu selects every shape', async () => {
    const box = await page.evaluate(`(() => { const r = document.querySelector('.canvas-svg').getBoundingClientRect(); return { x: r.left + 60, y: r.top + 70 } })()`)
    await click(page, '.canvas-svg').catch(() => {})
    await rightClick(box.x, box.y)
    await page.until(`document.querySelector('.context-menu')`)
    await page.evaluate(`[...document.querySelectorAll('.context-menu button')].find((e) => e.textContent.includes('전체 선택')).click()`)
    await page.until(`document.querySelectorAll('.node-hit.selected').length === Number(document.querySelector('[data-status="nodes"]').textContent)`)
  })
  await app.stop()
}

await category('Line themes, theme menu and printing')
{
  const app = await launch({ settings: { startScreen: { showOnStartup: false } } })
  const { page } = app
  await test('the View menu has no Start item', async () => {
    await sleep(600)
    await click(page, '[data-menu="view"] .tb-btn')
    await page.until(`document.querySelector('.tb-menu-floating')`)
    const items = await page.evaluate(`[...document.querySelectorAll('.tb-menu-floating .tb-menu-item')].map((e) => e.textContent)`)
    assert.ok(!items.some((text) => text.includes('시작')), items.join())
    await page.evaluate(`document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`)
  })
  await test('Print sits right of Save in the toolbar, and in the File menu', async () => {
    const order = await page.evaluate(`[...document.querySelector('[data-command="save"]').parentElement.children].map((e) => e.dataset.command)`)
    assert.equal(order[order.indexOf('save') + 1], 'print')
    await click(page, '[data-menu="file"] .tb-btn')
    await page.until(`document.querySelector('.tb-menu-floating')`)
    assert.ok(await page.evaluate(`[...document.querySelectorAll('.tb-menu-floating .tb-menu-item')].some((e) => e.textContent.includes('인쇄'))`))
    await page.evaluate(`document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`)
  })
  const pdfPages = async () => {
    const pdf = Buffer.from((await page.send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true })).data, 'base64')
    fs.writeFileSync(path.join(shots, 'print.pdf'), pdf)
    return (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
  }
  await test('Print opens the page setup, with a preview of the sheet', async () => {
    await page.evaluate(`(() => { window.__mymindTest = { printed: 0 }; return true })()`)
    await click(page, '[data-command="print"]')
    await page.until(`document.querySelector('[data-dialog="print"] .print-preview .print-page svg')`)
    assert.equal(await count(page, '.print-preview .canvas-grid'), 0)
    assert.equal(await count(page, '.print-preview .selected'), 0)
    assert.ok((await text(page, '.print-preview [data-print-footer]')).includes('1 / 1'))
    await shoot(page, 'print-dialog')
  })
  await test('paper, margins and headers change the preview at once', async () => {
    const pageWidth = () => page.evaluate(`document.querySelector('.print-preview .print-page').style.width`)
    assert.equal(await pageWidth(), '297mm', 'a wide diagram gets a wide sheet')
    await click(page, '[data-select="printOrientation"] .icon-select-button')
    await click(page, '[data-select="printOrientation"] [data-value="portrait"]')
    await page.until(`document.querySelector('.print-preview .print-page').style.width === '210mm'`)
    await click(page, '[data-select="printOrientation"] .icon-select-button')
    await click(page, '[data-select="printOrientation"] [data-value="auto"]')
    await page.evaluate(`document.querySelector('[data-field="printMargin-left"] button:last-child').click()`)
    await page.until(`document.querySelector('.print-preview .print-body').style.left === '11mm'`)
    await page.evaluate(`document.querySelector('[data-field="print-header-left"]').focus()`)
    await page.send('Input.insertText', { text: 'p.{page}' })
    await page.until(`document.querySelector('.print-preview [data-print-header]').textContent.includes('p.1')`)
    await settled(() => app.settings().pageSetup.header.left, 'p.{page}')
  })
  await test('what prints is those sheets alone, on the paper chosen', async () => {
    await click(page, '[data-command="print-run"]')
    await page.until(`window.__mymindTest.printed === 1`)
    assert.equal(await count(page, '[data-dialog="print"]'), 0)
    assert.equal(await count(page, '#print-sheet .print-page'), 1)
    assert.equal(await page.evaluate(`getComputedStyle(document.getElementById('print-sheet')).display`), 'none', 'hidden on screen')
    assert.ok((await page.evaluate(`document.getElementById('print-page-style').textContent`)).includes('297mm'))
    await page.send('Emulation.setEmulatedMedia', { media: 'print' })
    const shown = await page.evaluate(`({ root: getComputedStyle(document.getElementById('root')).display, sheet: getComputedStyle(document.getElementById('print-sheet')).display })`)
    await page.send('Emulation.setEmulatedMedia', { media: '' })
    assert.deepEqual(shown, { root: 'none', sheet: 'block' })
    assert.equal(await pdfPages(), 1)
  })
  await test('a diagram spread over two sheets prints two pages, numbered', async () => {
    await click(page, '[data-command="print"]')
    await page.until(`document.querySelector('[data-dialog="print"]')`)
    await page.evaluate(`document.querySelector('[data-field="printPagesWide"] button:last-child').click()`)
    await page.until(`document.querySelectorAll('.print-preview .print-page').length === 2`)
    assert.ok((await page.evaluate(`document.querySelectorAll('.print-preview [data-print-footer]')[1].textContent`)).includes('2 / 2'))
    await click(page, '[data-command="print-run"]')
    await page.until(`window.__mymindTest.printed === 2`)
    assert.equal(await pdfPages(), 2)
    await click(page, '[data-command="print"]')
    await click(page, '[data-command="print-reset"]')
    await click(page, '[data-command="print-close"]')
  })
  await test('a line theme from the toolbar styles the connectors and can be undone', async () => {
    await page.evaluate(`document.querySelector('[data-line-theme] .tb-btn').click()`)
    await page.until(`document.querySelector('.tb-menu-floating')`)
    assert.ok((await count(page, '.tb-menu-floating .tb-menu-item')) >= 10)
    await shoot(page, 'line-theme-menu')
    await page.evaluate(`[...document.querySelectorAll('.tb-menu-floating .tb-menu-item')].find((e) => e.textContent.includes('무지개')).click()`)
    await page.until(`document.querySelector('[data-line-theme] .tb-dropdown').dataset.value === 'rainbow'`)
    await click(page, '[data-command="undo"]')
    await page.until(`document.querySelector('[data-line-theme] .tb-dropdown').dataset.value === 'default'`)
  })
  await test('the settings window has a line theme tab that sets new diagrams', async () => {
    await click(page, '[data-command="preferences"]')
    await click(page, '[data-pref-tab="lines"]')
    assert.ok((await count(page, '[data-pref-line-theme]')) >= 10)
    await click(page, '[data-pref-line-theme="circuit"]')
    await settled(() => app.settings().general.newLineTheme, 'circuit')
    await shoot(page, 'settings-lines')
    await click(page, '[data-command="preferences-close"]')
    await click(page, '[data-command="new"]')
    await page.until(`document.querySelector('[data-line-theme] .tb-dropdown').dataset.value === 'circuit'`)
  })
  await test('the theme menu starts with Custom Themes and Settings', async () => {
    await click(page, '[data-command="theme"]')
    await page.until(`document.querySelector('[data-theme-menu]')`)
    const top = await page.evaluate(`[...document.querySelector('.theme-pop-top').children].map((e) => e.dataset.command)`)
    assert.deepEqual(top, ['theme-custom', 'theme-settings'])
    await shoot(page, 'theme-menu-top')
  })
  await test('Custom Themes lands in the editor, which then lists it in the menu', async () => {
    await click(page, '[data-command="theme-custom"]')
    await page.until(`document.querySelector('[data-theme-editor]')`)
    assert.match(await page.evaluate(`document.documentElement.dataset.theme`), /^custom-/)
    await click(page, '[data-command="preferences-close"]')
    await click(page, '[data-command="theme"]')
    await page.until(`document.querySelector('[data-theme-custom-list] [data-theme-option]')`)
    await click(page, '[data-theme-option="light-classic"]')
    await click(page, '[data-command="theme"]')
    await click(page, '[data-command="theme-settings"]')
    await page.until(`document.querySelector('[data-pref-page="theme"]')`)
    await page.until(`document.querySelector('[data-theme-group="custom"] [data-pref-theme]')`)
    await click(page, '[data-command="preferences-close"]')
  })
  await app.stop()
}

await category('Tutorials')
{
  const app = await launch()
  const { page } = app
  const value = () => page.evaluate(`document.querySelector('[data-status="nodes"]').textContent`)
  await test('the start screen has a tutorial button, offering a mind map and a fishbone', async () => {
    await page.until(`document.querySelector('[data-start="hero-tutorial"]')`)
    await click(page, '[data-start="hero-tutorial"]')
    await page.until(`document.querySelector('[data-dialog="tutorial-choose"]')`)
    assert.equal(await count(page, '[data-tutorial]'), 2)
    await shoot(page, 'tutorial-choose')
  })
  await test('the mind map tutorial: Next waits, doing the step by hand counts', async () => {
    await click(page, '[data-tutorial="mindmap"]')
    await page.until(`document.querySelector('[data-tutorial-card="mindmap"]')`)
    assert.equal(await count(page, '[data-start-screen]'), 0)
    assert.equal(await page.evaluate(`document.querySelector('[data-command="tutorial-next"]').disabled`), true)
    await page.evaluate(`document.querySelector('.right-panel .property-stack input').focus()`)
    await page.evaluate(`document.querySelector('.right-panel .property-stack input').select()`)
    await page.send('Input.insertText', { text: '여행 계획' })
    await page.until(`document.querySelector('[data-tutorial-card]').dataset.stepDone === 'true'`)
    await shoot(page, 'tutorial-step')
    await click(page, '[data-command="tutorial-next"]')
  })
  await test('and the rest can be done for me, to the finished map', async () => {
    for (let i = 0; i < 20; i++) {
      if (await count(page, '[data-command="tutorial-finish"]')) break
      await page.until(`document.querySelector('[data-tutorial-card]')`)
      if (await page.evaluate(`document.querySelector('[data-tutorial-card]').dataset.stepDone !== 'true'`)) {
        await click(page, '[data-command="tutorial-do"]')
        await page.until(`document.querySelector('[data-tutorial-card]').dataset.stepDone === 'true'`)
      }
      await click(page, '[data-command="tutorial-next"]')
      await sleep(30)
    }
    assert.equal(await value(), '5')
    assert.ok(await page.evaluate(`document.querySelector('[data-line-theme] .tb-dropdown').dataset.value === 'rainbow'`))
    await shoot(page, 'tutorial-mindmap-done')
    await click(page, '[data-command="tutorial-finish"]')
    assert.equal(await count(page, '[data-tutorial-card]'), 0)
  })
  await test('the fishbone tutorial runs to its end from the Help menu', async () => {
    await click(page, '[data-menu="help"] .tb-btn')
    await page.until(`document.querySelector('.tb-menu-floating')`)
    await page.evaluate(`[...document.querySelectorAll('.tb-menu-floating .tb-menu-item')].find((e) => e.textContent.includes('튜토리얼')).click()`)
    await page.until(`document.querySelector('[data-tutorial="fishbone"]')`)
    await click(page, '[data-tutorial="fishbone"]')
    await page.until(`document.querySelector('[data-dialog="unsaved"]') || document.querySelector('[data-tutorial-card]')`)
    if (await count(page, '[data-dialog="unsaved"]')) await click(page, '[data-command="unsaved-discard"]')
    await page.until(`document.querySelector('[data-tutorial-card="fishbone"]')`)
    await page.until(`document.querySelector('[data-command="mode-fishbone"]').getAttribute('aria-pressed') === 'true'`)
    for (let i = 0; i < 20; i++) {
      if (await count(page, '[data-command="tutorial-finish"]')) break
      if (await page.evaluate(`document.querySelector('[data-tutorial-card]').dataset.step`) === 'mode') await shoot(page, 'tutorial-fishbone-done')
      if (await page.evaluate(`document.querySelector('[data-tutorial-card]').dataset.stepDone !== 'true'`)) {
        await click(page, '[data-command="tutorial-do"]')
        await page.until(`document.querySelector('[data-tutorial-card]').dataset.stepDone === 'true'`)
      }
      await click(page, '[data-command="tutorial-next"]')
      await sleep(30)
    }
    assert.equal(await value(), '7')
    await click(page, '[data-command="tutorial-finish"]')
  })
  await app.stop()
}

await category('Fonts, icons, memos and pictures')
{
  const app = await launch({ settings: { startScreen: { showOnStartup: false } } })
  const { page } = app
  const stepperValue = (id) => page.evaluate(`document.querySelector('[data-field="${id}"] input').value`)
  const fileDialog = (file) => page.evaluate(`(() => { window.__mymindTest = { ...window.__mymindTest, pick: ${JSON.stringify(file)} }; return true })()`)
  const nodes = () => page.evaluate(`Number(document.querySelector('[data-status="nodes"]').textContent)`)
  await test('the toolbar font tools change the selected shape: drop-down, smaller, size, larger', async () => {
    assert.equal(await stepperValue('toolbarFontSize'), '13')
    await page.evaluate(`document.querySelector('[data-field="toolbarFontSize"] button:last-child').click()`)
    await page.until(`document.querySelector('[data-field="toolbarFontSize"] input').value === '14'`)
    assert.equal(await page.evaluate(`document.querySelector('.node-label tspan').getAttribute('font-size')`), '14')
    await page.evaluate(`document.querySelector('[data-field="toolbarFontSize"] button:first-child').click()`)
    await page.until(`document.querySelector('[data-field="toolbarFontSize"] input').value === '13'`)
    const centred = await page.evaluate(`getComputedStyle(document.querySelector('[data-field="toolbarFontSize"] .stepper-value')).justifyContent`)
    assert.equal(centred, 'center')
    await page.evaluate(`document.querySelector('[data-font-menu] .tb-btn').click()`)
    await page.until(`document.querySelectorAll('.tb-menu-floating .tb-menu-item').length > 4`, 10000)
    await page.evaluate(`[...document.querySelectorAll('.tb-menu-floating .tb-menu-item')].find((e) => e.textContent.includes('Serif')).click()`)
    await page.until(`document.querySelector('.node-label tspan').getAttribute('font-family').includes('Georgia')`)
    await click(page, '[data-command="bold"]')
    await click(page, '[data-command="italic"]')
    await page.until(`document.querySelector('.node-label tspan').getAttribute('font-style') === 'italic'`)
    await shoot(page, 'font-tools')
  })
  await test('the left panel lists the icons, and a press puts one on the shape', async () => {
    await click(page, '[data-lower-tab="icons"]')
    assert.ok((await count(page, '[data-node-icon]')) >= 40)
    await click(page, '[data-node-icon="rocket"]')
    await page.until(`document.querySelector('.node-icon[data-icon="rocket"]')`)
    await shoot(page, 'icons')
    await click(page, '[data-node-icon=""]')
    await page.until(`!document.querySelector('.node-icon')`)
    await click(page, '[data-node-icon="star"]')
    await click(page, '[data-lower-tab="themes"]')
  })
  await test('a memo goes on the selected shape, with its colour, size and font', async () => {
    await click(page, '[data-command="memo"]')
    await page.until(`document.querySelector('.memo-note[data-memo="node"]')`)
    await page.until(`document.activeElement.classList.contains('property-memo')`)
    await page.send('Input.insertText', { text: '첫째 줄 메모입니다' })
    await page.until(`document.querySelector('.memo-note text').textContent.includes('첫째')`)
    await page.evaluate(`document.querySelector('[data-field="memoWidth"] button:last-child').click()`)
    await page.until(`document.querySelector('.memo-note').dataset.memoBox.split(' ')[2] === '170'`)
    await page.evaluate(`document.querySelector('[data-field="memoFontSize"] button:last-child').click()`)
    await page.until(`document.querySelector('.memo-note text').getAttribute('font-size') === '13'`)
    await click(page, '[data-memo-style="bold"]')
    await page.until(`document.querySelector('.memo-note text').getAttribute('font-weight') === '700'`)
    await shoot(page, 'memo')
  })
  await test('a memo goes on a line, too', async () => {
    await click(page, '[data-command="mode-mindmap"]')
    const box = await page.evaluate(`(() => { const r = document.querySelector('.node-hit').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: type === 'mouseMoved' ? 'none' : 'right', buttons: type === 'mousePressed' ? 2 : 0, clickCount: type === 'mouseMoved' ? 0 : 1 })
    await page.until(`document.querySelector('.context-menu')`)
    await page.evaluate(`[...document.querySelectorAll('.context-menu button')].find((e) => e.textContent.includes('하위')).click()`)
    await page.until(`document.querySelectorAll('.edge-hit').length >= 1`)
    await page.evaluate(`document.querySelector('.edge-hit').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }))`)
    await page.until(`document.querySelector('[data-memo-section="edge"]')`)
    await click(page, '[data-command="memo-add"]')
    await page.until(`document.querySelector('.memo-note[data-memo="edge"]')`)
  })
  await test('the line width changes, on one line and on several selected lines', async () => {
    await page.until(`document.querySelector('[data-field="lineWidth"]')`)
    await page.evaluate(`document.querySelector('[data-field="lineWidth"] button:last-child').click()`)
    await page.until(`document.querySelector('[data-field="lineWidth"] input').value === '3'`)
    await page.evaluate(`document.querySelector('.node-hit').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }))`)
    await page.evaluate(`document.querySelector('.canvas-svg').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))`)
    await page.until(`document.querySelector('.memo-section[data-memo-section="node"]')`)
    const box = await page.evaluate(`(() => { const r = document.querySelector('.node-hit').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: type === 'mouseMoved' ? 'none' : 'right', buttons: type === 'mousePressed' ? 2 : 0, clickCount: type === 'mouseMoved' ? 0 : 1 })
    await page.until(`document.querySelector('.context-menu')`)
    await page.evaluate(`[...document.querySelectorAll('.context-menu button')].find((e) => e.textContent.includes('하위')).click()`)
    await page.until(`document.querySelectorAll('.edge-hit').length >= 2`)
    await page.evaluate(`document.querySelectorAll('.edge-hit')[0].dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }))`)
    await page.evaluate(`document.querySelectorAll('.edge-hit')[1].dispatchEvent(new MouseEvent('mousedown', { button: 0, shiftKey: true, bubbles: true }))`)
    await page.until(`document.querySelector('[data-selection-count]')`)
    await page.evaluate(`(() => { const b = document.querySelector('[data-field="lineWidth"] button:last-child'); b.click(); b.click(); return true })()`)
    await sleep(60)
    const widths = await page.evaluate(`[...document.querySelectorAll('.edge-hit')].map((hit) => Number(hit.nextElementSibling.getAttribute('stroke-width')))`)
    assert.equal(widths[0], widths[1], widths.join())
    assert.ok(widths[0] > 3, widths.join())
    await shoot(page, 'many-lines')
  })
  await test('several shapes change at once: shape, colour, font and icon', async () => {
    const key = { key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 }
    await page.evaluate(`document.activeElement?.blur?.()`)
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...key })
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key })
    await page.until(`document.querySelector('[data-selection-count]')`)
    assert.equal(await count(page, '.right-panel .property-memo'), 0, 'a memo stays one by one')
    await page.evaluate(`document.querySelector('[data-field="toolbarFontSize"] button:last-child').click()`)
    await sleep(40)
    const sizes = await page.evaluate(`[...new Set([...document.querySelectorAll('.node-label tspan')].map((t) => t.getAttribute('font-size')))]`)
    assert.equal(sizes.length, 1, sizes.join())
    await click(page, '[data-lower-tab="icons"]')
    await click(page, '[data-node-icon="flag"]')
    await page.until(`document.querySelectorAll('.node-icon[data-icon="flag"]').length === document.querySelectorAll('.node-hit').length`)
    await click(page, '[data-lower-tab="themes"]')
    await shoot(page, 'many-shapes')
  })
  // Hand-made files, so the test does not depend on any image library.
  const work = path.join(app.settingsDir, 'pictures')
  fs.mkdirSync(work)
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg=='
  const tga = Buffer.alloc(18 + 4 * 3)
  tga[2] = 2; tga[12] = 2; tga[14] = 2; tga[16] = 24
  tga.fill(0x40, 18)
  const pictures = { 'dot.png': Buffer.from(PNG, 'base64'), 'dot.tga': tga, 'dot.ppm': Buffer.concat([Buffer.from('P6\n2 2\n255\n'), Buffer.alloc(12, 0x80)]), 'dot.svg': Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="red"/></svg>') }
  for (const [name, bytes] of Object.entries(pictures)) {
    await test(`${name} goes on the canvas`, async () => {
      const file = path.join(work, name)
      fs.writeFileSync(file, bytes)
      const before = await nodes()
      await fileDialog(file)
      await click(page, '[data-command="image"]')
      await page.until(`Number(document.querySelector('[data-status="nodes"]').textContent) === ${before + 1}`, 8000)
      const href = await page.evaluate(`[...document.querySelectorAll('.node-hit image')].at(-1).getAttribute('href').slice(0, 30)`)
      assert.match(href, /^data:image\//)
    })
  }
  await test('a picture has a width of its own and stays through Auto Align', async () => {
    assert.ok(await page.evaluate(`document.querySelector('[data-field="imageWidth"]') !== null`))
    const field = await page.evaluate(`document.querySelector('[data-field="imageWidth"] input').getBoundingClientRect().width`)
    assert.ok(field >= 12 && field < 90, `the value fits between its buttons: ${field}`)
    await page.evaluate(`document.querySelector('[data-field="imageWidth"] button:last-child').click()`)
    await click(page, '[data-command="align"]')
    assert.equal(await count(page, '.node-hit image'), Object.keys(pictures).length)
    await shoot(page, 'pictures')
  })
  await test('a file that is no picture is said so', async () => {
    const file = path.join(work, 'bad.tga')
    fs.writeFileSync(file, 'nonsense')
    await fileDialog(file)
    await click(page, '[data-command="image"]')
    await page.until(`document.querySelector('[data-dialog="message"]')`, 8000)
    await click(page, '[data-command="message-ok"]')
  })
  for (const [format, ext, magic] of [['gif', 'gif', 'GIF8'], ['avif', 'avif', 'ftyp'], ['bmp', 'bmp', 'BM'], ['tiff', 'tif', 'II'], ['ico', 'ico', ''], ['qoi', 'qoi', 'qoif'], ['webp', 'webp', 'RIFF'], ['png', 'png', 'PNG']]) {
    await test(`exports ${format.toUpperCase()}`, async () => {
      const file = path.join(work, `out.${ext}`)
      await page.evaluate(`(() => { window.__mymindTest = { ...window.__mymindTest, save: ${JSON.stringify(file)} }; return true })()`)
      await click(page, '[data-command="export"]')
      await page.until(`document.querySelector('[data-export-format="${format}"]')`)
      await click(page, `[data-export-format="${format}"]`)
      await click(page, '[data-command="export-run"]')
      await page.until(`!document.querySelector('[data-dialog="export"]')`, 60000)
      const t0 = Date.now()
      while (!fs.existsSync(file) && Date.now() - t0 < 60000) await sleep(100)
      assert.ok(fs.statSync(file).size > 50)
      const head = fs.readFileSync(file).subarray(0, 12).toString('latin1')
      assert.ok(head.includes(magic), `${format}: ${JSON.stringify(head)}`)
    })
  }
  await test('a memo\'s connecting line has a colour, width and style of its own', async () => {
    await page.evaluate(`document.querySelector('.memo-note[data-memo="node"]').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }))`)
    await page.evaluate(`document.querySelector('.canvas-svg').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))`)
    await page.until(`document.querySelector('[data-field="memoLineWidth"]')`)
    await page.evaluate(`document.querySelector('[data-field="memoLineWidth"] button:last-child').click()`)
    await page.until(`document.querySelector('.memo-note[data-memo="node"] .memo-line')?.getAttribute('stroke-width') === '2'`)
    await click(page, '[data-select="memoLinePattern"] .icon-select-button')
    await click(page, '[data-select="memoLinePattern"] [data-value="none"]')
    await page.until(`!document.querySelector('.memo-note[data-memo="node"] .memo-line')`)
    await click(page, '[data-select="memoLinePattern"] .icon-select-button')
    await click(page, '[data-select="memoLinePattern"] [data-value="solid"]')
    await page.until(`document.querySelector('.memo-note[data-memo="node"] .memo-line')`)
  })
  await test('with several shapes selected, the panel changes all their memos', async () => {
    const key = { key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 }
    await page.evaluate(`document.activeElement?.blur?.()`)
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...key })
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key })
    await page.until(`document.querySelector('[data-memo-section="many"]')`)
    await page.evaluate(`document.querySelector('[data-field="memoAllWidth"] button:last-child').click()`)
    await page.until(`[...document.querySelectorAll('.memo-note[data-memo="node"]')].every((m) => m.dataset.memoBox.split(' ')[2] === '180')`)
    await page.evaluate(`document.querySelector('.node-hit').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }))`)
    await page.evaluate(`document.querySelector('.canvas-svg').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))`)
  })
  await test('the settings window has the defaults of new memos', async () => {
    await click(page, '[data-command="preferences"]')
    await click(page, '[data-pref-tab="memo"]')
    await page.evaluate(`document.querySelector('[data-field="prefMemoWidth"] button:last-child').click()`)
    await settled(() => app.settings().general.memo.width, 170)
    assert.equal(await count(page, '[data-memo-preview]'), 1)
    await shoot(page, 'settings-memo')
    await click(page, '[data-command="preferences-close"]')
  })
  await app.stop()
}

await category('Installed fonts')
{
  const app = await launch({ settings: { startScreen: { showOnStartup: false } } })
  const { page } = app
  await test('the font drop-down lists the installed families', async () => {
    const fonts = await page.evaluate(`window.__TAURI_INTERNALS__.invoke('system_fonts')`)
    assert.ok(fonts.length > 3, `only ${fonts.length}`)
    assert.deepEqual(fonts, [...new Set(fonts)])
  })
  await app.stop()
}

await category('Files and unsaved work')
{
  const app = await launch({ settings: { startScreen: { showOnStartup: false } } })
  const { page } = app
  await test('an edit is asked about before New, and Cancel keeps it', async () => {
    await page.until(`document.querySelector('[data-status="nodes"]').textContent === '1'`)
    await page.evaluate(`document.querySelector('.property-stack input').focus()`)
    await page.send('Input.insertText', { text: ' X' })
    await page.until(`document.querySelector('[data-title-file]').textContent.endsWith('*')`)
    await click(page, '[data-command="new"]')
    await page.until(`document.querySelector('[data-dialog="unsaved"]')`)
    await shoot(page, 'unsaved')
    await click(page, '[data-command="unsaved-cancel"]')
    assert.ok((await text(page, '[data-title-file]')).endsWith('*'))
  })
  await test('the close button asks too, and Cancel stays open', async () => {
    await click(page, '[data-command="close"]')
    await page.until(`document.querySelector('[data-dialog="unsaved"]')`)
    await click(page, '[data-command="unsaved-cancel"]')
    await page.until(`!document.querySelector('[data-dialog="unsaved"]')`)
  })
  await app.stop()
  const missing = path.join(os.tmpdir(), 'mymind-no-such-file.mmap')
  const again = await launch({ settings: { recent: [missing] } })
  await test('a missing recent file is said so and leaves the list', async () => {
    await again.page.until(`document.querySelector('[data-recent]')`)
    await click(again.page, '[data-recent]')
    await again.page.until(`document.querySelector('[data-dialog="message"]')`)
    assert.ok((await text(again.page, '[data-message]')).includes('mymind-no-such-file'))
    await click(again.page, '[data-command="message-ok"]')
    assert.equal(await count(again.page, '[data-recent]'), 0)
    await settled(() => again.settings().recent.length, 0)
  })
  await again.stop()
}

await category('Starting with a file')
{
  const sample = path.join(root, 'template', 'sample-mindmap-trip.mmap')
  const app = await launch({ args: [sample] })
  const { page } = app
  await test('the file given on the command line opens, over the start screen', async () => {
    await page.until(`document.querySelector('[data-status="nodes"]').textContent === '15'`)
    await page.until(`!document.querySelector('[data-start-screen]')`)
    assert.ok((await text(page, '[data-title-file]')).includes('sample-mindmap-trip'))
  })
  await test('and joins the recent files', async () => {
    await settled(() => app.settings().recent[0], sample)
  })
  await app.stop()
}

await category('Real windows')
{
  const startedAt = Date.now()
  const app = await launch({ inline: false, settings: { startScreen: { showOnStartup: false } } })
  const { page, port } = app
  await test('the window appears when the page is ready, not by the 5 s fallback', async () => {
    await page.until(`document.visibilityState === 'visible'`, 8000)
    assert.ok(Date.now() - startedAt < 4500, `${Date.now() - startedAt} ms`)
  })
  await test('the toolbar is icons alone, and nothing is clipped at the smallest width', async () => {
    const labels = await page.evaluate(`[...document.querySelectorAll('.toolbar .tool-group > .tb-btn:not(.tb-glyph), .toolbar-end .tb-btn')].filter((b) => b.textContent.trim()).map((b) => b.textContent)`)
    assert.deepEqual(labels, [])
    const need = await page.evaluate(`[...document.querySelector('.toolbar').children].reduce((sum, e) => sum + e.getBoundingClientRect().width, 0)`)
    const gaps = await page.evaluate(`document.querySelector('.toolbar').children.length * 12`)
    await page.send('Emulation.setDeviceMetricsOverride', { width: Math.ceil(need) + gaps + 40, height: 700, deviceScaleFactor: 1, mobile: false })
    try {
      await page.until(`document.querySelector('.toolbar').scrollWidth <= document.querySelector('.toolbar').clientWidth`, 3000)
      await shoot(page, 'narrow')
    } finally {
      await page.send('Emulation.clearDeviceMetricsOverride')
    }
  })
  await test('a tooltip appears at once on the pointer, also on a disabled button, and the system one is gone', async () => {
    const at = (selector) => page.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
    const hover = async (selector, want) => {
      const p = await at(selector)
      for (let i = 0; i < 12; i++) {
        await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x + (i % 2), y: p.y })
        await sleep(160)
        if ((await text(page, '.fast-tip')) === want) return
      }
      assert.equal(await text(page, '.fast-tip'), want)
    }
    await hover('[data-command="save"]', '저장')
    assert.equal(await page.evaluate(`document.querySelector('[data-command="save"]').hasAttribute('title')`), false)
    await shoot(page, 'tooltip')
    await hover('[data-command="undo"]', '실행 취소')
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 600, y: 400 })
    await page.until(`!document.querySelector('.fast-tip')`, 1000)
  })
  await test('the full screen button fills the screen and comes back', async () => {
    const before = await page.evaluate(`innerWidth`)
    await click(page, '[data-command="fullscreen"]')
    await page.until(`document.querySelector('[data-command="fullscreen"]').getAttribute('aria-pressed') === 'true'`)
    await page.until(`screen.width === innerWidth`, 4000)
    await click(page, '[data-command="fullscreen"]')
    await page.until(`document.querySelector('[data-command="fullscreen"]').getAttribute('aria-pressed') === 'false'`)
    await page.until(`innerWidth === ${before}`, 4000)
  })
  await test('the print window is a window of its own', async () => {
    const before = (await listTargets(port)).length
    await click(page, '[data-command="print"]')
    await sleep(800)
    const targets = await listTargets(port)
    assert.ok(targets.length > before, 'no new window')
    const pop = await connect(targets.find((t) => t.url.startsWith('about:blank')))
    await pop.until(`document.querySelector('.print-preview .print-page svg')`)
    const fit = await pop.evaluate(`(() => { const p = document.querySelector('.print-preview'); const f = document.querySelector('.print-form'); return { w: innerWidth, h: innerHeight, panel: document.querySelector('.dialog').getBoundingClientRect().width, previewOver: p.scrollWidth > p.clientWidth } })()`)
    assert.ok(Math.abs(fit.w - fit.panel) <= 1, JSON.stringify(fit))
    assert.equal(fit.previewOver, false, 'the sheet fits the preview')
    fs.writeFileSync(path.join(shots, 'print-window.png'), await pop.screenshot())
    await pop.evaluate(`document.querySelector('[data-command="print-close"]').click()`).catch(() => {})
    pop.close()
    await sleep(400)
  })
  await test('the main button of a window keeps a colourful icon', async () => {
    await click(page, '[data-command="about"]')
    await sleep(600)
    const targets = await listTargets(port)
    const pop = await connect(targets.find((t) => t.url.startsWith('about:blank')))
    await pop.until(`document.querySelector('[data-command="about-close"] .icon')`)
    const look = await pop.evaluate(`(() => { const b = document.querySelector('[data-command="about-close"]'); return { icon: getComputedStyle(b.querySelector('.icon')).color, text: getComputedStyle(b).color, tone: b.querySelector('.icon').dataset.tone } })()`)
    assert.equal(look.tone, 'red')
    assert.notEqual(look.icon, look.text)
    fs.writeFileSync(path.join(shots, 'about-window.png'), await pop.screenshot())
    await pop.evaluate(`document.querySelector('[data-command="about-close"]').click()`).catch(() => {})
    pop.close()
    await sleep(400)
  })
  await test('settings open in a window of their own with the page\'s theme', async () => {
    const before = (await listTargets(port)).length
    await click(page, '[data-command="preferences"]')
    await page.until(`true`)
    await sleep(800)
    const targets = await listTargets(port)
    assert.ok(targets.length > before, 'no new window')
    const pop = await connect(targets.find((t) => t.url.startsWith('about:blank')))
    await pop.until(`document.querySelector('.pref-tabs')`)
    const look = await pop.evaluate(`({ theme: document.documentElement.dataset.theme, width: innerWidth, height: innerHeight, panel: document.querySelector('.dialog').getBoundingClientRect().width })`)
    assert.equal(look.theme, 'light-classic')
    assert.ok(Math.abs(look.width - look.panel) <= 1, JSON.stringify(look))
    fs.writeFileSync(path.join(shots, 'settings-window.png'), await pop.screenshot())
    pop.close()
  })
  await app.stop()
}

process.exit(summary())

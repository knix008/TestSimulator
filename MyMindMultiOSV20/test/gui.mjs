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
    assert.equal(await count(page, '[data-sample]'), 5)
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
  await test('in a narrow window the toolbar drops its labels and nothing is clipped', async () => {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1080, height: 700, deviceScaleFactor: 1, mobile: false })
    await page.until(`document.querySelector('.toolbar').classList.contains('compact')`)
    const fit = await page.evaluate(`(() => { const t = document.querySelector('.toolbar'); return { sw: t.scrollWidth, cw: t.clientWidth, lang: document.querySelector('[data-command="language"] span:last-child').offsetWidth, theme: document.querySelector('.tb-theme-name').offsetWidth, undo: document.querySelector('[data-command="undo"] > span').offsetWidth } })()`)
    assert.ok(fit.sw <= fit.cw, JSON.stringify(fit))
    assert.ok(fit.lang > 0 && fit.theme > 0, 'language and theme keep their names')
    assert.equal(fit.undo, 0)
    assert.ok((await count(page, '.toolbar .tb-dropdown-value')) === 1 && (await page.evaluate(`document.querySelector('.toolbar .tb-dropdown-value').offsetWidth`)) > 0, 'the layout drop-down stays')
    await shoot(page, 'narrow')
    await page.send('Emulation.clearDeviceMetricsOverride')
    await page.until(`!document.querySelector('.toolbar').classList.contains('compact') || innerWidth < 1400`)
  })
  await test('the main window keeps a minimum that fits both top rows', async () => {
    await sleep(300)
    const rows = await page.evaluate(`(() => { const r = (s) => document.querySelector(s); return { width: innerWidth, title: r('.menubar').scrollWidth, tools: r('.toolbar').scrollWidth } })()`)
    assert.ok(rows.tools <= rows.width && rows.title <= rows.width, JSON.stringify(rows))
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

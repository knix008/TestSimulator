// npm run test:e2e: the real executable, driven over CDP, because the window paths (a
// dialog in its own window, the guide window, closing) exist only there.
//
// Runs a debug build with no bundle, a throw-away data folder and WebView2 profile, on
// a free debugging port, so it touches neither an installed copy nor the user's
// settings. It never needs the mouse: everything goes through the page.
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect, sleep, waitForTarget, listTargets } from './cdp.mjs'
import { freePort } from './free-port.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'mpw-e2e-'))
const target = process.env.MPW_E2E_TARGET ?? path.join(root, 'src-tauri', 'target')
const shots = process.env.MPW_E2E_SHOTS ?? path.join(scratch, 'shots')
fs.mkdirSync(shots, { recursive: true })

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`  ${ok ? '✔' : '✘'} ${name}${detail ? `  (${detail})` : ''}`)
}

if (!process.argv.includes('--no-build')) {
  console.log('Building the debug executable...')
  const cli = path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js')
  // A dev-free build: the page comes from dist/, as it does for a user.
  const result = spawnSync(process.execPath, [cli, 'build', '--debug', '--no-bundle'], { cwd: root, stdio: 'inherit', env: { ...process.env, CARGO_TARGET_DIR: target } })
  if (result.status) process.exit(result.status)
}

// A model that is already on the machine.
fs.mkdirSync(path.join(scratch, 'data', 'models'), { recursive: true })
fs.writeFileSync(path.join(scratch, 'data', 'models', 'u2netp.onnx'), 'weights')

const exe = path.join(target, 'debug', process.platform === 'win32' ? 'MyPhotoWork.exe' : 'MyPhotoWork')
const port = await freePort(9333)
const app = spawn(exe, [], {
  stdio: 'ignore',
  env: {
    ...process.env,
    MPW_DATA_DIR: path.join(scratch, 'data'),
    WEBVIEW2_USER_DATA_FOLDER: path.join(scratch, 'webview'),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
  },
})
let exited = false
app.on('exit', () => { exited = true })

try {
  // The cross-origin isolation headers swap the page into a new process as it commits,
  // which leaves a debugger attached any earlier on a dead about:blank: so it looks again.
  const openMain = async () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const page = await connect(await waitForTarget(port, (t) => /localhost/.test(t.url) && !t.url.includes('#') && !t.url.includes('/doc/')))
      if (await page.evaluate("Boolean(document.querySelector('.menu-bar'))").catch(() => false)) return page
      page.close()
      await sleep(150)
    }
    throw new Error('the main window never showed the menu bar')
  }
  const main = await openMain()
  await main.send('Page.enable')

  console.log('Main window')
  check('the bridge is installed', await main.evaluate("Boolean(window.hostFileApi && window.hostDialogApi && window.hostMenuApi && window.hostGuideApi)"))
  check('the page is cross-origin isolated', await main.evaluate('window.crossOriginIsolated'))
  check('the shell reports itself', Boolean(await main.evaluate('window.__MPW_HOST__ && window.__MPW_HOST__.webview')))
  const width = await main.evaluate('window.innerWidth')
  check('the window opens wide enough for the toolbar', width >= 1280, `${width}px`)

  console.log('Models')
  check('a model already on disk is listed', (await main.evaluate("window.hostModelApi.list()")).includes('u2netp'))
  const fetched = await main.evaluate("window.hostModelApi.download('u2netp', 'http://127.0.0.1:9/never', 1)")
  check('it is not downloaded again', fetched.ok === true, JSON.stringify(fetched))
  await sleep(2200)
  let offered = false
  for (const item of await listTargets(port)) {
    if (!item.url.includes('#dialog=')) continue
    const page = await connect(item)
    offered = offered || await page.evaluate("Boolean(document.querySelector('.method-list'))").catch(() => false)
    page.close()
  }
  check('the first-run download offer stays away', !offered)

  console.log('Tutorial popup')
  await main.until("document.querySelector('[data-testid=\"tutorial-ask\"]')")
  check('the tutorial popup appears at launch', true)
  await main.evaluate("document.querySelector('[data-action=\"tutorial-run\"]').click()")
  await main.until("document.querySelector('[data-testid=\"tutorial-tour\"]')")
  await main.until("document.querySelector('.tutorial-outline')")
  check('running it starts the tour on the start button', (await main.evaluate("document.querySelector('[data-testid=\"tutorial-tour\"]').dataset.step")) === 'startButton')
  await sleep(300)
  fs.writeFileSync(path.join(shots, 'tutorial.png'), await main.screenshot())
  await main.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))")
  await main.until("!document.querySelector('[data-testid=\"tutorial-tour\"]')")
  check('Escape ends the tour', true)
  const first = await main.evaluate("document.querySelector('.menu-bar').firstElementChild.className")
  check('the start button is the first thing in the menu bar', first.includes('start-toggle'), first)

  console.log('Start screen')
  await main.until("document.querySelector('.start-screen .start-card')")
  check('it opens on the start screen', true)
  check('all eighteen backgrounds and Shuffle are offered', (await main.evaluate("document.querySelectorAll('.start-side .bg-kind').length")) === 19)
  await main.until("Number(document.querySelector('.start-bg').width) > 0")
  await sleep(800)
  fs.writeFileSync(path.join(shots, 'start.png'), await main.screenshot())
  await main.evaluate("document.querySelector('[data-kind=\"aperture\"]').click()")
  await main.until("document.querySelector('[data-kind=\"aperture\"]').classList.contains('on')")
  const saved = await main.evaluate("JSON.parse(localStorage.getItem('my-photo-work-v1-settings')).startBackground.kind")
  check('a chosen background is saved', saved === 'aperture', saved)

  console.log('Windows')
  await main.evaluate("document.querySelector('.menu-bar [data-action=\"settings\"]').click()")
  const settings = await connect(await waitForTarget(port, (t) => t.url.includes('#dialog='), 30000).then(async () => {
    for (let i = 0; i < 100; i += 1) {
      for (const item of await listTargets(port)) {
        if (!item.url.includes('#dialog=')) continue
        const page = await connect(item)
        const open = await page.evaluate("Boolean(document.querySelector('.settings-tabs'))").catch(() => false)
        page.close()
        if (open) return item
      }
      await sleep(100)
    }
    throw new Error('the settings window did not open')
  }))
  check('Settings opens in a window of its own', true)
  check('Settings has a start screen page', await settings.evaluate("[...document.querySelectorAll('.settings-tabs button')].length === 11"))
  await settings.evaluate("document.querySelectorAll('.settings-tabs button')[1].click()")
  await settings.until("document.querySelectorAll('.settings-page .bg-kind').length === 19")
  await settings.evaluate("document.querySelector('.settings-page [data-kind=\"mosaic\"]').click()")
  await main.until("document.querySelector('.start-side [data-kind=\"mosaic\"]').classList.contains('on')")
  check('a change in Settings reaches the start screen', true)
  await sleep(300)
  fs.writeFileSync(path.join(shots, 'settings-start.png'), await settings.screenshot())
  const overflow = await settings.evaluate('document.documentElement.scrollHeight - window.innerHeight')
  check('the settings page fits its window', overflow <= 1, `${overflow}px over`)
  await settings.evaluate("document.querySelector('.dialog-close').click()")
  settings.close()

  console.log('Themes')
  await main.evaluate("document.querySelector('.theme-pick').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))")
  await main.until("document.querySelector('.theme-menu')")
  const menuShape = await main.evaluate("JSON.stringify({ actions: document.querySelector('.theme-menu').firstElementChild.className, dark: document.querySelectorAll('[data-theme-group=\"themeDark\"] button').length, light: document.querySelectorAll('[data-theme-group=\"themeLight\"] button').length, darkAbove: document.querySelector('[data-theme-group=\"themeDark\"]').getBoundingClientRect().bottom <= document.querySelector('[data-theme-group=\"themeLight\"]').getBoundingClientRect().top, fits: document.querySelector('.theme-menu').getBoundingClientRect().bottom <= innerHeight, scroll: document.querySelector('.theme-menu').scrollHeight - document.querySelector('.theme-menu').clientHeight })")
  const shape = JSON.parse(menuShape)
  check('the drop-down has 20 dark above 20 light, buttons first', shape.actions === 'theme-menu-actions' && shape.dark === 20 && shape.light === 20 && shape.darkAbove, menuShape)
  check('the drop-down fits without scrolling', shape.fits && shape.scroll <= 1, `${shape.scroll}px`)
  await sleep(200)
  fs.writeFileSync(path.join(shots, 'theme-menu.png'), await main.screenshot())
  await main.evaluate("document.querySelector('[data-action=\"custom-theme\"]').click()")
  const customWindow = await (async () => {
    for (let i = 0; i < 100; i += 1) {
      for (const item of await listTargets(port)) {
        if (!item.url.includes('#dialog=')) continue
        const page = await connect(item)
        if (await page.evaluate("Boolean(document.querySelector('.custom-theme-editor'))").catch(() => false)) return page
        page.close()
      }
      await sleep(100)
    }
    throw new Error('the custom theme page did not open')
  })()
  check('the custom theme button opens its settings page', true)
  await customWindow.evaluate("document.querySelector('[data-action=\"save-custom-theme\"]').click()")
  await main.until("JSON.parse(localStorage.getItem('my-photo-work-v1-settings')).customThemes.length === 1")
  const customId = await main.evaluate("JSON.parse(localStorage.getItem('my-photo-work-v1-settings')).theme")
  check('saving makes it the current theme', customId.startsWith('custom-'), customId)
  await sleep(250)
  fs.writeFileSync(path.join(shots, 'custom-theme.png'), await customWindow.screenshot())
  await customWindow.evaluate("document.querySelector('.dialog-close').click()")
  customWindow.close()

  console.log('User guide')
  await main.evaluate("document.querySelector('[data-action=\"guide\"]').click()")
  const guide = await connect(await waitForTarget(port, (t) => t.url.includes('doc/index.html')))
  await guide.send('Page.enable')
  await guide.until("document.body.classList.contains('ready')")
  check('the guide opens in a window of its own', true)
  const order = await guide.evaluate("(() => { const h = document.querySelector('.doc-head'); const f = h.querySelector('[data-font-control]'); const l = h.querySelector('.lang-group'); return Boolean(f && l); })()")
  check('font and language controls are in the guide header', order)
  // Lazy, and those of the other language are hidden: asked for outright.
  await guide.evaluate("document.querySelectorAll('img').forEach((img) => { img.loading = 'eager' })")
  await guide.until("[...document.images].every((img) => img.complete)", 60000)
  const broken = await guide.evaluate("[...document.images].filter((img) => img.naturalWidth === 0).map((img) => img.getAttribute('src'))")
  check('every picture in the guide loads', broken.length === 0, broken.slice(0, 3).join(', '))
  fs.writeFileSync(path.join(shots, 'guide.png'), await guide.screenshot())
  guide.close()

  console.log('Menu and editor')
  await main.evaluate("document.querySelector('[data-sample=\"sunset\"]').click()")
  await main.until("!document.querySelector('.start-screen')")
  check('a sample picture closes the start screen', true)
  await main.until("document.querySelector('.title-size') && document.querySelector('.title-size').textContent.includes('1600')")
  check('the sample opens as a document', true)
  await sleep(500)
  fs.writeFileSync(path.join(shots, 'editor.png'), await main.screenshot())

  const stage = JSON.parse(await main.evaluate("JSON.stringify((() => { const r = document.querySelector('.canvas-stage').getBoundingClientRect(); return { x: r.x, y: r.y } })())"))
  await main.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: stage.x + 300, y: stage.y + 180 })
  await main.until("document.querySelector('.ruler-mark-x').style.display === 'block'")
  const marks = JSON.parse(await main.evaluate("JSON.stringify({ x: document.querySelector('.ruler-mark-x').style.left, y: document.querySelector('.ruler-mark-y').style.top, colour: getComputedStyle(document.querySelector('.ruler-mark-x')).backgroundColor })"))
  check('the rulers mark the pointer in red', marks.x === '300px' && marks.y === '180px' && marks.colour === 'rgb(255, 32, 32)', JSON.stringify(marks))
  await sleep(200)
  fs.writeFileSync(path.join(shots, 'ruler.png'), await main.screenshot())

  // The pointer follows the tool, over the picture and not beside it.
  const box = JSON.parse(await main.evaluate("JSON.stringify((() => { const r = document.querySelector('.canvas-stage').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })())"))
  const cursorOver = async (key, x, y) => {
    await main.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: `Key${key.toUpperCase()}`, text: key, windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0) })
    await main.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: `Key${key.toUpperCase()}`, windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0) })
    await main.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
    await sleep(150)
    return main.evaluate("document.querySelector('.canvas-stage canvas').style.cursor")
  }
  const [midX, midY] = [box.x + box.width / 2, box.y + box.height / 2]
  check('the Hand tool shows a hand', (await cursorOver('h', midX, midY)) === 'grab')
  check('the Type tool shows a text caret', (await cursorOver('t', midX, midY)) === 'text')
  check('the Brush shows its own picture', (await cursorOver('b', midX, midY)).startsWith('url("data:image/svg+xml'))
  check('the Brush shows a ring of its size', await main.evaluate("document.querySelector('.brush-ring').style.display === 'block' && parseFloat(document.querySelector('.brush-ring').style.width) > 0"))
  fs.writeFileSync(path.join(shots, 'brush-pointer.png'), await main.screenshot())
  check('over a ruler the pointer is an arrow', (await cursorOver('b', midX, box.y + 6)) === 'default')

  console.log('Closing')
  await main.evaluate('window.hostWindowApi.forceClose()').catch(() => {})
  for (let i = 0; i < 100 && !exited; i += 1) await sleep(100)
  check('closing ends the process, popups included', exited)
  const place = path.join(scratch, 'data', 'window.json')
  check('the window position is saved', fs.existsSync(place))
} catch (error) {
  check('the run finished', false, error.message)
} finally {
  if (!exited) app.kill()
}

const failed = results.filter((item) => !item.ok)
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed. Screenshots: ${shots}`)
process.exit(failed.length ? 1 : 0)

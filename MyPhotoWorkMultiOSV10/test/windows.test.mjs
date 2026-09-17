// Popups as separate windows, menus that can overhang the app, the viewport
// grid and rulers, and external drag & drop.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { firstTick, rulerSize, tickStep, visibleRange } from '../src/lib/view.ts'

const root = new URL('..', import.meta.url)
const read = (relative) => readFileSync(fileURLToPath(new URL(relative, root)), 'utf8')
const require = createRequire(import.meta.url)

const appSource = read('src/App.tsx')
const dialogSource = read('src/dialogs.tsx')
const dialogMeta = read('src/dialogMeta.ts')
const cssSource = read('src/App.css')
const mainProcess = read('electron/main.cjs')
const preload = read('electron/preload.cjs')
const childWindows = read('electron/childwindows.cjs')

/** The dialog names the renderer can ask for. */
function dialogNames() {
  const block = dialogMeta.slice(dialogMeta.indexOf('export type DialogName ='), dialogMeta.indexOf('export type DialogResult'))
  return [...block.matchAll(/'([a-zA-Z]+)'/g)].map((match) => match[1])
}

/* ------------------------------------------------------- window management */

test('every dialog has a window size, and the settings window is wide and fixed', () => {
  const specs = require(fileURLToPath(new URL('electron/childwindows.cjs', root))).DIALOG_SPECS
  for (const name of dialogNames()) {
    assert.ok(specs[name], `no window size for the "${name}" dialog`)
    assert.ok(specs[name].width >= 320, `${name} is too narrow`)
    assert.ok(specs[name].height >= 180, `${name} is too short`)
  }
  assert.ok(specs.settings.width >= 640, 'the settings window should be wide enough for label + control rows')
  assert.equal(specs.settings.resizable, false, 'the settings window must be a fixed size')
})

test('a dialog window is owned by the main window and is movable', () => {
  assert.match(childWindows, /parent: parent && !parent\.isDestroyed\(\)/, 'dialogs are not parented to the main window')
  assert.match(childWindows, /movable: true/, 'dialogs must be movable')
  assert.match(childWindows, /frame: false/, 'dialogs draw their own title bar')
})

test('opening a dialog twice reuses and raises the one window', () => {
  const open = childWindows.slice(childWindows.indexOf('function openDialogWindow'), childWindows.indexOf('function closeDialogWindow'))
  assert.match(open, /const existing = dialogWindows\.get\(name\)/, 'no lookup for an already-open window')
  for (const call of ['existing.show()', 'existing.focus()', 'existing.moveTop()']) {
    assert.ok(open.includes(call), `an existing window is not raised (${call})`)
  }
  assert.match(open, /return true/, 'the reuse path must not fall through and create a second window')
})

test('closing the app tears every popup down', () => {
  assert.match(mainProcess, /childWindows\.closeAllChildWindows\(\)/, 'popups are never closed with the app')
  assert.match(mainProcess, /app\.on\('before-quit'/, 'nothing closes the popups on quit')
  assert.match(mainProcess, /mainWindow\.on\('closed', \(\) => childWindows\.closeAllChildWindows\(\)\)/,
    'popups survive the main window closing')
  const closeAll = childWindows.slice(childWindows.indexOf('function closeAllDialogWindows'), childWindows.indexOf('function closeAllChildWindows'))
  assert.match(closeAll, /win\.destroy\(\)/, 'dialog windows are not destroyed')
})

test('the preload exposes the menu and dialog bridges', () => {
  for (const api of ['electronMenuApi', 'electronDialogApi']) {
    assert.ok(preload.includes(api), `${api} is not exposed`)
  }
  for (const channel of ['menu:open', 'menu:choose', 'menu:size', 'dialog:open', 'dialog:close', 'dialog:result']) {
    assert.ok(preload.includes(channel), `the ${channel} channel is missing`)
  }
})

test('the bundle routes the popup windows by hash', () => {
  const main = read('src/main.tsx')
  assert.match(main, /params\.get\('menu'\)/, 'no menu route')
  assert.match(main, /params\.get\('dialog'\)/, 'no dialog route')
  assert.ok(main.includes('<MenuHost') && main.includes('<DialogHost'), 'the hosts are not mounted')
  assert.match(childWindows, /menu=\$\{encodeURIComponent/, 'the menu window loads no route')
  assert.match(childWindows, /dialog=\$\{encodeURIComponent/, 'the dialog window loads no route')
})

/* ------------------------------------------------------------ menu popups */

test('the menu popup is its own always-on-top window, not a child of the app', () => {
  const open = childWindows.slice(childWindows.indexOf('function openMenuWindow'), childWindows.indexOf('function sizeMenuWindow'))
  assert.match(open, /alwaysOnTop: true/, 'the menu would fall behind the app')
  assert.ok(!/^\s*parent:/m.test(open), 'a parented window is clamped inside the app, which is the clipping we are escaping')
  assert.match(open, /win\.on\('blur'/, 'the menu never dismisses itself')
})

test('the menu window is sized from the measured content and kept on screen', () => {
  const size = childWindows.slice(childWindows.indexOf('function sizeMenuWindow'), childWindows.indexOf('/* ---------------------------------------------------------------- dialogs */'))
  assert.match(size, /win\.setBounds/, 'the popup is never resized to its content')
  assert.match(size, /workArea/, 'the popup is not kept on the display')
  assert.ok(size.includes('anchor.y - anchor.height - height'), 'the popup never flips above the anchor')

  const host = read('src/MenuHost.tsx')
  assert.match(host, /reportSize/, 'the popup never reports its size')
  assert.match(host, /ResizeObserver/, 'the popup does not re-measure when it changes')
})

test('App opens menus in a window first and falls back to the in-page dropdown', () => {
  assert.match(appSource, /const openMenuWindow = async \(id: CommandMenuId, anchor: HTMLElement \| null\)/, 'no menu-window opener')
  assert.match(appSource, /void openMenuWindow\(id, anchor\)/, 'the menu button never tries a real window')
  assert.match(appSource, /window\.screenX \+ box\.left/, 'the anchor is not converted to screen coordinates')
  assert.match(appSource, /onChosen/, 'the chosen command never reaches App')
})

/* ---------------------------------------------------------- dialog chrome */

test('every dialog window has an icon, a title and a close button', () => {
  const frame = dialogSource.slice(dialogSource.indexOf('export function DialogFrame'), dialogSource.indexOf('/* ------------------------------------------------------------ curve editor */'))
  assert.match(frame, /dialog-title-bar/, 'no title bar')
  assert.match(frame, /className="dialog-close"/, 'there is no close button')
  assert.ok(frame.includes('dialogIcon(name)'), 'the title bar shows no icon')
  // Settings, About and Help all go through the same frame, so all three get one.
  for (const name of ['settings', 'about', 'helpGuide']) {
    assert.ok(dialogMeta.includes(`${name}:`), `${name} has no icon or title entry`)
  }
})

test('the settings window is titled with the settings icon', () => {
  const icons = dialogMeta.slice(dialogMeta.indexOf('const DIALOG_ICONS'), dialogMeta.indexOf('const DIALOG_TITLE_KEYS'))
  assert.match(icons, /settings: Settings2/, 'the settings window does not use the settings icon')
})

test('the close button turns red under the pointer', () => {
  const rule = cssSource.slice(cssSource.indexOf('.dialog-close:hover'))
  const block = rule.slice(0, rule.indexOf('}'))
  assert.match(block, /background: #e11d48/, 'the close button does not go red on hover')
  assert.match(block, /color: #ffffff/, 'the red close button needs a light glyph')
})

test('the theme list wraps several swatches to a row', () => {
  const block = cssSource.slice(cssSource.indexOf('.settings-themes {'))
  const rule = block.slice(0, block.indexOf('}'))
  assert.match(rule, /grid-template-columns: repeat\(auto-fill/, 'the themes are not laid out in a wrapping grid')
})

test('every dialog is opened through openDialog, never by setting state directly', () => {
  // `setDialog(name)` inside openDialog is the in-page fallback; anything else
  // would bypass the window.
  const opener = appSource.slice(appSource.indexOf('const openDialog = useCallback'), appSource.indexOf('const closeAllDialogs'))
  const stray = [...appSource.replace(opener, '').matchAll(/setDialog\('(\w+)'\)/g)].map((match) => match[1])
  assert.deepEqual(stray, [], `these dialogs bypass the window opener: ${stray.join(', ')}`)
  assert.match(appSource, /const openDialog = useCallback\(\(name: DialogName\)/, 'there is no single dialog opener')
  assert.match(appSource, /window\.electronDialogApi\.open\(name, payload\)/, 'openDialog never opens a window')
  assert.match(appSource, /const payload = dialogPayload\(name\)/, 'the popup is opened without its seeds')
})

test('popups seeded from the old document are closed when it is replaced', () => {
  assert.match(appSource, /closeAllDialogs\(\)\n    canvasesRef\.current = canvases/, 'stale popups survive a new document')
})

/* ------------------------------------------------------------ grid/rulers */

test('tickStep returns a round 1/2/5 spacing that clears the minimum width', () => {
  for (const zoom of [0.05, 0.25, 1, 2.5, 8]) {
    const step = tickStep(zoom, 64)
    assert.ok(step * zoom >= 64 - 1e-9, `step ${step} at zoom ${zoom} is too tight`)
    const mantissa = step / Math.pow(10, Math.floor(Math.log10(step)))
    assert.ok([1, 2, 5, 10].some((n) => Math.abs(mantissa - n) < 1e-9), `step ${step} is not a round number`)
  }
})

test('tickStep gets finer as the zoom increases', () => {
  const zoomedOut = tickStep(0.1, 64)
  const zoomedIn = tickStep(4, 64)
  assert.ok(zoomedIn < zoomedOut, `expected a finer step when zoomed in (${zoomedIn} vs ${zoomedOut})`)
  assert.ok(tickStep(1, 64) >= 64, 'at 100% a tick must still be at least the minimum width')
})

test('tickStep survives a zero or negative zoom instead of dividing by zero', () => {
  for (const zoom of [0, -1]) {
    const step = tickStep(zoom, 64)
    assert.ok(Number.isFinite(step) && step > 0, `zoom ${zoom} produced ${step}`)
  }
})

test('visibleRange and firstTick frame the ticks that are on screen', () => {
  const span = visibleRange(800, -200, 2)
  assert.equal(span.from, 100, 'panned 200px left at 2x starts at document x=100')
  assert.equal(span.to, 500)
  assert.equal(firstTick(span.from, 50), 100)
  assert.equal(firstTick(span.from, 75), 75, 'the first tick sits at or before the visible start')
  assert.equal(firstTick(-30, 50), -50, 'negative coordinates round down, not toward zero')
})

test('the grid and the rulers are painted on the viewport, not behind it', () => {
  // The canvas fills the stage and is drawn opaque, so a CSS background grid
  // was invisible — this is the regression the viewport drawing replaces.
  assert.ok(!cssSource.includes('.canvas-stage.show-grid'), 'the dead CSS grid is still there')
  assert.ok(!appSource.includes("' show-grid'"), 'the stage still toggles the dead CSS class')
  assert.match(appSource, /if \(settings\.showGrid\) \{/, 'the grid is never drawn')
  assert.match(appSource, /if \(settings\.showRulers\) \{/, 'the rulers are never drawn')
  assert.match(appSource, /function drawRulers\(/, 'there is no ruler renderer')
  assert.ok(rulerSize > 0)
})

test('the viewport repaints when the grid or ruler toggle changes', () => {
  const deps = appSource.slice(appSource.indexOf('}, [activePathId,'))
  const list = deps.slice(0, deps.indexOf('])'))
  for (const flag of ['settings.showGrid', 'settings.showRulers']) {
    assert.ok(list.includes(flag), `${flag} is not a dependency, so toggling it would not redraw`)
  }
})

/* ------------------------------------------------------------- drag & drop */

test('the window accepts images dropped from the desktop', () => {
  assert.match(appSource, /onDrop=\{\(event\) => void handleDrop\(event\)\}/, 'the shell has no drop handler')
  assert.match(appSource, /onDragOver=\{handleDragOver\}/, 'dragging over the shell is not accepted')
  const drop = appSource.slice(appSource.indexOf('const handleDrop'), appSource.indexOf('const handleDragOver'))
  assert.match(drop, /event\.preventDefault\(\)/, 'the browser would just navigate to the file')
  assert.match(drop, /file\.type\.startsWith\('image\/'\)/, 'images are not accepted')
  assert.match(drop, /\\.\(mpw\|/, 'project files are not accepted')
  assert.match(drop, /fileToOpenItem/, 'dropped files are never decoded')
  assert.match(drop, /dirtyRef\.current \? 'place' : 'open'/, 'a drop onto an edited document should place, not replace')
})

test('a drag over the window is shown to the user', () => {
  assert.match(appSource, /drop-active/, 'nothing indicates that a drop is accepted')
  assert.ok(cssSource.includes('.app-shell.drop-active::after'), 'there is no drop highlight')
})

/* ------------------------------------------------------------- robustness */

test('a popup that cannot open as a window still appears in page', () => {
  const opener = appSource.slice(appSource.indexOf('const openDialog = useCallback'), appSource.indexOf('const closeAllDialogs'))
  assert.match(opener, /\.then\(\(opened\) => \{/, 'the open result is never checked')
  assert.match(opener, /\.catch\(\(\) => \{/, 'a rejected open would leave the button doing nothing')
  assert.ok((opener.match(/setDialog\(name\)/g) ?? []).length >= 2, 'there is no in-page fallback')
})

test('a menu that cannot open as a window still drops down in page', () => {
  const opener = appSource.slice(appSource.indexOf('const openMenuWindow = async'), appSource.indexOf('/* --------------------------------------------------- external drag & drop */'))
  assert.match(opener, /return await window\.electronMenuApi\.open/, 'the open result is not awaited')
  assert.match(opener, /catch \{\s*return false/, 'a rejected open is not reported')

  const button = appSource.slice(appSource.indexOf('// A real window first'), appSource.indexOf('<MenuIcon size={15} />'))
  assert.match(button, /if \(!opened\) setMenu\(id\)/, 'the in-page dropdown is not used when the window fails')
})

test('a move gesture redraws from the untouched original', () => {
  assert.match(appSource, /const moveSourceRef = useRef<HTMLCanvasElement \| null>\(null\)/, 'no original is kept')
  const drag = appSource.slice(appSource.indexOf("if (drag.mode === 'move') {"), appSource.indexOf("if (drag.mode === 'paint'"))
  assert.match(drag, /const source = moveSourceRef\.current/, 'the move still re-pads the shifted canvas')
  assert.match(drag, /point\.x - drag\.start\.x/, 'the offset must be measured from the start of the gesture')
  assert.ok(!drag.includes('point.x - drag.last.x'), 'an incremental offset re-crops on every step')
  assert.match(appSource, /moveSourceRef\.current = null/, 'the original is never released')
})

test('popup windows draw a single hairline frame, not a doubled edge', () => {
  const inner = cssSource.slice(cssSource.indexOf('.dialog-window > .dialog {'))
  assert.match(inner.slice(0, inner.indexOf('}')), /border: none/, 'the inner border doubles the window edge')
  assert.ok(cssSource.includes('.dialog-window {\n  box-shadow: inset 0 0 0 1px var(--border);'), 'no frame on the window itself')
  assert.ok(cssSource.includes('.dialog-window *::-webkit-scrollbar-track'), 'the scrollbar track draws a second line')
  assert.ok(cssSource.includes('.panel::-webkit-scrollbar-track'), 'the main panel scrollbar draws a second line')
})

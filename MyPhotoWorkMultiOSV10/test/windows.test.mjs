// Popups as separate windows, menus that can overhang the app, the viewport
// grid and rulers, and external drag & drop.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { firstTick, rulerSize, tickStep, visibleRange } from '../src/lib/view.ts'
import { t } from '../src/i18n.ts'

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
  const replace = appSource.slice(
    appSource.indexOf('const replaceDocument = useCallback'),
    appSource.indexOf('const updateDoc = useCallback'),
  )
  assert.match(replace, /closeAllDialogs\(\)/, 'stale popups survive a new document')
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

test('a move replays from a pristine copy, so dragging out of frame loses nothing', () => {
  // Re-padding the already-shifted canvas cropped whatever left the edge, and
  // the crop outlived the gesture — so dragging back in a second drag came up
  // short. Every move is now replayed from an untouched copy of the layer.
  assert.match(appSource, /const moveOriginRef = useRef\(new Map</, 'no pristine copy is kept')
  const drag = appSource.slice(appSource.indexOf("if (drag.mode === 'move') {"), appSource.indexOf("if (drag.mode === 'paint'"))
  assert.match(drag, /moveOriginRef\.current\.get\(doc\.activeLayerId\)/, 'the move still re-pads the shifted canvas')
  assert.match(drag, /padCanvas\(origin\.canvas/, 'the move does not redraw from the original')
  assert.ok(!drag.includes('point.x - drag.last.x'), 'an incremental offset re-crops on every step')
})

test('the pristine copy is dropped as soon as the layer changes another way', () => {
  const withLayer = appSource.slice(appSource.indexOf('const withLayer = useCallback'), appSource.indexOf('const applyCrop'))
  assert.match(withLayer, /moveOriginRef\.current\.delete\(layer\.id\)/, 'a painted layer would then be moved from stale pixels')
  // Undo, redo, resize, rotate and open all swap the canvases wholesale.
  const clears = (appSource.match(/moveOriginRef\.current\.clear\(\)/g) ?? []).length
  assert.ok(clears >= 4, `expected the copies to be invalidated wherever canvases are replaced, found ${clears}`)
})

test('popup windows draw a single hairline frame, not a doubled edge', () => {
  const inner = cssSource.slice(cssSource.indexOf('.dialog-window > .dialog {'))
  assert.match(inner.slice(0, inner.indexOf('}')), /border: none/, 'the inner border doubles the window edge')
  assert.ok(cssSource.includes('.dialog-window {\n  box-shadow: inset 0 0 0 1px var(--border);'), 'no frame on the window itself')
  assert.ok(cssSource.includes('.dialog-window *::-webkit-scrollbar-track'), 'the scrollbar track draws a second line')
  assert.ok(cssSource.includes('.panel::-webkit-scrollbar-track'), 'the main panel scrollbar draws a second line')
})

/* ------------------------------------------------------------ popup layout */

test('a popup window is sized to the dialog it contains', () => {
  // Hand-picked sizes could not track the content: the hue dialog's buttons sat
  // 100px below the window edge while the text dialog had 130px of dead space.
  const host = read('src/DialogHost.tsx')
  assert.match(host, /reportSize/, 'the dialog never reports its size')
  assert.match(host, /ResizeObserver/, 'the dialog does not re-measure when it changes')
  assert.match(host, /chrome \+ content\.scrollHeight/, 'the measurement ignores content that scrolls')
  assert.match(childWindows, /ipcMain\.handle\('dialog:size'/, 'the main process does not resize the window')
})

test('the fit can grow a fixed-size window and stays on the display', () => {
  const fit = childWindows.slice(childWindows.indexOf('function sizeDialogWindow'), childWindows.indexOf('function closeDialogWindow'))
  // Windows pins a non-resizable window to its creation size, so setBounds is
  // ignored while growing unless the flag is lifted for the call.
  assert.match(fit, /win\.setResizable\(true\)/, 'a fixed window could never grow to fit')
  assert.match(fit, /win\.setResizable\(false\)/, 'the window must stay fixed afterwards')
  assert.match(fit, /area\.height - 40/, 'a tall dialog could grow off the screen')
  assert.match(fit, /win\.setBounds/, 'nothing is resized')
})

test('the dialog keeps a natural height so the window can shrink to it', () => {
  const window = cssSource.slice(cssSource.indexOf('.dialog-window {'))
  assert.match(window.slice(0, window.indexOf('}')), /align-items: flex-start/,
    'a stretched dialog always measures the window it is already in')
  const inner = cssSource.slice(cssSource.indexOf('.dialog-window > .dialog {'))
  const rule = inner.slice(0, inner.indexOf('}'))
  assert.match(rule, /display: flex/, 'the content cannot shrink and scroll without a column flexbox')
  assert.match(rule, /flex-direction: column/)
  assert.match(rule, /max-height: 100vh/, 'a tall dialog would push past the window')
})

test('the buttons follow the content instead of being pushed to the bottom', () => {
  const actions = cssSource.slice(cssSource.indexOf('.dialog-content > .dialog-actions {'))
  const rule = actions.slice(0, actions.indexOf('}'))
  assert.ok(!rule.includes('margin-top: auto'), 'stretching the gap is what produced the dead space')
})

test('the rulers mark every labelled number with a rule of its own', () => {
  const rulers = appSource.slice(appSource.indexOf('function drawRulers('), appSource.indexOf('export default function App'))
  assert.match(rulers, /const minor = step \/ 10/, 'there are no minor ticks between the numbers')
  assert.match(rulers, /const tickDepth =/, 'every tick is the same length, so a number has no rule of its own')
  assert.match(rulers, /index % 10 === 0\) return rulerSize - 2/, 'a labelled value gets no full-height rule')
  assert.match(rulers, /index % 5 === 0\) return 8/, 'there is no half-way mark')
})

/* ------------------------------------------------------------ settings form */

test('a number in the settings window has a step button either side', () => {
  const stepper = dialogSource.slice(dialogSource.indexOf('export function NumberStepper'), dialogSource.indexOf('/* ------------------------------------------------------------ curve editor */'))
  assert.match(stepper, /<Minus size=\{14\} \/>/, 'there is no decrease button')
  assert.match(stepper, /<Plus size=\{14\} \/>/, 'there is no increase button')
  assert.match(stepper, /disabled=\{value <= min\}/, 'the decrease button never disables at the floor')
  assert.match(stepper, /disabled=\{value >= max\}/, 'the increase button never disables at the ceiling')
  assert.match(stepper, /Math\.min\(max, Math\.max\(min, next\)\)/, 'typing could go out of range')
  assert.match(stepper, /type="number"/, 'the value can no longer be typed')

  // Both settings numbers use it, and so do the size dialogs.
  const settings = dialogSource.slice(dialogSource.indexOf("case 'settings':"), dialogSource.indexOf("case 'helpGuide':"))
  assert.equal((settings.match(/<NumberStepper/g) ?? []).length, 2, 'a settings number is still a bare input')
  assert.ok(!settings.includes('type="number"'), 'a settings number still uses the browser spinner')
})

test('the step buttons keep the value on the step grid', () => {
  const stepper = dialogSource.slice(dialogSource.indexOf('export function NumberStepper'), dialogSource.indexOf('/* ------------------------------------------------------------ curve editor */'))
  assert.match(stepper, /Math\.round\(\(value \+ direction \* step\) \/ step\) \* step/, 'repeated clicks would drift off the step')
})

test('the browser spinners are hidden now that the buttons replace them', () => {
  assert.ok(cssSource.includes('.number-stepper input[type=\'number\']::-webkit-inner-spin-button'), 'the native spinner still shows')
  const rule = cssSource.slice(cssSource.indexOf(".number-stepper input[type='number'] {"))
  assert.match(rule.slice(0, rule.indexOf('}')), /appearance: textfield/, 'the native spinner still shows in Firefox')
})

test('the settings labels say what the value means', () => {
  for (const language of ['ko', 'en']) {
    for (const key of ['settingsBrushSize', 'settingsBrushSizeHint', 'settingsTolerance', 'settingsToleranceHint']) {
      assert.notEqual(t(language, key), key, `${language} has no text for "${key}"`)
    }
    // A bare "Size" says nothing; the hint has to explain the unit and the range.
    assert.ok(t(language, 'settingsBrushSizeHint').length > 20, `${language} brush-size hint is too terse`)
    assert.ok(/0/.test(t(language, 'settingsToleranceHint')), `${language} tolerance hint does not explain the range`)
  }
  const settings = dialogSource.slice(dialogSource.indexOf("case 'settings':"), dialogSource.indexOf("case 'helpGuide':"))
  assert.ok(settings.includes("tr('settingsBrushSize')"), 'the brush size still uses the abbreviated label')
  assert.ok(settings.includes("tr('settingsToleranceHint')"), 'the tolerance is not explained')
})

test('nothing in the settings window scrolls', () => {
  // The window is sized to hold all of it, so a scrollbar would only ever be
  // a sign that something is cut off.
  const themes = cssSource.slice(cssSource.indexOf('.settings-themes {'))
  const rule = themes.slice(0, themes.indexOf('}'))
  assert.ok(!rule.includes('overflow-y: auto'), 'the theme list scrolls instead of the window growing')
  assert.ok(!rule.includes('max-height'), 'the theme list is capped, so it would have to scroll')
  assert.ok(cssSource.includes('.dialog-window .settings-dialog .dialog-content'), 'the settings content can still scroll')
})

test('each dialog carries its own class so a rule can target one of them', () => {
  const frame = dialogSource.slice(dialogSource.indexOf('export function DialogFrame'), dialogSource.indexOf('/* ---------------------------------------------------------'))
  assert.match(frame, /`\$\{name\}-dialog`/, 'the dialogs are indistinguishable in CSS')
})

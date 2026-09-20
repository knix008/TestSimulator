// Popups as separate windows, menus that can overhang the app, the viewport
// grid and rulers, and external drag & drop.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { firstTick, rulerSize, tickStep, visibleRange } from '../src/lib/view.ts'
import { t } from '../src/i18n.ts'
import { commandsInMenu, menuColumns, menuEntries, menuOrder } from '../src/commands.ts'

const root = new URL('..', import.meta.url)
// Normalised to LF, so a CRLF checkout on Windows reads the same as the repository.
const read = (relative) => readFileSync(fileURLToPath(new URL(relative, root)), 'utf8').replace(/\r\n/g, '\n')
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

test('every dialog has a window size, and the settings window is a preferences window', () => {
  const specs = require(fileURLToPath(new URL('electron/childwindows.cjs', root))).DIALOG_SPECS
  for (const name of dialogNames()) {
    assert.ok(specs[name], `no window size for the "${name}" dialog`)
    assert.ok(specs[name].width >= 320, `${name} is too narrow`)
    assert.ok(specs[name].height >= 180, `${name} is too short`)
  }
  // The settings are on tabs: a window of a set size whose page scrolls, wide
  // enough for two controls side by side, and resizable for a long page.
  assert.ok(specs.settings.width >= 560, 'the settings window should be wide enough for two controls side by side')
  assert.ok(specs.settings.width <= 700, 'the settings window has grown back into a scroll of everything')
  assert.ok(specs.settings.height >= 560, 'the settings window is too short for a page')
  assert.equal(specs.settings.resizable, true, 'the settings window cannot be resized for a long page')
  assert.match(cssSource, /\.dialog-window > \.dialog\.settings-dialog \{[^}]*height: 100vh/, 'the settings dialog does not fill its window, so the page cannot scroll')
  assert.match(cssSource, /\.settings-page \{[^}]*overflow-y: auto/, 'the settings page does not scroll')
  assert.match(cssSource, /\.dialog-window \.settings-dialog \.dialog-content \{[^}]*overflow: hidden/, 'the content would keep growing the window')
})

test('a dialog window is owned by the main window and is movable', () => {
  // The window is built before it knows which dialog it will hold, so the
  // parent is attached when it is handed its identity rather than at creation.
  assert.match(childWindows, /win\.setParentWindow\(parent\)/, 'dialogs are not parented to the main window')
  assert.match(childWindows, /movable: true/, 'dialogs must be movable')
  assert.match(childWindows, /frame: false/, 'dialogs draw their own title bar')
})

test('a dismissed dialog is pooled rather than destroyed', () => {
  const recycle = childWindows.slice(childWindows.indexOf('function recycleDialogWindow'), childWindows.indexOf('function closeDialogWindow'))
  assert.match(recycle, /win\.hide\(\)/, 'a dismissed dialog is not hidden')
  assert.match(recycle, /spareDialogs\.push\(win\)/, 'the window is not returned to the pool')
  assert.match(recycle, /shuttingDown \|\| spareDialogs\.length >= SPARE_LIMIT/, 'the pool can grow without limit')
  const close = childWindows.slice(childWindows.indexOf('function closeDialogWindow'), childWindows.indexOf('function closeAllDialogWindows'))
  assert.match(close, /recycleDialogWindow\(win\)/, 'closing a dialog still destroys its window')
})

test('a popup window takes its identity from the main process, not its url', () => {
  assert.match(childWindows, /load\(win, 'dialog='\)/, 'the dialog window still names itself in its route')
  assert.match(childWindows, /load\(win, 'menu='\)/, 'the menu window still names itself in its route')
  const open = childWindows.slice(childWindows.indexOf('function openDialogWindow'), childWindows.indexOf('function sizeDialogWindow'))
  assert.match(open, /takeSpareDialog\(\)/, 'an opening dialog does not draw on the warm pool')
  assert.match(open, /webContents\.send\('dialog:payload', message\)/, 'the window is never told which dialog it is')
  assert.match(open, /warmDialogPool\(\)/, 'the pool is never refilled')
  // Reusing a renderer means the previous dialog's form state is still there.
  const host = read('src/DialogHost.tsx')
  assert.match(host, /key=\{message\?\.openId \?\? 0\}/, 'a reopened dialog would keep the last one’s answers')
})

test('the popup renderers are started before the first click', () => {
  assert.match(childWindows, /function warmChildWindows/, 'nothing warms the popups')
  const warm = childWindows.slice(childWindows.indexOf('function warmChildWindows'))
  assert.match(warm, /ensureMenuWindow\(\)/, 'the menu popup is not warmed')
  assert.match(warm, /warmDialogPool\(\)/, 'the dialog pool is not warmed')
  assert.match(mainProcess, /childWindows\.warmChildWindows\(\)/, 'the main process never warms the popups')
  assert.match(mainProcess, /once\('did-finish-load'/, 'warming would compete with the editor’s own start-up')
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
  // Dismissing dialogs pools them; only the app going away really destroys one.
  const teardown = childWindows.slice(childWindows.indexOf('function closeAllChildWindows'), childWindows.indexOf('function warmChildWindows'))
  assert.match(teardown, /shuttingDown = true/, 'popups would still be recycled while the app quits')
  assert.match(teardown, /win\.destroy\(\)/, 'dialog windows are not destroyed')
  assert.match(teardown, /spareDialogs/, 'the warm pool would outlive the app')
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
  // `has`, not `get`: the route says which kind of window this is and nothing
  // more, so `#dialog=` with no name still has to reach the dialog host.
  assert.match(main, /params\.has\('menu'\)/, 'no menu route')
  assert.match(main, /params\.has\('dialog'\)/, 'no dialog route')
  assert.ok(main.includes('<MenuHost') && main.includes('<DialogHost'), 'the hosts are not mounted')
  assert.match(childWindows, /'menu='/, 'the menu window loads no route')
  assert.match(childWindows, /'dialog='/, 'the dialog window loads no route')
})

/* ------------------------------------------------------------ menu popups */

test('the menu popup is its own always-on-top window, not a child of the app', () => {
  const build = childWindows.slice(childWindows.indexOf('function ensureMenuWindow'), childWindows.indexOf('/** Dismisses the menu'))
  assert.match(build, /alwaysOnTop: true/, 'the menu would fall behind the app')
  assert.ok(!/^\s*parent:/m.test(build), 'a parented window is clamped inside the app, which is the clipping we are escaping')
  assert.match(build, /win\.on\('blur'/, 'the menu never dismisses itself')
})

test('one menu window serves every dropdown', () => {
  const ensure = childWindows.slice(childWindows.indexOf('function ensureMenuWindow'), childWindows.indexOf('/** Dismisses the menu'))
  assert.match(ensure, /if \(menuWindow && !menuWindow\.win\.isDestroyed\(\)\)/, 'a window is built per dropdown again')
  const hide = childWindows.slice(childWindows.indexOf('function hideMenuWindow'), childWindows.indexOf('function closeMenuWindow'))
  assert.match(hide, /win\.hide\(\)/, 'dismissing a menu destroys its renderer')
  assert.match(hide, /send\('menu:payload', null\)/, 'the next menu would flash the last one’s rows')
  const open = childWindows.slice(childWindows.indexOf('function openMenuWindow'), childWindows.indexOf('/** Fits the popup'))
  assert.match(open, /ensureMenuWindow\(\)/, 'the dropdown does not reuse the menu window')
  assert.match(open, /send\('menu:payload', message\)/, 'the window is never told which menu it is')
  const host = read('src/MenuHost.tsx')
  assert.match(host, /electronMenuApi\?\.onPayload/, 'the menu popup cannot be re-targeted')
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

test('the theme list shows four swatches to a row', () => {
  const block = cssSource.slice(cssSource.indexOf('.settings-themes {'))
  const rule = block.slice(0, block.indexOf('}'))
  assert.match(rule, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/, 'the themes are not four to a row')
})

test('every dialog is opened through openDialog, never by setting state directly', () => {
  // `setDialog(name)` inside openDialog is the in-page fallback; anything else
  // would bypass the window.
  const opener = appSource.slice(appSource.indexOf('const openDialog = useCallback'), appSource.indexOf('const closeAllDialogs'))
  const stray = [...appSource.replace(opener, '').matchAll(/setDialog\('(\w+)'\)/g)].map((match) => match[1])
  assert.deepEqual(stray, [], `these dialogs bypass the window opener: ${stray.join(', ')}`)
  assert.match(appSource, /const openDialog = useCallback\(\(name: DialogName, extra\?: Partial<DialogPayload>\)/, 'there is no single dialog opener')
  assert.match(appSource, /window\.electronDialogApi\.open\(name, payload\)/, 'openDialog never opens a window')
  // The seeds, plus whatever a shared window needs to know which command opened it.
  assert.match(appSource, /const payload = \{ \.\.\.dialogPayload\(name\), \.\.\.extra \}/, 'the popup is opened without its seeds')
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

test('the rulers are graduated like a tape: numbered, half and fine ticks on both axes', () => {
  const rulers = appSource.slice(appSource.indexOf('function drawRulers('), appSource.indexOf('/** Pixels per unit for the ruler labels'))
  assert.match(rulers, /const minor = step \* zoom >= 50 \? step \/ 10 : step \* zoom >= 25 \? step \/ 5 : step \/ 2/,
    'the fine graduation does not adapt to the zoom, so the ticks either crowd or vanish')
  assert.match(rulers, /const depthOf = /, 'every tick is the same length, so a number has no rule of its own')
  assert.match(rulers, /index % perStep === 0\) return rulerSize - 6/, 'a labelled value gets no full-height rule')
  assert.match(rulers, /index % \(perStep \/ 2\) === 0\) return 8/, 'there is no half-way mark')
  // Both axes get the ticks, and the ticks are drawn in the text colour, not
  // the faint border colour that made them invisible.
  assert.equal((rulers.match(/const depth = depthOf\(index\)/g) ?? []).length, 2, 'one axis has no ticks')
  assert.match(rulers, /ctx\.strokeStyle = colors\.text\s+ctx\.lineWidth = 1/, 'the ticks are drawn too faintly to see')
  assert.match(rulers, /ctx\.rotate\(-Math\.PI \/ 2\)/, 'the vertical numbers are not turned along the ruler')
  assert.match(appSource, /text: style\.getPropertyValue\('--text-muted'\)/, 'the ruler reads a colour token that does not exist')
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
  const settings = dialogSource.slice(dialogSource.indexOf("case 'settings': {"), dialogSource.indexOf("case 'helpGuide':"))
  assert.equal((settings.match(/<NumberStepper/g) ?? []).length, 5, 'a settings number is still a bare input')
  // Every preference the editor keeps is on one of the pages, and there is a way back to the defaults.
  for (const key of ['showRulers', 'showGrid', 'showGuides', 'showPixelGrid', 'smartGuides', 'showSlices', 'showNotes', 'extras', 'snapEnabled', 'snapToGuides', 'snapToGrid', 'lockGuides', 'proofColors', 'gamutWarning', 'rulerUnits', 'rightWidth', 'selectionMode', 'marqueeFeather', 'antiAlias', 'wandContiguous', 'sampleAllLayers', 'fillTolerance', 'eyedropperSample', 'cloneAligned', 'patternImpressionist', 'brushHardness', 'brushOpacity', 'historyStates', 'neuralWebgpu', 'exportFormat', 'exportTransparent', 'recentFiles']) {
    assert.ok(settings.includes(`'${key}'`) || settings.includes(`${key}:`) || settings.includes(`settings.${key}`), `the ${key} preference has no control in the settings window`)
  }
  assert.match(settings, /const resetPreferences = /, 'there is no way back to the defaults')
  assert.match(settings, /onClick=\{resetPreferences\}/, 'the reset is not wired to a button')
  assert.ok(settings.includes("'brushes', 'gradients', 'swatches', 'customShapes', 'toolPresets', 'styles', 'workspaces', 'actions', 'recentFiles'"), 'a reset would throw away what the user made')
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
  const settings = dialogSource.slice(dialogSource.indexOf("case 'settings': {"), dialogSource.indexOf("case 'helpGuide':"))
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

/* -------------------------------------------------------------- bundling */

test('each window route is loaded on demand, not bundled into one chunk', () => {
  const routes = read('src/routes.ts')
  for (const route of ['App', 'MenuHost', 'DialogHost']) {
    assert.ok(
      routes.includes(`export const ${route} = lazy(() => import('./${route}.tsx'))`),
      `the ${route} route is not split out`,
    )
  }
  assert.match(read('src/main.tsx'), /<Suspense fallback=\{null\}>/, 'a lazy route needs a Suspense boundary')
})

test('every popup host asks for the stylesheet itself', () => {
  // Each route is its own chunk now, so relying on the editor having already
  // pulled the stylesheet in leaves the popup unstyled.
  for (const file of ['src/MenuHost.tsx', 'src/DialogHost.tsx']) {
    assert.match(read(file), /import '\.\/App\.css'/, `${file} would render unstyled in its own window`)
  }
})

test('the bundle is served on its own scheme with the isolation headers, by relative path', () => {
  const config = read('vite.config.ts')
  assert.match(config, /base: '\.\/'/, 'an absolute base would make the split chunks unreachable under app://')
  assert.match(childWindows, /protocol\.registerSchemesAsPrivileged\(\[\s*\{ scheme: 'app', privileges: \{ standard: true, secure: true/, 'the app scheme is not registered as standard and secure')
  assert.match(childWindows, /Cross-Origin-Embedder-Policy', 'credentialless'/, 'the bundle responses carry no embedder policy')
  assert.match(childWindows, /return `app:\/\/\$\{BUNDLE_HOST\}\/index\.html/, 'the windows do not load from the app scheme')
  const main = read('electron/main.cjs')
  assert.match(main, /childWindows\.registerBundleScheme\(\)/, 'the scheme is not registered before the app is ready')
  assert.match(main, /childWindows\.serveBundle\(\)/, 'the scheme is never served')
  assert.ok(!/loadFile\(bundle\)/.test(main), 'the main window still loads the bundle from file://')
})

/* ------------------------------------------- long menus, print, zoom, out */

test('a menu folds its sections into submenus, so the top level stays short', () => {
  // Filter has ninety-odd rows; folded, it is a couple of dozen choices.
  for (const menu of menuOrder) {
    const rows = commandsInMenu(menu)
    const entries = menuEntries(rows)
    assert.ok(entries.length <= 40, `the ${menu} menu still shows ${entries.length} rows at once`)
    assert.equal(menuColumns(entries).columns, 1, `the ${menu} menu is dealt into columns`)
    // Every command is reachable: at the top level or inside exactly one submenu.
    const reachable = entries.flatMap((entry) => (entry.kind === 'command' ? [entry.command.id] : entry.commands.map((command) => command.id)))
    assert.deepEqual([...reachable].sort(), rows.map((command) => command.id).sort(), `the ${menu} menu loses or duplicates commands when folded`)
  }
  const filter = menuEntries(commandsInMenu('filter'))
  assert.ok(filter.filter((entry) => entry.kind === 'submenu').length >= 10, 'the filter groups are not submenus')
  const artistic = filter.find((entry) => entry.kind === 'submenu' && entry.section === 'groupArtistic')
  assert.ok(artistic && artistic.commands.length >= 10, 'the Artistic submenu is missing its filters')

  // A section takes its separator from its first command, and no command
  // appears twice.
  const file = menuEntries(commandsInMenu('file'))
  const automate = file.find((entry) => entry.kind === 'submenu' && entry.section === 'sectionAutomate')
  assert.ok(automate?.separatorBefore, 'the Automate submenu lost the separator above it')
  assert.equal(new Set(file.map((entry) => (entry.kind === 'command' ? entry.command.id : entry.section))).size, file.length)

  // Both hosts render one shared tree, which opens a submenu beside its row.
  const tree = read('src/MenuTree.tsx')
  assert.match(tree, /onPointerEnter=\{\(event\) => setOpen\(/, 'hovering a section row does not open its submenu')
  assert.match(tree, /onPointerEnter=\{inSubmenu \? undefined : \(\) => setOpen\(null\)\}/, 'hovering another row does not close the submenu')
  assert.match(tree, /className="menu-column menu-sub"/, 'there is no submenu column')
  assert.match(tree, /<ChevronRight size=\{14\} className="menu-chevron" \/>/, 'a section row does not show it opens a submenu')
  assert.match(read('src/MenuHost.tsx'), /<MenuTree/, 'the popup window does not use the tree')
  assert.match(appSource, /<MenuDrop anchor=\{menuAnchor\} className="menu-tree-drop">\s*<MenuTree/, 'the in-page dropdown does not use the tree')
  assert.match(cssSource, /\.menu-tree \{[^}]*display: flex/, 'the submenu cannot sit beside the top level')
  assert.match(cssSource, /\.menu-column\.menu-columns \{[^}]*grid-auto-flow: column/, 'an overlong top level has no column rule')
  assert.match(cssSource, /grid-template-rows: repeat\(var\(--menu-rows\), auto\)/, 'the columns do not share one set of row tracks')
})

test('the print window is fixed, fits its content and never scrolls', () => {
  const spec = require('../electron/childwindows.cjs').DIALOG_SPECS.print
  assert.equal(spec.resizable, false, 'the print window must not be resizable')
  assert.ok(spec.height >= 700, 'the print window is too short to hold the sheet and the buttons')
  assert.match(cssSource, /\.print-dialog \.dialog-content \{\s*overflow: hidden;/,
    'the print window would show a scrollbar')
  // The preview is what gives way, driven from the long side of the sheet.
  assert.match(cssSource, /\.print-dialog \.print-sheet \{[^}]*max-height: 430px/,
    'the preview is not capped, so the buttons could be pushed off the window')
  assert.match(cssSource, /\.print-dialog \.print-sheet\.landscape \{[^}]*width: 100%/,
    'a landscape sheet would be stretched out of its aspect ratio')
})

test('the print window selects the printer the system calls default', () => {
  // Chromium's own list carries no `isDefault`, so the OS is asked directly.
  assert.match(mainProcess, /function defaultPrinterName/, 'nothing asks the OS which printer is default')
  assert.match(mainProcess, /CurrentVersion.+Windows/s, 'the Windows default printer is never read')
  assert.match(mainProcess, /'lpstat'/, 'the CUPS default printer is never read')
  const handler = mainProcess.slice(mainProcess.indexOf("ipcMain.handle('print:printers'"), mainProcess.indexOf("ipcMain.handle('print:job'"))
  assert.match(handler, /defaultPrinterName\(\)/, 'the printer list is not told which one is default')
  assert.match(handler, /printer\.name === preferred/, 'the OS answer is never matched against the list')
  assert.match(dialogSource, /payload\.printers\?\.find\(\(item\) => item\.isDefault\)\?\.name/,
    'the print window does not preselect the default printer')
})

test('the zoom percentage sits between the two zoom buttons', () => {
  const toolbar = appSource.slice(appSource.indexOf('className="tool-bar"'))
  assert.match(toolbar, /className="zoom-readout"/, 'there is no zoom readout')
  assert.match(toolbar, /command\.id !== 'view\.zoomIn'/,
    'the readout is not anchored to the zoom-in button, so it could land anywhere in the row')
  assert.match(toolbar, /Math\.round\(settings\.zoom \* 100\)\}%/, 'the readout shows no percentage')
  // Zoom in is listed before zoom out, so rendering after zoom in puts the
  // number between the two.
  const view = commandsInMenu('view').filter((command) => command.toolbar).map((command) => command.id)
  assert.deepEqual(view.slice(0, 2), ['view.zoomIn', 'view.zoomOut'], 'the zoom buttons are no longer adjacent')
  assert.match(cssSource, /\.tool-bar button\.zoom-readout \{[^}]*font-variant-numeric: tabular-nums/,
    'the buttons either side would shift as the number changes')
  assert.equal(typeof t('ko', 'zoomLevel'), 'string')
  assert.notEqual(t('en', 'zoomLevel'), t('ko', 'zoomLevel'), 'the readout label is not translated')
})

test('the real-image run leaves its results in out/', () => {
  const verify = read('scripts/verify-images.mjs')
  assert.match(verify, /path\.join\(root, 'out'\)/, 'the results are not written beside the project')
  assert.match(verify, /rmSync\(path\.join\(outDir, name\.name\)/, 'a stale result from an earlier run would be left behind')
  assert.ok(!verify.includes('rmSync(outDir'), 'the pipeline run would wipe the feature run\'s results too')
  for (const artifact of ['index.html', 'report.md', 'verify-images.log']) {
    assert.ok(verify.includes(`'${artifact}'`), `the run leaves no ${artifact}`)
  }
  assert.match(verify, /function save\(name, data\)/, 'the artifacts are not recorded as they are written')
  // The results are looked at locally and rebuilt on every run, so they stay
  // out of the repository: the directory is ignored, and the feature run
  // writes its own gallery beside the pipeline one.
  const ignore = read('.gitignore')
  assert.match(ignore, /^out\/$/m, 'the run output is no longer ignored')
  assert.ok(!/^!out\//m.test(ignore), 'the run output is re-included')
  const features = read('scripts/verify-features.mjs')
  assert.match(features, /path\.join\(outDir, 'features'\)/, 'the feature run does not write into out/features')
  for (const artifact of ['features.html', 'features.md', 'verify-features.log']) {
    assert.ok(features.includes(`'${artifact}'`), `the feature run leaves no ${artifact}`)
  }
  assert.equal(JSON.parse(read('package.json')).scripts['verify:features'], 'node --import ./test/helpers/setup.mjs scripts/verify-features.mjs')
})

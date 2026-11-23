// The window layout the user set on 2026-11-23: the side panels start right under the
// toolbar, the document tabs (with < and > at their right end) and the tool options sit
// over the canvas only, the right panel has its own title bar that stays visible when
// folded, and a bottom panel shows Problems, Errors and the Log.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LOG_LIMIT, addLog, clearLog, documentProblems, logEntries, logText, logTime, subscribeLog } from '../src/lib/appLog.ts'
import { loadSettings } from '../src/lib/settings.ts'
import { defaultSettings } from '../src/lib/types.ts'
import { findCommand } from '../src/commands.ts'
import { t } from '../src/i18n.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = (name) => readFileSync(path.join(root, name), 'utf8').replace(/\r\n/g, '\n')
const app = read('src/App.tsx')
const css = read('src/App.css')
const block = (selector) => {
  const at = css.indexOf(selector)
  assert.ok(at >= 0, `no rule for ${selector}`)
  return css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at))
}

/* ------------------------------------------------------------------ layout */

test('the side panels start right under the toolbar: the options bar is in the centre column', () => {
  const column = app.slice(app.indexOf('<div className="stage-column">'), app.indexOf('className="resize-handle"'))
  assert.match(column, /<DocumentTabs ctx=\{panelContext\} \/>/)
  const tabs = column.indexOf('<DocumentTabs')
  const canvas = column.indexOf('className="canvas-stage"')
  const options = column.indexOf('<div className="options-bar">')
  const bottom = column.indexOf('<BottomPanel')
  assert.ok(tabs < options && options < canvas && canvas < bottom, 'the order is not tabs, tool options, canvas, bottom panel')
  assert.match(block('.stage-column > .options-bar:not(:has(.tool-options > *)) {'), /display: none/, 'an empty options bar still shows')
  const beforeWorkspace = app.slice(app.indexOf('<div className="tool-bar">'), app.indexOf('<div className={`workspace'))
  assert.doesNotMatch(beforeWorkspace, /className="options-bar"/, 'a full-width options bar still pushes the panels down')
  assert.match(block('.app-shell {'), /grid-template-rows: 38px 40px 40px minmax\(0, 1fr\) 28px/)
})

test('the options bar does not repeat which tool is chosen', () => {
  assert.doesNotMatch(app, /className="current-tool"/)
})

test('every document has a tab, and the row ends with < and >', () => {
  const panels = read('src/panels.tsx')
  const tabs = panels.slice(panels.indexOf('export function DocumentTabs('), panels.indexOf('export function PanelSwitch('))
  assert.doesNotMatch(tabs, /documents\.length < 2\) return null/, 'one document hides the tab row')
  assert.ok(tabs.indexOf('doc-tabs-strip') < tabs.indexOf('doc-tabs-nav'), 'the < > are not at the right end')
  assert.match(tabs, /data-action="doc-tabs-prev"[\s\S]*<ChevronLeft/)
  assert.match(tabs, /data-action="doc-tabs-next"[\s\S]*<ChevronRight/)
  assert.match(tabs, /disabled=\{!room\.left\}/)
  assert.match(tabs, /disabled=\{!room\.right\}/)
  assert.match(tabs, /<FileImage size=\{13\}/, 'a tab has no icon')
  assert.match(block('.doc-tabs-strip {'), /overflow-x: auto/)
  for (const key of ['docTabsPrev', 'docTabsNext']) for (const language of ['ko', 'en']) assert.notEqual(t(language, key), key)
})

test('an opened file gets a tab of its own; only the untouched blank start document is replaced', () => {
  assert.match(app, /if \(slotsRef\.current\.size > 0 && \(dirtyRef\.current \|\| docRef\.current\.source \|\| undoRef\.current\.length > 0\)\) \{\n\s*openInNewSlot/)
  assert.match(app, /item\.id === activeDocId \? \{ \.\.\.item, name: doc\.name, dirty, active: true \}/, 'the active tab shows a stale name')
})

/* ------------------------------------------------------------ right panel */

test('the right panel has a title bar of its own, named for the whole panel, with the fold button', () => {
  assert.equal(t('ko', 'panelTitle'), '작업 패널')
  assert.equal(t('en', 'panelTitle'), 'Work Panels')
  const header = app.slice(app.indexOf('<header className="panel-title"'), app.indexOf('</header>', app.indexOf('<header className="panel-title"')))
  assert.match(header, /<PanelsRightBottom size=\{16\}/)
  assert.match(header, /className="panel-collapse"/)
  assert.doesNotMatch(header, /panelLabelKey\(settings\.rightTab\)/, 'the title bar names the chosen tab instead of the panel')
})

test('folded, the strip still shows the title, written down it', () => {
  assert.doesNotMatch(css, /\.workspace\.panel-closed \.panel-title h2 \{\s*display: none/)
  assert.match(block('.workspace.panel-closed .panel-title h2 {'), /writing-mode: vertical-rl/)
  assert.match(block('.workspace.panel-closed .panel > :not(.panel-title) {'), /display: none/)
})

test('a slider in the right panel reads: decrease, track, value with unit, increase', () => {
  assert.match(block('.panel .slider-stepper .slider-step-box {'), /display: contents/)
  const order = (selector) => Number(/(?:^|\s)order: (\d)/.exec(block(selector))[1])
  assert.deepEqual([
    order('.panel .slider-stepper .slider-step:first-child {'),
    order(".panel .slider-stepper > input[type='range'] {"),
    order('.panel .slider-stepper .slider-value {'),
    order('.panel .slider-stepper .slider-step:last-child {'),
  ], [0, 1, 2, 3])
})

/* ----------------------------------------------------------- bottom panel */

test('the bottom panel has Problems, Errors and Log, and its button sits left of the right panel button', () => {
  const panel = read('src/BottomPanel.tsx')
  assert.match(panel, /const BOTTOM_TABS: BottomTab\[\] = \['problems', 'errors', 'log'\]/)
  for (const tab of ['problems', 'errors', 'log']) for (const language of ['ko', 'en']) assert.notEqual(t(language, `bottom_${tab}`), `bottom_${tab}`)
  const bottom = app.indexOf('data-action="toggle-bottom-panel"')
  const right = app.indexOf('data-action="toggle-panel-bar"')
  const theme = app.indexOf('className="menu-group theme-menu-group"')
  assert.ok(bottom > 0 && bottom < right && right < theme, 'the order is not bottom, right, theme')
  assert.ok(findCommand('window.toggleBottomPanel'), 'the Window menu cannot show or hide it')
  // It lives in the centre column, under the canvas: between the left and right panels.
  const column = app.slice(app.indexOf('<div className="stage-column">'), app.indexOf('className="resize-handle"'))
  assert.match(column, /<BottomPanel\n\s*open=\{settings\.bottomOpen\}\n\s*onToggle=\{\(\) => runCommand\('window\.toggleBottomPanel'\)\}/, 'the bottom panel is not between the side panels')
  assert.ok(column.indexOf('className="canvas-stage"') < column.indexOf('<BottomPanel'), 'the bottom panel is not under the canvas')
  assert.equal(app.split('<BottomPanel').length - 1, 1, 'there is a second bottom panel')
  assert.equal(defaultSettings.bottomOpen, true)
  assert.equal(defaultSettings.bottomTab, 'problems')
})

test('the bottom panel settings survive storage and repair bad values', () => {
  localStorage.setItem('my-photo-work-v1-settings', JSON.stringify({ bottomOpen: false, bottomTab: 'log' }))
  let loaded = loadSettings()
  assert.equal(loaded.bottomOpen, false)
  assert.equal(loaded.bottomTab, 'log')
  localStorage.setItem('my-photo-work-v1-settings', JSON.stringify({ bottomOpen: 'yes', bottomTab: 'nope' }))
  loaded = loadSettings()
  assert.equal(loaded.bottomOpen, true)
  assert.equal(loaded.bottomTab, 'problems')
  localStorage.removeItem('my-photo-work-v1-settings')
})

test('the log keeps entries in order, tells listeners, clears by level and is bounded', () => {
  clearLog()
  const seen = []
  const stop = subscribeLog((list) => seen.push(list.length))
  addLog('info', 'command', 'Invert (image.invert)')
  addLog('error', 'main', 'Open failed', 'stack…')
  addLog('warn', 'file', 'big picture')
  assert.deepEqual(logEntries().map((entry) => entry.level), ['info', 'error', 'warn'])
  assert.deepEqual(seen, [1, 2, 3])
  assert.match(logText(logEntries()), /\[ERROR\] main: Open failed\nstack…/)
  assert.match(logTime(Date.UTC(2026, 0, 1, 3, 4, 5)), /^\d\d:04:05$/)
  clearLog('error')
  assert.deepEqual(logEntries().map((entry) => entry.level), ['info', 'warn'])
  for (let i = 0; i < LOG_LIMIT + 20; i += 1) addLog('info', 'x', String(i))
  assert.equal(logEntries().length, LOG_LIMIT)
  stop()
  clearLog()
})

test('errors reach the Errors tab, and every command and opened file reaches the Log', () => {
  assert.match(app, /logError\(source, `\$\{report\.title\}: \$\{report\.message\}`, report\.details\)/)
  assert.match(app, /const runCommand = \(id: string\) => \{\n\s*\{\n\s*const command = findCommand\(id\)\n\s*logInfo\('command'/)
  assert.match(app, /logInfo\('file', file\.path \|\| file\.name\)/)
})

test('problems list what is wrong with the document now, worst first', () => {
  const tr = (key) => t('en', key)
  assert.deepEqual(documentProblems({ dirty: false, width: 800, height: 600, hiddenLayers: 0, emptyLayers: 0, activeLocked: false }, tr), [])
  const list = documentProblems({ dirty: true, width: 10000, height: 8000, hiddenLayers: 2, emptyLayers: 0, activeLocked: true }, tr)
  assert.deepEqual(list.map((item) => item.id), ['unsaved', 'huge', 'locked', 'hidden'])
  assert.match(list[1].message, /10000×8000/)
  assert.match(list[3].message, /^2 /)
})

test('the button audit is a script of its own (npm run test:icons)', () => {
  const pkg = JSON.parse(read('package.json'))
  assert.equal(pkg.scripts['test:icons'], 'node scripts/audit-icons.mjs')
  const audit = read('scripts/audit-icons.mjs')
  for (const part of ['.panel-tabs button', '.menu-bar .menu-group > button', "button: 'right'", '__mpw.openDialog', '.settings-tabs button']) assert.ok(audit.includes(part), `the audit skips ${part}`)
})

/* ---------------------------------------------------------------- canvas */

test('everything on the stage that is not picture shows a checkerboard in the theme\'s tones', async () => {
  const draw = app.slice(app.indexOf('const checkLight = '), app.indexOf('// A live transform or a window'))
  assert.match(draw, /getPropertyValue\('--stage-check-a'\)/, 'the checkerboard does not follow the theme')
  assert.match(draw, /getPropertyValue\('--stage-check-b'\)/)
  assert.match(draw, /transparencyTile\(checkLight, checkDark\)/)
  assert.match(draw, /ctx\.fillRect\(0, 0, width, height\)/, 'the checkerboard does not cover the whole stage')
  assert.match(draw, /strokeRect\(/, 'the canvas edge is not marked')
  assert.match(app, /const TRANSPARENCY_FALLBACK = \['#ffffff', '#cccccc'\] as const/)
  assert.match(app, /if \(transparencyTileCache\?\.key === key\) return/, 'a theme change keeps the old tile')
  // Every theme defines both tones; a light theme stays white and grey, a dark one goes dark.
  const { themes } = await import('../src/themes.ts')
  for (const theme of themes) {
    assert.ok(theme.vars['--stage-check-a'] && theme.vars['--stage-check-b'], `${theme.id} has no checkerboard tones`)
  }
  const light = themes.find((theme) => theme.kind === 'light')
  const dark = themes.find((theme) => theme.kind === 'dark')
  assert.equal(light.vars['--stage-check-a'], '#ffffff')
  assert.notEqual(dark.vars['--stage-check-a'], '#ffffff')
})

test('a file dropped on the start screen opens in the main window', () => {
  const drop = app.slice(app.indexOf('const handleDrop = async'), app.indexOf('const handleDragOver'))
  assert.match(drop, /const fromStart = startOn\n\s*if \(fromStart\) \{\n\s*setStartOn\(false\)/, 'the start screen stays over the opened file')
  assert.match(drop, /openFiles\(items, !fromStart && dirtyRef\.current \? 'place' : 'open'\)/, 'a drop on the start screen is placed into the document behind it')
  const shell = app.slice(app.indexOf('className={`app-shell'), app.indexOf('className={`app-shell') + 600)
  assert.match(shell, /onDrop=\{\(event\) => void handleDrop\(event\)\}/, 'the drop is not caught at the top of the window')
})

test('the canvas has a horizontal and a vertical scrollbar that move the pan', async () => {
  const { KEEP, scrollAxis, panForStart } = await import('../src/lib/scrollAxis.ts')
  const column = app.slice(app.indexOf('className="canvas-stage"'), app.indexOf('className="resize-handle"'))
  assert.match(column, /<StageScrollbars[\s\S]*?onPan=\{setPan\}/, 'the stage has no scrollbars')
  const bars = readFileSync(path.join(root, 'src/StageScrollbars.tsx'), 'utf8')
  assert.match(bars, /axis\('x'\)/)
  assert.match(bars, /axis\('y'\)/)
  // A picture larger than the view: the thumb is smaller than the track and moves with the pan.
  const start = scrollAxis(800, 2000, 800 - KEEP)
  assert.equal(start.start, 0, 'with the picture at the far end the thumb is at the start')
  assert.ok(start.size > 0 && start.size < 1)
  const end = scrollAxis(800, 2000, KEEP - 2000)
  assert.ok(Math.abs(end.start + end.size - 1) < 1e-9, 'at the other end the thumb reaches the end')
  // Dragging the thumb to a place and reading it back gives the same pan.
  for (const pan of [700, 100, -500, -1100]) {
    const model = scrollAxis(800, 2000, pan)
    assert.ok(Math.abs(panForStart(800, 2000, model.start) - pan) < 1e-6, `pan ${pan} does not round-trip`)
  }
  assert.match(css, /\.stage-scroll-h \{[^}]*bottom: 0/)
  assert.match(css, /\.stage-scroll-v \{[^}]*right: 0/)
})

test('the chosen tool is not described under the tabs; its description goes to the Log', () => {
  assert.doesNotMatch(app, /className="option-hint"/, 'the tool description is still shown over the canvas')
  assert.match(app, /if \(control\.kind === 'hint'\) return null/)
  assert.match(app, /logInfo\('tool', hints\.length \?/)
  assert.ok(app.indexOf('const settingsRef = useRef(settings)') < app.indexOf("logInfo('tool'"), 'the tool log reads settings before they exist')
})

test('Problems, Errors and Log each have Copy and Clear', async () => {
  const panel = readFileSync(path.join(root, 'src/BottomPanel.tsx'), 'utf8')
  assert.doesNotMatch(panel, /tab !== 'problems' && \(/, 'the buttons are hidden on one of the tabs')
  assert.match(panel, /data-action="bottom-copy"[\s\S]*<Copy size=/)
  assert.match(panel, /data-action="bottom-clear"[\s\S]*<Trash size=/)
  const { problemKey, problemText } = await import('../src/lib/appLog.ts')
  const list = [{ id: 'unsaved', level: 'warn', message: 'There are unsaved changes' }, { id: 'hidden', level: 'info', message: '2 hidden layer(s)' }]
  assert.equal(problemText(list), '[WARN] There are unsaved changes\n[INFO] 2 hidden layer(s)')
  assert.notEqual(problemKey(list[1]), problemKey({ ...list[1], message: '3 hidden layer(s)' }), 'a changed problem stays dismissed')
})

test('the bottom panel has its own title bar with a fold button at the right; folded, the title and icon stay', () => {
  const panel = readFileSync(path.join(root, 'src/BottomPanel.tsx'), 'utf8').replace(/\r\n/g, '\n')
  const header = panel.slice(panel.indexOf('<header className="bottom-panel-bar">'), panel.indexOf('</header>'))
  assert.ok(header.indexOf('<SquareTerminal') < header.indexOf("tr('bottomPanelTitle')") && header.indexOf("tr('bottomPanelTitle')") < header.indexOf('data-action="bottom-panel-fold"'), 'the bar is not icon, title, … fold button')
  assert.equal(header.slice(header.lastIndexOf('<button')).includes('bottom-panel-fold'), true, 'the fold button is not the last thing in the bar')
  // The title is outside every open-only part, so a folded panel still shows it.
  const title = header.indexOf('bottom-panel-title')
  assert.ok(title < header.indexOf('{open && ('), 'the title is hidden when folded')
  assert.match(panel, /className=\{`bottom-panel\$\{open \? '' : ' collapsed'\}`\}/)
  assert.match(block('.bottom-panel.collapsed {'), /height: auto/)
  for (const language of ['ko', 'en']) assert.notEqual(t(language, 'bottomPanelTitle'), 'bottomPanelTitle')
})

test('npm run tutorial:video records the tutorial and copies the MP4 to the project root', () => {
  const pkg = JSON.parse(read('package.json'))
  assert.equal(pkg.scripts['tutorial:video'], 'node scripts/tutorial-video.mjs')
  const script = read('scripts/tutorial-video.mjs')
  assert.match(script, /window\.__mpw\.run\('help\.tutorial'\)/, 'it does not record the real tour')
  assert.match(script, /data-action=tutorial-next/)
  assert.match(script, /fs\.copyFileSync\(output, path\.join\(root, NAME\)\)/, 'the video is not copied to the project root')
  assert.match(script, /'-c:v', 'libx264'/)
})

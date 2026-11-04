// The desktop shell, the bridge to it, the tutorial and the Help menu. The shell itself is
// covered further by npm run test:rust, and the windows by npm run test:e2e.
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { DRAG_REGIONS, installTauriBridge, isTauriShell } from '../src/host/tauriBridge.ts'
import { DEFAULT_SPEC, DIALOG_SPECS, dialogSpec } from '../src/dialogSpecs.ts'
import { guideAppearance } from '../src/host/userGuide.ts'
import { TUTORIAL_STEPS, placeCard } from '../src/tutorial/steps.ts'
import { commands } from '../src/commands.ts'
import { t } from '../src/i18n.ts'

const url = (relative) => new URL(`../${relative}`, import.meta.url)
const read = (relative) => readFileSync(url(relative), 'utf8').replace(/\r\n/g, '\n')
const conf = JSON.parse(read('src-tauri/tauri.conf.json'))
const pkg = JSON.parse(read('package.json'))
const shell = read('src-tauri/src/lib.rs')
const bridge = read('src/host/tauriBridge.ts')

test('Electron is gone', () => {
  assert.ok(!existsSync(url('electron')), 'the electron folder is back')
  for (const name of ['electron', 'electron-builder', 'concurrently', 'wait-on']) {
    assert.ok(!pkg.devDependencies[name] && !pkg.dependencies[name], `${name} is still a dependency`)
  }
  assert.equal(pkg.main, undefined)
  assert.equal(pkg.build, undefined)
  assert.ok(pkg.dependencies['@tauri-apps/api'])
  assert.ok(pkg.devDependencies['@tauri-apps/cli'])
  assert.doesNotMatch(read('src/App.css'), /-webkit-app-region/, 'a rule only Electron understood')
  for (const file of ['src/App.tsx', 'src/DialogHost.tsx', 'src/MenuHost.tsx', 'src/aboutInfo.ts', 'src/lib/models.ts']) {
    assert.doesNotMatch(read(file), /electron/i, `${file} still talks about Electron`)
  }
})

test('the bridge is installed before anything renders, and only in the shell', () => {
  const main = read('src/main.tsx')
  assert.ok(main.indexOf('installTauriBridge()') < main.indexOf('createRoot('), 'components would read the APIs before they exist')
  assert.equal(isTauriShell(), false)
  installTauriBridge()
  assert.equal(window.hostFileApi, undefined, 'a browser must not think it is on the desktop')
})

test('every command the page calls is registered by the shell, and the reverse', () => {
  const called = new Set([...bridge.matchAll(/invoke(?:<[^>]*>)?\('(\w+)'/g)].map((match) => match[1]))
  const handler = shell.slice(shell.indexOf('generate_handler!['), shell.indexOf('])', shell.indexOf('generate_handler![')))
  const registered = new Set([...handler.matchAll(/(\w+),/g)].map((match) => match[1]))
  for (const name of called) assert.ok(registered.has(name), `the page calls ${name}, which the shell does not register`)
  for (const name of registered) assert.ok(called.has(name), `${name} is registered but never called`)
})

test('the main window waits for the page, and asks it before closing', () => {
  assert.match(shell, /\.visible\(false\)/, 'a blank window would flash up')
  assert.match(read('src/App.tsx'), /window\.hostWindowApi\?\.ready\(\)/, 'the page never says it is ready')
  assert.match(shell, /Duration::from_secs\(8\)[\s\S]*?show_main/, 'a page that fails would leave no window at all')
  assert.match(shell, /api\.prevent_close\(\);\s+let _ = app\.emit_to\("main", "window:close-request"/, 'unsaved work would be lost on close')
})

test('dropping a file is left to the page', () => {
  assert.match(shell, /\.disable_drag_drop_handler\(\)/, 'Tauri would swallow the drop that handleDrop in App.tsx expects')
})

test('the window remembers its place, and a test run stays out of the user’s data', () => {
  assert.match(shell, /fn remember_window/, 'the window forgets its place')
  assert.match(shell, /fn keep_on_screen/, 'a window could open on a monitor that is gone')
  assert.match(shell, /var_os\("MPW_DATA_DIR"\)\.is_none\(\)[\s\S]*?tauri_plugin_single_instance/, 'a test run would hand over to an installed copy')
})

test('the frameless window can be moved by its bars but not by its controls', () => {
  for (const region of ['.title-bar', '.menu-bar', '.dialog-title-bar']) assert.ok(DRAG_REGIONS.includes(region), `${region} cannot move the window`)
  assert.match(bridge, /NOT_DRAG = 'button/, 'pressing a button would drag the window')
  assert.match(bridge, /event\.key === 'F5'/, 'F5 would reload the page and lose the document')
})

test('the installer asks for its language and the data folder agrees with the shell', () => {
  const nsis = conf.bundle.windows.nsis
  assert.deepEqual(nsis.languages, ['Korean', 'English'])
  assert.equal(nsis.displayLanguageSelector, true)
  const folder = read('src-tauri/windows/hooks.nsh').match(/!define MPW_DATA_FOLDER "([^"]+)"/)[1]
  assert.equal(shell.match(/const DATA_FOLDER: &str = "([^"]+)"/)[1], folder)
  assert.match(read('src-tauri/windows/hooks.nsh'), /\$\{IfNot\} \$\{Silent\}/, 'an upgrade could delete the models')
})

test('versions agree and the About facts name the new shell', () => {
  assert.equal(conf.version, pkg.version)
  assert.match(read('src-tauri/Cargo.toml'), new RegExp(`^version = "${pkg.version}"`, 'm'))
  assert.match(read('src/aboutInfo.ts'), /Tauri \$\{versions\.tauri\}/)
})

test('a dialog with no size of its own gets the default', () => {
  assert.equal(dialogSpec('print'), DIALOG_SPECS.print)
  assert.equal(dialogSpec('nothing-like-this'), DEFAULT_SPEC)
})

/* -------------------------------------------------------- guide and help */

test('the guide takes its colours and language from the app', () => {
  const look = guideAppearance('sakura', 'en')
  assert.equal(look.mode, 'light')
  assert.equal(look.language, 'en')
  assert.ok(look.vars['--accent'])
  assert.match(read('src/App.tsx'), /publishGuideAppearance\(settings\.theme, settings\.language\)/, 'the guide is never told')
})

test('the guide can be opened from the Help menu, its key, the short help and the start screen', () => {
  const guide = commands.find((command) => command.id === 'help.guide')
  assert.equal(guide.menu, 'helpMenu')
  assert.equal(guide.accel, 'F1')
  const app = read('src/App.tsx')
  assert.match(app, /event\.key === 'F1'/, 'F1 does nothing')
  assert.match(app, /case 'help\.guide': void openUserGuide\(language\)/)
  const help = read('src/dialogs.tsx')
  const short = help.slice(help.indexOf("case 'helpGuide':"), help.indexOf("case 'about': {"))
  assert.match(short, /openUserGuide\(language\)/, 'the short help has no button for the guide')
  assert.match(read('src/start/StartScreen.tsx'), /onAction\('guide'\)/, 'the start screen has no button for the guide')
  assert.match(shell, /doc\/index\.html\?lang=/, 'the shell does not open the guide page')
})

/* --------------------------------------------------------------- tutorial */

test('the tutorial asks at launch, for as long as its box stays ticked', () => {
  const app = read('src/App.tsx')
  assert.match(app, /useState\(\(\) => settings\.tutorialAskOnLaunch\)/, 'the popup does not follow the setting')
  assert.match(app, /tutorialAsk && <TutorialAsk /, 'the popup is never shown')
  assert.match(app, /tutorialAskOnLaunch: askAgain/, 'the answer is not remembered')
  assert.ok(commands.some((command) => command.id === 'help.tutorial'), 'there is no way to run it later')
})

test('every tutorial step is explained in both languages and points at something that exists', () => {
  const sources = [read('src/App.tsx'), read('src/start/StartScreen.tsx')].join('\n')
  assert.ok(TUTORIAL_STEPS.length >= 10)
  assert.equal(new Set(TUTORIAL_STEPS.map((step) => step.id)).size, TUTORIAL_STEPS.length)
  for (const step of TUTORIAL_STEPS) {
    assert.ok(step.title.ko && step.title.en && step.body.ko && step.body.en, `${step.id} is not translated`)
    assert.ok(step.screen === 'start' || step.screen === 'editor')
    const name = /[.[]([\w-]+)/.exec(step.target.split(' ').pop())[1]
    assert.ok(sources.includes(name) || name === 'data-menu', `${step.id} points at ${step.target}, which nothing renders`)
  }
  assert.equal(TUTORIAL_STEPS[0].target, '.start-toggle', 'the tour should begin with the Start Screen button')
})

test('the tutorial card stays inside the window', () => {
  const size = [1280, 700]
  const boxes = [null, { left: 0, top: 0, right: 40, bottom: 30 }, { left: 1270, top: 680, right: 1280, bottom: 700 }, { left: 0, top: 0, right: 1280, bottom: 700 }]
  for (const box of boxes) {
    const { left, top } = placeCard(box, ...size)
    assert.ok(left >= 0 && left + 360 <= size[0], `the card leaves the window sideways at ${left}`)
    assert.ok(top >= 0 && top + 210 <= size[1], `the card leaves the window vertically at ${top}`)
  }
})

test('the tutorial strings exist in both languages', () => {
  for (const key of ['tutorial', 'tutorialAskTitle', 'tutorialAskBody', 'tutorialAskHint', 'tutorialAskAgain', 'tutorialLater', 'tutorialRun', 'tutorialPrev', 'tutorialNext', 'tutorialDone', 'tutorialAskSetting', 'helpMenu', 'userGuide', 'userGuideOpen', 'startScreen']) {
    assert.notEqual(t('ko', key), key, `${key} has no Korean`)
    assert.notEqual(t('en', key), key, `${key} has no English`)
  }
})

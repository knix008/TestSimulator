// The single toolbar row, the resize marker, and the About window's facts.
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { aboutFacts } from '../src/aboutInfo.ts'
import { t } from '../src/i18n.ts'

const root = new URL('..', import.meta.url)
const read = (relative) => readFileSync(fileURLToPath(new URL(relative, root)), 'utf8')
const appSource = read('src/App.tsx')
const cssSource = read('src/App.css')
const dialogSource = read('src/dialogs.tsx')
const mainProcess = read('electron/main.cjs')

/* --------------------------------------------------------- the toolbar row */

test('the task actions and the colour controls live on the toolbar row', () => {
  const toolBar = appSource.slice(appSource.indexOf('className="tool-bar"'), appSource.indexOf('className="options-bar"'))
  for (const key of ['selectSubject', 'removeBg', 'genFill', 'harmonize', 'foreground', 'backgroundColor', 'swap']) {
    assert.ok(toolBar.includes(`tr('${key}')`), `${key} is not on the toolbar row`)
  }
  // …and no longer below it.
  const options = appSource.slice(appSource.indexOf('className="options-bar"'), appSource.indexOf('className="workspace"'))
  assert.ok(!options.includes("tr('harmonize')"), 'the task actions are still in the options bar')
  assert.ok(!options.includes("tr('swap')"), 'the colour controls are still in the options bar')
})

test('the colours follow the task actions rather than hugging the right edge', () => {
  const toolBar = appSource.slice(appSource.indexOf('className="tool-bar"'), appSource.indexOf('className="options-bar"'))
  assert.ok(toolBar.indexOf("tr('harmonize')") < toolBar.indexOf("tr('foreground')"), 'the colours come before the tasks')
  const rule = cssSource.slice(cssSource.indexOf('.tool-bar-colors {'))
  assert.ok(!rule.slice(0, rule.indexOf('}')).includes('margin-left: auto'), 'the colours are pushed to the right edge')
})

test('the toolbar is one line that never scrolls', () => {
  // There are several `.tool-bar` rules; the layout one is the one that matters.
  const layout = cssSource.slice(cssSource.indexOf('/* One line, never scrolled'))
  const block = layout.slice(0, layout.indexOf('}'))
  assert.match(block, /overflow: hidden/, 'the toolbar scrolls, which hides buttons')
  assert.ok(!cssSource.includes('.tool-bar::-webkit-scrollbar'), 'the toolbar still has a scrollbar')
})

test('the window cannot be made narrower than the toolbar row needs', () => {
  // Measured at 1277px with every command, task action and colour control.
  assert.match(mainProcess, /const minimumWindowSize = \{ width: 1320, height: 720 \}/, 'no minimum is declared')
  assert.match(mainProcess, /minWidth: minimumWindowSize\.width/, 'the minimum width is not applied')
  assert.match(mainProcess, /minHeight: minimumWindowSize\.height/, 'the minimum height is not applied')
  const minWidth = Number(mainProcess.match(/minimumWindowSize = \{ width: (\d+)/)[1])
  assert.ok(minWidth >= 1290, `${minWidth} is narrower than the toolbar needs`)
})

test('the task actions are icon-only but still named for the reader', () => {
  const toolBar = appSource.slice(appSource.indexOf('tool-bar-group tool-bar-tasks'), appSource.indexOf('className="options-bar"'))
  for (const key of ['selectSubject', 'removeBg', 'genFill', 'harmonize', 'swap']) {
    assert.ok(toolBar.includes(`aria-label={tr('${key}')}`), `${key} has no accessible name`)
    assert.ok(toolBar.includes(`data-tooltip={tr('${key}')}`), `${key} has no tooltip`)
  }
})

/* ----------------------------------------------------------- resize marker */

test('a resize marker is drawn in the bottom-right corner', () => {
  assert.match(appSource, /className="resize-grip"/, 'the frameless window shows no resize corner')
  const rule = cssSource.slice(cssSource.indexOf('.resize-grip {'))
  const block = rule.slice(0, rule.indexOf('}'))
  assert.match(block, /position: fixed/, 'the marker does not sit in the corner')
  assert.match(block, /right: 0/)
  assert.match(block, /bottom: 0/)
  // It must not swallow the drag: the OS owns the corner.
  assert.match(block, /pointer-events: none/, 'the marker would block the real resize handle')
  assert.ok(cssSource.includes('.resize-grip::after'), 'nothing is actually drawn')
})

/* ------------------------------------------------------------ about window */

test('the build info is generated and carries what a bug report needs', () => {
  assert.ok(existsSync(fileURLToPath(new URL('src/build-info.json', root))), 'run npm run build:info')
  const info = JSON.parse(read('src/build-info.json'))
  for (const key of ['name', 'version', 'description', 'author', 'buildTime', 'node', 'electron', 'react', 'vite']) {
    assert.ok(info[key], `build-info.json has no ${key}`)
  }
  assert.match(info.version, /^\d+\.\d+\.\d+$/)
  assert.ok(!Number.isNaN(Date.parse(info.buildTime)), 'the build time is not a date')
})

test('the build info is refreshed before every build', () => {
  const pkg = JSON.parse(read('package.json'))
  assert.match(pkg.scripts.build, /build:info/, 'a build could ship a stale build stamp')
  assert.match(pkg.scripts.dev, /build:info/, 'the dev server would show a stale build stamp')
  assert.equal(pkg.scripts['build:info'], 'node scripts/generate-build-info.cjs')
})

test('the generator survives a source drop with no git repository', () => {
  const script = read('scripts/generate-build-info.cjs')
  assert.match(script, /catch \{/, 'a missing git would break the build')
  assert.match(script, /return ''/, 'a missing commit has no fallback')
})

test('the About window lists version, build, author and runtime', () => {
  for (const language of ['ko', 'en']) {
    const facts = aboutFacts(language)
    const labels = facts.map((fact) => fact.label)
    for (const key of ['aboutVersion', 'aboutBuilt', 'aboutCreator', 'aboutLicense', 'aboutRuntime', 'aboutBuiltWith']) {
      assert.ok(labels.includes(t(language, key)), `${language} About is missing ${key}`)
    }
    for (const fact of facts) {
      assert.ok(String(fact.value).trim().length > 0, `${fact.label} has no value`)
      assert.ok(!/^about[A-Z]/.test(fact.label), `${fact.label} is an untranslated key`)
    }
  }
})

test('the About window falls back gracefully outside the desktop shell', () => {
  // In the browser build there is no Electron to report versions for.
  const facts = aboutFacts('en')
  const runtime = facts.find((fact) => fact.label === t('en', 'aboutRuntime'))
  assert.ok(runtime, 'no runtime row')
  assert.equal(runtime.value, t('en', 'aboutBrowser'), 'the browser build should say so rather than showing blanks')
  assert.ok(!facts.some((fact) => fact.label === t('en', 'aboutPlatform')), 'the platform row needs Electron')
})

test('the About window puts the description beside the icon, with the facts below', () => {
  const about = dialogSource.slice(dialogSource.indexOf("case 'about': {"), dialogSource.indexOf("case 'error':"))
  assert.match(about, /className="about-head"/, 'the icon and the blurb are not laid out together')
  assert.match(about, /className="about-icon"/, 'there is no icon')
  assert.match(about, /className="about-blurb"/, 'there is no description beside it')
  assert.match(about, /<dl className="about-facts">/, 'the facts are not a list')
  assert.match(about, /facts\.map/, 'the facts are hard-coded rather than generated')

  const head = cssSource.slice(cssSource.indexOf('.about-head {'))
  assert.match(head.slice(0, head.indexOf('}')), /display: flex/, 'the icon and blurb are not side by side')
})

test('every About fact can be copied in one go', () => {
  const about = dialogSource.slice(dialogSource.indexOf("case 'about': {"), dialogSource.indexOf("case 'error':"))
  assert.match(about, /facts\.map\(\(fact\) => `\$\{fact\.label\}: \$\{fact\.value\}`\)/, 'the copy leaves the facts out')
  assert.match(about, /copyText\(/, 'there is no copy button')
})

test('the About and Settings windows are wide enough not to scroll', () => {
  const specs = readFileSync(fileURLToPath(new URL('electron/childwindows.cjs', root)), 'utf8')
  const about = Number(specs.match(/about: \{ width: (\d+)/)[1])
  assert.ok(about >= 520, `the About window is only ${about}px wide, which squeezes the fact rows`)
  for (const name of ['about', 'settings']) {
    assert.ok(
      cssSource.includes(`.dialog-window .${name}-dialog .dialog-content`),
      `the ${name} window can still show a scrollbar`,
    )
  }
})

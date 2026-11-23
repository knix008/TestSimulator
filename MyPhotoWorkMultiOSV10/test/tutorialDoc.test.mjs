// The tutorial document (Help → Tutorial document): doc/Tutorial.md and Tutorial.en.md built
// into doc/tutorial.html with the same template as the user guide, opened in a window of
// its own on the desktop and in a new tab in a browser.
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { DOCUMENTS, buildGuide, buildTutorial } from '../scripts/build-guide.mjs'

const url = (relative) => new URL(`../${relative}`, import.meta.url)
const read = (relative) => readFileSync(url(relative), 'utf8').replace(/\r\n/g, '\n')
const head = (page) => page.slice(page.indexOf('<header class="doc-head">'), page.indexOf('</header>'))

test('the tutorial page is up to date with its Markdown', () => {
  assert.ok(existsSync(url('doc/Tutorial.md')))
  assert.ok(existsSync(url('doc/Tutorial.en.md')))
  assert.equal(read('doc/tutorial.html'), buildTutorial().replace(/\r\n/g, '\n'), 'run npm run build:guide')
  assert.equal(DOCUMENTS.tutorial.out, 'tutorial.html')
})

test('the tutorial page has the same header as the user guide: font, size, language, Print', () => {
  const tutorial = read('doc/tutorial.html')
  const guide = buildGuide()
  // Only the titles differ; the controls are the same markup.
  const controls = (page) => head(page).slice(head(page).indexOf('<div class="tools">'))
  assert.equal(controls(tutorial), controls(guide).replace(/\r\n/g, '\n'), 'the tutorial header has different controls')
  assert.match(head(tutorial), /class="lang-group"/)
  assert.match(head(tutorial), /id="print-button"/)
  assert.match(tutorial, /<link rel="stylesheet" href="manual.css">/)
  assert.match(tutorial, /<script src="manual.js"><\/script>/)
  assert.match(tutorial, /data-doc="tutorial" data-title-ko="My Photo Work 튜토리얼 문서" data-title-en="My Photo Work Tutorial"/)
  assert.match(read('doc/manual.js'), /body\.dataset\[language === 'en' \? 'titleEn' : 'titleKo'\]/, 'the window title would say User Guide')
})

test('the tutorial is in both languages with matching steps and pictures that exist', () => {
  const ko = read('doc/Tutorial.md')
  const en = read('doc/Tutorial.en.md')
  assert.equal(ko.split('\n## ').length, en.split('\n## ').length, 'the languages have a different number of steps')
  assert.ok(ko.split('\n## ').length >= 10, 'too few steps')
  const pictures = (text) => [...text.matchAll(/!\[[^\]]*\]\(images\/((?:tutorial\/)?(?:ko|en))\/([\w-]+\.(?:png|jpg))\)/g)]
  assert.deepEqual(pictures(ko).map((m) => m[2]), pictures(en).map((m) => m[2]), 'the languages show different pictures')
  for (const match of [...pictures(ko), ...pictures(en)]) assert.ok(existsSync(url(`doc/images/${match[1]}/${match[2]}`)), `${match[0]} is missing`)
  const page = read('doc/tutorial.html')
  assert.match(page, /<article class="ko">[\s\S]*<h2>/)
  assert.match(page, /<article class="en">[\s\S]*<h2>/)
})

test('the desktop opens it in a window of its own, a browser in a new tab', () => {
  const rust = read('src-tauri/src/lib.rs')
  assert.match(rust, /async fn open_tutorial_doc\(app: AppHandle, language: String\)/)
  assert.match(rust, /open_document\(&app, TUTORIAL_DOC, "doc\/tutorial\.html"/)
  assert.match(rust, /generate_handler!\[[\s\S]*open_tutorial_doc,/, 'the command is not registered')
  assert.match(rust, /for label in \[GUIDE, TUTORIAL_DOC\]/, 'quitting leaves the tutorial window open')
  assert.match(read('src/host/tauriBridge.ts'), /openTutorial: \(language\) => invoke\('open_tutorial_doc', \{ language \}\)/)
  const opener = read('src/host/userGuide.ts')
  assert.match(opener, /export async function openTutorialDoc\(language: string\)/)
  assert.match(opener, /window\.open\(`\.\/doc\/tutorial\.html\?lang=/)
  // The build copies doc/ but not the Markdown, so tutorial.html ships like index.html.
  assert.match(read('vite.config.ts'), /cpSync\(docDir, path\.join\(projectRoot, 'dist', 'doc'\)/)
})

/* ------------------------------------------------- the hands-on walkthrough */

const { HANDS_ON, SAMPLE_ID } = await import('../scripts/tutorial-walkthrough.mjs')
const { t, toolLabel } = await import('../src/i18n.ts')
const steps = (text) => text.split('\n## ').slice(1).map((section) => section.split('\n')[0])

test('the walkthrough is done on the red-bikini sample, in both languages', async () => {
  const { SAMPLE_IMAGES } = await import('../src/lib/sampleImages.ts')
  const sample = SAMPLE_IMAGES.find((item) => item.id === SAMPLE_ID)
  assert.ok(sample, 'the walkthrough sample is not one of the samples')
  assert.ok(read('doc/Tutorial.md').includes(`**${sample.name.ko}**`), 'the Korean walkthrough does not name the sample')
  assert.ok(read('doc/Tutorial.en.md').includes(`**${sample.name.en}**`), 'the English walkthrough does not name the sample')
})

test('both languages have the same numbered steps, a basics part and a hands-on part', () => {
  const ko = steps(read('doc/Tutorial.md'))
  const en = steps(read('doc/Tutorial.en.md'))
  assert.equal(ko.length, en.length)
  const koNumbers = ko.map((title) => /^(\d+)단계/.exec(title)?.[1]).filter(Boolean).map(Number)
  const enNumbers = en.map((title) => /^Step (\d+)/.exec(title)?.[1]).filter(Boolean).map(Number)
  assert.deepEqual(koNumbers, enNumbers, 'the steps are numbered differently in the two languages')
  assert.deepEqual(koNumbers, koNumbers.map((_, index) => index + 1), 'the steps are not numbered 1, 2, 3 …')
  // Part 1 (the basics) plus one step per hands-on edit.
  assert.ok(koNumbers.length >= 7 + HANDS_ON.length, 'a hands-on edit has no step of its own')
})

test('every hands-on edit in the scripts has a step with its picture in the document', () => {
  for (const [file, language] of [['doc/Tutorial.md', 'ko'], ['doc/Tutorial.en.md', 'en']]) {
    const text = read(file)
    for (const step of HANDS_ON) assert.ok(text.includes(`images/tutorial/${language}/${step.id}.jpg`), `${file} has no picture for ${step.id}`)
  }
})

test('the menu items, tools and panels the walkthrough names exist in the app, in both languages', () => {
  const keys = ['duplicateLayer', 'cropToSelection', 'brightness', 'colorRange', 'hueSat', 'selectSubject', 'invertSel', 'deselect', 'blur', 'lensCorrection', 'exportAs', 'zoomIn', 'zoomFit', 'undo', 'invert', 'history', 'panelTitle', 'bottomPanelTitle', 'bottom_problems', 'bottom_errors', 'bottom_log', 'copyDetails', 'bottomClear', 'vignetteLabel', 'homeButton', 'startSamples']
  const tools = ['eyedropper', 'remove', 'spotHeal', 'text', 'brush', 'move', 'marquee']
  for (const [file, language] of [['doc/Tutorial.md', 'ko'], ['doc/Tutorial.en.md', 'en']]) {
    const text = read(file)
    for (const key of keys) {
      const label = t(language, key)
      assert.notEqual(label, key, `${key} has no ${language} label`)
      assert.ok(text.toLowerCase().includes(label.toLowerCase()), `${file} does not use the app's label "${label}" (${key})`)
    }
    for (const id of tools) {
      const label = toolLabel(language, id)
      assert.ok(text.toLowerCase().includes(label.toLowerCase()), `${file} does not name the tool "${label}"`)
    }
  }
})

test('npm run tutorial:shots photographs the walkthrough from the real app', () => {
  const pkg = JSON.parse(read('package.json'))
  assert.equal(pkg.scripts['tutorial:shots'], 'node scripts/tutorial-shots.mjs')
  const shots = read('scripts/tutorial-shots.mjs')
  assert.match(shots, /import \{ HANDS_ON, dismissLaunchPrompts, helpers, openSample \} from '\.\/tutorial-walkthrough\.mjs'/)
  assert.match(shots, /format: 'jpeg'/)
  const walk = read('scripts/tutorial-walkthrough.mjs')
  assert.match(walk, /\.sample-tile/, 'the sample is not opened from the start screen tile')
})

test('the tutorial video ends with a hands-on chapter on the same sample, with captions', () => {
  const video = read('scripts/tutorial-video.mjs')
  assert.match(video, /import \{ HANDS_ON, dismissLaunchPrompts, openSample \} from '\.\/tutorial-walkthrough\.mjs'/)
  assert.match(video, /await openSample\(page\)/, 'the tour is not recorded on the red-bikini sample')
  assert.match(video, /for \(const \[index, step\] of HANDS_ON\.entries\(\)\)/, 'the edits are not recorded')
  assert.match(video, /await caption\(title\)/, 'the hands-on steps have no caption')
  assert.match(video, /await caption\(null\)/, 'the caption is left on screen')
})

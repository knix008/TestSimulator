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
  const pictures = (text) => [...text.matchAll(/!\[[^\]]*\]\(images\/(ko|en)\/([\w-]+\.png)\)/g)]
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

// The user guide in doc/: its pictures, its generated page and what is at the top of it.
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { buildGuide, inline, renderMarkdown } from '../scripts/build-guide.mjs'

const url = (relative) => new URL(`../${relative}`, import.meta.url)
const read = (relative) => readFileSync(url(relative), 'utf8').replace(/\r\n/g, '\n')

test('the guide is in doc/, in both languages, and no longer beside the code', () => {
  assert.ok(existsSync(url('doc/UsersGuide.md')))
  assert.ok(existsSync(url('doc/UsersGuide.en.md')))
  assert.ok(!existsSync(url('UsersGuide.md')), 'an old copy is left in the project root')
})

test('the page is up to date with the Markdown', () => {
  assert.equal(read('doc/index.html'), buildGuide().replace(/\r\n/g, '\n'), 'run npm run build:guide')
})

test('both languages have the same sections and the same pictures, and all of them exist', () => {
  const pictures = (text) => [...text.matchAll(/!\[[^\]]*\]\(images\/(ko|en)\/([\w-]+\.png)\)/g)]
  const ko = read('doc/UsersGuide.md')
  const en = read('doc/UsersGuide.en.md')
  assert.equal(ko.split('\n## ').length, en.split('\n## ').length, 'the languages have a different number of sections')
  const koPictures = pictures(ko)
  const enPictures = pictures(en)
  assert.ok(koPictures.length >= 10, `only ${koPictures.length} pictures in the guide`)
  assert.deepEqual(koPictures.map((match) => match[2]), enPictures.map((match) => match[2]), 'the languages show different pictures')
  for (const match of [...koPictures, ...enPictures]) {
    const file = url(`doc/images/${match[1]}/${match[2]}`)
    assert.ok(existsSync(file), `${match[1]}/${match[2]} is missing; run npm run guide:shots`)
    assert.ok(statSync(file).size > 2000, `${match[1]}/${match[2]} is nearly empty`)
  }
  assert.ok(koPictures.every((match) => match[1] === 'ko'), 'the Korean guide shows an English picture')
  assert.ok(enPictures.every((match) => match[1] === 'en'), 'the English guide shows a Korean picture')
})

test('the font and language settings are at the top of the page', () => {
  const page = read('doc/index.html')
  const head = page.slice(page.indexOf('<header class="doc-head">'), page.indexOf('</header>'))
  assert.match(head, /data-font-control/, 'there is no font setting in the header')
  assert.match(head, /id="size-down"[\s\S]*id="size-up"/, 'there is no text size in the header')
  assert.match(head, /class="lang-group"/, 'there is no language setting in the header')
  assert.ok(head.includes('data-lang="ko"') && head.includes('data-lang="en"'))
  assert.ok(page.indexOf('<header class="doc-head">') < page.indexOf('<main>'), 'the settings are not above the text')
  assert.doesNotMatch(head, /<select/, 'a native list cannot show the fonts in their own faces')
})

test('the guide remembers the font, the size and the language, and follows the app', () => {
  const script = read('doc/manual.js')
  for (const key of ['mpw-doc-font', 'mpw-doc-size', 'mpw-doc-lang']) assert.ok(script.includes(`'${key}'`), `${key} is not kept`)
  assert.match(script, /'--doc-font'/, 'choosing a font changes nothing')
  assert.match(read('doc/manual.css'), /font: 14px\/1\.6 var\(--doc-font\)/, 'the page does not use the chosen font')
  assert.match(script, /'mpw-doc-appearance'/)
  assert.match(read('src/host/userGuide.ts'), /'mpw-doc-appearance'/, 'the app and the guide use different keys')
  assert.match(script, /addEventListener\('storage'/, 'an open guide does not follow the app')
  assert.match(script, /startResizeDragging\('SouthEast'\)/, 'the desktop window has no resize marker')
})

test('the build copies the guide but not its Markdown, and the dev server serves it', () => {
  const config = read('vite.config.ts')
  assert.match(config, /cpSync\(docDir, path\.join\(projectRoot, 'dist', 'doc'\)/, 'the guide is left out of the build')
  assert.match(config, /!source\.endsWith\('\.md'\)/, 'the Markdown would be shipped too')
  assert.match(config, /startsWith\('\/doc\/'\)/, 'the dev server does not serve the guide')
  assert.match(config, /userGuide\(\)/, 'the plugin is not used')
})

test('the Markdown renderer handles what the guide uses', () => {
  assert.equal(inline('**굵게** 와 `a*b*c` 와 *기울임*'), '<b>굵게</b> 와 <code>a*b*c</code> 와 <i>기울임</i>')
  assert.equal(inline('a < b & c'), 'a &lt; b &amp; c')
  const html = renderMarkdown('# Title\n\n## One\n\ntext\nwrapped\n\n- a\n  more\n  - nested\n- b\n\n### Sub\n\n| h1 | h2 |\n| --- | --- |\n| x | `y|` |\n\n![cap](images/ko/a.png)\n\n```\n<code>\n```\n\n## Two\n\n1. first\n2. second\n')
  assert.ok(!html.includes('Title'), 'the page title belongs to the page')
  assert.match(html, /<section id="s1"><h2>One<\/h2><p>text wrapped<\/p>/)
  assert.match(html, /<ul><li>a more<ul><li>nested<\/li><\/ul><\/li><li>b<\/li><\/ul>/)
  assert.match(html, /<h3>Sub<\/h3>/)
  assert.match(html, /<th>h1<\/th><th>h2<\/th>/)
  assert.match(html, /<figure><img src="images\/ko\/a\.png" alt="cap" loading="lazy"><figcaption>cap<\/figcaption><\/figure>/)
  assert.match(html, /<pre><code>&lt;code&gt;<\/code><\/pre>/)
  assert.match(html, /<\/section><section id="s2"><h2>Two<\/h2><ol><li>first<\/li><li>second<\/li><\/ol><\/section>$/)
})

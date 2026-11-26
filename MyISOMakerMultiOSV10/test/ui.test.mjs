// Page logic that can break without a visible error:
// the start board keeps the program-name card fixed, 20 + 20 themes, 24 backgrounds,
// the manual renderer, and both languages having every message.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { build } from 'esbuild'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'isomaker-uitest-'))
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }))

async function load(entry) {
  const out = path.join(tmp, `${path.basename(entry).replace(/\W/g, '_')}.mjs`)
  await build({
    entryPoints: [entry],
    outfile: out,
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
    loader: { '.md': 'text' },
    jsx: 'automatic',
    external: ['react', 'react-dom', '@tauri-apps/*'],
    // `?raw` imports of the manuals
    plugins: [{
      name: 'raw',
      setup(b) {
        b.onResolve({ filter: /\?raw$/ }, (a) => ({ path: path.resolve(a.resolveDir, a.path.replace(/\?raw$/, '')), namespace: 'raw' }))
        b.onLoad({ filter: /.*/, namespace: 'raw' }, (a) => ({ contents: fs.readFileSync(a.path, 'utf8'), loader: 'text' }))
        b.onResolve({ filter: /\.css$/ }, (a) => ({ path: a.path, namespace: 'css' }))
        b.onLoad({ filter: /.*/, namespace: 'css' }, () => ({ contents: '', loader: 'js' }))
      },
    }],
  })
  return import(`file:///${out.split(path.sep).join('/')}`)
}

test('start board: the program-name card stays on the first row, full width', async () => {
  const { StartBoard } = await load('src/start/startboard.ts')
  const ids = ['hero', 'begin', 'recent', 'tasks', 'engine', 'scenes']
  const cards = StartBoard.cardsOf(null, ids, { hero: 7 })
  assert.deepEqual([cards.hero.col, cards.hero.row, cards.hero.w], [0, 0, StartBoard.COLS])
  // Moving another card onto it pushes that card down, never the name card.
  const moved = StartBoard.place(cards, 'begin', { col: 0, row: 0 })
  assert.deepEqual([moved.hero.col, moved.hero.row, moved.hero.w], [0, 0, StartBoard.COLS])
  assert.ok(moved.begin.row >= moved.hero.h)
  // A saved layout that tries to move or shrink it is put back.
  const saved = StartBoard.layoutValue({ ...cards, hero: { col: 2, row: 9, w: 2, h: 7, fit: false } })
  const back = StartBoard.cardsOf(saved, ids, { hero: 7 })
  assert.deepEqual([back.hero.col, back.hero.row, back.hero.w], [0, 0, StartBoard.COLS])
  // The background card takes a whole row.
  assert.equal(cards.scenes.w, StartBoard.COLS)
  for (const a of ids) for (const b of ids) if (a < b) assert.ok(!StartBoard.overlaps(cards[a], cards[b]), `${a} / ${b} overlap`)
})

test('themes: 20 dark, 20 light, custom; the theme button stays in its family', async () => {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} }
  const th = await load('src/theme/themes.ts')
  assert.equal(th.themesByMode('dark').length, 20)
  assert.equal(th.themesByMode('light').length, 20)
  assert.ok(th.ALL_THEME_IDS.includes('custom'))
  let id = 'dark'
  const seen = new Set()
  for (let i = 0; i < 20; i++) {
    id = th.nextThemeId(id)
    assert.equal(th.themeMode(id), 'dark')
    seen.add(id)
  }
  assert.equal(seen.size, 20)
  const tokens = th.tokensOf('paper')
  assert.equal(tokens.mode, 'light')
  for (const k of ['--bg0', '--bg1', '--bg2', '--line', '--text', '--muted', '--accent', '--danger']) assert.match(tokens.vars[k], /^#|^rgba?\(/, k)
  const { THEME_NAMES_KO, THEME_NAMES_EN } = await load('src/theme/themeNames.ts')
  for (const t of th.THEMES) {
    assert.ok(THEME_NAMES_KO[t.id], `ko name ${t.id}`)
    assert.ok(THEME_NAMES_EN[t.id], `en name ${t.id}`)
  }
})

test('backgrounds: 24, named in both languages', async () => {
  const bg = await load('src/start/background-names.ts')
  const src = fs.readFileSync('src/start/background.ts', 'utf8')
  const ids = JSON.parse(/export const ANIMATIONS = (\[[^\]]*\])/.exec(src)[1].replace(/'/g, '"'))
  assert.equal(ids.length, 24)
  assert.equal(new Set(ids).size, 24)
  for (const id of ids) {
    assert.ok(bg.BG_NAMES_KO[id], `ko ${id}`)
    assert.ok(bg.BG_NAMES_EN[id], `en ${id}`)
  }
})

test('messages: Korean and English have the same keys', async () => {
  const { messages } = await load('src/i18n/messages.ts')
  const ko = Object.keys(messages.ko).sort()
  const en = Object.keys(messages.en).sort()
  assert.deepEqual(en.filter((k) => !ko.includes(k)), [])
  assert.deepEqual(ko.filter((k) => !en.includes(k)), [])
})

test('manual: every guide renders with headings and tables', async () => {
  const { renderMarkdown } = await load('src/help/markdown.ts')
  for (const f of ['doc/UsersGuide.md', 'doc/UsersGuide.en.md', 'doc/Tutorial.md', 'doc/Tutorial.en.md']) {
    const { html, headings } = renderMarkdown(fs.readFileSync(f, 'utf8'))
    assert.ok(headings.filter((h) => h.level === 2).length >= 5, `${f} sections`)
    assert.ok(!/<script/i.test(html), `${f} escapes HTML`)
  }
  for (const f of ['doc/UsersGuide.md', 'doc/UsersGuide.en.md', 'doc/Tutorial.md', 'doc/Tutorial.en.md']) {
    const text = fs.readFileSync(f, 'utf8')
    const refs = [...text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1])
    assert.ok(refs.length >= 4, `${f} has pictures`)
    for (const r of refs) assert.ok(fs.existsSync(path.join('doc', r)), `${f}: ${r} exists`)
    assert.match(renderMarkdown(text).html, /<figure class="doc-figure"><img src="images\//, `${f} renders pictures`)
  }
  const { html } = renderMarkdown('| a | b |\n|---|---|\n| `x` | **y** |\n\n<b>z</b>')
  assert.match(html, /<table>.*<code>x<\/code>.*<strong>y<\/strong>/s)
  assert.match(html, /&lt;b&gt;z&lt;\/b&gt;/)
})

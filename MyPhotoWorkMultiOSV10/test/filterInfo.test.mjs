/*
 * The Filter Gallery has to teach, not only run. A grid of 117 names tells you
 * nothing about what Fresco does that Underpainting does not, and the panel
 * beside the grid used to sit empty once you picked one. So every filter in
 * the catalog carries an icon and a sentence, in both languages, and the
 * window shows them.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { filterCatalog } from '../src/catalog.ts'
import { describedFilters, filterDescription, filterGroupIcon, filterIcon } from '../src/filterInfo.ts'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = (...parts) => readFileSync(path.join(root, ...parts), 'utf8')

test('every filter in the catalog has an icon and a sentence in both languages', () => {
  const missing = { icon: [], ko: [], en: [] }
  for (const item of filterCatalog) {
    if (!describedFilters.includes(item.id)) { missing.icon.push(item.id); continue }
    if (!filterDescription('ko', item.id)) missing.ko.push(item.id)
    if (!filterDescription('en', item.id)) missing.en.push(item.id)
  }
  assert.deepEqual(missing.icon, [], `no entry for: ${missing.icon.join(', ')}`)
  assert.deepEqual(missing.ko, [], `no Korean for: ${missing.ko.join(', ')}`)
  assert.deepEqual(missing.en, [], `no English for: ${missing.en.join(', ')}`)
})

test('nothing is described that the catalog does not have', () => {
  const known = new Set(filterCatalog.map((item) => item.id))
  const stale = describedFilters.filter((id) => !known.has(id))
  assert.deepEqual(stale, [], `described but gone from the catalog: ${stale.join(', ')}`)
})

test('the sentences say what happens, and are not one another', () => {
  const seen = new Map()
  for (const item of filterCatalog) {
    for (const language of ['ko', 'en']) {
      const text = filterDescription(language, item.id)
      assert.ok(text.length > 12, `${item.id} (${language}) is too short to explain anything: "${text}"`)
      assert.ok(text.length < 130, `${item.id} (${language}) is too long for the panel: ${text.length} characters`)
      assert.match(text, /[.。]$/u, `${item.id} (${language}) does not end in a full stop`)
      const key = `${language}:${text}`
      assert.equal(seen.get(key), undefined, `${item.id} and ${seen.get(key)} share the same ${language} sentence`)
      seen.set(key, item.id)
    }
  }
})

test('every filter has an icon, and each group has one for its tab', () => {
  // Lucide's icons come through forwardRef, so they are objects, not functions.
  const drawable = (icon) => Boolean(icon) && (typeof icon === 'function' || typeof icon === 'object')
  for (const item of filterCatalog) {
    assert.ok(drawable(filterIcon(item.id)), `${item.id} has no icon`)
  }
  for (const group of new Set(filterCatalog.map((item) => item.group))) {
    assert.ok(drawable(filterGroupIcon(group)), `group ${group} has no icon`)
  }
  // Two different filters may share an icon, but not all of them: the icons
  // are there to tell entries apart.
  /*
   * Every filter has an icon of its own. The gallery shows them a tab at a
   * time, so a repeat between tabs went unnoticed there; the Filter menu is a
   * single list of ninety-seven rows, and there every repeat is two entries
   * that look alike.
   */
  const seen = new Map()
  for (const item of filterCatalog) {
    const icon = filterIcon(item.id)
    assert.equal(seen.get(icon), undefined, `${item.id} and ${seen.get(icon)} wear the same icon`)
    seen.set(icon, item.id)
  }
  assert.equal(seen.size, filterCatalog.length, 'a filter is missing an icon of its own')
})

test('the gallery window shows the icons and puts the sentence where the gap was', () => {
  const source = read('src', 'dialogsExtra.tsx')
  const body = source.slice(source.indexOf('export function FilterGalleryBody'), source.indexOf('/** Routes a dialog name to its body'))
  assert.match(body, /<FilterGlyph id=\{item\.id\} size=\{15\} \/>/, 'the filter buttons have no icon')
  assert.match(body, /<GroupGlyph group=\{id\} size=\{14\} \/>/, 'the group tabs have no icon')
  assert.match(body, /className="gallery-about"/, 'the description panel is gone')
  assert.match(body, /\{description \|\| tr\('galleryPick'\)\}/, 'the panel no longer shows the description of the chosen filter')
  assert.match(body, /data-tooltip=\{filterDescription\(payload\.language, item\.id\)\}/, 'hovering a filter no longer says what it does')
  assert.doesNotMatch(body, /\{selected \? '' : tr\('galleryPick'\)\}/, 'the panel still blanks itself once a filter is picked')
})

test('the description panel is styled and keeps room for the text', () => {
  const css = read('src', 'App.css')
  assert.match(css, /\.gallery-about \{/, 'the description panel has no style')
  assert.match(css, /min-height: 4\.5em/, 'the panel collapses, so the window resizes as you click around')
  assert.match(css, /\.gallery-grid button svg/, 'the icons in the grid are unstyled')
})

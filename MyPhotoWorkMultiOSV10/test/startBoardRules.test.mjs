// Start screen rules the user set: the program title card can be neither moved nor
// resized, and the background settings sit below the sample pictures.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const source = readFileSync(path.join(root, 'src/start/StartScreen.tsx'), 'utf8')
const cardIds = JSON.parse(/const CARD_IDS = (\[[^\]]*\])/.exec(source)[1].replace(/'/g, '"'))

test('the title card is not on the movable board', () => {
  assert.ok(!cardIds.includes('hero'), 'the title card can be dragged and resized again')
  assert.doesNotMatch(source, /card\('hero'/, 'the title card is built as a movable card')
  const hero = /const hero = \(([\s\S]*?)\r?\n {2}\)\r?\n/.exec(source)?.[1] ?? ''
  assert.match(hero, /start-hero/)
  assert.doesNotMatch(hero, /card-handle|card-resize|startMove|startResize/, 'the title card has a move handle or a resize corner')
  assert.match(source, /\{hero\}\s*<div className="start-board"/, 'the title card is not above the board')
})

test('the background settings come after the samples', () => {
  assert.ok(cardIds.indexOf('side') > cardIds.indexOf('samples'), `order is ${cardIds.join(', ')}`)
  assert.equal(cardIds.at(-1), 'side')
})

test('a layout saved before the change is not reused', () => {
  const layout = readFileSync(path.join(root, 'src/lib/startLayout.ts'), 'utf8')
  assert.match(layout, /const LAYOUT_VERSION = ([2-9]|\d{2,})/)
})

/*
 * Every window says what it is for, and no window offers an action it cannot
 * carry out.
 *
 * Seventy-five windows carried a title and nothing else: "Apply Image",
 * "Calculations", "Fade" and "Statistics" are all accurate and none of them
 * tells you what pressing Apply would do. And several offered a primary button
 * with nothing behind it — Replace All with no misspellings found, OK on an
 * empty note — which does nothing when pressed and says nothing about why.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { describedDialogs, dialogDescription } from '../src/dialogInfo.ts'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = (...parts) => readFileSync(path.join(root, ...parts), 'utf8')

/** Every dialog the editor can open, from the two routers that build them. */
function dialogNames() {
  const names = new Set()
  for (const match of read('src', 'dialogs.tsx').matchAll(/^ {4}case '(\w+)':/gm)) names.add(match[1])
  for (const match of read('src', 'dialogsExtra.tsx').matchAll(/case '(\w+)': return/g)) names.add(match[1])
  return [...names].sort()
}

test('the editor has the windows this expects to find', () => {
  const names = dialogNames()
  assert.ok(names.length >= 70, `only ${names.length} dialogs found — has the routing changed shape?`)
})

test('every window that a person opens on purpose says what it is for', () => {
  /*
   * Three are left out on purpose: `error` and `unsaved` are answers to
   * something that just happened and explain themselves in their own text,
   * and `filterParams` follows straight on from the gallery, which has
   * already said what the filter does.
   */
  const exempt = new Set(['error', 'unsaved', 'filterParams'])
  const missing = dialogNames().filter((name) => !exempt.has(name) && !dialogDescription('en', name))
  assert.deepEqual(missing, [], `no description for: ${missing.join(', ')}`)
})

test('the descriptions are written in both languages, and are not one another', () => {
  const seen = new Map()
  for (const name of describedDialogs) {
    for (const language of ['ko', 'en']) {
      const text = dialogDescription(language, name)
      assert.ok(text.length > 12, `${name} (${language}) is too short to explain anything: "${text}"`)
      assert.ok(text.length < 130, `${name} (${language}) is too long for one line: ${text.length} characters`)
      assert.match(text, /[.。]$/u, `${name} (${language}) does not end in a full stop`)
      const key = `${language}:${text}`
      assert.equal(seen.get(key), undefined, `${name} and ${seen.get(key)} share the same ${language} sentence`)
      seen.set(key, name)
    }
  }
})

test('nothing is described that the editor cannot open', () => {
  const names = new Set(dialogNames())
  const stale = describedDialogs.filter((name) => !names.has(name))
  assert.deepEqual(stale, [], `described but gone: ${stale.join(', ')}`)
})

test('the frame draws the description under the title, once, for every window', () => {
  const dialogs = read('src', 'dialogs.tsx')
  const frame = dialogs.slice(dialogs.indexOf('const classes = ['), dialogs.indexOf('/* --------------------------------------------------------- number stepper */'))
  assert.ok(frame.includes('dialogDescription(language, name)'), 'the frame no longer asks for a description')
  assert.ok(frame.includes('className="dialog-about"'), 'the description has nowhere to be drawn')
  const css = read('src', 'App.css')
  assert.ok(css.includes('.dialog-about {'), 'the description line is unstyled')
  assert.ok(/\.dialog-about \{[^}]*text-align: left/s.test(css), 'a window that centres its contents would centre this too')
})

test('a primary button is offered only when there is something for it to do', () => {
  const extra = read('src', 'dialogsExtra.tsx')
  // Each of these used to invite a press that did nothing at all.
  const gated = {
    'Check Spelling': 'applyDisabled={suspects.length === 0}',
    Note: 'applyDisabled={!text.trim()}',
    'Find and Replace': 'applyDisabled={!find}',
    'Filter Gallery': 'applyDisabled={!selected}',
  }
  for (const [window, guard] of Object.entries(gated)) {
    assert.ok(extra.includes(guard), `${window} offers its action with nothing to apply it to`)
  }
  assert.ok(extra.includes('disabled={applyDisabled}'), 'the shared action row ignores the guard')
})

// Two languages are a pair of flag buttons in Settings, not a drop-down.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

test('Settings offers the language as flag buttons', () => {
  const dialogs = read('src/dialogs.tsx')
  assert.doesNotMatch(dialogs, /<select value=\{settings\.language\}/, 'the drop-down is still there')
  const choice = dialogs.slice(dialogs.indexOf('className="language-choice choice-pair"'))
  assert.ok(dialogs.includes('className="language-choice choice-pair"'), 'no language buttons')
  for (const [code, flag, name] of [['ko', 'FlagKo', '한국어'], ['en', 'FlagEn', 'English']]) {
    assert.ok(choice.includes(`code: '${code}'`), `no ${code} button`)
    assert.ok(choice.includes(`Flag: ${flag}`), `the ${code} button has no flag`)
    assert.ok(choice.includes(`name: '${name}'`), `the ${code} button has no name`)
  }
  assert.match(choice, /aria-pressed=\{settings\.language === code\}/, 'nothing shows which language is on')
  assert.match(choice, /patchSettings\(\{ language: code \}\)/, 'pressing a button does not change the language')
})

test('the chosen language can be told from the other, on any theme', () => {
  const css = read('src/App.css')
  const rule = css.slice(css.indexOf(".choice-pair button[aria-pressed='true']"))
  assert.ok(css.includes(".choice-pair button[aria-pressed='true']"), 'the chosen button is not styled')
  assert.match(rule.slice(0, rule.indexOf('}')), /background: var\(--accent\)/)
  assert.match(rule.slice(0, rule.indexOf('}')), /color: var\(--accent-text\)/, 'the accent can be light or dark, so its text must follow')
})

test('the two flags are drawn in one place', () => {
  // Each one clips to its rounded corners, so the clip id must not be shared between copies.
  const flags = read('src/LanguageFlags.tsx')
  assert.match(flags, /export function FlagKo/)
  assert.match(flags, /export function FlagEn/)
  assert.match(flags, /useId\(\)/)
  assert.doesNotMatch(read('src/App.tsx'), /function Flag(Ko|En)/, 'App.tsx keeps a second copy')
})

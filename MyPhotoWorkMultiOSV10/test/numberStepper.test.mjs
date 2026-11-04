// Every number in the app is one control: − , the value and its unit centred, + .
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { formatUnitNumber, numberLength, parseUnitNumber, stepUnitNumber } from '../src/lib/numberFormat.ts'

const read = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const SOURCES = ['src/App.tsx', 'src/panels.tsx', 'src/dialogs.tsx', 'src/dialogsExtra.tsx', 'src/RegionFields.tsx']

test('a value is shown with its unit, the way that unit is written', () => {
  assert.equal(formatUnitNumber(120, 'px'), '120 px')
  assert.equal(formatUnitNumber(1500, 'ms'), '1500 ms')
  assert.equal(formatUnitNumber(45, '°'), '45°')
  assert.equal(formatUnitNumber(50, '%'), '50%')
  assert.equal(formatUnitNumber(1.2, '×', 0.05), '1.2×')
  assert.equal(formatUnitNumber(3, undefined), '3')
  assert.equal(formatUnitNumber(1.2000000000000002, '×', 0.05), '1.2×', 'a tail of arithmetic shows')
  assert.equal(formatUnitNumber(0.5, '°', 0.5), '0.5°')
})

test('what is typed is read with or without the unit', () => {
  for (const text of ['120', '120px', '120 px', ' 120 PX ']) assert.equal(parseUnitNumber(text, 'px'), 120, text)
  assert.equal(parseUnitNumber('-3 px', 'px'), -3)
  assert.equal(parseUnitNumber('45°', '°'), 45)
  assert.equal(parseUnitNumber('1.25×', '×'), 1.25)
  assert.equal(parseUnitNumber('.5', undefined), 0.5)
  for (const text of ['', 'px', '12x', '1 2', '1.2.3', 'abc']) assert.equal(parseUnitNumber(text, 'px'), null, JSON.stringify(text))
})

test('a step lands on the grid and between the limits', () => {
  assert.equal(stepUnitNumber(10, 1, 1, 0, 100), 11)
  assert.equal(stepUnitNumber(10, -10, 1, 0, 100), 0)
  assert.equal(stepUnitNumber(0, -1, 1, 0, 100), 0, 'the floor')
  assert.equal(stepUnitNumber(100, 1, 1, 0, 100), 100, 'the ceiling')
  assert.equal(stepUnitNumber(1.2, 1, 0.05, 0.5, 4), 1.25, 'a fine step drifts')
  assert.equal(stepUnitNumber(23, 1, 20, 20, 5000), 40, 'an off-grid value comes back to the grid')
  assert.equal(stepUnitNumber(5, 1, 1, -Infinity, Infinity), 6, 'a field with no limits')
})

test('clicking in selects the digits, so typing leaves the unit', () => {
  assert.equal(numberLength('120 px'), 3)
  assert.equal(numberLength('-45°'), 3)
  assert.equal(numberLength('1.25×'), 4)
  assert.equal(numberLength('3'), 1)
})

test('the control is a value between its two buttons', () => {
  const controls = read('src/controls.tsx')
  const stepper = controls.slice(controls.indexOf('export function NumberStepper'))
  assert.ok(stepper.indexOf('<Minus') < stepper.indexOf('<input') && stepper.indexOf('<input') < stepper.indexOf('<Plus'))
  assert.match(stepper, /disabled=\{disabled \|\| value <= min\}/)
  assert.match(stepper, /disabled=\{disabled \|\| value >= max\}/)
  assert.match(stepper, /formatUnitNumber\(value, unit, step\)/, 'the value has no unit')
  const css = read('src/App.css')
  const rule = css.slice(css.indexOf('.number-stepper input {'))
  assert.match(rule.slice(0, rule.indexOf('}')), /text-align: center/)
  assert.doesNotMatch(css, /input\[type='number'\]/, 'a style is left for a kind of field that no longer exists')
})

test('there is one number control, and nothing beside it', () => {
  for (const file of [...SOURCES, 'src/controls.tsx']) {
    const source = read(file)
    assert.doesNotMatch(source, /type="number"/, `${file} has a raw number input`)
    assert.doesNotMatch(source, /NumberField/, `${file} still has the old field`)
  }
  assert.doesNotMatch(read('src/dialogs.tsx'), /export function NumberStepper/, 'a second copy')
  assert.doesNotMatch(read('src/RegionFields.tsx'), /<input/, 'the crop fields have their own copy')
})

test('each number carries the unit it is measured in', () => {
  const expected = [
    ['src/App.tsx', /tr\('fontSize'\)\}<NumberStepper [^>]*unit="px"/, 'the options bar font size'],
    ['src/App.tsx', /tr\('transformAngle'\)\}<NumberStepper [^>]*unit="°"/, 'the transform angle'],
    ['src/panels.tsx', /name="fontSize" tr=\{tr\} \/><NumberStepper [^>]*unit="px"/, 'the character panel size'],
    ['src/panels.tsx', /name="leading" tr=\{tr\} \/><NumberStepper [^>]*unit="×"/, 'the leading, a multiple'],
    ['src/panels.tsx', /unit="ms"[^>]*frame\.delayMs/, 'a frame delay'],
    ['src/dialogs.tsx', /tr\('width'\)\}<NumberStepper [^>]*unit="px"/, 'a dialog width'],
    ['src/dialogs.tsx', /tr\('lineHeight'\)\}<NumberStepper [^>]*unit="%"/, 'the line height, a percentage'],
    ['src/dialogsExtra.tsx', /tr\('rotateAngle'\)\}<NumberStepper [^>]*unit="°"/, 'a rotation'],
    ['src/dialogsExtra.tsx', /tr\('exportScale'\)\}<NumberStepper [^>]*unit="%"/, 'the export scale'],
    ['src/RegionFields.tsx', /<NumberStepper [^>]*unit="px"/, 'the crop box'],
  ]
  for (const [file, pattern, what] of expected) assert.match(read(file), pattern, what)
  // A plain count has no unit to show.
  assert.doesNotMatch(read('src/dialogs.tsx'), /unit="[^"]*"[^>]*value=\{copies\}/)
  assert.doesNotMatch(read('src/dialogs.tsx'), /unit="[^"]*"[^>]*value=\{settings\.historyStates\}/)
})

test('the control keeps to its cell, so its + cannot slide under the next one', () => {
  // A text field asks for about twenty characters of room. With that as its starting width
  // the + button went under the − beside it, and pressing + turned the other number down.
  const css = read('src/App.css')
  const rule = (selector) => { const at = css.indexOf(`${selector} {`); assert.ok(at >= 0, selector); return css.slice(at, css.indexOf('}', at)) }
  assert.match(rule('.number-stepper input'), /flex: 1 1 0/)
  assert.match(rule('.number-stepper input'), /width: 0/)
  assert.match(rule('.number-stepper'), /min-width: 0/)
  assert.match(rule('.options-bar .number-stepper input'), /width: 56px/, 'nothing gives it a width on the options bar')
  assert.match(rule('.options-bar .number-stepper input'), /flex: none/)
})

test('a shortcut field takes a new key without having to clear the old one first', () => {
  // It holds one character, so a caret beside the old key refused every keystroke.
  assert.match(read('src/dialogsExtra.tsx'), /maxLength=\{1\}[^>]*onFocus=\{[^}]*field\.select\(\)/)
})

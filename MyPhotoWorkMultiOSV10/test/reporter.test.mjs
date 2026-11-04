// What a test run prints: progress as it goes, a time for every test, in straight columns.
import test from 'node:test'
import assert from 'node:assert/strict'
import report, { plainDuration, testLine } from './helpers/reporter.mjs'

const passed = (file, name, ms) => ({ type: 'test:pass', data: { file, name, details: { duration_ms: ms } } })

async function run(events) {
  const chunks = []
  async function* source() { yield* events }
  for await (const chunk of report(source())) chunks.push(chunk)
  // Colours are off when piped, but a run from a terminal may force them.
  // eslint-disable-next-line no-control-regex
  return chunks.join('').replace(/\u001b\[[0-9;]*m/g, '')
}

test('every test gets a line with its number and time, as it finishes', async () => {
  const text = await run([passed('/t/a.test.mjs', 'first', 3.25), passed('/t/a.test.mjs', 'second', 240), passed('/t/b.test.mjs', 'third', 2500)])
  assert.match(text, /\n\s+1\s+✔\s+3\.3ms\s+first\n/)
  assert.match(text, /\n\s+2\s+✔\s+240ms\s+second\n/)
  assert.match(text, /\n\s+3\s+✔\s+2\.5s\s+third\n/)
  assert.match(text, /\[\s*\d+\/\d+\] a\.test\.mjs/, 'a file has no heading saying how far the run is')
  assert.match(text, /\[\s*\d+\/\d+\] b\.test\.mjs/)
  assert.ok(text.indexOf('first') < text.indexOf('SUMMARY'), 'the tests must be listed before the summary')
})

test('the columns line up whatever the number and the time are', async () => {
  const text = await run([passed('/t/a.test.mjs', 'one', 0.4), passed('/t/a.test.mjs', 'two', 12), passed('/t/a.test.mjs', 'three', 987), passed('/t/a.test.mjs', 'four', 12345)])
  const lines = text.split('\n').filter((line) => /(one|two|three|four)$/.test(line))
  assert.equal(lines.length, 4)
  const column = (needle) => new Set(lines.map((line) => line.indexOf(needle)))
  assert.equal(column('✔').size, 1, 'the marks are not in a column')
  const nameAt = new Set(lines.map((line) => line.search(/(one|two|three|four)$/)))
  assert.equal(nameAt.size, 1, 'the names do not start in one column')
  const timeEnd = new Set(lines.map((line) => line.search(/(ms|s)\s+(one|two|three|four)$/)))
  assert.ok(timeEnd.size <= 2, 'the times are not right-aligned')
})

test('a failure is shown at once, and counted', async () => {
  const text = await run([{ type: 'test:fail', data: { file: '/t/a.test.mjs', name: 'broken', details: { duration_ms: 5, error: { cause: { message: 'expected 1' } } } } }])
  assert.match(text, /✘\s+5\.0ms\s+broken/)
  assert.match(text, /FAIL/)
  assert.match(text, /1 OF 1 TESTS FAILED/)
})

test('times read well at every scale', () => {
  assert.equal(plainDuration(0.26), '0.3ms')
  assert.equal(plainDuration(45.2), '45ms')
  assert.equal(plainDuration(1500), '1.5s')
  assert.match(testLine(7, 'x', 1, 'name'), /^\s+7 {2}x\s+1\.0ms {2}name$/)
})

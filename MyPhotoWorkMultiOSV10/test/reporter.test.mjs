// What a test run prints: progress as it goes, a time for every test, in straight columns.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import report, { markdownReport, plainDuration, testLine } from './helpers/reporter.mjs'

const passed = (file, name, ms) => ({ type: 'test:pass', data: { file, name, details: { duration_ms: ms } } })

/** Colour is on in a terminal and off in a pipe: what is checked must not depend on which. */
// eslint-disable-next-line no-control-regex
const plain = (text) => text.replace(/\u001b\[[0-9;]*m/g, '')

async function run(events) {
  const chunks = []
  async function* source() { yield* events }
  for await (const chunk of report(source())) chunks.push(chunk)
  return plain(chunks.join(''))
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
  assert.match(plain(testLine(7, 'x', 1, 'name')), /^\s+7 {2}x\s+1\.0ms {2}name$/)
})

const row = (tests) => ({
  tests,
  pass: tests.filter((item) => item.state === 'pass').length,
  fail: tests.filter((item) => item.state === 'fail').length,
  skip: tests.filter((item) => item.state === 'skip').length,
  ms: tests.reduce((sum, item) => sum + item.ms, 0),
})
const details = (rows, failures = []) => ({ rows, failures, seconds: '1.5', when: '2026-11-04 16:30:00', node: 'v24.15.0' })

test('the Markdown report gives the result, every file and every test', () => {
  const text = markdownReport(details([
    ['a.test.mjs', row([{ name: 'first', state: 'pass', ms: 3.25 }, { name: 'second', state: 'pass', ms: 2500 }])],
    ['b.test.mjs', row([{ name: 'third', state: 'skip', ms: 0 }])],
  ]))
  assert.match(text, /^# 테스트 결과\n/)
  assert.match(text, /> ✅ \*\*3개 모두 통과\*\*/)
  assert.match(text, /\| 실행 시각 \| 2026-11-04 16:30:00 \|/)
  assert.match(text, /\| ✅ a\.test\.mjs \| 2 \| 2 \| 0 \| 0 \| 2\.5s \|/)
  assert.match(text, /\| ✅ \| 3\.3ms \| first \|/)
  assert.match(text, /\| ⏭️ \| 0\.0ms \| third \|/)
  assert.ok(text.indexOf('2.5s | a.test.mjs | second') > text.indexOf('## 가장 느린 테스트'), 'the slowest test is not listed')
  assert.doesNotMatch(text, /## 실패/, 'a clean run has no failure section')
})

test('a failure comes first, with its message and where it happened', () => {
  const message = `expected 1\n${'x'.repeat(5000)}`
  const text = markdownReport(details(
    [['a.test.mjs', row([{ name: 'broken', state: 'fail', ms: 5 }])]],
    [{ where: 'a.test.mjs', name: 'broken', message, stack: 'Error\n    at t (file:///t/a.test.mjs:3:1)' }],
  ))
  assert.match(text, /> ❌ \*\*1개 중 1개 실패\*\*/)
  assert.ok(text.indexOf('## 실패 (1)') < text.indexOf('## 파일별 결과'), 'the failures are buried')
  assert.match(text, /```text\nexpected 1\n/)
  assert.match(text, /위치: `at t \(file:\/\/\/t\/a\.test\.mjs:3:1\)`/)
  assert.ok(text.length < 3000, 'one assertion can quote a whole source file, and that must not swamp the report')
  assert.match(text, /자 생략\)/, 'nothing says the message was cut')
})

test('a test name or a message cannot break the Markdown around it', () => {
  const text = markdownReport(details(
    [['a.test.mjs', row([{ name: 'a | b\nc', state: 'fail', ms: 1 }])]],
    [{ where: 'a.test.mjs', name: 'a | b\nc', message: 'has ``` inside', stack: '' }],
  ))
  assert.match(text, /\| ❌ \| 1\.0ms \| a \\\| b c \|/)
  assert.match(text, /````text\nhas ``` inside\n````/, 'the fence closes on the message')
})

test('a run where nothing ran does not read as a success', () => {
  assert.match(markdownReport(details([])), /실행된 테스트가 없습니다/)
})

// A URL, because a drive letter would be read as a scheme.
const reporterUrl = new URL('./helpers/reporter.mjs', import.meta.url).href

test('a real run writes the report', () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'mpw-report-'))
  try {
    const fixture = path.join(folder, 'fixture.test.mjs')
    writeFileSync(fixture, "import test from 'node:test'\nimport assert from 'node:assert/strict'\ntest('holds', () => {})\ntest('breaks', () => assert.equal(1, 2))\n")
    const target = path.join(folder, 'deep', 'report.md')
    const env = { ...process.env, MPW_TEST_REPORT: target, FORCE_COLOR: '' }
    delete env.NODE_TEST_CONTEXT
    const result = spawnSync(process.execPath, ['--test', `--test-reporter=${reporterUrl}`, fixture], { env, encoding: 'utf8' })
    assert.equal(result.status, 1, 'a failing test must still fail the run')
    assert.ok(existsSync(target), `no report was written:\n${result.stdout}\n${result.stderr}`)
    const text = readFileSync(target, 'utf8')
    assert.match(text, /> ❌ \*\*2개 중 1개 실패\*\*/)
    assert.match(text, /\| ✅ \| [^|]+ \| holds \|/)
    assert.match(text, /### fixture\.test\.mjs — breaks/)
    assert.match(result.stdout, /Report\s+\S*report\.md/, 'the run does not say where the report went')
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
})

test('a test calling the reporter leaves the real report alone', async () => {
  // These tests run the reporter on made-up results, and the report of the run must survive them.
  assert.ok(process.env.NODE_TEST_CONTEXT, 'this has to run under node --test for the guard to be tested')
  const target = path.join(tmpdir(), `mpw-report-${process.pid}.md`)
  const before = process.env.MPW_TEST_REPORT
  process.env.MPW_TEST_REPORT = target
  try {
    await run([passed('/t/a.test.mjs', 'made up', 1)])
    assert.equal(existsSync(target), false)
  } finally {
    if (before === undefined) delete process.env.MPW_TEST_REPORT
    else process.env.MPW_TEST_REPORT = before
  }
})

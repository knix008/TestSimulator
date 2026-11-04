/*
 * A reporter for `node --test` that says what is being checked as it goes: a running
 * number, the mark, the time and the name of each test, in columns, under the name of
 * its file with that file's place in the run. The summary comes last.
 *
 * Colour follows the usual rules: on for a terminal, off when piped or when
 * NO_COLOR is set, forced on by FORCE_COLOR.
 *
 * The same results are written to out/test-report.md (or to MPW_TEST_REPORT).
 */
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const colour = process.env.FORCE_COLOR
  ? true
  : Boolean(process.stdout.isTTY) && !process.env.NO_COLOR && process.env.TERM !== 'dumb'

const paint = (code) => (text) => (colour ? `[${code}m${text}[0m` : String(text))
const bold = paint(1)
const dim = paint(2)
const red = paint(31)
const green = paint(32)
const yellow = paint(33)
const blue = paint(36)
const grey = paint(90)
const onGreen = paint('1;97;42')
const onRed = paint('1;97;41')

const RULE = '─'.repeat(78)
const HEAVY = '═'.repeat(78)

/** `ms` as a short string: 1.2s, 410ms. */
export const plainDuration = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : ms >= 10 ? `${Math.round(ms)}ms` : `${ms.toFixed(1)}ms`)

/** One test's line: the columns line up whatever the number and the time are. */
export function testLine(number, mark, ms, name, width = 8) {
  return `    ${String(number).padStart(4)}  ${mark}  ${duration(ms, width)}  ${name}`
}

const TEST_FILES = (() => {
  try {
    return readdirSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..')).filter((name) => name.endsWith('.test.mjs')).length
  } catch {
    return 0
  }
})()

/*
 * Red is failure and nothing else.
 *
 * A slow test used to be red too, so a passing file that took half a second
 * looked exactly like a broken one, and the only way to tell was to read the
 * number. Time is reported in yellow when it is worth noticing and in bold
 * yellow when it is worth doing something about; the ✘, the FAIL badge and the
 * failure counts keep red to themselves.
 */
function duration(ms, width = 0) {
  const text = plainDuration(ms).padStart(width)
  if (ms >= 500) return bold(yellow(text))
  if (ms >= 100) return yellow(text)
  return grey(text)
}

/** A width-8 bar showing this file's share of the slowest file's time. */
function bar(ms, worst) {
  const width = 8
  const filled = worst > 0 ? Math.max(ms > 0 ? 1 : 0, Math.round((ms / worst) * width)) : 0
  const glyph = '█'.repeat(filled) + dim('·'.repeat(width - filled))
  // Never red: this bar is about time, and red means a test failed.
  if (ms >= 100) return yellow(glyph)
  return blue(glyph)
}

const REPORT_MESSAGE_LIMIT = 2000

/** Text for a table cell: a pipe or a line break would end the cell early. */
const cell = (text) => String(text).replace(/\s*\r?\n\s*/g, ' ').replace(/\|/g, '\\|')

/** A failure message in a code block. One assertion can quote a whole source file. */
function messageBlock(message) {
  const text = String(message)
  const shown = text.length > REPORT_MESSAGE_LIMIT ? `${text.slice(0, REPORT_MESSAGE_LIMIT)}\n… (${text.length - REPORT_MESSAGE_LIMIT}자 생략)` : text
  const fence = '`'.repeat(Math.max(3, ...[...shown.matchAll(/`+/g)].map((match) => match[0].length + 1)))
  return `${fence}text\n${shown}\n${fence}`
}

/** The run as a Markdown document. `rows` is [file name, { tests, pass, fail, skip, ms }]. */
export function markdownReport({ rows, failures, seconds, when, node }) {
  const count = (key) => rows.reduce((n, [, row]) => n + row[key], 0)
  const [pass, fail, skip] = [count('pass'), count('fail'), count('skip')]
  const total = pass + fail + skip
  const mark = { pass: '✅', fail: '❌', skip: '⏭️' }
  const lines = ['# 테스트 결과', '']
  if (!total) lines.push('> ❌ **실행된 테스트가 없습니다**')
  else lines.push(fail ? `> ❌ **${total}개 중 ${fail}개 실패**` : `> ✅ **${total}개 모두 통과**`)
  lines.push('', '| 항목 | 값 |', '| --- | --- |')
  lines.push(`| 실행 시각 | ${when} |`, `| 통과 | ${pass} |`, `| 실패 | ${fail} |`, `| 건너뜀 | ${skip} |`, `| 파일 | ${rows.length} |`, `| 걸린 시간 | ${seconds}초 |`, `| Node | ${node} |`, '')

  if (failures.length) {
    lines.push(`## 실패 (${failures.length})`, '')
    for (const failure of failures) {
      lines.push(`### ${failure.where} — ${cell(failure.name)}`, '', messageBlock(failure.message), '')
      const at = String(failure.stack ?? '').split('\n').find((line) => line.includes('.test.mjs'))
      if (at) lines.push(`위치: \`${at.trim()}\``, '')
    }
  }

  lines.push('## 파일별 결과', '', '| 파일 | 테스트 | 통과 | 실패 | 건너뜀 | 시간 |', '| --- | ---: | ---: | ---: | ---: | ---: |')
  for (const [name, row] of rows) lines.push(`| ${row.fail ? '❌' : '✅'} ${name} | ${row.tests.length} | ${row.pass} | ${row.fail} | ${row.skip} | ${plainDuration(row.ms)} |`)
  lines.push(`| **합계** | **${total}** | **${pass}** | **${fail}** | **${skip}** | |`, '')

  const slowest = rows.flatMap(([name, row]) => row.tests.map((item) => ({ ...item, file: name }))).sort((a, b) => b.ms - a.ms).slice(0, 10)
  if (slowest.length) {
    lines.push('## 가장 느린 테스트', '', '| 시간 | 파일 | 테스트 |', '| ---: | --- | --- |')
    for (const item of slowest) lines.push(`| ${plainDuration(item.ms)} | ${item.file} | ${cell(item.name)} |`)
    lines.push('')
  }

  lines.push('## 전체 테스트', '')
  for (const [name, row] of rows) {
    lines.push(`### ${name}`, '', '| 결과 | 시간 | 테스트 |', '| --- | ---: | --- |')
    for (const item of row.tests) lines.push(`| ${mark[item.state]} | ${plainDuration(item.ms)} | ${cell(item.name)} |`)
    lines.push('')
  }
  return lines.join('\n')
}

/**
 * Writes the report, and says where. Only for the run itself: a test that calls the
 * reporter runs in a child process, and must not replace the real report with its own.
 * A report that cannot be written is said so, and never decides the result of the run.
 */
function writeReport(details) {
  if (process.env.NODE_TEST_CONTEXT) return null
  const target = process.env.MPW_TEST_REPORT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'out', 'test-report.md')
  try {
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, markdownReport(details), 'utf8')
    return { target }
  } catch (error) {
    return { error: error.message }
  }
}

export default async function* report(source) {
  /** basename -> { tests: [], pass, fail, skip, ms } */
  const files = new Map()
  const failures = []
  const started = Date.now()

  const bucket = (file) => {
    const key = file ? path.basename(file) : '(unknown)'
    if (!files.has(key)) files.set(key, { tests: [], pass: 0, fail: 0, skip: 0, ms: 0 })
    return files.get(key)
  }

  let number = 0
  let shown = null
  yield `\n  ${grey('   no  ok      time  test')}\n`
  for await (const event of source) {
    const data = event.data ?? {}
    if (event.type !== 'test:pass' && event.type !== 'test:fail') continue
    const row = bucket(data.file)
    const ms = data.details?.duration_ms ?? 0
    row.ms += ms
    const fileName = data.file ? path.basename(data.file) : '(unknown)'
    // A heading each time the run moves to another file.
    if (fileName !== shown) {
      shown = fileName
      yield `\n  ${grey(`[${String(files.size).padStart(2)}/${TEST_FILES || '?'}]`)} ${blue(bold(fileName))}\n`
    }
    number += 1
    if (event.type === 'test:pass') {
      if (data.skip || data.todo) {
        row.skip += 1
        row.tests.push({ name: data.name, state: 'skip', ms })
        yield `${testLine(number, yellow('○'), ms, grey(data.name))}\n`
        continue
      }
      row.pass += 1
      row.tests.push({ name: data.name, state: 'pass', ms })
      yield `${testLine(number, green('✔'), ms, data.name)}\n`
      continue
    }
    row.fail += 1
    row.tests.push({ name: data.name, state: 'fail', ms })
    yield `${testLine(number, red('✘'), ms, red(data.name))}\n`
    const where = data.file ? path.basename(data.file) : '(unknown)'
    const error = data.details?.error
    const cause = error?.cause ?? error
    // A cause with no prototype cannot be turned into a string: it must not end the run.
    const message = cause?.message ?? (typeof cause === 'string' ? cause : 'failed')
    failures.push({ where, name: data.name, message, stack: cause?.stack ?? '' })
    yield `\n  ${onRed(' FAIL ')} ${bold(where)}  ${data.name}\n         ${red(message.split('\n')[0])}\n`
  }

  const rows = [...files.entries()].sort(([a], [b]) => a.localeCompare(b))
  const pass = rows.reduce((n, [, row]) => n + row.pass, 0)
  const fail = rows.reduce((n, [, row]) => n + row.fail, 0)
  const skip = rows.reduce((n, [, row]) => n + row.skip, 0)
  const total = pass + fail + skip
  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  const worst = Math.max(0, ...rows.map(([, row]) => row.ms))
  const slowest = rows.slice().sort(([, a], [, b]) => b.ms - a.ms)[0]

  const out = ['']

  /* ---------------------------------------------------------------- summary */
  out.push(HEAVY)
  out.push(`  ${bold('SUMMARY')} — unit tests`)
  out.push(HEAVY, '')

  const verdict = fail
    ? onRed(` ${fail} OF ${total} TESTS FAILED `)
    : onGreen(` ALL ${total} TESTS PASSED `)
  out.push(`  ${'Result'.padEnd(14)}${verdict}`)
  out.push(`  ${'Checks'.padEnd(14)}${green(`${pass} passed`)}${fail ? `, ${red(`${fail} failed`)}` : ''}${skip ? `, ${yellow(`${skip} skipped`)}` : ''}`)
  out.push(`  ${'Files'.padEnd(14)}${rows.length}${fail ? `, ${red(`${rows.filter(([, r]) => r.fail).length} with failures`)}` : ''}`)
  if (slowest) out.push(`  ${'Slowest file'.padEnd(14)}${slowest[0]} ${duration(slowest[1].ms)}`)
  out.push(`  ${'Took'.padEnd(14)}${seconds}s`)
  out.push('')

  out.push(`  ${bold('Per file')}`)
  // What the colours mean, said once rather than left to be inferred.
  out.push(grey(`    ${red('red')} = a failure · ${yellow('yellow')} = over 100ms · ${bold(yellow('bold yellow'))} = over 500ms · ${grey('grey')} = quick`))
  out.push(grey(`    ${'file'.padEnd(30)}${'checks'.padStart(7)}${'passed'.padStart(8)}${'failed'.padStart(8)}${'time'.padStart(9)}   share`))
  for (const [name, row] of rows) {
    const status = row.fail ? red(String(row.fail).padStart(8)) : green('0'.padStart(8))
    out.push(`    ${name.padEnd(30)}${String(row.tests.length).padStart(7)}${String(row.pass).padStart(8)}${status}${duration(row.ms, 9)}   ${bar(row.ms, worst)}`)
  }
  out.push(grey(`    ${RULE.slice(0, 62)}`))
  out.push(`    ${bold('TOTAL'.padEnd(30))}${bold(String(total).padStart(7))}${green(String(pass).padStart(8))}${fail ? red(String(fail).padStart(8)) : green('0'.padStart(8))}`)
  out.push('')

  if (failures.length) {
    out.push(`  ${bold(red(`Failures (${failures.length})`))}`)
    for (const failure of failures) {
      out.push(`    ${red('✘')} ${bold(failure.where)}  ${failure.name}`)
      for (const line of failure.message.split('\n')) out.push(`      ${line}`)
      const at = failure.stack.split('\n').find((line) => line.includes('.test.mjs'))
      if (at) out.push(`      ${grey(at.trim())}`)
      out.push('')
    }
  }

  const written = writeReport({ rows, failures, seconds, when: new Date().toLocaleString('sv'), node: process.version })
  if (written?.target) out.push(`  ${'Report'.padEnd(14)}${path.relative(process.cwd(), written.target)}`, '')
  if (written?.error) out.push(`  ${'Report'.padEnd(14)}${yellow(`not written: ${written.error}`)}`, '')

  out.push(HEAVY, '')
  yield out.join('\n')
}

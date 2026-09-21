/*
 * A reporter for `node --test` that says what was checked and how it went.
 *
 * Node runs the test files in a pool, so their events interleave; results are
 * collected and printed grouped by file at the end. A failure is also printed
 * the moment it happens, so a long run surfaces trouble without waiting.
 *
 * Colour follows the usual rules: on for a terminal, off when piped or when
 * NO_COLOR is set, forced on by FORCE_COLOR.
 */
import path from 'node:path'

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
const plainDuration = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`)

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

  for await (const event of source) {
    const data = event.data ?? {}
    if (event.type !== 'test:pass' && event.type !== 'test:fail') continue
    const row = bucket(data.file)
    const ms = data.details?.duration_ms ?? 0
    row.ms += ms
    if (event.type === 'test:pass') {
      if (data.skip || data.todo) {
        row.skip += 1
        row.tests.push({ name: data.name, state: 'skip', ms })
        continue
      }
      row.pass += 1
      row.tests.push({ name: data.name, state: 'pass', ms })
      continue
    }
    row.fail += 1
    row.tests.push({ name: data.name, state: 'fail', ms })
    const where = data.file ? path.basename(data.file) : '(unknown)'
    const error = data.details?.error
    const cause = error?.cause ?? error
    const message = cause?.message ?? String(cause ?? 'failed')
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

  /* --------------------------------------------------- what each file checked */
  out.push(bold('  WHAT WAS CHECKED'), grey(`  ${RULE}`), '')
  for (const [name, row] of rows) {
    const badge = row.fail ? red(`${row.fail} failed`) : green('all passed')
    out.push(`  ${blue(bold(name))} ${grey('·')} ${row.tests.length} checks ${grey('·')} ${badge} ${duration(row.ms)}`)
    for (const item of row.tests) {
      const mark = item.state === 'pass' ? green('✔') : item.state === 'fail' ? red('✘') : yellow('○')
      const text = item.state === 'fail' ? red(item.name) : item.state === 'skip' ? grey(item.name) : item.name
      out.push(`    ${mark} ${text}${item.ms >= 100 ? ` ${duration(item.ms)}` : ''}`)
    }
    out.push('')
  }

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

  out.push(HEAVY, '')
  yield out.join('\n')
}

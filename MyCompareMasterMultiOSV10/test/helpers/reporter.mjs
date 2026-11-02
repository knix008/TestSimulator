// A test reporter that groups results by category (the `category › name`
// prefix of each test) and ends with a coloured summary table, so the run
// reads as a report rather than a stream.
import { PASS, FAIL, bar, banner, bold, cyan, dim, ratio, red, yellow } from './colors.mjs'

export default async function* reporter(source) {
  const categories = new Map()
  const failures = []
  let ran = 0
  let passed = 0
  const record = (event, ok) => {
    const category = event.data.name.includes(' › ') ? event.data.name.split(' › ')[0] : categoryOf(event.data.file)
    if (!categories.has(category)) categories.set(category, { passed: 0, failed: 0, names: [] })
    const bucket = categories.get(category)
    if (ok) bucket.passed += 1
    else bucket.failed += 1
    bucket.names.push({ name: event.data.name.replace(/^[^›]+ › /, ''), ok, ms: event.data.details?.duration_ms ?? 0 })
    ran += 1
    if (ok) passed += 1
  }
  for await (const event of source) {
    switch (event.type) {
      case 'test:pass':
        if (event.data.details?.type === 'suite') break
        record(event, true)
        break
      case 'test:fail':
        if (event.data.details?.type === 'suite') break
        record(event, false)
        failures.push({ name: event.data.name, error: event.data.details?.error })
        break
      default:
        break
    }
  }
  yield `\n${bold(cyan('═══ Unit tests (node --test) ═══'))}\n`
  for (const [category, bucket] of [...categories.entries()].sort()) {
    const total = bucket.passed + bucket.failed
    yield `\n${bold(bucket.failed ? red(`[${category}]`) : cyan(`[${category}]`))} ${ratio(bucket.passed, total)}\n`
    for (const item of bucket.names) yield `  ${item.ok ? PASS : FAIL} ${item.ok ? item.name : red(item.name)}${item.ms >= 1 ? dim(` (${Math.round(item.ms)} ms)`) : ''}\n`
  }
  if (failures.length) {
    yield `\n${bold(red('─── Failures ───'))}\n`
    for (const failure of failures) yield `${FAIL} ${red(failure.name)}\n${dim(String(failure.error?.stack ?? failure.error?.message ?? failure.error).split('\n').slice(0, 8).map((line) => `    ${line}`).join('\n'))}\n`
  }
  yield `\n${bold(cyan('─── Summary (unit) ───'))}\n`
  for (const [category, bucket] of [...categories.entries()].sort()) {
    const total = bucket.passed + bucket.failed
    yield `  ${(bucket.failed ? red : (text) => text)(category.padEnd(18))} ${ratio(bucket.passed, total)}  ${bar(bucket.passed, total, 12)}\n`
  }
  yield `  ${bold('total'.padEnd(18))} ${ratio(passed, ran)}  ${bar(passed, ran, 12)}  ${banner(passed === ran ? 'ALL PASSED' : `${ran - passed} FAILED`, passed === ran)}\n`
  void yellow
}

function categoryOf(file) {
  const base = String(file ?? '').split(/[\\/]/).pop() ?? ''
  return base.replace(/\.test\.mjs$/, '') || 'misc'
}

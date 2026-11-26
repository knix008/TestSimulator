// node:test reporter for `npm test`: one line per test as it finishes, columns aligned,
// coloured, with each test's run time; then a per-file and overall summary.
//   PASS   1  packages.test.mjs   tar reader: ustar entries ........................   3.1 ms
import path from 'node:path'

const useColor = process.env.NO_COLOR == null && (process.stdout.isTTY || process.env.FORCE_COLOR)
const paint = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s))
const c = {
  green: paint('32'),
  red: paint('31'),
  yellow: paint('33'),
  cyan: paint('36'),
  magenta: paint('35'),
  gray: paint('90'),
  bold: paint('1'),
  bgGreen: paint('42;30;1'),
  bgRed: paint('41;37;1'),
  bgYellow: paint('43;30;1'),
}

const NAME_W = 72
const FILE_W = 20

function ms(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(2)} s`
  return `${n.toFixed(1)} ms`
}

function fit(s, w) {
  s = String(s)
  return s.length > w ? `${s.slice(0, w - 1)}…` : s.padEnd(w, ' ')
}

function dots(name) {
  const text = fit(name, NAME_W)
  const trimmed = text.trimEnd()
  return trimmed.length >= NAME_W - 1 ? text : `${trimmed} ${'.'.repeat(NAME_W - trimmed.length - 1)}`
}

export default async function* reporter(source) {
  const started = Date.now()
  const files = new Map()
  let n = 0
  const failures = []
  yield `\n${c.bold(c.cyan('MyISOMaker tests'))}  ${c.gray(new Date().toISOString())}\n`
  yield `${c.gray(`${'RESULT'.padEnd(6)}  ${'#'.padStart(3)}  ${'FILE'.padEnd(FILE_W)}  ${'TEST'.padEnd(NAME_W)}  ${'TIME'.padStart(9)}`)}\n`
  yield `${c.gray('─'.repeat(6 + 2 + 3 + 2 + FILE_W + 2 + NAME_W + 2 + 9))}\n`

  for await (const event of source) {
    const d = event.data
    if (event.type !== 'test:pass' && event.type !== 'test:fail') {
      if (event.type === 'test:stderr' || event.type === 'test:stdout') {
        const text = String(d.message ?? '').trimEnd()
        if (text) yield `${c.gray(`        │ ${text}`)}\n`
      }
      continue
    }
    // Only leaf tests (no subtests are used here; suites report as nesting > 0 parents)
    if (d.details?.type === 'suite') continue
    const file = path.basename(d.file ?? '?')
    const dur = d.details?.duration_ms ?? 0
    const st = files.get(file) ?? { pass: 0, fail: 0, skip: 0, time: 0 }
    files.set(file, st)
    st.time += dur
    n += 1
    const num = c.gray(String(n).padStart(3))
    const fileCol = c.magenta(fit(file, FILE_W))
    const time = c.yellow(ms(dur).padStart(9))
    if (d.skip || d.todo) {
      st.skip += 1
      const why = typeof d.skip === 'string' ? ` (${d.skip})` : ''
      yield `${c.bgYellow(' SKIP ')}  ${num}  ${fileCol}  ${c.yellow(dots(d.name + why))}  ${time}\n`
    } else if (event.type === 'test:pass') {
      st.pass += 1
      yield `${c.bgGreen(' PASS ')}  ${num}  ${fileCol}  ${dots(d.name)}  ${time}\n`
    } else {
      st.fail += 1
      failures.push({ file, name: d.name, error: d.details?.error })
      yield `${c.bgRed(' FAIL ')}  ${num}  ${fileCol}  ${c.red(dots(d.name))}  ${time}\n`
      const err = d.details?.error
      const msg = String(err?.cause?.message ?? err?.message ?? err ?? '').split('\n').slice(0, 6)
      for (const line of msg) yield `${c.red(`        │ ${line}`)}\n`
    }
  }

  const total = [...files.values()].reduce(
    (a, s) => ({ pass: a.pass + s.pass, fail: a.fail + s.fail, skip: a.skip + s.skip, time: a.time + s.time }),
    { pass: 0, fail: 0, skip: 0, time: 0 },
  )
  const wall = Date.now() - started
  const line = '─'.repeat(FILE_W + 2 + 6 * 3 + 6 + 12)
  yield `\n${c.bold(c.cyan('Summary'))}\n`
  yield `${c.gray(`${'FILE'.padEnd(FILE_W)}  ${'PASS'.padStart(6)}  ${'FAIL'.padStart(6)}  ${'SKIP'.padStart(6)}  ${'TIME'.padStart(12)}`)}\n`
  yield `${c.gray(line)}\n`
  for (const [file, s] of files) {
    yield `${c.magenta(fit(file, FILE_W))}  ${c.green(String(s.pass).padStart(6))}  ${(s.fail ? c.red : c.gray)(String(s.fail).padStart(6))}  ${(s.skip ? c.yellow : c.gray)(String(s.skip).padStart(6))}  ${c.yellow(ms(s.time).padStart(12))}\n`
  }
  yield `${c.gray(line)}\n`
  yield `${c.bold(fit('Total', FILE_W))}  ${c.bold(c.green(String(total.pass).padStart(6)))}  ${c.bold((total.fail ? c.red : c.gray)(String(total.fail).padStart(6)))}  ${c.bold((total.skip ? c.yellow : c.gray)(String(total.skip).padStart(6)))}  ${c.bold(c.yellow(ms(total.time).padStart(12)))}\n`
  yield `${c.gray(fit('Wall clock', FILE_W))}  ${' '.repeat(6 * 3 + 4)}  ${c.yellow(ms(wall).padStart(12))}\n\n`
  if (failures.length) {
    yield `${c.bgRed(` ${failures.length} FAILED `)}  ${failures.map((f) => `${f.file} › ${f.name}`).join(', ')}\n\n`
  } else {
    yield `${c.bgGreen(' ALL TESTS PASSED ')}  ${c.green(`${total.pass} passed`)}${total.skip ? c.yellow(`, ${total.skip} skipped`) : ''}\n\n`
  }
}

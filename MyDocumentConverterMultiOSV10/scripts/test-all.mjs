// `npm test`: the whole test run in one go.
//
//   1. unit tests    — node --test over test/*.test.mjs (engine, formats, postscript, large, samples, app, build)
//   2. build         — tsc + vite, so the GUI test runs against fresh code
//   3. GUI test      — the app under Electron, driven through its automation hook
//
// Each part prints its results grouped by category; the end is one summary
// over everything. Exit code 1 when anything failed. `--unit` or `--gui`
// runs one part only.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { bar, banner, bold, cyan, dim, magenta, ratio, red, stripAnsi, white, yellow } from '../test/helpers/colors.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const runUnit = !args.includes('--gui')
const runGui = !args.includes('--unit')
const resultsDir = path.join(root, 'test-results')
fs.mkdirSync(resultsDir, { recursive: true })

function run(command, commandArgs, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], shell: false, env: { ...process.env, FORCE_COLOR: process.env.NO_COLOR ? '0' : '1' }, ...options })
    let output = ''
    child.stdout.on('data', (chunk) => { output += chunk; process.stdout.write(chunk) })
    child.stderr.on('data', (chunk) => { output += chunk; process.stderr.write(chunk) })
    child.on('close', (code) => resolve({ code: code ?? 1, output }))
    child.on('error', (error) => resolve({ code: 1, output: `${output}\n${error.message}` }))
  })
}

/** Reads the per-category counts out of a summary block printed by a reporter. */
function parseSummary(output, heading) {
  const plain = stripAnsi(output)
  const start = plain.indexOf(heading)
  if (start < 0) return null
  const lines = plain.slice(start).split('\n').slice(1)
  const rows = []
  for (const line of lines) {
    const match = /^\s{2}(\S.*?)\s+(\d+)\s+\/\s+(\d+)/.exec(line)
    if (!match) {
      if (rows.length) break
      continue
    }
    rows.push({ category: match[1].trim(), passed: Number(match[2]), total: Number(match[3]) })
  }
  return rows
}

const sections = []
let failed = false

if (runUnit) {
  console.log(bold(cyan('▶ Unit tests')))
  const unit = await run(process.execPath, ['--test', '--test-reporter=./test/helpers/reporter.mjs', '--import', './test/helpers/setup.mjs', 'test/engine.test.mjs', 'test/formats.test.mjs', 'test/postscript.test.mjs', 'test/large.test.mjs', 'test/samples.test.mjs', 'test/app.test.mjs', 'test/build.test.mjs'])
  const rows = parseSummary(unit.output, '─── Summary (unit) ───') ?? []
  const total = rows.find((row) => row.category === 'total')
  sections.push({ name: 'unit', rows: rows.filter((row) => row.category !== 'total'), total })
  if (unit.code !== 0 || !total || total.passed !== total.total) failed = true
  fs.writeFileSync(path.join(resultsDir, 'unit.log'), unit.output)
}

if (runGui) {
  console.log(bold(yellow('\n▶ Build (for the GUI test)')))
  const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
  const build = fs.existsSync(npmCli)
    ? await run(process.execPath, [npmCli, 'run', 'build', '--silent'])
    : await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build', '--silent'], { shell: process.platform === 'win32' })
  if (build.code !== 0) {
    failed = true
    sections.push({ name: 'build', rows: [], total: { passed: 0, total: 1 } })
  } else {
    console.log(bold(magenta('\n▶ GUI test (Electron)')))
    const gui = await run(process.execPath, ['scripts/smoke.mjs'])
    const rows = parseSummary(gui.output, '─── Summary (GUI) ───') ?? []
    const total = rows.find((row) => row.category === 'total')
    sections.push({ name: 'gui', rows: rows.filter((row) => row.category !== 'total'), total })
    if (gui.code !== 0 || !total || total.passed !== total.total) failed = true
    fs.writeFileSync(path.join(resultsDir, 'gui.log'), gui.output)
  }
}

const line = '═'.repeat(64)
console.log(`\n${bold(white(line))}\n${bold(white('  TEST SUMMARY'))}\n${bold(white(line))}`)
let grandPassed = 0
let grandTotal = 0
for (const section of sections) {
  const paint = section.name === 'unit' ? cyan : section.name === 'gui' ? magenta : yellow
  console.log(`\n${bold(paint(section.name.toUpperCase()))}`)
  for (const row of section.rows) console.log(`  ${(row.passed === row.total ? (text) => text : red)(row.category.padEnd(18))} ${ratio(row.passed, row.total)}  ${bar(row.passed, row.total, 16)}`)
  if (section.total) {
    console.log(`  ${bold('subtotal'.padEnd(18))} ${ratio(section.total.passed, section.total.total)}  ${bar(section.total.passed, section.total.total, 16)}`)
    grandPassed += section.total.passed
    grandTotal += section.total.total
  }
}
const ok = !failed && grandPassed === grandTotal
console.log(`\n${bold(white(line))}`)
console.log(`  ${bold('TOTAL'.padEnd(18))} ${ratio(grandPassed, grandTotal)}  ${bar(grandPassed, grandTotal, 16)}  ${banner(ok ? 'ALL PASSED' : 'FAILURES', ok)}`)
console.log(`${bold(white(line))}`)
console.log(dim(`  logs: ${resultsDir}`))
fs.writeFileSync(path.join(resultsDir, 'summary.json'), JSON.stringify({ sections, passed: grandPassed, total: grandTotal, ok, at: new Date().toISOString() }, null, 2))
process.exit(failed ? 1 : 0)

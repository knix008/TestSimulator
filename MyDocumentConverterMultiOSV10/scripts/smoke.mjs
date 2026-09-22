// Runs the automated GUI test: launches the built app under Electron with
// MDCV_SMOKE set, collects the JSON report the harness prints, and prints it
// grouped by category with a summary. Exit code 1 when any step failed.
//
// Requires a build (`npm run build`); `npm test` runs it after the unit tests.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PASS, FAIL, bar, banner, bold, dim, magenta, ratio, red } from '../test/helpers/colors.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const electronPath = require('electron')
const outDir = path.join(root, 'test-results', 'smoke')
// A fresh profile every run: the previous run's session and settings would otherwise be restored into the test.
fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(outDir, { recursive: true })

if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
  console.error('smoke: dist/ is missing — run `npm run build` first.')
  process.exit(1)
}

const env = { ...process.env, MDCV_SMOKE: '1', MDCV_SMOKE_OUT: outDir }
delete env.ELECTRON_RUN_AS_NODE
delete env.ELECTRON_NO_ATTACH_CONSOLE

const child = spawn(electronPath, ['.', '--user-data-dir=' + path.join(outDir, 'profile')], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: false })
let output = ''
child.stdout.on('data', (chunk) => { output += chunk })
child.stderr.on('data', (chunk) => { output += chunk })
const timer = setTimeout(() => { console.error('smoke: timed out after 8 minutes'); child.kill(); }, 8 * 60 * 1000)

child.on('close', (code) => {
  clearTimeout(timer)
  const match = /__MDCV_SMOKE__([\s\S]*?)__MDCV_SMOKE__/.exec(output)
  if (!match) {
    console.error('smoke: no report was produced (exit code %s)\n%s', code, output.slice(-4000))
    process.exit(1)
  }
  const report = JSON.parse(match[1])
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2))
  printReport(report)
  process.exit(report.results.every((r) => r.ok) ? 0 : 1)
})

export function printReport(report) {
  const byCategory = new Map()
  for (const result of report.results) {
    if (!byCategory.has(result.category)) byCategory.set(result.category, [])
    byCategory.get(result.category).push(result)
  }
  console.log(`
${bold(magenta('═══ GUI smoke test (Electron) ═══'))}`)
  for (const [category, items] of byCategory) {
    const passed = items.filter((item) => item.ok).length
    console.log(`
${bold(passed === items.length ? magenta(`[${category}]`) : red(`[${category}]`))} ${ratio(passed, items.length)}`)
    for (const item of items) {
      const detail = item.detail ? dim(` — ${item.detail.split('\n')[0].slice(0, 110)}`) : ''
      console.log(`  ${item.ok ? PASS : FAIL} ${item.ok ? item.name : red(item.name)}${item.ok ? detail : red(detail)}${item.ms ? dim(` (${item.ms} ms)`) : ''}`)
    }
  }
  const total = report.results.length
  const passed = report.results.filter((r) => r.ok).length
  console.log(`
${bold(magenta('─── Summary (GUI) ───'))}`)
  for (const [category, items] of byCategory) {
    const ok = items.filter((i) => i.ok).length
    console.log(`  ${(ok === items.length ? (text) => text : red)(category.padEnd(18))} ${ratio(ok, items.length)}  ${bar(ok, items.length, 12)}`)
  }
  console.log(`  ${bold('total'.padEnd(18))} ${ratio(passed, total)}  ${bar(passed, total, 12)}  ${banner(passed === total ? 'ALL PASSED' : `${total - passed} FAILED`, passed === total)}`)
  if (report.shots?.length) console.log(dim(`  screenshots: ${report.outDir}`))
}

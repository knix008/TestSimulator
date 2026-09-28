import fs from 'fs'
import path from 'path'
import type { Reporter, TestModule } from 'vitest/node'

const useColor = Boolean(process.stdout.isTTY || process.env.FORCE_COLOR)

const paint = {
  reset: useColor ? '\x1b[0m' : '',
  bold: useColor ? '\x1b[1m' : '',
  dim: useColor ? '\x1b[2m' : '',
  green: useColor ? '\x1b[32m' : '',
  red: useColor ? '\x1b[31m' : '',
  cyan: useColor ? '\x1b[36m' : '',
  yellow: useColor ? '\x1b[33m' : '',
  blue: useColor ? '\x1b[34m' : '',
  magenta: useColor ? '\x1b[35m' : '',
  white: useColor ? '\x1b[97m' : ''
}

/** A test at or over this is listed in the report's slow section. */
const SLOW_MS = 1000

const categoryColors = [paint.cyan, paint.blue, paint.magenta, paint.yellow, paint.green, paint.white]

interface Row {
  failed: boolean
  name: string
  duration: number
}

function categoryOf(name: string): string {
  const match = name.match(/^\[(.+?)\]/)
  return match?.[1] || 'General'
}

function labelOf(name: string): string {
  return name.replace(/^\[[^\]]+\]\s*/, '')
}

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`
  if (ms >= 100) return `${Math.round(ms)}ms`
  return `${ms.toFixed(1)}ms`
}

function clock(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export default class SummaryReporter implements Reporter {
  private startedAt = Date.now()

  onTestRunStart() {
    this.startedAt = Date.now()
  }

  onTestRunEnd(testModules: ReadonlyArray<TestModule>) {
    const finishedAt = Date.now()
    const groups = new Map<string, Row[]>()
    for (const mod of testModules) {
      for (const test of mod.children.allTests()) {
        const category = categoryOf(test.name)
        const rows = groups.get(category) ?? []
        const failed = test.result()?.state === 'failed'
        rows.push({
          failed,
          name: labelOf(test.name),
          duration: test.diagnostic()?.duration ?? 0
        })
        groups.set(category, rows)
      }
    }

    const plain: string[] = []
    const color: string[] = []
    const started = new Date(this.startedAt)
    const elapsed = finishedAt - this.startedAt
    let pass = 0
    let fail = 0
    let testTime = 0

    const header = `MyCAD tests    ${clock(started)}    ${formatMs(elapsed)}`
    const rule = '─'.repeat(Math.max(56, header.length + 2))
    plain.push(rule, header, rule, '')
    color.push(
      `${paint.cyan}${paint.bold}${rule}${paint.reset}`,
      `${paint.bold}${paint.white}MyCAD tests${paint.reset}    ${paint.yellow}${clock(started)}${paint.reset}    ${paint.cyan}${formatMs(elapsed)}${paint.reset}`,
      `${paint.cyan}${rule}${paint.reset}`,
      ''
    )

    // Categories and rows are sorted by name, so two runs of the same suite
    // write the same file and only real changes show up in a diff.
    const ordered = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    let colorIndex = 0
    for (const [category, rows] of ordered) {
      rows.sort((a, b) => Number(b.failed) - Number(a.failed) || a.name.localeCompare(b.name))
      const passed = rows.filter((row) => !row.failed).length
      const failed = rows.length - passed
      const duration = rows.reduce((sum, row) => sum + row.duration, 0)
      pass += passed
      fail += failed
      testTime += duration
      const tone = categoryColors[colorIndex % categoryColors.length]
      colorIndex += 1
      const title = `${category}    ${passed} passed    ${failed} failed    ${formatMs(duration)}`
      plain.push(title)
      color.push(`${tone}${paint.bold}${category}${paint.reset}    ${paint.green}${passed} passed${paint.reset}    ${failed ? paint.red : paint.dim}${failed} failed${paint.reset}    ${paint.dim}${formatMs(duration)}${paint.reset}`)
      const width = Math.max(...rows.map((row) => row.name.length), 12)
      for (const row of rows) {
        const mark = row.failed ? 'FAIL' : 'PASS'
        const padded = row.name.padEnd(width)
        plain.push(`  ${mark}  ${padded}  ${formatMs(row.duration)}`)
        const markColor = row.failed ? `${paint.red}✗${paint.reset}` : `${paint.green}✓${paint.reset}`
        const nameColor = row.failed ? paint.red : paint.white
        color.push(`  ${markColor}  ${nameColor}${padded}${paint.reset}  ${paint.dim}${formatMs(row.duration)}${paint.reset}`)
      }
      plain.push('')
      color.push('')
    }

    // Slow tests stay visible in the report even though the runner only
    // highlights the ones past its own threshold.
    const slow = [...groups.values()].flat().filter((row) => row.duration >= SLOW_MS)
    slow.sort((a, b) => b.duration - a.duration)
    if (slow.length) {
      plain.push(`Slowest (${SLOW_MS} ms and over)`)
      color.push(`${paint.bold}${paint.yellow}Slowest (${SLOW_MS} ms and over)${paint.reset}`)
      for (const row of slow.slice(0, 5)) {
        plain.push(`  ${row.name}  ${formatMs(row.duration)}`)
        color.push(`  ${paint.white}${row.name}${paint.reset}  ${paint.dim}${formatMs(row.duration)}${paint.reset}`)
      }
      plain.push('')
      color.push('')
    }

    const summary = [
      'Summary',
      `Categories  ${groups.size}`,
      `Passed      ${pass}`,
      `Failed      ${fail}`,
      `Total       ${pass + fail}`,
      `Test time   ${formatMs(testTime)}`,
      `Elapsed     ${formatMs(elapsed)}`
    ]
    plain.push(...summary)
    color.push(
      `${paint.bold}${paint.cyan}Summary${paint.reset}`,
      `Categories  ${paint.white}${groups.size}${paint.reset}`,
      `Passed      ${paint.green}${paint.bold}${pass}${paint.reset}`,
      `Failed      ${fail ? paint.red + paint.bold : paint.dim}${fail}${paint.reset}`,
      `Total       ${paint.white}${pass + fail}${paint.reset}`,
      `Test time   ${paint.yellow}${formatMs(testTime)}${paint.reset}`,
      `Elapsed     ${paint.yellow}${formatMs(elapsed)}${paint.reset}`
    )

    console.log(`\n${color.join('\n')}\n`)
    fs.mkdirSync(path.resolve('test-output'), { recursive: true })
    fs.writeFileSync(path.resolve('test-output', 'summary.txt'), `${plain.join('\n')}\n`, 'utf8')
  }
}

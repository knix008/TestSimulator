// Clears the way for electron-builder.
//
// Packaging renames `release/win-unpacked.tmp` onto `release/win-unpacked`,
// which fails with EPERM while anything still holds a file in there: a MyCAD
// window left running, or a half-finished directory from an interrupted build.
// This script stops our own processes and removes the stale directories, with a
// few retries because Windows releases handles asynchronously.
import { execFileSync } from 'node:child_process'
import { existsSync, rmSync, readdirSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(process.cwd())
const release = path.join(root, 'release')

function stopOurProcesses() {
  if (process.platform === 'win32') {
    // Only MyCAD's own processes, started from this project: another Electron
    // app, an editor running on Electron and the dev server's esbuild service
    // (also under node_modules) are all left alone.
    const script = [
      "Get-CimInstance Win32_Process",
      "| Where-Object { $_.Name -in @('MyCAD.exe','electron.exe') }",
      "| Where-Object { $_.ExecutablePath -and ($_.ExecutablePath -like '" + root.replace(/'/g, "''") + "*') }",
      "| ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {} }"
    ].join(' ')
    try {
      execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: 'ignore' })
    } catch {
      // Nothing was running, or the shell refused: packaging can still proceed.
    }
    return
  }
  try {
    execFileSync('pkill', ['-f', path.join(root, 'node_modules', 'electron', 'dist')], { stdio: 'ignore' })
  } catch {
    // pkill exits non-zero when it matches nothing.
  }
}

function removeWithRetries(target) {
  if (!existsSync(target)) return true
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      rmSync(target, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 })
      if (!existsSync(target)) return true
    } catch {
      // fall through to the wait below
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400)
  }
  return !existsSync(target)
}

stopOurProcesses()

const stale = existsSync(release)
  ? readdirSync(release).filter((name) => name.endsWith('.tmp') || name.endsWith('-unpacked') || name === 'mac')
  : []

const failed = []
for (const name of stale) {
  const target = path.join(release, name)
  if (!removeWithRetries(target)) failed.push(name)
}

if (failed.length > 0) {
  console.error(`prepare-dist: could not remove ${failed.join(', ')} in release/.`)
  console.error('Close anything using those files (a running MyCAD, Explorer, an antivirus scan) and build again.')
  process.exit(1)
}

console.log(`prepare-dist: release/ is clear${stale.length ? ` (removed ${stale.join(', ')})` : ''}`)

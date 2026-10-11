// Clears the way for electron-builder.
//
// Packaging renames `release/win-unpacked.tmp` onto `release/win-unpacked`,
// which fails with EPERM while anything still holds a file in there: a
// MyCircuit window left running, or a half-finished directory from an
// interrupted build. This script stops our own processes (only those started
// from this project folder) and removes the stale directories, with a few
// retries because Windows releases handles asynchronously.
import { execFileSync } from 'node:child_process'
import { existsSync, rmSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const release = path.join(root, 'release')
const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))

// Installers left over from an earlier version would otherwise be copied to
// the project root again by scripts/copy-installers.cjs.
const INSTALLER = /^MyCircuit-(?:Setup-)?(\d+\.\d+\.\d+)(?:-.*)?\.(?:exe|dmg|AppImage|deb|rpm|tar\.gz|zip)(?:\.blockmap)?$/i
function removeOldInstallers(dir) {
  if (!existsSync(dir)) return []
  const removed = []
  for (const name of readdirSync(dir)) {
    const m = INSTALLER.exec(name)
    if (!m || m[1] === version) continue
    try {
      rmSync(path.join(dir, name), { force: true })
      removed.push(name)
    } catch {
      console.warn(`prepare-dist: could not remove old installer ${name}`)
    }
  }
  return removed
}

function stopOurProcesses() {
  if (process.platform === 'win32') {
    const script = [
      'Get-CimInstance Win32_Process',
      "| Where-Object { $_.Name -in @('MyCircuit.exe','electron.exe') }",
      "| Where-Object { $_.ExecutablePath -and ($_.ExecutablePath -like '" + root.replace(/'/g, "''") + "*') }",
      '| ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {} }'
    ].join(' ')
    try {
      execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: 'ignore' })
    } catch {
      // Nothing was running, or the shell refused: packaging can still proceed.
    }
    return
  }
  try {
    execFileSync('pkill', ['-f', path.join(root, 'release')], { stdio: 'ignore' })
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

const oldInstallers = [...removeOldInstallers(release), ...removeOldInstallers(root)]
if (oldInstallers.length > 0) console.log(`prepare-dist: removed old installers ${oldInstallers.join(', ')}`)

const stale = existsSync(release)
  ? readdirSync(release).filter((name) => name.endsWith('.tmp') || name.endsWith('-unpacked') || name === 'mac' || name === 'mac-arm64')
  : []

const failed = []
for (const name of stale) {
  if (!removeWithRetries(path.join(release, name))) failed.push(name)
}

if (failed.length > 0) {
  console.error(`prepare-dist: could not remove ${failed.join(', ')} in release/.`)
  console.error('Close anything using those files (a running MyCircuit, Explorer, an antivirus scan) and build again.')
  process.exit(1)
}

console.log(`prepare-dist: release/ is clear${stale.length ? ` (removed ${stale.join(', ')})` : ''}`)

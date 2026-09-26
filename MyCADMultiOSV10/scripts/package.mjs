// Runs electron-builder, and retries when Windows refuses to rename the freshly
// extracted Electron directory.
//
// Packaging extracts Electron into `release/win-unpacked.tmp` and renames it
// onto `release/win-unpacked`. On Windows the anti-virus scanner still holds
// handles inside that directory for a few seconds, and the rename fails with
// EPERM even though nothing is wrong: a moment later the same operation works.
// Everything else is passed straight through and fails as usual.
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const ATTEMPTS = 3
const BACKOFF_MS = [4000, 9000]
const args = process.argv.slice(2)
const root = process.cwd()
const builder = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder')

function clearRelease() {
  spawnSync(process.execPath, [path.join(root, 'scripts', 'prepare-dist.mjs')], { stdio: 'inherit' })
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/** A locked file in release/ is the only failure worth trying again. */
function isFileLock(output) {
  return /EPERM|EBUSY|operation not permitted|resource busy/i.test(output) && /release/i.test(output)
}

for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
  const result = spawnSync(builder, args, { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  process.stdout.write(result.stdout ?? '')
  process.stderr.write(result.stderr ?? '')
  if (result.status === 0) process.exit(0)
  if (attempt === ATTEMPTS || !isFileLock(output)) process.exit(result.status ?? 1)
  const wait = BACKOFF_MS[attempt - 1] ?? BACKOFF_MS.at(-1)
  console.log(`\npackage: release/ was still locked, clearing it and trying again in ${wait / 1000}s (attempt ${attempt + 1} of ${ATTEMPTS}).`)
  sleep(wait)
  clearRelease()
}

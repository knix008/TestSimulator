const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { clearStaging, releaseDir } = require('./clean-release.cjs')

/*
 * Runs electron-builder, clearing what an earlier run left behind and retrying
 * a Windows file lock.
 *
 * Packaging writes about a hundred megabytes of .exe, .dll and archive into
 * `release/`, then renames and deletes those files moments later. Whatever
 * scans new executables on Windows can still have one open at that point, and
 * the build dies with `EPERM: operation not permitted` on a rename or
 * `EBUSY: resource busy or locked` on a delete — on files nothing else is
 * using. Seconds later the same operation succeeds by hand, so the answer is to
 * wait and run it again.
 *
 * Only a lock is retried. A bad config, a missing icon or a compile error is
 * reported the first time, because retrying it would only hide it.
 */

const projectDir = path.join(__dirname, '..')
/*
 * How long to wait before each retry. It grows because the lock is not a fixed
 * delay but a queue: the scanner is working through the hundred megabytes the
 * failed attempt just wrote, and the next attempt writes another hundred. Five
 * seconds clears it when the machine is idle; the later waits are for when it
 * is not.
 */
const retryWaits = [5000, 15000, 30000]

/** What Windows says when something else is holding a file. */
const lockPattern = /\b(EPERM|EBUSY|EACCES)\b|operation not permitted|resource busy or locked/i

const builderCli = path.join(path.dirname(require.resolve('electron-builder/package.json')), 'cli.js')

/** Intermediates from a run that did not get to clean up after itself. */
function clearIntermediates() {
  if (!fs.existsSync(releaseDir)) {
    return
  }
  for (const entry of fs.readdirSync(releaseDir, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.(7z|tmp)$/i.test(entry.name)) {
      continue
    }
    try {
      fs.rmSync(path.join(releaseDir, entry.name), { force: true, maxRetries: 5, retryDelay: 200 })
    } catch {
      // Still held. The next attempt tries again, which is the whole point.
    }
  }
}

/**
 * Runs the builder, passing its output through as it arrives so the build still
 * reports progress, while keeping a copy to read once it has finished.
 *
 * The failure has to be read out of the text: electron-builder prints it to
 * stdout, and the exit code alone does not say whether it was a lock.
 */
function runBuilder(args) {
  return new Promise((resolve) => {
    // Through this Node binary rather than a shell shim, the way the other
    // launchers in here do it.
    const child = spawn(process.execPath, [builderCli, ...args], {
      cwd: projectDir,
      stdio: ['inherit', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk
      process.stdout.write(chunk)
    })
    child.stderr.on('data', (chunk) => {
      output += chunk
      process.stderr.write(chunk)
    })
    child.on('error', (error) => resolve({ code: 1, output: `${output}${error.message}` }))
    child.on('close', (code) => resolve({ code: code ?? 1, output }))
  })
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  const args = process.argv.slice(2)
  const attempts = retryWaits.length + 1
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      clearStaging({ quiet: true })
    } catch (error) {
      console.warn(`package-app: could not clear the staging folder — ${error.message}`)
    }
    clearIntermediates()

    const { code, output } = await runBuilder(args)
    if (code === 0) {
      return 0
    }
    if (!lockPattern.test(output) || attempt === attempts) {
      return code
    }
    const wait = retryWaits[attempt - 1]
    console.warn(`package-app: a file was still locked; retrying in ${wait / 1000}s (attempt ${attempt + 1} of ${attempts})`)
    await pause(wait)
  }
  return 1
}

main().then((code) => process.exit(code))

const fs = require('node:fs')
const path = require('node:path')

/*
 * Clears the staging directories electron-builder unpacks into.
 *
 * electron-builder extracts Electron into `release/<target>.tmp` and then
 * renames that onto `release/<target>`. A run that was interrupted — or whose
 * files something still had open — leaves the `.tmp` behind, and the next run
 * fails at the rename. The packaged installers are left alone; only the staging
 * trees go.
 *
 * Used by `scripts/package-app.cjs` before every attempt, and on its own
 * through `npm run clean:release`.
 */

const releaseDir = path.join(__dirname, '..', 'release')

/** Returns the names it removed, and throws on the first one it cannot. */
function clearStaging({ quiet = false } = {}) {
  if (!fs.existsSync(releaseDir)) {
    return []
  }
  const removed = []
  for (const entry of fs.readdirSync(releaseDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !(entry.name.endsWith('.tmp') || /-unpacked$/.test(entry.name))) {
      continue
    }
    fs.rmSync(path.join(releaseDir, entry.name), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    removed.push(entry.name)
    if (!quiet) {
      console.log(`clean-release: removed ${entry.name}`)
    }
  }
  return removed
}

module.exports = { clearStaging, releaseDir }

// Run directly: report what could not be cleared, rather than letting the build
// fail later on a rename that means nothing to the reader.
if (require.main === module) {
  try {
    clearStaging()
  } catch (error) {
    console.warn(`clean-release: ${error.message}`)
    console.warn('clean-release: close the packaged app, or any window open on that folder, and run again.')
    process.exit(1)
  }
}

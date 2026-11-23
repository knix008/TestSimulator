// npm run clean       the build outputs (dist, build, build-info, src-tauri/gen)
// npm run clean:all   everything that can be made again: also src-tauri/target, node_modules,
//                     out/ (test reports, tutorial frames), and what the build and the tutorial
//                     video put in the project root (installers, MyPhotoWork-Tutorial*.mp4).
import { readdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
if (args.length > 1 || (args.length === 1 && args[0] !== '--all')) {
  console.error('Usage: node scripts/clean.mjs [--all]')
  process.exit(1)
}

/** What the build copies to the project root (scripts/platform-build.mjs). */
const INSTALLER = /\.(exe|msi|dmg|deb|rpm|appimage)$/i
/** What npm run tutorial:video copies to the project root (scripts/tutorial-video.mjs). */
const TUTORIAL_VIDEO = /^MyPhotoWork-Tutorial.*\.mp4$/i

const targets = ['dist', 'build', 'src/build-info.json', 'src-tauri/gen']
if (args[0] === '--all') {
  targets.push('src-tauri/target', 'node_modules', 'out')
  // Generated files at the root go too; nothing else at the root is touched.
  for (const name of readdirSync(root)) if (INSTALLER.test(name) || TUTORIAL_VIDEO.test(name)) targets.push(name)
}

for (const target of targets) {
  rmSync(path.join(root, target), { recursive: true, force: true, maxRetries: 3 })
  console.log(`[clean] ${target}`)
}

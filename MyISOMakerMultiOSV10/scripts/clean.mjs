// Removes what builds and tests leave behind, keeping the sources:
//
//   dist/                  desktop pages bundle          (npm run build, tauri build)
//   dist-web/              web version                    (npm run build:web)
//   test-results/, *.tsbuildinfo, .vite/
//   dist-sidecar*/         the old Node host bundles (before the Rust engine), if still there
//
//   npm run clean       — the above
//   npm run clean:all   — also node_modules/, src-tauri/target/ (Rust builds, several GB) and
//                         src-tauri/gen/ (Tauri's schemas; only a fresh Rust build makes them again)
//                         then `npm install` again; the next build compiles Rust from scratch
//
// Installers copied to the project root (MyISOMaker_*.exe …) are kept: they are the deliverables.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const all = process.argv.includes('--all')

const targets = ['dist', 'dist-web', 'test-results', '.vite', 'dist-sidecar', 'dist-sidecar-release']
for (const name of fs.readdirSync(root)) if (name.endsWith('.tsbuildinfo')) targets.push(name)
if (all) targets.push('node_modules', path.join('src-tauri', 'target'), path.join('src-tauri', 'gen'))

let removed = 0
for (const rel of targets) {
  const p = path.join(root, rel)
  if (!fs.existsSync(p)) continue
  try {
    fs.rmSync(p, { recursive: true, force: true, maxRetries: 3 })
    console.log(`[clean] removed ${rel}`)
    removed += 1
  } catch (err) {
    // A running MyISOMaker (npm start) keeps target/debug/MyISOMaker.exe open.
    console.error(`[clean] could not remove ${rel}: ${err.message}`)
    process.exitCode = 1
  }
}
console.log(removed ? `[clean] ${removed} item(s) removed.` : '[clean] Nothing to remove.')

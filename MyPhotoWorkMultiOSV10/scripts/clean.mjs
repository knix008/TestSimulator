import { rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
if (args.length > 1 || (args.length === 1 && args[0] !== '--all')) {
  console.error('Usage: node scripts/clean.mjs [--all]')
  process.exit(1)
}

const targets = ['dist', 'build', 'src/build-info.json', 'src-tauri/gen']
if (args[0] === '--all') targets.push('src-tauri/target', 'node_modules')

for (const target of targets) {
  rmSync(path.join(root, target), { recursive: true, force: true, maxRetries: 3 })
  console.log(`[clean] ${target}`)
}

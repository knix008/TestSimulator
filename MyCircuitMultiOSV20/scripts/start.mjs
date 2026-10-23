// npm start — the desktop app in development: `tauri dev` starts
// scripts/dev-server.mjs (the project folder on http://localhost:5196) and
// builds and runs src-tauri in debug mode. Edits to the page show after
// Ctrl+R; edits to src-tauri rebuild and restart the app.
// Extra arguments go to the app: npm start -- C:\boards\amp.mycircuit
import { spawn, spawnSync } from 'node:child_process'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
spawnSync(process.execPath, [path.join(root, 'scripts', 'build-info.mjs')], { cwd: root, stdio: 'inherit' })
const cli = path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js')
const extra = process.argv.slice(2)
const args = [cli, 'dev', ...(extra.length ? ['--', '--', ...extra] : [])]
const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit', env: process.env })
child.on('exit', (code, signal) => process.exit(signal ? 1 : code ?? 0))
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { if (!child.killed) child.kill(sig) })

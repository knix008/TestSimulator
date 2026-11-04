// npm run dev: the editor in a browser (Vite), on 5173 or the next port free on both
// 127.0.0.1 and ::1. A port another program uses is never reused or stopped.
import { spawn, execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { freePort } from './free-port.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
execFileSync(process.execPath, [path.join(root, 'scripts', 'generate-build-info.cjs')], { cwd: root, stdio: 'inherit' })
const port = await freePort(5173)
if (port !== 5173) console.log(`[dev] Port 5173 is in use; using ${port}.`)
const child = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort', ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' })
child.on('exit', (code) => process.exit(code ?? 0))

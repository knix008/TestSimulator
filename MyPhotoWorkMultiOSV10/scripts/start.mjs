// npm start: `tauri dev` on a free dev-server port (5173 or the next one free on both
// 127.0.0.1 and ::1; a port another program uses is never reused or stopped). Vite
// starts first and tauri dev only once the page answers, so the window always shows
// the code as it is now.
import { spawn, execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { freePort } from './free-port.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const script = (name) => path.join(root, 'scripts', name)

execFileSync(process.execPath, [script('create-icons.cjs')], { cwd: root, stdio: 'inherit' })
execFileSync(process.execPath, [script('generate-build-info.cjs')], { cwd: root, stdio: 'inherit' })

const port = await freePort(5173)
if (port !== 5173) console.log(`[start] Port 5173 is in use by another program; using ${port}.`)
const devUrl = `http://127.0.0.1:${port}`
const vite = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'inherit' })
let tauri = null
const stopVite = () => { try { vite.kill() } catch { /* gone */ } }
vite.on('exit', (code) => {
  if (tauri) return
  console.error(`[start] Vite stopped before the app started (exit ${code}).`)
  process.exit(code || 1)
})
process.on('exit', stopVite)
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => { stopVite(); process.exit(130) })

const deadline = Date.now() + 60000
for (;;) {
  try { if ((await fetch(devUrl)).ok) break } catch { /* not listening yet */ }
  if (Date.now() > deadline) {
    console.error(`[start] Vite did not answer on ${devUrl} within 60 s.`)
    stopVite()
    process.exit(1)
  }
  await new Promise((resolve) => setTimeout(resolve, 150))
}

const config = { build: { devUrl } }
tauri = spawn(process.execPath, [path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'), 'dev', '--config', JSON.stringify(config), ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' })
tauri.on('exit', (code) => { stopVite(); process.exit(code ?? 0) })

// Dev desktop launcher: start Vite if needed, then Electron.
//
// `concurrently -k` plus `--strictPort` exits immediately when 5173 is already
// in use (another Vite, a leftover Cursor preview, etc.). This script reuses
// an existing server instead of failing, and only stops Vite if we started it.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const host = '127.0.0.1'
const port = 5173

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.ELECTRON_NO_ATTACH_CONSOLE

function isPortOpen() {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port }, () => {
      socket.end()
      resolve(true)
    })
    socket.setTimeout(700, () => {
      socket.destroy()
      resolve(false)
    })
    socket.on('error', () => resolve(false))
  })
}

async function waitForPort(timeoutMs = 30000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await isPortOpen()) return
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error(`Timed out waiting for Vite on ${host}:${port}`)
}

function spawnVite() {
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  return spawn(command, ['run', 'dev'], {
    cwd: root,
    env,
    stdio: 'inherit',
    windowsHide: false,
  })
}

function spawnElectron() {
  const require = createRequire(import.meta.url)
  const electronPath = require('electron')
  if (typeof electronPath !== 'string') {
    throw new Error('Electron binary path was not resolved. Run `npm run postinstall`.')
  }
  return spawn(electronPath, ['.'], {
    cwd: root,
    env,
    stdio: 'inherit',
    windowsHide: false,
  })
}

let vite = null
let electron = null
let shuttingDown = false

function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  if (vite && vite.exitCode === null) vite.kill()
  if (electron && electron.exitCode === null) electron.kill()
  process.exit(code)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

try {
  if (await isPortOpen()) {
    console.log(`[electron-dev] Reusing Vite on http://${host}:${port}/`)
  } else {
    vite = spawnVite()
    vite.on('error', (err) => {
      console.error('[electron-dev] Failed to start Vite:', err.message)
      shutdown(1)
    })
    vite.on('exit', (code) => {
      if (!shuttingDown && code) {
        console.error(`[electron-dev] Vite exited with code ${code}`)
        shutdown(code)
      }
    })
    await waitForPort()
  }

  electron = spawnElectron()
  electron.on('error', (err) => {
    console.error('[electron-dev] Failed to launch Electron:', err.message)
    shutdown(1)
  })
  electron.on('close', (code) => shutdown(code ?? 0))
} catch (err) {
  console.error('[electron-dev]', err instanceof Error ? err.message : err)
  shutdown(1)
}

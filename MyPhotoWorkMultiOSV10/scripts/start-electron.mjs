// Launches Electron with a clean environment.
//
// Cursor and some machines set ELECTRON_RUN_AS_NODE=1. That variable is
// presence-based: Electron then behaves like plain Node, so
// `require('electron')` is a path string and no window opens.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const electronPath = require('electron')

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.ELECTRON_NO_ATTACH_CONSOLE

const child = spawn(electronPath, ['.', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
  windowsHide: false,
})

child.on('close', (code) => process.exit(code ?? 0))
child.on('error', (err) => {
  console.error('[start-electron] Failed to launch Electron:', err.message)
  process.exit(1)
})

// Starts the desktop app from the project folder: `npm start [-- args]`.
//
// Some terminals (VS Code / Electron-based ones) export ELECTRON_RUN_AS_NODE=1,
// which turns electron.exe into plain Node and the app silently exits. The
// child gets a cleaned environment so `npm start` works from any shell.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const root = path.resolve(import.meta.dirname, '..')
const electron = require('electron') // resolves to the path of the binary

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(electron, [root, ...process.argv.slice(2)], { cwd: root, env, stdio: 'inherit' })
child.on('exit', (code, signal) => process.exit(signal ? 1 : code ?? 0))
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig))

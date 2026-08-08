import { existsSync } from 'node:fs'
import { platform } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const root = process.cwd()
const releaseDir = join(root, 'src-tauri', 'target', 'release')

const targets = {
  win32: {
    command: join(releaseDir, 'my_music_station.exe'),
    args: [],
    buildCommand: 'npm run build:win',
  },
  darwin: {
    command: 'open',
    args: [join(releaseDir, 'bundle', 'macos', 'My Music Station.app')],
    fallbackCommand: join(releaseDir, 'my_music_station'),
    buildCommand: 'npm run build:mac',
  },
  linux: {
    command: join(releaseDir, 'my_music_station'),
    args: [],
    buildCommand: 'npm run build:linux',
  },
}

const target = targets[platform()]

if (!target) {
  console.error(`Unsupported platform: ${platform()}`)
  process.exit(1)
}

const commandExists = target.command === 'open' ? existsSync(target.args[0]) : existsSync(target.command)
const command = commandExists ? target.command : target.fallbackCommand
const args = commandExists ? target.args : []

if (!command || !existsSync(command)) {
  console.error('Built app was not found.')
  console.error(`Run "${target.buildCommand}" once, then use "npm start" to launch without rebuilding.`)
  process.exit(1)
}

const child = spawn(command, args, {
  detached: true,
  stdio: 'ignore',
  windowsHide: false,
})

child.unref()
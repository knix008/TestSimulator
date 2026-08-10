import { existsSync, statSync } from 'node:fs'
import { platform } from 'node:os'
import { join } from 'node:path'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const root = process.cwd()
const localReleaseDir = join(root, 'src-tauri', 'target', 'release')
const processName = platform() === 'win32' ? 'my_music_station.exe' : 'my_music_station'

const isProcessRunning = () => {
  if (platform() === 'win32') {
    const result = spawnSync('tasklist', ['/FI', `IMAGENAME eq ${processName}`, '/NH'], {
      encoding: 'utf8',
      windowsHide: true,
    })
    return (result.stdout || '').toLowerCase().includes(processName.toLowerCase())
  }

  const result = spawnSync('pgrep', ['-x', processName], { encoding: 'utf8' })
  return result.status === 0
}

const stopRunningInstances = async () => {
  if (!isProcessRunning()) {
    console.log('[start] no running instance found')
    return
  }

  console.log('[start] closing running instance(s)...')

  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      if (platform() === 'win32') {
        execFileSync('taskkill', ['/F', '/IM', processName, '/T'], {
          stdio: 'ignore',
          windowsHide: true,
        })
      } else {
        execFileSync('pkill', ['-x', processName], { stdio: 'ignore' })
      }
    } catch {
      // Process may already be gone.
    }

    await sleep(250)

    if (!isProcessRunning()) {
      console.log('[start] previous instance closed')
      return
    }
  }

  if (isProcessRunning()) {
    console.error(`[start] could not close ${processName}. Quit it from the tray, then retry.`)
    process.exit(1)
  }
}

const targets = {
  win32: {
    fileName: 'my_music_station.exe',
    buildHint: 'npm run build:win',
  },
  darwin: {
    appPath: join(localReleaseDir, 'bundle', 'macos', 'My Music Station.app'),
    fileName: 'my_music_station',
    buildHint: 'npm run build:mac',
  },
  linux: {
    fileName: 'my_music_station',
    buildHint: 'npm run build:linux',
  },
}

const target = targets[platform()]

if (!target) {
  console.error(`Unsupported platform: ${platform()}`)
  process.exit(1)
}

// Always close a running app first, then launch the built binary only.
await stopRunningInstances()

let command
let args = []

if (platform() === 'darwin' && existsSync(target.appPath)) {
  command = 'open'
  args = ['-n', target.appPath]
} else {
  command = join(localReleaseDir, target.fileName)
}

if (!command || (command !== 'open' && !existsSync(command))) {
  console.error('[start] Built app was not found.')
  console.error(`[start] Create it once with: ${target.buildHint}`)
  console.error('[start] For day-to-day UI work use: npm run desktop:dev')
  process.exit(1)
}

if (command !== 'open') {
  const stats = statSync(command)
  console.log(`[start] launching ${command}`)
  console.log(`[start] modified ${stats.mtime.toISOString()} (${Math.round(stats.size / 1024)} KB)`)
} else {
  console.log(`[start] launching ${args[args.length - 1]}`)
}

const child = spawn(command, args, {
  detached: true,
  stdio: 'ignore',
  windowsHide: false,
})

child.on('error', (error) => {
  console.error(`[start] failed to launch: ${error.message}`)
  process.exit(1)
})

child.unref()
console.log('[start] launched')

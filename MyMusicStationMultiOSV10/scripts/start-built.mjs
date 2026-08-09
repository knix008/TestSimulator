import { existsSync, readFileSync, statSync } from 'node:fs'
import { platform } from 'node:os'
import { join } from 'node:path'
import { execFileSync, spawn, spawnSync } from 'node:child_process'

const root = process.cwd()
const localTargetDir = join(root, 'src-tauri', 'target')
const localReleaseDir = join(localTargetDir, 'release')
const manifestPath = join(localReleaseDir, 'build-manifest.json')

const stopRunningInstances = () => {
  if (platform() !== 'win32') {
    return
  }

  try {
    execFileSync('taskkill', ['/F', '/IM', 'my_music_station.exe', '/T'], {
      stdio: 'ignore',
    })
    console.log('[start] stopped running my_music_station.exe instance(s)')
  } catch {
    // No running instance is fine.
  }
}

const sourceHintPaths = [
  join(root, 'src-tauri', 'tauri.conf.json'),
  join(root, 'src-tauri', 'src', 'lib.rs'),
  join(root, 'src-tauri', 'src', 'main.rs'),
  join(root, 'src', 'App.css'),
  join(root, 'src', 'App.tsx'),
  join(root, 'src', 'index.css'),
]

const newestSourceMtime = () =>
  Math.max(
    0,
    ...sourceHintPaths.map((path) => (existsSync(path) ? statSync(path).mtimeMs : 0)),
  )

const defaultBundles = {
  win32: 'nsis,msi',
  darwin: 'app,dmg',
  linux: 'appimage,deb,rpm',
}

const rebuildDesktop = () => {
  const bundles = defaultBundles[platform()]

  if (!bundles) {
    console.error(`[start] Unsupported platform: ${platform()}`)
    process.exit(1)
  }

  console.log('[start] rebuilding desktop release + installers (same artifact for npm start and install)...')
  stopRunningInstances()

  const result = spawnSync(process.execPath, [join(root, 'scripts', 'build-desktop.mjs'), bundles], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      CARGO_TARGET_DIR: localTargetDir,
    },
  })

  if (result.status !== 0) {
    console.error('[start] rebuild failed. Quit the tray app fully, then retry.')
    process.exit(result.status ?? 1)
  }
}

const targets = {
  win32: {
    fileName: 'my_music_station.exe',
    installerHint: 'My Music Station_0.1.0_x64-setup.exe',
    installedPaths: [
      join(process.env['ProgramFiles'] || 'C:\\Program Files', 'My Music Station', 'my_music_station.exe'),
      join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'My Music Station', 'my_music_station.exe'),
      join(process.env.LOCALAPPDATA || '', 'My Music Station', 'my_music_station.exe'),
    ],
  },
  darwin: {
    appPath: join(localReleaseDir, 'bundle', 'macos', 'My Music Station.app'),
    fileName: 'my_music_station',
  },
  linux: {
    fileName: 'my_music_station',
  },
}

const target = targets[platform()]

if (!target) {
  console.error(`Unsupported platform: ${platform()}`)
  process.exit(1)
}

// Always stop tray-hidden instances first so rebuilds can overwrite the EXE.
stopRunningInstances()

let command
let args = []

if (platform() === 'darwin' && existsSync(target.appPath)) {
  const appStats = statSync(target.appPath)

  if (newestSourceMtime() > appStats.mtimeMs + 1000) {
    rebuildDesktop()
  }

  command = 'open'
  args = [target.appPath]
} else {
  const binaryPath = join(localReleaseDir, target.fileName)

  if (!existsSync(binaryPath)) {
    console.log('[start] no release binary found; building once...')
    rebuildDesktop()
  } else {
    const stats = statSync(binaryPath)

    if (newestSourceMtime() > stats.mtimeMs + 1000) {
      rebuildDesktop()
    }
  }

  command = join(localReleaseDir, target.fileName)
}

if (!command || (command !== 'open' && !existsSync(command))) {
  console.error('Built app was not found.')
  console.error('Run the OS build once (npm run build:win / build:mac / build:linux), then npm start.')
  process.exit(1)
}

if (command !== 'open') {
  const stats = statSync(command)
  console.log(`[start] launching ${command}`)
  console.log(`[start] modified ${stats.mtime.toISOString()} (${Math.round(stats.size / 1024)} KB)`)

  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      console.log(`[start] build manifest ${manifest.builtAt} (bundles: ${manifest.bundles})`)
    } catch {
      // ignore invalid manifest
    }
  }

  if (target.installerHint && existsSync(join(root, target.installerHint))) {
    const installerStats = statSync(join(root, target.installerHint))
    const ageDiffMs = Math.abs(installerStats.mtimeMs - stats.mtimeMs)
    if (ageDiffMs < 15 * 60 * 1000) {
      console.log(`[start] installer in sync: ./${target.installerHint}`)
    } else {
      console.warn(`[start] root installer timestamp differs from EXE; run npm run build:win to refresh both.`)
    }
  }

  if (Array.isArray(target.installedPaths)) {
    for (const installedPath of target.installedPaths.filter(Boolean)) {
      if (!existsSync(installedPath)) {
        continue
      }

      const installedStats = statSync(installedPath)
      const sizeDiff = Math.abs(installedStats.size - stats.size)
      const timeDiffMin = Math.abs(installedStats.mtimeMs - stats.mtimeMs) / 60000

      if (sizeDiff > 1024 || timeDiffMin > 2) {
        console.warn(`[start] installed app is older/different: ${installedPath}`)
        console.warn('[start] Reinstall from the project-root setup.exe to apply the same build.')
      } else {
        console.log(`[start] installed app matches release binary: ${installedPath}`)
      }
    }
  }

  if (newestSourceMtime() > stats.mtimeMs + 1000) {
    console.error('[start] ERROR: release binary is still older than sources after rebuild.')
    console.error('[start] Quit My Music Station from the tray menu, then run npm start again.')
    process.exit(1)
  }

  stopRunningInstances()
} else {
  console.log(`[start] launching ${args[0]}`)
}

const child = spawn(command, args, {
  detached: true,
  stdio: 'ignore',
  windowsHide: false,
})

child.unref()

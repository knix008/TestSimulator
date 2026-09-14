import { existsSync, readdirSync, statSync } from 'node:fs'
import { platform } from 'node:os'
import { basename, join } from 'node:path'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const root = process.cwd()
const localReleaseDir = join(root, 'src-tauri', 'target', 'release')
const processName = platform() === 'win32' ? 'my_music_station.exe' : 'my_music_station'

// `--no-build` (or SKIP_BUILD=1) launches the existing binary as-is.
const skipBuild = process.argv.includes('--no-build') || process.env.SKIP_BUILD === '1'

// Directories we never scan when deciding whether a rebuild is needed.
const IGNORED_DIRS = new Set(['node_modules', 'target', 'dist', '.git', '.vs'])

// Latest modification time (ms) found under a file or directory tree.
const latestMtimeMs = (path) => {
  let st
  try {
    st = statSync(path)
  } catch {
    return 0
  }
  if (!st.isDirectory()) return st.mtimeMs
  if (IGNORED_DIRS.has(basename(path))) return 0

  let latest = 0
  for (const entry of readdirSync(path)) {
    const child = latestMtimeMs(join(path, entry))
    if (child > latest) latest = child
  }
  return latest
}

// Source inputs that get compiled into the release binary. If any is newer than
// the built binary, `npm start` rebuilds before launching.
const sourceRoots = [
  join(root, 'src'),
  join(root, 'index.html'),
  join(root, 'package.json'),
  join(root, 'vite.config.ts'),
  join(root, 'tsconfig.json'),
  join(root, 'src-tauri', 'src'),
  join(root, 'src-tauri', 'Cargo.toml'),
  join(root, 'src-tauri', 'tauri.conf.json'),
  join(root, 'src-tauri', 'capabilities'),
  join(root, 'src-tauri', 'windows'),
]

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

// `npm start` only needs the release executable, so it compiles with
// `build:bin` (tauri build --no-bundle) and never produces an installer.
const targets = {
  win32: {
    fileName: 'my_music_station.exe',
    buildScript: 'build:bin',
    buildHint: 'npm run build:bin',
  },
  darwin: {
    appPath: join(localReleaseDir, 'bundle', 'macos', 'My Music Station.app'),
    fileName: 'my_music_station',
    buildScript: 'build:bin',
    buildHint: 'npm run build:bin',
  },
  linux: {
    fileName: 'my_music_station',
    buildScript: 'build:bin',
    buildHint: 'npm run build:bin',
  },
}

const target = targets[platform()]

if (!target) {
  console.error(`Unsupported platform: ${platform()}`)
  process.exit(1)
}

// Rebuild the binary when the sources have changed (or it was never built), so
// `npm start` always launches the current code without a manual build step.
const rebuildIfStale = () => {
  const binaryPath = join(localReleaseDir, target.fileName)

  let binaryMtime = 0
  try {
    binaryMtime = statSync(binaryPath).mtimeMs
  } catch {
    // Binary does not exist yet.
  }

  const sourceMtime = sourceRoots.reduce((latest, path) => Math.max(latest, latestMtimeMs(path)), 0)

  if (binaryMtime > 0 && binaryMtime >= sourceMtime) {
    console.log('[start] build is up to date — skipping rebuild')
    return
  }

  if (skipBuild) {
    console.log('[start] sources changed but --no-build was set — launching stale binary')
    return
  }

  console.log(
    binaryMtime === 0
      ? '[start] no build found — building...'
      : '[start] sources changed since last build — rebuilding...',
  )

  // Run through a shell so Windows can resolve npm.cmd (Node refuses to spawn
  // .cmd/.bat without a shell since the CVE-2024-27980 fix). Pass the whole
  // command as a single string with NO args array: Node's DEP0190 warning only
  // fires when an args array is combined with `shell: true`. buildScript is a
  // fixed internal token (build:bin), so there is nothing to escape.
  const result = spawnSync(`npm run ${target.buildScript}`, {
    stdio: 'inherit',
    shell: true,
    cwd: root,
  })

  if (result.status !== 0) {
    console.error(`[start] build failed (exit ${result.status ?? 'unknown'}).`)
    console.error(`[start] Build manually with: ${target.buildHint}`)
    process.exit(result.status ?? 1)
  }
}

rebuildIfStale()

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

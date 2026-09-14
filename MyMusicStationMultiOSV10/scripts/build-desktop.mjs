import { copyFileSync, existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs'
import { platform } from 'node:os'
import { join } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'

const root = process.cwd()
const localTargetDir = join(root, 'src-tauri', 'target')
const releaseDir = join(localTargetDir, 'release')
const manifestPath = join(releaseDir, 'build-manifest.json')

const stopRunningInstances = () => {
  if (platform() !== 'win32') {
    return
  }

  try {
    execFileSync('taskkill', ['/F', '/IM', 'my_music_station.exe', '/T'], {
      stdio: 'ignore',
    })
    console.log('[build] stopped running my_music_station.exe instance(s)')
  } catch {
    // No running instance is fine.
  }
}

// One final distributor image per platform (copied to project root).
const defaultBundles = {
  win32: 'nsis',
  darwin: 'dmg',
  linux: 'appimage',
}

const bundlesArg = process.argv[2] || defaultBundles[platform()]

// `none` compiles the release binary only (no installer / bundle); used by `npm start`.
const binaryOnly = bundlesArg === 'none'

if (!bundlesArg) {
  console.error(`[build] Unsupported platform: ${platform()}`)
  process.exit(1)
}

mkdirSync(releaseDir, { recursive: true })
stopRunningInstances()

const fetchFfmpeg = spawnSync(process.execPath, [join(root, 'scripts', 'fetch-ffmpeg.mjs')], {
  cwd: root,
  stdio: 'inherit',
})

if (fetchFfmpeg.status !== 0) {
  console.warn('[build] fetch-ffmpeg failed; convert may rely on PATH ffmpeg only.')
}

const fetchYtdlp = spawnSync(process.execPath, [join(root, 'scripts', 'fetch-ytdlp.mjs')], {
  cwd: root,
  stdio: 'inherit',
})

if (fetchYtdlp.status !== 0) {
  console.warn('[build] fetch-ytdlp failed; URL extract may rely on PATH yt-dlp only.')
}

const buildFlags = binaryOnly ? '--no-bundle' : `--bundles ${bundlesArg}`

console.log(`[build] CARGO_TARGET_DIR=${localTargetDir}`)
console.log(`[build] tauri build ${buildFlags}`)

// Run through a shell so Windows can resolve npx.cmd (Node refuses to spawn
// .cmd/.bat without a shell since the CVE-2024-27980 fix). Pass the whole
// command as a single string with NO args array: Node's DEP0190 warning only
// fires when an args array is combined with `shell: true`. bundlesArg is a
// fixed internal token (nsis/dmg/appimage/none), so there is nothing to escape.
const result = spawnSync(`npx tauri build ${buildFlags}`, {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    CARGO_TARGET_DIR: localTargetDir,
  },
})

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

const bundledFfmpeg = join(
  root,
  'src-tauri',
  'ffmpeg',
  platform() === 'win32' ? 'ffmpeg.exe' : 'ffmpeg',
)
const releaseFfmpeg = join(releaseDir, platform() === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')

if (existsSync(bundledFfmpeg)) {
  try {
    copyFileSync(bundledFfmpeg, releaseFfmpeg)
    console.log(`[build] copied ffmpeg beside release binary → ${releaseFfmpeg}`)
  } catch (error) {
    console.warn(`[build] could not copy ffmpeg beside release binary: ${error}`)
  }
}

const bundledYtdlp = join(
  root,
  'src-tauri',
  'yt-dlp',
  platform() === 'win32' ? 'yt-dlp.exe' : 'yt-dlp',
)
const releaseYtdlp = join(releaseDir, platform() === 'win32' ? 'yt-dlp.exe' : 'yt-dlp')

if (existsSync(bundledYtdlp)) {
  try {
    copyFileSync(bundledYtdlp, releaseYtdlp)
    console.log(`[build] copied yt-dlp beside release binary → ${releaseYtdlp}`)
  } catch (error) {
    console.warn(`[build] could not copy yt-dlp beside release binary: ${error}`)
  }
}

if (!binaryOnly) {
  const copyResult = spawnSync(process.execPath, [join(root, 'scripts', 'copy-installers.mjs')], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      CARGO_TARGET_DIR: localTargetDir,
    },
  })

  if (copyResult.status !== 0) {
    process.exit(copyResult.status ?? 1)
  }
}

const binaryName = platform() === 'win32' ? 'my_music_station.exe' : 'my_music_station'
const binaryPath = join(releaseDir, binaryName)

const manifest = {
  builtAt: new Date().toISOString(),
  platform: platform(),
  bundles: bundlesArg,
  cargoTargetDir: localTargetDir,
  binaryPath: existsSync(binaryPath) ? binaryPath : null,
  binaryModified: existsSync(binaryPath) ? statSync(binaryPath).mtime.toISOString() : null,
  binarySize: existsSync(binaryPath) ? statSync(binaryPath).size : null,
}

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`[build] manifest → ${manifestPath}`)
console.log(
  binaryOnly
    ? '[build] release binary compiled (no installer). Create a setup package with: npm run desktop:build'
    : '[build] npm start and the single root installer now share this same release binary.',
)

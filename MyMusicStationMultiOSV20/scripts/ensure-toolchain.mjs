// Makes sure everything a desktop build needs is present, downloading what is
// missing. The project is shared without node_modules / src-tauri/target /
// the Rust toolchain (far too large to archive), so a fresh checkout must be
// able to bootstrap itself:
//
//   1. node_modules (incl. @tauri-apps/cli)  → npm install
//   2. Rust toolchain (cargo / rustc)        → rustup-init (user-level, no admin)
//   3. Windows: MSVC Build Tools (link.exe)  → winget (needs UAC) or manual hint
//   4. ffmpeg / yt-dlp                       → fetch-ffmpeg.mjs / fetch-ytdlp.mjs
//
// SKIP_TOOLCHAIN_INSTALL=1 only reports what is missing without installing.
import { existsSync, mkdtempSync, rmSync, createWriteStream } from 'node:fs'
import { homedir, platform, tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

const root = process.cwd()
const isWindows = platform() === 'win32'
const reportOnly = process.env.SKIP_TOOLCHAIN_INSTALL === '1'
const log = (message) => console.log(`[toolchain] ${message}`)
const warn = (message) => console.warn(`[toolchain] ${message}`)

const cargoBin = join(homedir(), '.cargo', 'bin')

// cargo lives in ~/.cargo/bin; after a fresh rustup install it is not on the
// PATH of this process yet, so add it for us and for the child build.
const ensureCargoOnPath = () => {
  const entries = (process.env.PATH || '').split(delimiter)
  if (!entries.some((entry) => entry.toLowerCase() === cargoBin.toLowerCase())) {
    process.env.PATH = `${cargoBin}${delimiter}${process.env.PATH || ''}`
  }
}

const commandWorks = (command, args = ['--version']) => {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true })
  return result.status === 0 ? (result.stdout || '').trim().split(/\r?\n/)[0] : null
}

// Run through a shell so Windows can resolve npm.cmd (Node refuses to spawn
// .cmd/.bat without a shell since the CVE-2024-27980 fix). No args array, so
// Node's DEP0190 warning does not fire.
const runShell = (command, options = {}) =>
  spawnSync(command, { stdio: 'inherit', shell: true, cwd: root, windowsHide: true, ...options })

const download = async (url, destination) => {
  log(`downloading ${url}`)
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status}`)
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination))
}

let failed = false

// 1. npm dependencies -------------------------------------------------------
const tauriCli = join(root, 'node_modules', '@tauri-apps', 'cli', 'package.json')
if (existsSync(tauriCli)) {
  log('node_modules present (tauri cli found)')
} else if (reportOnly) {
  warn('node_modules missing — run: npm install')
  failed = true
} else {
  log('node_modules missing — running npm install...')
  const result = runShell('npm install')
  if (result.status !== 0 || !existsSync(tauriCli)) {
    warn('npm install failed; cannot continue.')
    process.exit(result.status || 1)
  }
}

// 2. Rust toolchain ---------------------------------------------------------
ensureCargoOnPath()
let cargoVersion = commandWorks('cargo')

if (cargoVersion) {
  log(`cargo present: ${cargoVersion}`)
} else if (reportOnly) {
  warn('Rust toolchain missing — install from https://rustup.rs')
  failed = true
} else {
  log('Rust toolchain missing — installing via rustup (stable, user-level)...')
  const workDir = mkdtempSync(join(tmpdir(), 'mms-rustup-'))

  try {
    if (isWindows) {
      const installer = join(workDir, 'rustup-init.exe')
      await download('https://win.rustup.rs/x86_64', installer)
      // MSVC is the toolchain Tauri expects on Windows.
      execFileSync(installer, ['-y', '--default-toolchain', 'stable', '--profile', 'minimal'], { stdio: 'inherit' })
    } else {
      const script = join(workDir, 'rustup-init.sh')
      await download('https://sh.rustup.rs', script)
      execFileSync('sh', [script, '-y', '--default-toolchain', 'stable', '--profile', 'minimal'], { stdio: 'inherit' })
    }
  } catch (error) {
    warn(`rustup install failed: ${error instanceof Error ? error.message : error}`)
    warn('Install Rust manually from https://rustup.rs and re-run the build.')
    process.exit(1)
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }

  ensureCargoOnPath()
  cargoVersion = commandWorks('cargo')
  if (!cargoVersion) {
    warn('cargo still not found after rustup install. Open a new terminal and re-run the build.')
    process.exit(1)
  }
  log(`cargo installed: ${cargoVersion}`)
}

// 3. Windows: MSVC linker ---------------------------------------------------
if (isWindows) {
  const vswhere = join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft Visual Studio', 'Installer', 'vswhere.exe')
  let hasMsvc = false

  if (existsSync(vswhere)) {
    const result = spawnSync(
      vswhere,
      ['-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath', '-latest'],
      { encoding: 'utf8', windowsHide: true },
    )
    hasMsvc = result.status === 0 && Boolean((result.stdout || '').trim())
  }

  if (hasMsvc) {
    log('MSVC build tools present')
  } else {
    const winget = commandWorks('winget')
    const hint =
      'Install "Visual Studio Build Tools" with the "Desktop development with C++" workload: ' +
      'https://visualstudio.microsoft.com/visual-cpp-build-tools/'

    if (reportOnly || !winget) {
      warn(`MSVC build tools (link.exe) not found. ${hint}`)
      failed = true
    } else {
      log('MSVC build tools not found — installing via winget (this is large and asks for admin approval)...')
      const result = runShell(
        'winget install --id Microsoft.VisualStudio.2022.BuildTools --exact --accept-package-agreements --accept-source-agreements ' +
          '--override "--wait --passive --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"',
      )
      if (result.status !== 0) {
        warn(`winget install did not complete (exit ${result.status}). ${hint}`)
        failed = true
      } else {
        log('MSVC build tools installed. If the Rust link step still fails, open a new terminal and retry.')
      }
    }
  }
}

// 4. Bundled helper binaries -----------------------------------------------
for (const script of ['fetch-ffmpeg.mjs', 'fetch-ytdlp.mjs']) {
  const result = spawnSync(process.execPath, [join(root, 'scripts', script)], { cwd: root, stdio: 'inherit' })
  if (result.status !== 0) {
    warn(`${script} exited with ${result.status}; the build continues without that binary bundled.`)
  }
}

if (failed) {
  warn('Some build prerequisites are missing (see above).')
  process.exit(1)
}

log('all build prerequisites present')

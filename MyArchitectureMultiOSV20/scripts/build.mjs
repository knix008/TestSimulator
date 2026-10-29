// npm run build:win | build:mac | build:linux | build:all   — installers
// npm run build:debug                                       — test build (no installer)
//
// `tauri build` stamps src/buildinfo.js, copies the page to dist/web
// (tauri.conf.json beforeBuildCommand) and embeds it in the program, then
// bundles the installers for this operating system:
//   Windows  NSIS setup.exe            (src-tauri/windows/hooks.nsh)
//   macOS    MyArchitecture.app + .dmg
//   Linux    AppImage + .deb
// Tauri builds installers only for the system it runs on; build:all builds
// everything this system can. The installers are copied to the project root.
//
// build:debug makes src-tauri/target/debug/MyArchitecture.exe with the page
// embedded, which the GUI smoke tests (npm run smoke) drive.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const target = process.argv[2] || 'win'
const BUNDLES = { win: ['nsis'], mac: ['app', 'dmg'], linux: ['appimage', 'deb'] }
const HOST = { win: 'win32', mac: 'darwin', linux: 'linux' }
const cli = path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js')

const run = (args) => {
  const r = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', env: process.env })
  if (r.status !== 0) process.exit(r.status || 1)
}

if (target === 'debug') {
  run([cli, 'build', '--debug', '--no-bundle'])
  // `npm start` (tauri dev) writes the same exe, but one that loads the dev
  // server; the stamp tells the smoke tests which kind is there.
  // CARGO_TARGET_DIR (the GUI tests' own build, beside a running `npm start`) moves it.
  const targetDir = process.env.CARGO_TARGET_DIR ? path.resolve(root, process.env.CARGO_TARGET_DIR) : path.join(root, 'src-tauri', 'target')
  fs.writeFileSync(path.join(targetDir, 'debug', 'embedded.stamp'), new Date().toISOString())
  process.exit(0)
}

const wanted = target === 'all' ? Object.keys(BUNDLES).filter((k) => HOST[k] === process.platform) : [target]
if (!BUNDLES[wanted[0]]) {
  console.error(`Unknown target "${target}" (win | mac | linux | all | debug)`)
  process.exit(2)
}
for (const t of wanted) {
  if (HOST[t] !== process.platform) {
    console.error(`Tauri builds ${t} installers only on ${HOST[t]} (this is ${process.platform}). Build on that system or in CI.`)
    process.exit(2)
  }
}
for (const t of wanted) run([cli, 'build', '--bundles', BUNDLES[t].join(',')])

// Installers of an earlier version would otherwise sit next to the new ones.
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const INSTALLER = /^MyArchitecture[_-].*\.(exe|dmg|AppImage|deb)$/
for (const name of fs.readdirSync(root)) {
  if (INSTALLER.test(name) && !name.includes(version)) fs.rmSync(path.join(root, name), { force: true })
}
const out = path.join(root, 'src-tauri', 'target', 'release', 'bundle')
const copied = []
for (const dir of ['nsis', 'dmg', 'appimage', 'deb']) {
  const d = path.join(out, dir)
  if (!fs.existsSync(d)) continue
  for (const f of fs.readdirSync(d)) {
    if (!/\.(exe|dmg|AppImage|deb)$/.test(f)) continue
    fs.copyFileSync(path.join(d, f), path.join(root, f))
    copied.push(f)
  }
}
console.log(copied.length ? `Installers copied to the project root:\n  ${copied.join('\n  ')}` : 'No installer was produced.')

// npm run build:win | build:mac | build:linux | build:all   — installers
// npm run build:debug                                       — test build (no installer)
//
// `tauri build` runs `npm run build` + scripts/build-host.mjs --release first
// (tauri.conf.json), embeds dist/ in the program and bundles:
//   Windows  NSIS setup.exe            (src-tauri/windows/hooks.nsh)
//   macOS    MyISOMaker.app + .dmg
//   Linux    AppImage + .deb
// Tauri builds installers only for the system it runs on. The installers are
// copied to the project root.
//
// build:debug makes src-tauri/target/debug/MyISOMaker(.exe) with the pages
// embedded; it runs the host from dist-sidecar/ with the Node on PATH.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = process.argv[2] || 'win'
const BUNDLES = { win: ['nsis'], mac: ['app', 'dmg'], linux: ['appimage', 'deb'] }
const HOST = { win: 'win32', mac: 'darwin', linux: 'linux' }
const cli = path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js')

function run(args) {
  const env = { ...process.env }
  // Inherited from an Electron-based editor terminal it would turn Electron tools into Node.
  delete env.ELECTRON_RUN_AS_NODE
  const r = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', env })
  if (r.status !== 0) process.exit(r.status || 1)
}

if (target === 'debug') {
  // The debug program runs dist-sidecar/host.mjs with the Node on PATH.
  run([path.join(root, 'scripts', 'build-host.mjs')])
  run([cli, "build", "--debug", "--no-bundle", "--features", "tauri/custom-protocol"])
  process.exit(0)
}

const wanted = target === 'all' ? Object.keys(BUNDLES).filter((k) => HOST[k] === process.platform) : [target]
if (!BUNDLES[wanted[0]]) {
  console.error(`Unknown target "${target}" (win | mac | linux | all | debug)`)
  process.exit(2)
}
for (const t of wanted) {
  if (HOST[t] !== process.platform) {
    console.error(`Tauri builds ${t} installers only on ${HOST[t]} (this is ${process.platform}).`)
    process.exit(2)
  }
}
for (const t of wanted) run([cli, 'build', '--bundles', BUNDLES[t].join(',')])

const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const INSTALLER = /^MyISOMaker[_-].*\.(exe|dmg|AppImage|deb)$/
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

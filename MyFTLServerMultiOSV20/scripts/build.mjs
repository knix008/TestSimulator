// npm run build:win | build:mac | build:linux | build:all   — installers
// npm run build:debug                                       — test build (no installer)
//
// `tauri build` runs scripts/prepare-tauri.mjs --release (icons, build info,
// the Node host + runtime → src-tauri/sidecar) and vite build (dist/), embeds
// the page in the program and bundles the installers for this system:
//   Windows  NSIS setup.exe            (src-tauri/windows/hooks.nsh)
//   macOS    My FTP Server.app + .dmg
//   Linux    AppImage + .deb
// Tauri builds installers only for the system it runs on; build:all builds
// everything this system can. The installers are copied to the project root.
//
// build:debug makes src-tauri/target/test/debug/MyFTPServer(.exe) with the page
// embedded (its own target folder: npm start keeps target/debug busy);
// it runs the Node host from host/host.js (npm run smoke drives it).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2] || 'win';
const BUNDLES = { win: ['nsis'], mac: ['app', 'dmg'], linux: ['appimage', 'deb'] };
const HOST = { win: 'win32', mac: 'darwin', linux: 'linux' };
const cli = path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');

function run(args, extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  delete env.ELECTRON_RUN_AS_NODE;
  const r = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', env });
  if (r.status !== 0) process.exit(r.status || 1);
}

if (target === 'debug') {
  // Its own target folder: `npm start` (tauri dev) builds target/debug without
  // the embedded page and keeps that program locked while it runs.
  const targetDir = path.join(root, 'src-tauri', 'target', 'test');
  run([cli, 'build', '--debug', '--no-bundle'], { CARGO_TARGET_DIR: targetDir });
  const exe = process.platform === 'win32' ? 'MyFTPServer.exe' : 'MyFTPServer';
  console.log(`Test build: ${path.relative(root, path.join(targetDir, 'debug', exe))}`);
  process.exit(0);
}

const wanted = target === 'all' ? Object.keys(BUNDLES).filter((k) => HOST[k] === process.platform) : [target];
if (!BUNDLES[wanted[0]]) {
  console.error(`Unknown target "${target}" (win | mac | linux | all | debug)`);
  process.exit(2);
}
for (const t of wanted) {
  if (HOST[t] !== process.platform) {
    console.error(`Tauri builds ${t} installers only on ${HOST[t]} (this is ${process.platform}). Build on that system or in CI.`);
    process.exit(2);
  }
}
for (const t of wanted) run([cli, 'build', '--bundles', BUNDLES[t].join(',')]);

// Installers of an earlier version would otherwise sit next to the new ones.
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const INSTALLER = /^(My FTP Server|my-ftp-server|MyFTPServer)[_-].*\.(exe|dmg|AppImage|deb)$/;
for (const name of fs.readdirSync(root)) {
  if (INSTALLER.test(name) && !name.includes(version)) fs.rmSync(path.join(root, name), { force: true });
}
const out = path.join(process.env.CARGO_TARGET_DIR ? path.resolve(process.env.CARGO_TARGET_DIR) : path.join(root, 'src-tauri', 'target'), 'release', 'bundle');
const copied = [];
for (const dir of ['nsis', 'dmg', 'appimage', 'deb']) {
  const d = path.join(out, dir);
  if (!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d)) {
    if (!/\.(exe|dmg|AppImage|deb)$/.test(f)) continue;
    fs.copyFileSync(path.join(d, f), path.join(root, f));
    copied.push(f);
  }
}
console.log(copied.length ? `Installers copied to the project root:\n  ${copied.join('\n  ')}` : 'No installer was produced.');

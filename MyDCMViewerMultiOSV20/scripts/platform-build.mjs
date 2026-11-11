// npm run build:win | build:mac | build:linux | build:all
//
// Icons (if missing) → bundled samples → `tauri build` for the platform's installers
// (Windows: NSIS setup.exe · macOS: .app + .dmg · Linux: AppImage + .deb). The page itself
// is staged by tauri.conf.json's beforeBuildCommand (scripts/build-web.js --app).
// The installers are copied to the project root.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2] || 'win';
const BUNDLES = { win: ['nsis'], mac: ['app', 'dmg'], linux: ['appimage', 'deb'] };
const HOST = { win: 'win32', mac: 'darwin', linux: 'linux' };
const wanted = target === 'all' ? Object.keys(BUNDLES).filter((k) => HOST[k] === process.platform) : [target];
if (!BUNDLES[wanted[0]]) { console.error(`Unknown target "${target}" (win | mac | linux | all)`); process.exit(2); }
for (const t of wanted) {
  if (HOST[t] !== process.platform) {
    console.error(`Tauri builds ${t} installers only on ${HOST[t]} (this is ${process.platform}). Build on that OS or in CI.`);
    process.exit(2);
  }
}
const run = (args) => {
  const r = spawnSync(process.execPath, args, { stdio: 'inherit', cwd: ROOT, env: process.env });
  if (r.status !== 0) process.exit(r.status || 1);
};
if (!fs.existsSync(path.join(ROOT, 'src-tauri', 'icons', 'icon.ico'))) run([path.join(ROOT, 'scripts', 'create-icons.js')]);
run([path.join(ROOT, 'scripts', 'stage-samples.mjs')]);
const cli = path.join(ROOT, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
for (const t of wanted) run([cli, 'build', '--bundles', BUNDLES[t].join(',')]);

const out = path.join(ROOT, 'src-tauri', 'target', 'release', 'bundle');
const copied = [];
for (const dir of ['nsis', 'dmg', 'appimage', 'deb']) {
  const d = path.join(out, dir);
  if (!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d)) {
    if (!/\.(exe|dmg|AppImage|deb)$/.test(f)) continue;
    fs.copyFileSync(path.join(d, f), path.join(ROOT, f));
    copied.push(f);
  }
}
console.log(copied.length ? `Installers copied to the project root:\n  ${copied.join('\n  ')}` : 'No installer was produced.');

// npm run build:win | build:mac | build:linux | build:all   installers, copied to the project root
// npm run build:debug                                       test build, no installer
//
// Tauri builds installers only for the system it runs on; build:all builds what this system can.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const target = process.argv[2] || 'win';
const BUNDLES = { win: ['nsis'], mac: ['app', 'dmg'], linux: ['appimage', 'deb'] };
const PLATFORM = { win: 'win32', mac: 'darwin', linux: 'linux' };
const CLI = path.join(ROOT, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
const INSTALLER = /^MyKanban[_-].*\.(exe|dmg|AppImage|deb)$/;

function tauri(args) {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd: ROOT, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}

if (target === 'debug') {
  tauri(['build', '--debug', '--no-bundle']);
  process.exit(0);
}

const targets = target === 'all' ? Object.keys(BUNDLES).filter((t) => PLATFORM[t] === process.platform) : [target];
for (const t of targets) {
  if (!BUNDLES[t]) {
    console.error(`Unknown target "${t}" (win | mac | linux | all | debug)`);
    process.exit(2);
  }
  if (PLATFORM[t] !== process.platform) {
    console.error(`Tauri builds ${t} installers only on ${PLATFORM[t]} (this is ${process.platform}).`);
    process.exit(2);
  }
}
for (const t of targets) tauri(['build', '--bundles', BUNDLES[t].join(',')]);

// Installers of an earlier version would otherwise sit next to the new one.
const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
for (const name of fs.readdirSync(ROOT)) {
  if (INSTALLER.test(name) && !name.includes(version)) fs.rmSync(path.join(ROOT, name), { force: true });
}
const bundleDir = path.join(ROOT, 'src-tauri', 'target', 'release', 'bundle');
const copied = [];
for (const kind of ['nsis', 'dmg', 'appimage', 'deb']) {
  const dir = path.join(bundleDir, kind);
  if (!fs.existsSync(dir)) continue;
  for (const name of fs.readdirSync(dir)) {
    if (!INSTALLER.test(name) || !name.includes(version)) continue;
    fs.copyFileSync(path.join(dir, name), path.join(ROOT, name));
    copied.push(name);
  }
}
console.log(copied.length ? `Installers copied to the project root:\n  ${copied.join('\n  ')}` : 'No installer was produced.');

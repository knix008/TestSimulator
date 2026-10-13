// Builds MyCAD installers with the Tauri bundler, then collects them in
// release/ under the same names the other My* apps use, and copies them to the
// project root where they are easy to find.
//
//   node scripts/build.mjs win     → MyCAD-Setup-<version>.exe (NSIS)
//   node scripts/build.mjs mac     → MyCAD-<version>-<arch>.dmg
//   node scripts/build.mjs linux   → MyCAD-<version>-<arch>.deb / .rpm / .AppImage
//   node scripts/build.mjs all     → everything this OS can build
//
// Tauri builds natively only: Windows installers on Windows, macOS on macOS,
// Linux on Linux. Asking for another OS stops with an explanation.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const name = 'MyCAD';
const host = { win32: 'win', darwin: 'mac', linux: 'linux' }[process.platform];

const targets = {
  win: { bundles: ['nsis'] },
  mac: { bundles: ['app', 'dmg'] },
  linux: { bundles: ['deb', 'rpm', 'appimage'] },
};

const requested = process.argv[2] === 'all' || !process.argv[2] ? host : process.argv[2];
if (!targets[requested]) {
  console.error(`알 수 없는 대상: ${process.argv[2]} (win | mac | linux | all)`);
  process.exit(1);
}
if (requested !== host) {
  console.error(`${requested} 설치 파일은 ${requested === 'win' ? 'Windows' : requested === 'mac' ? 'macOS' : 'Linux'} 에서 만들어야 합니다 (Tauri는 교차 빌드를 지원하지 않습니다).`);
  process.exit(1);
}

// A copy started from this folder keeps target/release/MyCAD.exe locked on
// Windows. Only those are stopped; an installed MyCAD keeps running.
if (process.platform === 'win32') {
  const script = `Get-Process -Name '${name}' -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith('${root.replace(/'/g, "''")}', 'OrdinalIgnoreCase') } | Stop-Process -Force`;
  spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: 'ignore' });
}

const bundles = targets[requested].bundles;
console.log(`> tauri build --bundles ${bundles.join(',')}`);
const result = spawnSync(process.execPath, [path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'), 'build', '--bundles', bundles.join(',')], {
  cwd: root,
  stdio: 'inherit',
});
if (result.status !== 0) process.exit(result.status ?? 1);

const bundleDir = path.join(root, 'src-tauri', 'target', 'release', 'bundle');
const release = path.join(root, 'release');
fs.mkdirSync(release, { recursive: true });

const arch = (file) => (/(aarch64|arm64)/i.test(file) ? 'arm64' : /(x86_64|amd64|x64)/i.test(file) ? 'x64' : process.arch);
const rename = [
  [/\.exe$/i, (file) => `${name}-Setup-${version}.exe`],
  [/\.msi$/i, (file) => `${name}-${version}-${arch(file)}.msi`],
  [/\.dmg$/i, (file) => `${name}-${version}-${arch(file)}.dmg`],
  [/\.deb$/i, (file) => `${name}-${version}-${arch(file)}.deb`],
  [/\.rpm$/i, (file) => `${name}-${version}-${arch(file)}.rpm`],
  [/\.AppImage$/, (file) => `${name}-${version}-${arch(file)}.AppImage`],
];

const collected = [];
for (const kind of fs.existsSync(bundleDir) ? fs.readdirSync(bundleDir) : []) {
  const directory = path.join(bundleDir, kind);
  if (!fs.statSync(directory).isDirectory()) continue;
  for (const file of fs.readdirSync(directory)) {
    const rule = rename.find(([pattern]) => pattern.test(file));
    if (!rule || !file.includes(version)) continue;
    const target = rule[1](file);
    fs.copyFileSync(path.join(directory, file), path.join(release, target));
    fs.copyFileSync(path.join(directory, file), path.join(root, target));
    collected.push(target);
  }
}

if (!collected.length) {
  console.error('설치 파일을 찾지 못했습니다. 위 Tauri 빌드 로그를 확인하세요.');
  process.exit(1);
}
console.log(`\n설치 파일 (release/ 와 프로젝트 루트):\n${collected.map((file) => `  ${file}`).join('\n')}`);

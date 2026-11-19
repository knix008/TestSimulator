// Builds the MyWorkForce installers with the Tauri bundler, collects them in release/ and copies them to the
// project root where they are easy to find.
//
//   node scripts/build.mjs win     → MyWorkForce-Setup-<version>.exe (NSIS)
//   node scripts/build.mjs mac     → MyWorkForce-<version>-<arch>.dmg
//   node scripts/build.mjs linux   → MyWorkForce-<version>-<arch>.deb / .rpm / .AppImage
//   node scripts/build.mjs all     → everything this OS can build
//
// The data service (Node + server.cjs in src-tauri/runtime/) and the web pages are made by tauri.conf.json's
// beforeBuildCommand (npm run stage && npm run build:web), so the installer always carries fresh copies.
// Tauri builds natively only: Windows installers on Windows, macOS on macOS, Linux on Linux.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const name = 'MyWorkForce';
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

// A copy started from this folder keeps target/release/MyWorkForce.exe locked on Windows.
// Only that one is stopped; an installed MyWorkForce keeps running.
if (process.platform === 'win32') {
  const script = `Get-Process -Name '${name}' -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith('${root.replace(/'/g, "''")}', 'OrdinalIgnoreCase') } | Stop-Process -Force`;
  spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: 'ignore' });
}

// The installer's language dialog gets its title-bar icon from a small helper (tools/langicon, see
// src-tauri/windows/hooks.nsh). It is built here and placed next to hooks.nsh, where the installer takes it from.
if (requested === 'win') {
  const crate = path.join(root, 'tools', 'langicon');
  console.log('> cargo build --release (tools/langicon)');
  const helper = spawnSync(process.platform === 'win32' ? 'cargo.exe' : 'cargo', ['build', '--release', '--manifest-path', path.join(crate, 'Cargo.toml')], { cwd: crate, stdio: 'inherit' });
  if (helper.status !== 0) process.exit(helper.status ?? 1);
  fs.copyFileSync(path.join(crate, 'target', 'release', 'langicon.exe'), path.join(root, 'src-tauri', 'windows', 'langicon.exe'));
}

const bundleDir = path.join(root, 'src-tauri', 'target', 'release', 'bundle');
const started = Date.now();
const bundles = targets[requested].bundles;
console.log(`> tauri build --bundles ${bundles.join(',')}`);
const result = spawnSync(process.execPath, [path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'), 'build', '--bundles', bundles.join(',')], {
  cwd: root,
  stdio: 'inherit',
});
if (result.status !== 0) process.exit(result.status ?? 1);

// The page is embedded in the program when Rust compiles. If dist/ was being rebuilt at that moment,
// the program has no page and is no use: every dist/assets file must be in the binary.
const releaseDir = path.join(root, 'src-tauri', 'target', 'release');
const binary = [`${name}.exe`, name, 'myworkforce.exe', 'myworkforce']
  .map((file) => path.join(releaseDir, file))
  .filter((file) => fs.existsSync(file))
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
const assets = fs.existsSync(path.join(root, 'dist', 'assets')) ? fs.readdirSync(path.join(root, 'dist', 'assets')).filter((file) => /\.(js|css)$/.test(file)) : [];
const embedded = binary ? fs.readFileSync(binary).toString('latin1') : '';
const missing = assets.filter((file) => !embedded.includes(`/assets/${file}`));
if (!binary || !assets.length || missing.length) {
  console.error(`\n프로그램에 웹 페이지가 들어가지 않았습니다 (${binary ? path.basename(binary) : '실행 파일 없음'}: 빠진 파일 ${missing.length}/${assets.length}개).`);
  console.error('빌드 중에 dist/ 가 다시 만들어진 것 같습니다. 다른 vite build 가 끝난 뒤 다시 빌드하세요.');
  process.exit(1);
}

const release = path.join(root, 'release');
fs.mkdirSync(release, { recursive: true });

const arch = (file) => (/(aarch64|arm64)/i.test(file) ? 'arm64' : /(x86_64|amd64|x64)/i.test(file) ? 'x64' : process.arch);
const rename = [
  [/\.exe$/i, () => `${name}-Setup-${version}.exe`],
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
    const from = path.join(directory, file);
    // Only what this build made: the right version, written after the build started.
    if (!rule || !file.includes(version) || fs.statSync(from).mtimeMs < started - 1000) continue;
    const target = rule[1](file);
    fs.copyFileSync(from, path.join(release, target));
    fs.copyFileSync(from, path.join(root, target));
    collected.push({ target, size: fs.statSync(from).size });
  }
}

if (!collected.length) {
  console.error('설치 파일을 찾지 못했습니다. 위 Tauri 빌드 로그를 확인하세요.');
  process.exit(1);
}
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
console.log(`\n설치 파일 (프로젝트 루트와 release/):\n${collected.map((item) => `  ${item.target}  (${mb(item.size)})`).join('\n')}`);

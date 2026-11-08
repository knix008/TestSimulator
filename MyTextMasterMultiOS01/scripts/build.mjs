// Builds MyTextMaster installers with the Tauri bundler, collects them in release/ under
// fixed names, and copies them to the project root where they are easy to find.
//
//   npm run build:win     → MyTextMaster-Setup-<version>.exe (NSIS)
//   npm run build:mac     → MyTextMaster-<version>-<arch>.dmg
//   npm run build:linux   → MyTextMaster-<version>-<arch>.deb / .rpm / .AppImage
//   npm run build:webapp  → MyTextMaster-Web-<version>.zip (dist/ for any web server)
//   npm run build:all     → everything this OS can build, plus the web app
//
// Tauri builds natively only: Windows installers on Windows, macOS on macOS, Linux on Linux.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const name = 'MyTextMaster';
const host = { win32: 'win', darwin: 'mac', linux: 'linux' }[process.platform];
const targets = { win: ['nsis'], mac: ['app', 'dmg'], linux: ['deb', 'rpm', 'appimage'] };
const release = path.join(root, 'release');
fs.mkdirSync(release, { recursive: true });

const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' && command === 'npm' });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

const asked = process.argv[2] ?? 'all';
const wanted = asked === 'all' ? [host, 'web'] : [asked];
for (const target of wanted) {
  if (target !== 'web' && !targets[target]) {
    console.error(`알 수 없는 대상: ${target} (win | mac | linux | web | all)`);
    process.exit(1);
  }
  if (target !== 'web' && target !== host) {
    console.error(`${target} 설치 파일은 ${{ win: 'Windows', mac: 'macOS', linux: 'Linux' }[target]} 에서 만들어야 합니다 (Tauri 는 교차 빌드를 지원하지 않습니다).`);
    process.exit(1);
  }
}

run(process.execPath, [path.join(root, 'scripts', 'make-samples.mjs')]);

for (const target of wanted) {
  if (target === 'web') { buildWeb(); continue; }
  // A copy started from this folder keeps target/release/MyTextMaster.exe locked on Windows: only those stop.
  if (process.platform === 'win32') {
    const script = `Get-Process -Name '${name}' -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith('${root.replace(/'/g, "''")}', 'OrdinalIgnoreCase') } | Stop-Process -Force`;
    spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: 'ignore' });
  }
  console.log(`> tauri build --bundles ${targets[target].join(',')}`);
  run(process.execPath, [path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'), 'build', '--bundles', targets[target].join(',')]);
  collect();
}

function collect() {
  const bundleDir = path.join(root, 'src-tauri', 'target', 'release', 'bundle');
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
}

/** The web app: dist/ zipped (PowerShell Compress-Archive on Windows, zip elsewhere). */
function buildWeb() {
  run('npm', ['run', 'build:web']);
  const zip = path.join(release, `${name}-Web-${version}.zip`);
  fs.rmSync(zip, { force: true });
  if (process.platform === 'win32') {
    const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', `Compress-Archive -Path '${path.join(root, 'dist', '*')}' -DestinationPath '${zip}'`], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(1);
  } else {
    const result = spawnSync('zip', ['-qr', zip, '.'], { cwd: path.join(root, 'dist'), stdio: 'inherit' });
    if (result.status !== 0) process.exit(1);
  }
  fs.copyFileSync(zip, path.join(root, path.basename(zip)));
  console.log(`\n웹 앱: ${path.basename(zip)} (release/ 와 프로젝트 루트) — 압축을 풀어 아무 웹 서버에 올리면 됩니다.`);
}

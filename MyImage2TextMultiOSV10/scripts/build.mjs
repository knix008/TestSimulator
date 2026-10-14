// Builds Image2Text for one target. Every output goes to release/; only the one
// installer for this machine is copied to the project root.
//
//   node scripts/build.mjs web       → Image2Text-<version>-web.zip
//   node scripts/build.mjs windows   → Image2Text-Setup-<version>.exe
//   node scripts/build.mjs linux     → deb, rpm, AppImage, and a setup script (root: deb or rpm)
//   node scripts/build.mjs macos     → dmg with the app and the install command
//
// Desktop installers are native: Windows on Windows, macOS on macOS, Linux on
// Linux. The web bundle can be built on any of them.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const product = 'Image2Text';
const host = { win32: 'windows', darwin: 'macos', linux: 'linux' }[process.platform];
const bundles = {
  windows: ['nsis'],
  macos: ['app', 'dmg'],
  linux: ['deb', 'rpm', 'appimage'],
};
const ROOT_INSTALLER = /(-Setup-.*\.exe|-setup\.exe|\.msi|\.dmg|\.deb|\.rpm|\.AppImage|-linux-setup\.sh)$|^image2text\.png$/i;

const requested = process.argv[2];
if (!requested || !['web', 'windows', 'linux', 'macos'].includes(requested)) {
  console.error('대상을 지정하세요: web | windows | linux | macos');
  process.exit(1);
}

if (requested === 'web') {
  buildWeb();
} else {
  buildDesktop(requested);
}

function buildWeb() {
  const vite = spawnSync(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], {
    cwd: root,
    stdio: 'inherit',
  });
  if (vite.status !== 0) process.exit(vite.status ?? 1);

  const release = path.join(root, 'release');
  fs.mkdirSync(release, { recursive: true });
  const name = `${product}-${version}-web.zip`;
  const zip = path.join(release, name);
  fs.rmSync(zip, { force: true });
  const tar = spawnSync('tar', ['-a', '-c', '-f', zip, '-C', root, 'dist'], { stdio: 'inherit' });
  if (tar.status !== 0) process.exit(tar.status ?? 1);
  clearRoot(/-web\.zip$/i);
  fs.copyFileSync(zip, path.join(root, name));
  console.log(`\n웹 빌드: release/${name}, 루트: ${name}`);
  console.log('브라우저에서 dist/index.html 을 엽니다. 언어는 화면의 언어 버튼으로 바꿉니다.');
}

function buildDesktop(target) {
  if (target !== host) {
    const where = target === 'windows' ? 'Windows' : target === 'macos' ? 'macOS' : 'Linux';
    console.error(`${where} 설치 파일은 ${where}에서 만들어야 합니다. Tauri는 다른 운영체제용 설치 파일을 교차 빌드하지 않습니다.`);
    process.exit(1);
  }

  const icons = spawnSync(process.execPath, [path.join(root, 'scripts', 'generate-icons.mjs'), '--if-needed'], {
    cwd: root,
    stdio: 'inherit',
  });
  if (icons.status !== 0) process.exit(icons.status ?? 1);

  if (process.platform === 'win32') {
    const script = `Get-Process -Name 'image2text' -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith('${root.replace(/'/g, "''")}', 'OrdinalIgnoreCase') } | Stop-Process -Force`;
    spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: 'ignore' });
  }

  const selected = bundles[target];
  console.log(`> tauri build --bundles ${selected.join(',')}`);
  const result = spawnSync(process.execPath, [
    path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'),
    'build',
    '--bundles',
    selected.join(','),
  ], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);

  if (target === 'macos') wrapMacInstaller();

  const collected = collectInstallers();
  if (target === 'linux') copyLinuxSetup();
  if (!collected.length) {
    console.error('설치 파일을 찾지 못했습니다. 위 Tauri 빌드 로그를 확인하세요.');
    process.exit(1);
  }
  const primary = primaryInstaller(target, collected);
  clearRoot(ROOT_INSTALLER);
  fs.copyFileSync(path.join(root, 'release', primary), path.join(root, primary));
  console.log(`\n설치 파일 (release/):\n${collected.map((file) => `  ${file}`).join('\n')}`);
  console.log(`\n프로젝트 루트: ${primary}`);
}

function clearRoot(pattern) {
  for (const name of fs.readdirSync(root)) {
    const file = path.join(root, name);
    if (pattern.test(name) && fs.statSync(file).isFile()) fs.rmSync(file, { force: true });
  }
}

function primaryInstaller(target, collected) {
  const wanted = target === 'windows' ? /\.exe$/i
    : target === 'macos' ? /\.dmg$/i
      : linuxUsesRpm() ? /\.rpm$/i : /\.deb$/i;
  return collected.find((file) => wanted.test(file)) ?? collected[0];
}

function linuxUsesRpm() {
  try {
    const release = fs.readFileSync('/etc/os-release', 'utf8');
    const ids = (release.match(/^(ID|ID_LIKE)=(.*)$/gm) ?? []).join(' ').toLowerCase();
    return /fedora|rhel|centos|suse|opensuse|rocky|alma|mageia/.test(ids) && !/debian|ubuntu/.test(ids);
  } catch {
    return false;
  }
}

function bundleRoot() {
  if (!process.env.CARGO_TARGET_DIR) return path.join(root, 'src-tauri', 'target', 'release', 'bundle');
  const target = path.isAbsolute(process.env.CARGO_TARGET_DIR)
    ? process.env.CARGO_TARGET_DIR
    : path.join(root, 'src-tauri', process.env.CARGO_TARGET_DIR);
  return path.join(target, 'release', 'bundle');
}

function collectInstallers() {
  const bundleDir = bundleRoot();
  const release = path.join(root, 'release');
  fs.mkdirSync(release, { recursive: true });
  const archOf = (file) => (/(aarch64|arm64)/i.test(file) ? 'arm64' : /(x86_64|amd64|x64)/i.test(file) ? 'x64' : process.arch);
  const rename = [
    [/\.exe$/i, () => `${product}-Setup-${version}.exe`],
    [/\.msi$/i, (file) => `${product}-${version}-${archOf(file)}.msi`],
    [/\.dmg$/i, (file) => `${product}-${version}-${archOf(file)}.dmg`],
    [/\.deb$/i, (file) => `${product}-${version}-${archOf(file)}.deb`],
    [/\.rpm$/i, (file) => `${product}-${version}-${archOf(file)}.rpm`],
    [/\.AppImage$/, (file) => `${product}-${version}-${archOf(file)}.AppImage`],
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
      collected.push(target);
    }
  }
  return collected;
}

function copyLinuxSetup() {
  const release = path.join(root, 'release');
  const scriptName = `${product}-${version}-linux-setup.sh`;
  const icon = path.join(root, 'src-tauri', 'icons', '128x128@2x.png');
  fs.copyFileSync(path.join(root, 'src-tauri', 'linux', 'install-choices.sh'), path.join(release, scriptName));
  if (fs.existsSync(icon)) fs.copyFileSync(icon, path.join(release, 'image2text.png'));
  console.log(`AppImage 설치 스크립트: release/${scriptName}`);
}

function wrapMacInstaller() {
  const bundle = path.join(bundleRoot(), 'macos');
  const app = path.join(bundle, `${product}.app`);
  if (!fs.existsSync(app)) return;
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'image2text-dmg-'));
  fs.cpSync(app, path.join(stage, `${product}.app`), { recursive: true });
  const command = path.join(stage, 'Install Image2Text.command');
  fs.copyFileSync(path.join(root, 'src-tauri', 'macos', 'install.sh'), command);
  fs.chmodSync(command, 0o755);
  const dmg = path.join(bundle, `${product}_${version}_universal.dmg`);
  const existing = fs.readdirSync(bundle).find((name) => name.endsWith('.dmg'));
  const output = existing ? path.join(bundle, existing) : dmg;
  fs.rmSync(output, { force: true });
  const created = spawnSync('hdiutil', ['create', '-volname', product, '-srcfolder', stage, '-ov', '-format', 'UDZO', output], {
    stdio: 'inherit',
  });
  fs.rmSync(stage, { recursive: true, force: true });
  if (created.status !== 0) process.exit(created.status ?? 1);
}

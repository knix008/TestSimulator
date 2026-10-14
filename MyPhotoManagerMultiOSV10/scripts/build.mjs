// Builds MyPhotoManager installers and collects them in release/ (and copies
// them to the project root):
//
//   node scripts/build.mjs win     → MyPhotoManager-Setup-<version>.exe (NSIS)
//   node scripts/build.mjs mac     → MyPhotoManager-<version>-<arch>.dmg
//   node scripts/build.mjs linux   → MyPhotoManager-<version>-<arch>.deb / .rpm / .AppImage
//   node scripts/build.mjs web     → MyPhotoManager-<version>-web.zip (installable web app / PWA)
//   node scripts/build.mjs all     → the web app + everything this OS can build
//
// Tauri builds natively only: Windows installers on Windows, macOS on macOS,
// Linux on Linux (or in WSL on Windows: see README). Asking for another OS stops
// with an explanation.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const name = 'MyPhotoManager';
const host = { win32: 'win', darwin: 'mac', linux: 'linux' }[process.platform];
const release = path.join(root, 'release');

const targets = {
  win: { bundles: ['nsis'] },
  mac: { bundles: ['app', 'dmg'] },
  linux: { bundles: ['deb', 'rpm', 'appimage'] },
};

const arg = process.argv[2] ?? 'all';
if (![...Object.keys(targets), 'web', 'all'].includes(arg)) {
  console.error(`알 수 없는 대상: ${arg} (win | mac | linux | web | all)`);
  process.exit(1);
}
const OS_NAMES = { win: 'Windows', mac: 'macOS', linux: 'Linux' };
if (targets[arg] && arg !== host) {
  console.error(`${arg} 설치 파일은 ${OS_NAMES[arg]} 에서 만들어야 합니다 (Tauri는 교차 빌드를 지원하지 않습니다).`);
  process.exit(1);
}
fs.mkdirSync(release, { recursive: true });
const collected = [];

function run(command, args, options = {}) {
  console.log(`> ${[command, ...args].join(' ')}`);
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// ───────────────────────── web app (zip of dist/)

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Minimal ZIP writer (deflate). entries: [{ name, data }]. */
export function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name: entryName, data } of entries) {
    const nameBytes = Buffer.from(entryName, 'utf8');
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt32LE(0, 10); local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26); local.writeUInt16LE(0, 28);
    locals.push(local, nameBytes, body);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(useDeflate ? 8 : 0, 10);
    central.writeUInt32LE(0, 12); central.writeUInt32LE(crc, 16); central.writeUInt32LE(body.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + body.length;
  }
  const centralSize = centrals.reduce((s, b) => s + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

function listFiles(dir, prefix = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? listFiles(full, rel) : [{ name: rel, full }];
  });
}

function buildWeb() {
  run(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build']);
  const dist = path.join(root, 'dist');
  const folder = `${name}-${version}-web`;
  const readme = Buffer.from([
    `${name} ${version} — web app`,
    '',
    'Serve this folder from any web server (HTTPS, or http://localhost), then open it in Chrome, Edge,',
    'Firefox or Safari. In Chrome and Edge, use "Install app" in the address bar to install it',
    '(it then opens in its own window and works offline).',
    '',
    'Quick local test:   npx serve .     or     python -m http.server 8080',
    '',
    'Opening index.html directly from the disk (file://) is not supported by browsers for app modules.',
    '',
  ].join('\n'));
  const entries = [...listFiles(dist).map(({ name: n, full }) => ({ name: `${folder}/${n}`, data: fs.readFileSync(full) })), { name: `${folder}/README.txt`, data: readme }];
  const target = `${folder}.zip`;
  fs.writeFileSync(path.join(release, target), zip(entries));
  fs.copyFileSync(path.join(release, target), path.join(root, target));
  collected.push(target);
}

// ───────────────────────── desktop installers

function buildDesktop(kind) {
  // A copy started from this folder keeps target/release/MyPhotoManager.exe locked on Windows.
  if (process.platform === 'win32') {
    const script = `Get-Process -Name '${name}','myphotomanager' -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith('${root.replace(/'/g, "''")}', 'OrdinalIgnoreCase') } | Stop-Process -Force`;
    spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: 'ignore', windowsHide: true });
  }
  const bundles = targets[kind].bundles;
  const env = { ...process.env };
  // AppImage tooling needs this inside containers / WSL without FUSE.
  if (kind === 'linux') env.APPIMAGE_EXTRACT_AND_RUN = '1';
  run(process.execPath, [path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'), 'build', '--bundles', bundles.join(',')], { env });
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
  for (const sub of fs.existsSync(bundleDir) ? fs.readdirSync(bundleDir) : []) {
    const directory = path.join(bundleDir, sub);
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
}

if (arg === 'web' || arg === 'all') buildWeb();
if (targets[arg]) buildDesktop(arg);
if (arg === 'all' && host) buildDesktop(host);

if (!collected.length) {
  console.error('설치 파일을 찾지 못했습니다. 위 빌드 로그를 확인하세요.');
  process.exit(1);
}
console.log(`\n설치 파일 (release/ 와 프로젝트 루트):\n${collected.map((file) => `  ${file}`).join('\n')}`);

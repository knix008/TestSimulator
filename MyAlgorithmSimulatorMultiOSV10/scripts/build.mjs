// Builds an installer for this OS and copies it to release/ and the project root.
//   node scripts/build.mjs win | mac | linux | all
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const name = 'MyAlgorithmSimulator';
const host = { win32: 'win', darwin: 'mac', linux: 'linux' }[process.platform];
const targets = { win: ['nsis'], mac: ['app', 'dmg'], linux: ['deb', 'rpm', 'appimage'] };

const requested = process.argv[2] === 'all' || !process.argv[2] ? host : process.argv[2];
if (!targets[requested]) { console.error('사용법: node scripts/build.mjs win | mac | linux | all'); process.exit(1); }
if (requested !== host) { console.error(`${requested} 설치 파일은 그 운영체제에서 만들어야 합니다.`); process.exit(1); }

const result = spawnSync(process.execPath, [path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'), 'build', '--bundles', targets[requested].join(',')], { cwd: root, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);

const targetRoot = process.env.CARGO_TARGET_DIR ? path.resolve(process.env.CARGO_TARGET_DIR) : path.join(root, 'src-tauri', 'target');
const bundleDir = path.join(targetRoot, 'release', 'bundle');
const release = path.join(root, 'release');
fs.mkdirSync(release, { recursive: true });
const arch = (file) => (/(aarch64|arm64)/i.test(file) ? 'arm64' : 'x64');
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
if (!collected.length) { console.error('설치 파일을 찾지 못했습니다.'); process.exit(1); }
console.log(`\n설치 파일:\n${collected.map((file) => `  ${file}`).join('\n')}`);

// Builds MySimulator installers with the Tauri bundler, then collects them in
// release/ under the same names the other My* apps use, and copies them to the
// project root where they are easy to find.
//
//   node scripts/build.mjs win     → MySimulator-Setup-<version>.exe (NSIS)
//   node scripts/build.mjs mac     → MySimulator-<version>-<arch>.dmg
//   node scripts/build.mjs linux   → MySimulator-<version>-<arch>.deb / .rpm / .AppImage
//   node scripts/build.mjs all     → everything this OS can build
//
// Tauri builds natively only: Windows installers on Windows, macOS on macOS,
// Linux on Linux. Asking for another OS stops with an explanation.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { c, heading, padEnd, padStart } from '../test/e2e/report.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const name = 'MySimulator';
const host = { win32: 'win', darwin: 'mac', linux: 'linux' }[process.platform];

const targets = {
  win: { bundles: ['nsis'] },
  mac: { bundles: ['app', 'dmg'] },
  linux: { bundles: ['deb', 'rpm', 'appimage'] },
};

const requested = process.argv[2] === 'all' || !process.argv[2] ? host : process.argv[2];
if (!targets[requested]) {
  console.error(c.red(`Unknown target: ${process.argv[2]} (win | mac | linux | all)`));
  process.exit(1);
}
if (requested !== host) {
  console.error(c.red(`The ${requested} installer has to be built on ${requested === 'win' ? 'Windows' : requested === 'mac' ? 'macOS' : 'Linux'} (Tauri does not cross-compile).`));
  process.exit(1);
}

// A copy started from this folder keeps target/release/MySimulator.exe locked on
// Windows. Only those are stopped; an installed MySimulator keeps running.
if (process.platform === 'win32') {
  const script = `Get-Process -Name '${name}' -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith('${root.replace(/'/g, "''")}', 'OrdinalIgnoreCase') } | Stop-Process -Force`;
  spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: 'ignore' });
}

const bundles = targets[requested].bundles;
console.log(`${heading(`Building the ${requested} installer`, c.dim(`tauri build --bundles ${bundles.join(',')}`))}`);
const started = performance.now();
const result = spawnSync(process.execPath, [path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'), 'build', '--bundles', bundles.join(',')], {
  cwd: root,
  stdio: 'inherit',
});
if (result.status !== 0) process.exit(result.status ?? 1);

// The page is embedded in the program when Rust compiles. If dist/ was being rebuilt at that
// moment (a `vite build` elsewhere empties it first), the program has no page: it starts with
// "asset not found: index.html" and is no use. Every dist/assets file must be in the binary.
const releaseDir = path.join(root, 'src-tauri', 'target', 'release');
const binary = [`${name}.exe`, 'mysimulator.exe', name, 'mysimulator']
  .map((file) => path.join(releaseDir, file))
  .filter((file) => fs.existsSync(file))
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
const assets = fs.readdirSync(path.join(root, 'dist', 'assets')).filter((file) => /\.(js|css)$/.test(file));
const embedded = binary ? fs.readFileSync(binary).toString('latin1') : '';
const missing = assets.filter((file) => !embedded.includes(`/assets/${file}`));
if (!binary || !assets.length || missing.length) {
  console.error(c.red(`\nThe web page was not embedded in the program (${binary ? path.basename(binary) : 'no program file'}: ${missing.length} of ${assets.length} files missing).`));
  console.error('dist/ seems to have been rebuilt during the build. Build again once the other vite build has finished.');
  process.exit(1);
}

// Tauri shows makensis' output only when it fails, so its warnings would pass unseen. The script is
// compiled once more with the warnings shown (the same installer is written): there must be none.
const nsisScript = path.join(releaseDir, 'nsis', 'x64', 'installer.nsi');
const makensis = path.join(process.env.LOCALAPPDATA ?? '', 'tauri', 'NSIS', 'makensis.exe');
if (requested === 'win' && fs.existsSync(nsisScript) && fs.existsSync(makensis)) {
  const check = spawnSync(makensis, ['/V2', nsisScript], { cwd: path.dirname(nsisScript), encoding: 'utf8' });
  const warnings = `${check.stdout}\n${check.stderr}`.split(/\r?\n/).filter((line) => /^warning \d+:/i.test(line.trim()));
  if (check.status !== 0 || warnings.length) {
    console.error(c.red(`\nmakensis ${check.status !== 0 ? 'failed' : `gave ${warnings.length} warning${warnings.length === 1 ? '' : 's'}`}:`));
    for (const line of [...new Set(warnings)]) console.error(`  ${line.trim()}`);
    if (check.status !== 0) console.error(check.stdout.slice(-2000));
    process.exit(1);
  }
  console.log(`${c.green('✓')} NSIS: no warnings`);
}

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
    collected.push({ file: target, kind, bytes: fs.statSync(path.join(directory, file)).size });
  }
}

if (!collected.length) {
  console.error(c.red('No installer was found. Check the Tauri build log above.'));
  process.exit(1);
}
// Summary: one aligned row per installer.
const size = (bytes) => (bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`);
const W = { file: Math.max(36, ...collected.map((x) => x.file.length)), kind: 10, size: 10 };
console.log(`\n${heading('Installer summary')}`);
console.log(`  ${c.bold(padEnd('Installer', W.file))}  ${c.bold(padEnd('Type', W.kind))}${c.bold(padStart('Size', W.size))}   ${c.bold('Copied to')}`);
console.log(`  ${c.dim('─'.repeat(W.file + W.kind + W.size + 30))}`);
for (const x of collected) console.log(`  ${c.green(padEnd(x.file, W.file))}  ${padEnd(x.kind, W.kind)}${padStart(size(x.bytes), W.size)}   ${c.dim('release/, project root')}`);
console.log(`  ${c.dim('─'.repeat(W.file + W.kind + W.size + 30))}`);
const seconds = (performance.now() - started) / 1000;
console.log(`  ${c.onGreen(' BUILD OK ')} ${collected.length} installer${collected.length === 1 ? '' : 's'}, version ${version}  ${c.dim(`${seconds >= 60 ? `${Math.floor(seconds / 60)} m ${Math.round(seconds % 60)} s` : `${seconds.toFixed(1)} s`}`)}`);

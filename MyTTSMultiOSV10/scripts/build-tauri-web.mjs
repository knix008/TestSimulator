/**
 * What the Tauri program embeds and bundles (tauri.conf.json build step):
 *
 *   dist/web/       the pages: index.html, guide.html, src/web/**, assets/**, doc/** (same relative paths)
 *   dist/sidecar/   with --release: the Node host and TTS engine (src/host, src/core), the
 *                   production node_modules (onnxruntime-node, sherpa-onnx-node … — native
 *                   addons, so they are copied, not bundled) and the Node runtime itself.
 *                   Debug builds run src/host from the project with the Node on PATH, so
 *                   the folder only holds a note there.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const release = process.argv.includes('--release');
const web = path.join(root, 'dist', 'web');
const sidecar = path.join(root, 'dist', 'sidecar');
const noMaps = (src) => !src.endsWith('.map');

function copy(rel, to, filter = noMaps) {
  const target = path.join(to, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(path.join(root, rel), target, { recursive: true, filter });
}

// ── page ──
fs.rmSync(web, { recursive: true, force: true });
// guide.html + doc/ : the user guide window (Help › 사용 설명서) reads doc/*.md and doc/images.
for (const rel of ['index.html', 'guide.html', 'src/web', 'assets', 'doc']) {
  if (fs.existsSync(path.join(root, rel))) copy(rel, web, (src) => noMaps(src) && !src.endsWith('.py'));
}

// ── host ──
fs.rmSync(sidecar, { recursive: true, force: true });
fs.mkdirSync(sidecar, { recursive: true });
if (!release) {
  fs.writeFileSync(path.join(sidecar, 'README.txt'), 'Debug builds run src/host/host.mjs from the project with the Node.js on PATH.\n');
  console.log(`Tauri page ready: ${path.relative(root, web)} (debug: host runs from src/host)`);
  process.exit(0);
}

copy('src/host', sidecar);
copy('src/core', sidecar);
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
fs.writeFileSync(path.join(sidecar, 'package.json'), `${JSON.stringify({ name: pkg.name, version: pkg.version, private: true, type: 'module', dependencies: pkg.dependencies }, null, 2)}\n`);

// The production dependency closure, as npm resolved it (no Tauri CLI, no dev tools).
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const listed = execFileSync(npm, ['ls', '--omit=dev', '--all', '--parseable'], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' })
  .split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
const modules = path.join(root, 'node_modules');
const topLevel = new Set();
for (const dir of listed) {
  const rel = path.relative(modules, dir);
  if (!rel || rel.startsWith('..')) continue;
  const parts = rel.split(path.sep);
  topLevel.add(parts[0].startsWith('@') ? path.join(parts[0], parts[1]) : parts[0]);
}

// Native binaries for other systems stay out of the installer.
const arch = process.arch;
const foreign = (src) => {
  const p = src.split(path.sep).join('/');
  const napi = /onnxruntime-node\/bin\/napi-v\d+\/([^/]+)(?:\/([^/]+))?/.exec(p);
  if (napi && napi[1] && napi[1] !== process.platform) return true;
  if (napi && napi[2] && napi[2] !== arch) return true;
  return false;
};
for (const name of topLevel) {
  copy(path.join('node_modules', name), sidecar, (src) => noMaps(src) && !foreign(src) && !/[\\/](test|tests|docs?|examples?)[\\/]?$/i.test(src));
}

const nodeName = process.platform === 'win32' ? 'node.exe' : 'node';
fs.copyFileSync(process.execPath, path.join(sidecar, nodeName));
if (process.platform !== 'win32') fs.chmodSync(path.join(sidecar, nodeName), 0o755);

let bytes = 0;
let files = 0;
const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else { files += 1; bytes += fs.statSync(p).size; } } };
walk(sidecar);
console.log(`Tauri page ready: ${path.relative(root, web)}; host: ${path.relative(root, sidecar)} — ${topLevel.size} packages, Node ${process.version}, ${files} files, ${(bytes / 1048576).toFixed(0)} MB`);

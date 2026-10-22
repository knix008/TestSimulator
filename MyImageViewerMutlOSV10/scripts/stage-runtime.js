/**
 * stage-runtime.js — gather what the installed app needs to run its Node host, so the
 * installer works on a PC without Node or this source tree.
 *
 *   node scripts/stage-runtime.js        (run by build:win / build:mac / build:linux)
 *
 * Fills src-tauri/runtime/ (bundled as a resource, see tauri.conf.json):
 *   runtime/node(.exe)                    the Node that runs this script
 *   runtime/app/package.json
 *   runtime/app/host/  src/  doc/  scripts/rembg_worker.py
 *   runtime/app/node_modules/             "dependencies" and everything they need, no dev tools
 *
 * The packages are copied from this project's node_modules, so the platform parts
 * (sharp's libvips, ffmpeg-static's binary) are those of the OS the build runs on.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'src-tauri', 'runtime');
const APP = path.join(OUT, 'app');

function copyDir(from, to, skip = () => false) {
  fs.mkdirSync(to, { recursive: true });
  for (const ent of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, ent.name);
    const dst = path.join(to, ent.name);
    if (skip(src, ent)) continue;
    if (ent.isDirectory()) copyDir(src, dst, skip);
    else if (ent.isFile()) fs.copyFileSync(src, dst);
  }
}

// The folder Node would load `name` from when required inside `fromDir`
function resolvePkgDir(name, fromDir) {
  for (let dir = fromDir; ; dir = path.dirname(dir)) {
    const cand = path.join(dir, 'node_modules', name);
    if (fs.existsSync(path.join(cand, 'package.json'))) return cand;
    if (dir === ROOT || path.dirname(dir) === dir) return null;
  }
}

function productionPackages() {
  const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const found = new Set();
  const queue = Object.keys(rootPkg.dependencies || {}).map((name) => ({ name, from: ROOT, optional: false }));
  while (queue.length) {
    const { name, from, optional } = queue.shift();
    const dir = resolvePkgDir(name, from);
    if (!dir) {
      // Optional ones are the other platforms' builds (@img/sharp-darwin-arm64 …)
      if (optional) continue;
      throw new Error(`${name} (needed by ${path.relative(ROOT, from) || 'package.json'}) is not installed — run npm install`);
    }
    if (found.has(dir)) continue;
    found.add(dir);
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    for (const dep of Object.keys(pkg.dependencies || {})) queue.push({ name: dep, from: dir, optional: false });
    for (const dep of Object.keys(pkg.optionalDependencies || {})) queue.push({ name: dep, from: dir, optional: true });
  }
  return [...found];
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(APP, { recursive: true });
// Keeps the folder in git, so tauri-build finds the resource on a fresh clone
fs.writeFileSync(path.join(OUT, '.gitkeep'), '');

const nodeName = process.platform === 'win32' ? 'node.exe' : 'node';
fs.copyFileSync(process.execPath, path.join(OUT, nodeName));
if (process.platform !== 'win32') fs.chmodSync(path.join(OUT, nodeName), 0o755);

fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(APP, 'package.json'));
for (const dir of ['host', 'src', 'doc']) copyDir(path.join(ROOT, dir), path.join(APP, dir));
fs.mkdirSync(path.join(APP, 'scripts'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'scripts', 'rembg_worker.py'), path.join(APP, 'scripts', 'rembg_worker.py'));

const pkgs = productionPackages();
for (const dir of pkgs) {
  // A package's own node_modules holds nested deps, which are in the list themselves
  copyDir(dir, path.join(APP, path.relative(ROOT, dir)), (src, ent) => ent.isDirectory() && ent.name === 'node_modules');
}

let bytes = 0;
let files = 0;
(function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else { bytes += fs.statSync(p).size; files += 1; }
  }
})(OUT);
console.log(`[stage-runtime] Node ${process.version} + ${pkgs.length} packages → src-tauri/runtime (${(bytes / 1048576).toFixed(1)} MB, ${files} files)`);

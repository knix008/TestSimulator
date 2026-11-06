// Prepares dist/sidecar, which the installer carries: the Node runtime, the server, the page and
// the production packages. Tauri runs this before every build (tauri.conf.json).
//
// Debug builds run the project's own files with the `node` on PATH, so for those the folder only
// has to exist.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const STAGE = path.join(ROOT, 'dist', 'sidecar');
const APP = path.join(STAGE, 'app');

const APP_FILES = ['desktop-host.js', 'server.js', 'package.json', 'src', 'assets', 'sample'];

// Inside packages: what a running server never reads.
const SKIP_DIRS = new Set(['test', 'tests', '__tests__', 'example', 'examples', 'docs', 'doc', '.github', '.vscode', 'benchmark', 'benchmarks']);
const SKIP_EXT = /\.(md|markdown|map|ts|mts|cts|tsbuildinfo|gyp|gypi|cc|cpp|h|hpp|c|o|obj|pdb|lib|exp|ilk|tlog|log)$/i;
// sqlite3 carries its whole C source; only the compiled module is used.
const SKIP_PATHS = [/sqlite3[\\/]deps$/, /sqlite3[\\/]src$/, /sqlite3[\\/]build[\\/](deps|Release[\\/]obj)$/, /node-addon-api$/, /node-gyp$/];

function keep(source) {
  const name = path.basename(source);
  if (fs.statSync(source).isDirectory()) {
    return !SKIP_DIRS.has(name.toLowerCase()) && !SKIP_PATHS.some((p) => p.test(source));
  }
  return !SKIP_EXT.test(name);
}

function productionPackages() {
  const out = execSync('npm ls --omit=dev --all --parseable --silent', { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && path.resolve(line) !== path.resolve(ROOT));
}

fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });

if (process.env.TAURI_ENV_DEBUG === 'true') {
  fs.writeFileSync(path.join(STAGE, 'debug-build.txt'), 'Debug builds run the project files; see src-tauri/src/host.rs.\n');
  process.exit(0);
}

fs.copyFileSync(process.execPath, path.join(STAGE, path.basename(process.execPath)));
for (const item of APP_FILES) {
  fs.cpSync(path.join(ROOT, item), path.join(APP, item), { recursive: true });
}

const packages = productionPackages();
for (const pkg of packages) {
  const relative = path.relative(ROOT, pkg);
  fs.cpSync(pkg, path.join(APP, relative), { recursive: true, filter: keep });
}
if (!fs.existsSync(path.join(APP, 'node_modules', 'sqlite3', 'build', 'Release', 'node_sqlite3.node'))) {
  throw new Error('The compiled sqlite3 module was not staged. Run npm install first.');
}

let files = 0;
let bytes = 0;
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else { files += 1; bytes += fs.statSync(full).size; }
  }
};
walk(STAGE);
console.log(`Sidecar staged: ${packages.length} packages, ${files} files, ${(bytes / 1048576).toFixed(0)} MB`);

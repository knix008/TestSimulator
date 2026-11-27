// Packaging, names, documents, icons and texts: checks that need no build and no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const json = (p) => JSON.parse(read(p));

test('package and scripts', () => {
  const pkg = json('package.json');
  assert.equal(pkg.productName, 'My3DMaker');
  for (const s of ['start', 'dev', 'build:wasm', 'build:web', 'build:win', 'build:mac', 'build:linux', 'test', 'clean', 'clean:all', 'build:docs', 'guide:images']) assert.ok(pkg.scripts[s], `script ${s}`);
  assert.match(pkg.scripts['clean:all'], /--all/);
  for (const f of ['scripts/clean.mjs', 'scripts/build-wasm.mjs', 'scripts/start.mjs', 'scripts/build.mjs', 'scripts/build-docs.mjs']) assert.ok(fs.existsSync(path.join(root, f)), f);
});

test('Tauri configuration and backend', () => {
  const conf = json('src-tauri/tauri.conf.json');
  assert.equal(conf.productName, 'My3DMaker');
  assert.equal(conf.identifier, 'com.shkwon.my3dmaker');
  assert.deepEqual(conf.bundle.fileAssociations[0].ext, ['my3d']);
  for (const icon of conf.bundle.icon) assert.ok(fs.existsSync(path.join(root, 'src-tauri', icon)), icon);
  const cargo = read('src-tauri/Cargo.toml');
  assert.match(cargo, /sim-core = \{ path = "\.\.\/crates\/sim-core" \}/);
  const lib = read('src-tauri/src/lib.rs');
  for (const cmd of ['sim::run_simulation', 'sim::cancel_simulation', 'sim::solver_info']) assert.ok(lib.includes(cmd), cmd);
});

test('documents in both languages, with their pictures', () => {
  for (const f of ['README.md', 'ARCHITECTURE.md', 'doc/UsersGuide.md', 'doc/UsersGuide.en.md', 'doc/Tutorial.md', 'doc/Tutorial.en.md']) {
    const text = read(f);
    assert.ok(text.length > 1500, `${f} has content`);
    for (const m of text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) assert.ok(fs.existsSync(path.join(root, path.dirname(f), m[1])), `${f}: ${m[1]}`);
  }
});

const SKIP_DIRS = new Set(['node_modules', 'target', 'test-results', 'dist', 'pkg', '.git', 'gen', 'release']);
function* textFiles(dir) {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && rel !== path.join('public', 'doc')) yield* textFiles(rel); }
    else if (/\.(js|mjs|rs|md|css|json|html|toml|nsh|xml|sh|txt)$/.test(e.name) && !/LICENSE|NOTICES|OFL/.test(e.name)) yield rel;
  }
}

test('no other simulation product is named anywhere', () => {
  const banned = /ansys|\bfluent\b|hfss|ls-dyna|spaceclaim|workbench|icepak|\bapdl\b|designmodeler/i;
  const hits = [];
  for (const f of textFiles('.')) {
    if (f === path.join('test', 'static', 'package.test.js')) continue; // the pattern itself
    const lines = fs.readFileSync(path.join(root, f), 'utf8').split('\n');
    lines.forEach((l, i) => { if (banned.test(l)) hits.push(`${f}:${i + 1}`); });
  }
  assert.deepEqual(hits, []);
});

test('icons used by the catalog, shapes and examples exist', async () => {
  const { hasIcon } = await import('../../src/icons.js');
  const { SYSTEMS, BCS, GROUPS } = await import('../../src/sim/catalog.js');
  const { TEMPLATES } = await import('../../src/sim/shapes.js');
  const { SAMPLES, SAMPLE_GROUPS } = await import('../../src/sim/samples.js');
  const names = [...Object.values(SYSTEMS).map((s) => s.icon), ...Object.values(BCS).map((b) => b.icon), ...GROUPS.map((g) => g.icon), ...Object.values(TEMPLATES).map((t) => t.icon), ...SAMPLES.map((s) => s.icon), ...SAMPLE_GROUPS.map((g) => g.icon)];
  const missing = [...new Set(names)].filter((n) => !hasIcon(n));
  assert.deepEqual(missing, []);
});

test('every text key used by the panels exists in Korean and English', async () => {
  const { DICTIONARIES } = await import('../../src/i18n.js');
  const files = ['src/app.js', 'src/app-model.js', 'src/ui/simpanels.js', 'src/ui/startpage.js', 'src/popups-cad.js', 'src/sim/report.js', 'src/sim/results.js'];
  const keys = new Set();
  for (const f of files) for (const m of read(f).matchAll(/\bt\('([a-zA-Z0-9]+\.[a-zA-Z0-9.]+)'/g)) keys.add(m[1]);
  const missing = [...keys].filter((k) => !(k in DICTIONARIES.ko) || !(k in DICTIONARIES.en));
  assert.deepEqual(missing, []);
});

test('the WebAssembly solver package is built and current', () => {
  const wasm = path.join(root, 'src/sim/pkg/sim_wasm_bg.wasm');
  assert.ok(fs.existsSync(wasm), 'run npm run build:wasm');
  const newest = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((t, e) => (e.name === 'target' ? t : Math.max(t, e.isDirectory() ? newest(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).mtimeMs)), 0);
  assert.ok(fs.statSync(wasm).mtimeMs >= newest(path.join(root, 'crates')), 'the solver changed since the last npm run build:wasm');
});

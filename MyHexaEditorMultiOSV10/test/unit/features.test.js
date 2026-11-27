// The feature checklist (test/features.mjs): every feature is implemented (its commands, core methods, host
// operations, Tauri commands and files exist) and proved by tests that exist (unit, web, desktop, Rust, the command
// run of the web suite, the tutorial). Also: the help pages are in both languages and have their pictures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FEATURES } from '../features.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
const walk = (dir, re, out = []) => { for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (!['node_modules', 'target', 'dist'].includes(e.name)) walk(p, re, out); } else if (re.test(e.name)) out.push(p); } return out; };
// test titles are compared without the escapes of the source (user\'s → user's)
const plain = (s) => s.replace(/\\'/g, "'").replace(/\\"/g, '"');

const app = read('src', 'app.js');
const commandsText = app.slice(app.indexOf('const commands = {'), app.indexOf('\n};', app.indexOf('const commands = {')));
const commandLine = (id) => commandsText.split('\n').find((l) => new RegExp(`^\\s{2}'?${id.replace(/[.*+?^${}()|[\]\\:]/g, '\\$&')}'?: \\{`).test(l));
const engine = read('crates', 'hexcore', 'src', 'engine.rs');
const host = read('src', 'tools', 'host.js');
const tauri = walk('src-tauri/src', /\.rs$/).map((f) => read(f)).join('\n');
const rustSources = [...walk('crates/hexcore/src', /\.rs$/), ...walk('src-tauri/src', /\.rs$/)].map((f) => read(f)).join('\n');
const unitText = plain(walk('test/unit', /\.test\.js$/).map((f) => read(f)).join('\n'));
const webText = plain(read('test', 'e2e', 'web.suite.mjs'));
const desktopText = plain(read('test', 'e2e', 'desktop.suite.mjs'));
const skipped = new Set([...webText.match(/const SKIP = new Set\(\[([^\]]*)\]/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));

function implExists(ref) {
  const [kind, name] = [ref.slice(0, ref.indexOf(':')), ref.slice(ref.indexOf(':') + 1)];
  if (kind === 'cmd') return Boolean(commandLine(name));
  if (kind === 'core') return engine.includes(`"${name}"`);
  if (kind === 'host') return new RegExp(`\\n\\s{4}(async )?${name}\\(`).test(host);
  if (kind === 'tauri') return new RegExp(`fn ${name}\\(`).test(tauri);
  if (kind === 'file') return fs.existsSync(path.join(root, name));
  return false;
}

function testExists(ref) {
  if (ref === 'tutorial') return read('scripts', 'test.mjs').includes('runTutorial');
  const [kind, name] = [ref.slice(0, ref.indexOf(':')), ref.slice(ref.indexOf(':') + 1)];
  if (kind === 'unit') return unitText.includes(name);
  if (kind === 'web') return webText.includes(name);
  if (kind === 'desktop') return desktopText.includes(name);
  if (kind === 'rust') return new RegExp(`#\\[test\\]\\s*(#\\[[^\\]]*\\]\\s*)*fn ${name}\\(`).test(rustSources);
  // the web suite runs every command that is shown in the browser and not left out on purpose
  if (kind === 'cmd') { const line = commandLine(name); return Boolean(line) && !/hidden: !desktop/.test(line) && !skipped.has(name); }
  return false;
}

test('every feature in the checklist is implemented and proved by tests that exist', () => {
  const problems = [];
  const ids = new Set();
  for (const f of FEATURES) {
    if (ids.has(f.id)) problems.push(`${f.id}: listed twice`);
    ids.add(f.id);
    if (!f.tests?.length) problems.push(`${f.id}: no test`);
    for (const ref of f.impl ?? []) if (!implExists(ref)) problems.push(`${f.id}: implementation ${ref} not found`);
    for (const ref of f.tests ?? []) if (!testExists(ref)) problems.push(`${f.id}: test ${ref} not found`);
  }
  assert.deepEqual(problems, []);
  assert.ok(FEATURES.length >= 60, `${FEATURES.length} features`);
});

test('desktop-only commands (not run by the web suite) are each covered by a feature', () => {
  const desktopOnly = commandsText.split('\n').filter((l) => /hidden: !desktop/.test(l)).map((l) => l.match(/^\s{2}'?([\w:]+)'?:/)?.[1]).filter(Boolean);
  const covered = new Set(FEATURES.flatMap((f) => [...f.impl, ...f.tests]).filter((r) => r.startsWith('cmd:')).map((r) => r.slice(4)));
  const notIntended = new Set(['exit', 'revealSystem', 'copyPath']); // the OS file manager, the clipboard, quitting: not run by tests
  const missing = desktopOnly.filter((id) => !covered.has(id) && !notIntended.has(id));
  assert.deepEqual(missing, []);
});

test('help pages: guide and tutorial in Korean and English, with their pictures', () => {
  for (const name of ['UsersGuide.md', 'UsersGuide.en.md']) {
    const text = read('doc', name);
    const pictures = [...text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]);
    assert.ok(pictures.length >= 15, `${name}: ${pictures.length} pictures`);
    for (const p of pictures) assert.ok(fs.existsSync(path.join(root, 'doc', p)), `${name}: ${p} missing`);
    assert.ok(pictures.every((p) => p.includes(name.includes('.en.') ? '/en/' : '/ko/')), `${name}: pictures of its own language`);
  }
  for (const lang of ['ko', 'en']) {
    const steps = fs.readdirSync(path.join(root, 'doc', 'images', lang)).filter((n) => n.startsWith('tutorial-'));
    assert.ok(steps.length >= 25, `${lang}: ${steps.length} tutorial pictures`);
  }
});

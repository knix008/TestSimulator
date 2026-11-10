// npm test — every MyPhotoCut check, by category, with live results and a summary table.
//   npm test                       js · rust · web
//   npm test -- --only js,rust     just those
//   npm test -- --skip web         everything else
// js: node:test unit tests (test/unit). rust: cargo test --lib. web: the web app in headless Edge
// (scripts/smoke-web.mjs with test/e2e/gui.steps.json). Output is English, in aligned columns,
// coloured; results go to test-results/results.json.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { run } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const color = (process.stdout.isTTY || Boolean(process.env.FORCE_COLOR)) && !process.env.NO_COLOR;
const paint = (code) => (text) => (color ? `\x1b[${code}m${text}\x1b[0m` : String(text));
const c = {
  bold: paint('1'), dim: paint('2'), red: paint('91'), green: paint('92'), yellow: paint('93'), blue: paint('94'), magenta: paint('95'), cyan: paint('96'),
  gray: paint('90'), white: paint('97'), onGreen: paint('30;42'), onRed: paint('97;41'), onBlue: paint('97;44'), onMagenta: paint('97;45'), onCyan: paint('30;46'),
};

const args = process.argv.slice(2);
const listArg = (name) => { const i = args.indexOf(`--${name}`); return i < 0 ? null : new Set(String(args[i + 1] ?? '').split(',').filter(Boolean)); };
const CATEGORIES = [
  { id: 'js', title: 'JS unit tests', subtitle: 'rasters, face, warp, 40 styles, effects, codecs, project, undo, settings, i18n, icons', badge: c.onCyan, tint: c.cyan, run: runJs },
  { id: 'rust', title: 'Rust unit tests', subtitle: 'file I/O, window place, several copies', badge: c.onMagenta, tint: c.magenta, run: runRust },
  { id: 'web', title: 'GUI (web)', subtitle: 'the real app in headless Edge: start page, 40 caricatures, effects, layouts, print, popups', badge: c.onBlue, tint: c.blue, run: runWeb },
];
let selected = CATEGORIES.map((x) => x.id);
const only = listArg('only');
const skip = listArg('skip');
if (only) selected = selected.filter((id) => only.has(id));
if (skip) selected = selected.filter((id) => !skip.has(id));

// ───────────────────────── aligned output

const width = Math.max(90, Math.min(140, process.stdout.columns || 110));
const NAME = width - 24;
const visible = (s) => String(s).replace(/\x1b\[[0-9;]*m/g, '');
const fit = (s, n) => { const t = visible(s); return t.length > n ? `${t.slice(0, n - 1)}…` : t + ' '.repeat(n - t.length); };
const ms = (n) => (n >= 1000 ? `${(n / 1000).toFixed(2)} s` : `${Math.round(n)} ms`);
const timeColor = (n) => (n >= 2000 ? c.red : n >= 500 ? c.yellow : c.gray);
let counter = 0;

function line(ok, name, time, note = '') {
  counter += 1;
  const mark = ok === null ? c.yellow('○ SKIP') : ok ? c.green('✔ PASS') : c.red('✘ FAIL');
  const num = c.gray(String(counter).padStart(3));
  console.log(`  ${num}  ${mark}  ${ok === false ? c.white(fit(name, NAME)) : fit(name, NAME)}  ${timeColor(time)(ms(time).padStart(9))}`);
  if (note) console.log(`             ${c.red('↳')} ${c.red(fit(note, NAME + 8))}`);
}

function header(category) {
  counter = 0;
  console.log(`\n${category.badge(c.bold(` ${category.title.toUpperCase()} `))} ${c.gray(category.subtitle)}`);
  console.log(c.gray(`  ${'#'.padStart(3)}  ${'RESULT'.padEnd(6)}  ${'TEST'.padEnd(NAME)}  ${'TIME'.padStart(9)}`));
  console.log(c.gray(`  ${'─'.repeat(width - 4)}`));
}

// ───────────────────────── categories

async function runJs(report) {
  const files = fs.readdirSync(path.join(root, 'test', 'unit')).filter((f) => f.endsWith('.test.js')).map((f) => path.join(root, 'test', 'unit', f));
  const stream = run({ files, concurrency: true });
  for await (const event of stream) {
    if (event.type !== 'test:pass' && event.type !== 'test:fail') continue;
    if (event.data.nesting !== 0 || event.data.details?.type === 'suite') continue;
    if (!event.data.file || event.data.name.endsWith('.test.js')) continue;
    const ok = event.type === 'test:pass';
    const time = event.data.details?.duration_ms ?? 0;
    const error = ok ? '' : String(event.data.details?.error?.cause?.message ?? event.data.details?.error?.message ?? '').split('\n')[0];
    const name = `${path.basename(event.data.file, '.test.js')} › ${event.data.name}`;
    line(ok, name, time, error);
    report({ name, ok, ms: time, error });
  }
}

function spawnLines(command, argv, options, onLine) {
  return new Promise((resolve) => {
    const child = spawn(command, argv, { ...options, shell: false });
    let buffer = '';
    const feed = (chunk) => { buffer += chunk; const parts = buffer.split(/\r?\n/); buffer = parts.pop(); for (const p of parts) onLine(p); };
    child.stdout.on('data', feed);
    child.stderr.on('data', feed);
    child.on('close', (code) => { if (buffer) onLine(buffer); resolve(code); });
  });
}

async function runRust(report) {
  const started = Date.now();
  let last = Date.now();
  const code = await spawnLines('cargo', ['test', '--lib', '--', '--test-threads=1'], { cwd: path.join(root, 'src-tauri') }, (text) => {
    const m = /^test (\S+) \.\.\. (ok|FAILED|ignored)/.exec(text);
    if (m) {
      const now = Date.now();
      const ok = m[2] === 'ok' ? true : m[2] === 'ignored' ? null : false;
      line(ok, m[1].replace(/::/g, ' › '), now - last);
      report({ name: m[1], ok, ms: now - last });
      last = now;
    }
    if (/^error(\[|:)/.test(text)) { line(false, 'cargo build', Date.now() - started, text); report({ name: 'cargo build', ok: false, ms: Date.now() - started, error: text }); }
  });
  if (code !== 0) report({ name: 'cargo test exit', ok: false, ms: 0, error: `exit ${code}` });
}

async function runWeb(report) {
  const out = path.join(root, 'test-results', 'gui');
  fs.mkdirSync(out, { recursive: true });
  let last = Date.now();
  const code = await spawnLines(process.execPath, [path.join(root, 'scripts', 'smoke-web.mjs'), '--out', out, '--steps', path.join(root, 'test', 'e2e', 'gui.steps.json'), '--width', '1500', '--height', '950'], { cwd: root }, (raw) => {
    const text = raw.trim();
    const now = Date.now();
    if (/^✘/.test(text)) {
      const [name, ...rest] = text.replace(/^✘\s*/, '').split(': ');
      line(false, name, now - last, rest.join(': '));
      report({ name, ok: false, ms: now - last, error: text });
    } else if (/ → /.test(text)) {
      const [name, value] = text.split(' → ');
      line(true, `${name} ${c.gray(`→ ${value}`)}`, now - last);
      report({ name, ok: true, ms: now - last, value });
    } else if (/^📷/.test(text)) {
      const file = path.basename(text.replace(/^📷\s*/, '').replace(/ \(\d+ ms\)$/, ''));
      line(true, `screenshot ${c.gray(file)}`, now - last);
      report({ name: `screenshot ${file}`, ok: true, ms: now - last });
    } else if (/^!/.test(text)) {
      line(false, 'page error', 0, text.replace(/^!\s*/, ''));
      report({ name: 'page error', ok: false, ms: 0, error: text });
    } else return;
    last = now;
  });
  if (code !== 0 && code !== 1) report({ name: 'smoke-web exit', ok: false, ms: 0, error: `exit ${code}` });
}

// ───────────────────────── run and summarise

const results = [];
const total = Date.now();
console.log(c.bold(`\nMyPhotoCut tests  ${c.gray(new Date().toLocaleString('en-GB'))}`));
for (const category of CATEGORIES.filter((x) => selected.includes(x.id))) {
  header(category);
  const entry = { id: category.id, title: category.title, tests: [], ms: 0 };
  const started = Date.now();
  try {
    await category.run((test) => entry.tests.push(test));
  } catch (error) {
    entry.tests.push({ name: 'runner', ok: false, ms: 0, error: String(error?.message ?? error) });
    line(false, 'runner', 0, String(error?.message ?? error));
  }
  entry.ms = Date.now() - started;
  results.push(entry);
}

const col = { name: 22, n: 9 };
const cell = (v, n, paintIt = (x) => x) => paintIt(String(v).padStart(n));
console.log(`\n${c.bold(' SUMMARY ')}`);
console.log(c.gray(`  ${'CATEGORY'.padEnd(col.name)}${'TOTAL'.padStart(col.n)}${'PASSED'.padStart(col.n)}${'FAILED'.padStart(col.n)}${'SKIPPED'.padStart(col.n)}${'TIME'.padStart(12)}   RESULT`));
console.log(c.gray(`  ${'─'.repeat(col.name + col.n * 4 + 12 + 10)}`));
let failed = 0;
let passed = 0;
let skipped = 0;
for (const r of results) {
  const p = r.tests.filter((x) => x.ok === true).length;
  const f = r.tests.filter((x) => x.ok === false).length;
  const s = r.tests.filter((x) => x.ok === null).length;
  passed += p; failed += f; skipped += s;
  const tint = CATEGORIES.find((x) => x.id === r.id)?.tint ?? ((x) => x);
  console.log(`  ${tint(r.title.padEnd(col.name))}${cell(r.tests.length, col.n)}${cell(p, col.n, c.green)}${cell(f, col.n, f ? c.red : c.gray)}${cell(s, col.n, s ? c.yellow : c.gray)}${cell(ms(r.ms), 12, c.gray)}   ${f ? c.onRed(' FAIL ') : c.onGreen(' PASS ')}`);
}
console.log(c.gray(`  ${'─'.repeat(col.name + col.n * 4 + 12 + 10)}`));
console.log(`  ${c.bold('All'.padEnd(col.name))}${cell(passed + failed + skipped, col.n, c.bold)}${cell(passed, col.n, c.green)}${cell(failed, col.n, failed ? c.red : c.gray)}${cell(skipped, col.n, skipped ? c.yellow : c.gray)}${cell(ms(Date.now() - total), 12, c.gray)}   ${failed ? c.onRed(' FAIL ') : c.onGreen(' PASS ')}`);
console.log(`\n  ${failed ? c.red(c.bold(`✘ ${failed} failed`)) : c.green(c.bold('✔ All tests passed'))}  ${c.gray('report: test-results/results.json')}\n`);
fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
fs.writeFileSync(path.join(root, 'test-results', 'results.json'), JSON.stringify({ at: new Date().toISOString(), passed, failed, skipped, results }, null, 2));
process.exit(failed ? 1 : 0);

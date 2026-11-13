// npm test — every check of TTS Multi OS, in English, coloured and aligned, with the time of
// each test, a live progress line and a summary table.
//
//   unit     Node: the TTS host over its protocol (real synthesis on a COPY of the installed
//            models), audio transport, themes, start board, icons, Markdown, docs, config
//   rust     cargo test (src-tauri)
//   web      the page in headless Edge (server.js): start screen, themes, menus, toolbar,
//            tabs, context menus, dialogs, settings, guide window …
//   desktop  the real Tauri program over CDP: synthesis, all speakers, tabs, saving, window,
//            guide window, host restart, quitting. Rebuilt first when sources changed.
//
// Options
//   --only unit,web    run some categories         --quick     unit + rust
//   --release          desktop: target/release (after npm run build:win), bundled Node only
//   --no-build         desktop: never rebuild the debug program
//   --grep <text>      only tests whose name contains <text>
//   --bail             stop at the first failure
// Env: TTS_TEST_APPDATA (a folder with TTSMultiOSV10/models — a copy), NO_COLOR, FORCE_COLOR.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as R from './lib/reporter.mjs';
import { ensureTestData } from './lib/testdata.mjs';
import { exePath, sourcesNewerThan } from './lib/desktop.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const option = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const ALL = ['unit', 'rust', 'web', 'desktop'];
let selected = argv.includes('--quick') ? ['unit', 'rust'] : (option('--only')?.split(',').map((s) => s.trim()).filter(Boolean) ?? ALL);
const unknown = selected.filter((s) => !ALL.includes(s));
if (unknown.length) { console.error(`Unknown category: ${unknown.join(', ')} (choose from ${ALL.join(', ')})`); process.exit(2); }
selected = ALL.filter((c) => selected.includes(c));
const grep = option('--grep')?.toLowerCase() ?? null;
const bail = argv.includes('--bail');
const release = argv.includes('--release');
const noBuild = argv.includes('--no-build');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
process.env = env;

const started = Date.now();
const testData = ensureTestData();
R.banner('TTS Multi OS — test run', [
  ['Date', new Date().toLocaleString('en-GB', { hour12: false })],
  ['Platform', `${os.type()} ${os.release()} (${process.platform}/${process.arch}), Node ${process.version}`],
  ['Categories', selected.join(', ') + (grep ? `  (grep "${grep}")` : '')],
  ['Voice data', testData.dir ? `${testData.models.join(', ')} — ${testData.source}: ${testData.dir}` : 'none — real synthesis tests are skipped'],
  ['Desktop', `${release ? 'release' : 'debug'} program${noBuild ? ', no rebuild' : ''}`],
]);

const results = [];
const failures = [];
let stopAll = false;

/** Runs one list of cases: [{ name, run(ctx), skip?, critical?, timeout? }]. */
async function runCases(name, description, list, ctx) {
  const stats = { pass: 0, fail: 0, skip: 0, ms: 0 };
  const t0 = Date.now();
  const shown = grep ? list.filter((c) => c.critical || c.name.toLowerCase().includes(grep)) : list;
  R.categoryHeader(name, description, shown.length);
  let blocked = null;
  for (const [i, test] of shown.entries()) {
    const index = i + 1;
    if (stopAll || blocked || test.skip) {
      const reason = test.skip || blocked || 'stopped after the first failure (--bail)';
      R.result(index, shown.length, name, test.name, 'skip', 0, reason);
      stats.skip += 1;
      continue;
    }
    const stop = R.running(index, shown.length, name, test.name);
    const t = Date.now();
    let status = 'pass';
    let detail = '';
    try {
      const value = await Promise.race([
        Promise.resolve().then(() => test.run(ctx)),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`timed out after ${R.formatTime(test.timeout ?? 60000).trim()}`)), test.timeout ?? 60000)),
      ]);
      if (value && typeof value === 'object' && value.skip) { status = 'skip'; detail = value.skip; }
    } catch (error) {
      status = 'fail';
      detail = error?.message || String(error);
      if (error?.generatedMessage === false || error?.actual !== undefined) {
        if (error.actual !== undefined && error.expected !== undefined && !detail.includes('expected')) detail += `\nactual:   ${JSON.stringify(error.actual)?.slice(0, 300)}\nexpected: ${JSON.stringify(error.expected)?.slice(0, 300)}`;
      }
    }
    stop();
    const ms = Date.now() - t;
    R.result(index, shown.length, name, test.name, status, ms, detail);
    stats[status] += 1;
    if (status === 'fail') {
      failures.push({ category: name, name: test.name, message: detail });
      if (test.critical) blocked = `needs "${test.name}", which failed`;
      if (bail) stopAll = true;
    }
  }
  stats.ms = Date.now() - t0;
  R.categoryFooter(stats);
  results.push({ name, stats });
}

/** A category from a module in test/: meta, cases(ctx), with ctx.defer for clean-up. */
async function runModule(file, extra = {}) {
  const mod = await import(new URL(`../test/${file}`, import.meta.url));
  const cleanups = [];
  const ctx = { testData, root, release, defer: (fn) => cleanups.push(fn), ...extra };
  try {
    const list = await mod.cases(ctx);
    await runCases(mod.meta.name, mod.meta.description, list, ctx);
  } finally {
    for (const fn of cleanups.reverse()) { try { await fn(); } catch { /* best effort */ } }
  }
}

/** cargo test: the first case builds and runs it (timed); then one line per Rust test, listed from the source. */
async function runRust() {
  const source = fs.readFileSync(path.join(root, 'src-tauri/src/lib.rs'), 'utf8');
  const names = [...source.matchAll(/#\[test\]\s*fn\s+(\w+)/g)].map((m) => m[1]);
  let outcome = null;
  const results = new Map();
  const run = () => new Promise((resolve) => {
    const child = spawn('cargo', ['test', '--manifest-path', 'src-tauri/Cargo.toml', '--color', 'never'], { cwd: root, env, shell: false });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('error', (error) => resolve({ code: -1, out: String(error) }));
    child.on('exit', (code) => resolve({ code, out }));
  });
  const cases = [{
    name: 'cargo: build and run the Rust tests',
    critical: true,
    timeout: 900000,
    run: async () => {
      outcome = await run();
      const lines = outcome.out.split(/\r?\n/);
      for (const line of lines) {
        const m = /^test (?:tests::)?(\w+) \.\.\. (ok|FAILED|ignored)/.exec(line);
        if (m) results.set(m[1], m[2]);
      }
      if (!results.size) throw new Error(lines.filter((l) => /^error/.test(l)).slice(0, 6).join('\n') || `cargo test exited ${outcome.code}`);
    },
  }, ...names.map((name) => ({
    name: `rust: ${name.replace(/_/g, ' ')}`,
    run: () => {
      const status = results.get(name);
      if (status === 'ignored') return { skip: 'ignored' };
      if (status === 'ok') return undefined;
      const lines = outcome.out.split(/\r?\n/);
      const at = lines.findIndex((l) => l.includes(`---- tests::${name}`));
      throw new Error(status ? (at >= 0 ? lines.slice(at + 1, at + 8).join('\n') : 'failed') : 'did not run');
    },
  }))];
  await runCases('rust', 'cargo test (src-tauri: paths, file names, audio targets)', cases, {});
}

/** The debug program, rebuilt when a source is newer than it. */
function desktopBuildCase() {
  const exe = exePath(release ? 'release' : 'debug');
  const stale = sourcesNewerThan(exe);
  if (release) return { name: 'desktop: release program is built', critical: true, run: () => { if (!fsExists(exe)) throw new Error('build it first: npm run build:win'); } };
  if (noBuild || !stale) return { name: `desktop: debug program is ${stale ? 'built (stale, --no-build)' : 'up to date'}`, critical: true, run: () => { if (!fsExists(exe)) throw new Error('build it first: npm run build:debug'); } };
  return {
    name: 'desktop: rebuild debug program (sources changed)',
    critical: true,
    timeout: 900000,
    run: () => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(root, 'scripts/build.mjs'), 'debug'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      child.stdout.on('data', (d) => { out += d; });
      child.stderr.on('data', (d) => { out += d; });
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(out.split(/\r?\n/).filter((l) => /error/i.test(l)).slice(0, 8).join('\n') || `exit ${code}`))));
    }),
  };
}
const fsExists = (p) => fs.existsSync(p);

for (const category of selected) {
  if (stopAll) break;
  if (category === 'unit') await runModule('unit.mjs');
  else if (category === 'rust') await runRust();
  else if (category === 'web') await runModule('web.mjs');
  else if (category === 'desktop') await runModule('desktop.mjs', { buildCase: desktopBuildCase() });
}

const total = R.summary(results, failures, Date.now() - started);
process.exit(total.fail ? 1 : 0);

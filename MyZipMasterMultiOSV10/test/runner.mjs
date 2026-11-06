// The colourful test runner, in the same shape as MyMeeting's. All its output is in English.
//
//   npm test               everything: unit, engine, web engine, web GUI, desktop GUI
//   node test/runner.mjs unit | engine | wasm | web | desktop     just that group, or several
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[38;5;203m', green: '\x1b[38;5;48m', yellow: '\x1b[38;5;220m', cyan: '\x1b[38;5;81m', blue: '\x1b[38;5;75m',
  magenta: '\x1b[38;5;177m', orange: '\x1b[38;5;214m', gray: '\x1b[38;5;245m', white: '\x1b[38;5;255m', pink: '\x1b[38;5;213m',
};
const SUITE_COLORS = [C.cyan, C.magenta, C.blue, C.orange, C.pink, C.green, C.yellow];
const paint = (text, color) => `${color}${text}${C.reset}`;

function dispWidth(s) {
  let w = 0;
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    const wide = (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf && c !== 0x303f) || (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xff00 && c <= 0xff60);
    w += wide ? 2 : 1;
  }
  return w;
}
const padEnd = (s, width) => s + ' '.repeat(Math.max(0, width - dispWidth(s)));
const padStart = (s, width) => ' '.repeat(Math.max(0, width - dispWidth(s))) + s;
function clip(s, width) {
  if (dispWidth(s) <= width) return s;
  let out = '';
  let w = 0;
  for (const ch of s) {
    const cw = dispWidth(ch);
    if (w + cw > width - 1) break;
    out += ch;
    w += cw;
  }
  return `${out}…`;
}
const fmtMs = (ms) => (ms == null ? '-' : ms < 1000 ? `${ms.toFixed(2)} ms` : `${(ms / 1000).toFixed(2)} s`);

// Where the run stands, shown on every line: this group's position, and overall.
const live = { done: 0, passed: 0, failed: 0, started: 0, timer: null, spin: 0 };
const isTty = !!process.stdout.isTTY;
const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';

const clearLive = () => {
  if (isTty) process.stdout.write('\r\x1b[2K');
};

// One line that keeps moving while a case runs, then gets replaced by its result.
function showRunning(position, name, t0) {
  if (!isTty) return;
  stopRunning();
  const paintIt = () => {
    live.spin = (live.spin + 1) % SPIN.length;
    const took = fmtMs(performance.now() - t0);
    const total = fmtMs(performance.now() - live.started);
    process.stdout.write(`\r\x1b[2K    ${paint(SPIN[live.spin], C.cyan)}  ${paint(position, C.gray)} ${paint(clip(name, 60), C.cyan)}  ${paint(took, C.yellow)}  ${paint(`✓${live.passed} ✗${live.failed} · ${total}`, C.gray)}`);
  };
  paintIt();
  live.timer = setInterval(paintIt, 120);
}

function stopRunning() {
  if (live.timer) clearInterval(live.timer);
  live.timer = null;
  clearLive();
}

function printCase(r, position = '') {
  stopRunning();
  live.done += 1;
  if (r.ok) live.passed += 1;
  else live.failed += 1;
  const mark = r.ok ? paint('✓', C.green) : paint('✗', C.red);
  const label = padEnd(clip(r.name, 70), 70);
  const pos = paint(padStart(position, 9), C.gray);
  console.log(`    ${mark}  ${pos}  ${r.ok ? paint(label, C.white) : paint(label, C.red)}  ${paint(padStart(fmtMs(r.ms), 10), timeColor(r.ms))}`);
  if (!r.ok) {
    const lines = String(r.error?.stack || r.error?.message || r.error).split('\n').slice(0, 14);
    for (const line of lines) console.log(`       ${paint(line.slice(0, 200), C.red)}`);
  }
}

// Fast is green, slow stands out.
function timeColor(ms) {
  if (ms == null) return C.gray;
  if (ms < 100) return C.green;
  if (ms < 1000) return C.yellow;
  if (ms < 5000) return C.orange;
  return C.pink;
}

// How many cases a group had last time: the "of how many" until the group has finished once.
const COUNTS = path.join(root, 'test-results', 'case-counts.json');
function loadCounts() {
  try { return JSON.parse(fs.readFileSync(COUNTS, 'utf8')); } catch { return {}; }
}
const counts = loadCounts();
function saveCounts() {
  fs.mkdirSync(path.dirname(COUNTS), { recursive: true });
  fs.writeFileSync(COUNTS, JSON.stringify(counts, null, 1));
}
const positionText = (n, total) => `${n}/${total ?? '?'}`;

function banner() {
  const bar = '━'.repeat(62);
  console.log('');
  console.log(paint(`  ${bar}`, C.magenta));
  console.log(`  ${paint('MyZipMaster', C.bold + C.white)}  ${paint('feature tests', C.pink)}`);
  console.log(`  ${paint('each case with its time; a live line shows what is running', C.gray)}`);
  console.log(paint(`  ${bar}`, C.magenta));
  console.log('');
}

function summary(suites, totalMs, slowest) {
  const nameW = Math.max(12, ...suites.map((s) => dispWidth(s.title)));
  const W = [nameW + 2, 8, 8, 8, 12, 12];
  const rule = (l, m, r) => `  ${paint(l + W.map((w) => '─'.repeat(w)).join(m) + r, C.magenta)}`;
  const bar = paint('│', C.magenta);
  const meter = (ratio, cells = 10) => paint('█'.repeat(Math.round(ratio * cells)), ratio === 1 ? C.green : C.orange) + paint('░'.repeat(cells - Math.round(ratio * cells)), C.gray);
  console.log('');
  console.log(`  ${paint('Test summary', C.bold + C.magenta)}`);
  console.log(rule('╭', '┬', '╮'));
  console.log(`  ${bar}${paint(` ${padEnd('Suite', nameW)} `, C.bold + C.cyan)}${bar}${paint(` ${padStart('Pass', 6)} `, C.bold + C.cyan)}${bar}${paint(` ${padStart('Fail', 6)} `, C.bold + C.cyan)}${bar}${paint(` ${padStart('Total', 6)} `, C.bold + C.cyan)}${bar}${paint(` ${padStart('Time', 10)} `, C.bold + C.cyan)}${bar}${paint(` ${padEnd('Pass rate', 10)} `, C.bold + C.cyan)}${bar}`);
  console.log(rule('├', '┼', '┤'));
  let passed = 0;
  let failed = 0;
  for (const s of suites) {
    passed += s.passed;
    failed += s.failed;
    const all = s.passed + s.failed;
    console.log(`  ${bar} ${paint(padEnd(s.title, nameW), s.color)} ${bar} ${paint(padStart(String(s.passed), 6), C.green)} ${bar} ${paint(padStart(String(s.failed), 6), s.failed ? C.red : C.gray)} ${bar} ${paint(padStart(String(all), 6), C.white)} ${bar} ${paint(padStart(fmtMs(s.ms), 10), timeColor(s.ms))} ${bar} ${meter(all ? s.passed / all : 1)} ${bar}`);
  }
  console.log(rule('├', '┼', '┤'));
  const all = passed + failed;
  const ratio = all ? passed / all : 1;
  console.log(`  ${bar} ${paint(padEnd('All', nameW), C.bold + C.white)} ${bar} ${paint(padStart(String(passed), 6), C.bold + C.green)} ${bar} ${paint(padStart(String(failed), 6), failed ? C.bold + C.red : C.gray)} ${bar} ${paint(padStart(String(all), 6), C.bold + C.white)} ${bar} ${paint(padStart(fmtMs(totalMs), 10), C.bold + C.yellow)} ${bar} ${meter(ratio)} ${bar}`);
  console.log(rule('╰', '┴', '╯'));
  if (slowest.length) {
    console.log('');
    console.log(`  ${paint('Slowest tests', C.bold + C.orange)}`);
    for (const r of [...slowest].sort((x, y) => y.ms - x.ms).slice(0, 5)) {
      console.log(`    ${paint(padStart(fmtMs(r.ms), 10), timeColor(r.ms))}  ${paint(clip(r.name, 70), C.gray)}`);
    }
  }
  const filled = Math.round(ratio * 40);
  const status = failed ? paint(' FAILED ', C.bold + C.red) : paint(' PASSED ', C.bold + C.green);
  console.log('');
  console.log(`  ${status}  ${paint('█'.repeat(filled), failed ? C.orange : C.green)}${paint('░'.repeat(40 - filled), C.gray)}  ${paint(`${(ratio * 100).toFixed(1)}%`, C.bold + C.white)}`);
  console.log(`  ${paint(`${passed} passed`, C.bold + C.green)}    ${paint(`${failed} failed`, failed ? C.bold + C.red : C.gray)}    ${paint(`${all} total`, C.white)}    ${paint(fmtMs(totalMs), C.bold + C.yellow)}`);
  console.log('');
  return failed;
}

function installDom() {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  const win = dom.window;
  globalThis.window = win;
  globalThis.document = win.document;
  globalThis.localStorage = win.localStorage;
  Object.defineProperty(globalThis, 'navigator', { value: win.navigator, configurable: true, writable: true });
}

// ── One group of `test(name, fn)` cases ───────────────────────────────────────────────────────

const allResults = [];

async function runGroup(title, color, body) {
  const started = performance.now();
  const results = [];
  console.log(`  ${paint('▸', color)} ${paint(title, C.bold + color)}`);
  const expected = counts[title];
  const test = async (name, fn) => {
    const n = results.length + 1;
    const position = positionText(n, expected);
    const t0 = performance.now();
    showRunning(position, name, t0);
    let row;
    try {
      await fn();
      row = { name, ok: true, ms: performance.now() - t0 };
    } catch (error) {
      row = { name, ok: false, ms: performance.now() - t0, error };
    }
    results.push(row);
    allResults.push(row);
    printCase(row, position);
  };
  try {
    await body(test);
  } catch (error) {
    const r = { name: 'suite run', ok: false, ms: performance.now() - started, error };
    results.push(r);
    printCase(r);
  }
  console.log('');
  counts[title] = results.length;
  const passed = results.filter((r) => r.ok).length;
  return { title, color, passed, failed: results.length - passed, ms: performance.now() - started };
}

// ── The engine: every Rust test run on its own, so each has its time and the count is known ───

function capture(cmd, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: root, env: { ...process.env, CARGO_TERM_COLOR: 'never' }, ...options });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => resolve({ code, out, err }));
  });
}

async function engineSuites(colorOf) {
  console.log(`  ${paint('▸', C.gray)} ${paint('building the engine tests (cargo test --no-run)', C.gray)}`);
  const built = await capture('cargo', ['test', '-p', 'zipmaster-core', '--no-run', '--message-format=json']);
  const binaries = [];
  for (const line of built.out.split(/\r?\n/)) {
    if (!line.startsWith('{')) continue;
    const m = JSON.parse(line);
    if (m.reason === 'compiler-artifact' && m.executable && m.profile?.test && m.target?.kind?.includes('test')) binaries.push({ name: m.target.name, exe: m.executable });
  }
  if (built.code !== 0 || !binaries.length) {
    console.log(paint(built.err.slice(-3000), C.red));
    return [{ title: 'Engine: build', color: C.red, passed: 0, failed: 1, ms: 0 }];
  }

  const suites = [];
  for (const bin of binaries) {
    const listed = await capture(bin.exe, ['--list', '--format=terse']);
    const names = listed.out.split(/\r?\n/).filter((l) => l.endsWith(': test')).map((l) => l.slice(0, -6));
    if (!names.length) continue;
    const title = `Engine: ${bin.name}`;
    const color = colorOf();
    const started = performance.now();
    console.log(`  ${paint('▸', color)} ${paint(title, C.bold + color)}`);
    let index = 0;
    let finished = 0;
    let passed = 0;
    let failed = 0;
    const running = new Set();
    let ticker = null;
    if (isTty) {
      ticker = setInterval(() => {
        live.spin = (live.spin + 1) % SPIN.length;
        const first = [...running][0] ?? '';
        process.stdout.write(`\r\x1b[2K    ${paint(SPIN[live.spin], C.cyan)}  ${paint(positionText(finished, names.length), C.gray)} ${paint(`${running.size} running: ${clip(first, 50)}`, C.cyan)}  ${paint(`✓${live.passed} ✗${live.failed} · ${fmtMs(performance.now() - live.started)}`, C.gray)}`);
      }, 120);
    }
    const worker = async () => {
      while (index < names.length) {
        const name = names[index];
        index += 1;
        running.add(name);
        const t0 = performance.now();
        const r = await capture(bin.exe, ['--exact', name, '--test-threads=1']);
        running.delete(name);
        finished += 1;
        const ok = r.code === 0;
        if (ok) passed += 1;
        else failed += 1;
        const row = { name, ok, ms: performance.now() - t0, error: ok ? null : (r.out.split('stdout ----')[1] ?? r.out + r.err).trim().slice(0, 1500) };
        allResults.push(row);
        clearLive();
        printCase(row, positionText(finished, names.length));
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    if (ticker) clearInterval(ticker);
    clearLive();
    console.log('');
    suites.push({ title, color, passed, failed, ms: performance.now() - started });
  }
  return suites;
}

// ── Main ──────────────────────────────────────────────────────────────────────────────────────

async function main() {
  banner();
  live.started = performance.now();
  const wanted = process.argv.slice(2);
  const want = (g) => !wanted.length || wanted.includes(g);
  const suites = [];
  const started = performance.now();
  let colorIndex = 0;
  const nextColor = () => SUITE_COLORS[colorIndex++ % SUITE_COLORS.length];

  if (want('unit')) {
    const server = await createServer({
      root,
      configFile: path.join(root, 'vite.config.js'),
      logLevel: 'silent',
      server: { middlewareMode: true, hmr: false },
      appType: 'custom',
      optimizeDeps: { noDiscovery: true, include: [] },
    });
    installDom();
    try {
      const dir = path.join(here, 'suites');
      for (const file of fs.readdirSync(dir).filter((n) => n.endsWith('.test.js')).sort()) {
        const color = nextColor();
        const mod = await server.ssrLoadModule(path.join(dir, file));
        suites.push(await runGroup(mod.title ?? file, color, mod.default));
      }
    } finally {
      await server.close();
    }
  }
  if (want('engine')) suites.push(...(await engineSuites(() => nextColor())));
  if (want('wasm')) {
    const mod = await import('./e2e/wasm.mjs');
    suites.push(await runGroup('Web engine (WebAssembly)', nextColor(), mod.default));
  }
  if (want('web')) {
    const mod = await import('./e2e/web.mjs');
    suites.push(await runGroup('Web interface (headless Edge)', nextColor(), mod.default));
  }
  if (want('desktop')) {
    const mod = await import('./e2e/desktop.mjs');
    suites.push(await runGroup('Desktop interface (real app)', nextColor(), mod.default));
  }

  saveCounts();
  const failed = summary(suites, performance.now() - started, allResults);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

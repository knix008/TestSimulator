// npm test — every MyMechanics test, by category and group, with times and a summary at the end.
//
//   npm test                     js · static · web
//   npm test -- --quick          js · static (no browser)
//   npm test -- --only web       just that category (comma separated: js,static,web,rust)
//   npm test -- --rust           also `cargo test --lib` in src-tauri
//
// js:     node:test unit tests (sketch solver, features on the OpenCASCADE kernel, samples, assemblies, drawings)
// static: packaging, icons, docs, UI texts in both languages
// web:    the app in headless Edge/Chrome with real mouse input (test/e2e/web.steps.json; screenshots in test-results/web)
// rust:   the Tauri backend's unit tests
//
// Output is English. Each category lists its groups (one per test file / step prefix); each test is one line:
//   status · name · time, in fixed columns. The summary repeats the groups with their counts and times.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const color = (process.stdout.isTTY || (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== '0')) && !process.env.NO_COLOR;
const paint = (code) => (s) => (color ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const c = { bold: paint('1'), green: paint('32'), red: paint('31'), cyan: paint('36'), gray: paint('90'), yellow: paint('33'), magenta: paint('35'), blue: paint('34') };
// 24-bit colours for the progress bar and group names (plain text when colour is off).
const rgb = (r, g, b) => (s) => (color ? `\x1b[38;2;${r};${g};${b}m${s}\x1b[0m` : String(s));
const lerp = (a, b, t) => Math.round(a + (b - a) * t);
/** A bar coloured from blue through cyan to green along its length; red once anything failed. */
const gradientBar = (filled, width, failed) => {
  let s = '';
  for (let i = 0; i < width; i++) {
    const t = i / Math.max(1, width - 1);
    const [r, g, b] = failed ? [lerp(255, 200, t), lerp(90, 40, t), lerp(90, 60, t)] : t < 0.5 ? [lerp(70, 40, t * 2), lerp(120, 200, t * 2), lerp(255, 230, t * 2)] : [lerp(40, 60, (t - 0.5) * 2), lerp(200, 210, (t - 0.5) * 2), lerp(230, 110, (t - 0.5) * 2)];
    s += i < filled ? rgb(r, g, b)('█') : rgb(70, 70, 80)('░');
  }
  return s;
};
const GROUP_COLOURS = [[255, 170, 60], [120, 200, 255], [200, 140, 255], [100, 220, 160], [255, 120, 170], [240, 220, 90], [130, 160, 255], [90, 210, 210]];
const groupColour = (name) => { let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return rgb(...GROUP_COLOURS[h % GROUP_COLOURS.length]); };
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const listArg = (name) => { const i = args.indexOf(`--${name}`); return i < 0 ? null : new Set(String(args[i + 1] ?? '').split(',').filter(Boolean)); };
let selected = ['js', 'static', 'web'];
if (args.includes('--quick')) selected = ['js', 'static'];
if (args.includes('--rust')) selected.push('rust');
const only = listArg('only');
if (only) selected = [...only];

// ── layout: every line has the same columns
const NAME_W = 84;
const fmtMs = (ms) => (ms == null ? '—' : ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`);
const fit = (s, w) => { s = String(s); return s.length > w ? `${s.slice(0, w - 1)}…` : s.padEnd(w); };
// Badges: black on green / white on red / black on yellow (the same 4 letters when colour is off, so columns hold).
const badge = (bg, fg, text) => (color ? `\x1b[${bg};${fg}m${text}\x1b[0m` : text);
const STATUS = { pass: () => badge(42, 30, 'PASS'), fail: () => badge(41, 97, 'FAIL'), skip: () => badge(43, 30, 'SKIP') };
const testLine = (t) => `    ${STATUS[t.status]()}  ${fit(t.name, NAME_W)} ${c.gray(fmtMs(t.ms).padStart(9))}`;

function run(cmd, cmdArgs, { cwd = root, onLine = null } = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(cmd, cmdArgs, { cwd, stdio: ['ignore', 'pipe', 'pipe'], shell: false, env: { ...process.env, FORCE_COLOR: '0' } });
    let out = '';
    let rest = '';
    const onData = (d) => {
      out += d;
      const lines = (rest + d).split(/\r?\n/);
      rest = lines.pop();
      for (const line of lines) if (line.trim()) onLine?.(line);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('close', (code) => { if (rest.trim()) onLine?.(rest); resolve({ code, out, ms: Date.now() - started }); });
  });
}

const results = [];

// ── live progress: how many tests ran (of how many last time), the newest one, elapsed time, failures so far.
// A terminal gets one line rewritten in place; a pipe or log gets a line every 10 % or 10 s.
let previous = [];
try { previous = JSON.parse(fs.readFileSync(path.join(root, 'test-results', 'results.json'), 'utf8')); } catch { /* first run */ }
const expectedFor = (id) => {
  const r = Array.isArray(previous) ? previous.find((x) => x.id === id) : null;
  return r?.groups ? r.groups.reduce((n, g) => n + g.pass + g.fail + g.skip, 0) : 0;
};
function webStepCount() {
  let n = 0;
  for (const f of fs.readdirSync(path.join(root, 'test/e2e')).filter((x) => x.endsWith('.steps.json'))) {
    try { n += JSON.parse(fs.readFileSync(path.join(root, 'test/e2e', f), 'utf8')).filter((s) => s.name).length; } catch { /* broken file: shown as a failure later */ }
  }
  return n;
}
function startProgress(id, tests) {
  const tty = Boolean(process.stdout.isTTY);
  const started = Date.now();
  const expected = id === 'web' ? webStepCount() : expectedFor(id);
  let lastStep = -1; let lastPrint = 0; let lastCount = -1; let frame = 0;
  const line = () => {
    const n = tests.length;
    const fails = tests.filter((t) => t.status === 'fail').length;
    const skips = tests.filter((t) => t.status === 'skip').length;
    const passes = n - fails - skips;
    const total = Math.max(expected, n);
    const pct = total ? Math.min(100, Math.floor((n / total) * 100)) : 0;
    const width = 28;
    const filled = Math.round((pct / 100) * width);
    const bar = total ? gradientBar(filled, width, fails > 0) : '';
    const last = tests.at(-1);
    const secs = (Date.now() - started) / 1000;
    const count = total ? `${c.bold(String(n).padStart(String(total).length))}${c.gray(`/${total}`)} ${c.bold((fails ? c.red : c.cyan)(`${pct}%`.padStart(4)))}` : `${c.bold(String(n))} done`;
    const elapsed = c.magenta(`${secs.toFixed(1)} s`.padStart(8));
    // Remaining time from the pace so far (once a few tests finished).
    const eta = total && n >= 3 && n < total ? c.gray(` ~${Math.max(1, Math.round((secs / n) * (total - n)))} s left`.padEnd(13)) : ' '.repeat(13);
    const tally = `${c.green(`✔ ${passes}`)}${fails ? `  ${c.red(`✖ ${fails}`)}` : ''}${skips ? `  ${c.yellow(`○ ${skips}`)}` : ''}`;
    const name = last ? `${groupColour(last.group)(last.group)} ${c.gray('›')} ${c.gray(fit(last.name, 46))}` : c.gray('starting…');
    const spin = (fails ? c.red : c.cyan)(SPINNER[frame++ % SPINNER.length]);
    return { text: `  ${spin} ${count} ${bar} ${elapsed}${eta} ${tally}  ${name}`, pct, n };
  };
  const tick = (final = false) => {
    const { text, pct, n } = line();
    if (tty) { process.stdout.write(`\r\x1b[2K${text}`); return; }
    const now = Date.now();
    const step = Math.floor(pct / 10);
    if (final || (n !== lastCount && (step > lastStep || now - lastPrint > 10000))) { console.log(text); lastStep = step; lastPrint = now; lastCount = n; }
  };
  tick();
  const timer = setInterval(tick, tty ? 200 : 1000);
  return () => { clearInterval(timer); if (tty) process.stdout.write('\r\x1b[2K'); else tick(true); };
}

/** Runs one category; `job` returns { tests: [{ group, name, status, ms, error }], ms, code, out }. */
async function category(id, title, job) {
  console.log(`\n${c.bold(rgb(90, 170, 255)(`■ ${title}`))}`);
  const live = [];
  const stop = startProgress(id, live);
  const r = await job(live);
  stop();
  const groups = new Map();
  for (const t of r.tests) { if (!groups.has(t.group)) groups.set(t.group, []); groups.get(t.group).push(t); }
  const summary = [];
  for (const [group, tests] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
    const g = { group, pass: 0, fail: 0, skip: 0, ms: 0 };
    for (const t of tests) { g[t.status]++; g.ms += t.ms ?? 0; }
    console.log(`  ${c.bold(groupColour(group)(`● ${group}`))} ${c.gray(`(${tests.length} ${tests.length === 1 ? 'test' : 'tests'}, ${fmtMs(g.ms)})`)}`);
    for (const t of tests) {
      console.log(testLine(t));
      if (t.status === 'fail' && t.error) for (const l of String(t.error).split('\n')) console.log(c.red(`          ${l}`));
    }
    summary.push(g);
  }
  // A crash with no failing test (a file that did not load, a browser that did not start): show the tail.
  if (r.code && !summary.some((g) => g.fail)) {
    summary.push({ group: '(runner)', pass: 0, fail: 1, skip: 0, ms: 0 });
    console.log(`  ${c.red('FAIL')}  the runner exited with code ${r.code}`);
    console.log(c.gray(r.out.slice(-3000)));
  }
  results.push({ id, title, ms: r.ms, groups: summary });
}

/** node:test files through scripts/test-reporter.mjs (one JSON line per test). */
async function nodeTests(dir, tests) {
  const files = fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.test.js')).map((f) => path.join(dir, f));
  const r = await run(process.execPath, ['--test', '--test-reporter=./scripts/test-reporter.mjs', ...files], {
    onLine: (line) => {
      if (!line.startsWith('{')) return;
      let e; try { e = JSON.parse(line); } catch { return; }
      const group = e.file.replace(/\.test\.js$/, '') || 'tests';
      tests.push({ group, name: e.suite ? `${e.suite} › ${e.name}` : e.name, status: e.skip ? 'skip' : e.ok ? 'pass' : 'fail', ms: e.ms, error: e.error });
    },
  });
  return { tests, ...r };
}

for (const id of selected) {
  if (id === 'js') {
    await category(id, 'JS unit tests (sketch, features, kernel, samples, assemblies, drawings)', (tests) => nodeTests('test/unit', tests));
  } else if (id === 'static') {
    await category(id, 'Static checks (packaging, icons, docs, translations)', (tests) => nodeTests('test/static', tests));
  } else if (id === 'web') {
    await category(id, 'E2E web (headless Edge, real mouse input)', async (tests) => {
      // Every test/e2e/*.steps.json, one browser session each (web.steps.json first).
      const stepFiles = fs.readdirSync(path.join(root, 'test/e2e')).filter((f) => f.endsWith('.steps.json')).sort((a, b) => (a === 'web.steps.json' ? -1 : b === 'web.steps.json' ? 1 : a.localeCompare(b)));
      const total = { code: 0, out: '', ms: 0 };
      for (const file of stepFiles) {
      // A browser that did not start ("page target not found", the app never loaded) is the machine, not the test:
      // that file runs once more, and only the second run counts.
      let r;
      for (let attempt = 0; attempt < 2; attempt++) {
      const start = tests.length;
      r = await run(process.execPath, ['scripts/smoke-web.mjs', '--out', `test-results/web/${file.replace(/\.steps\.json$/, '')}`, '--steps', `test/e2e/${file}`], {
        onLine: (line) => {
          const m = /^(✔|✘) (.*?)(?: \[(\d+) ms\])?$/.exec(line);
          if (m) {
            // "adv:thread" → group "adv", name "thread"; steps without a prefix are "app".
            const p = /^([a-z0-9-]+):\s*(.*)$/i.exec(m[2]);
            const [group, rest] = p ? [p[1], p[2]] : ['app', m[2]];
            const cut = m[1] === '✘' ? rest.indexOf(': ') : -1;
            const name = cut > 0 ? rest.slice(0, cut) : rest;
            tests.push({ group, name, status: m[1] === '✔' ? 'pass' : 'fail', ms: m[3] ? Number(m[3]) : null, error: cut > 0 ? rest.slice(cut + 2) : undefined });
          } else if (/^\s+! /.test(line) && !/warning:/.test(line) && tests.length) {
            // A page error or console error during a step fails that step (the runner exits with 1 for it).
            const last = tests[tests.length - 1];
            last.status = 'fail';
            last.error = `${last.error ? `${last.error}\n` : ''}${line.trim()}`;
          }
        },
      });
      const mine = tests.slice(start);
      const noStart = /page target not found/.test(r.out) || mine.some((t) => t.status === 'fail' && /^the app did not start/.test(t.name));
      if (!(r.code && noStart && attempt === 0)) break;
      tests.splice(start);
      }
      for (const t of tests) t.file ??= file;
      // Still a failure no step shows (a timed-out `until`, a browser that did not start): name the file.
      if (r.code && !tests.some((t) => t.status === 'fail' && t.file === file)) tests.push({ group: '(runner)', name: `${file} exited with code ${r.code}`, status: 'fail', ms: null, error: r.out.slice(-1500), file });
      total.code ||= r.code; total.out += r.out; total.ms += r.ms;
      }
      return { tests, ...total };
    });
  } else if (id === 'rust') {
    await category(id, 'Rust unit tests (cargo test --lib)', async (tests) => {
      const r = await run('cargo', ['test', '--lib'], {
        cwd: path.join(root, 'src-tauri'),
        onLine: (line) => {
          const m = /^test (\S+) \.\.\. (ok|FAILED|ignored)/.exec(line);
          if (m) {
            const parts = m[1].split('::');
            tests.push({ group: parts.length > 1 ? parts.slice(0, -1).join('::') : 'lib', name: parts.at(-1), status: m[2] === 'ok' ? 'pass' : m[2] === 'ignored' ? 'skip' : 'fail', ms: null });
          }
        },
      });
      return { tests, ...r };
    });
  }
}

// ── summary: the same columns for every category and group
const COL = 46;
const row = (label, g, ms, bold = false, colourLabel = null) => {
  const status = g.fail ? STATUS.fail() : STATUS.pass();
  const b = bold ? c.bold : (s) => s;
  const name = colourLabel ? colourLabel(fit(label, COL)) : b(fit(label, COL));
  const num = (v, paint) => (v ? b(paint(String(v).padStart(6))) : c.gray(String(v).padStart(6)));
  return `  ${status}  ${name} ${num(g.pass, c.green)} ${num(g.fail, c.red)} ${num(g.skip, c.yellow)} ${b(String(g.pass + g.fail + g.skip).padStart(6))} ${c.magenta(fmtMs(ms).padStart(10))}`;
};
console.log(`\n${c.bold(rgb(90, 170, 255)('■ Summary'))}`);
console.log(c.gray(`        ${'Category / group'.padEnd(COL)} ${'Passed'.padStart(6)} ${'Failed'.padStart(6)} ${'Skip'.padStart(6)} ${'Total'.padStart(6)} ${'Time'.padStart(10)}`));
console.log(c.gray(`        ${'─'.repeat(COL + 4 * 7 + 11)}`));
const total = { pass: 0, fail: 0, skip: 0 };
let totalMs = 0;
for (const r of results) {
  const sum = r.groups.reduce((a, g) => ({ pass: a.pass + g.pass, fail: a.fail + g.fail, skip: a.skip + g.skip }), { pass: 0, fail: 0, skip: 0 });
  console.log(row(r.title.replace(/ \(.*\)$/, ''), sum, r.ms, true));
  for (const g of r.groups) console.log(row(`  ${g.group}`, g, g.ms, false, groupColour(g.group)));
  for (const k of Object.keys(total)) total[k] += sum[k];
  totalMs += r.ms;
}
console.log(c.gray(`        ${'─'.repeat(COL + 4 * 7 + 11)}`));
console.log(row('Total', total, totalMs, true));
fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
fs.writeFileSync(path.join(root, 'test-results', 'results.json'), JSON.stringify(results, null, 2));
process.exit(total.fail ? 1 : 0);

// npm test — every test, with live progress and a summary table at the end:
//   js       node --test test/unit (domain, TensorFlow.js trainer, model export, PyTorch engine when a Python with torch exists)
//   rust     cargo test --lib (files, window state, Python detection and setup)
//   web      end-to-end checks of the web build in headless Edge / Chrome
//   desktop  end-to-end checks of the real program (debug build with the page embedded; rebuilt when sources changed)
// Options: --only js,rust,web,desktop · --quick (js + rust). Colours follow the terminal (NO_COLOR / FORCE_COLOR).
// Full logs: test-results/js.log, test-results/rust.log.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const onlyArg = args.find((a) => a.startsWith('--only'));
const PHASES = [
  { id: 'js', title: 'Unit tests', tool: 'node --test' },
  { id: 'rust', title: 'Rust tests', tool: 'cargo test --lib' },
  { id: 'web', title: 'Web end-to-end', tool: 'headless Edge / Chrome' },
  { id: 'desktop', title: 'Desktop end-to-end', tool: 'the real program' },
];
const only = onlyArg ? (onlyArg.includes('=') ? onlyArg.split('=')[1] : args[args.indexOf(onlyArg) + 1]).split(',') : args.includes('--quick') ? ['js', 'rust'] : PHASES.map((p) => p.id);
const phases = PHASES.filter((p) => only.includes(p.id));
fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });

// ───────────────────────── terminal

const tty = Boolean(process.stdout.isTTY);
const useColor = process.env.NO_COLOR ? false : process.env.FORCE_COLOR ? process.env.FORCE_COLOR !== '0' : tty;
const sgr = (code) => (text) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : String(text));
const c = {
  bold: sgr(1), dim: sgr(2), red: sgr(91), green: sgr(92), yellow: sgr(93), blue: sgr(94), magenta: sgr(95), cyan: sgr(96), gray: sgr(90),
  ok: sgr('1;92'), bad: sgr('1;91'), title: sgr('1;96'), badgeOk: sgr('1;30;102'), badgeBad: sgr('1;97;101'), badgeRun: sgr('1;30;106'),
};
const width = () => Math.max(72, Math.min(132, process.stdout.columns || 100));
/** Display width: Hangul / CJK count twice; ANSI colours not at all. */
const visible = (text) => [...String(text).replace(/\x1b\[[0-9;]*m/g, '')].reduce((sum, ch) => sum + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(ch) ? 2 : 1), 0);
const padEnd = (text, n) => `${text}${' '.repeat(Math.max(0, n - visible(text)))}`;
const padStart = (text, n) => `${' '.repeat(Math.max(0, n - visible(text)))}${text}`;
function fit(text, n) {
  if (visible(text) <= n) return padEnd(text, n);
  let out = '';
  for (const ch of text) { if (visible(out + ch) > n - 1) break; out += ch; }
  return padEnd(`${out}…`, n);
}
const seconds = (ms) => (ms >= 60000 ? `${Math.floor(ms / 60000)}m${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}s` : `${(ms / 1000).toFixed(1)}s`);
const timeColor = (ms) => (ms >= 30000 ? c.red : ms >= 5000 ? c.yellow : c.gray);

// A status line under the output (TTY only): spinner, phase, counts and time, redrawn while tests run.
const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const status = { text: null, frame: 0, timer: null };
function drawStatus() {
  if (!tty || status.text == null) return;
  process.stdout.write(`\r\x1b[2K${c.cyan(SPIN[status.frame++ % SPIN.length])} ${status.text()}`);
}
function clearStatus() { if (tty && status.text != null) process.stdout.write('\r\x1b[2K'); }
function out(line = '') { clearStatus(); process.stdout.write(`${line}\n`); drawStatus(); }
function startStatus(text) { status.text = text; if (tty) { status.timer = setInterval(drawStatus, 100); drawStatus(); } }
function stopStatus() { clearInterval(status.timer); clearStatus(); status.text = null; }

// ───────────────────────── one phase

const runStarted = Date.now();
const summary = [];

class Phase {
  constructor(def, index) {
    Object.assign(this, def, { index, pass: 0, fail: 0, skipped: 0, failures: [], started: Date.now(), note: '' });
  }

  header() {
    out();
    const badge = c.badgeRun(` ${this.index + 1}/${phases.length} `);
    const head = ` ${c.title(this.id.toUpperCase())} ${c.bold(this.title)} ${c.gray(`· ${this.tool}`)} `;
    out(`${badge}${head}${c.gray('─'.repeat(Math.max(2, width() - visible(badge + head))))}`);
    startStatus(() => `${c.bold(this.id)} ${c.gray('·')} ${c.green(`${this.pass} passed`)}${this.fail ? `  ${c.red(`${this.fail} failed`)}` : ''}${this.skipped ? `  ${c.yellow(`${this.skipped} skipped`)}` : ''}  ${c.gray(seconds(Date.now() - this.started))}${this.note ? `  ${c.dim(this.note)}` : ''}`);
  }

  /** One finished test: number, mark, name and time in fixed columns. */
  result({ name, ok, skip, ms, error }) {
    const n = this.pass + this.fail + this.skipped + 1;
    if (skip) this.skipped += 1; else if (ok) this.pass += 1; else { this.fail += 1; this.failures.push({ name, error }); }
    const mark = skip ? c.yellow('↷') : ok ? c.green('✔') : c.red('✖');
    const nameWidth = width() - 20;
    const label = skip ? c.yellow(fit(name, nameWidth)) : ok ? fit(name, nameWidth) : c.red(fit(name, nameWidth));
    out(`  ${c.gray(padStart(String(n), 4))} ${mark} ${label} ${timeColor(ms ?? 0)(padStart(ms == null ? '' : seconds(ms), 9))}`);
    if (!ok && !skip && error) for (const line of String(error).split(/\r?\n/).slice(0, 8)) out(`         ${c.red('│')} ${c.dim(line.slice(0, width() - 12))}`);
  }

  info(text) { if (text) out(`       ${c.blue('ℹ')} ${c.gray(text)}`); }

  finish(extra = {}) {
    stopStatus();
    Object.assign(this, extra);
    this.ms = Date.now() - this.started;
    const counts = [c.green(`${this.pass} passed`), this.fail ? c.red(`${this.fail} failed`) : c.gray('0 failed'), this.skipped ? c.yellow(`${this.skipped} skipped`) : null].filter(Boolean).join(c.gray(' · '));
    out(`  ${this.fail ? c.bad('✖') : c.ok('✔')} ${counts} ${c.gray(`· ${seconds(this.ms)}`)}${this.log ? c.gray(`  (${this.log})`) : ''}`);
    summary.push(this);
  }
}

/** Runs a command, handing every stdout / stderr line to `onLine`; resolves with the exit code. */
function stream(command, commandArgs, options, onLine) {
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    for (const [name, pipe] of [['stdout', child.stdout], ['stderr', child.stderr]]) readline.createInterface({ input: pipe, crlfDelay: Infinity }).on('line', (line) => onLine(line, name));
    child.on('error', (error) => { onLine(String(error.message), 'stderr'); resolve(-1); });
    child.on('close', (code) => resolve(code ?? -1));
  });
}

async function nodeTests(phase) {
  const files = fs.readdirSync(path.join(root, 'test', 'unit')).filter((f) => f.endsWith('.test.js')).map((f) => path.join('test', 'unit', f));
  phase.info(`${files.length} files: ${files.map((f) => path.basename(f, '.test.js')).join(', ')}`);
  const logFile = path.join(root, 'test-results', 'js.log');
  const reporter = pathToFileURL(path.join(root, 'scripts', 'test-events.mjs')).href;
  const stderr = [];
  const code = await stream(process.execPath, ['--test', '--test-concurrency=4', `--test-reporter=${reporter}`, '--test-reporter-destination=stdout', '--test-reporter=spec', `--test-reporter-destination=${logFile}`, ...files], { cwd: root }, (line, name) => {
    if (name === 'stderr') { stderr.push(line); return; }
    let event;
    try { event = JSON.parse(line); } catch { return; }
    phase.result({ name: event.name, ok: event.event !== 'fail', skip: event.event === 'skip', ms: event.ms, error: event.error });
  });
  // A crash before any test reported (a syntax error, a missing module) still counts as a failure.
  if (code !== 0 && phase.fail === 0) phase.result({ name: `node --test exited with ${code}`, ok: false, error: stderr.slice(-8).join('\n') || 'see test-results/js.log' });
  phase.finish({ log: 'test-results/js.log' });
}

async function rustTests(phase) {
  const lines = [];
  const failures = new Map();
  let current = null;
  phase.note = 'compiling…';
  const code = await stream('cargo', ['test', '--lib', '--color', 'never'], { cwd: path.join(root, 'src-tauri') }, (line) => {
    lines.push(line);
    const compiling = /^\s*(Compiling|Finished|Running)\s+(.*)$/.exec(line);
    if (compiling) { phase.note = `${compiling[1].toLowerCase()} ${compiling[2]}`.slice(0, 60); return; }
    const test = /^test (\S+) \.\.\. (ok|FAILED|ignored)/.exec(line);
    if (test) {
      phase.note = '';
      const [, name, result] = test;
      if (result === 'FAILED') failures.set(name, null);
      else phase.result({ name: name.replace(/::tests::/, ' › '), ok: true, skip: result === 'ignored' });
      return;
    }
    const block = /^---- (\S+) stdout ----$/.exec(line);
    if (block) { current = block[1]; failures.set(current, []); return; }
    if (current && failures.get(current)) {
      if (/^(failures:|----)/.test(line)) current = null;
      else if (line.trim()) failures.get(current).push(line);
    }
  });
  fs.writeFileSync(path.join(root, 'test-results', 'rust.log'), lines.join('\n'));
  for (const [name, detail] of failures) phase.result({ name: name.replace(/::tests::/, ' › '), ok: false, error: (detail ?? []).join('\n') });
  if (code !== 0 && failures.size === 0) phase.result({ name: `cargo test exited with ${code}`, ok: false, error: lines.filter((l) => /^error/.test(l)).slice(0, 8).join('\n') || 'see test-results/rust.log' });
  phase.finish({ log: 'test-results/rust.log' });
}

async function suite(phase, load) {
  try {
    const run = await load();
    await run({ log: (line) => phase.info(line.trim()), report: (r) => phase.result(r) });
  } catch (error) {
    phase.result({ name: `${phase.id} suite crashed`, ok: false, error: error.stack ?? String(error) });
  }
  phase.finish();
}

/** The newest modification time below a folder. */
function newest(dir) {
  let time = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'target', 'gen', 'dist'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    time = Math.max(time, entry.isDirectory() ? newest(full) : fs.statSync(full).mtimeMs);
  }
  return time;
}

async function desktopTests(phase) {
  const exe = path.join(root, 'src-tauri', 'target', 'debug', process.platform === 'win32' ? 'MyTrainer.exe' : 'MyTrainer');
  const sources = Math.max(newest(path.join(root, 'src')), newest(path.join(root, 'src-tauri', 'src')), newest(path.join(root, 'python')));
  if (!fs.existsSync(exe) || fs.statSync(exe).mtimeMs < sources) {
    phase.info('building the debug program (tauri build --debug --no-bundle)…');
    phase.note = 'building…';
    const tail = [];
    const code = await stream(process.execPath, [path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'), 'build', '--debug', '--no-bundle'], { cwd: root }, (line) => {
      const plain = line.replace(/\x1b\[[0-9;]*m/g, '');
      tail.push(plain); if (tail.length > 12) tail.shift();
      const step = /^\s*(Compiling|Finished|Built|vite|✓)\s*(.*)$/.exec(plain);
      if (step) phase.note = `${step[1]} ${step[2]}`.trim().slice(0, 60);
    });
    phase.note = '';
    if (code !== 0) { phase.result({ name: 'building the debug program', ok: false, error: tail.join('\n') }); phase.finish(); return; }
  }
  await suite(phase, async () => (await import('../test/e2e/desktop.suite.mjs')).runDesktopSuite);
}

// ───────────────────────── run

out(c.title(`╭${'─'.repeat(width() - 2)}╮`));
out(`${c.title('│')}${padEnd(`${c.bold(' MyTrainer · npm test ')}${c.gray(`· ${phases.map((p) => p.id).join(' → ')} · ${new Date().toLocaleString()}`)}`, width() - 2)}${c.title('│')}`);
out(c.title(`╰${'─'.repeat(width() - 2)}╯`));

const runners = {
  js: nodeTests,
  rust: rustTests,
  web: (phase) => suite(phase, async () => (await import('../test/e2e/web.suite.mjs')).runWebSuite),
  desktop: desktopTests,
};
for (const [index, def] of phases.entries()) {
  const phase = new Phase(def, index);
  phase.header();
  await runners[def.id](phase);
}

// ───────────────────────── summary

const totals = summary.reduce((t, s) => ({ pass: t.pass + s.pass, fail: t.fail + s.fail, skipped: t.skipped + s.skipped }), { pass: 0, fail: 0, skipped: 0 });
const wall = Date.now() - runStarted;
const COLS = [
  { head: 'Suite', w: 9, align: 'left' }, { head: 'Result', w: 8, align: 'left' }, { head: 'Passed', w: 7 }, { head: 'Failed', w: 7 },
  { head: 'Skipped', w: 7 }, { head: 'Total', w: 7 }, { head: 'Time', w: 9 }, { head: '', w: Math.max(6, Math.min(30, width() - 85)), align: 'left' },
];
const tableWidth = COLS.reduce((sum, col) => sum + col.w + 3, 1);
const cell = (text, col) => (col.align === 'left' ? padEnd(text, col.w) : padStart(text, col.w));
const row = (cells) => `  ${c.gray('│')} ${cells.map((text, i) => cell(text, COLS[i])).join(` ${c.gray('│')} `)} ${c.gray('│')}`;
const rule = (l, m, r) => c.gray(`  ${l}${COLS.map((col) => '─'.repeat(col.w + 2)).join(m)}${r}`);
const bar = (s) => {
  const w = COLS[7].w;
  const total = s.pass + s.fail + s.skipped;
  if (!total) return c.gray('·'.repeat(w));
  const g = Math.round((s.pass / total) * w);
  const y = Math.min(w - g, Math.round((s.skipped / total) * w));
  return `${c.green('█'.repeat(g))}${c.yellow('█'.repeat(y))}${c.red('█'.repeat(Math.max(0, w - g - y)))}`;
};
const line = (name, s, ms, strong = false) => {
  const b = strong ? c.bold : (t) => t;
  return row([
    b(name),
    s.fail ? c.bad('✖ FAIL') : c.ok('✔ PASS'),
    s.pass ? c.green(b(String(s.pass))) : c.gray('0'),
    s.fail ? c.red(b(String(s.fail))) : c.gray('0'),
    s.skipped ? c.yellow(String(s.skipped)) : c.gray('0'),
    b(String(s.pass + s.fail + s.skipped)),
    c.gray(seconds(ms)),
    bar(s),
  ]);
};

out();
out(c.title(`  ${'═'.repeat(5)} Summary ${'═'.repeat(Math.max(4, tableWidth - 14))}`));
out(rule('┌', '┬', '┐'));
out(row(COLS.map((col) => c.bold(col.head))));
out(rule('├', '┼', '┤'));
for (const s of summary) out(line(s.id, s, s.ms));
out(rule('├', '┼', '┤'));
out(line('Total', totals, wall, true));
out(rule('└', '┴', '┘'));

const failed = summary.flatMap((s) => s.failures.map((f) => ({ suite: s.id, ...f })));
if (failed.length) {
  out();
  out(c.bad(`  Failed tests (${failed.length})`));
  const suiteWidth = Math.max(...failed.map((f) => f.suite.length));
  for (const f of failed) {
    out(`  ${c.red('✖')} ${c.magenta(padEnd(f.suite, suiteWidth))}  ${c.red(f.name)}`);
    const first = String(f.error ?? '').split(/\r?\n/).find((l) => l.trim());
    if (first) out(`    ${' '.repeat(suiteWidth)}  ${c.dim(first.trim().slice(0, width() - suiteWidth - 8))}`);
  }
}
out();
out(failed.length
  ? `  ${c.badgeBad(' FAILED ')} ${c.bad(`${totals.fail} of ${totals.pass + totals.fail} tests failed`)} ${c.gray(`· ${seconds(wall)}`)}`
  : `  ${c.badgeOk(' PASSED ')} ${c.ok(`All ${totals.pass} tests passed`)}${totals.skipped ? c.yellow(` (${totals.skipped} skipped)`) : ''} ${c.gray(`· ${seconds(wall)}`)}`);
out();
process.exit(failed.length ? 1 : 0);

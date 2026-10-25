// npm test — every MySimulator test, by category, with a summary table at the end.
//
//   npm test                         js · engine · rust · wasm · web · desktop
//   npm test -- --only js,engine     just those
//   npm test -- --skip web           everything but those
//
// Categories
//   js      node:test over test/unit/*.test.js (pure frontend modules)
//   engine  cargo test in engine/sim-core (every node type, analytic validations)
//   rust    cargo test --lib in src-tauri (desktop shell, batch PNG writer)
//   wasm    npm run build:wasm + engine/wasm-smoke.mjs + every sample through the web engine
//   web     test/e2e/web.mjs — the web build driven in headless Edge/Chrome over CDP
//   desktop test/e2e/desktop.mjs — the real program (debug build) over WebView2 CDP, and --batch
// The output of every tool is re-laid out as aligned, coloured result lines (test/e2e/report.mjs) and kept
// English only. Results are also written to test-results/summary.json.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { c, color, english, heading, padEnd, padStart, resultLine, stripAnsi, formatTime } from '../test/e2e/report.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CATEGORIES = [
  { id: 'js', title: 'JS unit tests', cmd: [process.execPath, ['--test', '--test-reporter=spec', ...fs.readdirSync(path.join(root, 'test', 'unit')).filter((f) => f.endsWith('.test.js')).map((f) => path.join('test', 'unit', f))]], cwd: root },
  { id: 'engine', title: 'Rust engine (sim-core)', cmd: ['cargo', ['test', '--release', '--', '--test-threads=1']], cwd: path.join(root, 'engine', 'sim-core') },
  { id: 'rust', title: 'Rust desktop shell', cmd: ['cargo', ['test', '--lib', '--', '--test-threads=1']], cwd: path.join(root, 'src-tauri') },
  { id: 'wasm', title: 'WebAssembly engine', steps: [[process.execPath, ['engine/build-wasm.mjs']], [process.execPath, ['engine/wasm-smoke.mjs']], [process.execPath, ['scripts/check-samples.mjs']]], cwd: root },
  { id: 'web', title: 'E2E: web (headless browser)', cmd: [process.execPath, ['test/e2e/web.mjs']], cwd: root },
  { id: 'desktop', title: 'E2E: desktop (real app + batch)', cmd: [process.execPath, ['test/e2e/desktop.mjs']], cwd: root },
];

const args = process.argv.slice(2);
const listArg = (name) => {
  const i = args.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i < 0) return null;
  const value = args[i].includes('=') ? args[i].split('=')[1] : args[i + 1];
  return new Set(String(value ?? '').split(',').map((s) => s.trim()).filter(Boolean));
};
let selected = CATEGORIES.map((cat) => cat.id);
const only = listArg('only');
const skip = listArg('skip');
if (only) selected = selected.filter((id) => only.has(id));
if (skip) selected = selected.filter((id) => !skip.has(id));

// cargo test prints no per-test time on stable Rust: the tests run one at a time (--test-threads=1) and each one's time
// is the gap between its result line and the previous mark ("running N tests" or the previous result). The same mark
// times a step without its own clock (the wasm smoke test, from the start of its process).
let mark = performance.now();
// Failed and skipped tests of the running category, collected from the result lines for the overall summary.
let tally = { failed: [], skipped: 0 };
const note = (status, name) => { if (status === 'fail') tally.failed.push(name); if (status === 'skip') tally.skipped++; return status; };
const lap = () => { const now = performance.now(); const ms = now - mark; mark = now; return ms; };

/** One line of a tool's output, re-laid out: test results aligned and coloured, tool chatter dimmed, times on the line. */
function relayout(raw) {
  const line = english(stripAnsi(raw)).replace(/\s+$/, '');
  if (!line.trim()) return '';
  const lead = line.match(/^\s*/)[0].length;
  // Already laid out by report.mjs (the E2E suites): keep their colours.
  if (/^\s*(✔ PASS|✖ FAIL|○ SKIP)\b/.test(line) || /^\s*↳ /.test(line) || /^E2E\b/.test(line)) {
    const e2e = line.match(/^\s*(✖ FAIL|○ SKIP)\s+(.+?)\s{2,}\S*\s*\S*$/);
    if (e2e) note(e2e[1].startsWith('✖') ? 'fail' : 'skip', e2e[2].trim());
    return english(raw).replace(/\s+$/, '');
  }
  // node:test spec reporter: "✔ name (1.23ms)", "✖ name (1.23ms)", "﹣ name (…) # SKIP", "▶ suite".
  let m = line.match(/^\s*([✔✖﹣])\s+(.+?)\s+\(([\d.]+)ms\)(?:\s+#\s*\w+)?$/);
  if (m) return resultLine({ status: note(m[1] === '✔' ? 'pass' : m[1] === '✖' ? 'fail' : 'skip', m[2]), name: m[2], ms: Number(m[3]), indent: 2 + lead });
  m = line.match(/^\s*▶\s+(.+)$/);
  if (m) return `${' '.repeat(2 + lead)}${c.bold(c.blue(`▶ ${m[1]}`))}`;
  m = line.match(/^\s*ℹ\s+(\w+)\s+([\d.]+)$/);
  if (m) {
    const value = m[1] === 'fail' && Number(m[2]) > 0 ? c.red(m[2]) : m[1] === 'pass' ? c.green(m[2]) : m[2];
    return `  ${c.dim('ℹ')} ${padEnd(c.dim(m[1]), 14)} ${value}`;
  }
  // cargo test: "test module::name ... ok", "test result: ok. 57 passed; 0 failed; …", "running 57 tests".
  m = line.match(/^test (\S+) \.\.\. (ok|FAILED|ignored)\b/);
  if (m) return resultLine({ status: note(m[2] === 'ok' ? 'pass' : m[2] === 'FAILED' ? 'fail' : 'skip', m[1].replace(/::/g, ' › ')), name: m[1].replace(/::/g, ' › '), ms: lap() });
  m = line.match(/^test result: (ok|FAILED)\. (\d+) passed; (\d+) failed(.*)$/);
  if (m) return `  ${m[1] === 'ok' ? c.green('■') : c.red('■')} ${c.bold('result')}  ${c.green(`${m[2]} passed`)}  ${Number(m[3]) ? c.red(`${m[3]} failed`) : c.dim(`${m[3]} failed`)}${c.dim(m[4])}`;
  m = line.match(/^running (\d+) tests?$/);
  if (m) { lap(); return `  ${c.dim(`running ${m[1]} test${m[1] === '1' ? '' : 's'}`)}`; }
  if (/^\s*(Compiling|Finished|Running|Doc-tests|Blocking|Updating|Downloaded|Downloading|Building|warning: unused)/.test(line)) return `  ${c.dim(line.trim())}`;
  // engine/wasm-smoke.mjs and build-wasm.mjs.
  if (/^sim\.wasm OK:/.test(line)) return resultLine({ status: 'pass', name: line.replace(/^sim\.wasm OK:\s*/, 'sim.wasm runs a pipeline: '), ms: lap() });
  if (/^sim\.wasm →/.test(line)) return `  ${c.dim(line)}`;
  return english(`  ${raw.replace(/\s+$/, '')}`);
}

function exec(command, commandArgs, cwd) {
  return new Promise((resolve) => {
    const started = performance.now();
    mark = started;
    const child = spawn(command, commandArgs, { cwd, shell: process.platform === 'win32' && command === 'cargo', env: { ...process.env, FORCE_COLOR: color ? '1' : '0', LANG: 'en_US.UTF-8' } });
    let output = '';
    let pending = '';
    const forward = (chunk) => {
      const text = chunk.toString();
      output += text;
      const lines = (pending + text).split(/\r?\n/);
      pending = lines.pop();
      for (const l of lines) { const out = relayout(l); if (out) process.stdout.write(`${out}\n`); }
    };
    child.stdout.on('data', forward);
    child.stderr.on('data', forward);
    child.on('close', (code) => {
      if (pending) { const out = relayout(pending); if (out) process.stdout.write(`${out}\n`); }
      resolve({ code, output, ms: performance.now() - started });
    });
    child.on('error', (error) => resolve({ code: 1, output: String(error), ms: performance.now() - started }));
  });
}

/** Test counts from the output of node:test, cargo test or the e2e suite. */
function counts(output) {
  const plain = stripAnsi(output);
  let pass = 0;
  let fail = 0;
  for (const m of plain.matchAll(/test result: \w+\. (\d+) passed; (\d+) failed/g)) { pass += Number(m[1]); fail += Number(m[2]); }
  const node = plain.match(/ℹ pass (\d+)[\s\S]*?ℹ fail (\d+)/) ?? plain.match(/# pass (\d+)[\s\S]*?# fail (\d+)/);
  if (node) { pass += Number(node[1]); fail += Number(node[2]); }
  const e2e = plain.match(/E2E: (\d+) passed, (\d+) failed/);
  if (e2e) { pass += Number(e2e[1]); fail += Number(e2e[2]); }
  if (!pass && !fail && /sim\.wasm OK:/.test(plain)) pass = 1;
  return { pass, fail };
}

const chosen = CATEGORIES.filter((x) => selected.includes(x.id));
const results = [];
const startedAt = new Date();
const runStarted = performance.now();
for (const [index, cat] of chosen.entries()) {
  console.log(`\n${heading(`[${index + 1}/${chosen.length}] ${cat.title}`, c.dim(`(${cat.id})`))}`);
  let total = { code: 0, output: '', ms: 0 };
  tally = { failed: [], skipped: 0 };
  for (const [command, commandArgs] of cat.steps ?? [cat.cmd]) {
    const r = await exec(command, commandArgs, cat.cwd);
    total = { code: total.code || r.code, output: total.output + r.output, ms: total.ms + r.ms };
    if (r.code) break;
  }
  const n = counts(total.output);
  const ok = total.code === 0;
  // The E2E suites cut long names on their result lines; their results.json has them whole.
  if (cat.id === 'web' || cat.id === 'desktop') {
    try {
      const list = JSON.parse(fs.readFileSync(path.join(root, 'test-results', cat.id, 'results.json'), 'utf8'));
      if (Array.isArray(list)) tally.failed = list.filter((r) => !r.ok).map((r) => english(r.name));
    } catch { /* no results file: keep the names from the output */ }
  }
  results.push({ id: cat.id, title: cat.title, ok, ...n, skipped: tally.skipped, failedTests: tally.failed, seconds: Math.round(total.ms / 100) / 10 });
  console.log(`  ${ok ? c.onGreen(' PASS ') : c.onRed(' FAIL ')} ${c.bold(cat.title)}  ${c.green(`${n.pass} passed`)}  ${n.fail ? c.red(`${n.fail} failed`) : c.dim('0 failed')}  ${c.dim(formatTime(total.ms))}`);
}

// Summary table: every column at a fixed width (colour codes do not count).
const W = { name: Math.max(34, ...results.map((r) => r.title.length)), id: 10, num: 8, time: 10 };
const ruleWidth = W.name + W.id + 2 * W.num + W.time + 14;
console.log(`\n${heading('Summary')}`);
console.log(`  ${c.bold(padEnd('Category', W.name))}  ${c.bold(padEnd('Id', W.id))}${c.bold(padStart('Passed', W.num))}${c.bold(padStart('Failed', W.num))}${c.bold(padStart('Time', W.time))}   ${c.bold('Result')}`);
console.log(`  ${c.dim('─'.repeat(ruleWidth))}`);
let sumPass = 0;
let sumFail = 0;
let sumTime = 0;
for (const r of results) {
  sumPass += r.pass;
  sumFail += r.fail;
  sumTime += r.seconds;
  const passed = padStart(String(r.pass), W.num);
  const failed = padStart(String(r.fail), W.num);
  console.log(`  ${padEnd(r.title, W.name)}  ${c.dim(padEnd(r.id, W.id))}${c.green(passed)}${r.fail ? c.red(failed) : c.dim(failed)}${c.dim(padStart(formatTime(r.seconds * 1000), W.time))}   ${r.ok ? c.green('✔ PASS') : c.red('✖ FAIL')}`);
}
console.log(`  ${c.dim('─'.repeat(ruleWidth))}`);
const allOk = results.every((r) => r.ok);
console.log(`  ${c.bold(padEnd('Total', W.name))}  ${padEnd('', W.id)}${c.bold(c.green(padStart(String(sumPass), W.num)))}${sumFail ? c.bold(c.red(padStart(String(sumFail), W.num))) : c.dim(padStart('0', W.num))}${c.dim(padStart(formatTime(sumTime * 1000), W.time))}   ${allOk ? c.onGreen(' ALL PASSED ') : c.onRed(` ${results.filter((r) => !r.ok).length} OF ${results.length} CATEGORIES FAILED `)}`);

// Overall summary: when, how long, where, and every failed test by name.
const passedCategories = results.filter((r) => r.ok).length;
const skipped = results.reduce((s, r) => s + r.skipped, 0);
const failedTests = results.flatMap((r) => r.failedTests.map((name) => `${r.title} › ${name}`));
const stamp = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${d.toTimeString().slice(0, 8)}`;
const field = (label, value) => console.log(`  ${c.dim(padEnd(label, 14))}${value}`);
console.log(`\n${heading('Overall')}`);
field('Started', stamp(startedAt));
field('Finished', stamp(new Date()));
field('Duration', formatTime(performance.now() - runStarted));
field('Machine', `${os.platform()} ${os.arch()} · Node ${process.version} · ${os.cpus().length} CPUs`);
field('Categories', `${passedCategories === results.length ? c.green(`${passedCategories} of ${results.length} passed`) : c.red(`${passedCategories} of ${results.length} passed`)}  ${c.dim(results.map((r) => r.id).join(' · '))}`);
field('Tests', `${c.green(`${sumPass} passed`)} · ${sumFail ? c.red(`${sumFail} failed`) : c.dim('0 failed')} · ${skipped ? c.yellow(`${skipped} skipped`) : c.dim('0 skipped')} · ${sumPass + sumFail + skipped} in all`);
if (failedTests.length) {
  field('Failed tests', c.red(failedTests[0]));
  for (const name of failedTests.slice(1)) field('', c.red(name));
}
field('Result', allOk ? c.onGreen(' ALL PASSED ') : c.onRed(' FAILED '));
field('Report', 'test-results/summary.json');
fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
fs.writeFileSync(path.join(root, 'test-results', 'summary.json'), JSON.stringify({ date: startedAt.toISOString(), seconds: Math.round((performance.now() - runStarted) / 100) / 10, passed: sumPass, failed: sumFail, skipped, failedTests, results }, null, 2));
process.exit(allOk ? 0 : 1);

// npm test — every check of MyProductionFlow, by group:
//   unit    node:test on the simulation engine, model, expressions, samples, texts
//   static  packaging: icons, file type, Tauri config, docs
//   web     the real app in headless Edge / Chrome (test/e2e/web.suite.mjs)
// Options: --only <group>[,<group>], --case <text> (web cases whose name contains it), --no-gpu.
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const only = opt('--only')?.split(',') ?? null;
const caseFilter = opt('--case');
// Colours on by default (VS Code, Windows Terminal, CI logs all show them); NO_COLOR=1 turns them off.
const useColor = !process.env.NO_COLOR;
const color = useColor ? (code) => (s) => `\x1b[${code}m${s}\x1b[0m` : () => (s) => s;
const c = { green: color(32), red: color(31), dim: color(2), bold: color(1), cyan: color(36), yellow: color(33), magenta: color(35), blue: color(34), gray: color(90) };
const GROUP_COLOR = { unit: c.cyan, static: c.magenta, web: c.blue, desktop: c.yellow };
const WIDTH = Math.max(70, Math.min(process.stdout.columns || 110, 140));

const results = [];
const counters = {};
/** One line per check, lined up: status · group counter · name · time. */
const recordResult = (group, name, ok, ms, detail = '') => {
  results.push({ group, name, ok, ms, detail });
  const n = (counters[group] = (counters[group] ?? 0) + 1);
  const time = ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
  const room = WIDTH - 22;
  const label = name.length > room ? `${name.slice(0, room - 1)}…` : name.padEnd(room);
  const tint = ms > 5000 ? c.yellow : c.gray;
  console.log(`  ${ok ? c.green('✔ PASS') : c.red('✘ FAIL')} ${c.gray(String(n).padStart(4))}  ${ok ? label : c.red(label)} ${tint(time.padStart(8))}`);
  if (!ok) console.log(c.red(String(detail).split('\n').filter(Boolean).slice(0, 6).map((l) => `             │ ${l}`).join('\n')));
};

const record = (...a) => recordResult(...a);
/** node --test with the TAP reporter, read line by line so every check shows as soon as it finishes. */
function nodeTests(group, files) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const child = spawn(process.execPath, ['--test', '--test-reporter=tap', ...files], { cwd: root });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d; });
    const lines = [];
    let pending = null; // a finished top-level test waiting for its YAML block (duration, error)
    const flush = () => {
      if (!pending) return;
      const block = pending.block.join('\n');
      const ms = Number(/duration_ms: ([\d.]+)/.exec(block)?.[1] ?? 0);
      record(group, pending.name, pending.ok, ms, pending.ok ? '' : block);
      pending = null;
    };
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      lines.push(line);
      const m = /^(\s*)(ok|not ok) \d+ - (.*)$/.exec(line);
      if (m && !m[1].length) { flush(); pending = { name: m[3], ok: m[2] === 'ok', block: [] }; return; }
      if (pending && /^\s/.test(line)) { pending.block.push(line); if (/^\s*\.\.\.$/.test(line)) flush(); return; }
      flush();
    });
    child.on('close', (status) => {
      flush();
      if (!results.some((x) => x.group === group)) record(group, 'node --test', status === 0, performance.now() - t0, stderr || lines.slice(-40).join('\n'));
      resolve();
    });
  });
}

/** The E2E cases in the web app or (desktop) in the debug build's real window. */
async function e2e(group) {
  const { CASES, DESKTOP_CASES } = await import(pathToFileURL(path.join(root, 'test/e2e/web.suite.mjs')).href);
  let app;
  if (group === 'desktop') {
    const { DesktopApp } = await import(pathToFileURL(path.join(root, 'test/e2e/harness.mjs')).href);
    app = new DesktopApp();
  } else {
    const { WebApp } = await import(pathToFileURL(path.join(root, 'test/e2e/web.harness.mjs')).href);
    app = new WebApp({ gpu: !args.includes('--no-gpu') });
  }
  const record = (g, ...rest) => recordResult(group, ...rest);
  try {
    const skipped = await app.start();
    if (skipped?.skipped) { console.log(`  ${c.yellow('–')} ${skipped.skipped}`); return; }
    for (const [name, body, timeout] of CASES) {
      if (group === 'desktop' && !DESKTOP_CASES.some((d) => name.startsWith(d))) continue;
      if (caseFilter && !name.includes(caseFilter)) continue;
      const t0 = performance.now();
      try {
        await app.run(body, timeout ?? 60000);
        const errors = app.takeErrors();
        record(group, name, errors.length === 0, performance.now() - t0, errors.join('\n'));
      } catch (error) {
        record(group, name, false, performance.now() - t0, `${error.message}\n${app.takeErrors().join('\n')}`);
        await app.recover();
      }
    }
  } catch (error) {
    record(group, 'start the app', false, 0, error.stack ?? error.message);
  } finally {
    await app.stop();
  }
}

const GROUPS = [
  ['unit', 'Engine, model, expressions, samples, reports, texts', () => nodeTests('unit', fs.readdirSync(path.join(root, 'test/unit')).filter((f) => f.endsWith('.test.js')).map((f) => `test/unit/${f}`))],
  ['static', 'Packaging, file type, documents', () => nodeTests('static', fs.readdirSync(path.join(root, 'test/static')).filter((f) => f.endsWith('.test.js')).map((f) => `test/static/${f}`))],
  ['web', 'The app in a headless browser', () => e2e('web')],
  ['desktop', 'The desktop build (src-tauri/target/debug) in its own window, opt-in: --only desktop', () => e2e('desktop'), true],
];

const started = performance.now();
const groupTimes = {};
const rule = (ch = '─') => c.gray(ch.repeat(WIDTH - 2));
console.log(c.bold(`\n MyProductionFlow tests`) + c.gray(`  ·  ${new Date().toLocaleString('en-GB')}`));
for (const [id, title, run, optIn] of GROUPS) {
  if (only ? !only.includes(id) : optIn) continue;
  const tint = GROUP_COLOR[id] ?? c.cyan;
  console.log(`\n${rule()}\n ${c.bold(tint(`▶ ${id.toUpperCase()}`))}  ${c.gray(title)}\n${rule()}`);
  const t0 = performance.now();
  await run();
  groupTimes[id] = performance.now() - t0;
  const rs = results.filter((x) => x.group === id); const bad = rs.filter((x) => !x.ok).length;
  console.log(c.gray(`  └─ ${id}: `) + (bad ? c.red(`${bad} failed`) : c.green(`${rs.length} passed`)) + c.gray(` in ${(groupTimes[id] / 1000).toFixed(1)} s`));
}
const failed = results.filter((r) => !r.ok);
// Summary: one row per group with a bar of its share of passes.
console.log(`\n${rule('═')}\n ${c.bold('SUMMARY')}\n${rule('═')}`);
console.log(c.gray(`  ${'Group'.padEnd(10)}${'Passed'.padStart(8)}${'Failed'.padStart(8)}${'Total'.padStart(8)}${'Time'.padStart(10)}   Result`));
for (const [id] of GROUPS) {
  const rs = results.filter((r) => r.group === id);
  if (!rs.length) continue;
  const bad = rs.filter((r) => !r.ok).length; const good = rs.length - bad;
  const bar = '█'.repeat(Math.round((good / rs.length) * 20)).padEnd(20, '░');
  const tint = GROUP_COLOR[id] ?? c.cyan;
  console.log(`  ${tint(id.padEnd(10))}${c.green(String(good).padStart(8))}${(bad ? c.red : c.gray)(String(bad).padStart(8))}${String(rs.length).padStart(8)}${c.gray(`${(groupTimes[id] / 1000).toFixed(1)} s`.padStart(10))}   ${bad ? c.red(bar) : c.green(bar)} ${bad ? c.red('✘') : c.green('✔')}`);
}
if (failed.length) {
  console.log(`\n ${c.bold(c.red('Failed checks'))}`);
  for (const f of failed) console.log(`  ${c.red('✘')} ${c.gray(f.group.padEnd(8))} ${f.name}`);
}
console.log(`\n ${failed.length ? c.bold(c.red(`✘ ${failed.length} FAILED`)) : c.bold(c.green('✔ ALL PASSED'))}${c.gray(`  ·  ${results.length} checks  ·  ${((performance.now() - started) / 1000).toFixed(1)} s`)}\n`);
fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
fs.writeFileSync(path.join(root, 'test-results', 'results.json'), JSON.stringify(results, null, 1));
process.exit(failed.length ? 1 : 0);

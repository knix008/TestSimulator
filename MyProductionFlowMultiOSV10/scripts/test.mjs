// npm test — every check of MyProductionFlow, by group:
//   unit    node:test on the simulation engine, model, expressions, samples, texts
//   static  packaging: icons, file type, Tauri config, docs
//   web     the real app in headless Edge / Chrome (test/e2e/web.suite.mjs)
// Options: --only <group>[,<group>], --case <text> (web cases whose name contains it), --no-gpu.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const only = opt('--only')?.split(',') ?? null;
const caseFilter = opt('--case');
const color = process.stdout.isTTY ? (code) => (s) => `\x1b[${code}m${s}\x1b[0m` : () => (s) => s;
const c = { green: color(32), red: color(31), dim: color(2), bold: color(1), cyan: color(36), yellow: color(33) };

const results = [];
const recordResult = (group, name, ok, ms, detail = '') => {
  results.push({ group, name, ok, ms, detail });
  console.log(`  ${ok ? c.green('✔') : c.red('✘')} ${name} ${c.dim(`(${Math.round(ms)} ms)`)}${ok ? '' : `\n      ${c.red(String(detail).split('\n').slice(0, 6).join('\n      '))}`}`);
};

const record = (...a) => recordResult(...a);
function nodeTests(group, files) {
  const t0 = performance.now();
  const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const out = run.stdout ?? '';
  const lines = out.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)(ok|not ok) \d+ - (.*)$/.exec(lines[i]);
    if (!m || m[1].length) continue;
    const detail = m[2] === 'ok' ? '' : lines.slice(i + 1, i + 25).join('\n');
    const ms = Number(/duration_ms: ([\d.]+)/.exec(lines.slice(i + 1, i + 6).join('\n'))?.[1] ?? 0);
    record(group, m[3], m[2] === 'ok', ms, detail);
  }
  if (!results.some((r) => r.group === group)) record(group, 'node --test', run.status === 0, performance.now() - t0, run.stderr || out.slice(-2000));
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
  ['unit', 'Engine, model, expressions, samples, texts', () => nodeTests('unit', fs.readdirSync(path.join(root, 'test/unit')).filter((f) => f.endsWith('.test.js')).map((f) => `test/unit/${f}`))],
  ['static', 'Packaging, file type, documents', () => nodeTests('static', fs.readdirSync(path.join(root, 'test/static')).filter((f) => f.endsWith('.test.js')).map((f) => `test/static/${f}`))],
  ['web', 'The app in a headless browser', () => e2e('web')],
  ['desktop', 'The desktop build (src-tauri/target/debug) in its own window, opt-in: --only desktop', () => e2e('desktop'), true],
];

const started = performance.now();
for (const [id, title, run, optIn] of GROUPS) {
  if (only ? !only.includes(id) : optIn) continue;
  console.log(`\n${c.bold(c.cyan(`▶ ${id}`))} ${c.dim(title)}`);
  await run();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${c.bold('Summary')}`);
for (const [id] of GROUPS) {
  const rs = results.filter((r) => r.group === id);
  if (!rs.length) continue;
  const bad = rs.filter((r) => !r.ok).length;
  console.log(`  ${bad ? c.red('✘') : c.green('✔')} ${id.padEnd(7)} ${rs.length - bad}/${rs.length} passed`);
}
console.log(`\n${failed.length ? c.red(`${failed.length} failed`) : c.green('all passed')} · ${results.length} checks · ${((performance.now() - started) / 1000).toFixed(1)} s`);
fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
fs.writeFileSync(path.join(root, 'test-results', 'results.json'), JSON.stringify(results, null, 1));
process.exit(failed.length ? 1 : 0);

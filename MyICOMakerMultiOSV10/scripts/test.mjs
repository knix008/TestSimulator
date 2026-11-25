// npm test — every test of MyICOMaker, stage by stage, in English, with colours, aligned columns,
// progress numbers, times and a summary table by stage and category.
//
//   unit   model, shapes, icons, files, settings, texts, themes, grid, print and start layouts (node:test)
//   rust   the backend's own tests (cargo test)
//   build  the web bundle builds (vite build)
//   gui    the real desktop app, driven over the DevTools protocol (test/gui.mjs); the debug
//          program is rebuilt first so it always runs the current code
//
//   node scripts/test.mjs [--only unit,rust,build,gui] [--shots]
//
// The report (no colours) is saved to test-results/report.txt.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const onlyArg = args.includes('--only') ? args[args.indexOf('--only') + 1] : '';
const only = onlyArg ? onlyArg.split(',') : null;
const shots = args.includes('--shots');
const useColor = process.env.FORCE_COLOR !== undefined ? !['0', 'false', ''].includes(process.env.FORCE_COLOR) : process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (text) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : String(text));
const green = paint('32'); const red = paint('31'); const gray = paint('90'); const bold = paint('1'); const cyan = paint('36');
const magenta = paint('35'); const blue = paint('34'); const yellow = paint('33');
const log = [];
const out = (line = '') => { console.log(line); log.push(line.replace(/\x1b\[[0-9;]*m/g, '')); };
const ms = (n) => (n >= 60000 ? `${Math.floor(n / 60000)}m${String(Math.round((n % 60000) / 1000)).padStart(2, '0')}s` : n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.max(0, n).toFixed(n < 10 ? 1 : 0)}ms`);

// Column widths (characters). Names longer than NAME are cut with "…".
const W = { no: 4, result: 6, cat: 14, name: 64, time: 8, elapsed: 8 };
const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n));
const left = (s, n) => String(s).padEnd(n);
const right = (s, n) => String(s).padStart(n);

const STAGE_NAMES = { unit: 'Unit tests', rust: 'Backend (Rust)', build: 'Web bundle', gui: 'Desktop app (GUI)' };
const stages = [];
let current = null;
const runStart = Date.now();

function stage(name, detail, index, count) {
  current = { name, title: STAGE_NAMES[name], pass: 0, fail: 0, skip: 0, ms: 0, started: Date.now(), n: 0, cats: new Map(), failures: [] };
  stages.push(current);
  out('');
  const head = `━━ [${index}/${count}] ${current.title} — ${detail} `;
  out(bold(cyan(head + '━'.repeat(Math.max(4, 118 - head.length)))));
  out(gray(`  ${right('#', W.no)}  ${left('Result', W.result)}  ${left('Category', W.cat)}  ${left('Test', W.name)}  ${right('Time', W.time)}  ${right('Elapsed', W.elapsed)}`));
  return current;
}

/** The reason of a failure as one readable line: colour codes removed, headings such as
 *  "error during build:" skipped in favour of the line that says what went wrong. */
function oneLine(reason) {
  const lines = String(reason).replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const line = lines.find((l) => !/:$/.test(l) && !/^at /.test(l)) ?? lines[0] ?? '';
  return line.length > 200 ? `${line.slice(0, 199)}…` : line;
}

function result(s, category, name, ok, time, reason = '') {
  reason = oneLine(reason);
  s.n += 1;
  const cat = s.cats.get(category) ?? { pass: 0, fail: 0, skip: 0, ms: 0 };
  s.cats.set(category, cat);
  cat.ms += time || 0;
  const elapsed = ms(Date.now() - s.started);
  const cols = (mark, word, colour) => `  ${gray(right(s.n, W.no))}  ${colour(left(`${mark} ${word}`, W.result))}  ${blue(cut(category, W.cat))}  ${cut(name, W.name)}  ${gray(right(ms(time || 0), W.time))}  ${gray(right(elapsed, W.elapsed))}`;
  if (ok === null) { s.skip += 1; cat.skip += 1; out(cols('○', 'SKIP', gray) + gray(`  (${reason})`)); return; }
  if (ok) { s.pass += 1; cat.pass += 1; out(cols('✔', 'PASS', green)); return; }
  s.fail += 1; cat.fail += 1;
  s.failures.push({ category, name, reason });
  out(cols('✘', 'FAIL', red));
  out(`  ${' '.repeat(W.no + W.result + 4)}${red(`↳ ${String(reason).split('\n')[0]}`)}`);
}

function exec(command, commandArgs, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, { cwd: root, shell: false, ...opts });
    let text = '';
    child.stdout?.on('data', (d) => { text += d; opts.onData?.(String(d)); });
    child.stderr?.on('data', (d) => { text += d; });
    child.on('close', (code) => resolve({ code, text }));
    child.on('error', (err) => resolve({ code: -1, text: String(err) }));
  });
}
const bin = (...parts) => path.join(root, 'node_modules', ...parts);
const sentence = (s) => s.replace(/_/g, ' ');

async function unitStage(s) {
  const files = fs.readdirSync(path.join(root, 'test')).filter((f) => f.endsWith('.test.mjs')).sort().map((f) => path.join(root, 'test', f));
  for await (const event of run({ files, concurrency: false })) {
    if (event.type !== 'test:pass' && event.type !== 'test:fail') continue;
    if (event.data.details?.type === 'suite' || event.data.nesting > 0) continue;
    const category = path.basename(event.data.file ?? '').replace('.test.mjs', '');
    const err = event.data.details?.error;
    const reason = err ? String(err.cause?.message ?? err.message ?? err) : '';
    result(s, category, event.data.name, event.type === 'test:pass', event.data.details?.duration_ms ?? 0, reason);
  }
}

async function rustStage(s) {
  let pending = '';
  let last = Date.now();
  const { code, text } = await exec('cargo', ['test', '--manifest-path', path.join(root, 'src-tauri', 'Cargo.toml'), '--', '--test-threads=1'], {
    onData: (chunk) => {
      pending += chunk;
      const lines = pending.split('\n');
      pending = lines.pop();
      for (const line of lines) {
        // Compiling is not a test's time: the clock starts when cargo starts running the tests.
        if (/^running \d+ tests?/.test(line.trim())) { last = Date.now(); continue; }
        const m = /^test (\S+) \.\.\. (ok|FAILED|ignored)/.exec(line.trim());
        if (!m) continue;
        const parts = m[1].split('::').filter((p) => p !== 'tests');
        const now = Date.now();
        result(s, parts.length > 1 ? parts[0] : 'backend', sentence(parts[parts.length - 1]), m[2] === 'ignored' ? null : m[2] === 'ok', now - last, m[2] === 'ignored' ? 'ignored' : 'see the cargo output');
        last = now;
      }
    },
  });
  if (code !== 0 && !s.fail) result(s, 'cargo', 'cargo test', false, 0, text.split('\n').find((l) => /error/.test(l)) ?? `exit ${code}`);
}

async function buildStage(s) {
  const started = Date.now();
  const { code, text } = await exec(process.execPath, [bin('vite', 'bin', 'vite.js'), 'build', '--logLevel', 'warn']);
  result(s, 'vite', 'the web bundle builds', code === 0, Date.now() - started, text.split('\n').find((l) => l.trim()) ?? `exit ${code}`);
  const has = (file) => fs.existsSync(path.join(root, 'dist', file));
  result(s, 'dist', 'index.html, the icon and both user guides are in the bundle', has('index.html') && has('icon.png') && has('docs/UsersGuide.html') && has('docs/UsersGuide.en.html'), 0, 'missing files in dist/');
}

async function guiStage(s) {
  if (process.platform !== 'win32') {
    result(s, 'desktop', 'desktop app', null, 0, 'the webview DevTools port is a WebView2 (Windows) feature');
    return;
  }
  const started = Date.now();
  const target = path.join(root, 'src-tauri', 'target', 'e2e');
  const build = await exec(process.execPath, [bin('@tauri-apps', 'cli', 'tauri.js'), 'build', '--debug', '--no-bundle'], { env: { ...process.env, CARGO_TARGET_DIR: target } });
  const exe = path.join(target, 'debug', 'MyICOMaker.exe');
  result(s, 'build', 'build the debug program with the current code', build.code === 0 && fs.existsSync(exe), Date.now() - started, build.text.split('\n').find((l) => /error/i.test(l)) ?? `exit ${build.code}`);
  if (build.code !== 0) return;
  let pending = '';
  await exec(process.execPath, [path.join(root, 'test', 'gui.mjs'), exe, ...(shots ? ['--shots'] : [])], {
    onData: (chunk) => {
      pending += chunk;
      const lines = pending.split('\n');
      pending = lines.pop();
      for (const line of lines) {
        try {
          const r = JSON.parse(line);
          result(s, r.category ?? 'gui', r.name, r.ok, r.ms, r.error);
        } catch { /* not a result line */ }
      }
    },
  });
}

const ALL = [
  ['unit', 'node:test, test/*.test.mjs', unitStage],
  ['rust', 'cargo test, src-tauri', rustStage],
  ['build', 'vite build', buildStage],
  ['gui', 'real window over DevTools, test/gui.mjs', guiStage],
];
const chosen = ALL.filter(([name]) => !only || only.includes(name));
out(bold(magenta(`MyICOMaker test run — ${new Date().toLocaleString('en-GB')} — stages: ${chosen.map(([n]) => n).join(', ')}`)));
let index = 0;
for (const [name, detail, fn] of chosen) {
  index += 1;
  const s = stage(name, detail, index, chosen.length);
  await fn(s);
  s.ms = Date.now() - s.started;
  const status = s.fail ? red(`✘ ${s.fail} failed`) : green('✔ all passed');
  out(`  ${gray('─'.repeat(W.no + W.result + W.cat + W.name + W.time + W.elapsed + 10))}`);
  out(`  ${status}  ${green(`${s.pass} passed`)}  ${s.fail ? red(`${s.fail} failed`) : gray('0 failed')}  ${gray(`${s.skip} skipped`)}  ${gray(`in ${ms(s.ms)}`)}`);
}

// ── Summary by stage and category
const C = { name: 36, num: 8, time: 9 };
const line = () => out(`  ${gray(`${'─'.repeat(C.name)}  ${'─'.repeat(C.num)}  ${'─'.repeat(C.num)}  ${'─'.repeat(C.num)}  ${'─'.repeat(C.time)}  ${'─'.repeat(8)}`)}`);
const rowOf = (label, r, time, strong = false) => {
  const status = r.fail ? red('FAIL') : r.pass ? green('PASS') : gray('SKIP');
  const name = strong ? bold(left(label, C.name)) : left(label, C.name);
  return `  ${name}  ${green(right(r.pass, C.num))}  ${(r.fail ? red : gray)(right(r.fail, C.num))}  ${gray(right(r.skip, C.num))}  ${right(ms(time), C.time)}  ${status}`;
};
out('');
out(bold(cyan(`━━ Summary ${'━'.repeat(107)}`)));
out(`  ${bold(left('Stage / category', C.name))}  ${bold(right('Passed', C.num))}  ${bold(right('Failed', C.num))}  ${bold(right('Skipped', C.num))}  ${bold(right('Time', C.time))}  ${bold('Status')}`);
line();
const total = { pass: 0, fail: 0, skip: 0 };
for (const s of stages) {
  total.pass += s.pass; total.fail += s.fail; total.skip += s.skip;
  out(rowOf(s.title, s, s.ms, true));
  for (const [cat, r] of s.cats) out(rowOf(`  · ${cat}`, r, r.ms));
}
line();
out(rowOf('Total', total, Date.now() - runStart, true));
const failures = stages.flatMap((s) => s.failures.map((f) => ({ ...f, stage: s.title })));
if (failures.length) {
  out('');
  out(red(bold(`Failures (${failures.length}):`)));
  failures.forEach((f, i) => out(`  ${red(`${i + 1}.`)} ${yellow(`[${f.stage} › ${f.category}]`)} ${f.name}\n     ${red(`↳ ${String(f.reason).split('\n')[0]}`)}`));
}
out('');
out(total.fail ? red(bold(`✘ ${total.fail} of ${total.pass + total.fail} tests failed.`)) : green(bold(`✔ All ${total.pass} tests passed${total.skip ? ` (${total.skip} skipped)` : ''}.`)));
fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
fs.writeFileSync(path.join(root, 'test-results', 'report.txt'), `${log.join('\n')}\n`);
out(gray('Report saved: test-results/report.txt'));
process.exit(total.fail ? 1 : 0);

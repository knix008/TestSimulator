// npm test — every MyMechanics test, by category, with a summary at the end.
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
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (s) => (color ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const c = { bold: paint('1'), green: paint('32'), red: paint('31'), cyan: paint('36'), gray: paint('90'), yellow: paint('33') };

const listArg = (name) => { const i = args.indexOf(`--${name}`); return i < 0 ? null : new Set(String(args[i + 1] ?? '').split(',').filter(Boolean)); };
let selected = ['js', 'static', 'web'];
if (args.includes('--quick')) selected = ['js', 'static'];
if (args.includes('--rust')) selected.push('rust');
const only = listArg('only');
if (only) selected = [...only];

function run(cmd, cmdArgs, { cwd = root, parse = null } = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(cmd, cmdArgs, { cwd, stdio: ['ignore', 'pipe', 'pipe'], shell: false, env: { ...process.env, FORCE_COLOR: '0' } });
    let out = '';
    const onData = (d) => { out += d; for (const line of String(d).split(/\r?\n/)) if (line.trim()) parse?.(line); };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('close', (code) => resolve({ code, out, ms: Date.now() - started }));
  });
}

const results = [];

async function category(id, title, job) {
  console.log(`\n${c.bold(c.cyan(`■ ${title}`))}`);
  const r = await job();
  results.push({ id, title, ...r });
}

const tapLine = (counts) => (line) => {
  const ok = /^ok \d+ - (.*)$/.exec(line); const bad = /^not ok \d+ - (.*)$/.exec(line);
  if (ok && !/\.test\.js$/.test(ok[1])) { counts.pass++; console.log(`  ${c.green('✔')} ${ok[1]}`); }
  if (bad) { counts.fail++; console.log(`  ${c.red('✖')} ${bad[1]}`); }
};

for (const id of selected) {
  if (id === 'js' || id === 'static') {
    await category(id, id === 'js' ? 'JS 단위 테스트 (스케치·피처·커널·예제·어셈블리·도면)' : '패키징·문서·번역', async () => {
      const dir = id === 'js' ? 'test/unit' : 'test/static';
      const files = fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.test.js')).map((f) => path.join(dir, f));
      const counts = { pass: 0, fail: 0 };
      const r = await run(process.execPath, ['--test', '--test-reporter=tap', ...files], { parse: tapLine(counts) });
      if (r.code && !counts.fail) { counts.fail = 1; console.log(r.out.slice(-3000)); }
      return { ...counts, ms: r.ms };
    });
  } else if (id === 'web') {
    await category(id, 'E2E · 웹 (헤드리스 Edge, 실제 마우스 입력)', async () => {
      const counts = { pass: 0, fail: 0 };
      const r = await run(process.execPath, ['scripts/smoke-web.mjs', '--out', 'test-results/web', '--steps', 'test/e2e/web.steps.json'], {
        parse: (line) => {
          if (line.startsWith('✔')) { counts.pass++; console.log(`  ${c.green('✔')}${line.slice(1)}`); }
          else if (line.startsWith('✘')) { counts.fail++; console.log(`  ${c.red('✖')}${line.slice(1)}`); }
          else if (/^\s+!/.test(line)) console.log(c.yellow(line));
        },
      });
      if (r.code && !counts.fail) { counts.fail = 1; console.log(r.out.slice(-3000)); }
      return { ...counts, ms: r.ms };
    });
  } else if (id === 'rust') {
    await category(id, 'Rust 단위 테스트 (cargo test --lib)', async () => {
      const counts = { pass: 0, fail: 0 };
      const r = await run('cargo', ['test', '--lib'], {
        cwd: path.join(root, 'src-tauri'),
        parse: (line) => {
          const m = /^test (\S+) \.\.\. (ok|FAILED)/.exec(line);
          if (m) { if (m[2] === 'ok') counts.pass++; else counts.fail++; console.log(`  ${m[2] === 'ok' ? c.green('✔') : c.red('✖')} ${m[1]}`); }
        },
      });
      if (r.code && !counts.fail) { counts.fail = 1; console.log(r.out.slice(-3000)); }
      return { ...counts, ms: r.ms };
    });
  }
}

console.log(`\n${c.bold('요약')}`);
let failed = 0;
for (const r of results) {
  failed += r.fail;
  console.log(`  ${r.fail ? c.red('✖') : c.green('✔')} ${r.title.padEnd(44)} ${String(r.pass).padStart(4)} 통과  ${String(r.fail).padStart(3)} 실패  ${c.gray(`${(r.ms / 1000).toFixed(1)} s`)}`);
}
fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
fs.writeFileSync(path.join(root, 'test-results', 'results.json'), JSON.stringify(results.map(({ out, ...r }) => r), null, 2));
process.exit(failed ? 1 : 0);

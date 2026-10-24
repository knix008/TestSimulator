// npm test — every MyHeatManager test, by category, with a summary at the end.
//
//   npm test                         js · engine · rust · wasm · web · desktop
//   npm test -- --only js,engine     just those
//   npm test -- --skip web           everything but those
//
// Categories
//   js      node:test over test/unit/*.test.js (pure frontend modules)
//   engine  cargo test in engine/heat-core (the solver, analytic validations)
//   rust    cargo test --lib in src-tauri (desktop shell, batch PNG writer)
//   wasm    npm run build:wasm + engine/wasm-smoke.mjs (the web engine runs)
//   web     test/e2e/web.mjs — the web build driven in headless Edge/Chrome over CDP
//   desktop test/e2e/desktop.mjs — the real program (debug build) over WebView2 CDP, and --batch
// Results are also written to test-results/summary.json.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (text) => (color ? `\x1b[${code}m${text}\x1b[0m` : String(text));
const c = { bold: paint('1'), dim: paint('2'), red: paint('31'), green: paint('32'), yellow: paint('33'), cyan: paint('36') };

const CATEGORIES = [
  { id: 'js', title: 'JS 단위 테스트', cmd: [process.execPath, ['--test', '--test-reporter=spec', ...fs.readdirSync(path.join(root, 'test', 'unit')).filter((f) => f.endsWith('.test.js')).map((f) => path.join('test', 'unit', f))]], cwd: root },
  { id: 'engine', title: 'Rust 해석 엔진 (heat-core)', cmd: ['cargo', ['test', '--release']], cwd: path.join(root, 'engine', 'heat-core') },
  { id: 'rust', title: 'Rust 데스크톱 셸', cmd: ['cargo', ['test', '--lib']], cwd: path.join(root, 'src-tauri') },
  { id: 'wasm', title: 'WebAssembly 엔진', steps: [[process.execPath, ['engine/build-wasm.mjs']], [process.execPath, ['engine/wasm-smoke.mjs']]], cwd: root },
  { id: 'web', title: 'E2E · 웹 (헤드리스 브라우저)', cmd: [process.execPath, ['test/e2e/web.mjs']], cwd: root },
  { id: 'desktop', title: 'E2E · 데스크톱 (실제 앱 + 배치)', cmd: [process.execPath, ['test/e2e/desktop.mjs']], cwd: root },
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

function exec(command, commandArgs, cwd) {
  return new Promise((resolve) => {
    const started = performance.now();
    const child = spawn(command, commandArgs, { cwd, shell: process.platform === 'win32' && command === 'cargo', env: { ...process.env, FORCE_COLOR: color ? '1' : '0' } });
    let output = '';
    const forward = (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text.split('\n').map((l) => (l ? `  ${l}` : l)).join('\n'));
    };
    child.stdout.on('data', forward);
    child.stderr.on('data', forward);
    child.on('close', (code) => resolve({ code, output, ms: performance.now() - started }));
    child.on('error', (error) => resolve({ code: 1, output: String(error), ms: performance.now() - started }));
  });
}

/** Test counts from the output of node:test, cargo test or the e2e suite. */
function counts(output) {
  const plain = output.replace(/\x1b\[[0-9;]*m/g, '');
  let pass = 0;
  let fail = 0;
  for (const m of plain.matchAll(/test result: \w+\. (\d+) passed; (\d+) failed/g)) { pass += Number(m[1]); fail += Number(m[2]); }
  const node = plain.match(/ℹ pass (\d+)[\s\S]*?ℹ fail (\d+)/) ?? plain.match(/# pass (\d+)[\s\S]*?# fail (\d+)/);
  if (node) { pass += Number(node[1]); fail += Number(node[2]); }
  const e2e = plain.match(/E2E: (\d+) passed, (\d+) failed/);
  if (e2e) { pass += Number(e2e[1]); fail += Number(e2e[2]); }
  return { pass, fail };
}

const results = [];
for (const cat of CATEGORIES.filter((x) => selected.includes(x.id))) {
  console.log(`\n${c.bold(c.cyan(`▶ ${cat.title}`))} ${c.dim(`[${cat.id}]`)}`);
  let total = { code: 0, output: '', ms: 0 };
  for (const [command, commandArgs] of cat.steps ?? [cat.cmd]) {
    const r = await exec(command, commandArgs, cat.cwd);
    total = { code: total.code || r.code, output: total.output + r.output, ms: total.ms + r.ms };
    if (r.code) break;
  }
  const n = counts(total.output);
  results.push({ id: cat.id, title: cat.title, ok: total.code === 0, ...n, seconds: Math.round(total.ms / 100) / 10 });
}

console.log(`\n${c.bold('요약')}`);
for (const r of results) {
  const mark = r.ok ? c.green('✔') : c.red('✖');
  const tests = r.pass || r.fail ? `${r.pass} 통과${r.fail ? `, ${c.red(`${r.fail} 실패`)}` : ''}` : (r.ok ? '통과' : c.red('실패'));
  console.log(`  ${mark} ${r.title.padEnd(28)} ${tests.padEnd(18)} ${c.dim(`${r.seconds} s`)}`);
}
fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
fs.writeFileSync(path.join(root, 'test-results', 'summary.json'), JSON.stringify({ date: new Date().toISOString(), results }, null, 2));
process.exit(results.every((r) => r.ok) ? 0 : 1);

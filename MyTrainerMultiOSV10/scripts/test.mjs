// npm test — every test, with a summary at the end:
//   js       node --test test/unit (domain, TensorFlow.js trainer, PyTorch engine when a Python with torch exists)
//   rust     cargo test --lib (files, window state, Python detection)
//   web      end-to-end checks of the web build in headless Edge / Chrome
//   desktop  end-to-end checks of the real program (debug build with the page embedded; rebuilt when sources changed)
// Options: --only js,rust,web,desktop · --quick (js + rust)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const onlyArg = args.find((a) => a.startsWith('--only'));
const only = onlyArg ? (onlyArg.includes('=') ? onlyArg.split('=')[1] : args[args.indexOf(onlyArg) + 1]).split(',') : args.includes('--quick') ? ['js', 'rust'] : ['js', 'rust', 'web', 'desktop'];
const color = (code, text) => (process.stdout.isTTY ? `\x1b[${code}m${text}\x1b[0m` : text);
const green = (t) => color(32, t);
const red = (t) => color(31, t);
const bold = (t) => color(1, t);
fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
const summary = [];

function phase(name, fn) {
  if (!only.includes(name)) return;
  console.log(bold(`\n▶ ${name}`));
  const started = Date.now();
  const result = fn();
  return Promise.resolve(result).then((r) => summary.push({ name, ...r, seconds: ((Date.now() - started) / 1000).toFixed(1) }));
}

function nodeTests() {
  const files = fs.readdirSync(path.join(root, 'test', 'unit')).filter((f) => f.endsWith('.test.js')).map((f) => path.join('test', 'unit', f));
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=spec', '--test-concurrency=4', ...files], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const out = `${result.stdout}${result.stderr}`;
  fs.writeFileSync(path.join(root, 'test-results', 'js.log'), out);
  const count = (label) => Number(new RegExp(`ℹ ${label} (\\d+)`).exec(out)?.[1] ?? 0);
  for (const line of out.split(/\r?\n/)) if (/^\s*✖/.test(line) || /AssertionError|Error:/.test(line)) console.log(red(line));
  const pass = count('pass');
  const fail = count('fail');
  const skipped = count('skipped');
  console.log(`  ${green(`${pass} passed`)}${fail ? `, ${red(`${fail} failed`)}` : ''}${skipped ? `, ${skipped} skipped` : ''} (test-results/js.log)`);
  return { pass, fail, skipped };
}

function rustTests() {
  const result = spawnSync('cargo', ['test', '--lib'], { cwd: path.join(root, 'src-tauri'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const out = `${result.stdout}${result.stderr}`;
  fs.writeFileSync(path.join(root, 'test-results', 'rust.log'), out);
  const match = /test result: \w+\. (\d+) passed; (\d+) failed/.exec(out);
  const pass = Number(match?.[1] ?? 0);
  const fail = match ? Number(match[2]) : 1;
  for (const line of out.split(/\r?\n/)) if (/FAILED|panicked/.test(line)) console.log(red(line));
  console.log(`  ${green(`${pass} passed`)}${fail ? `, ${red(`${fail} failed`)}` : ''} (test-results/rust.log)`);
  return { pass, fail, skipped: 0 };
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

async function suite(name, load) {
  const results = await (await load())({ log: (line) => console.log(line) });
  const pass = results.filter((r) => r.ok).length;
  const fail = results.length - pass;
  console.log(`  ${green(`${pass} passed`)}${fail ? `, ${red(`${fail} failed`)}` : ''}`);
  return { pass, fail, skipped: 0 };
}

await phase('js', nodeTests);
await phase('rust', rustTests);
await phase('web', () => suite('web', async () => (await import('../test/e2e/web.suite.mjs')).runWebSuite));
await phase('desktop', async () => {
  const exe = path.join(root, 'src-tauri', 'target', 'debug', process.platform === 'win32' ? 'MyTrainer.exe' : 'MyTrainer');
  const sources = Math.max(newest(path.join(root, 'src')), newest(path.join(root, 'src-tauri', 'src')), newest(path.join(root, 'python')));
  if (!fs.existsSync(exe) || fs.statSync(exe).mtimeMs < sources) {
    console.log('  building the debug program (tauri build --debug --no-bundle)…');
    const build = spawnSync(process.execPath, [path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'), 'build', '--debug', '--no-bundle'], { cwd: root, stdio: 'ignore' });
    if (build.status !== 0) { console.log(red('  the build failed')); return { pass: 0, fail: 1, skipped: 0 }; }
  }
  return suite('desktop', async () => (await import('../test/e2e/desktop.suite.mjs')).runDesktopSuite);
});

console.log(bold('\n═══ Summary ═══'));
let failed = 0;
for (const s of summary) {
  failed += s.fail;
  console.log(`  ${s.fail ? red('✖') : green('✔')} ${s.name.padEnd(8)} ${String(s.pass).padStart(4)} passed  ${s.fail ? red(`${s.fail} failed`) : '        '}${s.skipped ? `  ${s.skipped} skipped` : ''}  ${s.seconds}s`);
}
console.log(failed ? red(bold(`\n${failed} failed`)) : green(bold('\nAll tests passed')));
process.exit(failed ? 1 : 0);

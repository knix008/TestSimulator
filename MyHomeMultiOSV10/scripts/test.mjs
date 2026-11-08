// npm test — every test of MyHomeMaker, category by category, each test on its own coloured line
// as it finishes, then one summary table:
//   js       unit tests: site model, blocks, designs, templates, samples, pictures, publishing,
//            settings, translations, documents        (node --test, test/node-reporter.mjs)
//   rust     the Tauri backend                          (cargo test, test/rust-report.mjs)
//   web      the web build, every feature, Korean and English     (test/e2e/web.smoke.mjs)
//   desktop  the desktop app (debug build) through CDP              (test/e2e/desktop.smoke.mjs)
//
//   npm test                         all four
//   npm test -- --quick              js and rust
//   npm test -- --only web,desktop
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { color, ms } from '../test/report.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : args.includes('--quick') ? ['js', 'rust'] : ['js', 'rust', 'web', 'desktop'];
const node = process.execPath;
// Its own build folder: a running `npm start` keeps target/debug/myhomemaker.exe locked.
const targetDir = path.join(root, 'src-tauri', 'target', 'e2e');
const exe = path.join(targetDir, 'debug', process.platform === 'win32' ? 'MyHomeMaker.exe' : 'myhomemaker');
const resultsDir = path.join(root, 'test-results');

const run = (command, commandArgs, options = {}) => spawnSync(command, commandArgs, { cwd: root, stdio: 'inherit', ...options }).status === 0;
const unitFiles = () => fs.readdirSync(path.join(root, 'test', 'unit')).filter((f) => f.endsWith('.test.js')).sort().map((f) => path.join('test', 'unit', f));

const CATEGORIES = {
  js: { title: 'unit tests', run: () => run(node, ['--test', '--test-reporter=./test/node-reporter.mjs', ...unitFiles()]) },
  rust: { title: 'Tauri backend', run: () => run(node, [path.join('test', 'rust-report.mjs')]) },
  web: { title: 'web build, every feature', run: () => run(node, [path.join('test', 'e2e', 'web.smoke.mjs')]) },
  desktop: {
    title: 'desktop app',
    run: () => {
      console.log(`\n${color.gray('  building the debug app (tauri build --debug --no-bundle) …')}`);
      const built = spawnSync(node, [path.join('node_modules', '@tauri-apps', 'cli', 'tauri.js'), 'build', '--debug', '--no-bundle'], { cwd: root, encoding: 'utf8', env: { ...process.env, CARGO_TARGET_DIR: targetDir } });
      if (built.status !== 0 || !fs.existsSync(exe)) { console.log(color.red(`${built.stdout}\n${built.stderr}`.trim().split('\n').slice(-15).join('\n'))); return false; }
      return run(node, [path.join('test', 'e2e', 'desktop.smoke.mjs'), exe]);
    },
  },
};

for (const name of only) if (!CATEGORIES[name]) { console.error(`unknown category: ${name} (${Object.keys(CATEGORIES).join(', ')})`); process.exit(2); }
fs.mkdirSync(resultsDir, { recursive: true });
for (const name of only) fs.rmSync(path.join(resultsDir, `${name}.json`), { force: true });

const started = Date.now();
const summary = [];
for (const [index, name] of only.entries()) {
  console.log(`\n${color.blueBg(` ${index + 1}/${only.length} `)} ${color.bold(color.blue(name.toUpperCase()))} ${color.gray(CATEGORIES[name].title)}`);
  const begin = Date.now();
  const ok = CATEGORIES[name].run();
  let counts = { passed: 0, failed: ok ? 0 : 1, skipped: 0, sections: [] };
  try { counts = JSON.parse(fs.readFileSync(path.join(resultsDir, `${name}.json`), 'utf8')); } catch { /* the category did not get to its summary */ }
  summary.push({ name, ok: ok && !counts.failed, ...counts, duration: Date.now() - begin });
}

// ── the summary: one row per category, then its sections, then the total
const W = { name: 22 };
const bar = (passed, failed, width = 24) => {
  const total = passed + failed;
  const g = total ? Math.round((passed / total) * width) : 0;
  const r = total ? Math.max(failed ? 1 : 0, Math.round((failed / total) * width)) : 0;
  return color.green('█'.repeat(Math.min(width, g))) + color.red('█'.repeat(Math.min(width - Math.min(width, g), r))) + color.gray('░'.repeat(Math.max(0, width - g - r)));
};
const row = (state, label, passed, failed, duration, { bold = false, indent = '' } = {}) => {
  const badge = state === 'ok' ? color.greenBg('  OK  ') : state === 'fail' ? color.redBg(' FAIL ') : color.gray('      ');
  const name = `${indent}${label}`.padEnd(W.name);
  console.log(`  ${badge}  ${bold ? color.bold(name) : name}  ${bar(passed, failed)}  ${color.green(String(passed).padStart(5))}  ${failed ? color.red(String(failed).padStart(5)) : color.gray(String(failed).padStart(5))}  ${color.gray(String(passed + failed).padStart(5))}  ${color.gray(duration == null ? '' : ms(duration))}`);
};

console.log(`\n${color.bold(color.cyan(`━━ summary ${'━'.repeat(86)}`))}`);
console.log(`  ${' '.repeat(6)}  ${color.gray('category / section'.padEnd(W.name))}  ${color.gray('result'.padEnd(24))}  ${color.gray('pass'.padStart(5))}  ${color.gray('fail'.padStart(5))}  ${color.gray('total'.padStart(5))}  ${color.gray('     time')}`);
for (const s of summary) {
  row(s.ok ? 'ok' : 'fail', s.name, s.passed, s.failed, s.duration, { bold: true });
  for (const section of s.sections ?? []) row(section.failed ? 'fail' : '', section.name, section.passed, section.failed, null, { indent: '  · ' });
}
const passed = summary.reduce((n, s) => n + s.passed, 0);
const failed = summary.reduce((n, s) => n + s.failed, 0);
console.log(`  ${color.gray('─'.repeat(96))}`);
row(failed ? 'fail' : 'ok', 'all tests', passed, failed, Date.now() - started, { bold: true });
for (const s of summary.filter((x) => x.failures?.length)) {
  console.log(`\n  ${color.red(color.bold(`failed in ${s.name}:`))}`);
  for (const f of s.failures.slice(0, 20)) console.log(`    ${color.red('✗')} ${color.magenta(String(f.section).padEnd(14))} ${f.name}${f.error ? color.gray(` — ${String(f.error).split('\n')[0].slice(0, 120)}`) : ''}`);
}
console.log('');
process.exitCode = failed || summary.some((s) => !s.ok) ? 1 : 0;

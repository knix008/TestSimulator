// npm test — every check of MyHomeMaker, one category after another:
//   js       unit tests (node --test test/unit): site model, blocks, rendering, publishing, templates,
//            samples, settings, translations, documents
//   rust     cargo test (file writing, site publishing, window place, instances, fonts)
//   web      the web build in headless Edge / Chrome (test/e2e/web.smoke.mjs)
//   desktop  the desktop app, debug build, driven through CDP (test/e2e/desktop.smoke.mjs)
//
//   npm test                     all four
//   npm test -- --quick          js and rust
//   npm test -- --only web,desktop
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : args.includes('--quick') ? ['js', 'rust'] : ['js', 'rust', 'web', 'desktop'];
const node = process.execPath;
const exe = path.join(root, 'src-tauri', 'target', 'debug', process.platform === 'win32' ? 'MyHomeMaker.exe' : 'myhomemaker');

const run = (command, commandArgs, options = {}) => spawnSync(command, commandArgs, { cwd: root, stdio: 'inherit', shell: false, ...options }).status === 0;
const unitFiles = () => fs.readdirSync(path.join(root, 'test', 'unit')).filter((f) => f.endsWith('.test.js')).map((f) => path.join('test', 'unit', f));

const CATEGORIES = {
  js: () => run(node, ['--test', ...unitFiles()]),
  rust: () => run('cargo', ['test', '--manifest-path', path.join('src-tauri', 'Cargo.toml'), '--quiet'], { shell: process.platform === 'win32' }),
  web: () => run(node, [path.join('test', 'e2e', 'web.smoke.mjs')]),
  desktop: () => run(node, [path.join('node_modules', '@tauri-apps', 'cli', 'tauri.js'), 'build', '--debug', '--no-bundle']) && fs.existsSync(exe) && run(node, [path.join('test', 'e2e', 'desktop.smoke.mjs'), exe]),
};

const summary = [];
for (const name of only) {
  if (!CATEGORIES[name]) { console.error(`unknown category: ${name} (${Object.keys(CATEGORIES).join(', ')})`); process.exit(2); }
  console.log(`\n━━ ${name} ${'━'.repeat(60 - name.length)}`);
  const started = Date.now();
  const ok = CATEGORIES[name]();
  summary.push({ name, ok, seconds: Math.round((Date.now() - started) / 1000) });
}
console.log('\n━━ summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
for (const { name, ok, seconds } of summary) console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name.padEnd(10)} ${String(seconds).padStart(5)} s`);
process.exitCode = summary.every((s) => s.ok) ? 0 : 1;

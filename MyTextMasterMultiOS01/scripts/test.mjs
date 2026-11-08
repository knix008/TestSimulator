// npm test — every check: unit tests (node:test), the Rust tests (cargo), and the GUI checks on a
// fresh web build in a headless browser.
//   npm test -- --only unit,gui     run some of: unit, rust, gui
//   npm test -- --shots             GUI screenshots in test-results/gui/
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > 0 ? process.argv[onlyArg + 1].split(',') : ['unit', 'rust', 'gui'];
const shots = process.argv.includes('--shots');

const run = (label, command, args, options = {}) => {
  console.log(`\n━━ ${label}`);
  const started = Date.now();
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: options.shell ?? false });
  const ok = result.status === 0;
  console.log(`━━ ${label}: ${ok ? 'ok' : 'FAILED'} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
  return ok;
};

const results = [];
if (only.includes('unit')) {
  const files = fs.readdirSync(path.join(root, 'test')).filter((f) => f.endsWith('.test.mjs')).map((f) => path.join('test', f));
  results.push(['unit', run('unit (node:test)', process.execPath, ['--test', ...files])]);
}
if (only.includes('rust')) results.push(['rust', run('rust (cargo test)', 'cargo', ['test', '--manifest-path', path.join('src-tauri', 'Cargo.toml')])]);
if (only.includes('gui')) {
  const built = run('web build', 'npm', ['run', 'build:web'], { shell: process.platform === 'win32' });
  results.push(['gui', built && run('gui (headless browser)', process.execPath, [path.join('test', 'gui.mjs'), ...(shots ? ['--shots'] : [])])]);
}

console.log(`\n${results.map(([name, ok]) => `${ok ? '✔' : '✘'} ${name}`).join('   ')}`);
process.exit(results.every(([, ok]) => ok) ? 0 : 1);

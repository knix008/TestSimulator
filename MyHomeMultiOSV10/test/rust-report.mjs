// cargo test in the common look (test/report.mjs): each Rust test on its own line as it finishes,
// sectioned by module (files, window_state, instance, fonts …), then the section and total counts.
//   node test/rust-report.mjs
import { spawn } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { color, header, line, saveResult, tally } from './report.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
header('rust', 'cargo test — the Tauri backend (src-tauri)');

const started = Date.now();
const results = [];
let last = Date.now();
const compileErrors = [];
const child = spawn('cargo', ['test', '--manifest-path', path.join('src-tauri', 'Cargo.toml'), '--color', 'never', '--', '--test-threads=1'], { cwd: root, shell: process.platform === 'win32' });
const output = readline.createInterface({ input: child.stdout });
const errors = readline.createInterface({ input: child.stderr });

output.on('line', (text) => {
  const m = /^test (\S+) \.\.\. (ok|FAILED|ignored)/.exec(text);
  if (!m) return;
  const parts = m[1].split('::').filter((p) => p !== 'tests');
  const section = parts.length > 1 ? parts[0] : 'lib';
  const name = parts.slice(parts.length > 1 ? 1 : 0).join(' › ').replace(/_/g, ' ');
  const status = m[2] === 'ok' ? 'pass' : m[2] === 'ignored' ? 'skip' : 'fail';
  const now = Date.now();
  results.push({ section, name, ok: status !== 'fail', skipped: status === 'skip', duration: now - last });
  line(results.length, status, section, name, now - last);
  last = now;
});
errors.on('line', (text) => {
  if (/^\s*Compiling|^\s*Running|^\s*Finished|^\s*Doc-tests/.test(text)) { last = Date.now(); if (/Compiling myhomemaker|Finished/.test(text)) console.log(`  ${color.gray(text.trim())}`); return; }
  if (/^error|^warning: unused|panicked/.test(text)) compileErrors.push(text);
});

const code = await new Promise((resolve) => child.on('close', resolve));
for (const text of compileErrors.slice(0, 10)) console.log(`  ${color.red(text)}`);
const sections = [...new Set(results.map((r) => r.section))];
console.log(`\n  ${color.bold('Sections')}`);
for (const section of sections) {
  const rows = results.filter((r) => r.section === section);
  tally({ passed: rows.filter((r) => r.ok && !r.skipped).length, failed: rows.filter((r) => !r.ok).length, skipped: rows.filter((r) => r.skipped).length, duration: rows.reduce((s, r) => s + r.duration, 0) }, section);
}
const passed = results.filter((r) => r.ok && !r.skipped).length;
const failed = results.filter((r) => !r.ok).length + (code !== 0 && !results.some((r) => !r.ok) ? 1 : 0);
console.log('');
tally({ passed, failed, skipped: results.filter((r) => r.skipped).length, duration: Date.now() - started }, 'rust total');
saveResult('rust', { category: 'rust', passed, failed, skipped: results.filter((r) => r.skipped).length, duration: Date.now() - started, sections: sections.map((s) => ({ name: s, passed: results.filter((r) => r.section === s && r.ok).length, failed: results.filter((r) => r.section === s && !r.ok).length })) });
process.exitCode = failed ? 1 : 0;

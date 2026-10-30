// The Tauri shell's own tests (src-tauri: dialog sizes and labels, saved
// window bounds, the minimum size against tauri.conf.json, resource paths).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(new URL('.', import.meta.url)));
const crate = path.join(root, 'src-tauri');

test('rust: cargo test in src-tauri passes', () => {
  // tauri-build wants the bundled resources to exist (scripts/stage-runtime.mjs).
  if (!fs.existsSync(path.join(crate, 'runtime', 'server', 'server.js'))) {
    const staged = spawnSync(process.execPath, [path.join(root, 'scripts', 'stage-runtime.mjs')], { cwd: root, encoding: 'utf8' });
    assert.equal(staged.status, 0, staged.stderr);
  }
  if (!fs.existsSync(path.join(root, 'dist'))) fs.mkdirSync(path.join(root, 'dist'));
  const r = spawnSync('cargo', ['test', '--quiet'], { cwd: crate, encoding: 'utf8', maxBuffer: 64 << 20, shell: process.platform === 'win32' });
  if (r.error) assert.fail(`cargo is not available: ${r.error.message} (install Rust: https://rustup.rs)`);
  const out = `${r.stdout}\n${r.stderr}`;
  assert.equal(r.status, 0, out.slice(-4000));
  const passed = [...out.matchAll(/test result: ok\. (\d+) passed/g)].reduce((n, m) => n + Number(m[1]), 0);
  assert.ok(passed >= 8, `expected the shell's tests to run, got ${passed}\n${out.slice(-2000)}`);
});

// The desktop side's own unit tests (printer list, print jobs, install language, fonts), run with
// cargo in a separate target folder so a running `npm start` is not disturbed.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('cargo test passes for the desktop app', { timeout: 900000 }, () => {
  const run = spawnSync('cargo', ['test', '--quiet', '--manifest-path', path.join(root, 'src-tauri', 'Cargo.toml')], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, CARGO_TARGET_DIR: path.join(root, 'src-tauri', 'target', 'test') },
    shell: process.platform === 'win32',
  });
  const output = `${run.stdout}\n${run.stderr}`;
  assert.equal(run.error, undefined, `cargo could not start: ${run.error?.message} (install Rust: https://rustup.rs)`);
  assert.equal(run.status, 0, output.split('\n').slice(-25).join('\n'));
  const passed = [...output.matchAll(/test result: ok\. (\d+) passed; 0 failed; 0 ignored/g)].reduce((sum, m) => sum + Number(m[1]), 0);
  assert.ok(passed >= 7, `rust tests passed: ${passed}`);
});

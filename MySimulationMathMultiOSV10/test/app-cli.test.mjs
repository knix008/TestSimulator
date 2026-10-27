// The terminal runner scripts/msm.mjs: argument parsing, and a real run in a
// child process (the answer depends on whether core/session.js exists yet:
// with it `disp(1+1)` prints 2, without it the runner exits with code 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from '../scripts/msm.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'scripts', 'msm.mjs');
const hasEngine = fs.existsSync(path.join(root, 'core', 'session.js'));

test('parseArgs: -r code, files, --cd and --no-echo', () => {
  assert.deepEqual(parseArgs(['-r', 'disp(1)', 'a.m', '--cd', 'work', '-r', 'x=2', '--no-echo']), { run: ['disp(1)', 'x=2'], files: ['a.m'], cd: 'work', echo: false, help: false });
  assert.equal(parseArgs(['--help']).help, true);
  assert.deepEqual(parseArgs([]).files, []);
});

test('msm -r runs code (or says the engine is missing)', () => {
  const r = spawnSync(process.execPath, [cli, '-r', 'disp(1+1)'], { cwd: root, encoding: 'utf8', timeout: 60000 });
  if (hasEngine) {
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^\s*2\s*$/m);
  } else {
    assert.equal(r.status, 2);
    assert.match(r.stderr, /core\/session\.js/);
  }
});

test('msm file.m runs a script from another folder', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'msm-cli-'));
  try {
    fs.writeFileSync(path.join(dir, 'hello.m'), "disp('hello from a script')\n");
    const r = spawnSync(process.execPath, [cli, '--cd', dir, 'hello.m'], { cwd: root, encoding: 'utf8', timeout: 60000 });
    if (hasEngine) {
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /hello from a script/);
    } else assert.equal(r.status, 2);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('msm --help prints the usage', () => {
  const r = spawnSync(process.execPath, [cli, '--help'], { cwd: root, encoding: 'utf8', timeout: 30000 });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage: npm run msm/);
});

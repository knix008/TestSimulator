import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { encodeIco, encodeIcns } from '../scripts/icons.mjs';
import { rejectReason } from '../scripts/platform-build.mjs';
import { cleanAll, cleanBuild, pidsToStop } from '../scripts/clean.mjs';

test('ICO and ICNS containers start with their magic', () => {
  const rgba = new Uint8Array(16 * 16 * 4).fill(255);
  const ico = encodeIco([{ size: 16, png: new Uint8Array([1, 2, 3]), rgba }]);
  assert.equal(ico[2], 1);
  const png = new Uint8Array([137, 80, 78, 71]);
  const icns = encodeIcns([{ size: 16, png }]);
  assert.equal(Buffer.from(icns.subarray(0, 4)).toString(), 'icns');
});

test('clean removes build folders and root installers only', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-clean-'));
  try {
    fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'dist', 'index.html'), 'x');
    fs.mkdirSync(path.join(dir, 'src-tauri', 'target'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'App.jsx'), 'keep');
    fs.writeFileSync(path.join(dir, 'MyCodeChecker_1.0.0_x64-setup.exe'), 'installer');
    fs.mkdirSync(path.join(dir, 'node_modules', 'vite'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'MyCodeChecker-Tutorial.mp4'), 'video');
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'keep');
    const removed = cleanBuild(dir).map((p) => path.relative(dir, p));
    assert.deepEqual(removed.sort(), ['MyCodeChecker_1.0.0_x64-setup.exe', path.join('dist'), path.join('src-tauri', 'target')].sort());
    assert.equal(fs.existsSync(path.join(dir, 'src', 'App.jsx')), true);
    assert.equal(fs.existsSync(path.join(dir, 'notes.txt')), true);
    assert.equal(fs.existsSync(path.join(dir, 'node_modules')), true);
    assert.equal(fs.existsSync(path.join(dir, 'MyCodeChecker-Tutorial.mp4')), true);
    assert.equal(fs.existsSync(path.join(dir, 'dist')), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('only programs inside the folder being removed are stopped', () => {
  const dir = path.join('D:', 'proj', 'node_modules');
  const esbuild = path.join(dir, '@esbuild', 'win32-x64', 'esbuild.exe');
  const other = path.join('D:', 'other', 'node_modules', 'esbuild.exe');
  const pids = pidsToStop([
    { pid: 10, exe: esbuild },
    { pid: 11, exe: other },
    { pid: 12, exe: path.join('C:', 'Program Files', 'nodejs', 'node.exe') },
  ], dir, 12);
  assert.deepEqual(pids, [10]);
});

test('a dev server that loaded a module in the folder is stopped', () => {
  const dir = path.join('D:', 'proj', 'node_modules');
  const node = path.join('C:', 'Program Files', 'nodejs', 'node.exe');
  const pids = pidsToStop([
    { pid: 1, ppid: 2, name: 'node.exe', exe: node, cmd: `"${node}" ${path.join(dir, 'vite', 'bin', 'vite.js')}` },
    { pid: 2, ppid: 3, name: 'node.exe', exe: node, cmd: 'node  scripts/dev.mjs' },
    { pid: 3, ppid: 4, name: 'cmd.exe', exe: path.join('C:', 'Windows', 'System32', 'cmd.exe'), cmd: 'cmd /c node scripts/dev.mjs' },
    { pid: 4, ppid: 5, name: 'node.exe', exe: node, cmd: 'npm-cli.js run dev' },
    { pid: 5, ppid: 0, name: 'powershell.exe', exe: path.join('C:', 'Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), cmd: 'prompt' },
    { pid: 9, ppid: 0, name: 'node.exe', exe: path.join('C:', 'Users', 'me', 'AppData', 'Local', 'Programs', 'cursor', 'resources', 'helpers', 'node.exe'), cmd: `tsserver.js ${dir}` },
    { pid: 8, ppid: 0, name: 'node.exe', exe: node, cmd: 'node tmp-mod-check.mjs' },
  ], dir, 99, [8]);
  assert.deepEqual([...pids].sort((a, b) => a - b), [1, 2, 8]);
});

test('clean:all also removes dependencies and the tutorial video', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-clean-all-'));
  try {
    fs.mkdirSync(path.join(dir, 'node_modules', 'vite'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'docs', 'video'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'docs', 'video', 'clip.mp4'), 'video');
    fs.writeFileSync(path.join(dir, 'MyCodeChecker-Tutorial.mp4'), 'video');
    fs.writeFileSync(path.join(dir, 'README.md'), 'keep');
    const removed = cleanAll(dir).map((p) => path.relative(dir, p));
    assert.ok(removed.includes('node_modules'));
    assert.ok(removed.includes('MyCodeChecker-Tutorial.mp4'));
    assert.ok(removed.includes(path.join('docs', 'video')));
    assert.equal(fs.existsSync(path.join(dir, 'node_modules')), false);
    assert.equal(fs.existsSync(path.join(dir, 'docs', 'video')), false);
    assert.equal(fs.existsSync(path.join(dir, 'README.md')), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('an installer is built on its own operating system', () => {
  assert.equal(rejectReason('linux', 'win32').includes('Linux'), true);
  assert.equal(rejectReason('mac', 'win32').includes('macOS'), true);
  assert.equal(rejectReason('win', 'linux').includes('Windows'), true);
  assert.equal(rejectReason('win', 'win32'), null);
  assert.equal(rejectReason('linux', 'linux'), null);
  assert.equal(rejectReason('mac', 'darwin'), null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { encodeIco, encodeIcns } from '../scripts/icons.mjs';
import { rejectReason } from '../scripts/platform-build.mjs';
import { cleanAll, cleanBuild } from '../scripts/clean.mjs';

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

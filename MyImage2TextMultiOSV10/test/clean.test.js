import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { cleanTargets } from '../scripts/clean.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

test('clean and clean:all are npm scripts', () => {
  assert.equal(pkg.scripts.clean, 'node scripts/clean.mjs');
  assert.equal(pkg.scripts['clean:all'], 'node scripts/clean.mjs --all');
});

test('clean removes build output but never sources, examples or guide pictures', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'image2text-clean-'));
  try {
    for (const name of ['Image2Text-Setup-2.0.0.exe', 'Image2Text-2.0.0-web.zip', 'debug.log', 'README.md', 'package.json']) {
      writeFileSync(path.join(temp, name), 'x');
    }
    const plain = cleanTargets(temp).map(([rel]) => rel);
    for (const expected of ['dist', 'src/generated', 'src-tauri/target', 'src-tauri/gen', 'release', 'node_modules/.vite',
      'Image2Text-Setup-2.0.0.exe', 'Image2Text-2.0.0-web.zip', 'debug.log']) {
      assert.ok(plain.includes(expected), expected);
    }
    for (const kept of ['node_modules', 'README.md', 'package.json', 'src', 'public', 'public/examples', 'doc', 'doc/images']) {
      assert.ok(!plain.includes(kept), `${kept} is kept`);
    }
    assert.ok(cleanTargets(temp, { all: true }).some(([rel]) => rel === 'node_modules'));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('every clean target is git-ignored', () => {
  const ignore = readFileSync(path.join(root, '.gitignore'), 'utf8');
  for (const pattern of ['node_modules/', 'dist/', '.vite/', 'src/generated/', 'src-tauri/target/', 'src-tauri/gen/', '/release/', '*.log']) {
    assert.ok(ignore.split(/\r?\n/).includes(pattern), pattern);
  }
});

test('a dry run lists targets and deletes nothing', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'image2text-clean-'));
  try {
    mkdirSync(path.join(temp, 'scripts'));
    mkdirSync(path.join(temp, 'dist'));
    writeFileSync(path.join(temp, 'dist', 'index.html'), 'x');
    writeFileSync(path.join(temp, 'scripts', 'clean.mjs'), readFileSync(path.join(root, 'scripts', 'clean.mjs')));
    const out = execFileSync(process.execPath, [path.join(temp, 'scripts', 'clean.mjs'), '--dry-run'], { encoding: 'utf8' });
    assert.match(out, /would remove dist/);
    assert.ok(readFileSync(path.join(temp, 'dist', 'index.html'), 'utf8') === 'x');
    const real = execFileSync(process.execPath, [path.join(temp, 'scripts', 'clean.mjs')], { encoding: 'utf8' });
    assert.match(real, /removed dist/);
    assert.throws(() => readFileSync(path.join(temp, 'dist', 'index.html')));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

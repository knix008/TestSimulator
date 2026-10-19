import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeIco } from '../scripts/ico.mjs';
import { BUILDS, rejectReason, copyInstallersToRoot } from '../scripts/platform-build.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function solidRgba(size, r, g, b, a = 255) {
  const out = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = a;
  }
  return out;
}

function parseIco(buf) {
  const b = Buffer.from(buf);
  const count = b.readUInt16LE(4);
  const frames = [];
  let p = 6;
  for (let i = 0; i < count; i++) {
    const w = b[p] || 256;
    const size = b.readUInt32LE(p + 8);
    const off = b.readUInt32LE(p + 12);
    const png = b[off] === 0x89 && b[off + 1] === 0x50;
    frames.push({ w, size, off, kind: png ? 'PNG' : 'BMP' });
    p += 16;
  }
  return frames;
}

test('an ICO with rgba is BMP at every size, including 256', () => {
  const dummyPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  const buf = encodeIco([
    { size: 16, png: dummyPng, rgba: solidRgba(16, 29, 78, 216) },
    { size: 32, png: dummyPng, rgba: solidRgba(32, 29, 78, 216) },
    { size: 256, png: dummyPng, rgba: solidRgba(256, 29, 78, 216) },
  ]);
  const frames = parseIco(buf);
  assert.deepEqual(frames.map((f) => [f.w, f.kind]), [[16, 'BMP'], [32, 'BMP'], [256, 'BMP']]);
  const f16 = frames[0];
  const b = Buffer.from(buf);
  assert.equal(b.readInt32LE(f16.off + 4), 16);
  assert.equal(b.readInt32LE(f16.off + 8), 32);
  assert.equal(b[f16.off + 40 + 2], 29);   // BGRA: R at +2 of first pixel (bottom row)
});

test('prepare:assets keeps the window icon in sync with assets/icon.svg', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(pkg.scripts['prepare:assets'], /generate-icons\.mjs --if-needed/);
  const sync = fs.readFileSync(path.join(root, 'scripts', 'sync-tauri-icons.mjs'), 'utf8');
  assert.match(sync, /generate-icons\.mjs/);
  assert.match(sync, /icon\.ico/);
  assert.match(sync, /src-tauri/);
  assert.equal(pkg.scripts['build:web'], 'npm run prepare:assets && vite build');
  assert.equal(pkg.scripts['build:win'], 'node scripts/platform-build.mjs win');
  assert.equal(pkg.scripts['build:linux'], 'node scripts/platform-build.mjs linux');
  assert.equal(pkg.scripts['build:mac'], 'node scripts/platform-build.mjs mac');
  const conf = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
  assert.ok(conf.bundle.icon.includes('icons/icon.ico'));
  assert.equal(conf.bundle.windows.nsis.installerIcon, 'icons/icon.ico');
  assert.equal(conf.bundle.windows.nsis.uninstallerIcon, 'icons/icon.ico');
  assert.equal(conf.bundle.windows.nsis.displayLanguageSelector, true);
  assert.equal(conf.bundle.windows.nsis.languages[0], 'Korean');
  assert.ok(conf.bundle.windows.nsis.languages.includes('English'));
  assert.equal(conf.bundle.windows.nsis.customLanguageFiles.Hebrew, 'nsis/Hebrew.nsh');
  assert.match(fs.readFileSync(path.join(root, 'src-tauri', 'nsis', 'Hebrew.nsh'), 'utf8'), /\$\{LANG_HEBREW\}/);
  assert.deepEqual(conf.bundle.targets, ['nsis', 'deb', 'appimage', 'app', 'dmg']);
});

test('linux and macOS installers are built on that operating system', () => {
  assert.equal(BUILDS.linux.bundles, 'deb,appimage');
  assert.equal(BUILDS.mac.bundles, 'app,dmg');
  assert.equal(BUILDS.win.bundles, 'nsis');
  assert.equal(rejectReason('win', 'win32'), null);
  assert.equal(rejectReason('linux', 'linux'), null);
  assert.equal(rejectReason('mac', 'darwin'), null);
  assert.match(rejectReason('linux', 'win32'), /Run this on Linux/);
  assert.match(rejectReason('mac', 'win32'), /Run this on macOS/);
});

test('installer files are copied to the project root', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'med-build-'));
  const bundle = path.join(tmp, 'bundle');
  const project = path.join(tmp, 'project');
  fs.mkdirSync(path.join(bundle, 'nsis'), { recursive: true });
  fs.mkdirSync(path.join(bundle, 'macos', 'My Editor.app'), { recursive: true });
  fs.mkdirSync(project);
  fs.writeFileSync(path.join(bundle, 'nsis', 'My Editor_1.1.0_x64-setup.exe'), 'exe');
  fs.writeFileSync(path.join(bundle, 'macos', 'My Editor.app', 'bin'), 'app');
  const copied = copyInstallersToRoot(project, bundle);
  assert.equal(fs.readFileSync(path.join(project, 'My Editor_1.1.0_x64-setup.exe'), 'utf8'), 'exe');
  assert.equal(fs.readFileSync(path.join(project, 'My Editor.app', 'bin'), 'utf8'), 'app');
  assert.equal(copied.length, 2);
  fs.rmSync(tmp, { recursive: true, force: true });
});

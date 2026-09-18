import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeIco } from '../scripts/ico.mjs';

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

test('the installer pins shortcuts to MyEditor.ico next to the exe', () => {
  const nsh = fs.readFileSync(path.join(root, 'build', 'installer.nsh'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(nsh, /\$INSTDIR\\MyEditor\.ico/);
  assert.match(nsh, /\$\{FileExists\} "\$R0"/);
  assert.match(nsh, /WinShell::SetLnkAUMI/);
  const extra = pkg.build.extraFiles || [];
  assert.ok(extra.some((x) => x.to === 'MyEditor.ico'));
  assert.ok(extra.some((x) => String(x.to).includes('VisualElementsManifest')));
});

test('CreateShortCut must not pass the long package description', () => {
  const nsh = fs.readFileSync(path.join(root, 'build', 'installer.nsh'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.ok(pkg.description.length > 260, 'package description is long enough to overflow an .lnk comment');
  const creates = nsh.match(/^\s*CreateShortCut[^\n]+/gm) || [];
  assert.ok(creates.length >= 2);
  for (const line of creates) {
    assert.doesNotMatch(line, /APP_DESCRIPTION/);
    assert.match(line, /\$\{PRODUCT_NAME\}/);
  }
});

test('Windows taskbar identity is stamped onto shortcuts', () => {
  const main = fs.readFileSync(path.join(root, 'electron', 'main.js'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const ps1 = fs.readFileSync(path.join(root, 'scripts', 'set-lnk-aumi.ps1'), 'utf8');
  const nsh = fs.readFileSync(path.join(root, 'build', 'installer.nsh'), 'utf8');
  assert.match(main, /stampShortcutAumi/);
  assert.match(main, /setAppUserModelId\(APP_ID\)/);
  assert.match(main, /shortcutIconPath/);
  assert.doesNotMatch(main, /setOpacity\(0\)/);
  assert.match(ps1, /PKEY_AppUserModel|9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3/);
  assert.match(ps1, /IconLocation/);
  assert.match(ps1, /MyEditor\.ico/);
  assert.match(nsh, /set-lnk-aumi\.ps1/);
  const extra = pkg.build.extraResources || [];
  assert.ok(extra.some((x) => x.to === 'set-lnk-aumi.ps1'));
});

test('prepare:assets keeps the window / shortcut icon in sync with assets/icon.svg', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(pkg.scripts['prepare:assets'], /generate-icons\.mjs --if-needed/);
  const gen = fs.readFileSync(path.join(root, 'scripts', 'generate-icons.mjs'), 'utf8');
  assert.match(gen, /copyForBuilder/);
  assert.match(gen, /for \(const name of \['icon\.ico', 'icon\.png'\]\)/);
});

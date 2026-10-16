'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { icons } = require('../tools/icons');
const { THEMES, OPACITIES } = require('../src/shared/themes.json');

const ASSETS = path.join(__dirname, '..', 'src', 'assets');

function readPngSize(file) {
  const buf = fs.readFileSync(file);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.deepEqual(buf.subarray(0, 8), signature, `${path.basename(file)} is not a PNG`);
  assert.equal(buf.subarray(12, 16).toString('latin1'), 'IHDR');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bytes: buf.length };
}

function menuNames() {
  const names = Object.keys(icons).filter((name) => name !== 'app' && name !== 'tray');
  for (const theme of THEMES) names.push(`theme-${theme.id}`, `color-${theme.id}`);
  for (const value of OPACITIES) names.push(`opacity-${Math.round(value * 100)}`);
  return names;
}

test('all app and tray images exist', () => {
  for (const name of ['icon.png', 'icon.ico', 'icon.icns', 'tray.png', 'tray@2x.png']) {
    assert.ok(fs.existsSync(path.join(ASSETS, name)), `src/assets/${name} is missing`);
  }
  assert.deepEqual(readPngSize(path.join(ASSETS, 'icon.png')), { width: 256, height: 256, bytes: readPngSize(path.join(ASSETS, 'icon.png')).bytes });
  assert.equal(readPngSize(path.join(ASSETS, 'tray.png')).width, 16);
  assert.equal(readPngSize(path.join(ASSETS, 'tray@2x.png')).width, 32);
});

test('menu images exist in both 16px and 32px sizes', () => {
  for (const name of menuNames()) {
    const one = path.join(ASSETS, 'menu', `${name}.png`);
    const two = path.join(ASSETS, 'menu', `${name}@2x.png`);
    assert.ok(fs.existsSync(one), `assets/menu/${name}.png is missing`);
    assert.ok(fs.existsSync(two), `assets/menu/${name}@2x.png is missing`);
    assert.equal(readPngSize(one).width, 16, `${name} must be 16px wide`);
    assert.equal(readPngSize(two).width, 32, `${name}@2x must be 32px wide`);
  }
});

test('no blank images are mixed in', () => {
  for (const name of menuNames()) {
    const size = readPngSize(path.join(ASSETS, 'menu', `${name}.png`));
    assert.ok(size.bytes > 100, `${name} is too small (${size.bytes}B)`);
  }
});

test('ico contains multiple sizes', () => {
  const buf = fs.readFileSync(path.join(ASSETS, 'icon.ico'));
  assert.equal(buf.readUInt16LE(0), 0);
  assert.equal(buf.readUInt16LE(2), 1, 'must be an icon type');
  const count = buf.readUInt16LE(4);
  assert.ok(count >= 5, `only ${count} sizes`);
  // Check that each entry points inside the file and starts with a PNG signature.
  for (let i = 0; i < count; i += 1) {
    const at = 6 + i * 16;
    const length = buf.readUInt32LE(at + 8);
    const offset = buf.readUInt32LE(at + 12);
    assert.ok(offset + length <= buf.length, `image ${i} points outside the file`);
    assert.equal(buf[offset], 137, `image ${i} is not a PNG`);
  }
});

test('icns header is valid', () => {
  const buf = fs.readFileSync(path.join(ASSETS, 'icon.icns'));
  assert.equal(buf.subarray(0, 4).toString('latin1'), 'icns');
  assert.equal(buf.readUInt32BE(4), buf.length, 'recorded length must match actual length');
});

test('there are thirty themes, each with a preview image', () => {
  assert.equal(THEMES.length, 30, `there are ${THEMES.length} themes`);
  const ids = new Set(THEMES.map((theme) => theme.id));
  assert.equal(ids.size, THEMES.length, 'theme ids overlap');
  for (const theme of THEMES) {
    const file = path.join(ASSETS, 'menu', `theme-${theme.id}.png`);
    assert.ok(fs.existsSync(file), `${theme.label} preview is missing`);
    assert.match(theme.bg, /^#[0-9a-f]{6}$/i, `${theme.label} has an invalid background color`);
    assert.match(theme.bar, /^#[0-9a-f]{6}$/i, `${theme.label} has an invalid title bar color`);
    assert.match(theme.text, /^#[0-9a-f]{6}$/i, `${theme.label} has an invalid text color`);
  }
});

test('each theme has a distinct preview image', () => {
  const seen = new Map();
  for (const theme of THEMES) {
    const bytes = fs.readFileSync(path.join(ASSETS, 'menu', `theme-${theme.id}.png`)).toString('base64');
    assert.ok(!seen.has(bytes), `${theme.label} and ${seen.get(bytes)} have the same image`);
    seen.set(bytes, theme.label);
  }
});

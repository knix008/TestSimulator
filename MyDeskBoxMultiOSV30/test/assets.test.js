'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { icons } = require('../tools/icons');
const { THEMES, OPACITIES } = require('../src/main/themes');

const ASSETS = path.join(__dirname, '..', 'assets');

function readPngSize(file) {
  const buf = fs.readFileSync(file);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.deepEqual(buf.subarray(0, 8), signature, `${path.basename(file)} 가 PNG 가 아니다`);
  assert.equal(buf.subarray(12, 16).toString('latin1'), 'IHDR');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bytes: buf.length };
}

function menuNames() {
  const names = Object.keys(icons).filter((name) => name !== 'app' && name !== 'tray');
  for (const theme of THEMES) names.push(`theme-${theme.id}`, `color-${theme.id}`);
  for (const value of OPACITIES) names.push(`opacity-${Math.round(value * 100)}`);
  return names;
}

test('앱과 트레이 그림이 모두 있다', () => {
  for (const name of ['icon.png', 'icon.ico', 'icon.icns', 'tray.png', 'tray@2x.png']) {
    assert.ok(fs.existsSync(path.join(ASSETS, name)), `assets/${name} 가 없다`);
  }
  assert.deepEqual(readPngSize(path.join(ASSETS, 'icon.png')), { width: 256, height: 256, bytes: readPngSize(path.join(ASSETS, 'icon.png')).bytes });
  assert.equal(readPngSize(path.join(ASSETS, 'tray.png')).width, 16);
  assert.equal(readPngSize(path.join(ASSETS, 'tray@2x.png')).width, 32);
});

test('메뉴 그림은 16 과 32 두 벌이 모두 있다', () => {
  for (const name of menuNames()) {
    const one = path.join(ASSETS, 'menu', `${name}.png`);
    const two = path.join(ASSETS, 'menu', `${name}@2x.png`);
    assert.ok(fs.existsSync(one), `assets/menu/${name}.png 가 없다`);
    assert.ok(fs.existsSync(two), `assets/menu/${name}@2x.png 가 없다`);
    assert.equal(readPngSize(one).width, 16, `${name} 는 16 이어야 한다`);
    assert.equal(readPngSize(two).width, 32, `${name}@2x 는 32 여야 한다`);
  }
});

test('빈 그림이 섞여 있지 않다', () => {
  for (const name of menuNames()) {
    const size = readPngSize(path.join(ASSETS, 'menu', `${name}.png`));
    assert.ok(size.bytes > 100, `${name} 이 너무 작다 (${size.bytes}B)`);
  }
});

test('ico 는 여러 크기를 담고 있다', () => {
  const buf = fs.readFileSync(path.join(ASSETS, 'icon.ico'));
  assert.equal(buf.readUInt16LE(0), 0);
  assert.equal(buf.readUInt16LE(2), 1, '아이콘 형식이어야 한다');
  const count = buf.readUInt16LE(4);
  assert.ok(count >= 5, `크기가 ${count}개뿐이다`);
  // 각 항목이 가리키는 자리가 파일 안에 있고 PNG 로 시작하는지 본다.
  for (let i = 0; i < count; i += 1) {
    const at = 6 + i * 16;
    const length = buf.readUInt32LE(at + 8);
    const offset = buf.readUInt32LE(at + 12);
    assert.ok(offset + length <= buf.length, `${i}번 그림이 파일 밖을 가리킨다`);
    assert.equal(buf[offset], 137, `${i}번 그림이 PNG 가 아니다`);
  }
});

test('icns 머리말이 올바르다', () => {
  const buf = fs.readFileSync(path.join(ASSETS, 'icon.icns'));
  assert.equal(buf.subarray(0, 4).toString('latin1'), 'icns');
  assert.equal(buf.readUInt32BE(4), buf.length, '적어 둔 길이와 실제 길이가 같아야 한다');
});

test('테마는 서른 가지이고 저마다 미리보기 그림이 있다', () => {
  assert.equal(THEMES.length, 30, `테마가 ${THEMES.length}개다`);
  const ids = new Set(THEMES.map((theme) => theme.id));
  assert.equal(ids.size, THEMES.length, '테마 이름이 겹친다');
  for (const theme of THEMES) {
    const file = path.join(ASSETS, 'menu', `theme-${theme.id}.png`);
    assert.ok(fs.existsSync(file), `${theme.label} 미리보기가 없다`);
    assert.match(theme.bg, /^#[0-9a-f]{6}$/i, `${theme.label} 의 바탕색이 이상하다`);
    assert.match(theme.bar, /^#[0-9a-f]{6}$/i, `${theme.label} 의 제목색이 이상하다`);
    assert.match(theme.text, /^#[0-9a-f]{6}$/i, `${theme.label} 의 글씨색이 이상하다`);
  }
});

test('테마마다 미리보기 그림이 서로 다르다', () => {
  const seen = new Map();
  for (const theme of THEMES) {
    const bytes = fs.readFileSync(path.join(ASSETS, 'menu', `theme-${theme.id}.png`)).toString('base64');
    assert.ok(!seen.has(bytes), `${theme.label} 과 ${seen.get(bytes)} 의 그림이 같다`);
    seen.set(bytes, theme.label);
  }
});

// Pure front-end modules: the text column's character sets, the hex view's number formats, settings, icons
// and texts used by the commands.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeChar, textCells, CHARSETS } from '../../src/hex/charsets.js';
import { formatByte, formatOffset, offsetDigits } from '../../src/hex/hexview.js';
import { defaultSettings, normalizeSettings } from '../../src/domain/settings.js';

test('text column: single-byte sets, UTF-8 across rows, UTF-16, EUC-KR', () => {
  assert.deepEqual(textCells(Uint8Array.of(0x41, 0x00, 0x80), 0, 'cp1252').map((c) => c.text), ['A', '', '€']);
  assert.equal(textCells(Uint8Array.of(0xC1), 0, 'ebcdic')[0].text, 'A');
  assert.equal(textCells(Uint8Array.of(0xB0), 0, 'cp437')[0].text, '░');
  const utf8 = new TextEncoder().encode('A한글');
  const second = textCells(utf8.subarray(2), 2, 'utf8', utf8.subarray(0, 2));
  assert.deepEqual(second.map((c) => [c.text, c.cont]), [['', true], ['', true], ['글', false], ['', true], ['', true]]);
  const u16 = Uint8Array.of(0x41, 0, 0x00, 0xAC);
  assert.deepEqual(textCells(u16, 0, 'utf16le').map((c) => c.text), ['A', '', '가', '']);
  assert.equal(textCells(Uint8Array.of(0xB0, 0xA1), 0, 'euc-kr')[0].text, '가');
  for (const cs of CHARSETS) assert.equal(textCells(Uint8Array.of(0x41), 0, cs).length, 1, cs);
});

test('typed characters become bytes in the character set', () => {
  assert.deepEqual([...encodeChar('é', 'cp1252')], [0xE9]);
  assert.deepEqual([...encodeChar('A', 'ebcdic')], [0xC1]);
  assert.deepEqual([...encodeChar('가', 'utf8')], [0xEA, 0xB0, 0x80]);
  assert.deepEqual([...encodeChar('가', 'utf16be')], [0xAC, 0x00]);
  assert.equal(encodeChar('가', 'ascii'), null);
});

test('offsets and byte values in every base', () => {
  assert.equal(formatOffset(255, 'hex', 8), '000000FF');
  assert.equal(formatOffset(255, 'dec', 10), '0000000255');
  assert.equal(formatOffset(8, 'oct', 4), '0010');
  assert.equal(offsetDigits(0x1_0000_0000, 'hex'), 9);
  assert.equal(formatByte(10, 'hex', false), '0a');
  assert.equal(formatByte(10, 'bin', true), '00001010');
  assert.equal(formatByte(10, 'oct', true), '012');
});

test('settings are repaired', () => {
  const s = normalizeSettings({ bytesPerRow: 999, groupSize: 3, charset: 'klingon', valueBase: 'bin', hexFontSize: 2, leftTab: 'search', rightTab: 'stats' }, 'ko');
  assert.equal(s.bytesPerRow, 128);
  assert.equal(s.groupSize, 1);
  assert.equal(s.charset, 'cp1252');
  assert.equal(s.valueBase, 'bin');
  assert.equal(s.hexFontSize, 9);
  assert.equal(s.leftTab, 'explorer');
  assert.equal(s.rightTab, 'stats');
  assert.equal(defaultSettings('en').language, 'en');
});

test('animation speed 0–100 keeps the old ratio (0–300 %) and the pace scales linearly', async () => {
  const { animationPace } = await import('../../src/domain/settings.js');
  assert.equal(normalizeSettings({ animationSpeed: 300 }, 'ko').animationSpeed, 100);
  assert.equal(normalizeSettings({ animationSpeed: 150 }, 'ko').animationSpeed, 50);
  assert.equal(normalizeSettings({ animationSpeed: 100 }, 'ko').animationSpeed, 33);
  assert.equal(normalizeSettings({ animationSpeed: 80, animationSpeedScale: 100 }, 'ko').animationSpeed, 80);
  assert.equal(normalizeSettings({ animationSpeed: 250, animationSpeedScale: 100 }, 'ko').animationSpeed, 100);
  assert.equal(defaultSettings('ko').animationSpeed, 33);
  assert.equal(animationPace(0), 0);
  assert.equal(animationPace(100), 3);
  assert.equal(animationPace(50), 1.5);
});

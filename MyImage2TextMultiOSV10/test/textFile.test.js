import assert from 'node:assert/strict';
import test from 'node:test';
import { STYLE_PRESETS } from '../src/converter.js';
import {
  BRAILLE_BLANK,
  alignsInEveryEditor,
  normalizeNewlines,
  toClipboardText,
  toTextFile,
} from '../src/plainText.js';

const WIDE = [
  [0x1100, 0x115f], [0x231a, 0x231b], [0x2329, 0x232a], [0x2630, 0x2637], [0x268a, 0x268f], [0x23e9, 0x23ec], [0x23f0, 0x23f0], [0x23f3, 0x23f3],
  [0x25fd, 0x25fe], [0x2614, 0x2615], [0x2648, 0x2653], [0x267f, 0x267f], [0x2693, 0x2693],
  [0x26a1, 0x26a1], [0x26aa, 0x26ab], [0x26bd, 0x26be], [0x26c4, 0x26c5], [0x26ce, 0x26ce],
  [0x26d4, 0x26d4], [0x26ea, 0x26ea], [0x26f2, 0x26f3], [0x26f5, 0x26f5], [0x26fa, 0x26fa],
  [0x26fd, 0x26fd], [0x2705, 0x2705], [0x270a, 0x270b], [0x2728, 0x2728], [0x274c, 0x274c],
  [0x274e, 0x274e], [0x2753, 0x2755], [0x2757, 0x2757], [0x2795, 0x2797],
  [0x27b0, 0x27b0], [0x27bf, 0x27bf], [0x2b1b, 0x2b1c], [0x2b50, 0x2b50], [0x2b55, 0x2b55],
  [0x2e80, 0xa4cf], [0xac00, 0xd7a3], [0xf900, 0xfaff], [0xfe30, 0xfe4f], [0xff00, 0xff60],
  [0xffe0, 0xffe6], [0x1f300, 0x1faff],
];
const isWide = (glyph) => {
  const point = glyph.codePointAt(0);
  return WIDE.some(([first, last]) => point >= first && point <= last);
};

test('text files are utf-8 with bom, crlf lines and a final newline', () => {
  const file = toTextFile('ab\ncd\nef');
  assert.equal(file, '\uFEFFab\r\ncd\r\nef\r\n');
  assert.deepEqual([...new TextEncoder().encode(file).subarray(0, 3)], [0xef, 0xbb, 0xbf]);
});

test('mixed and doubled line endings collapse to one per line', () => {
  assert.equal(normalizeNewlines('a\r\nb\rc\nd'), 'a\nb\nc\nd');
  assert.equal(toTextFile('a\r\nb\r\r\n'), '\uFEFFa\r\nb\r\n');
  assert.equal(toTextFile('a\r\n\r\n'), '\uFEFFa\r\n');
  assert.equal(toClipboardText('a\r\nb\r\n'), 'a\nb');
});

test('every saved line keeps the same number of glyphs', () => {
  const lines = ['█▓ ▒', '⣿⡇⠀⠀', '@#. '];
  const file = toTextFile(lines.join('\n'));
  const saved = file.slice(1).split('\r\n').slice(0, -1);
  assert.deepEqual(saved, lines);
  for (const line of saved) assert.equal(Array.from(line).length, 4);
});

test('braille blank is the empty braille cell, not a space', () => {
  const braille = STYLE_PRESETS.find((style) => style.id === 'Braille');
  const glyphs = Array.from(braille.chars);
  assert.equal(glyphs.at(-1), BRAILLE_BLANK);
  for (const glyph of glyphs) {
    const point = glyph.codePointAt(0);
    assert.ok(point >= 0x2800 && point <= 0x28ff, `U+${point.toString(16)}`);
  }
});

test('editor-safe styles are pure ascii or pure braille', () => {
  const safe = STYLE_PRESETS.filter((style) => alignsInEveryEditor(style.chars)).map((style) => style.id);
  assert.deepEqual(safe, ['Detailed', 'Letters', 'Fine', 'Digits', 'Braille', 'Marks']);
  assert.equal(alignsInEveryEditor('@#\r\n. '), true);
  assert.equal(alignsInEveryEditor('⣿⡇\n⠀⠀'), true);
  assert.equal(alignsInEveryEditor('⣿ '), false);
  assert.equal(alignsInEveryEditor('█ '), false);
});

test('no style uses a glyph that is always double width', () => {
  for (const style of STYLE_PRESETS) {
    const wide = Array.from(style.chars).filter(isWide);
    assert.deepEqual(wide, [], style.id);
  }
});

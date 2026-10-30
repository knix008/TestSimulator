import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { terminalFontStack } from '../src/lib/settings.js';

const require = createRequire(import.meta.url);
const { listInstalledFonts, defaultTerminalFont, sanitizeFontName, clampFontSize, cssFontStack } = require('../core/fonts');

test('fonts: listInstalledFonts returns unique family names', () => {
  const fonts = listInstalledFonts();
  assert.ok(Array.isArray(fonts) && fonts.length >= 1);
  assert.ok(fonts.every((n) => typeof n === 'string' && n.trim() && !n.includes(';')));
  assert.equal(new Set(fonts.map((n) => n.toLowerCase())).size, fonts.length);
  const def = defaultTerminalFont(fonts);
  assert.ok(fonts.some((n) => n.toLowerCase() === def.toLowerCase()) || def === 'monospace');
  if (process.platform === 'win32') {
    assert.ok(fonts.some((n) => /consolas|cascadia|courier|malgun|gulim|dotum/i.test(n)), `expected a Windows UI font, got ${fonts.slice(0, 8).join(', ')}`);
  }
});

test('fonts: sanitize and clamp', () => {
  assert.equal(sanitizeFontName('Consolas'), 'Consolas');
  assert.equal(sanitizeFontName('Bad"; font'), 'Bad font');
  assert.equal(clampFontSize(13), 13);
  assert.equal(clampFontSize(4), 8);
  assert.equal(clampFontSize(99), 32);
  assert.match(cssFontStack('Cascadia Code'), /"Cascadia Code"/);
  assert.match(cssFontStack('Consolas'), /^Consolas,/);
  assert.match(terminalFontStack('Malgun Gothic'), /"Malgun Gothic"/);
  assert.match(terminalFontStack(''), /monospace/);
});

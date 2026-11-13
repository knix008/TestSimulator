// Progress windows show an icon that fits the job (src/ui/progressicons.js): every job title the code passes to
// withProgress / busy / inSteps has its own icon (not the generic hourglass), each icon exists and draws something,
// and each title has its Korean and English text.
// Run: node --test test/unit/progress-icons.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROGRESS_ICONS } from '../../src/ui/progressicons.js';
import { icon } from '../../src/icons.js';
import { DICTIONARIES } from '../../src/i18n.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sources = (dir) => readdirSync(dir).flatMap((f) => { const p = path.join(dir, f); return statSync(p).isDirectory() ? sources(p) : p.endsWith('.js') ? [p] : []; });

/** Job titles used in the code: withProgress('key' …), busy('key' …), inSteps('key' …). */
function usedTitles() {
  const keys = new Set();
  for (const file of sources(path.join(root, 'src'))) {
    for (const m of readFileSync(file, 'utf8').matchAll(/\b(?:withProgress|busy|inSteps)\(\s*'([a-zA-Z0-9.]+)'/g)) keys.add(m[1]);
  }
  return [...keys].sort();
}

test('every progress job in the code has its own icon', () => {
  const used = usedTitles();
  assert.ok(used.length >= 15, `${used.length} job titles found`);
  const missing = used.filter((k) => !PROGRESS_ICONS[k]);
  assert.deepEqual(missing, [], `jobs without an icon (they would show the hourglass): ${missing.join(', ')}`);
});

test('each icon exists and draws something', () => {
  for (const [key, glyph] of Object.entries(PROGRESS_ICONS)) {
    const svg = icon(glyph);
    assert.match(svg, /<(path|rect|circle|polyline|line|polygon|ellipse)\b/, `${key}: icon "${glyph}" draws nothing`);
    assert.notEqual(glyph, 'hourglass', `${key}: a fitting icon, not the generic hourglass`);
  }
});

test('each job title has its Korean and English text', () => {
  const { ko, en } = DICTIONARIES;
  for (const key of Object.keys(PROGRESS_ICONS)) {
    assert.ok(ko[key], `${key}: no Korean text`);
    assert.ok(en[key], `${key}: no English text`);
  }
});

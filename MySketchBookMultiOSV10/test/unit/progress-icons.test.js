// Progress windows show an icon that fits the job (src/ui/progressicons.js): every job title the code passes to
// withProgress / busy / inSteps has its own icon (not the generic hourglass), each icon exists and draws something,
// and each title has its Korean and English text.
// Run: node --test test/unit/progress-icons.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROGRESS_ICONS, PROGRESS_NAME_ICONS, PROGRESS_STEP_ICONS } from '../../src/ui/progressicons.js';
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

/** Steps named in the code: inSteps' step('key' …), and the keys reports take their icon from. */
function usedSteps() {
  const keys = new Set();
  for (const file of sources(path.join(root, 'src'))) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/\bstep\(\s*(?:[^,()]*\?\s*)?'(progress\.step\.[a-zA-Z0-9]+)'(?:\s*:\s*'(progress\.step\.[a-zA-Z0-9]+)')?/g)) { keys.add(m[1]); if (m[2]) keys.add(m[2]); }
    for (const m of text.matchAll(/PROGRESS_STEP_ICONS\['([a-zA-Z0-9.]+)'\]/g)) keys.add(m[1]);
  }
  return [...keys].sort();
}

test('every step of a job shows an icon of what it does, with its text', () => {
  const used = usedSteps();
  assert.ok(used.length >= 12, `${used.length} steps found`);
  const missing = used.filter((k) => !PROGRESS_STEP_ICONS[k]);
  assert.deepEqual(missing, [], `steps without an icon: ${missing.join(', ')}`);
  const { ko, en } = DICTIONARIES;
  for (const [key, glyph] of Object.entries({ ...PROGRESS_STEP_ICONS, ...PROGRESS_NAME_ICONS })) {
    assert.match(icon(glyph), /<(path|rect|circle|polyline|line|polygon|ellipse)\b/, `${key}: icon "${glyph}" draws nothing`);
    assert.ok(ko[key] && en[key], `${key}: Korean and English text`);
  }
});

test('each job title has its Korean and English text', () => {
  const { ko, en } = DICTIONARIES;
  for (const key of Object.keys(PROGRESS_ICONS)) {
    assert.ok(ko[key], `${key}: no Korean text`);
    assert.ok(en[key], `${key}: no English text`);
  }
});

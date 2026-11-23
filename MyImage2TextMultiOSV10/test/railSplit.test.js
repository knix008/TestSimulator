import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { RAIL_SPLIT, clampSplit } from '../src/railSplit.js';

test('the image list keeps at least its minimum height', () => {
  assert.equal(clampSplit(40, 800), RAIL_SPLIT.minTop);
  assert.equal(clampSplit(-500, 800), RAIL_SPLIT.minTop);
});

test('the conversion settings keep at least their minimum height', () => {
  assert.equal(clampSplit(790, 800), 800 - RAIL_SPLIT.minBottom);
  assert.equal(clampSplit(Infinity, 800), null);
  assert.equal(clampSplit(300, 800), 300);
});

test('a panel too small for both gives the image list its minimum', () => {
  assert.equal(clampSplit(200, 200), RAIL_SPLIT.minTop);
});

test('a value that is not a number is ignored', () => {
  assert.equal(clampSplit('abc', 800), null);
  assert.equal(clampSplit(250.6, 800), 251);
});

test('the divider sits between the image list and the conversion settings', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const sources = html.indexOf('<section class="sources">');
  const divider = html.indexOf('id="rail-split"');
  const settings = html.indexOf('<section class="settings"');
  assert.ok(sources > 0 && sources < divider && divider < settings);
  assert.match(html, /id="rail-split"[^>]*role="separator"/);
});

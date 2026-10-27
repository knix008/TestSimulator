// Help texts of buttons and labels (src/lib/help.json): every entry belongs to
// a label key of the app, has Korean and English text, and names no product.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const help = JSON.parse(fs.readFileSync(path.resolve('src/lib/help.json'), 'utf8'));
const i18n = fs.readFileSync(path.resolve('src/lib/i18n.js'), 'utf8');
const keys = new Set([...i18n.matchAll(/^ {2}([a-z0-9_]+):/gm)].map((m) => m[1]));

test('help entries explain existing labels in both languages', () => {
  const entries = Object.entries(help);
  assert.ok(entries.length >= 400, `only ${entries.length} entries`);
  for (const [k, v] of entries) {
    assert.ok(keys.has(k), `unknown label key ${k}`);
    assert.ok(v.ko && v.ko.trim() && v.en && v.en.trim(), `${k}: ko/en`);
    assert.doesNotMatch(v.ko + v.en, /sonar|coverity|sparrow/i, k);
  }
});

test('the main buttons and navigation items are explained', () => {
  for (const k of ['nav_issues', 'nav_overview', 'nav_arch', 'nav_his', 'settings', 'open_folder', 'run_analysis', 'xd_menu', 'ra_menu', 'rp_db_export']) {
    if (keys.has(k)) assert.ok(help[k], `no help for ${k}`);
  }
});

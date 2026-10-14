// Settings and translations.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dictionaries } from '../../src/i18n.js';
import { BLEND_MODES, COLOR_BANDS, EFFECTS } from '../../src/edit/advanced.js';
import { DEFAULTS, normalize, rememberFile, rememberFolder } from '../../src/settings.js';

const { en, ko } = dictionaries;
const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');

function sources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'i18n' ? [] : sources(full);
    return entry.name.endsWith('.js') ? [fs.readFileSync(full, 'utf8')] : [];
  });
}

// features: APP-SETTINGS FILE-RECENT
test('settings: defaults fill in, wrong types are ignored, limits apply', () => {
  const s = normalize({ theme: 'light', thumbSize: 9999, sort: { key: 'size', desc: 'yes' }, viewer: { wheel: 'zoom', bogus: 1 }, unknown: true, recentFolders: 'x' });
  assert.equal(s.theme, 'light');
  assert.equal(s.thumbSize, 400);
  assert.deepEqual(s.sort, { key: 'size', desc: false });
  assert.equal(s.viewer.wheel, 'zoom');
  assert.equal(s.viewer.bogus, undefined);
  assert.equal(s.unknown, undefined);
  assert.deepEqual(s.recentFolders, []);
  assert.equal(s.lastFolder, null);
  assert.deepEqual(normalize(null), JSON.parse(JSON.stringify(DEFAULTS)));
  for (let i = 0; i < 15; i++) rememberFolder(s, `/f${i % 13}`);
  assert.equal(s.recentFolders.length, 10, 'at most 10 recent folders');
  assert.equal(s.recentFolders[0], '/f1');
  assert.equal(s.lastFolder, '/f1');
  for (let i = 0; i < 12; i++) rememberFile(s, `/p${i}.jpg`);
  rememberFile(s, '/p5.jpg');
  assert.equal(s.recentFiles.length, 10, 'at most 10 recent files');
  assert.deepEqual(s.recentFiles.slice(0, 2), ['/p5.jpg', '/p11.jpg']);
});

// features: APP-LANG
test('Korean and English have the same keys', () => {
  const missingInKo = Object.keys(en).filter((k) => !(k in ko));
  const missingInEn = Object.keys(ko).filter((k) => !(k in en));
  assert.deepEqual(missingInKo, []);
  assert.deepEqual(missingInEn, []);
  for (const [key, text] of Object.entries(en)) {
    const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    assert.equal(placeholders(ko[key]), placeholders(text), `placeholders of ${key}`);
  }
});

test('every literal key the code uses exists', () => {
  const code = sources(src).join('\n');
  const used = new Set();
  for (const m of code.matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)) used.add(m[1]);
  for (const m of code.matchAll(/\bplural\('([a-zA-Z0-9_.]+)'/g)) { used.add(`${m[1]}.one`); used.add(`${m[1]}.other`); used.delete(m[1]); }
  for (const m of code.matchAll(/'(shortcut\.[a-zA-Z]+)'/g)) used.add(m[1]);
  used.delete('key');
  const missing = [...used].filter((key) => !(key in en));
  assert.deepEqual(missing, []);
});

test('keys built from values exist (labels, sort, groups, modes, panes, effects …)', () => {
  const families = {
    label: ['red', 'yellow', 'green', 'blue', 'purple'],
    sort: ['name', 'taken', 'modified', 'created', 'size', 'type', 'rating', 'label', 'dimensions', 'camera'],
    'group.by': ['none', 'day', 'month', 'year', 'folder', 'rating', 'label', 'type', 'camera'],
    mode: ['manage', 'view', 'edit', 'dashboard'],
    pane: ['folders', 'catalog', 'people', 'calendar', 'search', 'properties', 'preview', 'map'],
    viewStyle: ['thumbs', 'tiles', 'list', 'details', 'filmstrip'],
    auto: ['camera', 'lens', 'year', 'iso', 'focal', 'aperture', 'flash', 'orientation', 'gps', 'country', 'flash.on', 'flash.off', 'gps.yes', 'gps.no'],
    orientation: ['landscape', 'portrait', 'square'],
    effect: ['none', 'grayscale', 'sepia', 'invert', 'posterize', 'solarize', 'threshold', 'cool', 'warm', 'vintage'],
    slideshow: ['fade', 'slide', 'zoom', 'none'],
    column: ['name', 'size', 'type', 'modified', 'taken', 'dimensions', 'rating', 'label', 'camera'],
    place: ['home', 'pictures', 'desktop', 'documents', 'downloads'],
    shortcuts: ['manage', 'organize', 'view', 'edit'],
    'rename.problem': ['empty', 'duplicate', 'exists'],
    settings: ['system', 'dark', 'light'],
    organize: ['title', 'caption', 'author', 'notes'],
    edit: ['redeye', 'heal', 'redeyeHint', 'healHint', 'cloneHint', 'light', 'color', 'colorEq', 'lightEq', 'splitTone', 'levels', 'curves', 'detail', 'lens', 'geometry', 'local', 'repair', 'effects', 'draw', 'add', 'layers', 'presets', 'history'],
    'edit.local': ['gradient', 'radial', 'brush', 'gradientHint', 'radialHint', 'brushHint', 'hint'],
    fx: Object.keys(EFFECTS),
    fxParam: [...new Set(Object.values(EFFECTS).flatMap((e) => Object.entries(e.params).filter(([, spec]) => typeof spec.min === 'number').map(([key]) => key)))],
    blend: BLEND_MODES,
    band: COLOR_BANDS,
    anchor: ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'],
  };
  const missing = Object.entries(families).flatMap(([prefix, names]) => names.map((n) => `${prefix}.${n}`)).filter((key) => !(key in en) || !(key in ko));
  assert.deepEqual(missing, []);
});

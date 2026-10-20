// Every text key the UI asks for exists in Korean and English (a missing one
// would show its key on screen), including the keys built from lists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DICTS } from '../src/lib/i18n.js';
import { LAYOUTS, SUB_LAYOUTS } from '../src/lib/model.js';
import { SHAPES, LINE_STYLES } from '../src/lib/mapstyles.js';
import { MARKER_GROUPS } from '../src/lib/markers.js';
import { EXPORTS } from '../src/lib/formats/index.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
function* walk(dir) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) yield* walk(p); else if (/\.(jsx?|mjs)$/.test(p)) yield p; } }

function usedKeys() {
  const keys = new Set();
  for (const file of walk(root)) {
    const s = fs.readFileSync(file, 'utf8');
    for (const m of s.matchAll(/\bt\(\s*'([a-zA-Z0-9_]+)'/g)) keys.add(m[1]);
    for (const m of s.matchAll(/\b(?:tip|labelKey):\s*'([a-z][a-zA-Z0-9_]+)'/g)) keys.add(m[1]);
  }
  for (const l of LAYOUTS) keys.add(`layout_${l}`);
  for (const l of SUB_LAYOUTS) keys.add(`sublayout_${l}`);
  for (const s of SHAPES) keys.add(`shape_${s}`);
  for (const s of LINE_STYLES) keys.add(`line_${s}`);
  for (const g of MARKER_GROUPS) keys.add(`mk_group_${g}`);
  for (const e of EXPORTS) if (!e.picture) keys.add(`export_note_${e.id}`);
  for (const s of ['day', 'week', 'month']) keys.add(`gantt_${s}`);
  for (const a of ['left', 'center', 'right']) keys.add(`fmt_align_${a}`);
  for (let i = 0; i < 8; i++) { keys.add(`start_tip_${i}`); keys.add(`start_tip_${i}_more`); }
  for (const k of ['bg', 'panel', 'raised', 'hover', 'active', 'border', 'borderStrong', 'text', 'textDim', 'accent', 'accentStrong', 'accentText', 'folder', 'file', 'danger']) keys.add(`set_color_${k}`);
  return keys;
}

test('every UI text key exists in Korean and English', () => {
  const keys = usedKeys();
  const missing = [];
  for (const k of keys) for (const lang of ['ko', 'en']) if (!(k in DICTS[lang])) missing.push(`${lang}:${k}`);
  assert.deepEqual(missing, []);
});

test('Korean and English have the same keys and placeholders', () => {
  const { ko, en } = DICTS;
  assert.deepEqual(Object.keys(ko).filter((k) => !(k in en)), []);
  assert.deepEqual(Object.keys(en).filter((k) => !(k in ko)), []);
  const ph = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();
  assert.deepEqual(Object.keys(ko).filter((k) => ph(ko[k]) !== ph(en[k])), []);
});

test('every template and sample names an icon that exists', async () => {
  const { TEMPLATES } = await import('../src/lib/templates.js');
  const { SAMPLES } = await import('../src/lib/samples.js');
  const icons = fs.readFileSync(path.join(root, 'components', 'Icons.jsx'), 'utf8');
  const missing = [...TEMPLATES, ...SAMPLES].map((x) => x.icon).filter((n) => !new RegExp(`^  ${n}:`, 'm').test(icons));
  assert.deepEqual(missing, []);
});

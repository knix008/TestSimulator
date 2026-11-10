// Every UI string exists in Korean and English, and every icon the UI asks for exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ko from '../../src/i18n/ko.js';
import en from '../../src/i18n/en.js';
import { STYLES, STYLE_OPTION_KEYS, BACKGROUNDS } from '../../src/engine/styles.js';
import { EFFECTS } from '../../src/engine/effects.js';
import { WARP_KEYS } from '../../src/engine/warp.js';
import { FEATURE_POINTS } from '../../src/engine/face.js';
import { ANIMATIONS } from '../../src/domain/settings.js';
import { hasIcon, ICON_NAMES } from '../../src/icons.js';

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');
const files = [];
(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) { if (name !== 'i18n') walk(full); } else if (name.endsWith('.js')) files.push(full);
  }
}(src));
const sources = files.map((file) => fs.readFileSync(file, 'utf8'));

test('i18n: Korean and English have the same keys and no empty strings', () => {
  assert.deepEqual(Object.keys(ko).sort(), Object.keys(en).sort());
  for (const [key, value] of Object.entries(ko)) assert.ok(String(value).trim(), `ko ${key}`);
  for (const [key, value] of Object.entries(en)) assert.ok(String(value).trim(), `en ${key}`);
});

test('i18n: every key written in the code exists', () => {
  const used = new Set();
  for (const text of sources) {
    for (const m of text.matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)) used.add(m[1]);
    for (const m of text.matchAll(/label: '((?:action|tool)\.[a-zA-Z0-9.]+)'/g)) used.add(m[1]);
    for (const m of text.matchAll(/'((?:tool|op)\.[a-zA-Z.]+)'/g)) used.add(m[1]);
  }
  const missing = [...used].filter((key) => !(key in ko));
  assert.deepEqual(missing, []);
});

test('i18n: every style, effect, exaggeration, option and face point has its words', () => {
  const need = [];
  for (const s of STYLES) need.push(`style.${s.id}`, `style.${s.id}.desc`);
  for (const e of EFFECTS) {
    need.push(`effect.${e.id}`, `effect.${e.id}.desc`);
    for (const p of e.params) {
      need.push(`effect.param.${p.key}`);
      if (p.type === 'choice') for (const o of p.options) need.push(`effect.option.${o}`);
      if (p.type === 'text') need.push(`effect.placeholder.${e.id}`);
    }
  }
  for (const k of [...WARP_KEYS, 'strength']) need.push(`warp.${k}`, `warp.${k}.tip`);
  for (const k of STYLE_OPTION_KEYS) need.push(`option.${k}`, `option.${k}.tip`);
  for (const b of BACKGROUNDS) need.push(`option.background.${b}`);
  for (const p of FEATURE_POINTS) need.push(`face.point.${p}`);
  for (const m of ['landmarks', 'skin', 'default', 'manual']) need.push(`face.method.${m}`);
  for (const m of ['model', 'shape']) need.push(`face.mask.${m}`);
  for (const a of ANIMATIONS) need.push(`animation.${a}`);
  for (const k of ['style', 'none', 'random', 'personal']) need.push(`op.warp.${k}`);
  for (const k of ['file', 'edit', 'caricature', 'effects', 'view', 'help']) need.push(`menu.${k}`);
  const missing = need.filter((key) => !(key in ko) || !(key in en));
  assert.deepEqual(missing, []);
});

test('icons: styles, effects and every icon named in the code exist', () => {
  for (const s of STYLES) assert.ok(hasIcon(s.icon), s.icon);
  for (const e of EFFECTS) assert.ok(hasIcon(e.icon), e.icon);
  const named = new Set();
  for (const text of sources) {
    for (const m of text.matchAll(/\bicon\('([a-zA-Z0-9]+)'/g)) named.add(m[1]);
    for (const m of text.matchAll(/\bicon: '([a-zA-Z0-9]+)'/g)) named.add(m[1]);
  }
  const missing = [...named].filter((name) => !hasIcon(name));
  assert.deepEqual(missing, []);
  assert.ok(ICON_NAMES.length > 300);
});

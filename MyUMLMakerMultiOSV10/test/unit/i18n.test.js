// Every text key the UI uses exists in Korean and English, with the same
// {placeholders}; dynamic keys (element fields and enum values, templates,
// related elements, line styles, codegen options, tutorial steps …) are
// expanded from the lists they come from.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ko from '../../src/i18n/ko.js';
import en from '../../src/i18n/en.js';
import { ANIMATIONS, BACKGROUND_FITS, FONT_WEIGHTS, LINE_STYLES, DIAGRAM_THEME_IDS } from '../../src/domain/settings.js';
import { TYPES } from '../../src/domain/meta.js';
import { TEMPLATES } from '../../src/domain/templates.js';
import { RELATED } from '../../src/domain/edit.js';
import { LAYOUT_DIRECTIONS } from '../../src/domain/layout.js';
import { DEFAULT_CODEGEN_OPTIONS } from '../../src/domain/codegen/index.js';
import { CUSTOM_KEYS } from '../../src/themes.js';
import { FITS, MARGINS, RANGES } from '../../src/print/render.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sources = [];
const walk = (dir) => {
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    if (fs.statSync(file).isDirectory()) { if (name !== 'i18n') walk(file); } else if (name.endsWith('.js')) sources.push(file);
  }
};
walk(path.join(root, 'src'));
const text = sources.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const appText = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');

/** Namespaces whose literal keys are checked (the code's own, not element type names). */
const NAMESPACES = ['about', 'action', 'canvas', 'codegen', 'color', 'common', 'confirm', 'db', 'doc', 'drop', 'editors', 'error', 'explorer', 'find', 'image', 'members', 'menu', 'notice', 'op', 'panel', 'present', 'print', 'progress', 'props', 'quick', 'reader', 'recent', 'reverse', 'settings', 'start', 'stats', 'status', 'style', 'submenu', 'tabs', 'tags', 'textImport', 'tip', 'toolbox', 'tutorial', 'validation', 'welcome'];

/** Every quoted string in the sources that looks like a key of a known namespace. */
function literalKeys() {
  const keys = new Set();
  for (const match of text.matchAll(/'([a-z][a-zA-Z]*\.[a-zA-Z0-9_.]+)'/g)) {
    const key = match[1];
    if (!NAMESPACES.includes(key.split('.')[0])) continue;
    if (/\.(js|css|png|svg|html|json|mjs|myuml|mumlt|mdj|mfj|xml|csv|md|ico|pdf|zip|sql)$/.test(key)) continue;
    keys.add(key);
  }
  return keys;
}

const STEP_IDS = [...fs.readFileSync(path.join(root, 'src', 'ui', 'tutorial.js'), 'utf8').matchAll(/\{ id: '(\w+)', chapter: '(\w+)'/g)].map((m) => m[1]);
const CHAPTERS = JSON.parse(/export const CHAPTERS = (\[[^\]]+\])/.exec(fs.readFileSync(path.join(root, 'src', 'ui', 'tutorial.js'), 'utf8'))[1].replace(/'/g, '"'));
const MENU_NAMES = [.../const MENUS = \{([\s\S]*?)\n\};/.exec(appText)[1].matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]);
const SUBMENU_NAMES = [.../const SUBMENUS = \{([\s\S]*?)\n\};/.exec(appText)[1].matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]);

function dynamicKeys() {
  const keys = [];
  const add = (prefix, list, suffix = '') => list.forEach((item) => keys.push(`${prefix}.${item}${suffix}`));
  add('animation', ANIMATIONS); add('settings.fit', BACKGROUND_FITS); add('settings.weight', FONT_WEIGHTS); add('settings', ['normal', 'italic']);
  add('bgKind', ['animated', 'image', 'none']); add('colorKey', CUSTOM_KEYS);
  add('print.range', RANGES); add('print.margin', Object.keys(MARGINS)); add('print.fit', FITS);
  add('menu', MENU_NAMES); add('submenu', SUBMENU_NAMES);
  add('template', TEMPLATES.map(([id]) => id)); add('template', TEMPLATES.map(([id]) => id), '.desc');
  add('group', [...new Set(Object.values(TYPES).map((def) => def.group))]);
  add('field', [...new Set(Object.values(TYPES).flatMap((def) => def.fields.map((field) => field.key)))]);
  add('enum', [...new Set(Object.values(TYPES).flatMap((def) => def.fields.filter((field) => field.type === 'enum').flatMap((field) => field.options.filter(Boolean))))]);
  add('related', Object.keys(RELATED)); add('layout', LAYOUT_DIRECTIONS);
  add('lineStyle', ['default', ...LINE_STYLES]); add('diagramTheme', DIAGRAM_THEME_IDS); add('stereotypeDisplay', ['label', 'decoration', 'icon', 'none']);
  add('codegen.option', [...new Set(Object.values(DEFAULT_CODEGEN_OPTIONS).flatMap((options) => Object.keys(options)))]);
  add('editors', ['properties', 'style', 'documentation', 'tags']); add('tagKind', ['string', 'boolean', 'number', 'reference', 'hidden']);
  add('find', ['matchCase', 'whole', 'documentation']); add('image.area', ['content', 'selection']);
  add('textImport.sample', ['class', 'sequence', 'flowchart', 'er', 'state']);
  add('tutorial', STEP_IDS, '.title'); add('tutorial', STEP_IDS, '.text'); add('tutorial.chapter', CHAPTERS);
  return keys;
}

const placeholders = (value) => [...String(value).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('Korean and English have exactly the same keys', () => {
  const missingEn = Object.keys(ko).filter((key) => !(key in en));
  const missingKo = Object.keys(en).filter((key) => !(key in ko));
  assert.deepEqual(missingEn, [], 'keys missing in English');
  assert.deepEqual(missingKo, [], 'keys missing in Korean');
});

test('every key used in the source exists in both languages', () => {
  const missing = [...literalKeys(), ...dynamicKeys()].filter((key) => !(key in ko) || !(key in en));
  assert.deepEqual([...new Set(missing)].sort(), []);
});

test('placeholders match between the languages and texts are not empty', () => {
  for (const key of Object.keys(ko)) {
    assert.deepEqual(placeholders(ko[key]), placeholders(en[key]), `{placeholders} of ${key}`);
    assert.ok(String(ko[key]).trim() && String(en[key]).trim(), `${key} has text`);
  }
});

test('Korean texts are Korean and English texts are English', () => {
  const hangul = /[가-힣]/;
  const exceptions = new Set(['app.name', 'field.id', 'about.version']);
  let koreanCount = 0;
  for (const key of Object.keys(ko)) {
    if (hangul.test(ko[key])) koreanCount += 1;
    if (exceptions.has(key)) continue;
    if (hangul.test(en[key])) assert.ok(/한국어|가나다|태극/.test(en[key]) || key === 'tip.language', `English text of ${key} contains Hangul: ${en[key]}`);
  }
  assert.ok(koreanCount > Object.keys(ko).length * 0.8, 'most Korean texts are in Hangul');
});

test('every tutorial step has a title and a text in both languages', () => {
  assert.ok(STEP_IDS.length >= 50, `the tutorial covers the features (${STEP_IDS.length} steps)`);
  for (const id of STEP_IDS) {
    assert.ok(ko[`tutorial.${id}.text`].length > 30, `ko text of ${id}`);
    assert.ok(en[`tutorial.${id}.text`].length > 30, `en text of ${id}`);
  }
});

// Every text key the UI uses exists in Korean and English, with the same
// {placeholders}; dynamic keys (views, tools, arrows, stencils, tutorial steps…)
// are expanded from the lists they come from.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ko from '../../src/i18n/ko.js';
import en from '../../src/i18n/en.js';
import { ANIMATIONS, BACKGROUND_FITS, FONT_WEIGHTS, GRID_SIZES, STENCIL_SIZES, VIEWS } from '../../src/domain/settings.js';
import { ARROWS, DASHES, QUICK_VARIANTS } from '../../src/domain/designs.js';
import { DATA_TYPES, ROUTES, UNITS } from '../../src/domain/diagram.js';
import { CATEGORIES, MASTERS } from '../../src/domain/stencils.js';
import { LAYOUTS } from '../../src/domain/layout.js';
import { SHAPE_FIELDS } from '../../src/domain/fields.js';
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

const NAMESPACES = [...new Set(Object.keys(ko).map((key) => key.split('.')[0]))].filter((ns) => !['app'].includes(ns));

/** Every quoted string in the sources that looks like a key of a known namespace. */
function literalKeys() {
  const keys = new Set();
  for (const match of text.matchAll(/'([a-z][a-zA-Z]*\.[a-zA-Z0-9_.]+)'/g)) {
    const key = match[1];
    if (!NAMESPACES.includes(key.split('.')[0])) continue;
    if (/\.(js|css|png|svg|html|json|mjs|mdg|mdgt|xml|csv|md|ico|vsdx|pdf)$/.test(key)) continue;
    keys.add(key);
  }
  return keys;
}

const STEP_IDS = [...fs.readFileSync(path.join(root, 'src', 'ui', 'tutorial.js'), 'utf8').matchAll(/\{ id: '(\w+)', chapter: '(\w+)'/g)].map((m) => m[1]);
const CHAPTERS = JSON.parse(/export const CHAPTERS = (\[[^\]]+\])/.exec(fs.readFileSync(path.join(root, 'src', 'ui', 'tutorial.js'), 'utf8'))[1].replace(/'/g, '"'));
const REPORTS_BLOCK = /export const REPORTS = \[([\s\S]*?)\];/.exec(fs.readFileSync(path.join(root, 'src', 'views', 'reports.js'), 'utf8'))[1];
const REPORT_IDS = [...REPORTS_BLOCK.matchAll(/\['(\w+)', '\w+'\]/g)].map((m) => m[1]);
const TOOLS = JSON.parse(/const TOOLS = (\[[^\]]+\])/.exec(appText)[1].replace(/'/g, '"'));
const MENU_NAMES = [.../const MENUS = \{([\s\S]*?)\n\};/.exec(appText)[1].matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]);
const PARAMS = [...new Set(MASTERS.flatMap((master) => Object.keys(master.params ?? {})))];

function dynamicKeys() {
  const keys = [];
  const add = (prefix, list, suffix = '') => list.forEach((item) => keys.push(`${prefix}.${item}${suffix}`));
  add('view', VIEWS); add('viewShort', VIEWS); add('animation', ANIMATIONS); add('settings.fit', BACKGROUND_FITS); add('settings.weight', FONT_WEIGHTS);
  add('settings.grid', Object.keys(GRID_SIZES)); add('stencil.size', STENCIL_SIZES); add('stencil.sizeShort', STENCIL_SIZES); add('settings', ['normal', 'italic']);
  add('bgKind', ['animated', 'image', 'none']); add('colorKey', CUSTOM_KEYS);
  add('print.range', RANGES); add('print.margin', Object.keys(MARGINS)); add('print.fit', FITS);
  add('arrow', ARROWS); add('dash', DASHES); add('quick', QUICK_VARIANTS); add('route', ROUTES); add('unit', UNITS); add('dataType', DATA_TYPES);
  add('stencil', CATEGORIES.map((cat) => cat.id)); add('layout', LAYOUTS); add('layout', LAYOUTS, '.hint'); add('param', PARAMS);
  add('report', REPORT_IDS); add('tool', TOOLS); add('toolShort', TOOLS.slice(0, 7));
  add('toolShort', ['formatShape', 'shapeData', 'layers', 'pageSetup', 'design', 'insertComment']);
  add('menu', MENU_NAMES); add('field', SHAPE_FIELDS.map((field) => field.id));
  add('lock', ['move', 'size', 'rotate', 'delete', 'text', 'aspect']); add('align', ['left', 'center', 'right']); add('valign', ['top', 'middle', 'bottom']);
  add('find', ['matchCase', 'whole', 'data']); add('find.title', ['find', 'replace', 'page']); add('page', ['portrait', 'landscape']);
  add('image.area', ['page', 'content', 'selection']);
  for (const tab of ['org', 'link', 'list']) { add('import.title', [tab]); add('import.hint', [tab]); add('import.apply', [tab]); }
  add('import.masterName', ['process', 'roundRect', 'ellipse', 'terminator', 'mainTopic']);
  add('color.title', ['fill', 'fill2', 'line', 'textColor', 'pageColor']);
  add('doc', ['title', 'subject', 'author', 'manager', 'company', 'category', 'keywords', 'description']);
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

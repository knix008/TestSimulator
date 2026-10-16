// Every text key the UI uses exists in Korean and English, with the same
// {placeholders}; dynamic keys (views, fields, filters, tutorial steps…) are
// expanded from the lists they come from.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ko from '../../src/i18n/ko.js';
import en from '../../src/i18n/en.js';
import { ANIMATIONS, BACKGROUND_FITS, BAR_TEXT, DATE_FORMATS, FONT_WEIGHTS, VIEWS } from '../../src/domain/settings.js';
import { FILTERS, GROUPS, SORTS } from '../../src/domain/filters.js';
import { RESOURCE_FIELDS, RESOURCE_TABLES, TASK_FIELDS, TASK_TABLES } from '../../src/domain/fields.js';
import { ACCRUALS, CONSTRAINTS, RESOURCE_TYPES, TASK_TYPES } from '../../src/domain/project.js';
import { PATTERNS } from '../../src/domain/recurring.js';
import { CUSTOM_KEYS } from '../../src/themes.js';
import { LINK_TYPES } from '../../src/domain/duration.js';
import { CONTENTS, MARGINS, RANGES } from '../../src/print/render.js';

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

const NAMESPACES = ['action', 'menu', 'view', 'viewShort', 'field', 'filter', 'groupBy', 'sortBy', 'tableName', 'group', 'mode', 'constraint', 'taskType', 'resourceType', 'accrue', 'linkType',
  'status', 'common', 'grid', 'panel', 'toolShort', 'props', 'ind', 'chart', 'network', 'calendar', 'timeline', 'team', 'graph', 'report', 'tabs', 'task', 'resource', 'drop', 'notice', 'error',
  'format', 'confirm', 'recent', 'start', 'animation', 'welcome', 'settings', 'bgKind', 'barText', 'dateFormat', 'colorKey', 'theme', 'stepper', 'shortcut', 'about', 'progress', 'print',
  'taskInfo', 'resourceInfo', 'project', 'stats', 'link', 'baseline', 'update', 'leveling', 'recurring', 'find', 'columns', 'assign', 'tutorial', 'tip', 'op', 'unit', 'web', 'image', 'submenu', 'db'];

/** Every quoted string in the sources that looks like a key of a known namespace. */
function literalKeys() {
  const keys = new Set();
  for (const match of text.matchAll(/'([a-z][a-zA-Z]*\.[a-zA-Z0-9_.]+)'/g)) {
    const key = match[1];
    if (!NAMESPACES.includes(key.split('.')[0])) continue;
    if (/\.(js|css|png|svg|html|json|mjs|mwp|mwpt|xml|csv|md|ico)$/.test(key)) continue;
    keys.add(key);
  }
  return keys;
}

const STEP_IDS = [...fs.readFileSync(path.join(root, 'src', 'ui', 'tutorial.js'), 'utf8').matchAll(/\{ id: '(\w+)', chapter: '(\w+)'/g)].map((m) => m[1]);
const CHAPTERS = JSON.parse(/export const CHAPTERS = (\[[^\]]+\])/.exec(fs.readFileSync(path.join(root, 'src', 'ui', 'tutorial.js'), 'utf8'))[1].replace(/'/g, '"'));
const REPORTS_BLOCK = /export const REPORTS = \[([\s\S]*?)\];/.exec(fs.readFileSync(path.join(root, 'src', 'views', 'reports.js'), 'utf8'))[1];
const REPORT_IDS = [...REPORTS_BLOCK.matchAll(/\['(\w+)', '\w+'\]/g)].map((m) => m[1]);

function dynamicKeys() {
  const keys = [];
  const add = (prefix, list, suffix = '') => list.forEach((item) => keys.push(`${prefix}.${item}${suffix}`));
  add('view', VIEWS); add('viewShort', VIEWS); add('filter', FILTERS); add('groupBy', GROUPS); add('sortBy', SORTS);
  add('tableName', [...Object.keys(TASK_TABLES), ...Object.keys(RESOURCE_TABLES)]);
  add('field', [...TASK_FIELDS, ...RESOURCE_FIELDS].map((field) => field.id));
  add('constraint', CONSTRAINTS); add('taskType', TASK_TYPES); add('resourceType', RESOURCE_TYPES); add('accrue', ACCRUALS); add('linkType', LINK_TYPES);
  add('animation', ANIMATIONS); add('settings.fit', BACKGROUND_FITS); add('barText', BAR_TEXT); add('dateFormat', DATE_FORMATS); add('settings.weight', FONT_WEIGHTS);
  add('colorKey', CUSTOM_KEYS); add('recurring', PATTERNS); add('print.range', RANGES); add('print.content', CONTENTS); add('print.margin', Object.keys(MARGINS));
  add('status', ['complete', 'late', 'future', 'onSchedule']); add('status.mode', ['auto', 'manual']); add('mode', ['auto', 'manual']);
  add('group.duration', ['0', '1', '5', '20', 'more']); add('group.complete', ['0', 'some', '100']); add('group.critical', ['yes', 'no']); add('group.milestones', ['yes', 'no']);
  add('report', REPORT_IDS); add('report', ['critical', 'late', 'upcoming', 'milestones'], 'Hint'); add('report.series', ['planned', 'scheduled', 'actual', 'remainingPlan', 'remaining']);
  add('menu', ['file', 'edit', 'view', 'task', 'resource', 'project', 'report', 'help']);
  add('panel', ['insert', 'schedule', 'progress']);
  add('toolShort', ['insertTask', 'insertSummary', 'insertMilestone', 'insertRecurring', 'addResource', 'assign', 'indent', 'outdent', 'link', 'unlink', 'moveUp', 'moveDown', 'manualMode', 'autoMode',
    'inactivate', 'pct0', 'pct25', 'pct50', 'pct75', 'pct100', 'markOnTrack', 'taskInfo', 'resourceInfo', 'projectInfo', 'calendar', 'setBaseline', 'levelAll', 'scrollToTask']);
  add('tutorial', STEP_IDS, '.title'); add('tutorial', STEP_IDS, '.text'); add('tutorial.chapter', CHAPTERS);
  add('settings', ['normal', 'italic']); add('bgKind', ['animated', 'image', 'none']);
  add('project', ['title', 'subject', 'author', 'manager', 'company', 'category', 'keywords', 'comments']);
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
  const exceptions = new Set(['app.name', 'field.id', 'field.wbs', 'about.version']);
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

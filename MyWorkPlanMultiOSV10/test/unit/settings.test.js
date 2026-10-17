// Application settings (defaults, repairs, storage) and the recent files and
// folders lists.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as S from '../../src/domain/settings.js';
import * as Rc from '../../src/domain/recent.js';
import { THEME_IDS } from '../../src/themes.js';

/** A localStorage stand-in. */
function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
  };
}
const brokenStorage = {
  getItem: () => { throw new Error('blocked'); },
  setItem: () => { throw new Error('full'); },
};

test('defaults per language', () => {
  const ko = S.defaultSettings('ko');
  const en = S.defaultSettings('en');
  assert.equal(ko.language, 'ko');
  assert.equal(en.language, 'en');
  assert.equal(ko.dateFormat, 'iso');
  assert.equal(en.dateFormat, 'us');
  assert.equal(ko.theme, 'light');
  assert.equal(ko.defaultView, 'gantt');
  assert.ok(S.TIMESCALE.steps.includes(ko.timescale));
  assert.deepEqual(S.normalizeSettings(ko), ko, 'the defaults are already valid');
  assert.deepEqual(S.normalizeSettings(en), en);
});

test('normalizeSettings fills gaps and keeps the language consistent', () => {
  assert.deepEqual(S.normalizeSettings({}, 'en'), S.defaultSettings('en'));
  assert.deepEqual(S.normalizeSettings({}, 'ko'), S.defaultSettings('ko'));
  assert.deepEqual(S.normalizeSettings(), S.defaultSettings('ko'), 'no language: Korean with its date format');
  assert.deepEqual(S.normalizeSettings(null, 'en'), S.defaultSettings('en'));
  assert.deepEqual(S.normalizeSettings('junk', 'fr'), S.defaultSettings('ko'));
  assert.equal(S.normalizeSettings({ language: 'en' }, 'ko').dateFormat, 'us', 'the stored language wins over the system one');
  assert.equal(S.normalizeSettings({ language: 'de' }, 'en').language, 'en');
  assert.equal(S.normalizeSettings({ fontSize: 15 }).fontSize, 15, 'valid values are kept');
});

test('normalizeSettings clamps every number', () => {
  const low = S.normalizeSettings({
    fontSize: 1, zoom: 5, timescale: 0, animationSpeed: -10, backgroundOpacity: -1, leftWidth: 0, rightWidth: 0,
    tableWidth: 0, rowHeight: 1, hoursPerDay: 0.2, hoursPerWeek: 0.5, daysPerMonth: 0.5,
  }, 'ko');
  assert.deepEqual(
    [low.fontSize, low.zoom, low.timescale, low.animationSpeed, low.backgroundOpacity, low.leftWidth, low.rightWidth, low.tableWidth, low.rowHeight, low.hoursPerDay, low.hoursPerWeek, low.daysPerMonth],
    [S.FONT_SIZE.min, S.ZOOM.min, S.TIMESCALE.min, 0, 0, S.PANEL_MIN.left, S.PANEL_MIN.right, 160, 20, 1, 1, 1],
  );
  const high = S.normalizeSettings({
    fontSize: 99, zoom: 900, timescale: 9999, animationSpeed: 1000, backgroundOpacity: 500, leftWidth: 5000, rightWidth: 5000,
    tableWidth: 99999, rowHeight: 99, hoursPerDay: 30, hoursPerWeek: 500, daysPerMonth: 40,
  }, 'ko');
  assert.deepEqual(
    [high.fontSize, high.zoom, high.timescale, high.animationSpeed, high.backgroundOpacity, high.leftWidth, high.rightWidth, high.tableWidth, high.rowHeight, high.hoursPerDay, high.hoursPerWeek, high.daysPerMonth],
    [S.FONT_SIZE.max, S.ZOOM.max, S.TIMESCALE.max, 300, 100, 600, 700, 3000, 44, 24, 168, 31],
  );
  const junk = S.normalizeSettings({ fontSize: 'big', zoom: null, timescale: 'x', rowHeight: NaN, hoursPerDay: 'x', hoursPerWeek: 0, daysPerMonth: null }, 'ko');
  const base = S.defaultSettings('ko');
  assert.deepEqual([junk.fontSize, junk.timescale, junk.rowHeight, junk.hoursPerDay, junk.hoursPerWeek, junk.daysPerMonth], [base.fontSize, base.timescale, 26, 8, 40, 20]);
  assert.equal(junk.zoom, S.ZOOM.min, 'null reads as 0 and is clamped');
  assert.equal(S.normalizeSettings({ fontSize: 14.6 }).fontSize, 15, 'rounded');
  assert.equal(S.normalizeSettings({ hoursPerDay: 7.5 }).hoursPerDay, 7.5, 'hours may have fractions');
  assert.equal(S.normalizeSettings({ fontSize: '12' }).fontSize, 12, 'numbers as text');
});

test('normalizeSettings repairs choices, booleans and text', () => {
  const base = S.defaultSettings('ko');
  const bad = S.normalizeSettings({
    theme: 'no-such-theme', fontWeight: 450, fontStyle: 'oblique', backgroundKind: 'video', animation: 'no-such-animation', backgroundFit: 'zoom',
    dateFormat: 'roman', defaultView: 'kanban', barText: 'emoji', defaultTaskMode: 'robot', fontFamily: 12, backgroundImage: 7, lastDirectory: '',
    showCritical: 'yes', confirmDelete: 1, tutorialDone: null, showToday: undefined,
  }, 'ko');
  assert.deepEqual(
    [bad.theme, bad.fontWeight, bad.fontStyle, bad.backgroundKind, bad.animation, bad.backgroundFit, bad.dateFormat, bad.defaultView, bad.barText, bad.defaultTaskMode, bad.fontFamily, bad.backgroundImage, bad.lastDirectory],
    [base.theme, base.fontWeight, base.fontStyle, base.backgroundKind, base.animation, base.backgroundFit, base.dateFormat, 'gantt', 'name', 'auto', '', null, null],
  );
  assert.deepEqual([bad.showCritical, bad.confirmDelete, bad.tutorialDone, bad.showToday], [base.showCritical, base.confirmDelete, base.tutorialDone, base.showToday]);
  const good = S.normalizeSettings({
    theme: THEME_IDS.at(-1), fontWeight: '700', fontStyle: 'italic', backgroundKind: 'none', animation: 'starfield', backgroundFit: 'tile',
    dateFormat: 'eu', defaultView: 'reports', barText: 'percent', defaultTaskMode: 'manual', fontFamily: 'Arial', backgroundImage: 'data:x', lastDirectory: 'C:\\Plans',
    showCritical: false, tutorialDone: true,
  }, 'ko');
  assert.deepEqual(
    [good.theme, good.fontWeight, good.fontStyle, good.backgroundKind, good.animation, good.backgroundFit, good.dateFormat, good.defaultView, good.barText, good.defaultTaskMode, good.fontFamily, good.backgroundImage, good.lastDirectory, good.showCritical, good.tutorialDone],
    [THEME_IDS.at(-1), 700, 'italic', 'none', 'starfield', 'tile', 'eu', 'reports', 'percent', 'manual', 'Arial', 'data:x', 'C:\\Plans', false, true],
  );
  assert.equal(typeof S.normalizeSettings({ customTheme: 'x' }).customTheme, 'object', 'the custom theme is repaired too');
});

test('loadSettings / storeSettings with a storage object', () => {
  const storage = memoryStorage();
  const loaded = S.loadSettings(storage);
  assert.ok(['ko', 'en'].includes(loaded.language), 'empty storage: defaults');
  const mine = { ...S.defaultSettings('en'), zoom: 120, theme: THEME_IDS[1] };
  assert.equal(S.storeSettings(storage, mine), true);
  assert.deepEqual(JSON.parse(storage.data.get(S.STORAGE_KEY)), mine);
  assert.deepEqual(S.loadSettings(storage), mine);
  storage.setItem(S.STORAGE_KEY, '{broken');
  const fallback = S.loadSettings(storage);
  assert.equal(fallback.zoom, 100, 'broken JSON gives the defaults');
  storage.setItem(S.STORAGE_KEY, JSON.stringify({ language: 'ko', zoom: 999 }));
  assert.equal(S.loadSettings(storage).zoom, S.ZOOM.max, 'stored values are repaired');
  assert.equal(S.loadSettings(brokenStorage).zoom, 100, 'a blocked storage gives the defaults');
  assert.equal(S.storeSettings(brokenStorage, mine), false);
  assert.equal(S.loadSettings(null).zoom, 100, 'no storage at all');
  assert.equal(S.storeSettings(undefined, mine), true, 'nothing to write to is not an error');
});

test('timescaleStep zooms in and out through the steps', () => {
  const steps = S.TIMESCALE.steps;
  assert.equal(S.timescaleStep(16, 1), 22);
  assert.equal(S.timescaleStep(16, -1), 12);
  assert.equal(S.timescaleStep(17, 1), 22, 'from between two steps');
  assert.equal(S.timescaleStep(17, -1), 16);
  assert.equal(S.timescaleStep(steps.at(-1), 1), steps.at(-1), 'the last step stays');
  assert.equal(S.timescaleStep(steps[0], -1), steps[0], 'the first step stays');
  assert.equal(S.timescaleStep(1000, 1), steps.at(-1));
  assert.equal(S.timescaleStep(0, -1), steps[0]);
  let value = steps[0];
  for (let i = 1; i < steps.length; i++) assert.equal(value = S.timescaleStep(value, 1), steps[i]);
  for (let i = steps.length - 2; i >= 0; i--) assert.equal(value = S.timescaleStep(value, -1), steps[i]);
  assert.deepEqual(steps, [...steps].sort((a, b) => a - b), 'steps ascend');
  assert.equal(steps[0], S.TIMESCALE.min);
  assert.equal(steps.at(-1), S.TIMESCALE.max);
});

test('addRecent puts the newest first, without duplicates', () => {
  let list = [];
  list = Rc.addRecent(list, { path: 'C:\\Plans\\a.mwp', title: 'A', at: 1 });
  list = Rc.addRecent(list, { path: 'C:\\Plans\\b.mwp', at: 2 });
  assert.deepEqual(list.map((item) => item.path), ['C:\\Plans\\b.mwp', 'C:\\Plans\\a.mwp']);
  assert.deepEqual(list[1], { path: 'C:\\Plans\\a.mwp', title: 'A', web: false, at: 1 });
  assert.equal(list[0].title, '');
  list = Rc.addRecent(list, { path: 'c:/plans/A.MWP', title: 'A again', web: 1, at: 3 });
  assert.deepEqual(list.map((item) => item.path), ['c:/plans/A.MWP', 'C:\\Plans\\b.mwp'], 'the same file, written differently');
  assert.deepEqual([list[0].title, list[0].web], ['A again', true]);
  assert.equal(typeof Rc.addRecent([], { path: 'x' })[0].at, 'number', 'the time defaults to now');
});

test('addRecent keeps at most ten', () => {
  let list = [];
  for (let i = 0; i < 15; i++) list = Rc.addRecent(list, { path: `/p/${i}.mwp` });
  assert.equal(list.length, Rc.MAX_RECENT);
  assert.equal(list[0].path, '/p/14.mwp');
  assert.equal(list.at(-1).path, '/p/5.mwp');
  assert.equal(Rc.addRecent(list, { path: '/new' }, 3).length, 3, 'a smaller maximum');
});

test('removeRecent matches like addRecent', () => {
  const list = [{ path: 'C:\\A\\x.mwp' }, { path: '/b/y.mwp' }];
  assert.deepEqual(Rc.removeRecent(list, 'c:/a/X.mwp'), [{ path: '/b/y.mwp' }]);
  assert.deepEqual(Rc.removeRecent(list, '/nope'), list);
  assert.equal(list.length, 2, 'the list itself is not changed');
});

test('recent files and recent folders are stored separately', () => {
  const storage = memoryStorage();
  assert.deepEqual(Rc.loadRecent(storage), []);
  assert.deepEqual(Rc.loadRecentDirs(storage), []);
  const files = [{ path: '/a.mwp', title: 'A' }, { path: '/b.mwp', title: 'B' }];
  const dirs = [{ path: '/plans' }];
  Rc.storeRecent(storage, files);
  Rc.storeRecentDirs(storage, dirs);
  assert.deepEqual(Rc.loadRecent(storage), files);
  assert.deepEqual(Rc.loadRecentDirs(storage), dirs);
  assert.ok(storage.data.has(S.RECENT_KEY) && storage.data.has(S.RECENT_DIRS_KEY));
  assert.notEqual(S.RECENT_KEY, S.RECENT_DIRS_KEY);
  Rc.storeRecent(storage, Array.from({ length: 20 }, (_, i) => ({ path: `/${i}` })));
  assert.equal(JSON.parse(storage.data.get(S.RECENT_KEY)).length, Rc.MAX_RECENT, 'stored lists are capped');
});

test('loading recent lists survives bad data', () => {
  const storage = memoryStorage({
    [S.RECENT_KEY]: JSON.stringify([{ path: '/ok' }, null, { path: '' }, { path: 7 }, 'x', { title: 'no path' }]),
    [S.RECENT_DIRS_KEY]: '{not json',
  });
  assert.deepEqual(Rc.loadRecent(storage), [{ path: '/ok' }]);
  assert.deepEqual(Rc.loadRecentDirs(storage), []);
  storage.setItem(S.RECENT_KEY, JSON.stringify({ path: '/x' }));
  assert.deepEqual(Rc.loadRecent(storage), [], 'not a list');
  storage.setItem(S.RECENT_KEY, JSON.stringify(Array.from({ length: 20 }, (_, i) => ({ path: `/${i}` }))));
  assert.equal(Rc.loadRecent(storage).length, Rc.MAX_RECENT);
  assert.deepEqual(Rc.loadRecent(brokenStorage), []);
  assert.deepEqual(Rc.loadRecent(null), []);
  assert.doesNotThrow(() => Rc.storeRecent(brokenStorage, [{ path: '/x' }]));
  assert.doesNotThrow(() => Rc.storeRecentDirs(null, []));
});

test('database settings: defaults and repairs', () => {
  const base = S.defaultSettings('ko');
  assert.equal(base.dbKind, 'none', 'no database until one is chosen');
  assert.deepEqual(S.DB_KINDS, ['none', 'sqlite', 'mariadb', 'mysql', 'postgres']);
  const good = S.normalizeSettings({ dbKind: 'postgres', dbHost: ' db.local ', dbPort: '6543', dbName: ' plans ', dbUser: 'me', dbFile: ' C:\\data\\plans.db ' }, 'ko');
  assert.deepEqual([good.dbKind, good.dbHost, good.dbPort, good.dbName, good.dbUser, good.dbFile], ['postgres', 'db.local', 6543, 'plans', 'me', 'C:\\data\\plans.db']);
  const bad = S.normalizeSettings({ dbKind: 'oracle', dbHost: '  ', dbPort: 70000, dbName: 5, dbUser: null, dbFile: {}, dbSavePassword: 'yes' }, 'ko');
  assert.deepEqual([bad.dbKind, bad.dbHost, bad.dbPort, bad.dbName, bad.dbUser, bad.dbFile, bad.dbSavePassword], ['none', 'localhost', null, 'myworkplan', '', '', false]);
  for (const port of [0, -1, 1.5, 'x', '', null]) assert.equal(S.normalizeSettings({ dbPort: port }).dbPort, null, `port ${port}`);
  for (const kind of S.DB_KINDS) assert.equal(S.normalizeSettings({ dbKind: kind }).dbKind, kind);
});

test('database password is stored only when asked to', () => {
  assert.equal(S.normalizeSettings({ dbKind: 'mariadb', dbPassword: 'secret' }).dbPassword, '', 'not saved: dropped');
  assert.equal(S.normalizeSettings({ dbKind: 'mariadb', dbSavePassword: true, dbPassword: 'secret' }).dbPassword, 'secret');
  const storage = memoryStorage();
  S.storeSettings(storage, S.normalizeSettings({ dbKind: 'mysql', dbPassword: 'secret' }));
  assert.ok(!storage.data.get(S.STORAGE_KEY).includes('secret'), 'never written to storage without dbSavePassword');
});

test('database connection settings for the backend', () => {
  const server = S.normalizeSettings({ dbKind: 'mariadb', dbHost: 'db', dbName: 'plans', dbUser: 'me' });
  assert.equal(S.dbPortOf(server), 3306, 'the usual port when none is set');
  assert.equal(S.dbPortOf({ ...server, dbKind: 'postgres' }), 5432);
  assert.equal(S.dbPortOf({ ...server, dbPort: 3307 }), 3307);
  assert.deepEqual(S.dbConfig(server, 'run-pw'), { kind: 'mariadb', host: 'db', port: 3306, database: 'plans', user: 'me', password: 'run-pw', file: null });
  assert.equal(S.dbConfig({ ...server, dbSavePassword: true, dbPassword: 'saved' }, 'run-pw').password, 'saved', 'a saved password wins');
  const lite = S.normalizeSettings({ dbKind: 'sqlite', dbFile: 'C:\\p\\plans.db', dbUser: 'ignored' });
  assert.deepEqual(S.dbConfig(lite, 'x'), { kind: 'sqlite', host: null, port: null, database: null, user: null, password: null, file: 'C:\\p\\plans.db' });
  assert.equal(S.dbDescribe(server), 'MariaDB · me@db:3306/plans');
  assert.equal(S.dbDescribe(lite), 'SQLite · C:\\p\\plans.db');
  assert.ok(!S.dbDescribe({ ...server, dbSavePassword: true, dbPassword: 'secret' }).includes('secret'));
  assert.equal(S.dbDescribe(S.defaultSettings('ko')), '');
});

test('database settings problems', () => {
  assert.deepEqual(S.dbProblems(S.defaultSettings('ko')), ['db.needKind']);
  assert.deepEqual(S.dbProblems(S.normalizeSettings({ dbKind: 'sqlite' })), ['db.needFile']);
  assert.deepEqual(S.dbProblems(S.normalizeSettings({ dbKind: 'sqlite', dbFile: '/tmp/a.db' })), []);
  assert.deepEqual(S.dbProblems({ ...S.normalizeSettings({ dbKind: 'postgres' }), dbHost: ' ', dbName: '' }), ['db.needHost', 'db.needName']);
  assert.deepEqual(S.dbProblems(S.normalizeSettings({ dbKind: 'mysql', dbName: 'my plans;' })), ['db.badName']);
  assert.deepEqual(S.dbProblems(S.normalizeSettings({ dbKind: 'mysql', dbName: 'plans_2026' })), []);
});

test('start page background: random at start (default on) and an automatic change interval from a fixed list', () => {
  const base = S.normalizeSettings({});
  assert.equal(base.animationRandom, true);
  assert.equal(base.animationInterval, 30);
  assert.equal(S.normalizeSettings({ animationRandom: false }).animationRandom, false);
  for (const n of S.ANIMATION_INTERVALS) assert.equal(S.normalizeSettings({ animationInterval: n }).animationInterval, n);
  assert.equal(S.normalizeSettings({ animationInterval: '60' }).animationInterval, 60, 'a stored string is read as a number');
  assert.equal(S.normalizeSettings({ animationInterval: 7 }).animationInterval, 30, 'not one of the choices: the default');
  assert.ok(S.ANIMATION_INTERVALS.includes(0), 'can be turned off');
});

/** A Storage like localStorage (length, key, removeItem), for the reset after a new installation. */
function fullStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    get length() { return data.size; },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
    removeItem: (key) => { data.delete(key); },
  };
}

test('a new installation resets the preferences once and keeps the user data', () => {
  const saved = { ...S.defaultSettings(), theme: 'monokai', zoom: 150, showLeftPanel: false, showRightPanel: false, fontSize: 18,
    dbKind: 'postgres', dbHost: 'db.local', dbUser: 'kim', backgroundImage: 'bg.png', backgroundName: '산.png', lastDirectory: 'D:\Plans', tutorialOffered: true, tutorialDone: true };
  const storage = fullStorage({
    [S.STORAGE_KEY]: JSON.stringify(saved),
    [S.RECENT_KEY]: '[{"path":"D:\\a.mwp"}]',
    [S.RECENT_DIRS_KEY]: '["D:\\Plans"]',
    [S.SESSION_KEY]: '{"files":["D:\\a.mwp"]}',
    'myworkplan.columns.v1': '{"task:entry":{"name":400}}',
    'myworkplan.popup.settings': '{"x":10}',
    [S.PRINT_KEY]: '{"orientation":"portrait"}',
    'other.app': 'untouched',
  });
  assert.equal(S.resetForNewInstall(storage, undefined), false, 'no installer token: nothing happens');
  assert.equal(S.resetForNewInstall(storage, '777'), true);
  const now = S.loadSettings(storage);
  const base = S.defaultSettings();
  assert.deepEqual([now.theme, now.zoom, now.showLeftPanel, now.showRightPanel, now.fontSize], [base.theme, base.zoom, base.showLeftPanel, base.showRightPanel, base.fontSize], 'preferences are the defaults again');
  assert.deepEqual([now.dbKind, now.dbHost, now.dbUser, now.backgroundImage, now.backgroundName, now.lastDirectory, now.tutorialOffered, now.tutorialDone],
    ['postgres', 'db.local', 'kim', 'bg.png', '산.png', 'D:\Plans', true, true], 'database, background image, last folder and tutorial history stay');
  for (const key of [S.RECENT_KEY, S.RECENT_DIRS_KEY, S.SESSION_KEY]) assert.ok(storage.data.has(key), `${key} stays`);
  for (const key of ['myworkplan.columns.v1', 'myworkplan.popup.settings', S.PRINT_KEY]) assert.equal(storage.data.has(key), false, `${key} is reset`);
  assert.equal(storage.data.get('other.app'), 'untouched', 'only MyWorkPlan keys');
  S.storeSettings(storage, { ...now, theme: 'onedark' });
  assert.equal(S.resetForNewInstall(storage, '777'), false, 'the same installation: once only');
  assert.equal(S.loadSettings(storage).theme, 'onedark', 'a choice made after the reset stays');
  assert.equal(S.resetForNewInstall(storage, '888'), true, 'the next installation resets again');
  assert.equal(S.resetForNewInstall(brokenStorage, '1'), false, 'blocked storage: no crash');
});

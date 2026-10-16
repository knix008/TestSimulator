// Durations, lags, predecessor lists and money as typed in the tables.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as D from '../../src/domain/duration.js';

const DAY = 480;
const WEEK = 2400;

test('unit sizes follow the project options', () => {
  assert.equal(D.unitMinutes('m'), 1);
  assert.equal(D.unitMinutes('h'), 60);
  assert.equal(D.unitMinutes('d'), DAY);
  assert.equal(D.unitMinutes('w'), WEEK);
  assert.equal(D.unitMinutes('mo'), 20 * DAY);
  assert.equal(D.unitMinutes('ed'), 1440, 'elapsed days are 24 hours');
  assert.equal(D.unitMinutes('ew'), 7 * 1440);
  assert.equal(D.unitMinutes('emo'), 30 * 1440);
  assert.equal(D.unitMinutes('eh'), 60);
  assert.equal(D.unitMinutes('em'), 1);
  assert.equal(D.unitMinutes('d', { hoursPerDay: 7.5 }), 450);
  assert.equal(D.unitMinutes('w', { hoursPerWeek: 35 }), 2100);
  assert.equal(D.unitMinutes('mo', { daysPerMonth: 22, hoursPerDay: 8 }), 22 * DAY);
  assert.equal(D.unitMinutes('bogus'), DAY, 'unknown units count as days');
  assert.ok(D.isElapsed('ed') && D.isElapsed('emo'));
  assert.ok(!D.isElapsed('d') && !D.isElapsed('mo'));
});

test('parseDuration: numbers with every unit spelling', () => {
  const cases = [
    ['5d', 5 * DAY, 'd'], ['5', 5 * DAY, 'd'], ['2.5 days', 2.5 * DAY, 'd'], ['1 day', DAY, 'd'], ['3dy', 3 * DAY, 'd'],
    ['2w', 2 * WEEK, 'w'], ['1 week', WEEK, 'w'], ['2wks', 2 * WEEK, 'w'],
    ['4h', 240, 'h'], ['4 hrs', 240, 'h'], ['1 hour', 60, 'h'],
    ['30m', 30, 'm'], ['30 min', 30, 'm'], ['45 minutes', 45, 'm'],
    ['1mo', 20 * DAY, 'mo'], ['2 months', 40 * DAY, 'mo'],
    ['3ed', 3 * 1440, 'ed'], ['2ew', 2 * 10080, 'ew'], ['5eh', 300, 'eh'], ['10em', 10, 'em'], ['1emo', 43200, 'emo'],
    ['5일', 5 * DAY, 'd'], ['2주', 2 * WEEK, 'w'], ['3시간', 180, 'h'], ['1개월', 20 * DAY, 'mo'], ['1달', 20 * DAY, 'mo'], ['15분', 15, 'm'],
    ['5 일', 5 * DAY, 'd'], ['5D', 5 * DAY, 'd'], ['.5d', 240, 'd'], ['1,5d', 720, 'd'], [' 2d ', 2 * DAY, 'd'], ['+3d', 3 * DAY, 'd'],
    ['0d', 0, 'd'],
  ];
  for (const [text, minutes, unit] of cases) {
    assert.deepEqual(D.parseDuration(text), { minutes, unit, estimated: false }, text);
  }
});

test('parseDuration: the default unit, options, estimates', () => {
  assert.deepEqual(D.parseDuration('3', D.DEFAULT_OPTIONS, 'h'), { minutes: 180, unit: 'h', estimated: false });
  assert.equal(D.parseDuration('1d', { hoursPerDay: 10 }).minutes, 600);
  assert.deepEqual(D.parseDuration('5d?'), { minutes: 5 * DAY, unit: 'd', estimated: true });
  assert.deepEqual(D.parseDuration('5 days ?'), { minutes: 5 * DAY, unit: 'd', estimated: true });
  assert.deepEqual(D.parseDuration('2?'), { minutes: 2 * DAY, unit: 'd', estimated: true });
  assert.equal(D.parseDuration(0.1).minutes, 48, 'numbers are accepted');
});

test('parseDuration: negatives only when allowed, nonsense never', () => {
  assert.equal(D.parseDuration('-2d'), null);
  assert.deepEqual(D.parseDuration('-2d', D.DEFAULT_OPTIONS, 'd', { allowNegative: true }), { minutes: -2 * DAY, unit: 'd', estimated: false });
  for (const bad of ['', '   ', null, undefined, 'abc', 'd', '5x', '5 parsecs', '5d5', '1..5d', '5d??', '?']) {
    assert.equal(D.parseDuration(bad), null, String(bad));
  }
});

test('formatDuration in Korean and English, with plurals and estimates', () => {
  assert.equal(D.formatDuration(5 * DAY), '5일');
  assert.equal(D.formatDuration(5 * DAY, 'd', D.DEFAULT_OPTIONS, 'en'), '5 days');
  assert.equal(D.formatDuration(DAY, 'd', D.DEFAULT_OPTIONS, 'en'), '1 day');
  assert.equal(D.formatDuration(0, 'd', D.DEFAULT_OPTIONS, 'en'), '0 days');
  assert.equal(D.formatDuration(-DAY, 'd', D.DEFAULT_OPTIONS, 'en'), '-1 day', 'the plural ignores the sign');
  assert.equal(D.formatDuration(2.5 * DAY, 'd', D.DEFAULT_OPTIONS, 'en'), '2.5 days');
  assert.equal(D.formatDuration(100, 'd', D.DEFAULT_OPTIONS, 'en'), '0.21 days', 'two decimals at most');
  assert.equal(D.formatDuration(60, 'h', D.DEFAULT_OPTIONS, 'en'), '1 hr');
  assert.equal(D.formatDuration(90, 'h', D.DEFAULT_OPTIONS, 'en'), '1.5 hrs');
  assert.equal(D.formatDuration(90, 'h'), '1.5시간');
  assert.equal(D.formatDuration(WEEK, 'w', D.DEFAULT_OPTIONS, 'en'), '1 wk');
  assert.equal(D.formatDuration(2 * WEEK, 'w'), '2주');
  assert.equal(D.formatDuration(20 * DAY, 'mo'), '1개월');
  assert.equal(D.formatDuration(30, 'm', D.DEFAULT_OPTIONS, 'en'), '30 mins');
  assert.equal(D.formatDuration(3 * 1440, 'ed'), '3경과 일');
  assert.equal(D.formatDuration(1440, 'ed', D.DEFAULT_OPTIONS, 'en'), '1 eday');
  assert.equal(D.formatDuration(5 * DAY, 'd', D.DEFAULT_OPTIONS, 'ko', true), '5일?');
  assert.equal(D.formatDuration(5 * DAY, 'd', D.DEFAULT_OPTIONS, 'en', true), '5 days?');
  assert.equal(D.formatDuration(null), '0일', 'nothing is zero');
  assert.equal(D.formatDuration(600, 'd', { hoursPerDay: 10 }), '1일');
  assert.equal(D.formatWork(2400), '40시간');
  assert.equal(D.formatWork(2400, 'en'), '40 hrs');
  assert.equal(D.formatWork(null, 'en'), '0 hrs');
  assert.equal(D.formatWork(2400, 'en', 'd'), '5 days');
});

test('format and parse round trip', () => {
  for (const [minutes, unit] of [[5 * DAY, 'd'], [240, 'h'], [2 * WEEK, 'w'], [3 * 1440, 'ed'], [30, 'm'], [20 * DAY, 'mo']]) {
    assert.deepEqual(D.parseDuration(D.formatDuration(minutes, unit, D.DEFAULT_OPTIONS, 'en')), { minutes, unit, estimated: false }, `en ${unit}`);
    assert.deepEqual(D.parseDuration(D.compactDuration(minutes, unit)), { minutes, unit, estimated: false }, `compact ${unit}`);
  }
  assert.equal(D.compactDuration(-720, 'd'), '-1.5d');
  assert.equal(D.compactDuration(null), '0d');
});

test('unit labels', () => {
  assert.equal(D.unitLabel('d'), '일');
  assert.equal(D.unitLabel('d', 'en', 1), 'day');
  assert.equal(D.unitLabel('d', 'en', 2), 'days');
  assert.equal(D.unitLabel('emo', 'en'), 'emons');
  for (const unit of D.UNITS) {
    assert.ok(D.unitLabel(unit, 'ko'), `ko ${unit}`);
    assert.ok(D.unitLabel(unit, 'en'), `en ${unit}`);
  }
});

test('parseLag: durations, negative leads and percentages', () => {
  assert.deepEqual(D.parseLag(''), { lag: 0, lagUnit: 'd' });
  assert.deepEqual(D.parseLag(null), { lag: 0, lagUnit: 'd' });
  assert.deepEqual(D.parseLag('2d'), { lag: 2 * DAY, lagUnit: 'd' });
  assert.deepEqual(D.parseLag('+2d'), { lag: 2 * DAY, lagUnit: 'd' });
  assert.deepEqual(D.parseLag('-1.5d'), { lag: -720, lagUnit: 'd' });
  assert.deepEqual(D.parseLag('-4h'), { lag: -240, lagUnit: 'h' });
  assert.deepEqual(D.parseLag('3ed'), { lag: 3 * 1440, lagUnit: 'ed' });
  assert.deepEqual(D.parseLag('50%'), { lag: 50, lagUnit: '%' });
  assert.deepEqual(D.parseLag('-25 %'), { lag: -25, lagUnit: '%' });
  assert.deepEqual(D.parseLag('2'), { lag: 2 * DAY, lagUnit: 'd' }, 'a bare number is days');
  assert.equal(D.parseLag('soon'), null);
  assert.equal(D.parseLag('%'), null);
});

test('formatLag writes the sign and the unit', () => {
  assert.equal(D.formatLag(0), '');
  assert.equal(D.formatLag(null), '');
  assert.equal(D.formatLag(2 * DAY, 'd'), '+2d');
  assert.equal(D.formatLag(-720, 'd'), '-1.5d');
  assert.equal(D.formatLag(240, 'h'), '+4h');
  assert.equal(D.formatLag(50, '%'), '+50%');
  assert.equal(D.formatLag(-25, '%'), '-25%');
  for (const text of ['+2d', '-1.5d', '+4h', '+50%', '-25%', '+3ed']) {
    const lag = D.parseLag(text);
    assert.equal(D.formatLag(lag.lag, lag.lagUnit), text, text);
  }
});

test('parsePredecessors: rows, link types, lags, Korean link names', () => {
  const ids = { 1: 'a', 2: 'b', 3: 'c', 5: 'e', 7: 'g', 9: 'i' };
  const idOf = (row) => ids[row];
  const { links, errors } = D.parsePredecessors('3, 5SS+2d, 7FF-1d, 9SF+50%', idOf);
  assert.deepEqual(errors, []);
  assert.deepEqual(links, [
    { taskId: 'c', type: 'FS', lag: 0, lagUnit: 'd' },
    { taskId: 'e', type: 'SS', lag: 2 * DAY, lagUnit: 'd' },
    { taskId: 'g', type: 'FF', lag: -DAY, lagUnit: 'd' },
    { taskId: 'i', type: 'SF', lag: 50, lagUnit: '%' },
  ]);
  assert.deepEqual(D.parsePredecessors('1ss; 2 ff + 4h', idOf).links, [
    { taskId: 'a', type: 'SS', lag: 0, lagUnit: 'd' },
    { taskId: 'b', type: 'FF', lag: 240, lagUnit: 'h' },
  ], 'lower case, semicolons and spaces');
  assert.deepEqual(D.parsePredecessors('1완료-시작, 2시작-시작+1d, 3완료-완료, 5시작-완료', idOf).links.map((l) => [l.taskId, l.type, l.lag]), [
    ['a', 'FS', 0], ['b', 'SS', DAY], ['c', 'FF', 0], ['e', 'SF', 0],
  ]);
  assert.deepEqual(D.parsePredecessors('', idOf), { links: [], errors: [] });
  assert.deepEqual(D.parsePredecessors(null, idOf), { links: [], errors: [] });
  assert.deepEqual(D.parsePredecessors(' , ,', idOf), { links: [], errors: [] });
});

test('parsePredecessors reports what it cannot read', () => {
  const idOf = (row) => ({ 1: 'a', 2: 'b' })[row];
  const { links, errors } = D.parsePredecessors('1, 4, x, 2XX, 2FS+soon, -1', idOf);
  assert.deepEqual(links.map((l) => l.taskId), ['a']);
  assert.deepEqual(errors, ['4', 'x', '2XX', '2FS+soon', '-1']);
});

test('formatPredecessors writes the shortest form and drops unknown rows', () => {
  const rows = { a: 1, b: 2, c: 3 };
  const rowOf = (id) => rows[id];
  const links = [
    { taskId: 'a', type: 'FS', lag: 0, lagUnit: 'd' },
    { taskId: 'b', type: 'SS', lag: 2 * DAY, lagUnit: 'd' },
    { taskId: 'c', type: 'FS', lag: 50, lagUnit: '%' },
    { taskId: 'gone', type: 'FS', lag: 0, lagUnit: 'd' },
  ];
  assert.equal(D.formatPredecessors(links, rowOf), '1,2SS+2d,3FS+50%');
  assert.equal(D.formatPredecessors(null, rowOf), '');
  // And back again.
  const ids = { 1: 'a', 2: 'b', 3: 'c' };
  assert.deepEqual(D.parsePredecessors('1,2SS+2d,3FS+50%', (row) => ids[row]).links, links.slice(0, 3));
});

test('formatMoney: won without decimals, dollars with cents, negatives', () => {
  assert.equal(D.formatMoney(1234500), '₩1,234,500');
  assert.equal(D.formatMoney(1234.56), '₩1,235', 'won are rounded');
  assert.equal(D.formatMoney(1234.5, '$'), '$1,234.50');
  assert.equal(D.formatMoney(-1234.5, '$'), '-$1,234.50');
  assert.equal(D.formatMoney(-500), '-₩500');
  assert.equal(D.formatMoney(1000, '¥'), '¥1,000');
  assert.equal(D.formatMoney(0, '$'), '$0.00');
  assert.equal(D.formatMoney(null), '₩0');
  assert.equal(D.formatMoney('abc', '$'), '$0.00');
  assert.equal(D.formatMoney(9.999, '€'), '€10.00');
});

test('parseMoney strips currency signs and separators', () => {
  assert.equal(D.parseMoney('₩1,234,500'), 1234500);
  assert.equal(D.parseMoney('$1,234.50'), 1234.5);
  assert.equal(D.parseMoney('-$12.5'), -12.5);
  assert.equal(D.parseMoney('1 000 원'), 1000);
  assert.equal(D.parseMoney(42), 42);
  assert.equal(D.parseMoney(''), 0, 'empty is zero');
  assert.equal(D.parseMoney('1.2.3'), null);
  assert.equal(D.parseMoney('--5'), null);
  assert.equal(D.parseMoney(D.formatMoney(-1234.5, '$')), -1234.5, 'round trip');
});

// Board view unit tests (node:test, no browser): the board model (lanes, filters, drop neighbours, view
// state per board) and the shared view helpers (dates, durations, cards).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const M = await import('../../src/views/board/model.js');
const F = await import('../../src/views/shared/format.js');
const C = await import('../../src/views/shared/cards.js');
const { errorMessage } = await import('../../src/views/shared/errors.js');
const { demoBoardData } = await import('../../src/views/board/demo.js');

const t = (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key);
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };

test('board view state is remembered per board and survives bad stored values', () => {
  const store = memory();
  assert.deepEqual(M.loadPrefs('b1', store), M.defaultPrefs());
  M.savePrefs('b1', { ...M.defaultPrefs(), groupBy: 'assignee', quick: ['q1'], search: 'x' }, store);
  assert.equal(M.loadPrefs('b1', store).groupBy, 'assignee');
  assert.deepEqual(M.loadPrefs('b2', store).quick, []);
  store.setItem('myboard.board.b3', '{"groupBy":"bogus","quick":"no"}');
  assert.equal(M.loadPrefs('b3', store).groupBy, null);
  assert.deepEqual(M.loadPrefs('b3', store).quick, []);
  store.setItem('myboard.board.b4', 'not json');
  assert.deepEqual(M.loadPrefs('b4', store), M.defaultPrefs());
});

test('grouping: the page choice wins, queries only when the board itself uses them', () => {
  assert.equal(M.groupMode({ groupBy: null }, { swimlanes: 'epic' }), 'epic');
  assert.equal(M.groupMode({ groupBy: 'assignee' }, { swimlanes: 'epic' }), 'assignee');
  assert.equal(M.groupMode({ groupBy: 'queries' }, { swimlanes: 'none' }), 'none');
  assert.ok(!M.groupChoices({ swimlanes: 'none' }).includes('queries'));
  assert.ok(M.groupChoices({ swimlanes: 'queries' }).includes('queries'));
});

test('layout: columns × lanes hold every shown card once, by rank, with WIP state', () => {
  const data = demoBoardData({ lang: 'en' });
  const L = C.createLookups(data);
  for (const mode of M.GROUP_MODES.filter((m) => m !== 'queries')) {
    const layout = M.buildLayout(data, L, { prefs: { ...M.defaultPrefs(), groupBy: mode }, t });
    const placed = [...layout.cells.values()].flat();
    assert.equal(placed.length, data.issues.length, mode);
    assert.equal(new Set(placed.map((c) => c.id)).size, placed.length, `${mode}: once`);
    assert.equal(layout.lanes.reduce((s, l) => s + l.count, 0), data.issues.length, `${mode}: lane counts`);
    for (const list of layout.cells.values()) for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].rank <= list[i].rank, `${mode}: rank order`);
  }
  const wip = { ...data, columns: data.columns.map((c, i) => (i === 2 ? { ...c, wipMax: 1, wipMin: null } : i === 1 ? { ...c, wipMin: 9 } : c)) };
  const layout = M.buildLayout(wip, C.createLookups(wip), { prefs: M.defaultPrefs(), t });
  assert.ok(layout.columns[2].over);
  assert.ok(layout.columns[1].under);
  const none = M.buildLayout({ ...wip, board: { ...wip.board, settings: { ...wip.board.settings, columnConstraint: 'none' } } }, C.createLookups(wip), { prefs: M.defaultPrefs(), t });
  assert.ok(!none.columns[2].over, 'no WIP checks without the issue-count constraint');
});

test('page filters: only mine, recently updated', () => {
  const now = Date.now();
  const cards = [{ id: 'a', assigneeId: 'me', updatedAt: now - 1000 }, { id: 'b', assigneeId: 'you', updatedAt: now - 3 * 86400000 }, { id: 'c', assigneeId: null, updatedAt: now }];
  assert.deepEqual(M.filterCards(cards, { mine: true }, { me: 'me', now }).map((c) => c.id), ['a']);
  assert.deepEqual(M.filterCards(cards, { recent: true }, { me: 'me', now }).map((c) => c.id), ['a', 'c']);
});

test('drop neighbours leave the dragged cards out', () => {
  const list = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
  assert.deepEqual(M.dropNeighbours(list, 0), { afterId: null, beforeId: 'a' });
  assert.deepEqual(M.dropNeighbours(list, 4), { afterId: 'd', beforeId: null });
  assert.deepEqual(M.dropNeighbours(list, 1, new Set(['a'])), { afterId: 'b', beforeId: 'c' });
  assert.deepEqual(M.dropNeighbours(list, 99, new Set(['d'])), { afterId: 'c', beforeId: null });
  assert.deepEqual(M.neighbours(list, 'c'), { aboveId: 'b', belowId: 'd' });
  assert.equal(M.laneValue('none'), null);
  assert.equal(M.laneValue('u1'), 'u1');
});

test('durations and dates (1d = 8h, 1w = 5d)', () => {
  assert.equal(F.parseDuration('1h 30m'), 5400);
  assert.equal(F.parseDuration('1w 2d'), 7 * 8 * 3600);
  assert.equal(F.parseDuration('1주 2일 3시간'), (7 * 8 + 3) * 3600);
  assert.equal(F.parseDuration('1.5'), 5400);
  assert.equal(F.parseDuration(''), null);
  assert.ok(Number.isNaN(F.parseDuration('soon')));
  assert.equal(F.formatDuration(5400, 'en'), '1h 30m');
  assert.equal(F.formatDuration(5400, 'ko'), '1시간 30분');
  const now = new Date(2026, 10, 11, 12).getTime();
  assert.equal(F.dueState('2026-11-10', { now }), 'overdue');
  assert.equal(F.dueState('2026-11-11', { now }), 'today');
  assert.equal(F.dueState('2026-11-13', { now }), 'soon');
  assert.equal(F.dueState('2026-12-30', { now }), 'later');
  assert.equal(F.dueState('2026-11-10', { now, resolved: true }), 'done');
  assert.equal(F.relativeTime(now - 5 * 60000, 'en', now), '5 min ago');
  assert.equal(F.relativeTime(now - 2 * 86400000, 'ko', now), '2일 전');
  assert.equal(F.initials('Alex Kim'), 'AK');
});

test('cards: the parts a card shows, escaped; full issues become cards', () => {
  const data = demoBoardData({ lang: 'en' });
  const L = C.createLookups(data);
  const card = { ...data.issues[1], summary: '<b>x</b>' };
  const html = C.cardHtml(card, L, { t, glyph: (n) => `[${n}]` });
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;') && !html.includes('<b>x</b>'));
  assert.ok(html.includes('mb-flag') && html.includes('mb-due overdue'));
  assert.ok(html.includes(`data-id="${card.id}"`));
  const full = { ...data.issues[0], statusId: data.statuses[2].id, subtasks: [{ statusId: data.statuses[3].id }, { statusId: data.statuses[0].id }], checklist: [{ done: true }] };
  const next = C.issueToCard(full, { prev: data.issues[0], L });
  assert.equal(next.columnId, data.columns[2].id);
  assert.deepEqual(next.subtasks, { total: 2, done: 1 });
  assert.deepEqual(next.checklist, { total: 1, done: 1 });
  assert.match(C.letterAvatar({ id: 'u1', displayName: 'Alex Kim' }), /^l:AK#[0-9a-f]{6}$/);
});

test('API errors are translated by code', () => {
  const tr = (key) => ({ 'error.code.transition_not_allowed': 'not allowed', 'shared.err.condition': 'condition' })[key] ?? key;
  assert.equal(errorMessage({ code: 'TRANSITION_NOT_ALLOWED' }, tr), 'not allowed');
  assert.equal(errorMessage({ code: 'CONDITION_ASSIGNEE', message: 'Only the assignee' }, tr), 'condition: Only the assignee');
  assert.equal(errorMessage({ code: 'SOMETHING', message: 'raw' }, tr), 'raw');
});

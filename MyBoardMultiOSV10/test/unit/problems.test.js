// The Problems tab's finder (src/ui/problems.js): board data + a fixed clock → the expected problems, sorted
// errors first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findProblems, countBySeverity } from '../../src/ui/problems.js';

const DAY = 86_400_000;
const now = new Date(2026, 10, 11, 15, 0).getTime();
const iso = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const data = {
  statuses: [{ id: 's1', name: 'To Do', category: 'todo' }, { id: 's2', name: 'Doing', category: 'inprogress' }, { id: 's3', name: 'Done', category: 'done' }, { id: 's4', name: 'Parked', category: 'todo' }],
  columns: [
    { id: 'c1', name: 'To Do', statusIds: ['s1'], count: 1 },
    { id: 'c2', name: 'Doing', statusIds: ['s2'], count: 4, wipMax: 3, overMax: true },
    { id: 'c3', name: 'Done', statusIds: ['s3'], count: 1 },
    { id: 'c4', name: 'QA', statusIds: [], count: 0, wipMin: 1, underMin: true },
  ],
  issues: [
    { id: 'i1', key: 'K-1', summary: 'late', statusId: 's1', columnId: 'c1', dueDate: iso(now - 3 * DAY) },
    { id: 'i2', key: 'K-2', summary: 'today', statusId: 's2', columnId: 'c2', dueDate: iso(now), assigneeId: 'u1', statusChangedAt: now },
    { id: 'i3', key: 'K-3', summary: 'old', statusId: 's2', columnId: 'c2', statusChangedAt: now - 20 * DAY, assigneeId: 'u1', flagged: true },
    { id: 'i4', key: 'K-4', summary: 'nobody', statusId: 's2', columnId: 'c2', statusChangedAt: now },
    { id: 'i5', key: 'K-5', summary: 'done late', statusId: 's3', columnId: 'c3', dueDate: iso(now - 9 * DAY) },
  ],
  backlog: [],
};

test('problems: WIP, empty columns, unmapped statuses, overdue / due today, flagged, stale, unassigned', () => {
  const list = findProblems(data, { now });
  const kinds = list.map((p) => `${p.kind}:${p.issueKey ?? p.columnId ?? p.params.status}`);
  for (const k of ['wipOver:c2', 'wipUnder:c4', 'emptyColumn:c4', 'unmapped:Parked', 'overdue:K-1', 'dueToday:K-2', 'flagged:K-3', 'stale:K-3', 'unassigned:K-4']) assert.ok(kinds.includes(k), k);
  assert.ok(!kinds.some((k) => k.endsWith('K-5')), 'a done issue is never a problem');
  assert.equal(list.find((p) => p.kind === 'overdue').params.days, 3);
  assert.equal(list.find((p) => p.kind === 'stale').params.days, 20);
  const order = list.map((p) => p.severity);
  assert.deepEqual(order, [...order].sort((a, b) => ['error', 'warning', 'info'].indexOf(a) - ['error', 'warning', 'info'].indexOf(b)), 'errors first, then warnings, then info');
  assert.deepEqual(countBySeverity(list), { error: 2, warning: 6, info: 1 });
});

test('problems: the app state (core, errors in Messages) and a clean board', () => {
  assert.deepEqual(findProblems(null, { coreOk: false, errors: 2 }).map((p) => p.kind), ['core', 'messages']);
  assert.deepEqual(findProblems({ statuses: [{ id: 's', name: 'A', category: 'todo' }], columns: [{ id: 'c', name: 'A', statusIds: ['s'], count: 0 }], issues: [] }, { now }), []);
});

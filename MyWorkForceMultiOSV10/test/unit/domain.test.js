import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { toCsv, toMarkdown } from '../../src/domain/export.js';
import { escapeHtml, renderMarkdown } from '../../src/domain/markdown.js';
import { allowed } from '../../src/domain/permissions.js';
import { runQuery } from '../../src/domain/query.js';
import { burndown, slaState, statusAt, velocity } from '../../src/domain/reports.js';
import { sampleWorkspace } from '../../src/domain/sample.js';
import { addComment, addLink, completeSprint, createIssue, readDocument, updateIssue } from '../../src/domain/store.js';

describe('Sample workspace', () => {
const now = Date.parse('2026-11-15T12:00:00');
const ws = sampleWorkspace(now);
const shop = ws.projects.find((project) => project.key === 'SHOP');
const support = ws.projects.find((project) => project.key === 'SUP');
const keys = (result) => result.issues.map((issue) => issue.key);

test('an empty query returns every issue ordered by rank', () => {
  const result = runQuery(ws, shop, '');
  assert.equal(result.error, null);
  assert.equal(result.issues.length, shop.issues.length);
  const ranks = result.issues.map((issue) => issue.rank);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
});

test('types, status, labels and text match in both languages', () => {
  assert.deepEqual(keys(runQuery(ws, shop, 'type = bug')).sort(), keys(runQuery(ws, shop, 'type = 결함')).sort());
  assert.ok(keys(runQuery(ws, shop, 'type = bug')).includes('SHOP-11'));
  assert.ok(keys(runQuery(ws, shop, 'status != done')).every((key) => shop.issues.find((issue) => issue.key === key).statusId !== 'done'));
  assert.ok(keys(runQuery(ws, shop, 'labels = frontend')).includes('SHOP-9'));
  assert.ok(keys(runQuery(ws, shop, 'text ~ "결제"')).includes('SHOP-9'));
});

test('and, or, not and parentheses', () => {
  const both = keys(runQuery(ws, shop, 'type = bug status = done'));
  assert.ok(both.includes('SHOP-5'));
  assert.ok(!both.includes('SHOP-11'));
  const either = keys(runQuery(ws, shop, 'key = SHOP-3 OR (key = SHOP-11)'));
  assert.deepEqual(either.sort(), ['SHOP-11', 'SHOP-3']);
  const hidden = keys(runQuery(ws, shop, 'NOT type = bug'));
  assert.ok(!hidden.includes('SHOP-11'));
});

test('current user, empty assignee, open sprint and priority order', () => {
  assert.ok(keys(runQuery(ws, shop, 'assignee = currentUser()')).includes('SHOP-1'));
  assert.ok(keys(runQuery(ws, shop, 'assignee is empty')).includes('SHOP-12'));
  const sprint = keys(runQuery(ws, shop, 'sprint = openSprints()'));
  assert.ok(sprint.includes('SHOP-9'));
  assert.ok(!sprint.includes('SHOP-3'));
  const high = keys(runQuery(ws, shop, 'priority in (highest, high)'));
  assert.ok(high.includes('SHOP-11'));
  const ranked = runQuery(ws, shop, 'priority >= high ORDER BY priority DESC').issues;
  assert.ok((ranked[0].priorityId === 'highest' || ranked[0].priorityId === 'high'));
  assert.equal(runQuery(ws, shop, 'type = =').error, 'query');
});

test('relative dates and the service time limit', () => {
  assert.ok(keys(runQuery(ws, shop, 'created >= -30d', { now })).includes('SHOP-18'));
  const late = runQuery(ws, support, 'sla = breached', { now });
  assert.deepEqual(keys(late), ['SUP-1']);
  const met = slaState(support, support.issues.find((issue) => issue.key === 'SUP-3'), now);
  assert.equal(met.met, true);
  assert.equal(met.breached, false);
});

test('a viewer cannot create, and comments reach watchers', () => {
  assert.equal(allowed(ws, shop, 'u5', 'create'), false);
  assert.throws(() => createIssue(ws, shop.id, { summary: '보면 안 됨' }, 'u5'), /permission/);
  const before = shop.notifications.length;
  const issue = createIssue(ws, shop.id, { typeId: 'task', summary: '알림 확인', assigneeId: 'u3' }, 'u2');
  assert.ok(shop.notifications.some((item) => item.issueId === issue.id && item.userId === 'u3' && item.kind === 'created'));
  addComment(ws, shop.id, issue.id, '@김서연 확인', 'u2');
  assert.ok(shop.notifications.length > before);
  assert.throws(() => addLink(ws, shop.id, issue.id, 'relates', issue.key, 'u2'), /self-link/);
});

test('completing a sprint returns unfinished work to the backlog', () => {
  const copy = sampleWorkspace(now);
  const project = copy.projects.find((item) => item.key === 'SHOP');
  completeSprint(copy, project.id, 's3', 'backlog', 'u1');
  const todo = project.issues.find((issue) => issue.key === 'SHOP-10');
  const done = project.issues.find((issue) => issue.key === 'SHOP-21');
  assert.equal(todo.sprintId, '');
  assert.equal(todo.statusId, 'backlog');
  assert.equal(done.sprintId, 's3');
  assert.equal(project.sprints.find((sprint) => sprint.id === 's3').state, 'closed');
});

test('burndown, velocity and status history', () => {
  const sprint = shop.sprints.find((item) => item.id === 's3');
  const chart = burndown(shop, sprint, now);
  assert.equal(chart.total, 28);
  const latest = [...chart.days].reverse().find((day) => day.remaining != null);
  assert.equal(latest.remaining, 23);
  const speeds = velocity(shop);
  assert.deepEqual(speeds.map((item) => item.completed), [10, 13]);
  const issue = shop.issues.find((item) => item.key === 'SHOP-21');
  const before = Date.parse(issue.history[0].at) - 1000;
  assert.equal(statusAt(issue, before), 'progress');
  assert.equal(statusAt(issue, now), 'done');
});

test('markdown escapes markup and csv carries a header', () => {
  assert.equal(escapeHtml('<script>'), '&lt;script&gt;');
  assert.ok(!renderMarkdown('<script>alert(1)</script>').includes('<script'));
  const csv = toCsv(ws, shop, shop.issues.slice(0, 1), 'ko');
  assert.ok(csv.startsWith('\uFEFF키,'));
  assert.ok(toMarkdown(ws, shop, shop.issues.slice(0, 1), 'ko').includes(shop.issues[0].key));
});

test('a document without the workspace mark is rejected', () => {
  assert.throws(() => readDocument({}), /file-invalid/);
});

test('a transition records history', () => {
  const copy = sampleWorkspace(now);
  const project = copy.projects.find((item) => item.key === 'SHOP');
  updateIssue(copy, project.id, 'i10', { statusId: 'progress' }, 'u2');
  const issue = project.issues.find((item) => item.id === 'i10');
  assert.equal(issue.statusId, 'progress');
  assert.equal(issue.history.at(-1).to, 'progress');
});
});

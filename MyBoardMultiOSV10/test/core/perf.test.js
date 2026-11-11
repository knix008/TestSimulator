// Performance: the board data endpoint for 2000 issues (with labels, subtasks, checklists, comments, versions)
// must load well under 300 ms on SQLite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../../core/app.js';
import { newId } from '../../core/ids.js';
import * as rank from '../../core/rank.js';

const N = 2000;
const BUDGET_MS = 300;

test(`board data for ${N} issues loads in under ${BUDGET_MS} ms on SQLite`, async () => {
  const core = await createCore({ scheduler: false });
  try {
    const S = core.services;
    const admin = await S.users.create({ system: true }, { username: 'perf', displayName: 'Perf', role: 'admin' }, { bootstrap: true });
    const A = { user: { id: admin.id, role: 'admin' } };
    const p = await S.projects.create(A, { key: 'PERF', name: 'Perf', template: 'software' });
    const c = await S.projects.config(A, p.id);
    const users = [];
    for (let i = 0; i < 12; i++) users.push(await S.users.create(A, { username: `u${i}`, displayName: `User ${i}` }));
    const v = await S.versions.create(A, p.id, { name: '1.0' });
    const comp = await S.components.create(A, p.id, { name: 'Core' });
    await S.boards.quickFilters.create(A, p.boardId, { name: 'Mine', jql: 'assignee = currentUser()' });
    await S.boards.update(A, p.boardId, { settings: { swimlanes: 'epic', doneHideDays: null } });

    const now = Date.now();
    const keys = rank.initial(N);
    const std = c.types.filter((t) => t.level === 0);
    const epicType = c.types.find((t) => t.level === -1);
    const subType = c.types.find((t) => t.level === 1);
    const issues = [];
    const labels = []; const checklist = []; const comments = []; const versions = []; const comps = []; const history = [];
    for (let i = 0; i < N; i++) {
      const id = newId();
      const isEpic = i < 20;
      const isSub = !isEpic && i % 10 === 0;
      const status = c.statuses[i % c.statuses.length];
      issues.push({
        id, project_id: p.id, number: i + 1, key: `PERF-${i + 1}`, type_id: isEpic ? epicType.id : isSub ? subType.id : std[i % std.length].id,
        status_id: status.id, priority_id: c.priorities[i % 5].id, summary: `Issue number ${i + 1} with a reasonably long summary text`,
        description: 'Some **markdown** text', assignee_id: users[i % users.length].id, reporter_id: admin.id,
        parent_id: isSub ? issues[i - 1].id : null, epic_id: isEpic ? null : issues[i % 20]?.id ?? null, story_points: [1, 2, 3, 5, 8][i % 5],
        rank: keys[i], flagged: i % 37 === 0 ? 1 : 0, due_date: i % 7 === 0 ? '2026-12-01' : null,
        resolution_id: status.category === 'done' ? c.resolutions[0].id : null, resolved_at: status.category === 'done' ? now - i * 1000 : null,
        status_changed_at: now - i * 1000, created_at: now - i * 60000, updated_at: now - i * 1000,
      });
      labels.push({ issue_id: id, label: `area-${i % 9}` }, { issue_id: id, label: i % 2 ? 'odd' : 'even' });
      if (i % 3 === 0) for (let k = 0; k < 4; k++) checklist.push({ id: newId(), issue_id: id, text: `step ${k}`, done: k < 2 ? 1 : 0, position: rank.initial(4)[k], created_at: now, updated_at: now });
      if (i % 2 === 0) for (let k = 0; k < 3; k++) comments.push({ id: newId(), issue_id: id, author_id: admin.id, body: `comment ${k}`, created_at: now, updated_at: now });
      if (i % 4 === 0) versions.push({ issue_id: id, version_id: v.id, kind: 'fix' });
      if (i % 5 === 0) comps.push({ issue_id: id, component_id: comp.id });
      history.push({ id: newId(), issue_id: id, user_id: admin.id, field: 'created', to_value: c.statuses[0].id, at: now - i * 60000 });
    }
    await core.db.insertMany('issues', issues);
    await core.db.insertMany('issue_labels', labels);
    await core.db.insertMany('checklist_items', checklist);
    await core.db.insertMany('comments', comments);
    await core.db.insertMany('issue_versions', versions);
    await core.db.insertMany('issue_components', comps);
    await core.db.insertMany('issue_history', history);

    await S.boards.data(A, p.boardId); // warm statement caches
    const times = [];
    let data;
    for (let k = 0; k < 5; k++) {
      const t0 = performance.now();
      data = await S.boards.data(A, p.boardId);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const median = times[2];
    assert.equal(data.issues.length + data.backlog.length, N);
    assert.ok(data.issues.some((x) => x.checklist && x.subtasks));
    assert.ok(data.swimlanes.length > 1);
    assert.ok(median < BUDGET_MS, `median ${median.toFixed(1)} ms (all: ${times.map((t) => t.toFixed(0)).join(', ')})`);
    console.log(`# board data, ${N} issues: median ${median.toFixed(1)} ms`);

    // a JQL search over the same data stays fast too
    const t1 = performance.now();
    const res = await S.issues.search(A, { jql: 'project = PERF AND labels = odd AND statusCategory != Done ORDER BY priority DESC, updated DESC', limit: 100 });
    const searchMs = performance.now() - t1;
    assert.ok(res.total > 0);
    assert.ok(searchMs < BUDGET_MS, `search ${searchMs.toFixed(1)} ms`);
  } finally {
    await core.close();
  }
});

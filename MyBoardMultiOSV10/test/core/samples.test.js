// Sample data generator: realistic projects with history, on SQLite (en + ko) and PostgreSQL (PGlite).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { createCore } from '../../core/app.js';
import { createSamples } from '../../core/samples.js';

const DAY = 86400000;

async function checkSamples(core, language) {
  const t0 = Date.now();
  const res = await createSamples(core, { language });
  const elapsed = Date.now() - t0;
  await core.events.idle();
  const db = core.db;
  const admin = await db.get('SELECT * FROM "users" WHERE "role" = ? AND "active" = 1 ORDER BY "created_at"', ['admin']);
  const ctx = { user: { id: admin.id, role: 'admin' } };

  assert.equal(res.projects.length, 3);
  assert.ok(elapsed < 10000, `createSamples took ${elapsed} ms`);
  const [soft, bugs, home] = res.projects;
  assert.ok(soft.issueCount >= 55, `software issues ${soft.issueCount}`);
  assert.ok(bugs.issueCount >= 20);
  assert.ok(home.issueCount >= 10);
  assert.ok(res.users.length >= 6);

  const level = async (lv) => Number(await db.value('SELECT COUNT(*) AS n FROM "issues" i JOIN "issue_types" t ON t."id" = i."type_id" WHERE i."project_id" = ? AND t."level" = ?', [soft.id, lv], 0));
  assert.ok((await level(-1)) >= 4, 'epics');
  assert.ok((await level(1)) >= 8, 'subtasks');

  const span = await db.get('SELECT MIN(h."at") AS a, MAX(h."at") AS b FROM "issue_history" h JOIN "issues" i ON i."id" = h."issue_id" WHERE i."project_id" = ?', [soft.id]);
  assert.ok((Number(span.b) - Number(span.a)) / DAY >= 45, 'history spans 45+ days');

  const cfd = await core.services.reports.cfd(ctx, { boardId: soft.boardId });
  const done = cfd.series[cfd.series.length - 1].values;
  assert.ok(done[done.length - 1] > 0, 'done on the last day');
  assert.ok(new Set(done).size >= 2, 'done grows over time');

  const control = await core.services.reports.control(ctx, { boardId: soft.boardId });
  assert.ok(control.points.length >= 15, `control points ${control.points.length}`);

  const data = await core.services.boards.data(ctx, soft.boardId, {});
  assert.ok(new Set(data.issues.map((c) => c.columnId)).size >= 4, 'cards in 4+ columns');
  assert.ok(data.backlog.length > 0, 'kanban backlog');

  const summaries = (await db.all('SELECT "summary" FROM "issues" WHERE "project_id" = ?', [soft.id])).map((r) => r.summary).join('\n');
  if (language === 'ko') assert.match(summaries, /[가-힣]/);
  else assert.doesNotMatch(summaries, /[가-힣]/);

  const refs = [
    ...(await db.all('SELECT "icon" AS v FROM "issues"')), ...(await db.all('SELECT "icon" AS v FROM "projects"')),
    ...(await db.all('SELECT "icon" AS v FROM "components"')), ...(await db.all('SELECT "avatar" AS v FROM "users"')),
  ].map((r) => r.v).filter(Boolean);
  for (const kind of ['b:', 'e:', 'l:', 'u:']) assert.ok(refs.some((r) => r.startsWith(kind)), `icon kind ${kind}`);

  assert.ok(await db.count('comments') > 10);
  assert.ok(await db.count('worklogs') > 5);
  assert.ok(await db.count('issue_links') >= 5);
  assert.ok(await db.count('checklist_items') > 5);
  assert.ok(await db.count('quick_filters') >= 4);
  assert.ok(await db.count('automation_rules') >= 2);
  return res;
}

describe('samples on SQLite', () => {
  test('English samples, twice in one database', async () => {
    const core = await createCore({ scheduler: false });
    try {
      const a = await checkSamples(core, 'en');
      const b = await createSamples(core, { language: 'en', seed: 2 });
      const keysA = a.projects.map((p) => p.key);
      const keysB = b.projects.map((p) => p.key);
      assert.deepEqual(keysA, ['SHOP', 'BUG', 'HOME']);
      assert.equal(new Set([...keysA, ...keysB]).size, 6, 'second run uses new keys');
      assert.ok(b.projects[0].issueCount >= 55);
      await core.events.idle();
    } finally {
      await core.close();
    }
  });

  test('Korean samples', async () => {
    const core = await createCore({ scheduler: false });
    try {
      await checkSamples(core, 'ko');
    } finally {
      await core.close();
    }
  });
});

describe('samples on PostgreSQL (PGlite)', () => {
  test('English samples', async () => {
    const core = await createCore({ db: { type: 'postgres', pglite: new PGlite() }, scheduler: false });
    try {
      await checkSamples(core, 'en');
    } finally {
      await core.close();
    }
  });
});

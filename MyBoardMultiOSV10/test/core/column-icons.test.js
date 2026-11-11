// Board column icons (ARCHITECTURE §3.6), end to end through the REST API on every configured database:
// template defaults, defaults for columns made without an icon, round trip (create, patch, clear → default),
// /boards/:id and /data, reorder, .myboard export/import (also of a file from before column icons), the card
// board import, DB copy, and the migration of a database whose columns have no icon.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startWeb } from '../../server/web.js';
import { openDatabase } from '../../core/db/index.js';
import { migrate } from '../../core/db/migrate.js';
import { defaultColumnIcon } from '../../core/columnicons.js';
import { TARGETS, freshConfig, configured, skipMessage } from './helpers/targets.js';

const tmpDir = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

function client(base, headers = {}) {
  return async (method, p, body) => {
    const res = await fetch(base + p, { method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const type = res.headers.get('content-type') || '';
    return { status: res.status, data: type.includes('json') ? await res.json() : null };
  };
}
const ok = (r, what = '') => { assert.ok(r.status < 300, `${what} → ${r.status} ${JSON.stringify(r.data?.error ?? r.data)}`); return r.data; };
const icons = (cols) => cols.map((c) => [c.name, c.icon]);

test('default column icons follow the name (English and Korean), then the backlog, then the category', () => {
  const cases = [
    ['Backlog', 'b:backlog'], ['To Do', 'b:todo'], ['In Progress', 'b:inProgress'], ['In Review', 'b:review'], ['Code review', 'b:codeReview'],
    ['QA', 'b:test'], ['Testing', 'b:test'], ['Done', 'b:done'], ['Blocked', 'b:blocked'], ['Waiting', 'b:waiting'], ['Deploy', 'b:deploy'],
    ['Selected for Development', 'b:ready'], ['Open', 'b:circle'], ['Resolved', 'b:resolved'], ['Closed', 'b:lock'], ['Shipped', 'b:truck'],
    ['백로그', 'b:backlog'], ['할 일', 'b:todo'], ['진행 중', 'b:inProgress'], ['검토 중', 'b:review'], ['완료', 'b:done'], ['면접', 'b:interview'],
  ];
  for (const [name, ref] of cases) assert.equal(defaultColumnIcon(name), ref, name);
  assert.equal(defaultColumnIcon('Zeta', null, { backlog: true }), 'b:backlog');
  assert.equal(defaultColumnIcon('Zeta', ['done', 'done']), 'b:done');
  assert.equal(defaultColumnIcon('Zeta', ['todo', 'inprogress']), 'b:inProgress');
  assert.equal(defaultColumnIcon('Zeta', 'todo'), 'b:todo');
  assert.equal(defaultColumnIcon('Zeta'), 'b:circle');
});

for (const target of TARGETS) {
  if (!configured(target)) {
    test(`${target.name} column icons`, (t) => t.skip(skipMessage(target)));
    continue;
  }
  describe(`${target.name} column icons`, () => {
    let web; let A;
    const dataDir = tmpDir('myboard-colicons-');
    before(async () => {
      web = await startWeb({ port: 0, host: '127.0.0.1', dataDir, staticDir: path.join(dataDir, 'dist'), db: await freshConfig(target), scheduler: false });
      const setup = await client(web.url)('POST', '/api/auth/setup', { username: 'boss', password: 'boss-pw', displayName: 'Boss' });
      A = client(web.url, { authorization: `Bearer ${setup.data.token}` });
    });
    after(async () => { await web?.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

    test('every template board column has its icon', async () => {
      const want = {
        kanban: [['Backlog', 'b:backlog'], ['Selected for Development', 'b:ready'], ['In Progress', 'b:inProgress'], ['Done', 'b:done']],
        software: [['Backlog', 'b:backlog'], ['To Do', 'b:todo'], ['In Progress', 'b:inProgress'], ['In Review', 'b:review'], ['Done', 'b:done']],
        bugs: [['Open', 'b:inbox'], ['In Progress', 'b:debug'], ['Resolved', 'b:resolved'], ['Closed', 'b:lock']],
        simple: [['To Do', 'b:todo'], ['Doing', 'b:inProgress'], ['Done', 'b:done']],
      };
      for (const [template, cols] of Object.entries(want)) {
        const p = ok(await A('POST', '/api/projects', { key: `T${template.slice(0, 3).toUpperCase()}`, name: template, template }), template);
        assert.deepEqual(icons(ok(await A('GET', `/api/boards/${p.boardId}`)).columns), cols, template);
        assert.deepEqual(icons(ok(await A('GET', `/api/boards/${p.boardId}/data`)).columns), cols, `${template} data`);
      }
      // localised names (the samples) keep the template's icons
      const ko = ok(await A('POST', '/api/projects', { key: 'TKO', name: 'ko', template: 'simple', names: { columns: ['할 일', '하는 중', '완료'] } }));
      assert.deepEqual(icons(ok(await A('GET', `/api/boards/${ko.boardId}`)).columns), [['할 일', 'b:todo'], ['하는 중', 'b:inProgress'], ['완료', 'b:done']]);
    });

    test('the default columns of a board cannot be deleted; columns added later can', async () => {
      const p = ok(await A('POST', '/api/projects', { key: 'BIC', name: 'Built-in columns', template: 'kanban' }));
      const B = `/api/boards/${p.boardId}`;
      const own = ok(await A('GET', B)).columns;
      assert.ok(own.length > 0 && own.every((c) => c.builtIn === true), 'template columns are built in');
      const added = ok(await A('POST', `${B}/columns`, { name: 'Extra', statusIds: [] }));
      const data = ok(await A('GET', `${B}/data`)).columns;
      assert.deepEqual(data.map((c) => c.builtIn), [...own.map(() => true), false], '/data marks them too');
      const refused = await A('DELETE', `${B}/columns/${own[0].id}`);
      assert.equal(refused.status, 400, 'deleting a default column is refused');
      assert.equal(refused.data?.error?.code, 'BUILT_IN_COLUMN');
      ok(await A('DELETE', `${B}/columns/${added.id}`), 'an added column can go');
      assert.equal(ok(await A('GET', B)).columns.length, own.length);
    });

    test('a column without an icon gets the default; icons round trip; clearing gives the default back', async () => {
      const p = ok(await A('POST', '/api/projects', { key: 'CI', name: 'Column icons', template: 'kanban' }));
      const B = `/api/boards/${p.boardId}`;
      const qa = ok(await A('POST', `${B}/columns`, { name: 'QA', statusIds: [] }));
      assert.equal(qa.icon, 'b:test');
      const blank = ok(await A('POST', `${B}/columns`, { name: 'Zeta', icon: '', statusIds: [] }));
      assert.equal(blank.icon, 'b:circle');
      const mine = ok(await A('POST', `${B}/columns`, { name: 'Ship it', icon: 'b:rocket#e5484d', statusIds: [] }));
      assert.equal(mine.icon, 'b:rocket#e5484d');
      const up = ok(await A('PATCH', `${B}/columns/${mine.id}`, { icon: 'e:🚀', rev: mine.rev }));
      assert.deepEqual([up.icon, up.rev], ['e:🚀', mine.rev + 1]);
      const cleared = ok(await A('PATCH', `${B}/columns/${mine.id}`, { icon: null }));
      assert.equal(cleared.icon, 'b:truck', 'cleared → the default of "Ship it"');
      const renamed = ok(await A('PATCH', `${B}/columns/${mine.id}`, { name: 'Blocked', icon: '' }));
      assert.equal(renamed.icon, 'b:blocked', 'cleared with a new name → the default of the new name');
      // a column holding done statuses only, named nothing known → done
      const board = ok(await A('GET', B));
      const doneCol = board.columns.find((c) => c.name === 'Done');
      const other = ok(await A('POST', `${B}/columns`, { name: 'Zeta two', statusIds: doneCol.statusIds }));
      assert.equal(other.icon, 'b:done');
      // reorder keeps the icons (and is the order /data returns)
      const ids = ok(await A('GET', B)).columns.map((c) => c.id).reverse();
      ok(await A('POST', `${B}/columns/order`, { ids }));
      const data = ok(await A('GET', `${B}/data`));
      assert.deepEqual(data.columns.map((c) => c.id), ids);
      assert.ok(data.columns.every((c) => typeof c.icon === 'string' && c.icon), 'every column has an icon');
      assert.equal(data.columns.find((c) => c.id === qa.id).icon, 'b:test');
    });

    test('.myboard export/import keeps column icons; a file from before icons gets defaults; card board import too', async () => {
      const p = ok(await A('POST', '/api/projects', { key: 'EXI', name: 'Export icons', template: 'software' }));
      const B = `/api/boards/${p.boardId}`;
      const col = ok(await A('GET', B)).columns.find((c) => c.name === 'In Review');
      ok(await A('PATCH', `${B}/columns/${col.id}`, { icon: 'b:eye#7a5af8' }));
      const file = ok(await A('GET', `/api/projects/${p.id}/export`), 'export');
      assert.ok(file.tables.board_columns.every((c) => c.icon), 'the file holds the icons');
      const copy = ok(await A('POST', '/api/import/myboard', { file, key: 'EXJ', name: 'Copy' }));
      const copyBoard = ok(await A('GET', '/api/boards', undefined)).find((b) => b.projectId === copy.id);
      assert.deepEqual(icons(ok(await A('GET', `/api/boards/${copyBoard.id}`)).columns), [['Backlog', 'b:backlog'], ['To Do', 'b:todo'], ['In Progress', 'b:inProgress'], ['In Review', 'b:eye#7a5af8'], ['Done', 'b:done']]);
      // an old file: no icon in board_columns → the defaults, stored
      const old = JSON.parse(JSON.stringify(file));
      for (const c of old.tables.board_columns) delete c.icon;
      const oldCopy = ok(await A('POST', '/api/import/myboard', { file: old, key: 'EXK', name: 'Old copy' }));
      const oldBoard = ok(await A('GET', '/api/boards')).find((b) => b.projectId === oldCopy.id);
      assert.deepEqual(icons(ok(await A('GET', `/api/boards/${oldBoard.id}`)).columns).map(([, i]) => i), ['b:backlog', 'b:todo', 'b:inProgress', 'b:review', 'b:done']);
      const stored = await web.core.db.all('SELECT "icon" FROM "board_columns" WHERE "board_id" = ?', [oldBoard.id]);
      assert.ok(stored.every((r) => r.icon), 'the defaults are written to the database');
      // card board import (lists → columns)
      const trello = { name: 'Trello board', lists: [{ id: 'l1', name: 'Ideas', pos: 1 }, { id: 'l2', name: 'Doing', pos: 2 }, { id: 'l3', name: 'Done', pos: 3 }], cards: [], checklists: [], actions: [], labels: [], members: [] };
      const tp = ok(await A('POST', '/api/import/trello', { board: trello, key: 'TRI' }));
      const tBoard = ok(await A('GET', '/api/boards')).find((b) => b.projectId === (tp.id ?? tp.project?.id));
      assert.deepEqual(icons(ok(await A('GET', `/api/boards/${tBoard.id}`)).columns), [['Ideas', 'b:idea'], ['Doing', 'b:inProgress'], ['Done', 'b:done']]);
    });

    test('DB copy carries the column icons', async () => {
      const dir = tmpDir('myboard-colicons-copy-');
      const file = path.join(dir, 'copy.sqlite3');
      await web.core.copyDb({ system: true }, { type: 'sqlite', file });
      const other = await openDatabase({ type: 'sqlite', file });
      try {
        const src = await web.core.db.all('SELECT "id", "icon" FROM "board_columns" ORDER BY "id"');
        assert.ok(src.length > 10);
        assert.deepEqual(await other.all('SELECT "id", "icon" FROM "board_columns" ORDER BY "id"'), src);
      } finally { await other.close(); fs.rmSync(dir, { recursive: true, force: true }); }
    });
  });
}

// ───────────────────────── a database whose columns have no icon (before board_columns.icon)

const OLD_DB = [
  { name: 'SQLite', open: async (dir) => ({ type: 'sqlite', file: path.join(dir, 'old.sqlite3') }) },
  { name: 'PostgreSQL (PGlite)', open: async () => { const { PGlite } = await import('@electric-sql/pglite'); return { type: 'postgres', pglite: new PGlite() }; } },
];

for (const t of OLD_DB) {
  test(`${t.name}: migrating a database without board_columns.icon fills every column's default icon (idempotent)`, async () => {
    const dir = tmpDir('myboard-colold-');
    const db = await openDatabase(await t.open(dir));
    try {
      await migrate(db);
      await db.run('ALTER TABLE "board_columns" DROP COLUMN "icon"');
      const now = 1;
      await db.insert('statuses', { id: 'st0000000000000000a1', project_id: 'p0000000000000000001', name: 'Fin', category: 'done', position: 0, created_at: now, updated_at: now });
      await db.insert('statuses', { id: 'st0000000000000000a2', project_id: 'p0000000000000000001', name: 'Later', category: 'todo', position: 1, created_at: now, updated_at: now });
      await db.insert('boards', { id: 'b0000000000000000001', project_id: 'p0000000000000000001', name: 'Old', settings: { backlog: { enabled: true, statusIds: ['st0000000000000000a2'] } }, created_at: now, updated_at: now });
      const col = (id, name, statusIds, position) => db.run('INSERT INTO "board_columns" ("id", "board_id", "name", "position", "status_ids", "created_at", "updated_at", "rev") VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, 'b0000000000000000001', name, position, JSON.stringify(statusIds), now, now, 1]);
      await col('c0000000000000000001', 'Pile', ['st0000000000000000a2'], 0);
      await col('c0000000000000000002', 'In Review', [], 1);
      await col('c0000000000000000003', 'Zeta', ['st0000000000000000a1'], 2);
      await migrate(db);
      const rows = await db.all('SELECT "name", "icon" FROM "board_columns" ORDER BY "position"');
      assert.deepEqual(rows.map((r) => [r.name, r.icon]), [['Pile', 'b:backlog'], ['In Review', 'b:review'], ['Zeta', 'b:done']]);
      // a chosen icon is never touched again
      await db.run('UPDATE "board_columns" SET "icon" = ? WHERE "name" = ?', ['e:🎯', 'Zeta']);
      await migrate(db);
      assert.equal((await db.get('SELECT "icon" FROM "board_columns" WHERE "name" = ?', ['Zeta'])).icon, 'e:🎯');
    } finally {
      await db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

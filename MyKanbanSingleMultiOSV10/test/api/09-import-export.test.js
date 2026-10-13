const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { describe, it, before } = require('../lib/framework');
const srv = require('../lib/server');

const SAMPLE = path.join(__dirname, '../../sample/sample.kprj');

describe('Project import / export (.kprj)', () => {
  let admin;
  let board;
  let exported;

  before(async () => {
    await srv.startTestServer();
    admin = await srv.adminClient();
    board = await srv.createBoard(admin, 'Export Project');
    await admin.put(`/boards/${board.id}/columns/${board.columns[2].id}`, { type: 'done', bg_color: '#E0FFE0' });
    await admin.post(`/boards/${board.id}/cards`, { columnId: board.columns[0].id, title: 'Card A', description: 'Desc', dueDate: '2030-06-01', stripeColor: 'red' });
    await admin.post(`/boards/${board.id}/cards`, { columnId: board.columns[2].id, title: 'Card B' });
    const adminRow = await srv.db()('users').where({ username: 'admin' }).first();
    await admin.post(`/boards/${board.id}/cards`, { columnId: board.columns[1].id, title: 'Assigned', assigneeId: adminRow.id });
  });

  it('exports a project as a .kprj download', async () => {
    const res = await admin.get(`/boards/${board.id}/export`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-disposition'), /attachment; filename\*=UTF-8''Export_Project\.kprj/);
    exported = res.body;
    assert.equal(exported.format, 'mykanban-project');
    assert.equal(exported.project.title, 'Export Project');
    assert.equal(exported.project.columns.length, 3);
    assert.equal(exported.project.columns[2].type, 'done');
    assert.equal(exported.project.columns[0].cards[0].stripe_color, 'red');
    assert.equal(exported.project.columns[1].cards[0].assignee_username, 'admin');
  });

  it('round-trips an exported project through import', async () => {
    const res = await admin.post('/boards/import', { ...exported, _noSuffix: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.myRole, 'owner');
    const cols = (await admin.get(`/boards/${res.body.id}/columns`)).body.columns;
    assert.deepEqual(cols.map((c) => c.cards.length), [1, 1, 1]);
    assert.equal(cols[2].type, 'done');
    assert.equal(cols[2].bg_color, '#E0FFE0');
    const assigned = cols[1].cards[0];
    assert.equal(assigned.assignee_name, (await srv.db()('users').where({ username: 'admin' }).first()).display_name);
    const row = await srv.db()('boards').where({ id: res.body.id }).first();
    assert.equal(row.title, 'Export Project');
  });

  it('adds a custom suffix to imported project titles', async () => {
    const res = await admin.post('/boards/import', { ...exported, _suffix: '(copy)' });
    const row = await srv.db()('boards').where({ id: res.body.id }).first();
    assert.equal(row.title, 'Export Project (copy)');
  });

  it('imports the bundled sample project', async () => {
    const sample = JSON.parse(fs.readFileSync(SAMPLE, 'utf8'));
    const res = await admin.post('/boards/import', { ...sample, _noSuffix: true });
    assert.equal(res.status, 200);
    const cols = (await admin.get(`/boards/${res.body.id}/columns`)).body.columns;
    assert.equal(cols.length, sample.project.columns.length);
    const total = cols.reduce((n, c) => n + c.cards.length, 0);
    assert.equal(total, sample.project.columns.reduce((n, c) => n + c.cards.length, 0));
  });

  it('imports the legacy flat .kprj format', async () => {
    const res = await admin.post('/boards/import', {
      format: 'mykanban-project', title: 'Legacy', columns: [{ title: 'Only', cards: [{ title: 'Old card' }] }], _noSuffix: true,
    });
    assert.equal(res.status, 200);
    const cols = (await admin.get(`/boards/${res.body.id}/columns`)).body.columns;
    assert.equal(cols[0].cards[0].title, 'Old card');
  });

  it('rejects invalid .kprj data (400)', async () => {
    assert.equal((await admin.post('/boards/import', { format: 'other' })).status, 400);
    assert.equal((await admin.post('/boards/import', { format: 'mykanban-project' })).status, 400);
  });

  it('imports a .kprj file from disk (file association / double-click)', async () => {
    const file = path.join(process.env.KANBAN_DATA_PATH, 'disk-import.kprj');
    fs.writeFileSync(file, JSON.stringify(exported), 'utf8');
    const res = await admin.get(`/boards/import-file?path=${encodeURIComponent(file)}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.id);
  });

  it('validates the file path for disk imports', async () => {
    assert.equal((await admin.get('/boards/import-file?path=C:/x/file.txt')).status, 400);
    const missing = path.join(process.env.KANBAN_DATA_PATH, 'missing.kprj');
    assert.equal((await admin.get(`/boards/import-file?path=${encodeURIComponent(missing)}`)).status, 404);
  });

  it('imports and exports without a prior login', async () => {
    const imported = await srv.client().post('/boards/import', exported);
    assert.equal(imported.status, 200);
    assert.equal((await srv.client().get(`/boards/${imported.body.id}/export`)).status, 200);
  });
});

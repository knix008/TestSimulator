const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { describe, it, before } = require('../lib/framework');
const srv = require('../lib/server');

/* Runs last: resetting the DB settings re-opens the database connection. */
describe('Database settings API (/api/settings)', () => {
  let admin;
  let regular;

  before(async () => {
    await srv.startTestServer();
    admin = await srv.adminClient();
    regular = await srv.createUser(admin);
  });

  it('shows the active database type to any logged-in user', async () => {
    const res = await regular.client.get('/settings/db-config');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { type: 'json', label: 'JSON', host: '' });
  });

  it('returns the full DB configuration to administrators only', async () => {
    const res = await admin.get('/settings/db');
    assert.equal(res.status, 200);
    assert.equal(res.body.client, 'json');
    assert.equal((await regular.client.get('/settings/db')).status, 403);
  });

  it('tests a SQLite connection successfully', async () => {
    const filename = path.join(process.env.KANBAN_DATA_PATH, 'probe', 'probe.db');
    const res = await admin.post('/settings/db/test', { dbType: 'sqlite', filename });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.dbCreated, true);
  });

  it('validates required fields for server databases (400)', async () => {
    const res = await admin.post('/settings/db/test', { dbType: 'mysql', host: '', database: '', username: '' });
    assert.equal(res.status, 400);
    assert.equal((await admin.post('/settings/db', { dbType: 'postgresql', host: 'h' })).status, 400);
  });

  it('reports a failed connection to an unreachable server (400)', async () => {
    const res = await admin.post('/settings/db/test', {
      dbType: 'postgresql', host: '127.0.0.1', port: '1', database: 'kanban', username: 'u', password: 'p',
    });
    assert.equal(res.status, 400);
  }, { timeout: 30000 });

  it('rejects unsupported database types (400)', async () => {
    const res = await admin.post('/settings/db/test', { dbType: 'oracle', host: 'h', database: 'd', username: 'u' });
    assert.equal(res.status, 400);
  });

  it('blocks DB changes for non-administrators (403)', async () => {
    assert.equal((await regular.client.post('/settings/db/test', { dbType: 'sqlite' })).status, 403);
    assert.equal((await regular.client.post('/settings/db/reset')).status, 403);
  });

  it('saves project data to a JSON workspace when no database is in use', async () => {
    const board = await srv.createBoard(admin, 'Json Board');
    const save = await admin.post('/settings/workspace/save', {});
    assert.equal(save.status, 200);
    assert.equal(save.body.mode, 'json');
    const file = path.join(process.env.KANBAN_DATA_PATH, 'workspace.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(data.format, 'mykanban-workspace');
    assert.ok(data.boards.some((b) => b.title === 'Json Board' && b.id === board.id));
    assert.ok(Array.isArray(data.users) && data.users.length > 0);
  });

  it('saves theme and language in app-settings.json', async () => {
    const put = await admin.put('/settings/app', { theme: 'dark', lang: 'en' });
    assert.equal(put.status, 200);
    assert.equal(put.body.saved, true);
    const got = await admin.get('/settings/app');
    assert.equal(got.status, 200);
    assert.deepEqual({ theme: got.body.theme, lang: got.body.lang, saved: got.body.saved }, {
      theme: 'dark', lang: 'en', saved: true,
    });
    const file = JSON.parse(fs.readFileSync(path.join(process.env.KANBAN_DATA_PATH, 'app-settings.json'), 'utf8'));
    assert.equal(file.format, 'mykanban-settings');
    assert.equal(file.theme, 'dark');
    assert.equal(file.lang, 'en');
    assert.equal((await admin.put('/settings/app', { theme: 'blue' })).status, 400);
  });

  it('resets to the default SQLite DB and keeps the local user signed in', async () => {
    const board = await srv.createBoard(admin, 'Survives reset');
    const res = await admin.post('/settings/db/reset');
    assert.equal(res.status, 200);
    assert.equal(res.body.requireRelogin, false);
    assert.ok(fs.existsSync(path.join(process.env.KANBAN_DATA_PATH, 'db-config.json')));

    const me = await admin.get('/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.username, 'admin');
    const boards = (await admin.get('/boards')).body;
    assert.ok(boards.some((b) => b.id === board.id), 'existing data must still be available');
  });
});

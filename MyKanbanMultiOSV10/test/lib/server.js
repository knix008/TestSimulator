/* Starts the real Express app on a random port backed by a temporary SQLite DB. */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { ApiClient } = require('./http');

let ctx = null;
let userSeq = 0;

async function startTestServer() {
  if (ctx) return ctx;

  if (!process.env.KANBAN_DATA_PATH) {
    process.env.KANBAN_DATA_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'mykanban-test-'));
  }

  const { app } = require('../../server');
  const { loadDbConfig, getDb } = require('../../src/db/connection');
  const { runMigrations } = require('../../src/db/migrate');

  await loadDbConfig();
  await runMigrations(getDb());

  const server = await new Promise((resolve, reject) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  });

  ctx = {
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    dataPath: process.env.KANBAN_DATA_PATH,
  };
  return ctx;
}

async function stopTestServer() {
  if (!ctx) return;
  const { server } = ctx;
  ctx = null;
  await new Promise((resolve) => server.close(() => resolve()));
  try {
    await require('../../src/db/connection').getDb().destroy();
  } catch {}
}

function db() {
  return require('../../src/db/connection').getDb();
}

function client() {
  if (!ctx) throw new Error('Test server is not running. Call startTestServer() first.');
  return new ApiClient(ctx.baseUrl);
}

async function adminClient() {
  const c = client();
  const res = await c.login('admin', 'admin');
  if (res.status !== 200) throw new Error(`Admin login failed with HTTP ${res.status}`);
  return c;
}

function uniqueName(prefix = 'user') {
  userSeq += 1;
  return `${prefix}_${Date.now().toString(36)}_${userSeq}`;
}

/* Creates an active user through the admin API and returns a logged-in client for it. */
async function createUser(admin, { role = 'user', password = 'pass1234', displayName } = {}) {
  const username = uniqueName(role === 'admin' ? 'admin' : 'user');
  const res = await admin.post('/users', { username, password, role, displayName: displayName || username, email: `${username}@test.local` });
  if (res.status !== 200) throw new Error(`Could not create user: HTTP ${res.status}`);
  const c = client();
  const login = await c.login(username, password);
  if (login.status !== 200) throw new Error(`Could not log in as ${username}: HTTP ${login.status}`);
  return { id: res.body.id, username, password, client: c };
}

async function createBoard(c, title = uniqueName('board')) {
  const res = await c.post('/boards', { title, description: 'Created by tests' });
  if (res.status !== 200) throw new Error(`Could not create board: HTTP ${res.status}`);
  const cols = await c.get(`/boards/${res.body.id}/columns`);
  return { id: res.body.id, title, columns: cols.body.columns };
}

module.exports = {
  startTestServer,
  stopTestServer,
  db,
  client,
  adminClient,
  createUser,
  createBoard,
  uniqueName,
  getContext: () => ctx,
};

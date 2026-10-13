const assert = require('node:assert/strict');
const { describe, it, before } = require('../lib/framework');
const srv = require('../lib/server');

describe('User management API (/api/users)', () => {
  let admin;
  let regular;
  before(async () => {
    await srv.startTestServer();
    admin = await srv.adminClient();
    regular = await srv.createUser(admin);
  });

  it('lists all users for administrators', async () => {
    const res = await admin.get('/users');
    assert.equal(res.status, 200);
    assert.ok(res.body.some((u) => u.username === 'admin'));
    assert.ok(res.body.every((u) => !('password' in u)), 'password hashes must not be exposed');
  });

  it('denies the user list to regular users and allows the local user', async () => {
    assert.equal((await regular.client.get('/users')).status, 403);
    assert.equal((await srv.client().get('/users')).status, 200);
  });

  it('lists active users for any logged-in user', async () => {
    const res = await regular.client.get('/users/active');
    assert.equal(res.status, 200);
    assert.ok(res.body.some((u) => u.username === regular.username));
  });

  it('creates a user', async () => {
    const username = srv.uniqueName('created');
    const res = await admin.post('/users', { username, password: 'pw1234', displayName: 'Created', role: 'user' });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'active');
    assert.equal((await srv.client().login(username, 'pw1234')).status, 200);
  });

  it('rejects duplicate usernames (409) and missing fields (400)', async () => {
    assert.equal((await admin.post('/users', { username: 'admin', password: 'x' })).status, 409);
    assert.equal((await admin.post('/users', { username: 'x' })).status, 400);
  });

  it('updates role, display name and password', async () => {
    const u = await srv.createUser(admin);
    assert.equal((await admin.put(`/users/${u.id}`, { role: 'admin', displayName: 'Promoted', password: 'changed1' })).status, 200);
    const row = await srv.db()('users').where({ id: u.id }).first();
    assert.equal(row.role, 'admin');
    assert.equal(row.display_name, 'Promoted');
    assert.equal((await srv.client().login(u.username, 'changed1')).status, 200);
  });

  it('approves a pending registration', async () => {
    const username = srv.uniqueName('approve');
    await srv.client().post('/auth/register-request', { username, password: 'pw1234' });
    const { id } = await srv.db()('users').where({ username }).first();
    assert.equal((await admin.patch(`/users/${id}/approve`)).status, 200);
    assert.equal((await srv.client().login(username, 'pw1234')).status, 200);
  });

  it('rejects (deletes) a pending registration', async () => {
    const username = srv.uniqueName('reject');
    await srv.client().post('/auth/register-request', { username, password: 'pw1234' });
    const { id } = await srv.db()('users').where({ username }).first();
    assert.equal((await admin.patch(`/users/${id}/reject`)).status, 200);
    assert.equal(await srv.db()('users').where({ id }).first(), undefined);
  });

  it('deletes a user', async () => {
    const u = await srv.createUser(admin);
    assert.equal((await admin.delete(`/users/${u.id}`)).status, 200);
    assert.equal((await srv.client().login(u.username, u.password)).status, 401);
  });

  it('refuses to delete the built-in admin, yourself, or unknown users', async () => {
    const adminRow = await srv.db()('users').where({ username: 'admin' }).first();
    assert.equal((await admin.delete(`/users/${adminRow.id}`)).status, 400);

    const otherAdmin = await srv.createUser(admin, { role: 'admin' });
    assert.equal((await otherAdmin.client.delete(`/users/${otherAdmin.id}`)).status, 400);
    assert.equal((await admin.delete('/users/999999')).status, 404);
  });
});

const assert = require('node:assert/strict');
const { describe, it, before } = require('../lib/framework');
const srv = require('../lib/server');

describe('Auth API (/api/auth)', () => {
  let admin;
  before(async () => {
    await srv.startTestServer();
    admin = await srv.adminClient();
  });

  it('logs in with the default admin account', async () => {
    const c = srv.client();
    const res = await c.login('admin', 'admin');
    assert.equal(res.status, 200);
    assert.equal(res.body.username, 'admin');
    assert.equal(res.body.role, 'admin');
    assert.ok(c.cookie.includes('connect.sid'), 'session cookie should be set');
  });

  it('rejects login without username or password (400)', async () => {
    assert.equal((await srv.client().post('/auth/login', { username: 'admin' })).status, 400);
  });

  it('rejects a wrong password (401)', async () => {
    assert.equal((await srv.client().login('admin', 'wrong')).status, 401);
  });

  it('rejects an unknown user (401)', async () => {
    assert.equal((await srv.client().login('nobody_here', 'x')).status, 401);
  });

  it('returns the current user from /me', async () => {
    const res = await admin.get('/auth/me');
    assert.equal(res.status, 200);
    assert.equal(res.body.username, 'admin');
  });

  it('returns the local user from /me without a prior login', async () => {
    const res = await srv.client().get('/auth/me');
    assert.equal(res.status, 200);
    assert.equal(res.body.username, 'admin');
    assert.equal(res.body.role, 'admin');
  });

  it('keeps the local user available after logout', async () => {
    const c = await srv.adminClient();
    assert.equal((await c.post('/auth/logout')).status, 200);
    const me = await c.get('/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.username, 'admin');
  });

  it('accepts a registration request as a pending account', async () => {
    const username = srv.uniqueName('reg');
    const res = await srv.client().post('/auth/register-request', { username, password: 'pw1234', email: 'r@test.local' });
    assert.equal(res.status, 200);
    const user = await srv.db()('users').where({ username }).first();
    assert.equal(user.status, 'pending');
    assert.equal(user.role, 'user');
  });

  it('blocks login for pending accounts (403)', async () => {
    const username = srv.uniqueName('pending');
    await srv.client().post('/auth/register-request', { username, password: 'pw1234' });
    assert.equal((await srv.client().login(username, 'pw1234')).status, 403);
  });

  it('blocks login for inactive accounts (403)', async () => {
    const user = await srv.createUser(admin);
    await admin.put(`/users/${user.id}`, { status: 'inactive' });
    assert.equal((await srv.client().login(user.username, user.password)).status, 403);
  });

  it('rejects duplicate or incomplete registration requests', async () => {
    assert.equal((await srv.client().post('/auth/register-request', { username: 'admin', password: 'x' })).status, 409);
    assert.equal((await srv.client().post('/auth/register-request', { username: 'only_name' })).status, 400);
  });

  it('changes the own password', async () => {
    const user = await srv.createUser(admin);
    const res = await user.client.post('/auth/change-password', { currentPassword: user.password, newPassword: 'newpass99' });
    assert.equal(res.status, 200);
    assert.equal((await srv.client().login(user.username, 'newpass99')).status, 200);
    assert.equal((await srv.client().login(user.username, user.password)).status, 401);
  });

  it('validates password changes (wrong current, too short, missing)', async () => {
    const user = await srv.createUser(admin);
    assert.equal((await user.client.post('/auth/change-password', { currentPassword: 'bad', newPassword: 'newpass99' })).status, 400);
    assert.equal((await user.client.post('/auth/change-password', { currentPassword: user.password, newPassword: 'abc' })).status, 400);
    assert.equal((await user.client.post('/auth/change-password', {})).status, 400);
    assert.equal((await srv.client().post('/auth/change-password', { currentPassword: 'a', newPassword: 'bbbb' })).status, 400);
  });

  it('updates the own profile', async () => {
    const user = await srv.createUser(admin);
    const res = await user.client.put('/auth/profile', { email: 'new@test.local', displayName: 'New Name' });
    assert.equal(res.status, 200);
    const me = await user.client.get('/auth/me');
    assert.equal(me.body.displayName, 'New Name');
    assert.equal(me.body.email, 'new@test.local');

    const local = srv.client();
    const before = await local.get('/auth/me');
    const localUpdate = await local.put('/auth/profile', {
      email: before.body.email,
      displayName: before.body.displayName,
    });
    assert.equal(localUpdate.status, 200);
  });
});

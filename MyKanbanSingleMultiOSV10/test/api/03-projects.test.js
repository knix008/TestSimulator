const assert = require('node:assert/strict');
const { describe, it, before } = require('../lib/framework');
const srv = require('../lib/server');

describe('Projects, members and permissions (/api/boards)', () => {
  let admin;
  let owner;
  let editor;
  let viewer;
  let manager;
  let outsider;
  let board;

  before(async () => {
    await srv.startTestServer();
    admin = await srv.adminClient();
    owner = await srv.createUser(admin, { displayName: 'Owner' });
    editor = await srv.createUser(admin, { displayName: 'Editor' });
    viewer = await srv.createUser(admin, { displayName: 'Viewer' });
    manager = await srv.createUser(admin, { displayName: 'Manager' });
    outsider = await srv.createUser(admin);
    board = await srv.createBoard(owner.client, 'Permission Project');
  });

  it('creates a project with three default columns', async () => {
    assert.ok(board.id);
    assert.equal(board.columns.length, 3);
    assert.deepEqual(board.columns.map((c) => c.position), [0, 1, 2]);
    assert.deepEqual(board.columns.map((c) => c.bg_color), ['#3B82F6', '#F59E0B', '#22C55E']);
  });

  it('requires a project title (400) and creates a project without login', async () => {
    assert.equal((await owner.client.post('/boards', { description: 'x' })).status, 400);
    const res = await srv.client().post('/boards', { title: 'Local project' });
    assert.equal(res.status, 200);
    assert.equal(res.body.owner_id, (await srv.client().get('/auth/me')).body.id);
  });

  it('lists owned projects with the owner role', async () => {
    const res = await owner.client.get('/boards');
    const found = res.body.find((b) => b.id === board.id);
    assert.equal(found.myRole, 'owner');
  });

  it('lets system administrators see every project', async () => {
    const res = await admin.get('/boards');
    assert.equal(res.body.find((b) => b.id === board.id).myRole, 'system-admin');
  });

  it('hides projects from non-members (list + 403 on access)', async () => {
    const res = await outsider.client.get('/boards');
    assert.ok(!res.body.some((b) => b.id === board.id));
    assert.equal((await outsider.client.get(`/boards/${board.id}/columns`)).status, 403);
  });

  it('adds members with editor, viewer and admin roles', async () => {
    for (const [user, role] of [[editor, 'editor'], [viewer, 'viewer'], [manager, 'admin']]) {
      const res = await owner.client.post(`/boards/${board.id}/members`, { userId: user.id, role });
      assert.equal(res.status, 200);
      assert.equal(res.body.role, role);
    }
    const members = await owner.client.get(`/boards/${board.id}/members`);
    assert.equal(members.body.owner.id, owner.id);
    assert.equal(members.body.members.length, 3);
  });

  it('shows shared projects to members with their role', async () => {
    const res = await viewer.client.get('/boards');
    assert.equal(res.body.find((b) => b.id === board.id).myRole, 'viewer');
  });

  it('includes owner and members as card assignees (no duplicates)', async () => {
    const res = await viewer.client.get(`/boards/${board.id}/assignees`);
    const ids = res.body.map((u) => u.id);
    assert.deepEqual([...new Set(ids)].length, ids.length);
    for (const u of [owner, editor, viewer, manager]) assert.ok(ids.includes(u.id), `${u.username} missing`);
    assert.ok(!ids.includes(outsider.id));
  });

  it('reports permissions per role on the board view', async () => {
    const perms = async (u) => (await u.client.get(`/boards/${board.id}/columns`)).body.permissions;
    assert.deepEqual(await perms(viewer), { myRole: 'viewer', canEdit: false, canManageMembers: false, canDeleteProject: false });
    assert.deepEqual(await perms(editor), { myRole: 'editor', canEdit: true, canManageMembers: false, canDeleteProject: false });
    assert.deepEqual(await perms(manager), { myRole: 'admin', canEdit: true, canManageMembers: true, canDeleteProject: false });
    assert.deepEqual(await perms(owner), { myRole: 'owner', canEdit: true, canManageMembers: true, canDeleteProject: true });
  });

  it('blocks viewers from editing (403)', async () => {
    const col = board.columns[0];
    assert.equal((await viewer.client.post(`/boards/${board.id}/cards`, { columnId: col.id, title: 'x' })).status, 403);
    assert.equal((await viewer.client.put(`/boards/${board.id}`, { title: 'hack' })).status, 403);
    assert.equal((await viewer.client.post(`/boards/${board.id}/columns`, { title: 'x' })).status, 403);
  });

  it('blocks editors from managing members (403)', async () => {
    assert.equal((await editor.client.post(`/boards/${board.id}/members`, { userId: outsider.id, role: 'viewer' })).status, 403);
  });

  it('lets project admins change member roles', async () => {
    assert.equal((await manager.client.put(`/boards/${board.id}/members/${viewer.id}`, { role: 'editor' })).status, 200);
    let perms = (await viewer.client.get(`/boards/${board.id}/columns`)).body.permissions;
    assert.equal(perms.canEdit, true);
    await manager.client.put(`/boards/${board.id}/members/${viewer.id}`, { role: 'viewer' });
    perms = (await viewer.client.get(`/boards/${board.id}/columns`)).body.permissions;
    assert.equal(perms.canEdit, false);
  });

  it('protects the owner from being added, changed or removed', async () => {
    assert.equal((await owner.client.post(`/boards/${board.id}/members`, { userId: owner.id, role: 'viewer' })).status, 400);
    assert.equal((await manager.client.put(`/boards/${board.id}/members/${owner.id}`, { role: 'viewer' })).status, 400);
    assert.equal((await manager.client.delete(`/boards/${board.id}/members/${owner.id}`)).status, 400);
    assert.equal((await owner.client.post(`/boards/${board.id}/members`, { userId: outsider.id })).status, 400);
  });

  it('removes a member', async () => {
    const temp = await srv.createUser(admin);
    await owner.client.post(`/boards/${board.id}/members`, { userId: temp.id, role: 'viewer' });
    assert.equal((await temp.client.get(`/boards/${board.id}/columns`)).status, 200);
    assert.equal((await owner.client.delete(`/boards/${board.id}/members/${temp.id}`)).status, 200);
    assert.equal((await temp.client.get(`/boards/${board.id}/columns`)).status, 403);
  });

  it('updates project title, description and background color', async () => {
    const res = await editor.client.put(`/boards/${board.id}`, { title: 'Renamed', description: 'New desc', bg_color: '#123456' });
    assert.equal(res.status, 200);
    const row = await srv.db()('boards').where({ id: board.id }).first();
    assert.equal(row.title, 'Renamed');
    assert.equal(row.bg_color, '#123456');
  });

  it('allows only the owner or a system admin to delete a project', async () => {
    const temp = await srv.createBoard(owner.client);
    await owner.client.post(`/boards/${temp.id}/members`, { userId: manager.id, role: 'admin' });
    assert.equal((await manager.client.delete(`/boards/${temp.id}`)).status, 403);
    assert.equal((await owner.client.delete(`/boards/${temp.id}`)).status, 200);
    assert.equal(await srv.db()('boards').where({ id: temp.id }).first(), undefined);

    const temp2 = await srv.createBoard(owner.client);
    assert.equal((await admin.delete(`/boards/${temp2.id}`)).status, 200);
  });
});

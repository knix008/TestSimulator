const assert = require('node:assert/strict');
const { describe, it, before } = require('../lib/framework');
const srv = require('../lib/server');

describe('Card comments API', () => {
  let admin;
  let alice;
  let bob;
  let board;
  let cardId;
  const base = () => `/boards/${board.id}`;
  const list = async (c = alice.client) => (await c.get(`${base()}/cards/${cardId}/comments`)).body;

  before(async () => {
    await srv.startTestServer();
    admin = await srv.adminClient();
    alice = await srv.createUser(admin, { displayName: 'Alice' });
    bob = await srv.createUser(admin, { displayName: 'Bob' });
    board = await srv.createBoard(alice.client, 'Comments Project');
    await alice.client.post(`${base()}/members`, { userId: bob.id, role: 'viewer' });
    cardId = (await alice.client.post(`${base()}/cards`, { columnId: board.columns[0].id, title: 'Discuss' })).body.id;
  });

  it('adds a comment with author information', async () => {
    const res = await alice.client.post(`${base()}/cards/${cardId}/comments`, { content: '  First!  ' });
    assert.equal(res.status, 200);
    assert.equal(res.body.content, 'First!');
    assert.equal(res.body.author_name, 'Alice');
    assert.deepEqual(res.body.attachments, []);
  });

  it('rejects empty comments (400)', async () => {
    assert.equal((await alice.client.post(`${base()}/cards/${cardId}/comments`, { content: '   ' })).status, 400);
  });

  it('lets viewers comment and reply', async () => {
    const parent = (await list())[0];
    const res = await bob.client.post(`${base()}/cards/${cardId}/comments`, { content: 'Reply', parentId: parent.id });
    assert.equal(res.status, 200);
    assert.equal(res.body.parent_id, parent.id);
  });

  it('rejects replies to unknown parent comments (400)', async () => {
    assert.equal((await alice.client.post(`${base()}/cards/${cardId}/comments`, { content: 'x', parentId: 999999 })).status, 400);
  });

  it('lists comments in creation order', async () => {
    const comments = await list();
    assert.deepEqual(comments.map((c) => c.content), ['First!', 'Reply']);
  });

  it('lets authors edit their own comments', async () => {
    const own = (await list()).find((c) => c.content === 'Reply');
    assert.equal((await bob.client.put(`${base()}/comments/${own.id}`, { content: 'Reply (edited)' })).status, 200);
    assert.ok((await list()).some((c) => c.content === 'Reply (edited)'));
  });

  it("prevents editing or deleting someone else's comment (403)", async () => {
    const aliceComment = (await list()).find((c) => c.content === 'First!');
    assert.equal((await bob.client.put(`${base()}/comments/${aliceComment.id}`, { content: 'hacked' })).status, 403);
    assert.equal((await bob.client.delete(`${base()}/comments/${aliceComment.id}`)).status, 403);
  });

  it('lets system administrators edit any comment', async () => {
    const c = (await list()).find((x) => x.content === 'First!');
    assert.equal((await admin.put(`${base()}/comments/${c.id}`, { content: 'First! (moderated)' })).status, 200);
  });

  it('soft-deletes a comment that still has replies', async () => {
    const parent = (await list()).find((c) => c.parent_id == null);
    assert.equal((await alice.client.delete(`${base()}/comments/${parent.id}`)).status, 200);
    const after = (await list()).find((c) => c.id === parent.id);
    assert.ok(after, 'parent row must remain for its replies');
    assert.ok(after.deleted === 1 || after.deleted === true);
    assert.equal(after.content, '');
  });

  it('removes the soft-deleted parent once its last reply is deleted', async () => {
    const reply = (await list()).find((c) => c.parent_id != null);
    assert.equal((await bob.client.delete(`${base()}/comments/${reply.id}`)).status, 200);
    assert.deepEqual(await list(), []);
  });

  it('returns 404 for unknown comments', async () => {
    assert.equal((await alice.client.put(`${base()}/comments/999999`, { content: 'x' })).status, 404);
    assert.equal((await alice.client.delete(`${base()}/comments/999999`)).status, 404);
  });
});

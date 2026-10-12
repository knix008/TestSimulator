const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { describe, it, before } = require('../lib/framework');
const srv = require('../lib/server');

describe('File attachments (cards and comments)', () => {
  let admin;
  let board;
  let cardId;
  const uploads = () => path.join(process.env.KANBAN_DATA_PATH, 'uploads');

  before(async () => {
    await srv.startTestServer();
    admin = await srv.adminClient();
    board = await srv.createBoard(admin, 'Attachments Project');
    cardId = (await admin.post(`/boards/${board.id}/cards`, { columnId: board.columns[0].id, title: 'With files' })).body.id;
  });

  it('uploads a file to a card', async () => {
    const res = await admin.upload(`/boards/${board.id}/cards/${cardId}/attachments`, { filename: 'notes.txt', content: 'hello kanban' });
    assert.equal(res.status, 200);
    assert.equal(res.body.original_name, 'notes.txt');
    assert.equal(res.body.size, 12);
    assert.ok(fs.existsSync(path.join(uploads(), res.body.filename)));
  });

  it('lists attachments on the card and counts them on the board', async () => {
    const card = (await admin.get(`/boards/${board.id}/cards/${cardId}`)).body;
    assert.equal(card.attachments.length, 1);
    const cols = (await admin.get(`/boards/${board.id}/columns`)).body.columns;
    assert.equal(cols[0].cards.find((c) => c.id === cardId).attachment_count, 1);
  });

  it('serves uploaded files from /uploads', async () => {
    const card = (await admin.get(`/boards/${board.id}/cards/${cardId}`)).body;
    const res = await admin.raw('GET', `/uploads/${card.attachments[0].filename}`);
    assert.equal(res.status, 200);
    assert.equal(res.buffer.toString('utf8'), 'hello kanban');
  });

  it('rejects uploads without a file (400)', async () => {
    const res = await admin.raw('POST', `/api/boards/${board.id}/cards/${cardId}/attachments`, { form: new FormData() });
    assert.equal(res.status, 400);
  });

  it('blocks viewers from uploading to cards (403)', async () => {
    const viewer = await srv.createUser(admin);
    await admin.post(`/boards/${board.id}/members`, { userId: viewer.id, role: 'viewer' });
    const res = await viewer.client.upload(`/boards/${board.id}/cards/${cardId}/attachments`);
    assert.equal(res.status, 403);
  });

  it('deletes a card attachment and its file', async () => {
    const card = (await admin.get(`/boards/${board.id}/cards/${cardId}`)).body;
    const att = card.attachments[0];
    assert.equal((await admin.delete(`/boards/${board.id}/cards/${cardId}/attachments/${att.id}`)).status, 200);
    assert.ok(!fs.existsSync(path.join(uploads(), att.filename)));
    assert.equal((await admin.get(`/boards/${board.id}/cards/${cardId}`)).body.attachments.length, 0);
  });

  it('uploads and deletes comment attachments', async () => {
    const comment = (await admin.post(`/boards/${board.id}/cards/${cardId}/comments`, { content: 'See file' })).body;
    const up = await admin.upload(`/boards/${board.id}/comments/${comment.id}/attachments`, { filename: 'shot.png', content: 'PNGDATA', type: 'image/png' });
    assert.equal(up.status, 200);
    assert.equal(up.body.mimetype, 'image/png');

    const listed = (await admin.get(`/boards/${board.id}/cards/${cardId}/comments`)).body;
    assert.equal(listed[0].attachments.length, 1);

    assert.equal((await admin.delete(`/boards/${board.id}/comments/${comment.id}/attachments/${up.body.id}`)).status, 200);
    assert.ok(!fs.existsSync(path.join(uploads(), up.body.filename)));
  });

  it('returns 404 when attaching to an unknown comment', async () => {
    const res = await admin.upload(`/boards/${board.id}/comments/999999/attachments`);
    assert.equal(res.status, 404);
  });
});

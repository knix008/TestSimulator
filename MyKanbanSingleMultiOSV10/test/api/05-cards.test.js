const assert = require('node:assert/strict');
const { describe, it, before } = require('../lib/framework');
const srv = require('../lib/server');

describe('Cards API', () => {
  let admin;
  let board;
  let todo;
  let doing;

  const cardsOf = async (colId) => {
    const cols = (await admin.get(`/boards/${board.id}/columns`)).body.columns;
    return cols.find((c) => c.id === colId).cards;
  };

  before(async () => {
    await srv.startTestServer();
    admin = await srv.adminClient();
    board = await srv.createBoard(admin, 'Cards Project');
    [todo, doing] = board.columns;
  });

  it('creates a card with all fields', async () => {
    const adminRow = await srv.db()('users').where({ username: 'admin' }).first();
    const res = await admin.post(`/boards/${board.id}/cards`, {
      columnId: todo.id, title: 'Write tests', description: 'All features', assigneeId: adminRow.id,
      dueDate: '2030-12-31', bgColor: '#FFF0F0', stripeColor: 'red',
    });
    assert.equal(res.status, 200);
    const card = (await admin.get(`/boards/${board.id}/cards/${res.body.id}`)).body;
    assert.equal(card.title, 'Write tests');
    assert.equal(card.assignee_id, adminRow.id);
    assert.equal(card.assignee_name, adminRow.display_name);
    assert.equal(String(card.due_date).slice(0, 10), '2030-12-31');
    assert.equal(card.stripe_color, 'red');
    assert.equal(card.bg_color, '#FFF0F0');
    assert.deepEqual(card.attachments, []);
    assert.equal(card.canEdit, true);
  });

  it('requires a title and a column (400)', async () => {
    assert.equal((await admin.post(`/boards/${board.id}/cards`, { columnId: todo.id })).status, 400);
    assert.equal((await admin.post(`/boards/${board.id}/cards`, { title: 'x' })).status, 400);
  });

  it('appends new cards to the end of a column', async () => {
    await admin.post(`/boards/${board.id}/cards`, { columnId: todo.id, title: 'Second' });
    await admin.post(`/boards/${board.id}/cards`, { columnId: todo.id, title: 'Third' });
    const titles = (await cardsOf(todo.id)).map((c) => c.title);
    assert.deepEqual(titles.slice(-2), ['Second', 'Third']);
  });

  it('updates a card and clears optional fields', async () => {
    const { body } = await admin.post(`/boards/${board.id}/cards`, { columnId: todo.id, title: 'Editable', dueDate: '2030-01-01' });
    const res = await admin.put(`/boards/${board.id}/cards/${body.id}`, { title: 'Edited', description: 'D', dueDate: '', assigneeId: '' });
    assert.equal(res.status, 200);
    const card = (await admin.get(`/boards/${board.id}/cards/${body.id}`)).body;
    assert.equal(card.title, 'Edited');
    assert.equal(card.description, 'D');
    assert.equal(card.due_date, null);
  });

  it('stores updated_at as a proper timestamp (MySQL datetime regression)', async () => {
    const { body } = await admin.post(`/boards/${board.id}/cards`, { columnId: todo.id, title: 'Timestamp' });
    await admin.put(`/boards/${board.id}/cards/${body.id}`, { title: 'Timestamp 2' });
    const row = await srv.db()('cards').where({ id: body.id }).first();
    const ts = new Date(typeof row.updated_at === 'number' ? row.updated_at : row.updated_at).getTime();
    assert.ok(!Number.isNaN(ts));
    assert.ok(Math.abs(ts - Date.now()) < 60_000, 'updated_at should be close to now');
  });

  it('keeps the legacy "color" field in sync with the stripe color', async () => {
    const { body } = await admin.post(`/boards/${board.id}/cards`, { columnId: todo.id, title: 'Colors', color: 'blue' });
    let row = await srv.db()('cards').where({ id: body.id }).first();
    assert.equal(row.stripe_color, 'blue');
    await admin.put(`/boards/${board.id}/cards/${body.id}`, { stripeColor: 'green' });
    row = await srv.db()('cards').where({ id: body.id }).first();
    assert.equal(row.color, 'green');
  });

  it('moves a card to another column at a given position', async () => {
    await admin.post(`/boards/${board.id}/cards`, { columnId: doing.id, title: 'D1' });
    await admin.post(`/boards/${board.id}/cards`, { columnId: doing.id, title: 'D2' });
    const { body } = await admin.post(`/boards/${board.id}/cards`, { columnId: todo.id, title: 'Mover' });

    assert.equal((await admin.post(`/boards/${board.id}/cards/${body.id}/move`, { targetColumnId: doing.id, position: 1 })).status, 200);
    const doingCards = await cardsOf(doing.id);
    assert.deepEqual(doingCards.map((c) => c.title), ['D1', 'Mover', 'D2']);
    assert.deepEqual(doingCards.map((c) => c.position), [0, 1, 2]);
    const todoCards = await cardsOf(todo.id);
    assert.ok(!todoCards.some((c) => c.id === body.id));
    assert.deepEqual(todoCards.map((c) => c.position), todoCards.map((_, i) => i), 'source column is re-indexed');
  });

  it('reorders a card within the same column', async () => {
    const before = await cardsOf(doing.id);
    const last = before.at(-1);
    await admin.post(`/boards/${board.id}/cards/${last.id}/move`, { targetColumnId: doing.id, position: 0 });
    const after = await cardsOf(doing.id);
    assert.equal(after[0].id, last.id);
  });

  it('clamps out-of-range move positions', async () => {
    const card = (await cardsOf(doing.id))[0];
    await admin.post(`/boards/${board.id}/cards/${card.id}/move`, { targetColumnId: doing.id, position: 999 });
    assert.equal((await cardsOf(doing.id)).at(-1).id, card.id);
  });

  it('deletes a card', async () => {
    const { body } = await admin.post(`/boards/${board.id}/cards`, { columnId: todo.id, title: 'Delete me' });
    assert.equal((await admin.delete(`/boards/${board.id}/cards/${body.id}`)).status, 200);
    assert.equal((await admin.get(`/boards/${board.id}/cards/${body.id}`)).status, 404);
  });

  it('returns 404 for unknown cards', async () => {
    assert.equal((await admin.get(`/boards/${board.id}/cards/999999`)).status, 404);
  });
});

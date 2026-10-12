const assert = require('node:assert/strict');
const { describe, it, before } = require('../lib/framework');
const srv = require('../lib/server');

async function columns(c, boardId) {
  return (await c.get(`/boards/${boardId}/columns`)).body.columns;
}

describe('Columns API', () => {
  let admin;
  let board;
  before(async () => {
    await srv.startTestServer();
    admin = await srv.adminClient();
    board = await srv.createBoard(admin, 'Columns Project');
  });

  it('adds a normal column at the end', async () => {
    const res = await admin.post(`/boards/${board.id}/columns`, { title: 'Review' });
    assert.equal(res.status, 200);
    assert.equal(res.body.type, 'normal');
    assert.equal(res.body.position, 3);
    assert.equal((await columns(admin, board.id)).at(-1).title, 'Review');
  });

  it('requires a column title (400)', async () => {
    assert.equal((await admin.post(`/boards/${board.id}/columns`, {})).status, 400);
  });

  it('renames a column and sets its background color', async () => {
    const col = (await columns(admin, board.id))[0];
    assert.equal((await admin.put(`/boards/${board.id}/columns/${col.id}`, { title: 'Backlog', bg_color: '#ABCDEF' })).status, 200);
    const updated = (await columns(admin, board.id)).find((c) => c.id === col.id);
    assert.equal(updated.title, 'Backlog');
    assert.equal(updated.bg_color, '#ABCDEF');
  });

  it('reorders columns', async () => {
    const before = await columns(admin, board.id);
    const first = before[0];
    assert.equal((await admin.post(`/boards/${board.id}/columns/${first.id}/move`, { position: 2 })).status, 200);
    const after = await columns(admin, board.id);
    assert.equal(after[2].id, first.id);
    assert.deepEqual(after.map((c) => c.position), [0, 1, 2, 3]);
  });

  it('only allows the rightmost column to become the "done" column', async () => {
    const cols = await columns(admin, board.id);
    const notLast = cols[0];
    const last = cols.at(-1);
    assert.equal((await admin.put(`/boards/${board.id}/columns/${notLast.id}`, { type: 'done' })).status, 400);
    assert.equal((await admin.put(`/boards/${board.id}/columns/${last.id}`, { type: 'done' })).status, 200);
    assert.equal((await columns(admin, board.id)).at(-1).type, 'done');
  });

  it('allows only one "done" column per project', async () => {
    assert.equal((await admin.post(`/boards/${board.id}/columns`, { title: 'Done 2', type: 'done' })).status, 400);
  });

  it('keeps the "done" column last and immovable', async () => {
    await admin.post(`/boards/${board.id}/columns`, { title: 'Added after done' });
    const cols = await columns(admin, board.id);
    assert.equal(cols.at(-1).type, 'done', 'done column must stay at the right edge');
    assert.equal((await admin.post(`/boards/${board.id}/columns/${cols.at(-1).id}/move`, { position: 0 })).status, 400);
  });

  it('returns 404 when moving an unknown column', async () => {
    assert.equal((await admin.post(`/boards/${board.id}/columns/999999/move`, { position: 0 })).status, 404);
  });

  it('deletes a column', async () => {
    const res = await admin.post(`/boards/${board.id}/columns`, { title: 'Temp' });
    assert.equal((await admin.delete(`/boards/${board.id}/columns/${res.body.id}`)).status, 200);
    assert.ok(!(await columns(admin, board.id)).some((c) => c.id === res.body.id));
  });
});

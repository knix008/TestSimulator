const assert = require('node:assert/strict');
const { describe, it, before } = require('../lib/framework');
const srv = require('../lib/server');

function dateKey(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('Project summary, burndown chart and reports', () => {
  let admin;
  let board;

  before(async () => {
    await srv.startTestServer();
    admin = await srv.adminClient();
    board = await srv.createBoard(admin, 'Summary Project');
    const [todo, doing, done] = board.columns;
    await admin.put(`/boards/${board.id}/columns/${done.id}`, { type: 'done' });
    await admin.post(`/boards/${board.id}/cards`, { columnId: todo.id, title: 'Overdue', dueDate: dateKey(-5) });
    await admin.post(`/boards/${board.id}/cards`, { columnId: todo.id, title: 'Future', dueDate: dateKey(10) });
    await admin.post(`/boards/${board.id}/cards`, { columnId: doing.id, title: 'In progress' });
    await admin.post(`/boards/${board.id}/cards`, { columnId: done.id, title: 'Finished', dueDate: dateKey(-5) });
  });

  it('summarizes total, completed and overdue cards', async () => {
    const res = await admin.get(`/boards/${board.id}/summary`);
    assert.equal(res.status, 200);
    assert.equal(res.body.boardTitle, 'Summary Project');
    assert.equal(res.body.totalCards, 4);
    assert.equal(res.body.completedCards, 1);
    assert.equal(res.body.overdueCards, 1, 'cards in the done column are never overdue');
  });

  it('reports the card count per column', async () => {
    const { body } = await admin.get(`/boards/${board.id}/summary`);
    assert.deepEqual(body.columns.map((c) => c.count), [2, 1, 1]);
    assert.equal(body.columns.at(-1).type, 'done');
  });

  it('starts the burndown at the project start date by default', async () => {
    const { body } = await admin.get(`/boards/${board.id}/summary`);
    // SQLite CURRENT_TIMESTAMP is UTC without a zone marker, so the start may read as yesterday.
    assert.ok([dateKey(-1), dateKey(0)].includes(body.projectStartDate), `unexpected start ${body.projectStartDate}`);
    assert.equal(body.burndownStartDate, body.projectStartDate);
    assert.equal(body.burndownEndDate, dateKey(0));
    assert.equal(body.burndown.length, 2, 'a single day still produces 2 points so a line can be drawn');
  });

  it('builds one burndown point per day for a custom date range', async () => {
    const { body } = await admin.get(`/boards/${board.id}/summary?startDate=${dateKey(-6)}&endDate=${dateKey(0)}`);
    assert.equal(body.burndownStartDate, dateKey(-6));
    assert.equal(body.burndown.length, 7);
    assert.deepEqual(body.burndown.map((p) => p.date), [-6, -5, -4, -3, -2, -1, 0].map(dateKey));
  });

  it('computes remaining work, scope and per-column counts for today', async () => {
    const { body } = await admin.get(`/boards/${board.id}/summary?startDate=${dateKey(-2)}`);
    const today = body.burndown.at(-1);
    assert.equal(today.scope, 4);
    assert.equal(today.remaining, 3);
    assert.deepEqual(today.columnCounts, [2, 1, 1]);
    assert.equal(body.burndown[0].scope, 0, 'cards did not exist two days ago');
  });

  it('draws an ideal line from peak remaining work down to zero', async () => {
    const { body } = await admin.get(`/boards/${board.id}/summary?startDate=${dateKey(-4)}`);
    const ideal = body.burndown.map((p) => p.ideal);
    const peak = Math.max(...body.burndown.map((p) => p.remaining));
    assert.equal(ideal[0], peak);
    assert.equal(ideal.at(-1), 0);
    for (let i = 1; i < ideal.length; i++) assert.ok(ideal[i] <= ideal[i - 1], 'ideal line must never rise');
  });

  it('clamps future end dates to today and ignores invalid dates', async () => {
    let { body } = await admin.get(`/boards/${board.id}/summary?endDate=${dateKey(30)}`);
    assert.equal(body.burndownEndDate, dateKey(0));
    ({ body } = await admin.get(`/boards/${board.id}/summary?startDate=2026-02-31&endDate=nope`));
    assert.equal(body.burndownStartDate, body.projectStartDate);
    assert.equal(body.burndownEndDate, dateKey(0));
  });

  it('clamps a start date that is after the end date', async () => {
    const { body } = await admin.get(`/boards/${board.id}/summary?startDate=${dateKey(0)}&endDate=${dateKey(-3)}`);
    assert.equal(body.burndownStartDate, body.burndownEndDate);
  });

  it('handles projects without columns', async () => {
    const empty = await srv.createBoard(admin, 'Empty');
    for (const col of empty.columns) await admin.delete(`/boards/${empty.id}/columns/${col.id}`);
    const { body } = await admin.get(`/boards/${empty.id}/summary`);
    assert.equal(body.totalCards, 0);
    assert.deepEqual(body.columns, []);
    assert.ok(body.burndown.length >= 2);
  });

  for (const [format, check] of [
    ['md', (buf) => assert.match(buf.toString('utf8'), /# Summary Project/)],
    ['docx', (buf) => assert.equal(buf.subarray(0, 2).toString('latin1'), 'PK')],
    ['pdf', (buf) => assert.equal(buf.subarray(0, 4).toString('latin1'), '%PDF')],
  ]) {
    it(`exports the summary report as ${format.toUpperCase()}`, async () => {
      const res = await admin.post(`/boards/${board.id}/report`, { format, lang: 'en', images: {} });
      assert.equal(res.status, 200);
      assert.match(res.body.filename, new RegExp(`Summary Project-report-\\d{4}-\\d{2}-\\d{2}\\.${format}$`));
      check(Buffer.from(res.body.data, 'base64'));
    }, { timeout: 30000 });
  }

  it('rejects unsupported report formats (400)', async () => {
    assert.equal((await admin.post(`/boards/${board.id}/report`, { format: 'xlsx' })).status, 400);
  });
});

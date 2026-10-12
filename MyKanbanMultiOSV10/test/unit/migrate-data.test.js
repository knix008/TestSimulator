const assert = require('node:assert/strict');
const { describe, it, before, after } = require('../lib/framework');
const { createMemoryDb, createMigratedDb } = require('../lib/memory-db');
const { exportDatabaseSnapshot, importDatabaseSnapshot, isTargetEmpty } = require('../../src/db/migrate-data');

async function seedSource(db) {
  const [userId] = await db('users').insert({ username: 'alice', password: 'x', display_name: 'Alice', role: 'user', status: 'active' });
  const [boardId] = await db('boards').insert({ title: 'Project A', owner_id: userId });
  await db('board_members').insert({ board_id: boardId, user_id: 1, role: 'viewer' });
  const [colId] = await db('columns').insert({ board_id: boardId, title: 'Todo', position: 0 });
  const [cardId] = await db('cards').insert({
    column_id: colId,
    title: 'Card 1',
    assignee_id: userId,
    position: 0,
    created_at: '1783562279745',
    updated_at: '1783562279745',
  });
  await db('attachments').insert({ card_id: cardId, filename: 'f.txt', original_name: 'f.txt', size: 1 });
  return { userId, boardId, colId, cardId };
}

describe('DB data migration (switching databases)', () => {
  let source;
  before(async () => {
    source = await createMigratedDb();
    await seedSource(source);
  });
  after(async () => { await source.destroy(); });

  it('reports no data for a database without tables', async () => {
    const empty = createMemoryDb();
    try {
      assert.deepEqual(await exportDatabaseSnapshot(empty), { hasData: false });
      assert.equal(await isTargetEmpty(empty), true);
    } finally {
      await empty.destroy();
    }
  });

  it('exports every table into a snapshot', async () => {
    const snap = await exportDatabaseSnapshot(source);
    assert.equal(snap.hasData, true);
    assert.equal(snap.users.length, 2);
    assert.equal(snap.boards.length, 1);
    assert.equal(snap.boardMembers.length, 1);
    assert.equal(snap.columns.length, 1);
    assert.equal(snap.cards.length, 1);
    assert.equal(snap.attachments.length, 1);
  });

  it('treats a freshly migrated database (admin only) as empty', async () => {
    const target = await createMigratedDb();
    try {
      assert.equal(await isTargetEmpty(target), true);
    } finally {
      await target.destroy();
    }
  });

  it('imports a snapshot and remaps all foreign keys', async () => {
    const target = await createMigratedDb();
    try {
      const snap = await exportDatabaseSnapshot(source);
      const result = await importDatabaseSnapshot(target, snap);
      assert.deepEqual(result, { imported: true, users: 2, boards: 1 });

      const alice = await target('users').where({ username: 'alice' }).first();
      const board = await target('boards').first();
      const column = await target('columns').first();
      const card = await target('cards').first();
      const attachment = await target('attachments').first();
      assert.equal(board.owner_id, alice.id);
      assert.equal(column.board_id, board.id);
      assert.equal(card.column_id, column.id);
      assert.equal(card.assignee_id, alice.id);
      assert.equal(attachment.card_id, card.id);
      assert.equal(await target('board_members').count('* as n').first().then((r) => Number(r.n)), 1);
    } finally {
      await target.destroy();
    }
  });

  it('refuses to import into a database that already has data', async () => {
    const target = await createMigratedDb();
    try {
      await target('boards').insert({ title: 'Existing' });
      const result = await importDatabaseSnapshot(target, await exportDatabaseSnapshot(source));
      assert.deepEqual(result, { imported: false, reason: 'target-not-empty' });
    } finally {
      await target.destroy();
    }
  });

  it('skips the import when the snapshot has no data', async () => {
    const target = await createMigratedDb();
    try {
      const result = await importDatabaseSnapshot(target, { hasData: false });
      assert.deepEqual(result, { imported: false, reason: 'no-source-data' });
    } finally {
      await target.destroy();
    }
  });
});

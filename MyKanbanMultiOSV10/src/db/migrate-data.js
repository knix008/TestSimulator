const DELETE_ORDER = ['attachments', 'cards', 'columns', 'board_members', 'boards', 'users'];

async function tableExists(trx, table) {
  return trx.schema.hasTable(table);
}

async function tableCount(trx, table) {
  const row = await trx(table).count('* as cnt').first();
  return Number(row?.cnt ?? row?.['count(*)'] ?? 0);
}

async function insertGetId(trx, table, row) {
  const clean = { ...row };
  delete clean.id;
  const client = trx.client.config.client;

  if (client === 'pg' || client === 'mssql') {
    const rows = await trx(table).insert(clean).returning('id');
    return rows[0].id;
  }

  const ids = await trx(table).insert(clean);
  return Array.isArray(ids) ? ids[0] : ids;
}

async function clearAllTables(trx) {
  const client = trx.client.config.client;
  if (client === 'sqlite3') {
    await trx.raw('PRAGMA foreign_keys = OFF');
  } else if (client === 'mysql2') {
    await trx.raw('SET FOREIGN_KEY_CHECKS = 0');
  }

  for (const table of DELETE_ORDER) {
    if (await tableExists(trx, table)) {
      await trx(table).del();
    }
  }

  if (client === 'sqlite3') {
    await trx.raw('PRAGMA foreign_keys = ON');
  } else if (client === 'mysql2') {
    await trx.raw('SET FOREIGN_KEY_CHECKS = 1');
  }
}

async function exportDatabaseSnapshot(knex) {
  if (!(await knex.schema.hasTable('users'))) {
    return { hasData: false };
  }

  const users = await knex('users').select('*');
  if (!users.length) return { hasData: false };

  const boards = (await knex.schema.hasTable('boards'))
    ? await knex('boards').select('*')
    : [];
  const boardMembers = (await knex.schema.hasTable('board_members'))
    ? await knex('board_members').select('*')
    : [];
  const columns = (await knex.schema.hasTable('columns'))
    ? await knex('columns').select('*')
    : [];
  const cards = (await knex.schema.hasTable('cards'))
    ? await knex('cards').select('*')
    : [];
  const attachments = (await knex.schema.hasTable('attachments'))
    ? await knex('attachments').select('*')
    : [];

  return {
    hasData: true,
    users,
    boards,
    boardMembers,
    columns,
    cards,
    attachments,
  };
}

async function isTargetEmpty(knex) {
  if (!(await knex.schema.hasTable('users'))) return true;

  const userCount = await tableCount(knex, 'users');
  if (userCount === 0) return true;

  if (userCount === 1) {
    const admin = await knex('users').where({ username: 'admin' }).first();
    if (!admin) return false;
    if (!(await knex.schema.hasTable('boards'))) return true;
    const boardCount = await tableCount(knex, 'boards');
    return boardCount === 0;
  }

  return false;
}

async function importDatabaseSnapshot(knex, snapshot) {
  if (!snapshot?.hasData || !snapshot.users?.length) {
    return { imported: false, reason: 'no-source-data' };
  }

  if (!(await isTargetEmpty(knex))) {
    return { imported: false, reason: 'target-not-empty' };
  }

  await knex.transaction(async (trx) => {
    await clearAllTables(trx);

    const userIdMap = {};
    for (const user of snapshot.users) {
      const newId = await insertGetId(trx, 'users', user);
      userIdMap[user.id] = newId;
    }

    const boardIdMap = {};
    for (const board of snapshot.boards || []) {
      const row = { ...board };
      if (row.owner_id != null) row.owner_id = userIdMap[row.owner_id] ?? null;
      const newId = await insertGetId(trx, 'boards', row);
      boardIdMap[board.id] = newId;
    }

    for (const member of snapshot.boardMembers || []) {
      const boardId = boardIdMap[member.board_id];
      const userId = userIdMap[member.user_id];
      if (!boardId || !userId) continue;
      await trx('board_members').insert({
        board_id: boardId,
        user_id: userId,
        role: member.role || 'editor',
      });
    }

    const columnIdMap = {};
    for (const column of snapshot.columns || []) {
      const boardId = boardIdMap[column.board_id];
      if (!boardId) continue;
      const row = { ...column, board_id: boardId };
      const newId = await insertGetId(trx, 'columns', row);
      columnIdMap[column.id] = newId;
    }

    const cardIdMap = {};
    for (const card of snapshot.cards || []) {
      const columnId = columnIdMap[card.column_id];
      if (!columnId) continue;
      const row = { ...card, column_id: columnId };
      if (row.assignee_id != null) row.assignee_id = userIdMap[row.assignee_id] ?? null;
      const newId = await insertGetId(trx, 'cards', row);
      cardIdMap[card.id] = newId;
    }

    for (const attachment of snapshot.attachments || []) {
      const cardId = cardIdMap[attachment.card_id];
      if (!cardId) continue;
      await insertGetId(trx, 'attachments', { ...attachment, card_id: cardId });
    }
  });

  return {
    imported: true,
    users: snapshot.users.length,
    boards: (snapshot.boards || []).length,
  };
}

module.exports = {
  exportDatabaseSnapshot,
  importDatabaseSnapshot,
  isTargetEmpty,
};

const DELETE_ORDER = [
  'comment_attachments', 'comments', 'attachments', 'cards', 'columns', 'board_members', 'boards', 'users',
];

const ID_TABLES = ['users', 'boards', 'columns', 'cards', 'attachments', 'comments', 'comment_attachments'];

async function tableExists(trx, table) {
  return trx.schema.hasTable(table);
}

async function tableCount(trx, table) {
  const row = await trx(table).count('* as cnt').first();
  return Number(row?.cnt ?? row?.['count(*)'] ?? 0);
}

const { sanitizeRowTimestamps } = require('./timestamp-utils');

async function insertGetId(trx, table, row, options = {}) {
  const clean = sanitizeRowTimestamps(table, { ...row });
  if (!options.keepId) delete clean.id;
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
  const comments = (await knex.schema.hasTable('comments'))
    ? await knex('comments').select('*')
    : [];
  const commentAttachments = (await knex.schema.hasTable('comment_attachments'))
    ? await knex('comment_attachments').select('*')
    : [];

  return {
    hasData: true,
    users,
    boards,
    boardMembers,
    columns,
    cards,
    attachments,
    comments,
    commentAttachments,
  };
}

async function bumpSqliteSequences(trx) {
  if (trx.client.config.client !== 'sqlite3') return;
  if (!(await trx.schema.hasTable('sqlite_sequence'))) return;
  for (const table of ID_TABLES) {
    if (!(await trx.schema.hasTable(table))) continue;
    const row = await trx(table).max('id as maxId').first();
    const maxId = Number(row?.maxId || 0);
    if (!maxId) continue;
    const current = await trx('sqlite_sequence').where({ name: table }).first();
    if (!current) {
      await trx('sqlite_sequence').insert({ name: table, seq: maxId });
    } else if (Number(current.seq) < maxId) {
      await trx('sqlite_sequence').where({ name: table }).update({ seq: maxId });
    }
  }
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

async function importDatabaseSnapshot(knex, snapshot, options = {}) {
  if (!snapshot?.hasData || !snapshot.users?.length) {
    return { imported: false, reason: 'no-source-data' };
  }

  if (!options.replace && !(await isTargetEmpty(knex))) {
    return { imported: false, reason: 'target-not-empty' };
  }

  const keepIds = !!options.keepIds && knex.client.config.client === 'sqlite3';

  await knex.transaction(async (trx) => {
    await clearAllTables(trx);

    const userIdMap = {};
    for (const user of snapshot.users) {
      const newId = await insertGetId(trx, 'users', user, { keepId: keepIds });
      userIdMap[user.id] = newId;
    }

    const boardIdMap = {};
    for (const board of snapshot.boards || []) {
      const row = { ...board };
      if (row.owner_id != null) row.owner_id = userIdMap[row.owner_id] ?? null;
      const newId = await insertGetId(trx, 'boards', row, { keepId: keepIds });
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
      const newId = await insertGetId(trx, 'columns', row, { keepId: keepIds });
      columnIdMap[column.id] = newId;
    }

    const cardIdMap = {};
    for (const card of snapshot.cards || []) {
      const columnId = columnIdMap[card.column_id];
      if (!columnId) continue;
      const row = { ...card, column_id: columnId };
      if (row.assignee_id != null) row.assignee_id = userIdMap[row.assignee_id] ?? null;
      const newId = await insertGetId(trx, 'cards', row, { keepId: keepIds });
      cardIdMap[card.id] = newId;
    }

    for (const attachment of snapshot.attachments || []) {
      const cardId = cardIdMap[attachment.card_id];
      if (!cardId) continue;
      await insertGetId(trx, 'attachments', { ...attachment, card_id: cardId }, { keepId: keepIds });
    }

    const commentIdMap = {};
    const orderedComments = [...(snapshot.comments || [])].sort((a, b) => (a.id || 0) - (b.id || 0));
    for (const comment of orderedComments) {
      const cardId = cardIdMap[comment.card_id];
      if (!cardId) continue;
      const row = { ...comment, card_id: cardId };
      if (row.user_id != null) row.user_id = userIdMap[row.user_id] ?? null;
      if (row.parent_id != null) row.parent_id = commentIdMap[row.parent_id] ?? null;
      const newId = await insertGetId(trx, 'comments', row, { keepId: keepIds });
      commentIdMap[comment.id] = newId;
    }

    for (const attachment of snapshot.commentAttachments || []) {
      const commentId = commentIdMap[attachment.comment_id];
      if (!commentId) continue;
      await insertGetId(trx, 'comment_attachments', { ...attachment, comment_id: commentId }, { keepId: keepIds });
    }

    if (keepIds) await bumpSqliteSequences(trx);
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

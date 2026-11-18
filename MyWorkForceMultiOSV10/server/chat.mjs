import { randomBytes } from 'node:crypto';

export const FILE_LIMIT = 8 * 1024 * 1024;

function row(record) {
  const out = {};
  for (const [key, value] of Object.entries(record || {})) out[key.toLowerCase()] = value;
  return out;
}

const nowIso = () => new Date().toISOString();
const freshId = (prefix) => `${prefix}-${randomBytes(8).toString('hex')}`;

async function memberOf(engine, roomId, userId) {
  const rows = await engine.query('SELECT room_id FROM chat_members WHERE room_id = ? AND user_id = ?', [roomId, userId]);
  return rows.length > 0;
}

async function assertMember(engine, roomId, userId) {
  if (!await memberOf(engine, roomId, userId)) {
    const error = new Error('permission');
    throw error;
  }
}

async function roomOf(engine, roomId, actorId, people) {
  const rooms = await engine.query('SELECT id, name, kind, created_at FROM chat_rooms WHERE id = ?', [roomId]);
  const room = row(rooms[0]);
  if (!room.id) throw new Error('not-found');
  const members = (await engine.query('SELECT user_id, last_read FROM chat_members WHERE room_id = ?', [roomId])).map(row);
  const mine = members.find((item) => item.user_id === actorId);
  const latest = (await engine.query('SELECT body, kind, created_at, user_id FROM chat_messages WHERE room_id = ? ORDER BY created_at DESC LIMIT 1', [roomId])).map(row)[0] || null;
  const unread = room.kind === 'notices'
    ? (await engine.query(
      `SELECT m.id AS id FROM chat_messages m
        WHERE m.room_id = ? AND m.kind = 'notice'
        AND NOT EXISTS (SELECT 1 FROM chat_checks c WHERE c.message_id = m.id AND c.user_id = ?)`,
      [roomId, actorId],
    )).length
    : (mine
      ? (await engine.query('SELECT id FROM chat_messages WHERE room_id = ? AND created_at > ? AND user_id <> ?', [roomId, mine.last_read || '', actorId])).length
      : 0);
  const names = new Map((people || []).map((person) => [person.id, person.name || person.login || person.id]));
  const others = members.map((item) => item.user_id).filter((id) => id !== actorId);
  const title = room.kind === 'notices' ? '' : (room.name || others.map((id) => names.get(id) || id).join(', '));
  return {
    id: room.id,
    name: title,
    kind: room.kind,
    created: room.created_at,
    members: members.map((item) => ({ id: item.user_id, name: names.get(item.user_id) || item.user_id })),
    last: latest ? { body: latest.kind === 'file' ? latest.body : latest.body, kind: latest.kind, at: latest.created_at, userId: latest.user_id } : null,
    unread,
  };
}

export async function noticeRoom(engine, userId) {
  const rows = (await engine.query(
    'SELECT r.id AS id FROM chat_rooms r JOIN chat_members m ON m.room_id = r.id AND m.user_id = ? WHERE r.kind = ?',
    [userId, 'notices'],
  )).map(row);
  if (rows[0]?.id) return rows[0].id;
  const id = freshId('room');
  const created = nowIso();
  await engine.query('INSERT INTO chat_rooms (id, name, kind, created_at) VALUES (?, ?, ?, ?)', [id, '', 'notices', created]);
  await engine.query('INSERT INTO chat_members (room_id, user_id, last_read) VALUES (?, ?, ?)', [id, userId, '']);
  return id;
}

export function noticeTarget(workspace, actorId, message) {
  if (!message || message.kind !== 'notice') return null;
  const prefix = `notice-${actorId}-`;
  const noticeId = String(message.id || '').startsWith(prefix) ? String(message.id).slice(prefix.length) : '';
  let project = null;
  let found = null;
  for (const item of workspace?.projects || []) {
    const note = (item.notifications || []).find((entry) => entry.id === noticeId);
    if (note) { project = item; found = note; break; }
  }
  // A company inbox notice (a mention, or a company or team page) has no project.
  if (!found) found = (workspace?.inbox || []).find((entry) => entry.id === noticeId && entry.userId === actorId) || null;
  const pageId = found?.pageId || (workspace?.articles || []).find((page) => (found?.kind === 'page' || found?.kind === 'page-comment' || found?.kind === 'mention') && page.title && page.title === found.issueKey)?.id || '';
  const documentId = found?.documentId || (workspace?.documents || []).find((doc) => found?.kind === 'document' && doc.title === found.issueKey && (!project || doc.projectId === project.id))?.id || '';
  const issueKind = found?.kind && !['page', 'page-comment', 'mention', 'document'].includes(found.kind);
  const view = pageId ? 'knowledge' : documentId ? 'documents' : (found?.issueId || (issueKind && found?.issueKey)) ? 'issue' : 'notifications';
  return {
    view,
    projectId: project?.id || '',
    projectKey: project?.key || '',
    issueId: view === 'issue' ? (found?.issueId || '') : '',
    issueKey: view === 'issue' ? (found?.issueKey || '') : '',
    pageId: view === 'knowledge' ? pageId : '',
    documentId: view === 'documents' ? documentId : '',
    kind: found?.kind || '',
  };
}

export async function postNotice(engine, userId, noticeId, text) {
  if (!userId || !noticeId) return;
  const roomId = await noticeRoom(engine, userId);
  const id = `notice-${userId}-${noticeId}`;
  const existing = await engine.query('SELECT id FROM chat_messages WHERE id = ?', [id]);
  if (existing.length) return;
  await engine.query(
    'INSERT INTO chat_messages (id, room_id, user_id, kind, body, file_id, file_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, roomId, 'myworkforce', 'notice', String(text || '').slice(0, 500), '', '', nowIso()],
  );
}

async function findDirect(engine, left, right) {
  const rows = (await engine.query(
    `SELECT r.id AS id FROM chat_rooms r
      JOIN chat_members a ON a.room_id = r.id AND a.user_id = ?
      JOIN chat_members b ON b.room_id = r.id AND b.user_id = ?
      WHERE r.kind = 'direct'`,
    [left, right],
  )).map(row);
  return rows[0]?.id || '';
}

async function createRoom(engine, actorId, kind, name, members) {
  const id = freshId('room');
  const created = nowIso();
  await engine.query('INSERT INTO chat_rooms (id, name, kind, created_at) VALUES (?, ?, ?, ?)', [id, name, kind, created]);
  for (const userId of members) {
    await engine.query('INSERT INTO chat_members (room_id, user_id, last_read) VALUES (?, ?, ?)', [id, userId, '']);
  }
  return id;
}

export async function openRoom(engine, actorId, input, people) {
  const kind = input?.kind === 'group' ? 'group' : 'direct';
  const known = new Set((people || []).map((person) => person.id));
  const members = [...new Set([actorId, ...(input?.members || []).map(String)].filter((id) => id && (id === actorId || known.has(id))))];
  if (kind === 'direct') {
    if (members.length !== 2) throw new Error('members-required');
    const existing = await findDirect(engine, members[0], members[1]);
    const id = existing || await createRoom(engine, actorId, 'direct', '', members);
    return roomOf(engine, id, actorId, people);
  }
  const name = String(input?.name || '').trim();
  if (!name) throw new Error('name-required');
  if (members.length < 3) throw new Error('members-required');
  if (members.length > 50) throw new Error('members-required');
  const id = await createRoom(engine, actorId, 'group', name.slice(0, 80), members);
  return roomOf(engine, id, actorId, people);
}

export async function inviteMembers(engine, actorId, roomId, memberIds, people) {
  await assertMember(engine, roomId, actorId);
  const rooms = (await engine.query('SELECT id, kind FROM chat_rooms WHERE id = ?', [roomId])).map(row);
  const room = rooms[0];
  if (!room?.id) throw new Error('not-found');
  if (room.kind === 'notices') throw new Error('permission');
  const known = new Set((people || []).map((person) => person.id));
  const current = (await engine.query('SELECT user_id FROM chat_members WHERE room_id = ?', [roomId])).map(row);
  const have = new Set(current.map((item) => item.user_id));
  const adding = [...new Set((memberIds || []).map(String))].filter((id) => known.has(id) && !have.has(id));
  if (!adding.length) throw new Error('members-required');
  if (have.size + adding.length > 50) throw new Error('members-required');
  for (const userId of adding) {
    await engine.query('INSERT INTO chat_members (room_id, user_id, last_read) VALUES (?, ?, ?)', [roomId, userId, '']);
  }
  if (room.kind === 'direct') await engine.query('UPDATE chat_rooms SET kind = ? WHERE id = ?', ['group', roomId]);
  return roomOf(engine, roomId, actorId, people);
}

export async function listRooms(engine, actorId, people) {
  await noticeRoom(engine, actorId);
  const membership = (await engine.query('SELECT room_id FROM chat_members WHERE user_id = ?', [actorId])).map(row);
  const rooms = [];
  for (const item of membership) rooms.push(await roomOf(engine, item.room_id, actorId, people));
  rooms.sort((left, right) => {
    if (left.kind === 'notices') return -1;
    if (right.kind === 'notices') return 1;
    return String(right.last?.at || right.created).localeCompare(String(left.last?.at || left.created));
  });
  return rooms;
}

function mapMessage(record) {
  const item = row(record);
  return {
    id: item.id,
    roomId: item.room_id,
    userId: item.user_id,
    kind: item.kind,
    body: item.body,
    fileId: item.file_id || '',
    fileName: item.file_name || '',
    at: item.created_at,
  };
}

export async function listMessages(engine, actorId, roomId, after = '') {
  await assertMember(engine, roomId, actorId);
  const rows = after
    ? await engine.query('SELECT id, room_id, user_id, kind, body, file_id, file_name, created_at FROM chat_messages WHERE room_id = ? AND created_at > ? ORDER BY created_at ASC', [roomId, after])
    : await engine.query('SELECT id, room_id, user_id, kind, body, file_id, file_name, created_at FROM chat_messages WHERE room_id = ? ORDER BY created_at DESC LIMIT 80', [roomId]);
  const messages = rows.map(mapMessage);
  if (!after) messages.reverse();
  const checks = new Set((await engine.query('SELECT message_id FROM chat_checks WHERE user_id = ?', [actorId])).map((item) => row(item).message_id));
  for (const message of messages) message.checked = checks.has(message.id);
  const rooms = (await engine.query('SELECT kind FROM chat_rooms WHERE id = ?', [roomId])).map(row);
  if (rooms[0]?.kind !== 'notices') {
    await engine.query('UPDATE chat_members SET last_read = ? WHERE room_id = ? AND user_id = ?', [nowIso(), roomId, actorId]);
  }
  return messages;
}

export async function checkMessage(engine, actorId, messageId) {
  const rows = (await engine.query('SELECT id, room_id FROM chat_messages WHERE id = ?', [messageId])).map(row);
  const message = rows[0];
  if (!message?.id) throw new Error('not-found');
  await assertMember(engine, message.room_id, actorId);
  const existing = await engine.query('SELECT message_id FROM chat_checks WHERE message_id = ? AND user_id = ?', [messageId, actorId]);
  if (!existing.length) {
    await engine.query('INSERT INTO chat_checks (message_id, user_id, checked_at) VALUES (?, ?, ?)', [messageId, actorId, nowIso()]);
  }
  return { id: messageId, checked: true };
}

export async function postMessage(engine, actorId, roomId, body) {
  await assertMember(engine, roomId, actorId);
  const text = String(body || '').trim();
  if (!text) throw new Error('summary-required');
  const id = freshId('msg');
  const created = nowIso();
  await engine.query(
    'INSERT INTO chat_messages (id, room_id, user_id, kind, body, file_id, file_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, roomId, actorId, 'text', text.slice(0, 4000), '', '', created],
  );
  return { id, roomId, userId: actorId, kind: 'text', body: text.slice(0, 4000), fileId: '', fileName: '', at: created };
}

export async function postFile(engine, actorId, roomId, input) {
  await assertMember(engine, roomId, actorId);
  const name = String(input?.name || 'file').replace(/[/\\]/g, '').slice(0, 120) || 'file';
  const mime = String(input?.mime || 'application/octet-stream').slice(0, 120);
  const bytes = Buffer.from(String(input?.data || ''), 'base64');
  if (!bytes.length || bytes.length > FILE_LIMIT) throw new Error('attachment-big');
  const fileId = freshId('file');
  const messageId = freshId('msg');
  const created = nowIso();
  await engine.query(
    'INSERT INTO chat_files (id, name, mime, size_bytes, data, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [fileId, name, mime, bytes.length, bytes.toString('base64'), created],
  );
  await engine.query(
    'INSERT INTO chat_messages (id, room_id, user_id, kind, body, file_id, file_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [messageId, roomId, actorId, 'file', name, fileId, name, created],
  );
  return { id: messageId, roomId, userId: actorId, kind: 'file', body: name, fileId, fileName: name, at: created };
}

export async function readFile(engine, actorId, fileId) {
  const rows = (await engine.query('SELECT id, name, mime, data FROM chat_files WHERE id = ?', [fileId])).map(row);
  const file = rows[0];
  if (!file?.id) throw new Error('not-found');
  const linked = (await engine.query('SELECT room_id FROM chat_messages WHERE file_id = ?', [fileId])).map(row);
  let allowed = false;
  for (const item of linked) {
    if (await memberOf(engine, item.room_id, actorId)) { allowed = true; break; }
  }
  if (!allowed) throw new Error('permission');
  return file;
}

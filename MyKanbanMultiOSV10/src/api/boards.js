const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { getDb, getUploadsPath } = require('../db/connection');
const { normalizeTimestamp, sanitizeRowTimestamps } = require('../db/timestamp-utils');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, getUploadsPath());
  },
  filename: (req, file, cb) => {
    cb(null, `${uuidv4()}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// ── Permission helpers ────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

async function getProjectRole(db, boardId, userId, isSystemAdmin) {
  if (isSystemAdmin) return 'system-admin';
  const board = await db('boards').where({ id: boardId }).first();
  if (!board) return null;
  if (board.owner_id === userId) return 'owner';
  const member = await db('board_members').where({ board_id: boardId, user_id: userId }).first();
  return member ? member.role : null;
}

function canView(role) { return role !== null; }
function canEdit(role) { return ['system-admin', 'owner', 'admin', 'editor'].includes(role); }
function canManageMembers(role) { return ['system-admin', 'owner', 'admin'].includes(role); }
function canDeleteProject(role) { return ['system-admin', 'owner'].includes(role); }

// Middleware: require at least viewer access to a project
async function requireProjectAccess(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  const db = getDb();
  const role = await getProjectRole(db, req.params.boardId || req.params.id, req.session.userId, req.session.role === 'admin');
  if (!canView(role)) return res.status(403).json({ error: '이 프로젝트에 접근 권한이 없습니다.' });
  req.projectRole = role;
  next();
}

// ── PROJECTS (BOARDS) ─────────────────────────────────────────────────────────

// GET /api/boards — list accessible projects
router.get('/', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const userId = req.session.userId;
    const isAdmin = req.session.role === 'admin';

    let boards;
    if (isAdmin) {
      boards = await db('boards')
        .leftJoin('users', 'boards.owner_id', 'users.id')
        .select('boards.*', 'users.display_name as owner_name');
    } else {
      const owned = await db('boards')
        .leftJoin('users', 'boards.owner_id', 'users.id')
        .where('boards.owner_id', userId)
        .select('boards.*', 'users.display_name as owner_name');

      const memberBoards = await db('boards')
        .join('board_members', 'boards.id', 'board_members.board_id')
        .leftJoin('users', 'boards.owner_id', 'users.id')
        .where('board_members.user_id', userId)
        .select('boards.*', 'users.display_name as owner_name', 'board_members.role as member_role');

      // Merge, avoid duplicates
      const seen = new Set(owned.map(b => b.id));
      boards = [
        ...owned.map(b => ({ ...b, myRole: 'owner' })),
        ...memberBoards.filter(b => !seen.has(b.id)).map(b => ({ ...b, myRole: b.member_role }))
      ];
    }

    if (isAdmin) boards = boards.map(b => ({ ...b, myRole: 'system-admin' }));

    res.json(boards.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/boards — create project (any authenticated user)
router.post('/', requireAuth, async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title) return res.status(400).json({ error: '프로젝트 이름은 필수입니다.' });

    const db = getDb();
    const [id] = await db('boards').insert({ title, description: description || null, owner_id: req.session.userId });

    await db('columns').insert([
      { board_id: id, title: '할 일', position: 0 },
      { board_id: id, title: '진행 중', position: 1 },
      { board_id: id, title: '완료', position: 2 }
    ]);

    res.json({ id, title, description, owner_id: req.session.userId, myRole: 'owner' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/boards/:id
router.put('/:id', requireAuth, requireProjectAccess, async (req, res) => {
  if (!canEdit(req.projectRole)) return res.status(403).json({ error: '편집 권한이 없습니다.' });
  try {
    const { title, description } = req.body;
    const update = { title, description, updated_at: new Date() };
    if (req.body.bg_color !== undefined) update.bg_color = req.body.bg_color || null;
    await getDb()('boards').where({ id: req.params.id }).update(update);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/boards/:id
router.delete('/:id', requireAuth, requireProjectAccess, async (req, res) => {
  if (!canDeleteProject(req.projectRole)) return res.status(403).json({ error: '삭제 권한은 프로젝트 소유자/시스템 관리자만 가집니다.' });
  try {
    await getDb()('boards').where({ id: req.params.id }).delete();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PROJECT MEMBERS ───────────────────────────────────────────────────────────

// GET /api/boards/:boardId/members
router.get('/:boardId/members', requireAuth, requireProjectAccess, async (req, res) => {
  try {
    const db = getDb();
    const board = await db('boards').where({ id: req.params.boardId }).first();

    const members = await db('board_members')
      .join('users', 'board_members.user_id', 'users.id')
      .where('board_members.board_id', req.params.boardId)
      .select(
        'users.id', 'users.username', 'users.display_name', 'users.email',
        'board_members.role'
      );

    // Get owner info
    const owner = board && board.owner_id
      ? await db('users').where({ id: board.owner_id }).select('id', 'username', 'display_name', 'email').first()
      : null;

    res.json({ owner, members });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/boards/:boardId/members — add member
router.post('/:boardId/members', requireAuth, requireProjectAccess, async (req, res) => {
  if (!canManageMembers(req.projectRole)) return res.status(403).json({ error: '멤버 관리 권한이 없습니다.' });
  try {
    const { userId, role } = req.body;
    if (!userId || !role) return res.status(400).json({ error: 'userId와 role은 필수입니다.' });

    const db = getDb();
    const board = await db('boards').where({ id: req.params.boardId }).first();
    if (board && board.owner_id === parseInt(userId)) {
      return res.status(400).json({ error: '프로젝트 소유자는 멤버로 추가할 수 없습니다.' });
    }

    const existing = await db('board_members').where({ board_id: req.params.boardId, user_id: userId }).first();
    if (existing) {
      await db('board_members').where({ board_id: req.params.boardId, user_id: userId }).update({ role });
    } else {
      await db('board_members').insert({ board_id: req.params.boardId, user_id: userId, role });
    }

    const user = await db('users').where({ id: userId }).select('id', 'username', 'display_name', 'email').first();
    res.json({ ...user, role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/boards/:boardId/members/:userId — change role
router.put('/:boardId/members/:userId', requireAuth, requireProjectAccess, async (req, res) => {
  if (!canManageMembers(req.projectRole)) return res.status(403).json({ error: '멤버 관리 권한이 없습니다.' });
  try {
    const { role } = req.body;
    const db = getDb();
    const board = await db('boards').where({ id: req.params.boardId }).first();
    if (board && board.owner_id === parseInt(req.params.userId)) {
      return res.status(400).json({ error: '소유자의 권한은 변경할 수 없습니다.' });
    }
    await db('board_members')
      .where({ board_id: req.params.boardId, user_id: req.params.userId })
      .update({ role });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/boards/:boardId/members/:userId — remove member
router.delete('/:boardId/members/:userId', requireAuth, requireProjectAccess, async (req, res) => {
  if (!canManageMembers(req.projectRole)) return res.status(403).json({ error: '멤버 관리 권한이 없습니다.' });
  try {
    const db = getDb();
    const board = await db('boards').where({ id: req.params.boardId }).first();
    if (board && board.owner_id === parseInt(req.params.userId)) {
      return res.status(400).json({ error: '소유자는 프로젝트에서 제거할 수 없습니다.' });
    }
    await db('board_members').where({ board_id: req.params.boardId, user_id: req.params.userId }).delete();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/boards/:boardId/assignees — project members for card assignee selection
router.get('/:boardId/assignees', requireAuth, requireProjectAccess, async (req, res) => {
  try {
    const db = getDb();
    const board = await db('boards').where({ id: req.params.boardId }).first();
    const assignees = [];
    const seen = new Set();
    const markSeen = (id) => { if (id != null) seen.add(Number(id)); };
    const isSeen = (id) => id != null && seen.has(Number(id));

    if (board?.owner_id) {
      const owner = await db('users')
        .where({ id: board.owner_id, status: 'active' })
        .select('id', 'username', 'display_name')
        .first();
      if (owner) {
        assignees.push(owner);
        markSeen(owner.id);
      }
    }

    const members = await db('board_members')
      .join('users', 'board_members.user_id', 'users.id')
      .where('board_members.board_id', req.params.boardId)
      .where('users.status', 'active')
      .select('users.id', 'users.username', 'users.display_name');

    members.forEach(m => {
      if (!isSeen(m.id)) {
        assignees.push(m);
        markSeen(m.id);
      }
    });

    assignees.sort((a, b) =>
      (a.display_name || a.username).localeCompare(b.display_name || b.username, 'ko')
    );
    res.json(assignees);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── COLUMNS ───────────────────────────────────────────────────────────────────

router.get('/:boardId/columns', requireAuth, requireProjectAccess, async (req, res) => {
  try {
    const db = getDb();
    const columns = await db('columns')
      .where({ board_id: req.params.boardId })
      .orderBy('position');

    const colIds = columns.map(c => c.id);
    let cards = [];
    let attachCounts = {};

    if (colIds.length > 0) {
      cards = await db('cards')
        .whereIn('column_id', colIds)
        .leftJoin('users', 'cards.assignee_id', 'users.id')
        .select('cards.*', 'users.display_name as assignee_name')
        .orderBy('cards.position');

      const cardIds = cards.map(c => c.id);
      if (cardIds.length > 0) {
        const rows = await db('attachments')
          .whereIn('card_id', cardIds)
          .groupBy('card_id')
          .select('card_id', db.raw('count(*) as cnt'));
        rows.forEach(r => { attachCounts[r.card_id] = parseInt(r.cnt); });
      }
    }

    cards.forEach(c => { c.attachment_count = attachCounts[c.id] || 0; });
    const cardsByCol = {};
    cards.forEach(c => {
      if (!cardsByCol[c.column_id]) cardsByCol[c.column_id] = [];
      cardsByCol[c.column_id].push(c);
    });

    res.json({
      permissions: {
        myRole: req.projectRole,
        canEdit: canEdit(req.projectRole),
        canManageMembers: canManageMembers(req.projectRole),
        canDeleteProject: canDeleteProject(req.projectRole)
      },
      columns: columns.map(col => ({ ...col, cards: cardsByCol[col.id] || [] }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:boardId/columns', requireAuth, requireProjectAccess, async (req, res) => {
  if (!canEdit(req.projectRole)) return res.status(403).json({ error: '편집 권한이 없습니다.' });
  try {
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: '컬럼 제목은 필수입니다.' });
    const db = getDb();
    const maxRow = await db('columns').where({ board_id: req.params.boardId }).max('position as m').first();
    const position = (parseInt(maxRow.m) || 0) + 1;
    const [id] = await db('columns').insert({ board_id: req.params.boardId, title, position });
    res.json({ id, title, position, cards: [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:boardId/columns/:id', requireAuth, requireProjectAccess, async (req, res) => {
  if (!canEdit(req.projectRole)) return res.status(403).json({ error: '편집 권한이 없습니다.' });
  try {
    const update = {};
    if (req.body.title !== undefined) update.title = req.body.title;
    if (req.body.position !== undefined) update.position = req.body.position;
    if (req.body.bg_color !== undefined) update.bg_color = req.body.bg_color || null;
    await getDb()('columns').where({ id: req.params.id }).update(update);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:boardId/columns/:id', requireAuth, requireProjectAccess, async (req, res) => {
  if (!canEdit(req.projectRole)) return res.status(403).json({ error: '편집 권한이 없습니다.' });
  try {
    await getDb()('columns').where({ id: req.params.id }).delete();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── CARDS ─────────────────────────────────────────────────────────────────────

router.post('/:boardId/cards', requireAuth, requireProjectAccess, async (req, res) => {
  if (!canEdit(req.projectRole)) return res.status(403).json({ error: '편집 권한이 없습니다.' });
  try {
    const { columnId, title, description, assigneeId, dueDate, color } = req.body;
    if (!title || !columnId) return res.status(400).json({ error: '제목과 컬럼은 필수입니다.' });
    const db = getDb();
    const maxRow = await db('cards').where({ column_id: columnId }).max('position as m').first();
    const position = (parseInt(maxRow.m) || 0) + 1;
    const [id] = await db('cards').insert({
      column_id: columnId, title,
      description: description || null,
      assignee_id: assigneeId || null,
      due_date: dueDate || null,
      color: color || null,
      position
    });
    res.json({ id, column_id: columnId, title, position });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:boardId/cards/:id', requireAuth, requireProjectAccess, async (req, res) => {
  try {
    const db = getDb();
    const card = await db('cards')
      .where('cards.id', req.params.id)
      .leftJoin('users', 'cards.assignee_id', 'users.id')
      .select('cards.*', 'users.display_name as assignee_name')
      .first();
    if (!card) return res.status(404).json({ error: '카드를 찾을 수 없습니다.' });
    card.attachments = await db('attachments').where({ card_id: req.params.id }).orderBy('created_at');
    card.canEdit = canEdit(req.projectRole);
    res.json(card);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:boardId/cards/:id', requireAuth, requireProjectAccess, async (req, res) => {
  if (!canEdit(req.projectRole)) return res.status(403).json({ error: '편집 권한이 없습니다.' });
  try {
    const { title, description, assigneeId, dueDate, color } = req.body;
    const update = { updated_at: normalizeTimestamp(new Date()) };
    if (title !== undefined) update.title = title;
    if (description !== undefined) update.description = description || null;
    if (assigneeId !== undefined) update.assignee_id = assigneeId || null;
    if (dueDate !== undefined) update.due_date = dueDate || null;
    if (color !== undefined) update.color = color || null;
    await getDb()('cards').where({ id: req.params.id }).update(update);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:boardId/cards/:id', requireAuth, requireProjectAccess, async (req, res) => {
  if (!canEdit(req.projectRole)) return res.status(403).json({ error: '편집 권한이 없습니다.' });
  try {
    await getDb()('cards').where({ id: req.params.id }).delete();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:boardId/cards/:id/move', requireAuth, requireProjectAccess, async (req, res) => {
  if (!canEdit(req.projectRole)) return res.status(403).json({ error: '편집 권한이 없습니다.' });
  try {
    const { targetColumnId, position } = req.body;
    const cardId = parseInt(req.params.id);
    const db = getDb();
    await db.transaction(async trx => {
      const card = await trx('cards').where({ id: cardId }).first();
      const srcColId = card.column_id;

      let targetCards = await trx('cards')
        .where({ column_id: targetColumnId })
        .whereNot({ id: cardId })
        .orderBy('position')
        .select('id');

      const insertAt = Math.max(0, Math.min(position, targetCards.length));
      targetCards.splice(insertAt, 0, { id: cardId });

      for (let i = 0; i < targetCards.length; i++) {
        await trx('cards').where({ id: targetCards[i].id }).update({
          position: i,
          column_id: targetColumnId,
          updated_at: normalizeTimestamp(new Date()),
        });
      }

      if (parseInt(srcColId) !== parseInt(targetColumnId)) {
        const srcCards = await trx('cards').where({ column_id: srcColId }).orderBy('position').select('id');
        for (let i = 0; i < srcCards.length; i++) {
          await trx('cards').where({ id: srcCards[i].id }).update({ position: i });
        }
      }
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SUMMARY / STATS ───────────────────────────────────────────────────────────

function toLocalDateKey(val) {
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function endOfLocalDay(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

function parseLocalDateKey(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function isValidDateKey(key) {
  if (!key || typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const d = parseLocalDateKey(key);
  return toLocalDateKey(d) === key;
}

function resolveBurndownRange(projectStartDate, queryStart, queryEnd) {
  const todayKey = toLocalDateKey(new Date());
  let startKey = isValidDateKey(queryStart) ? queryStart : projectStartDate;
  let endKey = isValidDateKey(queryEnd) ? queryEnd : todayKey;
  if (endKey > todayKey) endKey = todayKey;
  if (startKey > endKey) startKey = endKey;
  return { startKey, endKey, todayKey };
}

function getProjectStartDateKey(board, cards = []) {
  let startMs = board?.created_at ? new Date(board.created_at).getTime() : Date.now();
  if (Number.isNaN(startMs)) startMs = Date.now();
  return toLocalDateKey(new Date(startMs));
}

function countRemainingAt(cards, doneColId, endMs) {
  let remaining = 0;
  cards.forEach(c => {
    const createdMs = c.created_at ? new Date(c.created_at).getTime() : NaN;
    if (Number.isNaN(createdMs) || createdMs > endMs) return;
    const doneByDay = doneColId && c.column_id === doneColId && c.updated_at
      && new Date(c.updated_at).getTime() <= endMs;
    if (!doneByDay) remaining++;
  });
  return remaining;
}

function getCardColumnAt(card, columns, endMs) {
  const createdMs = card.created_at ? new Date(card.created_at).getTime() : NaN;
  if (Number.isNaN(createdMs) || createdMs > endMs) return null;

  const updatedMs = card.updated_at ? new Date(card.updated_at).getTime() : createdMs;
  if (updatedMs <= endMs) return card.column_id;

  return columns[0]?.id ?? null;
}

function countByColumnAt(cards, columns, endMs) {
  return columns.map(col => {
    let n = 0;
    cards.forEach(c => {
      if (getCardColumnAt(c, columns, endMs) === col.id) n++;
    });
    return n;
  });
}

function addIdealBurndown(series) {
  if (!series.length) return series;
  const lastIdx = series.length - 1;
  const peakRemaining = Math.max(0, ...series.map(s => s.remaining ?? 0));
  if (peakRemaining <= 0) {
    return series.map(s => ({ ...s, ideal: 0 }));
  }
  return series.map((s, i) => ({
    ...s,
    ideal: lastIdx === 0
      ? peakRemaining
      : Math.round((peakRemaining * (1 - i / lastIdx)) * 10) / 10,
  }));
}

function buildBurndownSeries(cards, columns, startDateKey, endDateKey) {
  const colList = columns || [];
  const doneColId = colList.length ? colList[colList.length - 1].id : null;
  const series = [];
  let start = parseLocalDateKey(startDateKey || toLocalDateKey(new Date()));
  let end = parseLocalDateKey(endDateKey || toLocalDateKey(new Date()));
  start.setHours(12, 0, 0, 0);
  end.setHours(12, 0, 0, 0);

  // Chart.js needs at least 2 points to draw a line.
  if (start.getTime() >= end.getTime()) {
    start = new Date(end);
    start.setDate(start.getDate() - 1);
    start.setHours(12, 0, 0, 0);
  }

  for (let d = new Date(start); d.getTime() <= end.getTime(); d.setDate(d.getDate() + 1)) {
    d.setHours(12, 0, 0, 0);
    const dateKey = toLocalDateKey(d);
    const endMs = endOfLocalDay(dateKey);

    let scope = 0;
    cards.forEach(c => {
      const createdMs = c.created_at ? new Date(c.created_at).getTime() : NaN;
      if (!Number.isNaN(createdMs) && createdMs <= endMs) scope++;
    });

    series.push({
      date: dateKey,
      scope,
      remaining: countRemainingAt(cards, doneColId, endMs),
      columnCounts: countByColumnAt(cards, colList, endMs),
    });
  }
  return addIdealBurndown(series);
}

router.get('/:boardId/summary', requireAuth, requireProjectAccess, async (req, res) => {
  try {
    const db = getDb();
    const board = await db('boards').where({ id: req.params.boardId }).first();
    const columns = await db('columns').where({ board_id: req.params.boardId }).orderBy('position');
    const colIds = columns.map(c => c.id);
    const projectStartDate = getProjectStartDateKey(board, []);
    const { startKey, endKey } = resolveBurndownRange(
      projectStartDate,
      req.query.startDate,
      req.query.endDate
    );

    if (colIds.length === 0) {
      return res.json({
        boardTitle: board?.title || '',
        columns: [], totalCards: 0, completedCards: 0, overdueCards: 0,
        projectStartDate,
        burndownStartDate: startKey,
        burndownEndDate: endKey,
        burndown: buildBurndownSeries([], [], startKey, endKey),
      });
    }

    const cards = await db('cards').whereIn('column_id', colIds).select('*');

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const doneColId = columns[columns.length - 1].id; // Last column = "done"
    const completedCards = cards.filter(c => c.column_id === doneColId).length;
    const overdueCards = cards.filter(c => {
      if (!c.due_date || c.column_id === doneColId) return false;
      return new Date(c.due_date) < today;
    }).length;

    const colStats = columns.map(col => ({
      id: col.id,
      title: col.title,
      count: cards.filter(c => c.column_id === col.id).length
    }));

    res.json({
      boardTitle: board?.title || '',
      columns: colStats,
      totalCards: cards.length,
      completedCards,
      overdueCards,
      projectStartDate,
      burndownStartDate: startKey,
      burndownEndDate: endKey,
      burndown: buildBurndownSeries(cards, columns, startKey, endKey),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SUMMARY REPORT EXPORT ─────────────────────────────────────────────────────

router.post('/:boardId/report', requireAuth, requireProjectAccess, async (req, res) => {
  try {
    const { format, images, lang } = req.body || {};
    if (!['md', 'docx', 'pdf'].includes(format)) {
      return res.status(400).json({ error: 'Unsupported report format.' });
    }

    const db = getDb();
    const board = await db('boards').where({ id: req.params.boardId }).first();
    if (!board) return res.status(404).json({ error: 'Project not found.' });

    const columns = await db('columns').where({ board_id: req.params.boardId }).orderBy('position');
    const colIds = columns.map(c => c.id);
    const projectStartDate = getProjectStartDateKey(board, []);
    let summaryData = {
      boardTitle: board.title,
      columns: [],
      totalCards: 0,
      completedCards: 0,
      overdueCards: 0,
      projectStartDate,
    };

    if (colIds.length > 0) {
      const cards = await db('cards').whereIn('column_id', colIds).select('*');
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const doneColId = columns[columns.length - 1].id;
      summaryData = {
        boardTitle: board.title,
        columns: columns.map(col => ({
          title: col.title,
          count: cards.filter(c => c.column_id === col.id).length,
        })),
        totalCards: cards.length,
        completedCards: cards.filter(c => c.column_id === doneColId).length,
        overdueCards: cards.filter(c => {
          if (!c.due_date || c.column_id === doneColId) return false;
          return new Date(c.due_date) < today;
        }).length,
        projectStartDate,
      };
    }

    const { buildReport, getReportFilename } = require('../services/report-builder');
    const { buffer, mime } = await buildReport(format, summaryData, images || {}, lang || 'ko');
    res.json({
      filename: getReportFilename(board.title, format),
      mime,
      data: buffer.toString('base64'),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ATTACHMENTS ───────────────────────────────────────────────────────────────

router.post('/:boardId/cards/:cardId/attachments', requireAuth, requireProjectAccess, upload.single('file'), async (req, res) => {
  if (!canEdit(req.projectRole)) return res.status(403).json({ error: '편집 권한이 없습니다.' });
  try {
    if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' });
    const db = getDb();
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const [id] = await db('attachments').insert({
      card_id: req.params.cardId,
      filename: req.file.filename,
      original_name: originalName,
      size: req.file.size,
      mimetype: req.file.mimetype
    });
    res.json({ id, filename: req.file.filename, original_name: originalName, size: req.file.size, mimetype: req.file.mimetype });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:boardId/cards/:cardId/attachments/:attachId', requireAuth, requireProjectAccess, async (req, res) => {
  if (!canEdit(req.projectRole)) return res.status(403).json({ error: '편집 권한이 없습니다.' });
  try {
    const db = getDb();
    const attach = await db('attachments').where({ id: req.params.attachId }).first();
    if (attach) {
      const fp = path.join(getUploadsPath(), attach.filename);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
      await db('attachments').where({ id: req.params.attachId }).delete();
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── KPRJ EXPORT / IMPORT ─────────────────────────────────────────────────────

function normalizeKprjData(data) {
  if (!data || data.format !== 'mykanban-project') return null;
  if (data.project?.title) return data.project;
  // 레거시/플랫 형식 (sample.kprj 등)
  if (data.title) {
    return {
      title: data.title,
      description: data.description || null,
      columns: data.columns || [],
    };
  }
  return null;
}

async function importKprjProject(db, data, userId, options = {}) {
  const project = normalizeKprjData(data);
  if (!project) throw new Error('올바른 .kprj 파일이 아닙니다.');

  let boardTitle = project.title;
  if (!options.noSuffix) {
    boardTitle += options.titleSuffix !== undefined ? ` ${options.titleSuffix}` : ' (가져오기)';
  }

  const [boardId] = await db('boards').insert({
    title: boardTitle,
    description: project.description || null,
    owner_id: userId,
  });

  const columns = project.columns || [];
  for (let ci = 0; ci < columns.length; ci++) {
    const col = columns[ci];
    const [colId] = await db('columns').insert({
      board_id: boardId,
      title: col.title,
      position: col.position !== undefined ? col.position : ci,
      bg_color: col.bg_color || null,
    });

    const cards = col.cards || [];
    for (let ki = 0; ki < cards.length; ki++) {
      const card = cards[ki];
      let assigneeId = null;
      if (card.assignee_username) {
        const u = await db('users').where({ username: card.assignee_username }).first();
        if (u) assigneeId = u.id;
      }
      await db('cards').insert(sanitizeRowTimestamps('cards', {
        column_id: colId,
        title: card.title,
        description: card.description || null,
        due_date: card.due_date || null,
        color: card.color || null,
        position: card.position !== undefined ? card.position : ki,
        assignee_id: assigneeId,
      }));
    }
  }

  return { id: boardId, title: project.title, myRole: 'owner' };
}

// GET /api/boards/:boardId/export  — download project as .kprj JSON
router.get('/:boardId/export', requireAuth, requireProjectAccess, async (req, res) => {
  try {
    const db = getDb();
    const board = await db('boards').where({ id: req.params.boardId }).first();
    if (!board) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });

    const columns = await db('columns')
      .where({ board_id: req.params.boardId })
      .orderBy('position');

    const colIds = columns.map(c => c.id);
    let cards = [];
    if (colIds.length > 0) {
      cards = await db('cards')
        .whereIn('column_id', colIds)
        .leftJoin('users', 'cards.assignee_id', 'users.id')
        .select('cards.*', 'users.username as assignee_username')
        .orderBy('cards.position');
    }

    const cardsByCol = {};
    cards.forEach(c => {
      if (!cardsByCol[c.column_id]) cardsByCol[c.column_id] = [];
      cardsByCol[c.column_id].push({
        title: c.title,
        description: c.description,
        due_date: c.due_date,
        color: c.color,
        position: c.position,
        assignee_username: c.assignee_username || null,
      });
    });

    const payload = {
      version: '1.0',
      format: 'mykanban-project',
      exported_at: new Date().toISOString(),
      project: {
        title: board.title,
        description: board.description,
        columns: columns.map(col => ({
          title: col.title,
          position: col.position,
          bg_color: col.bg_color || null,
          cards: cardsByCol[col.id] || [],
        })),
      },
    };

    const filename = `${board.title.replace(/[^a-zA-Z0-9가-힣]/g, '_')}.kprj`;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/boards/import-file?path=...  — read .kprj file from disk and import (Electron only)
router.get('/import-file', requireAuth, async (req, res) => {
  const filePath = req.query.path;
  if (!filePath || !filePath.toLowerCase().endsWith('.kprj')) {
    return res.status(400).json({ error: '올바른 .kprj 파일 경로가 필요합니다.' });
  }
  try {
    const fs = require('fs');
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    const db = getDb();
    const board = await importKprjProject(db, data, req.session.userId);
    res.json(board);
  } catch (err) {
    if (err.message === '올바른 .kprj 파일이 아닙니다.') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

// POST /api/boards/import  — create project from .kprj JSON
router.post('/import', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const board = await importKprjProject(db, req.body, req.session.userId, {
      noSuffix: !!req.body._noSuffix,
      titleSuffix: req.body._suffix,
    });
    res.json(board);
  } catch (err) {
    if (err.message === '올바른 .kprj 파일이 아닙니다.') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

import { insert, query, now } from '../db.js';

const FIELD_TO_KEY = {
  req_id: 'reqId',
  title: 'title',
  description: 'description',
  category: 'category',
  priority: 'priority',
  status: 'status',
  owner: 'owner',
  version: 'version',
};

export function rowToSnapshot(row) {
  if (!row) return null;
  return {
    reqId: row.req_id ?? '',
    title: row.title ?? '',
    description: row.description ?? '',
    category: row.category ?? 'General',
    priority: row.priority ?? 'Medium',
    status: row.status ?? 'Draft',
    owner: row.owner ?? '',
    version: row.version ?? '1.0',
  };
}

export function bodyToSnapshot(body, reqIdOverride) {
  return {
    reqId: reqIdOverride ?? body.reqId ?? '',
    title: body.title ?? '',
    description: body.description ?? '',
    category: body.category ?? 'General',
    priority: body.priority ?? 'Medium',
    status: body.status ?? 'Draft',
    owner: body.owner ?? '',
    version: body.version ?? '1.0',
  };
}

export function diffSnapshots(before, after) {
  const changes = {};
  for (const key of Object.values(FIELD_TO_KEY)) {
    const oldVal = before?.[key] ?? '';
    const newVal = after?.[key] ?? '';
    if (String(oldVal) !== String(newVal)) {
      changes[key] = { old: oldVal, new: newVal };
    }
  }
  return changes;
}

export async function logRequirementHistory({
  action,
  requirementId,
  reqId,
  changedBy,
  changes,
  note = null,
}) {
  await insert(`
    INSERT INTO requirement_history
      (requirement_id, req_id, action, changes, note, changed_by, changed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    requirementId ?? null,
    reqId,
    action,
    JSON.stringify(changes ?? {}),
    note,
    changedBy ?? null,
    now(),
  ]);
}

export async function logRequirementIdChange(requirementId, oldReqId, newReqId, changedBy, note) {
  if (oldReqId === newReqId) return;
  await logRequirementHistory({
    action: 'update',
    requirementId,
    reqId: newReqId,
    changedBy,
    changes: { reqId: { old: oldReqId, new: newReqId } },
    note,
  });
}

function parseChanges(raw) {
  if (!raw) return {};
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return {};
  }
}

export function mapHistoryRow(row) {
  return {
    id: row.id,
    requirementId: row.requirement_id,
    reqId: row.req_id,
    action: row.action,
    changes: parseChanges(row.changes),
    note: row.note || null,
    changedBy: row.changed_by,
    changedByName: row.changed_by_name || row.changed_by_username || null,
    changedAt: row.changed_at,
  };
}

export async function fetchRequirementHistory({ requirementId, reqId, limit = 100 } = {}) {
  let sql = `
    SELECT h.*,
      u.display_name AS changed_by_name,
      u.username AS changed_by_username
    FROM requirement_history h
    LEFT JOIN users u ON u.id = h.changed_by
    WHERE 1=1
  `;
  const params = [];

  if (requirementId != null) {
    sql += ` AND h.requirement_id = ?`;
    params.push(requirementId);
  }
  if (reqId) {
    sql += ` AND h.req_id = ?`;
    params.push(reqId);
  }

  sql += ` ORDER BY h.changed_at DESC, h.id DESC LIMIT ?`;
  params.push(Math.min(Math.max(Number(limit) || 100, 1), 500));

  const rows = await query(sql, params);
  return rows.map(mapHistoryRow);
}

export const REQUIREMENT_HISTORY_DDL_SQLITE = `
CREATE TABLE IF NOT EXISTS requirement_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requirement_id INTEGER,
  req_id TEXT NOT NULL,
  action TEXT NOT NULL,
  changes TEXT,
  note TEXT,
  changed_by INTEGER,
  changed_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
)`;

export const REQUIREMENT_HISTORY_DDL_MYSQL = `
CREATE TABLE IF NOT EXISTS requirement_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  requirement_id INT NULL,
  req_id VARCHAR(100) NOT NULL,
  action VARCHAR(20) NOT NULL,
  changes TEXT,
  note VARCHAR(100) NULL,
  changed_by INT NULL,
  changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;

export const REQUIREMENT_HISTORY_DDL_POSTGRES = `
CREATE TABLE IF NOT EXISTS requirement_history (
  id SERIAL PRIMARY KEY,
  requirement_id INT NULL,
  req_id VARCHAR(100) NOT NULL,
  action VARCHAR(20) NOT NULL,
  changes TEXT,
  note VARCHAR(100) NULL,
  changed_by INT REFERENCES users(id) ON DELETE SET NULL,
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;

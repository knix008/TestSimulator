import { insert, query, now } from '../db.js';

const PROJECT_FIELDS = ['code', 'name', 'description', 'status'];

export function projectRowToSnapshot(row) {
  if (!row) return null;
  return {
    code: row.code ?? '',
    name: row.name ?? '',
    description: row.description ?? '',
    status: row.status ?? 'active',
  };
}

export function diffProjectSnapshots(before, after) {
  const changes = {};
  for (const key of PROJECT_FIELDS) {
    const oldVal = before?.[key] ?? '';
    const newVal = after?.[key] ?? '';
    if (String(oldVal) !== String(newVal)) {
      changes[key] = { old: oldVal, new: newVal };
    }
  }
  return changes;
}

export async function logProjectHistory({
  projectId,
  projectCode,
  action,
  changedBy,
  changes,
  note = null,
}) {
  await insert(`
    INSERT INTO project_history
      (project_id, project_code, action, changes, note, changed_by, changed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    projectId,
    projectCode,
    action,
    JSON.stringify(changes ?? {}),
    note,
    changedBy ?? null,
    now(),
  ]);
}

function parseChanges(raw) {
  if (!raw) return {};
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return {};
  }
}

export function mapProjectHistoryRow(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    projectCode: row.project_code,
    action: row.action,
    changes: parseChanges(row.changes),
    note: row.note || null,
    changedBy: row.changed_by,
    changedByName: row.changed_by_name || row.changed_by_username || null,
    changedAt: row.changed_at,
  };
}

export async function fetchProjectHistory({ projectId, limit = 100 } = {}) {
  let sql = `
    SELECT h.*,
      u.display_name AS changed_by_name,
      u.username AS changed_by_username
    FROM project_history h
    LEFT JOIN users u ON u.id = h.changed_by
    WHERE 1=1
  `;
  const params = [];

  if (projectId != null) {
    sql += ` AND h.project_id = ?`;
    params.push(projectId);
  }

  sql += ` ORDER BY h.changed_at DESC, h.id DESC LIMIT ?`;
  params.push(Math.min(Math.max(Number(limit) || 100, 1), 500));

  const rows = await query(sql, params);
  return rows.map(mapProjectHistoryRow);
}

export const PROJECT_HISTORY_DDL_SQLITE = `
CREATE TABLE IF NOT EXISTS project_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  project_code TEXT NOT NULL,
  action TEXT NOT NULL,
  changes TEXT,
  note TEXT,
  changed_by INTEGER,
  changed_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
)`;

export const PROJECT_HISTORY_DDL_MYSQL = `
CREATE TABLE IF NOT EXISTS project_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  project_code VARCHAR(100) NOT NULL,
  action VARCHAR(40) NOT NULL,
  changes TEXT,
  note VARCHAR(255) NULL,
  changed_by INT NULL,
  changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;

export const PROJECT_HISTORY_DDL_POSTGRES = `
CREATE TABLE IF NOT EXISTS project_history (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_code VARCHAR(100) NOT NULL,
  action VARCHAR(40) NOT NULL,
  changes TEXT,
  note VARCHAR(255) NULL,
  changed_by INT REFERENCES users(id) ON DELETE SET NULL,
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;

/** DB schema version for requirements table migrations */
export const REQUIREMENT_SCHEMA_VERSION = 3;

export const REQUIREMENT_SCHEMA_SETTING_KEY = 'requirements_schema_version';

/**
 * Application requirement fields (code = REQ-01, classification = SRS/RFP ID, …)
 * Order matches CREATE TABLE column order.
 */
export const REQUIREMENT_COLUMNS = [
  'id',
  'project_id',
  'code',
  'classification',
  'title',
  'description',
  'category',
  'priority',
  'status',
  'assignee_user_id',
  'created_by_id',
  'created_at',
  'updated_at',
];

export const REQUIREMENTS_CREATE_SQL = `
CREATE TABLE IF NOT EXISTS requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  classification TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK(priority IN ('LOW','MEDIUM','HIGH')),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','APPROVED','IN_PROGRESS','DONE')),
  assignee_user_id INTEGER REFERENCES users(id),
  created_by_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, code)
)`;

export const REQUIREMENTS_INDEX_SQL = [
  'CREATE INDEX IF NOT EXISTS idx_requirements_project ON requirements(project_id)',
  'CREATE INDEX IF NOT EXISTS idx_requirements_status ON requirements(status)',
  'CREATE INDEX IF NOT EXISTS idx_requirements_category ON requirements(category)',
  'CREATE INDEX IF NOT EXISTS idx_requirements_classification ON requirements(project_id, classification)',
  'CREATE INDEX IF NOT EXISTS idx_requirements_assignee ON requirements(assignee_user_id)',
];

/** Columns added after initial release (SQLite ALTER TABLE migrations) */
export const REQUIREMENT_SQLITE_ALTER_MIGRATIONS = [
  {
    version: 2,
    column: 'classification',
    sql: "ALTER TABLE requirements ADD COLUMN classification TEXT NOT NULL DEFAULT ''",
  },
  {
    version: 3,
    column: 'assignee_user_id',
    sql: 'ALTER TABLE requirements ADD COLUMN assignee_user_id INTEGER REFERENCES users(id)',
  },
];

export function mapRequirementRow(row, extra = {}) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    code: row.code,
    classification: row.classification ?? '',
    title: row.title,
    description: row.description ?? '',
    category: row.category ?? '',
    priority: row.priority,
    status: row.status,
    assigneeUserId: row.assignee_user_id ?? null,
    createdById: row.created_by_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...extra,
  };
}

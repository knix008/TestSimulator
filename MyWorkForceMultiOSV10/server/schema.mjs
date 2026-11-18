// The database schema: the tables, the version kept in app_meta, and the steps that bring an older
// database up to date. engine.mjs runs these against a live connection; the same text is offered as
// a SQL script for a DBA who creates the tables by hand.
//
//   {{KEY}}   a primary-key or indexed text column (MySQL and SQL Server cannot index unbounded text)
//   {{TEXT}}  a short text column
//   {{BODY}}  a long text column (JSON, message bodies, files)
//   {{INT}}   an integer column

export const SCHEMA_VERSION = 3;

export const TABLES = [
  { name: 'app_meta', sql: `CREATE TABLE app_meta (
    meta_key {{KEY}} PRIMARY KEY,
    meta_value {{BODY}} NOT NULL
  )` },
  { name: 'workspace_document', sql: `CREATE TABLE workspace_document (
    id {{KEY}} PRIMARY KEY,
    body {{BODY}} NOT NULL,
    saved_at {{TEXT}} NOT NULL
  )` },
  { name: 'documents', sql: `CREATE TABLE documents (
    id {{KEY}} PRIMARY KEY,
    project_id {{KEY}} NOT NULL,
    template_id {{TEXT}} NOT NULL,
    title {{TEXT}} NOT NULL,
    body {{BODY}} NOT NULL,
    author_id {{TEXT}} NOT NULL,
    visibility {{TEXT}} NOT NULL,
    issue_key {{TEXT}} NOT NULL,
    updated_at {{TEXT}} NOT NULL
  )` },
  { name: 'articles', sql: `CREATE TABLE articles (
    id {{KEY}} PRIMARY KEY,
    project_id {{TEXT}} NOT NULL,
    title {{TEXT}} NOT NULL,
    body {{BODY}} NOT NULL,
    published {{INT}} NOT NULL,
    author_id {{TEXT}} NOT NULL,
    updated_at {{TEXT}} NOT NULL
  )` },
  { name: 'calendars', sql: `CREATE TABLE calendars (
    id {{KEY}} PRIMARY KEY,
    name {{TEXT}} NOT NULL,
    timezone {{TEXT}} NOT NULL,
    week_json {{BODY}} NOT NULL,
    holidays_json {{BODY}} NOT NULL
  )` },
  { name: 'approvals', sql: `CREATE TABLE approvals (
    id {{KEY}} PRIMARY KEY,
    project_id {{TEXT}} NOT NULL,
    issue_id {{KEY}} NOT NULL,
    status_id {{TEXT}} NOT NULL,
    requester_id {{TEXT}} NOT NULL,
    approver_id {{TEXT}} NOT NULL,
    state {{TEXT}} NOT NULL,
    note {{BODY}} NOT NULL,
    created_at {{TEXT}} NOT NULL
  )` },
  { name: 'webhooks', sql: `CREATE TABLE webhooks (
    id {{KEY}} PRIMARY KEY,
    url {{TEXT}} NOT NULL,
    events {{TEXT}} NOT NULL,
    secret {{TEXT}} NOT NULL,
    enabled {{INT}} NOT NULL
  )` },
  { name: 'webhook_log', sql: `CREATE TABLE webhook_log (
    id {{KEY}} PRIMARY KEY,
    webhook_id {{TEXT}} NOT NULL,
    event_name {{TEXT}} NOT NULL,
    status_code {{INT}} NOT NULL,
    detail {{BODY}} NOT NULL,
    created_at {{TEXT}} NOT NULL
  )` },
  { name: 'mail_outbox', sql: `CREATE TABLE mail_outbox (
    id {{KEY}} PRIMARY KEY,
    to_addr {{TEXT}} NOT NULL,
    subject {{TEXT}} NOT NULL,
    body {{BODY}} NOT NULL,
    state {{TEXT}} NOT NULL,
    created_at {{TEXT}} NOT NULL
  )` },
  { name: 'api_tokens', sql: `CREATE TABLE api_tokens (
    id {{KEY}} PRIMARY KEY,
    name {{TEXT}} NOT NULL,
    token {{TEXT}} NOT NULL,
    created_at {{TEXT}} NOT NULL
  )` },
  { name: 'accounts', sql: `CREATE TABLE accounts (
    id {{KEY}} PRIMARY KEY,
    name {{TEXT}} NOT NULL,
    email {{TEXT}} NOT NULL,
    password_hash {{TEXT}} NOT NULL,
    active {{INT}} NOT NULL
  )` },
  { name: 'chat_rooms', sql: `CREATE TABLE chat_rooms (
    id {{KEY}} PRIMARY KEY,
    name {{TEXT}} NOT NULL,
    kind {{TEXT}} NOT NULL,
    created_at {{TEXT}} NOT NULL
  )` },
  { name: 'chat_members', sql: `CREATE TABLE chat_members (
    room_id {{KEY}} NOT NULL,
    user_id {{KEY}} NOT NULL,
    last_read {{TEXT}} NOT NULL,
    PRIMARY KEY (room_id, user_id)
  )` },
  { name: 'chat_messages', sql: `CREATE TABLE chat_messages (
    id {{KEY}} PRIMARY KEY,
    room_id {{KEY}} NOT NULL,
    user_id {{TEXT}} NOT NULL,
    kind {{TEXT}} NOT NULL,
    body {{BODY}} NOT NULL,
    file_id {{TEXT}} NOT NULL,
    file_name {{TEXT}} NOT NULL,
    created_at {{KEY}} NOT NULL
  )` },
  { name: 'chat_checks', sql: `CREATE TABLE chat_checks (
    message_id {{KEY}} NOT NULL,
    user_id {{KEY}} NOT NULL,
    checked_at {{TEXT}} NOT NULL,
    PRIMARY KEY (message_id, user_id)
  )` },
  { name: 'chat_files', sql: `CREATE TABLE chat_files (
    id {{KEY}} PRIMARY KEY,
    name {{TEXT}} NOT NULL,
    mime {{TEXT}} NOT NULL,
    size_bytes {{INT}} NOT NULL,
    data {{BODY}} NOT NULL,
    created_at {{TEXT}} NOT NULL
  )` },
  { name: 'issue_index', sql: `CREATE TABLE issue_index (
    id {{KEY}} PRIMARY KEY,
    project_id {{KEY}} NOT NULL,
    issue_key {{TEXT}} NOT NULL,
    summary {{TEXT}} NOT NULL,
    type_id {{TEXT}} NOT NULL,
    status_id {{TEXT}} NOT NULL,
    assignee_id {{TEXT}} NOT NULL
  )` },
  // Every change to administrator rights and accounts, kept as a log (who, when, what). Detail is sealed.
  { name: 'audit_log', sql: `CREATE TABLE audit_log (
    id {{KEY}} PRIMARY KEY,
    created_at {{KEY}} NOT NULL,
    category {{TEXT}} NOT NULL,
    actor_id {{TEXT}} NOT NULL,
    actor_login {{TEXT}} NOT NULL,
    action {{TEXT}} NOT NULL,
    target_id {{TEXT}} NOT NULL,
    detail {{BODY}} NOT NULL,
    source {{TEXT}} NOT NULL
  )` },
];

export const TABLE_NAMES = TABLES.map((table) => table.name);

/** Indexes added in schema version 2. */
export const INDEXES = [
  { name: 'ix_issue_index_project', table: 'issue_index', columns: ['project_id'] },
  { name: 'ix_documents_project', table: 'documents', columns: ['project_id'] },
  { name: 'ix_approvals_issue', table: 'approvals', columns: ['issue_id'] },
  { name: 'ix_chat_messages_room', table: 'chat_messages', columns: ['room_id', 'created_at'] },
  { name: 'ix_audit_log_at', table: 'audit_log', columns: ['created_at'], version: 3 },
];

/** What each version adds. Version 1 is the tables themselves. */
export const MIGRATIONS = [
  { version: 1, ko: '기본 표', en: 'Base tables', statements: () => [] },
  { version: 2, ko: '조회 색인', en: 'Lookup indexes', statements: () => INDEXES.filter((index) => !index.version).map((index) => `CREATE INDEX ${index.name} ON ${index.table} (${index.columns.join(', ')})`) },
  { version: 3, ko: '관리 기록', en: 'Administration log', statements: () => INDEXES.filter((index) => index.version === 3).map((index) => `CREATE INDEX ${index.name} ON ${index.table} (${index.columns.join(', ')})`) },
];

function types(engine) {
  if (engine === 'mssql') return { KEY: 'NVARCHAR(191)', TEXT: 'NVARCHAR(4000)', BODY: 'NVARCHAR(MAX)', INT: 'INT' };
  if (engine === 'mysql' || engine === 'mariadb') return { KEY: 'VARCHAR(191)', TEXT: 'TEXT', BODY: 'MEDIUMTEXT', INT: 'INTEGER' };
  return { KEY: 'TEXT', TEXT: 'TEXT', BODY: 'TEXT', INT: 'INTEGER' };
}

/** One table's CREATE TABLE for the engine (no IF NOT EXISTS: engine.mjs creates only missing tables). */
export function createTable(engine, table) {
  const map = types(engine);
  return table.sql.replace(/\{\{(KEY|TEXT|BODY|INT)\}\}/g, (_, kind) => map[kind]);
}

/** The CREATE TABLE statements, safe to run again (used by the SQL script and older callers). */
export function schemaFor(engine) {
  return TABLES.map((table) => {
    const sql = createTable(engine, table);
    if (engine === 'mssql') return `IF OBJECT_ID(N'${table.name}', N'U') IS NULL\n${sql}`;
    return sql.replace(/^CREATE TABLE /, 'CREATE TABLE IF NOT EXISTS ');
  });
}

/** The statement that lists the tables in the connected database (each row has `name`). */
export function listTablesSql(engine) {
  if (engine === 'sqlite') return "SELECT name FROM sqlite_master WHERE type = 'table'";
  if (engine === 'mysql' || engine === 'mariadb') return 'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()';
  if (engine === 'postgres') return 'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = current_schema()';
  return "SELECT name FROM sys.tables WHERE type = 'U'";
}

/** The whole schema as one script a DBA can run: tables, indexes and the version row. */
export function schemaScript(engine) {
  const end = engine === 'mssql' ? '\nGO' : ';';
  const lines = [`-- MyWorkForce schema version ${SCHEMA_VERSION} for ${engine}`, ''];
  for (const statement of schemaFor(engine)) lines.push(`${statement}${end}`, '');
  for (const index of INDEXES) {
    const create = `CREATE INDEX ${index.name} ON ${index.table} (${index.columns.join(', ')})`;
    if (engine === 'mssql') lines.push(`IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'${index.name}')\n${create}${end}`);
    else if (engine === 'mysql') lines.push(`${create}${end}`);
    else lines.push(`${create.replace(/^CREATE INDEX /, 'CREATE INDEX IF NOT EXISTS ')}${end}`);
  }
  lines.push('');
  lines.push(`DELETE FROM app_meta WHERE meta_key = 'schema_version'${end}`);
  lines.push(`INSERT INTO app_meta (meta_key, meta_value) VALUES ('schema_version', '${SCHEMA_VERSION}')${end}`);
  return `${lines.join('\n')}\n`;
}

/** Whether a failed CREATE INDEX only means the index is already there. */
export function alreadyExists(error) {
  return /already exists|duplicate key name|exists in table|already an object named|1061/i.test(`${error?.message || ''} ${error?.code || ''} ${error?.errno || ''}`);
}

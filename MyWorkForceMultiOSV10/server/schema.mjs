const TABLES = [
  `CREATE TABLE IF NOT EXISTS app_meta (
    meta_key {{TEXT}} PRIMARY KEY,
    meta_value {{TEXT}} NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS workspace_document (
    id {{TEXT}} PRIMARY KEY,
    body {{BODY}} NOT NULL,
    saved_at {{TEXT}} NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS documents (
    id {{TEXT}} PRIMARY KEY,
    project_id {{TEXT}} NOT NULL,
    template_id {{TEXT}} NOT NULL,
    title {{TEXT}} NOT NULL,
    body {{BODY}} NOT NULL,
    author_id {{TEXT}} NOT NULL,
    visibility {{TEXT}} NOT NULL,
    issue_key {{TEXT}} NOT NULL,
    updated_at {{TEXT}} NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS articles (
    id {{TEXT}} PRIMARY KEY,
    project_id {{TEXT}} NOT NULL,
    title {{TEXT}} NOT NULL,
    body {{BODY}} NOT NULL,
    published {{INT}} NOT NULL,
    author_id {{TEXT}} NOT NULL,
    updated_at {{TEXT}} NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS calendars (
    id {{TEXT}} PRIMARY KEY,
    name {{TEXT}} NOT NULL,
    timezone {{TEXT}} NOT NULL,
    week_json {{BODY}} NOT NULL,
    holidays_json {{BODY}} NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS approvals (
    id {{TEXT}} PRIMARY KEY,
    project_id {{TEXT}} NOT NULL,
    issue_id {{TEXT}} NOT NULL,
    status_id {{TEXT}} NOT NULL,
    requester_id {{TEXT}} NOT NULL,
    approver_id {{TEXT}} NOT NULL,
    state {{TEXT}} NOT NULL,
    note {{TEXT}} NOT NULL,
    created_at {{TEXT}} NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS webhooks (
    id {{TEXT}} PRIMARY KEY,
    url {{TEXT}} NOT NULL,
    events {{TEXT}} NOT NULL,
    secret {{TEXT}} NOT NULL,
    enabled {{INT}} NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS webhook_log (
    id {{TEXT}} PRIMARY KEY,
    webhook_id {{TEXT}} NOT NULL,
    event_name {{TEXT}} NOT NULL,
    status_code {{INT}} NOT NULL,
    detail {{TEXT}} NOT NULL,
    created_at {{TEXT}} NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS mail_outbox (
    id {{TEXT}} PRIMARY KEY,
    to_addr {{TEXT}} NOT NULL,
    subject {{TEXT}} NOT NULL,
    body {{BODY}} NOT NULL,
    state {{TEXT}} NOT NULL,
    created_at {{TEXT}} NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS api_tokens (
    id {{TEXT}} PRIMARY KEY,
    name {{TEXT}} NOT NULL,
    token {{TEXT}} NOT NULL,
    created_at {{TEXT}} NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS accounts (
    id {{TEXT}} PRIMARY KEY,
    name {{TEXT}} NOT NULL,
    email {{TEXT}} NOT NULL,
    password_hash {{TEXT}} NOT NULL,
    active {{INT}} NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS chat_rooms (
    id {{TEXT}} PRIMARY KEY,
    name {{TEXT}} NOT NULL,
    kind {{TEXT}} NOT NULL,
    created_at {{TEXT}} NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS chat_members (
    room_id {{TEXT}} NOT NULL,
    user_id {{TEXT}} NOT NULL,
    last_read {{TEXT}} NOT NULL,
    PRIMARY KEY (room_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS chat_messages (
    id {{TEXT}} PRIMARY KEY,
    room_id {{TEXT}} NOT NULL,
    user_id {{TEXT}} NOT NULL,
    kind {{TEXT}} NOT NULL,
    body {{BODY}} NOT NULL,
    file_id {{TEXT}} NOT NULL,
    file_name {{TEXT}} NOT NULL,
    created_at {{TEXT}} NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS chat_checks (
    message_id {{TEXT}} NOT NULL,
    user_id {{TEXT}} NOT NULL,
    checked_at {{TEXT}} NOT NULL,
    PRIMARY KEY (message_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS chat_files (
    id {{TEXT}} PRIMARY KEY,
    name {{TEXT}} NOT NULL,
    mime {{TEXT}} NOT NULL,
    size_bytes {{INT}} NOT NULL,
    data {{BODY}} NOT NULL,
    created_at {{TEXT}} NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS issue_index (
    id {{TEXT}} PRIMARY KEY,
    project_id {{TEXT}} NOT NULL,
    issue_key {{TEXT}} NOT NULL,
    summary {{TEXT}} NOT NULL,
    type_id {{TEXT}} NOT NULL,
    status_id {{TEXT}} NOT NULL,
    assignee_id {{TEXT}} NOT NULL
  )`,
];

export function schemaFor(engine) {
  const text = engine === 'mssql' ? 'NVARCHAR(4000)' : 'TEXT';
  const body = engine === 'mssql' ? 'NVARCHAR(MAX)' : (engine === 'mysql' || engine === 'mariadb' ? 'MEDIUMTEXT' : 'TEXT');
  const integer = engine === 'mssql' ? 'INT' : 'INTEGER';
  return TABLES.map((sql) => sql.replaceAll('{{BODY}}', body).replaceAll('{{TEXT}}', text).replaceAll('{{INT}}', integer));
}

// The tables, in a dialect-neutral form (ARCHITECTURE §3).
//
// Column spec string: '<type>[!][=<default>]'
//   type    id | string(n) | text | int | bigint | float | bool | json | blob
//   !       NOT NULL
//   =v      default used by Db.insert() when the value is missing (not a DB default — keeps DDL simple everywhere)
// Table options: pk (array, default ['id']), unique: [[cols]], indexes: [[cols]].
// Order matters: copy-all-data and export walk tables in this order.

/** @typedef {{ name: string, type: string, size?: number, notNull: boolean, default?: any }} Column */
/** @typedef {{ name: string, columns: Column[], pk: string[], unique: string[][], indexes: string[][], mutable: boolean }} Table */

// 2: resolutions.icon/color (the default resolutions get theirs), components.default_assignee_id,
//    custom_fields.default_value/issue_type_ids, workflows.layout
// board_columns.icon is filled by migrate() whenever a column has none (no version step: any DB, any time).
export const SCHEMA_VERSION = 2;

const T = {
  meta: [{ key: 'string(64)!', value: 'text' }, { pk: ['key'] }],
  app_settings: [{ key: 'string(64)!', value: 'json', updated_at: 'bigint' }, { pk: ['key'] }],

  users: [{
    id: 'id!', username: 'string(64)!', display_name: 'string(200)!', email: 'string(191)', password_hash: 'string(255)',
    avatar: 'string(255)', role: 'string(16)!=user', active: 'bool!=1', prefs: 'json', created_at: 'bigint!', updated_at: 'bigint!', rev: 'int!=1',
  }, { unique: [['username']] }],
  sessions: [{ token: 'string(64)!', user_id: 'id!', expires_at: 'bigint!', created_at: 'bigint!' }, { pk: ['token'], indexes: [['user_id']] }],
  icons: [{
    id: 'id!', kind: 'string(16)!=upload', name: 'string(200)!', mime: 'string(100)!', data: 'blob', width: 'int', height: 'int',
    created_by: 'id', created_at: 'bigint!', updated_at: 'bigint!',
  }, {}],

  priorities: [{ id: 'id!', name: 'string(100)!', icon: 'string(255)', color: 'string(16)', position: 'int!=0', created_at: 'bigint!', updated_at: 'bigint!', rev: 'int!=1' }, {}],
  resolutions: [{ id: 'id!', name: 'string(100)!', description: 'text', icon: 'string(255)', color: 'string(16)', position: 'int!=0', created_at: 'bigint!', updated_at: 'bigint!', rev: 'int!=1' }, {}],

  projects: [{
    id: 'id!', key: 'string(10)!', name: 'string(200)!', description: 'text', icon: 'string(255)', color: 'string(16)', lead_id: 'id',
    issue_seq: 'int!=0', default_assignee_id: 'id', archived: 'bool!=0', template: 'string(32)', created_at: 'bigint!', updated_at: 'bigint!', rev: 'int!=1',
  }, { unique: [['key']] }],
  project_members: [{ project_id: 'id!', user_id: 'id!', role: 'string(16)!=member', created_at: 'bigint!' }, { pk: ['project_id', 'user_id'], indexes: [['user_id']] }],
  // a project's earlier keys (after a key rename): they keep resolving and no other project may take them
  project_key_aliases: [{ key: 'string(10)!', project_id: 'id!', created_at: 'bigint!' }, { pk: ['key'], indexes: [['project_id']] }],

  workflows: [{ id: 'id!', project_id: 'id!', name: 'string(200)!', initial_status_id: 'id', layout: 'json', created_at: 'bigint!', updated_at: 'bigint!', rev: 'int!=1' }, { indexes: [['project_id']] }],
  statuses: [{
    id: 'id!', project_id: 'id!', name: 'string(100)!', category: 'string(16)!=todo', color: 'string(16)', position: 'int!=0',
    created_at: 'bigint!', updated_at: 'bigint!', rev: 'int!=1',
  }, { indexes: [['project_id']] }],
  transitions: [{
    id: 'id!', workflow_id: 'id!', name: 'string(200)!', from_status_id: 'id', to_status_id: 'id!', rules: 'json', position: 'int!=0',
    created_at: 'bigint!', updated_at: 'bigint!', rev: 'int!=1',
  }, { indexes: [['workflow_id']] }],
  issue_types: [{
    id: 'id!', project_id: 'id!', name: 'string(100)!', icon: 'string(255)', color: 'string(16)', level: 'int!=0', workflow_id: 'id',
    position: 'int!=0', created_at: 'bigint!', updated_at: 'bigint!', rev: 'int!=1',
  }, { indexes: [['project_id']] }],
  components: [{
    id: 'id!', project_id: 'id!', name: 'string(100)!', description: 'text', lead_id: 'id', icon: 'string(255)', default_assignee_id: 'id',
    created_at: 'bigint!', updated_at: 'bigint!', rev: 'int!=1',
  }, { indexes: [['project_id']] }],
  versions: [{
    id: 'id!', project_id: 'id!', name: 'string(100)!', description: 'text', start_date: 'string(10)', release_date: 'string(10)',
    released: 'bool!=0', archived: 'bool!=0', position: 'int!=0', created_at: 'bigint!', updated_at: 'bigint!', rev: 'int!=1',
  }, { indexes: [['project_id']] }],
  custom_fields: [{
    id: 'id!', project_id: 'id', name: 'string(100)!', type: 'string(16)!=text', options: 'json', required: 'bool!=0', position: 'int!=0',
    description: 'text', default_value: 'json', issue_type_ids: 'json', created_at: 'bigint!', updated_at: 'bigint!', rev: 'int!=1',
  }, {}],

  issues: [{
    id: 'id!', project_id: 'id!', number: 'int!', key: 'string(32)!', type_id: 'id!', status_id: 'id!', resolution_id: 'id', priority_id: 'id',
    summary: 'string(500)!', description: 'text', assignee_id: 'id', reporter_id: 'id', parent_id: 'id', epic_id: 'id',
    story_points: 'float', original_estimate: 'int', remaining_estimate: 'int', time_spent: 'int!=0',
    due_date: 'string(10)', start_date: 'string(10)', rank: 'string(80)!', color: 'string(16)', cover: 'json', icon: 'string(255)',
    flagged: 'bool!=0', archived: 'bool!=0', resolved_at: 'bigint', status_changed_at: 'bigint',
    created_at: 'bigint!', updated_at: 'bigint!', rev: 'int!=1',
  }, {
    unique: [['key']],
    indexes: [['project_id', 'rank'], ['status_id'], ['assignee_id'], ['parent_id'], ['epic_id'], ['updated_at']],
  }],
  // an issue's earlier keys (project key rename, move to another project); never equal to a live issues.key
  issue_key_aliases: [{ key: 'string(32)!', issue_id: 'id!', created_at: 'bigint!' }, { pk: ['key'], indexes: [['issue_id']] }],
  issue_labels: [{ issue_id: 'id!', label: 'string(100)!' }, { pk: ['issue_id', 'label'], indexes: [['label']] }],
  issue_components: [{ issue_id: 'id!', component_id: 'id!' }, { pk: ['issue_id', 'component_id'], indexes: [['component_id']] }],
  issue_versions: [{ issue_id: 'id!', version_id: 'id!', kind: 'string(8)!=fix' }, { pk: ['issue_id', 'version_id', 'kind'], indexes: [['version_id']] }],
  issue_watchers: [{ issue_id: 'id!', user_id: 'id!', created_at: 'bigint!' }, { pk: ['issue_id', 'user_id'], indexes: [['user_id']] }],
  issue_votes: [{ issue_id: 'id!', user_id: 'id!', created_at: 'bigint!' }, { pk: ['issue_id', 'user_id'] }],
  issue_links: [{ id: 'id!', source_id: 'id!', target_id: 'id!', kind: 'string(16)!=relates', created_by: 'id', created_at: 'bigint!' }, { indexes: [['source_id'], ['target_id']] }],
  // value = JSON of the typed value; text_value / num_value are query columns (lower-cased text, '|a|b|' for multi values)
  custom_values: [{ issue_id: 'id!', field_id: 'id!', value: 'json', text_value: 'string(191)', num_value: 'float' }, { pk: ['issue_id', 'field_id'], indexes: [['field_id']] }],
  checklist_items: [{ id: 'id!', issue_id: 'id!', text: 'string(500)!', done: 'bool!=0', position: 'string(80)!', created_at: 'bigint!', updated_at: 'bigint!', rev: 'int!=1' }, { indexes: [['issue_id']] }],
  comments: [{ id: 'id!', issue_id: 'id!', author_id: 'id', body: 'text!', created_at: 'bigint!', updated_at: 'bigint!', rev: 'int!=1' }, { indexes: [['issue_id']] }],
  attachments: [{ id: 'id!', issue_id: 'id!', file_name: 'string(255)!', mime: 'string(100)!', size: 'bigint!=0', data: 'blob', author_id: 'id', created_at: 'bigint!' }, { indexes: [['issue_id']] }],
  worklogs: [{ id: 'id!', issue_id: 'id!', author_id: 'id', started_at: 'bigint!', seconds: 'int!', comment: 'text', created_at: 'bigint!', updated_at: 'bigint!', rev: 'int!=1' }, { indexes: [['issue_id']] }],
  issue_history: [{
    id: 'id!', issue_id: 'id!', user_id: 'id', field: 'string(64)!', from_value: 'text', to_value: 'text', from_label: 'text', to_label: 'text', at: 'bigint!',
  }, { indexes: [['issue_id', 'at'], ['field', 'at']] }],

  boards: [{
    id: 'id!', project_id: 'id', name: 'string(200)!', icon: 'string(255)', filter_jql: 'text', settings: 'json', created_by: 'id',
    created_at: 'bigint!', updated_at: 'bigint!', rev: 'int!=1',
  }, { indexes: [['project_id']] }],
  board_columns: [{
    id: 'id!', board_id: 'id!', name: 'string(100)!', icon: 'string(255)', position: 'int!=0', wip_min: 'int', wip_max: 'int', status_ids: 'json',
    created_at: 'bigint!', updated_at: 'bigint!', rev: 'int!=1',
  }, { indexes: [['board_id']] }],
  swimlanes: [{ id: 'id!', board_id: 'id!', name: 'string(100)!', jql: 'text', position: 'int!=0', created_at: 'bigint!', updated_at: 'bigint!', rev: 'int!=1' }, { indexes: [['board_id']] }],
  quick_filters: [{ id: 'id!', board_id: 'id!', name: 'string(100)!', jql: 'text', icon: 'string(255)', position: 'int!=0', created_at: 'bigint!', updated_at: 'bigint!', rev: 'int!=1' }, { indexes: [['board_id']] }],
  card_colors: [{ id: 'id!', board_id: 'id!', jql: 'text', color: 'string(16)!', position: 'int!=0', created_at: 'bigint!', updated_at: 'bigint!', rev: 'int!=1' }, { indexes: [['board_id']] }],
  saved_filters: [{
    id: 'id!', owner_id: 'id', name: 'string(200)!', jql: 'text!', shared: 'bool!=0', favourite: 'bool!=0', icon: 'string(255)',
    created_at: 'bigint!', updated_at: 'bigint!', rev: 'int!=1',
  }, { indexes: [['owner_id']] }],
  dashboards: [{ id: 'id!', owner_id: 'id', name: 'string(200)!', icon: 'string(255)', shared: 'bool!=0', layout: 'json', created_at: 'bigint!', updated_at: 'bigint!', rev: 'int!=1' }, { indexes: [['owner_id']] }],
  automation_rules: [{
    id: 'id!', project_id: 'id!', name: 'string(200)!', enabled: 'bool!=1', trigger: 'json!', conditions: 'json', actions: 'json!',
    run_count: 'int!=0', last_run_at: 'bigint', last_error: 'text', created_by: 'id', created_at: 'bigint!', updated_at: 'bigint!', rev: 'int!=1',
  }, { indexes: [['project_id']] }],
  notifications: [{ id: 'id!', user_id: 'id!', issue_id: 'id', kind: 'string(32)!', payload: 'json', read: 'bool!=0', created_at: 'bigint!' }, { indexes: [['user_id', 'created_at']] }],
  change_log: [{ seq: 'string(32)!', topic: 'string(64)!', type: 'string(64)!', payload: 'json', at: 'bigint!' }, { pk: ['seq'], indexes: [['at']] }],
};

/** @param {string} spec */
function parseColumn(name, spec) {
  const m = /^(\w+)(?:\((\d+)\))?(!)?(?:=(.*))?$/.exec(spec);
  if (!m) throw new Error(`bad column spec ${name}: ${spec}`);
  const col = { name, type: m[1], notNull: !!m[3] };
  if (m[2]) col.size = Number(m[2]);
  if (m[4] !== undefined) col.default = /^-?\d+(\.\d+)?$/.test(m[4]) ? Number(m[4]) : m[4];
  return col;
}

/** @type {Table[]} */
export const TABLES = Object.entries(T).map(([name, [cols, opts]]) => {
  const columns = Object.entries(cols).map(([c, spec]) => parseColumn(c, spec));
  return {
    name,
    columns,
    pk: opts.pk || ['id'],
    unique: opts.unique || [],
    indexes: opts.indexes || [],
    mutable: columns.some((c) => c.name === 'rev'),
  };
});

/** @type {Record<string, Table>} */
export const TABLE = Object.fromEntries(TABLES.map((t) => [t.name, t]));

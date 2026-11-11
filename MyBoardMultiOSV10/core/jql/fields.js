// The field catalogue: names, aliases, kinds, operators and how each maps to SQL columns / issue properties.
//
// kinds
//   ref       single-valued reference to a lookup table (matched by id or by name/key, case-insensitive)
//   category  status category through statuses.category
//   key       issue key (KAN-12) or id; > < compare the number inside one project
//   multi     multi-valued (labels, components, versions)
//   datetime  epoch-ms column
//   date      'YYYY-MM-DD' text column
//   text      text column (= exact, ~ contains)
//   alltext   summary + description + key (~ only)
//   number    numeric column
//   bool      0/1 column
//   custom    custom field (resolved per field type)

const EQ = ['=', '!=', 'in', 'not in'];
const EMPTY = ['is empty', 'is not empty'];
const CMP = ['>', '>=', '<', '<='];
const LIKE = ['~', '!~'];

/**
 * @typedef {{ name: string, aliases: string[], kind: string, ops: string[], column?: string, prop?: string,
 *   nullable?: boolean, lookup?: { table: string, cols: Array<[string, string]> }, multi?: object,
 *   order?: boolean, detail: string, valueType: string }} FieldDef
 */

/** @type {FieldDef[]} */
export const FIELDS = [
  { name: 'project', aliases: [], kind: 'ref', column: 'project_id', prop: 'project', nullable: false, ops: EQ, order: true,
    lookup: { table: 'projects', cols: [['id', 'id'], ['key', 'key'], ['name', 'name']] }, detail: 'Project key or name', valueType: 'project' },
  { name: 'key', aliases: ['issuekey', 'issue'], kind: 'key', ops: [...EQ, ...CMP], order: true, detail: 'Issue key, e.g. KAN-12', valueType: 'issue' },
  { name: 'type', aliases: ['issuetype'], kind: 'ref', column: 'type_id', prop: 'type', nullable: false, ops: EQ, order: true,
    lookup: { table: 'issue_types', cols: [['id', 'id'], ['name', 'name']] }, detail: 'Issue type', valueType: 'type' },
  { name: 'status', aliases: [], kind: 'ref', column: 'status_id', prop: 'status', nullable: false, ops: EQ, order: true,
    lookup: { table: 'statuses', cols: [['id', 'id'], ['name', 'name']] }, detail: 'Workflow status', valueType: 'status' },
  { name: 'statusCategory', aliases: ['category'], kind: 'category', ops: EQ, detail: 'To Do, In Progress or Done', valueType: 'statusCategory' },
  { name: 'priority', aliases: [], kind: 'ref', column: 'priority_id', prop: 'priority', nullable: true, ops: [...EQ, ...CMP, ...EMPTY], order: true,
    lookup: { table: 'priorities', cols: [['id', 'id'], ['name', 'name']] }, detail: 'Priority (> means higher)', valueType: 'priority' },
  { name: 'assignee', aliases: [], kind: 'ref', column: 'assignee_id', prop: 'assignee', nullable: true, ops: [...EQ, ...EMPTY], order: true,
    lookup: { table: 'users', cols: [['id', 'id'], ['username', 'username'], ['display_name', 'displayName']] }, detail: 'Assigned user', valueType: 'user' },
  { name: 'reporter', aliases: [], kind: 'ref', column: 'reporter_id', prop: 'reporter', nullable: true, ops: [...EQ, ...EMPTY], order: true,
    lookup: { table: 'users', cols: [['id', 'id'], ['username', 'username'], ['display_name', 'displayName']] }, detail: 'Reporting user', valueType: 'user' },
  { name: 'labels', aliases: ['label'], kind: 'multi', ops: [...EQ, ...LIKE, ...EMPTY], multi: { type: 'labels' }, detail: 'Labels', valueType: 'label' },
  { name: 'component', aliases: ['components'], kind: 'multi', ops: [...EQ, ...EMPTY], multi: { type: 'component' }, detail: 'Components', valueType: 'component' },
  { name: 'fixVersion', aliases: ['fixversions'], kind: 'multi', ops: [...EQ, ...EMPTY], multi: { type: 'version', kind: 'fix', prop: 'fixVersions' }, detail: 'Fix version', valueType: 'version' },
  { name: 'affectedVersion', aliases: ['affectedversions', 'affectsversion'], kind: 'multi', ops: [...EQ, ...EMPTY], multi: { type: 'version', kind: 'affects', prop: 'affectedVersions' }, detail: 'Affected version', valueType: 'version' },
  { name: 'resolution', aliases: [], kind: 'ref', column: 'resolution_id', prop: 'resolution', nullable: true, ops: [...EQ, ...EMPTY], order: false,
    lookup: { table: 'resolutions', cols: [['id', 'id'], ['name', 'name']] }, detail: 'Resolution (EMPTY = unresolved)', valueType: 'resolution' },
  { name: 'created', aliases: ['createddate'], kind: 'datetime', column: 'created_at', prop: 'created', nullable: false, ops: ['=', '!=', ...CMP], order: true, detail: 'Created date', valueType: 'date' },
  { name: 'updated', aliases: ['updateddate'], kind: 'datetime', column: 'updated_at', prop: 'updated', nullable: false, ops: ['=', '!=', ...CMP], order: true, detail: 'Updated date', valueType: 'date' },
  { name: 'resolved', aliases: ['resolutiondate'], kind: 'datetime', column: 'resolved_at', prop: 'resolved', nullable: true, ops: ['=', '!=', ...CMP, ...EMPTY], order: true, detail: 'Resolved date', valueType: 'date' },
  { name: 'due', aliases: ['duedate'], kind: 'date', column: 'due_date', prop: 'due', nullable: true, ops: ['=', '!=', ...CMP, ...EMPTY], order: true, detail: 'Due date', valueType: 'date' },
  { name: 'summary', aliases: [], kind: 'text', column: 'summary', prop: 'summary', nullable: false, ops: ['=', '!=', ...LIKE], order: true, detail: 'Summary text', valueType: 'text' },
  { name: 'description', aliases: [], kind: 'text', column: 'description', prop: 'description', nullable: true, ops: ['=', '!=', ...LIKE, ...EMPTY], detail: 'Description text', valueType: 'text' },
  { name: 'text', aliases: [], kind: 'alltext', ops: LIKE, detail: 'Summary, description or key', valueType: 'text' },
  { name: 'epic', aliases: ['epiclink'], kind: 'ref', column: 'epic_id', prop: 'epic', nullable: true, ops: [...EQ, ...EMPTY],
    lookup: { table: 'issues', cols: [['id', 'id'], ['key', 'key']] }, detail: 'Epic key', valueType: 'epic' },
  { name: 'parent', aliases: [], kind: 'ref', column: 'parent_id', prop: 'parent', nullable: true, ops: [...EQ, ...EMPTY],
    lookup: { table: 'issues', cols: [['id', 'id'], ['key', 'key']] }, detail: 'Parent issue key', valueType: 'issue' },
  { name: 'flagged', aliases: [], kind: 'bool', column: 'flagged', prop: 'flagged', nullable: false, ops: ['=', '!='], detail: 'true or false', valueType: 'bool' },
  { name: 'storyPoints', aliases: ['storypoint', 'points'], kind: 'number', column: 'story_points', prop: 'storyPoints', nullable: true, ops: ['=', '!=', 'in', 'not in', ...CMP, ...EMPTY], order: true, detail: 'Story points', valueType: 'number' },
  { name: 'rank', aliases: [], kind: 'orderOnly', ops: [], order: true, detail: 'Board order', valueType: 'none' },
];

/** Normalise a field name for lookup: lower case, no spaces/underscores/dashes. */
export const normName = (s) => String(s).toLowerCase().replace(/[\s_-]+/g, '');

const BY_NAME = new Map();
for (const f of FIELDS) {
  BY_NAME.set(normName(f.name), f);
  for (const a of f.aliases) BY_NAME.set(normName(a), f);
}

/** Custom field types → kind and operators. */
export const CUSTOM_OPS = {
  text: ['=', '!=', '~', '!~', 'is empty', 'is not empty'],
  textarea: ['~', '!~', 'is empty', 'is not empty'],
  url: ['=', '!=', '~', '!~', 'is empty', 'is not empty'],
  number: ['=', '!=', 'in', 'not in', '>', '>=', '<', '<=', 'is empty', 'is not empty'],
  date: ['=', '!=', '>', '>=', '<', '<=', 'is empty', 'is not empty'],
  select: ['=', '!=', 'in', 'not in', 'is empty', 'is not empty'],
  multiselect: ['=', '!=', 'in', 'not in', 'is empty', 'is not empty'],
  labels: ['=', '!=', 'in', 'not in', '~', '!~', 'is empty', 'is not empty'],
  user: ['=', '!=', 'in', 'not in', 'is empty', 'is not empty'],
  checkbox: ['=', '!='],
};

/**
 * Find a field definition. Built-ins win unless the name was quoted and matches a custom field exactly.
 * @param {string} name
 * @param {Array<{id:string,name:string,type:string,options?:any[]}>} customFields
 * @param {boolean} [quoted]
 * @returns {FieldDef|null}
 */
export function findField(name, customFields = [], quoted = false) {
  const m = /^cf\[([^\]]*)\]$/i.exec(name);
  if (m) {
    const cf = customFields.find((f) => String(f.id) === m[1]);
    return cf ? customFieldDef(cf) : null;
  }
  const lower = String(name).trim().toLowerCase();
  if (quoted) {
    const cf = customFields.find((f) => String(f.name).trim().toLowerCase() === lower);
    if (cf) return customFieldDef(cf);
  }
  const b = BY_NAME.get(normName(name));
  if (b) return b;
  const cf = customFields.find((f) => String(f.name).trim().toLowerCase() === lower) ||
    customFields.find((f) => normName(f.name) === normName(name));
  return cf ? customFieldDef(cf) : null;
}

function customFieldDef(cf) {
  const type = CUSTOM_OPS[cf.type] ? cf.type : 'text';
  return { name: cf.name, aliases: [], kind: 'custom', cf: { ...cf, type }, ops: CUSTOM_OPS[type], order: false,
    detail: `Custom field (${type})`, valueType: type === 'user' ? 'user' : type === 'select' || type === 'multiselect' ? 'option' : type };
}

/** Fields usable in ORDER BY. */
export const ORDER_FIELDS = FIELDS.filter((f) => f.order).map((f) => f.name);

/** Human label of an operator for messages / suggestions. */
export const OP_LABEL = { '=': '=', '!=': '!=', '>': '>', '>=': '>=', '<': '<', '<=': '<=', '~': '~', '!~': '!~', in: 'IN', 'not in': 'NOT IN', 'is empty': 'IS EMPTY', 'is not empty': 'IS NOT EMPTY' };

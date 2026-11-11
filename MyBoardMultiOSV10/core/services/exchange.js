// Export / import: .myboard project files (JSON with icons + attachments), CSV (with column mapping) both ways,
// and board JSON exported from a well-known card board service (lists/cards/checklists/comments).
import { newId } from '../ids.js';
import { AppError, ValidationError, check } from '../errors.js';
import { TABLE } from '../db/schema.js';
import { requireUser, assertProject, emit, nowOf, parseJson, toApi, today } from './common.js';
import { parseCsv, formatCsv, detectDelimiter } from './csv.js';
import { parseTimeSpent } from './parts.js';
import { VERSION } from '../version.js';
import { importCardBoard } from './import/trello.js';

/** Project tables in insert order, each with how to select the project's rows. */
const PROJECT_TABLES = [
  ['statuses', 'project'], ['workflows', 'project'], ['transitions', 'workflow'], ['issue_types', 'project'], ['components', 'project'],
  ['versions', 'project'], ['custom_fields', 'project'], ['issues', 'project'], ['issue_labels', 'issue'], ['issue_components', 'issue'],
  ['issue_versions', 'issue'], ['issue_watchers', 'issue'], ['issue_votes', 'issue'], ['issue_links', 'link'], ['custom_values', 'issue'],
  ['checklist_items', 'issue'], ['comments', 'issue'], ['attachments', 'issue'], ['worklogs', 'issue'], ['issue_history', 'issue'],
  ['boards', 'project'], ['board_columns', 'board'], ['swimlanes', 'board'], ['quick_filters', 'board'], ['card_colors', 'board'],
  ['automation_rules', 'project'], ['project_members', 'project'],
];

const B64 = '__b64:';
const blobOut = (v) => (v == null ? null : B64 + Buffer.from(v).toString('base64'));
const blobIn = (v) => (typeof v === 'string' && v.startsWith(B64) ? Buffer.from(v.slice(B64.length), 'base64') : v);

export function createExchange(core) {
  const db = () => core.db;
  const S = () => core.services;

  async function selectProjectRows(table, how, projectId) {
    const q = db().q(table);
    switch (how) {
      case 'project': return db().all(`SELECT * FROM ${q} WHERE "project_id" = ?`, [projectId]);
      case 'workflow': return db().all(`SELECT * FROM ${q} WHERE "workflow_id" IN (SELECT "id" FROM "workflows" WHERE "project_id" = ?)`, [projectId]);
      case 'issue': return db().all(`SELECT * FROM ${q} WHERE "issue_id" IN (SELECT "id" FROM "issues" WHERE "project_id" = ?)`, [projectId]);
      case 'board': return db().all(`SELECT * FROM ${q} WHERE "board_id" IN (SELECT "id" FROM "boards" WHERE "project_id" = ?)`, [projectId]);
      case 'link': return db().all(`SELECT * FROM ${q} WHERE "source_id" IN (SELECT "id" FROM "issues" WHERE "project_id" = ?) AND "target_id" IN (SELECT "id" FROM "issues" WHERE "project_id" = ?)`, [projectId, projectId]);
    }
    return [];
  }

  /** All `u:<id>` icon refs in a set of rows. */
  function iconRefs(rows, out) {
    for (const r of rows) for (const v of Object.values(r)) if (typeof v === 'string') for (const m of v.matchAll(/u:([0-9a-z]{20})/g)) out.add(m[1]);
  }

  const svc = {
    /** .myboard export of one project. */
    async exportProject(ctx, projectId) {
      const p = await S().projects.load(projectId);
      await assertProject(db(), ctx, p.id, 'viewer');
      const tables = {};
      for (const [t, how] of PROJECT_TABLES) {
        const rows = await selectProjectRows(t, how, p.id);
        const blobs = TABLE[t].columns.filter((c) => c.type === 'blob').map((c) => c.name);
        tables[t] = rows.map((r) => { for (const b of blobs) r[b] = blobOut(r[b]); return r; });
      }
      // global custom fields used by the project's values
      const globals = await db().all('SELECT * FROM "custom_fields" WHERE "project_id" IS NULL AND "id" IN (SELECT "field_id" FROM "custom_values" WHERE "issue_id" IN (SELECT "id" FROM "issues" WHERE "project_id" = ?))', [p.id]);
      tables.custom_fields.push(...globals);
      // users referenced anywhere
      const userIds = new Set();
      for (const rows of Object.values(tables)) for (const r of rows) for (const [k, v] of Object.entries(r)) if (v && (k.endsWith('_id') || k === 'created_by') && /user|author|assignee|reporter|lead|created_by|owner/.test(k)) userIds.add(v);
      const users = userIds.size ? await db().all(`SELECT "id", "username", "display_name", "email", "avatar", "role" FROM "users" WHERE "id" IN (${[...userIds].map(() => '?').join(', ')})`, [...userIds]) : [];
      const refs = new Set();
      iconRefs([p], refs); for (const rows of Object.values(tables)) iconRefs(rows, refs); iconRefs(users, refs);
      const icons = refs.size ? await db().all(`SELECT * FROM "icons" WHERE "id" IN (${[...refs].map(() => '?').join(', ')})`, [...refs]) : [];
      return {
        format: 'myboard', version: 1, app: VERSION, exportedAt: Date.now(),
        project: p, tables, users,
        priorities: await db().select('priorities', {}, { order: 'position' }),
        resolutions: await db().select('resolutions', {}, { order: 'position' }),
        icons: icons.map((i) => ({ ...i, data: blobOut(i.data) })),
      };
    },

    /**
     * Import a .myboard file as a new project. opts: { key?, name? } (a different key when the original is taken).
     * @returns {Promise<object>} the new project
     */
    async importMyboard(ctx, file, opts = {}) {
      const user = requireUser(ctx);
      const data = typeof file === 'string' ? JSON.parse(file) : file;
      check(data && data.format === 'myboard' && data.project && data.tables, 'INVALID_FILE', 'This is not a .myboard file');
      const oldKey = data.project.key;
      const key = String(opts.key || oldKey).toUpperCase();
      check(/^[A-Z][A-Z0-9]{1,9}$/.test(key), 'INVALID_PROJECT_KEY', 'The key must be 2-10 letters or digits and start with a letter');
      if (await db().get('SELECT "id" FROM "projects" WHERE "key" = ?', [key])) {
        throw new AppError('PROJECT_KEY_TAKEN', `The key ${key} is already used`, 409, { suggested: await freeKey(key) });
      }
      const now = nowOf(ctx);
      const map = new Map(); // old id → new id (ids are globally unique, so one map serves every table)
      const project = await db().tx(async () => {
        // users: by username, else create inactive (no password) so history keeps names
        for (const u of data.users || []) {
          const ex = await db().get('SELECT "id" FROM "users" WHERE "username" = ?', [u.username]);
          if (ex) map.set(u.id, ex.id);
          else {
            const id = newId();
            await db().insert('users', { id, username: u.username, display_name: u.display_name || u.username, email: u.email, avatar: u.avatar, role: 'user', active: 0, created_at: now, updated_at: now });
            map.set(u.id, id);
          }
        }
        for (const [table, list] of [['priorities', data.priorities], ['resolutions', data.resolutions]]) {
          for (const r of list || []) {
            const ex = await db().get(`SELECT "id" FROM ${db().q(table)} WHERE LOWER("name") = ?`, [String(r.name).toLowerCase()]);
            if (ex) map.set(r.id, ex.id);
            else {
              const id = newId();
              await db().insert(table, { ...r, id, position: Number(await db().value(`SELECT MAX("position") AS m FROM ${db().q(table)}`, [], -1)) + 1 });
              map.set(r.id, id);
            }
          }
        }
        for (const ic of data.icons || []) {
          const id = newId();
          await db().insert('icons', { ...ic, id, data: blobIn(ic.data), created_by: user?.id || null });
          map.set(ic.id, id);
        }
        // fresh ids for every row with an id
        const pid = newId();
        map.set(data.project.id, pid);
        for (const rows of Object.values(data.tables)) for (const r of rows) if (r.id && !map.has(r.id)) map.set(r.id, newId());
        const keyRe = new RegExp(`\\b${oldKey}-(\\d+)\\b`, 'g');
        const rekey = (s) => (typeof s === 'string' && key !== oldKey ? s.replace(keyRe, `${key}-$1`).replace(new RegExp(`(project\\s*(=|!=|in\\s*\\()\\s*)${oldKey}\\b`, 'gi'), `$1${key}`) : s);
        const mapStr = (v) => {
          if (typeof v !== 'string') return v;
          if (map.has(v)) return map.get(v);
          if (/u:[0-9a-z]{20}/.test(v)) v = v.replace(/u:([0-9a-z]{20})/g, (m, id) => (map.has(id) ? `u:${map.get(id)}` : m));
          if (/^[0-9a-z]{20}(,[0-9a-z]{20})+$/.test(v)) return v.split(',').map((x) => map.get(x) || x).join(',');
          return v;
        };
        const deep = (v) => (Array.isArray(v) ? v.map(deep) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x)])) : mapStr(v));
        const convert = (table, r) => {
          const out = {};
          for (const c of TABLE[table].columns) {
            let v = r[c.name];
            if (v === undefined) continue;
            if (c.type === 'blob') v = blobIn(v);
            else if (c.type === 'json') v = v == null ? null : JSON.stringify(deep(typeof v === 'string' ? parseJson(v, v) : v));
            else if (typeof v === 'string') v = rekey(mapStr(v));
            out[c.name] = v;
          }
          return out;
        };
        const p = convert('projects', data.project);
        Object.assign(p, { id: pid, key, name: opts.name || data.project.name, created_at: now, updated_at: now, rev: 1 });
        await db().insert('projects', p);
        for (const [t] of PROJECT_TABLES) {
          let rows = (data.tables[t] || []).map((r) => convert(t, r));
          if (t === 'custom_fields') rows = rows.map((r) => ({ ...r, project_id: pid }));
          if (t === 'issues') rows = rows.map((r) => ({ ...r, key: `${key}-${r.number}` }));
          if (t === 'project_members') rows = rows.filter((r) => r.user_id !== user?.id);
          await db().insertMany(t, rows);
        }
        if (user) {
          await db().remove('project_members', { project_id: pid, user_id: user.id });
          await db().insert('project_members', { project_id: pid, user_id: user.id, role: 'admin', created_at: now });
        }
        return db().get('SELECT * FROM "projects" WHERE "id" = ?', [pid]);
      });
      emit(core, ctx, 'project.created', [`project:${project.id}`, 'projects'], { id: project.id, data: toApi('projects', project) });
      return { ...toApi('projects', project), issueCount: await db().count('issues', { project_id: project.id }) };
    },

    /**
     * CSV import. Without `mapping` (or with dryRun) → { headers, sample, suggestedMapping, fields }.
     * body: { projectId, csv, mapping: { "<header>": "<field>" }, delimiter?, dryRun?, createMissing?: true }
     * Fields: summary description type status priority assignee reporter labels components fixVersions affectedVersions
     *         dueDate startDate storyPoints originalEstimate created key epic parent custom:<fieldId>
     */
    async importCsv(ctx, body = {}) {
      requireUser(ctx);
      const p = await S().projects.load(body.projectId || '');
      await assertProject(db(), ctx, p.id, 'member');
      check(typeof body.csv === 'string' && body.csv.trim(), 'REQUIRED', 'csv is required', { field: 'csv' });
      const delimiter = body.delimiter || detectDelimiter(body.csv);
      const rows = parseCsv(body.csv, delimiter);
      check(rows.length >= 1, 'INVALID_FILE', 'The CSV file is empty');
      const headers = rows[0].map((h) => h.trim());
      const data = rows.slice(1);
      const cfg = await S().projects.config(ctx, p.id);
      if (!body.mapping || body.dryRun) {
        return { headers, delimiter, rowCount: data.length, sample: data.slice(0, 5), suggestedMapping: suggestMapping(headers, cfg.fields), fields: CSV_FIELDS };
      }
      const mapping = body.mapping;
      const col = (field) => headers.findIndex((h) => mapping[h] === field);
      const get = (row, field) => { const i = col(field); return i >= 0 ? (row[i] ?? '').trim() : ''; };
      const byName = (list, v) => list.find((x) => x.name.toLowerCase() === v.toLowerCase() || x.id === v);
      const users = await db().select('users', {});
      const userBy = (v) => (v ? users.find((u) => u.username === v.toLowerCase() || u.display_name.toLowerCase() === v.toLowerCase() || (u.email && u.email.toLowerCase() === v.toLowerCase())) : null);
      const errors = [];
      const created = [];
      const keyMap = new Map(); // CSV key → new issue id
      const splitList = (v) => v.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
      const ensure = async (kind, name) => {
        const list = kind === 'components' ? cfg.components : cfg.versions;
        let x = byName(list, name);
        if (!x && body.createMissing !== false) {
          x = kind === 'components' ? await S().components.create(ctx, p.id, { name }) : await S().versions.create(ctx, p.id, { name });
          list.push(x);
        }
        if (!x) throw new ValidationError('UNKNOWN_VALUE', `Unknown ${kind === 'components' ? 'component' : 'version'}: ${name}`);
        return x.id;
      };
      // subtasks (rows with a parent) go second so their parents exist
      const order = data.map((r, i) => i).sort((a, b) => (get(data[a], 'parent') ? 1 : 0) - (get(data[b], 'parent') ? 1 : 0));
      for (const i of order) {
        const row = data[i];
        try {
          const issue = { projectId: p.id, summary: get(row, 'summary') };
          check(issue.summary, 'REQUIRED', 'summary is empty', { field: 'summary' });
          const text = (f, k) => { const v = get(row, f); if (v) issue[k] = v; };
          text('description', 'description');
          const type = get(row, 'type');
          if (type) { const t = byName(cfg.types, type); if (!t) throw new ValidationError('UNKNOWN_VALUE', `Unknown type: ${type}`); issue.typeId = t.id; }
          if (get(row, 'parent') && !type) issue.typeId = cfg.types.find((t) => t.level === 1)?.id;
          const status = get(row, 'status');
          if (status) { const s = byName(cfg.statuses, status); if (!s) throw new ValidationError('UNKNOWN_VALUE', `Unknown status: ${status}`); issue.statusId = s.id; }
          const prio = get(row, 'priority');
          if (prio) { const pr = byName(cfg.priorities, prio); if (!pr) throw new ValidationError('UNKNOWN_VALUE', `Unknown priority: ${prio}`); issue.priorityId = pr.id; }
          for (const [f, k] of [['assignee', 'assigneeId'], ['reporter', 'reporterId']]) {
            const v = get(row, f); if (v) { const u = userBy(v); if (u) issue[k] = u.id; }
          }
          if (get(row, 'labels')) issue.labels = get(row, 'labels').split(/[\s;,]+/).filter(Boolean);
          if (get(row, 'components')) { issue.componentIds = []; for (const n of splitList(get(row, 'components'))) issue.componentIds.push(await ensure('components', n)); }
          for (const [f, k] of [['fixVersions', 'fixVersionIds'], ['affectedVersions', 'affectedVersionIds']]) {
            if (get(row, f)) { issue[k] = []; for (const n of splitList(get(row, f))) issue[k].push(await ensure('versions', n)); }
          }
          for (const [f, k] of [['dueDate', 'dueDate'], ['startDate', 'startDate']]) { const v = get(row, f); if (v) issue[k] = csvDate(v); }
          if (get(row, 'storyPoints')) issue.storyPoints = Number(get(row, 'storyPoints').replace(',', '.'));
          if (get(row, 'originalEstimate')) issue.originalEstimate = parseTimeSpent(get(row, 'originalEstimate'));
          for (const ref of ['epic', 'parent']) {
            const v = get(row, ref);
            if (!v) continue;
            const id = keyMap.get(v.toUpperCase()) || (await db().get('SELECT "id" FROM "issues" WHERE "key" = ? AND "project_id" = ?', [v.toUpperCase(), p.id]))?.id;
            if (!id) throw new ValidationError('UNKNOWN_VALUE', `Unknown ${ref} issue: ${v}`);
            issue[ref === 'epic' ? 'epicId' : 'parentId'] = id;
          }
          const custom = {};
          for (const h of headers) {
            const f = mapping[h];
            if (f && f.startsWith('custom:')) { const v = row[headers.indexOf(h)]; if (v != null && v.trim()) custom[f.slice(7)] = v.trim(); }
          }
          for (const [fid, v] of Object.entries(custom)) {
            const cf = cfg.fields.find((x) => x.id === fid);
            if (cf && ['multiselect', 'labels'].includes(cf.type)) custom[fid] = splitList(v);
            if (cf && cf.type === 'date') custom[fid] = csvDate(v);
          }
          if (Object.keys(custom).length) issue.custom = custom;
          const createdAt = get(row, 'created') ? Date.parse(get(row, 'created').replace(' ', 'T')) : NaN;
          const ictx = Number.isFinite(createdAt) ? { ...ctx, now: () => createdAt } : ctx;
          const out = await S().issues.create(ictx, issue);
          if (get(row, 'key')) keyMap.set(get(row, 'key').toUpperCase(), out.id);
          created.push({ row: i + 2, id: out.id, key: out.key });
        } catch (err) {
          errors.push({ row: i + 2, code: err.code || 'ERROR', message: err.message });
        }
      }
      created.sort((a, b) => a.row - b.row);
      return { created: created.length, issues: created, errors };
    },

    /** CSV of a JQL search (UTF-8 with BOM so spreadsheet apps detect the encoding). */
    async exportCsv(ctx, q = {}) {
      const res = await S().issues.search(ctx, { jql: q.jql || '', limit: 5000 });
      const ids = res.items.map((i) => i.id);
      const hyd = await S().issues.hydrate(ids);
      const by = Object.fromEntries(hyd.map((h) => [h.id, h]));
      const date = (ms) => (ms ? new Date(ms).toISOString().replace('T', ' ').slice(0, 16) : '');
      const rows = [['Key', 'Summary', 'Type', 'Status', 'Priority', 'Assignee', 'Reporter', 'Labels', 'Components', 'Fix versions', 'Epic', 'Parent', 'Story points', 'Due date', 'Created', 'Updated', 'Resolved', 'Resolution', 'Description']];
      for (const id of ids) {
        const h = by[id];
        if (!h) continue;
        rows.push([h.key, h.summary, h.type?.name, h.status?.name, h.priority?.name, h.assignee?.username, h.reporter?.username, h.labels.join(' '),
          h.components.map((c) => c.name).join('; '), h.fixVersions.map((v) => v.name).join('; '), h.epic?.key, h.parent?.key, h.storyPoints ?? '', h.due || '',
          date(h.created), date(h.updated), date(h.resolved), h.resolution?.name, h.description || '']);
      }
      return formatCsv(rows);
    },

    /** Import a card board JSON export (lists → statuses/columns, cards → issues). */
    async importBoardJson(ctx, json, opts = {}) {
      return importCardBoard(core, ctx, typeof json === 'string' ? JSON.parse(json) : json, opts);
    },
  };

  async function freeKey(key) {
    for (let n = 2; n < 100; n++) {
      const k = (key.slice(0, 10 - String(n).length) + n).toUpperCase();
      if (!(await db().get('SELECT "id" FROM "projects" WHERE "key" = ?', [k]))) return k;
    }
    return null;
  }
  return svc;
}

export const CSV_FIELDS = ['summary', 'description', 'type', 'status', 'priority', 'assignee', 'reporter', 'labels', 'components', 'fixVersions',
  'affectedVersions', 'dueDate', 'startDate', 'storyPoints', 'originalEstimate', 'created', 'key', 'epic', 'parent'];

const SYNONYMS = {
  summary: ['summary', 'title', 'name', '요약', '제목'], description: ['description', 'desc', 'details', '설명', '내용'],
  type: ['type', 'issue type', 'issuetype', '유형'], status: ['status', 'state', '상태'], priority: ['priority', '우선순위'],
  assignee: ['assignee', 'owner', 'assigned to', '담당자'], reporter: ['reporter', 'author', 'created by', '보고자'],
  labels: ['labels', 'label', 'tags', '레이블', '태그'], components: ['components', 'component', '컴포넌트'], fixVersions: ['fix version', 'fix versions', 'fixversion', 'version', '버전'],
  affectedVersions: ['affects version', 'affected version', 'affects versions'], dueDate: ['due date', 'due', 'duedate', '기한', '마감일'],
  startDate: ['start date', 'start', '시작일'], storyPoints: ['story points', 'points', 'storypoints', 'estimate', '스토리 포인트'],
  originalEstimate: ['original estimate', 'time estimate'], created: ['created', 'created at', 'date created', '생성일'], key: ['key', 'issue key', 'id', '키'],
  epic: ['epic', 'epic link', '에픽'], parent: ['parent', 'parent key', 'parent id', '상위'],
};

function suggestMapping(headers, fields) {
  const m = {};
  for (const h of headers) {
    const l = h.toLowerCase().trim();
    const f = Object.entries(SYNONYMS).find(([, syn]) => syn.includes(l));
    if (f) m[h] = f[0];
    else { const cf = fields.find((x) => x.name.toLowerCase() === l); if (cf) m[h] = `custom:${cf.id}`; }
  }
  return m;
}

/** '2026-01-31' | '2026/01/31' | '31.01.2026' | '01/31/2026' → 'YYYY-MM-DD' */
function csvDate(v) {
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(v);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(v);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(v);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  const t = Date.parse(v);
  if (Number.isFinite(t)) return today(t);
  throw new ValidationError('INVALID_DATE', `Cannot read the date ${v}`);
}


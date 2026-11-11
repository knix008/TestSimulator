// Project configuration entities: issue types, statuses, workflows, transitions, components, versions,
// custom fields, and the global priorities / resolutions. Built on the crud() factory with the extra rules.
import { newId } from '../ids.js';
import { AppError, NotFoundError, ValidationError, check } from '../errors.js';
import { crud, toApi, emit, nowOf, assertProject, requireAdmin, requireUser, today, checkDate, parseJson, snake } from './common.js';
import { customValueColumns } from '../jql/index.js';

export const CUSTOM_FIELD_TYPES = ['text', 'textarea', 'number', 'date', 'select', 'multiselect', 'user', 'checkbox', 'url', 'labels'];
export const RULE_TYPES = {
  conditions: ['onlyAssignee', 'onlyReporter', 'projectRole', 'subtasksDone', 'jql'],
  validators: ['fieldRequired', 'commentRequired', 'jql'],
  postFunctions: ['assignToCurrentUser', 'assignToReporter', 'unassign', 'setResolution', 'clearResolution', 'setField', 'addLabel', 'addComment'],
};

const projectIdOf = async (db, rowOrId, isParent) => (isParent ? rowOrId : rowOrId.project_id);

export function createConfig(core) {
  const db = () => core.db;

  /** Is `id` in use somewhere? Then deletion needs a replacement. */
  async function replaceOrRefuse(table, column, row, opts, label) {
    const n = Number(await db().value(`SELECT COUNT(*) AS n FROM ${db().q(table)} WHERE ${db().q(column)} = ?`, [row.id], 0));
    if (!n) return;
    if (!opts.replaceWith) throw new AppError('IN_USE', `${label} is used by ${n} issues; choose a replacement`, 409, { count: n });
    await db().run(`UPDATE ${db().q(table)} SET ${db().q(column)} = ? WHERE ${db().q(column)} = ?`, [opts.replaceWith, row.id]);
  }

  const types = crud(core, {
    table: 'issue_types', entity: 'issueType', parent: 'project_id', projectOf: projectIdOf,
    fields: ['name', 'icon', 'color', 'level', 'workflow_id', 'position'],
    defaults: async (d, projectId) => ({ workflow_id: (await d.get('SELECT "id" FROM "workflows" WHERE "project_id" = ? ORDER BY "created_at"', [projectId]))?.id || null }),
    validate: async (d, r) => {
      check(r.name && String(r.name).trim(), 'REQUIRED', 'name is required', { field: 'name' });
      check([-1, 0, 1].includes(Number(r.level ?? 0)), 'INVALID_LEVEL', 'level must be -1 (epic), 0 or 1 (subtask)');
    },
    beforeRemove: async (d, row, opts) => {
      await replaceOrRefuse('issues', 'type_id', row, opts, 'This issue type');
      // custom fields limited to this type: the replacement takes its place (none left = every type again)
      for (const f of await d.all('SELECT "id", "issue_type_ids" FROM "custom_fields" WHERE "issue_type_ids" IS NOT NULL')) {
        const ids = parseJson(f.issue_type_ids, null);
        if (!Array.isArray(ids) || !ids.includes(row.id)) continue;
        const next = [...new Set(ids.map((x) => (x === row.id ? opts.replaceWith || null : x)).filter(Boolean))];
        await d.run('UPDATE "custom_fields" SET "issue_type_ids" = ?, "rev" = "rev" + 1 WHERE "id" = ?', [next.length ? JSON.stringify(next) : null, f.id]);
      }
    },
  });

  const statuses = crud(core, {
    table: 'statuses', entity: 'status', parent: 'project_id', projectOf: projectIdOf,
    fields: ['name', 'category', 'color', 'position'],
    validate: async (d, r) => {
      check(r.name && String(r.name).trim(), 'REQUIRED', 'name is required', { field: 'name' });
      check(['todo', 'inprogress', 'done'].includes(r.category), 'INVALID_CATEGORY', 'category must be todo, inprogress or done');
    },
    beforeRemove: async (d, row, opts) => {
      if (opts.replaceWith) {
        const other = await d.get('SELECT "id" FROM "statuses" WHERE "id" = ? AND "project_id" = ?', [opts.replaceWith, row.project_id]);
        check(!!other && opts.replaceWith !== row.id, 'INVALID_REPLACEMENT', 'The replacement status must be another status of the project');
      }
      await replaceOrRefuse('issues', 'status_id', row, opts, 'This status');
      await d.run('DELETE FROM "transitions" WHERE "to_status_id" = ? OR "from_status_id" = ?', [row.id, row.id]);
      await d.run('UPDATE "workflows" SET "initial_status_id" = ? WHERE "initial_status_id" = ?', [opts.replaceWith || null, row.id]);
      // drop it from board column mappings
      const cols = await d.all('SELECT c."id", c."status_ids" FROM "board_columns" c JOIN "boards" b ON b."id" = c."board_id" WHERE b."project_id" = ?', [row.project_id]);
      for (const c of cols) {
        const ids = JSON.parse(c.status_ids || '[]');
        if (ids.includes(row.id)) await d.update('board_columns', c.id, { status_ids: ids.filter((x) => x !== row.id) });
      }
    },
  });
  // A new status gets a global transition in "open" workflows (where every transition is from any status).
  const createStatus = statuses.create;
  statuses.create = async (ctx, projectId, body) => {
    const st = await createStatus(ctx, projectId, body);
    const wfs = await db().select('workflows', { project_id: projectId });
    for (const wf of wfs) {
      const ts = await db().select('transitions', { workflow_id: wf.id });
      if (ts.every((t) => t.from_status_id == null)) {
        await db().insert('transitions', { id: newId(), workflow_id: wf.id, name: st.name, from_status_id: null, to_status_id: st.id, rules: emptyRules(), position: ts.length, created_at: nowOf(ctx), updated_at: nowOf(ctx) });
      }
    }
    return st;
  };

  const workflows = crud(core, {
    table: 'workflows', entity: 'workflow', parent: 'project_id', projectOf: projectIdOf, order: 'name',
    fields: ['name', 'initial_status_id', 'layout'],
    validate: async (d, r) => {
      check(r.name && String(r.name).trim(), 'REQUIRED', 'name is required', { field: 'name' });
      if (r.initial_status_id) await statusOfProject(d, r.initial_status_id, r.project_id);
      checkLayout(r.layout);
    },
    beforeRemove: async (d, row) => {
      const n = await d.count('issue_types', { workflow_id: row.id });
      if (n) throw new AppError('IN_USE', 'This workflow is used by issue types', 409, { count: n });
      await d.remove('transitions', { workflow_id: row.id });
    },
  });

  const workflowProject = async (d, rowOrId, isParent) => {
    const wfId = isParent ? rowOrId : rowOrId.workflow_id;
    const wf = await d.get('SELECT "project_id" FROM "workflows" WHERE "id" = ?', [wfId]);
    if (!wf) throw new NotFoundError('WORKFLOW_NOT_FOUND', 'Workflow not found');
    return wf.project_id;
  };
  const transitions = crud(core, {
    table: 'transitions', entity: 'transition', parent: 'workflow_id', projectOf: workflowProject,
    fields: ['name', 'from_status_id', 'to_status_id', 'rules', 'position'],
    defaults: async () => ({ rules: emptyRules() }),
    validate: async (d, r) => {
      check(r.name && String(r.name).trim(), 'REQUIRED', 'name is required', { field: 'name' });
      const pid = await workflowProject(d, r.workflow_id, true);
      check(!!r.to_status_id, 'REQUIRED', 'toStatusId is required', { field: 'toStatusId' });
      await statusOfProject(d, r.to_status_id, pid);
      if (r.from_status_id) await statusOfProject(d, r.from_status_id, pid);
      r.rules = normaliseRules(typeof r.rules === 'string' ? JSON.parse(r.rules) : r.rules);
    },
  });

  const components = crud(core, {
    table: 'components', entity: 'component', parent: 'project_id', projectOf: projectIdOf, order: 'name',
    fields: ['name', 'description', 'lead_id', 'icon', 'default_assignee_id'],
    validate: async (d, r) => {
      check(r.name && String(r.name).trim(), 'REQUIRED', 'name is required', { field: 'name' });
      for (const [col, field] of [['lead_id', 'leadId'], ['default_assignee_id', 'defaultAssigneeId']]) {
        if (r[col] && !(await d.get('SELECT "id" FROM "users" WHERE "id" = ?', [r[col]]))) throw new ValidationError('INVALID_USER', 'Unknown user', { field });
      }
    },
    beforeRemove: async (d, row) => d.remove('issue_components', { component_id: row.id }),
  });

  const versions = crud(core, {
    table: 'versions', entity: 'version', parent: 'project_id', projectOf: projectIdOf,
    fields: ['name', 'description', 'start_date', 'release_date', 'released', 'archived', 'position'],
    validate: async (d, r) => {
      check(r.name && String(r.name).trim(), 'REQUIRED', 'name is required', { field: 'name' });
      checkDate(r.start_date, 'startDate');
      checkDate(r.release_date, 'releaseDate');
    },
    beforeRemove: async (d, row, opts) => {
      if (opts.replaceWith) {
        // (MySQL cannot delete from a table it also reads in a subquery, so collect the ids first)
        const both = await d.all('SELECT "issue_id", "kind" FROM "issue_versions" WHERE "version_id" = ?', [opts.replaceWith]);
        for (const b of both) await d.run('DELETE FROM "issue_versions" WHERE "version_id" = ? AND "issue_id" = ? AND "kind" = ?', [row.id, b.issue_id, b.kind]);
        await d.run('UPDATE "issue_versions" SET "version_id" = ? WHERE "version_id" = ?', [opts.replaceWith, row.id]);
      } else await d.remove('issue_versions', { version_id: row.id });
    },
  });
  /** Release a version; unresolved issues can move to another version. */
  versions.release = async (ctx, id, { releaseDate, moveUnresolvedTo } = {}) => {
    const v = await db().get('SELECT * FROM "versions" WHERE "id" = ?', [id]);
    if (!v) throw new NotFoundError('VERSION_NOT_FOUND', 'Version not found');
    await assertProject(db(), ctx, v.project_id, 'admin');
    const row = await db().tx(async () => {
      if (moveUnresolvedTo) {
        const unresolved = await db().all('SELECT iv."issue_id" FROM "issue_versions" iv JOIN "issues" i ON i."id" = iv."issue_id" WHERE iv."version_id" = ? AND iv."kind" = ? AND i."resolution_id" IS NULL', [id, 'fix']);
        for (const { issue_id } of unresolved) {
          await db().run('DELETE FROM "issue_versions" WHERE "issue_id" = ? AND "version_id" = ? AND "kind" = ?', [issue_id, id, 'fix']);
          await db().run('DELETE FROM "issue_versions" WHERE "issue_id" = ? AND "version_id" = ? AND "kind" = ?', [issue_id, moveUnresolvedTo, 'fix']);
          await db().insert('issue_versions', { issue_id, version_id: moveUnresolvedTo, kind: 'fix' });
        }
      }
      return db().update('versions', id, { released: 1, release_date: checkDate(releaseDate, 'releaseDate') || v.release_date || today(nowOf(ctx)) });
    });
    emit(core, ctx, 'version.updated', [`project:${v.project_id}`], { id, rev: row.rev, data: toApi('versions', row) });
    return toApi('versions', row);
  };

  const fields = crud(core, {
    table: 'custom_fields', entity: 'field', parent: 'project_id', projectOf: projectIdOf,
    fields: ['name', 'type', 'options', 'required', 'position', 'description', 'default_value', 'issue_type_ids'],
    validate: async (d, r, existing) => {
      check(r.name && String(r.name).trim(), 'REQUIRED', 'name is required', { field: 'name' });
      check(CUSTOM_FIELD_TYPES.includes(r.type), 'INVALID_FIELD_TYPE', `type must be one of ${CUSTOM_FIELD_TYPES.join(', ')}`);
      if (existing && existing.type !== r.type) throw new ValidationError('FIELD_TYPE_IMMUTABLE', 'The type of a field cannot be changed');
      let opts = typeof r.options === 'string' ? JSON.parse(r.options) : r.options;
      if (opts != null) {
        check(Array.isArray(opts), 'INVALID_OPTIONS', 'options must be an array');
        opts = opts.map((o) => (typeof o === 'string' ? { id: newId(), value: o } : { ...o, id: o.id || newId() }));
        check(opts.every((o) => o.value != null && String(o.value).trim()), 'INVALID_OPTIONS', 'every option needs a value');
        r.options = opts;
      }
      const clash = await d.get('SELECT "id" FROM "custom_fields" WHERE LOWER("name") = ? AND "id" <> ? AND ("project_id" = ? OR "project_id" IS NULL)', [String(r.name).trim().toLowerCase(), r.id, r.project_id]);
      check(!clash, 'FIELD_NAME_TAKEN', 'Another field has this name');
    },
    beforeRemove: async (d, row) => d.remove('custom_values', { field_id: row.id }),
  });
  /** Project fields plus global ones (project_id null). */
  fields.list = async (ctx, projectId) => {
    await assertProject(db(), ctx, projectId, 'viewer');
    const rows = await db().all('SELECT * FROM "custom_fields" WHERE "project_id" = ? OR "project_id" IS NULL ORDER BY "position"', [projectId]);
    return rows.map((r) => toApi('custom_fields', r));
  };
  /**
   * defaultValue / issueTypeIds of a field body, normalised for storing (`existing`: the stored row on update).
   * The default is checked like a value (customValue); stored as JSON text. A select default follows its option
   * when the option is renamed, and is dropped when the option is deleted. issueTypeIds: [] / null = every type.
   */
  async function fieldExtras(body, existing, projectId) {
    const has = (k) => body && (k in body || snake(k) in body);
    const get = (k) => (k in body ? body[k] : body[snake(k)]);
    const out = {};
    const type = existing?.type ?? body?.type ?? 'text';
    const options = has('options') ? (get('options') ?? []).map((o) => (typeof o === 'string' ? { value: o } : o)) : (parseJson(existing?.options, []) ?? []);
    if (has('issueTypeIds')) {
      let ids = get('issueTypeIds');
      if (typeof ids === 'string') ids = parseJson(ids, null);
      check(ids == null || (Array.isArray(ids) && ids.every((x) => typeof x === 'string')), 'INVALID_TYPE', 'issueTypeIds must be an array of issue type ids', { field: 'issueTypeIds' });
      ids = [...new Set(ids ?? [])];
      const pid = existing ? existing.project_id : projectId;
      for (const tid of ids) {
        const t = await db().get(`SELECT "id" FROM "issue_types" WHERE "id" = ?${pid ? ' AND "project_id" = ?' : ''}`, pid ? [tid, pid] : [tid]);
        if (!t) throw new ValidationError('INVALID_TYPE', 'Unknown issue type', { field: 'issueTypeIds', id: tid });
      }
      out.issueTypeIds = ids.length ? ids : null;
    }
    const cf = { id: existing?.id ?? 'new', name: body?.name ?? existing?.name ?? '', type, options };
    let raw;
    if (has('defaultValue')) raw = get('defaultValue');
    else if (existing && has('options') && existing.default_value != null && (type === 'select' || type === 'multiselect')) {
      // options changed: follow renamed options by id, drop deleted ones
      const old = parseJson(existing.options, []) ?? [];
      const follow = (v) => { const o = old.find((x) => String(x.value) === String(v)); const n = o && options.find((x) => x.id && x.id === o.id); return n ? n.value : options.some((x) => String(x.value) === String(v)) ? v : null; };
      const def = parseJson(existing.default_value, null);
      raw = Array.isArray(def) ? def.map(follow).filter((v) => v != null) : def == null ? null : follow(def);
    } else return out;
    let v = await core.services.issues.customValue(cf, raw);
    if (type === 'checkbox' && v === false) v = undefined; // unchecked is no default
    out.defaultValue = v === undefined ? null : JSON.stringify(v);
    return out;
  }
  const createField = fields.create;
  fields.create = async (ctx, projectId, body = {}) => createField(ctx, projectId, { ...body, ...(await fieldExtras(body, null, projectId)) });

  /** Option values renamed → re-index stored query columns. */
  const updateField = fields.update;
  fields.update = async (ctx, id, body) => {
    // validate() normalises a copy; the stored options must get their ids here (as create does)
    if (Array.isArray(body?.options)) body = { ...body, options: body.options.map((o) => (typeof o === 'string' ? { id: newId(), value: o } : { ...o, id: o?.id || newId() })) };
    const stored = await db().get('SELECT * FROM "custom_fields" WHERE "id" = ?', [id]);
    if (stored) body = { ...body, ...(await fieldExtras(body, stored, stored.project_id)) };
    const f = await updateField(ctx, id, body);
    if (body.options) await reindexCustomField(db(), id);
    return f;
  };

  const globalOf = async () => null;
  const priorities = crud(core, {
    table: 'priorities', entity: 'priority', projectOf: globalOf, fields: ['name', 'icon', 'color', 'position'],
    validate: async (d, r) => check(r.name && String(r.name).trim(), 'REQUIRED', 'name is required', { field: 'name' }),
    beforeRemove: async (d, row, opts) => {
      if (opts.replaceWith) await d.run('UPDATE "issues" SET "priority_id" = ? WHERE "priority_id" = ?', [opts.replaceWith, row.id]);
      else await d.run('UPDATE "issues" SET "priority_id" = NULL WHERE "priority_id" = ?', [row.id]);
    },
  });
  const resolutions = crud(core, {
    table: 'resolutions', entity: 'resolution', projectOf: globalOf, fields: ['name', 'description', 'icon', 'color', 'position'],
    validate: async (d, r) => check(r.name && String(r.name).trim(), 'REQUIRED', 'name is required', { field: 'name' }),
    beforeRemove: async (d, row, opts) => replaceOrRefuse('issues', 'resolution_id', row, opts, 'This resolution'),
  });
  for (const g of [priorities, resolutions]) {
    const list = g.list;
    g.list = async (ctx) => { requireUser(ctx); return list.call(g, { system: true }); };
  }

  return { types, statuses, workflows, transitions, components, versions, fields, priorities, resolutions, requireAdmin };
}

export const emptyRules = () => ({ conditions: [], validators: [], postFunctions: [] });

/** Validate and normalise a transition's rules json. */
export function normaliseRules(rules) {
  const r = { ...emptyRules(), ...(rules || {}) };
  for (const k of Object.keys(RULE_TYPES)) {
    check(Array.isArray(r[k]), 'INVALID_RULES', `rules.${k} must be an array`);
    for (const item of r[k]) check(item && RULE_TYPES[k].includes(item.type), 'INVALID_RULES', `Unknown ${k} type: ${item?.type}`, { kind: k, type: item?.type });
  }
  return r;
}

/** A workflow diagram layout: { <statusId>: { x, y } } (null = automatic). */
function checkLayout(value) {
  const layout = typeof value === 'string' ? JSON.parse(value) : value;
  if (layout == null) return;
  check(typeof layout === 'object' && !Array.isArray(layout), 'INVALID_LAYOUT', 'layout must be an object { statusId: { x, y } }');
  const entries = Object.entries(layout);
  check(entries.length <= 500, 'INVALID_LAYOUT', 'layout has too many entries');
  for (const [k, p] of entries) {
    check(k.length <= 64 && p && typeof p === 'object' && Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) < 1e6 && Math.abs(p.y) < 1e6,
      'INVALID_LAYOUT', `layout.${k} must be { x, y } numbers`, { status: k });
  }
}

async function statusOfProject(d, statusId, projectId) {
  const s = await d.get('SELECT "id" FROM "statuses" WHERE "id" = ? AND "project_id" = ?', [statusId, projectId]);
  if (!s) throw new ValidationError('INVALID_STATUS', 'The status does not belong to this project');
}

/** Recompute text_value/num_value of a custom field (after options changed). */
export async function reindexCustomField(d, fieldId) {
  const f = await d.get('SELECT * FROM "custom_fields" WHERE "id" = ?', [fieldId]);
  if (!f) return;
  const rows = await d.select('custom_values', { field_id: fieldId });
  for (const r of rows) {
    const cols = customValueColumns(f, JSON.parse(r.value));
    await d.run('UPDATE "custom_values" SET "text_value" = ?, "num_value" = ? WHERE "issue_id" = ? AND "field_id" = ?', [cols.text_value, cols.num_value, r.issue_id, fieldId]);
  }
}

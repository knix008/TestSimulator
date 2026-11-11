// Helpers shared by the services: row ↔ API conversion, events, access control, CRUD factory.
import { TABLE } from '../db/schema.js';
import { newId } from '../ids.js';
import { ForbiddenError, NotFoundError, ValidationError, UnauthorizedError, check } from '../errors.js';

/** @typedef {{ user?: {id:string, role:string, username?:string, display_name?:string}|null, clientId?: string,
 *              system?: boolean, depth?: number, ruleId?: string, now?: () => number }} Ctx */

export const camel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
export const snake = (s) => s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());

/** Current time for a context (samples/tests can supply a clock). */
export const nowOf = (ctx) => (ctx && ctx.now ? Math.round(ctx.now()) : Date.now());

export function parseJson(v, fallback = null) {
  if (v == null || v === '') return fallback;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return fallback; }
}

/**
 * DB row → API object: camelCase keys, bool → boolean, json parsed, blobs dropped.
 * @param {string} table
 * @param {object|null} row
 */
export function toApi(table, row) {
  if (!row) return row;
  const t = TABLE[table];
  const out = {};
  for (const c of t.columns) {
    if (!(c.name in row)) continue;
    const v = row[c.name];
    if (c.type === 'blob') continue;
    if (c.name === 'password_hash') continue;
    out[camel(c.name)] = c.type === 'bool' ? (v == null ? v : !!Number(v)) : c.type === 'json' ? parseJson(v, null) : v;
  }
  return out;
}

/**
 * API body → DB patch for `table`, keeping only `allowed` columns (snake names). Accepts camelCase or snake_case keys.
 * @param {string} table
 * @param {object} body
 * @param {string[]} allowed
 */
export function fromApi(table, body, allowed) {
  const t = TABLE[table];
  const out = {};
  if (!body || typeof body !== 'object') return out;
  for (const name of allowed) {
    const c = t.columns.find((x) => x.name === name);
    if (!c) throw new Error(`fromApi: ${table}.${name}`);
    const key = camel(name) in body ? camel(name) : name in body ? name : null;
    if (key === null) continue;
    let v = body[key];
    if (v === undefined) continue;
    if (c.type === 'bool') v = v ? 1 : 0;
    else if ((c.type === 'int' || c.type === 'bigint') && v !== null && v !== '') {
      v = Number(v);
      check(Number.isFinite(v), 'INVALID_NUMBER', `${camel(name)} must be a number`, { field: camel(name) });
      v = Math.round(v);
    } else if (c.type === 'float' && v !== null && v !== '') {
      v = Number(v);
      check(Number.isFinite(v), 'INVALID_NUMBER', `${camel(name)} must be a number`, { field: camel(name) });
    } else if ((c.type === 'int' || c.type === 'bigint' || c.type === 'float') && v === '') v = null;
    else if (c.type === 'string' && v != null) {
      v = String(v);
      check(v.length <= c.size, 'TOO_LONG', `${camel(name)} is longer than ${c.size} characters`, { field: camel(name), max: c.size });
    }
    if (c.notNull && v === null) throw new ValidationError('REQUIRED', `${camel(name)} is required`, { field: camel(name) });
    out[name] = v;
  }
  return out;
}

/** Required non-empty trimmed string. */
export function requireText(v, field, max = 500) {
  const s = v == null ? '' : String(v).trim();
  check(s.length > 0, 'REQUIRED', `${field} is required`, { field });
  check(s.length <= max, 'TOO_LONG', `${field} is longer than ${max} characters`, { field, max });
  return s;
}

export const isDate = (s) => s == null || s === '' || /^\d{4}-\d{2}-\d{2}$/.test(s);

export function checkDate(v, field) {
  if (v === '' || v === undefined) return v === '' ? null : undefined;
  check(isDate(v), 'INVALID_DATE', `${field} must be YYYY-MM-DD`, { field });
  return v;
}

/** Emit a service event (ARCHITECTURE §6) — after the surrounding transaction commits, if any. */
export function emit(core, ctx, type, topics, { id, rev, data } = {}) {
  const event = {
    type, topics: topics.filter(Boolean), id, rev, data, by: ctx?.user?.id || null, at: nowOf(ctx),
    client: ctx?.clientId || null, depth: ctx?.depth || 0, ruleId: ctx?.ruleId || null,
  };
  core.db.afterCommit(() => core.events.emit(event));
}

// ---- access control -------------------------------------------------------------------------------------------
// Global admins and system contexts (automation, import) may do anything. Other users need a project role:
// viewer (read), member (edit issues), admin (configure the project).

const ROLE_RANK = { viewer: 1, member: 2, admin: 3 };

export function requireUser(ctx) {
  if (!ctx || (!ctx.user && !ctx.system)) throw new UnauthorizedError();
  return ctx.user;
}

export const isAdmin = (ctx) => !!(ctx && (ctx.system || ctx.user?.role === 'admin'));

export function requireAdmin(ctx) {
  requireUser(ctx);
  if (!isAdmin(ctx)) throw new ForbiddenError('ADMIN_REQUIRED', 'Administrator rights are required');
}

/** @returns {Promise<'admin'|'member'|'viewer'|null>} */
export async function projectRole(db, ctx, projectId) {
  if (isAdmin(ctx)) return 'admin';
  if (!ctx?.user) return null;
  const m = await db.get('SELECT "role" FROM "project_members" WHERE "project_id" = ? AND "user_id" = ?', [projectId, ctx.user.id]);
  return m ? m.role : null;
}

/** Throws unless the user has at least `need` on the project. Unknown project and no access both read as 404. */
export async function assertProject(db, ctx, projectId, need = 'viewer') {
  requireUser(ctx);
  const role = await projectRole(db, ctx, projectId);
  if (!role) throw new NotFoundError('PROJECT_NOT_FOUND', 'Project not found');
  if (ROLE_RANK[role] < ROLE_RANK[need]) {
    throw new ForbiddenError('PROJECT_PERMISSION', need === 'admin' ? 'Project administrator rights are required' : 'You cannot change this project');
  }
  return role;
}

/** Project ids the user can see, or null for "all" (admins). */
export async function accessibleProjectIds(db, ctx) {
  if (isAdmin(ctx)) return null;
  if (!ctx?.user) return [];
  return (await db.all('SELECT "project_id" FROM "project_members" WHERE "user_id" = ?', [ctx.user.id])).map((r) => r.project_id);
}

// ---- CRUD factory ---------------------------------------------------------------------------------------------

/**
 * Build list/get/create/update/remove for a simple table owned by a parent (project, board, workflow…).
 * @param {object} core
 * @param {{ table: string, entity: string, fields: string[], parent?: string, order?: string|string[],
 *           projectOf: (db, row|parentId, isParent?) => Promise<string|null>, need?: 'member'|'admin',
 *           topics?: (row, projectId) => string[], defaults?: (db, parentId, body) => Promise<object>,
 *           validate?: (db, patch, existing) => Promise<void>, beforeRemove?: (db, row, opts) => Promise<void>,
 *           afterRemove?: (db, row) => Promise<void>, out?: (row) => object }} spec
 */
export function crud(core, spec) {
  const { table, entity, fields, parent } = spec;
  const code = entity.toUpperCase().replace(/[^A-Z]/g, '_');
  const need = spec.need || 'admin';
  const out = spec.out || ((r) => toApi(table, r));
  const topics = (row, pid) => (spec.topics ? spec.topics(row, pid) : [pid && `project:${pid}`]);
  const db = () => core.db;

  async function load(id) {
    const row = await db().get(`SELECT * FROM ${db().q(table)} WHERE "id" = ?`, [id]);
    if (!row) throw new NotFoundError(`${code}_NOT_FOUND`, `${entity} not found`);
    return row;
  }

  return {
    async list(ctx, parentId) {
      requireUser(ctx);
      if (parent) {
        const pid = await spec.projectOf(db(), parentId, true);
        if (pid) await assertProject(db(), ctx, pid, 'viewer');
      }
      const rows = await db().select(table, parent ? { [parent]: parentId } : {}, { order: spec.order || 'position' });
      return rows.map(out);
    },
    async get(ctx, id) {
      requireUser(ctx);
      const row = await load(id);
      const pid = await spec.projectOf(db(), row);
      if (pid) await assertProject(db(), ctx, pid, 'viewer');
      return out(row);
    },
    async create(ctx, parentId, body) {
      const pid = parent ? await spec.projectOf(db(), parentId, true) : null;
      if (pid) await assertProject(db(), ctx, pid, need); else requireAdmin(ctx);
      const row = await db().tx(async () => {
        const patch = fromApi(table, body, fields);
        if (parent) patch[parent] = parentId;
        const defaults = spec.defaults ? await spec.defaults(db(), parentId, body) : {};
        const r = { ...defaults, ...patch, id: newId() };
        if (TABLE[table].columns.some((c) => c.name === 'position') && r.position == null) {
          const max = await db().value(`SELECT MAX("position") AS m FROM ${db().q(table)}${parent ? ` WHERE ${db().q(parent)} = ?` : ''}`, parent ? [parentId] : [], -1);
          r.position = Number(max) + 1;
        }
        if (spec.validate) await spec.validate(db(), r, null);
        return db().insert(table, r);
      });
      emit(core, ctx, `${entity}.created`, topics(row, pid), { id: row.id, rev: row.rev, data: out(row) });
      return out(row);
    },
    async update(ctx, id, body) {
      const existing = await load(id);
      const pid = await spec.projectOf(db(), existing);
      if (pid) await assertProject(db(), ctx, pid, need); else requireAdmin(ctx);
      const patch = fromApi(table, body, fields);
      if (spec.validate) await spec.validate(db(), { ...existing, ...patch }, existing);
      const row = await db().update(table, id, patch, { rev: body?.rev });
      emit(core, ctx, `${entity}.updated`, topics(row, pid), { id, rev: row.rev, data: out(row) });
      return out(row);
    },
    async remove(ctx, id, opts = {}) {
      const existing = await load(id);
      const pid = await spec.projectOf(db(), existing);
      if (pid) await assertProject(db(), ctx, pid, need); else requireAdmin(ctx);
      await db().tx(async () => {
        if (spec.beforeRemove) await spec.beforeRemove(db(), existing, opts);
        await db().remove(table, { id });
        if (spec.afterRemove) await spec.afterRemove(db(), existing);
      });
      emit(core, ctx, `${entity}.deleted`, topics(existing, pid), { id });
      return { ok: true };
    },
    /** Set positions from an ordered id list. */
    async reorder(ctx, parentId, ids) {
      const pid = parent ? await spec.projectOf(db(), parentId, true) : null;
      if (pid) await assertProject(db(), ctx, pid, need); else requireAdmin(ctx);
      check(Array.isArray(ids), 'INVALID_ORDER', 'ids must be an array');
      await db().tx(async () => {
        let i = 0;
        for (const id of ids) await db().run(`UPDATE ${db().q(table)} SET "position" = ?, "rev" = "rev" + 1 WHERE "id" = ?${parent ? ` AND ${db().q(parent)} = ?` : ''}`, parent ? [i++, id, parentId] : [i++, id]);
      });
      emit(core, ctx, `${entity}.reordered`, topics({}, pid), { data: { ids } });
      return this.list(ctx, parentId);
    },
  };
}

/** Paging params from a query object. */
export function paging(q, defLimit = 50, maxLimit = 1000) {
  let limit = q?.limit != null && q.limit !== '' ? Number(q.limit) : defLimit;
  let offset = q?.offset != null && q.offset !== '' ? Number(q.offset) : 0;
  if (!Number.isFinite(limit) || limit < 0) limit = defLimit;
  if (!Number.isFinite(offset) || offset < 0) offset = 0;
  return { limit: Math.min(limit, maxLimit), offset };
}

/** Today's date 'YYYY-MM-DD' (local time). */
export function today(ms = Date.now()) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

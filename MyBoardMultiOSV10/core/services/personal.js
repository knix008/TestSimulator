// Per-user things: saved filters, dashboards, notifications; and app settings.
import { newId } from '../ids.js';
import { NotFoundError, ForbiddenError, ValidationError, check } from '../errors.js';
import { toApi, fromApi, emit, nowOf, requireText, requireUser, requireAdmin, isAdmin, paging, parseJson } from './common.js';
import { mentionsIn } from './parts.js';

export const GADGET_TYPES = ['filterResults', 'pie', 'createdVsResolved', 'cfd', 'control', 'throughput', 'workload', 'version', 'assignedToMe', 'activity', 'markdown'];

/** CRUD for rows owned by a user and optionally shared (saved_filters, dashboards). */
function owned(core, { table, entity, fields, validate }) {
  const db = () => core.db;
  const out = (r) => toApi(table, r);
  async function loadFor(ctx, id, write) {
    requireUser(ctx);
    const r = await db().get(`SELECT * FROM ${db().q(table)} WHERE "id" = ?`, [id]);
    const code = entity.toUpperCase();
    if (!r || (!Number(r.shared) && r.owner_id !== ctx.user?.id && !isAdmin(ctx))) throw new NotFoundError(`${code}_NOT_FOUND`, `${entity} not found`);
    if (write && r.owner_id !== ctx.user?.id && !isAdmin(ctx)) throw new ForbiddenError('NOT_OWNER', `Only the owner can change this ${entity}`);
    return r;
  }
  return {
    async list(ctx) {
      requireUser(ctx);
      const rows = await db().all(`SELECT * FROM ${db().q(table)} WHERE "owner_id" = ? OR "shared" = 1 ORDER BY "name"`, [ctx.user?.id || '']);
      return rows.map((r) => ({ ...out(r), mine: r.owner_id === ctx.user?.id }));
    },
    async get(ctx, id) { const r = await loadFor(ctx, id, false); return { ...out(r), mine: r.owner_id === ctx.user?.id }; },
    async create(ctx, body = {}) {
      requireUser(ctx);
      const patch = fromApi(table, body, fields);
      patch.name = requireText(patch.name, 'name', 200);
      if (validate) await validate(ctx, patch);
      const now = nowOf(ctx);
      const r = await db().insert(table, { ...patch, id: newId(), owner_id: ctx.user?.id || null, created_at: now, updated_at: now });
      emit(core, ctx, `${entity}.created`, [`user:${ctx.user?.id}`], { id: r.id, rev: r.rev, data: out(r) });
      return { ...out(r), mine: true };
    },
    async update(ctx, id, body = {}) {
      await loadFor(ctx, id, true);
      const patch = fromApi(table, body, fields);
      if (patch.name !== undefined) patch.name = requireText(patch.name, 'name', 200);
      if (validate) await validate(ctx, patch);
      const r = await db().update(table, id, patch, { rev: body.rev });
      emit(core, ctx, `${entity}.updated`, [`user:${r.owner_id}`], { id, rev: r.rev, data: out(r) });
      return { ...out(r), mine: r.owner_id === ctx.user?.id };
    },
    async remove(ctx, id) {
      const r = await loadFor(ctx, id, true);
      await db().remove(table, { id });
      emit(core, ctx, `${entity}.deleted`, [`user:${r.owner_id}`], { id });
      return { ok: true };
    },
  };
}

export function createPersonal(core) {
  const db = () => core.db;

  const filters = owned(core, {
    table: 'saved_filters', entity: 'filter', fields: ['name', 'jql', 'shared', 'favourite', 'icon'],
    validate: async (ctx, p) => {
      if (p.jql === undefined) return;
      check(typeof p.jql === 'string', 'REQUIRED', 'jql is required', { field: 'jql' });
      const v = await core.services.issues.validateJql(ctx, p.jql);
      if (!v.ok) throw new ValidationError(v.error.code, v.error.message, v.error.details);
    },
  });
  const createFilter = filters.create;
  filters.create = (ctx, body) => createFilter(ctx, { jql: '', ...body });

  const dashboards = owned(core, {
    table: 'dashboards', entity: 'dashboard', fields: ['name', 'icon', 'shared', 'layout'],
    validate: async (ctx, p) => {
      if (p.layout === undefined) return;
      const l = typeof p.layout === 'string' ? JSON.parse(p.layout) : p.layout;
      check(l && typeof l === 'object' && Array.isArray(l.gadgets), 'INVALID_LAYOUT', 'layout needs { columns, gadgets: [] }');
      for (const g of l.gadgets) {
        check(GADGET_TYPES.includes(g.type), 'INVALID_GADGET', `Unknown gadget type: ${g.type}`, { types: GADGET_TYPES });
        if (!g.id) g.id = newId();
      }
      l.columns = Math.min(4, Math.max(1, Number(l.columns) || 2));
      p.layout = JSON.stringify(l);
    },
  });

  // ---- notifications ------------------------------------------------------------------------------------------
  const notifications = {
    async list(ctx, q = {}) {
      requireUser(ctx);
      const { limit, offset } = paging(q, 50, 500);
      const where = q.unread ? ' AND "read" = 0' : '';
      const uid = ctx.user?.id || '';
      const total = Number(await db().value(`SELECT COUNT(*) AS n FROM "notifications" WHERE "user_id" = ?${where}`, [uid], 0));
      const unread = Number(await db().value('SELECT COUNT(*) AS n FROM "notifications" WHERE "user_id" = ? AND "read" = 0', [uid], 0));
      const rows = await db().all(`SELECT * FROM "notifications" WHERE "user_id" = ?${where} ORDER BY "created_at" DESC, "id" DESC${db().limitClause(limit, offset)}`, [uid]);
      return { items: rows.map((r) => toApi('notifications', r)), total, unread };
    },
    /** body: { ids?: string[] } — no ids = all */
    async markRead(ctx, body = {}) {
      requireUser(ctx);
      const uid = ctx.user?.id || '';
      if (Array.isArray(body.ids) && body.ids.length) {
        await db().run(`UPDATE "notifications" SET "read" = 1 WHERE "user_id" = ? AND "id" IN (${body.ids.map(() => '?').join(', ')})`, [uid, ...body.ids]);
      } else await db().run('UPDATE "notifications" SET "read" = 1 WHERE "user_id" = ?', [uid]);
      emit(core, ctx, 'notification.read', [`user:${uid}`], { data: { ids: body.ids || null } });
      return { ok: true };
    },

    /** Event subscriber: issue/comment events → notifications for assignee, watchers and @mentions (not the actor). */
    async onEvent(ev) {
      const d = db();
      const issueId = ev.type.startsWith('comment.') ? ev.data?.issueId : ev.id;
      if (!issueId) return;
      const issue = await d.get('SELECT "id", "key", "summary", "assignee_id", "project_id" FROM "issues" WHERE "id" = ?', [issueId]);
      if (!issue) return;
      const recipients = new Map(); // userId → kind
      const watchers = (await d.select('issue_watchers', { issue_id: issueId })).map((w) => w.user_id);
      let payload = { key: issue.key, summary: issue.summary, by: ev.by };
      switch (ev.type) {
        case 'issue.created':
          if (issue.assignee_id) recipients.set(issue.assignee_id, 'assigned');
          break;
        case 'issue.updated': {
          const ch = ev.data?.changes || [];
          const assigned = ch.find((c) => c.field === 'assignee' && c.to);
          if (assigned) recipients.set(assigned.to, 'assigned');
          for (const w of watchers) if (!recipients.has(w)) recipients.set(w, 'updated');
          payload = { ...payload, fields: ch.map((c) => c.field) };
          break;
        }
        case 'issue.transitioned':
          for (const w of watchers) recipients.set(w, 'transitioned');
          payload = { ...payload, fromStatusId: ev.data?.fromStatusId, toStatusId: ev.data?.toStatusId };
          break;
        case 'comment.created': {
          for (const w of watchers) recipients.set(w, 'commented');
          const names = ev.data?.mentions || mentionsIn(ev.data?.body);
          if (names.length) {
            const users = await d.all(`SELECT "id" FROM "users" WHERE "username" IN (${names.map(() => '?').join(', ')})`, names);
            for (const u of users) recipients.set(u.id, 'mentioned');
          }
          payload = { ...payload, commentId: ev.id, excerpt: String(ev.data?.body || '').slice(0, 200) };
          break;
        }
        default: return;
      }
      recipients.delete(ev.by);
      if (!recipients.size) return;
      const rows = [...recipients].map(([user_id, kind]) => ({ id: newId(), user_id, issue_id: issueId, kind, payload, read: 0, created_at: ev.at || Date.now() }));
      await d.insertMany('notifications', rows);
      for (const r of rows) {
        core.events.emit({ type: 'notification.created', topics: [`user:${r.user_id}`], id: r.id, data: toApi('notifications', d.prepareRow('notifications', r)), by: ev.by, at: r.created_at, client: null, depth: ev.depth });
      }
    },
  };

  // ---- app settings (key → json) ------------------------------------------------------------------------------
  const settings = {
    async get(ctx) {
      requireUser(ctx);
      const rows = await db().select('app_settings', {});
      return Object.fromEntries(rows.map((r) => [r.key, parseJson(r.value)]));
    },
    async set(ctx, patch = {}) {
      requireAdmin(ctx);
      await db().tx(async () => {
        for (const [key, value] of Object.entries(patch)) {
          check(key.length <= 64, 'TOO_LONG', 'setting keys are at most 64 characters');
          await db().remove('app_settings', { key });
          if (value !== null) await db().insert('app_settings', { key, value: JSON.stringify(value), updated_at: Date.now() });
        }
      });
      emit(core, ctx, 'settings.updated', ['settings'], { data: patch });
      return settings.get(ctx);
    },
  };

  return { filters, dashboards, notifications, settings };
}

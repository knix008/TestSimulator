// Issue parts: comments, attachments, worklogs (time tracking), links, checklist, watchers, votes, history.
import { newId } from '../ids.js';
import * as rank from '../rank.js';
import { AppError, NotFoundError, ValidationError, ForbiddenError, check } from '../errors.js';
import { toApi, emit, nowOf, requireText, isAdmin } from './common.js';
import { writeHistory } from './history.js';
import { LINK_KINDS } from './issues.js';

export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

/** '1w 2d 3h 30m' → seconds (1d = 8h, 1w = 5d, like time tracking boards do). Plain numbers are seconds. */
export function parseTimeSpent(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Math.round(v);
  const s = String(v).trim().toLowerCase();
  if (/^\d+$/.test(s)) return Number(s);
  const unit = { w: 5 * 8 * 3600, d: 8 * 3600, h: 3600, m: 60, s: 1 };
  let total = 0;
  const re = /(\d+(?:\.\d+)?)\s*([wdhms])/g;
  let m;
  let consumed = '';
  while ((m = re.exec(s))) { total += Number(m[1]) * unit[m[2]]; consumed += m[0]; }
  if (!consumed || s.replace(/\s+/g, '') !== consumed.replace(/\s+/g, '')) throw new ValidationError('INVALID_DURATION', 'Use a duration like 1w 2d 3h 30m');
  return Math.round(total);
}

/** @usernames in Markdown text. */
export function mentionsIn(text) {
  return [...new Set([...String(text || '').matchAll(/(^|[^\w@])@([a-z0-9][a-z0-9._-]{0,63})/gi)].map((m) => m[2].toLowerCase()))];
}

export function createParts(core) {
  const db = () => core.db;
  const issues = () => core.services.issues;
  const topics = (issue) => [`project:${issue.project_id}`, `issue:${issue.id}`];

  /** Touch the issue (updated_at, rev) so boards and caches notice. */
  async function touch(ctx, issue) {
    return db().update('issues', issue.id, { updated_at: nowOf(ctx) });
  }

  // ---- comments -------------------------------------------------------------------------------------------
  const comments = {
    async list(ctx, issueId) {
      const issue = await issues().loadFor(ctx, issueId, 'viewer');
      const rows = await db().select('comments', { issue_id: issue.id }, { order: 'created_at' });
      return rows.map((r) => toApi('comments', r));
    },
    /** Insert without permission checks/events (used inside transitions and automation). */
    async insertRaw(ctx, issue, body) {
      const now = nowOf(ctx);
      const row = await db().insert('comments', { id: newId(), issue_id: issue.id, author_id: ctx.user?.id || null, body: requireText(body, 'body', 1e6), created_at: now, updated_at: now });
      if (ctx.user?.id) await issues().addWatcher(issue.id, ctx.user.id, now);
      db().afterCommit(() => emit(core, ctx, 'comment.created', topics(issue), {
        id: row.id, rev: row.rev, data: { ...toApi('comments', row), issueKey: issue.key, projectId: issue.project_id, mentions: mentionsIn(row.body) },
      }));
      return row;
    },
    async add(ctx, issueId, { body }) {
      const issue = await issues().loadFor(ctx, issueId, 'member');
      const row = await db().tx(async () => {
        const r = await comments.insertRaw({ ...ctx }, issue, body);
        await touch(ctx, issue);
        return r;
      });
      return toApi('comments', row);
    },
    async update(ctx, id, { body, rev }) {
      const c = await db().get('SELECT * FROM "comments" WHERE "id" = ?', [id]);
      if (!c) throw new NotFoundError('COMMENT_NOT_FOUND', 'Comment not found');
      const issue = await issues().loadFor(ctx, c.issue_id, 'member');
      if (c.author_id !== ctx.user?.id && !isAdmin(ctx)) throw new ForbiddenError('NOT_AUTHOR', 'Only the author can edit a comment');
      const row = await db().update('comments', id, { body: requireText(body, 'body', 1e6), updated_at: nowOf(ctx) }, { rev });
      emit(core, ctx, 'comment.updated', topics(issue), { id, rev: row.rev, data: toApi('comments', row) });
      return toApi('comments', row);
    },
    async remove(ctx, id) {
      const c = await db().get('SELECT * FROM "comments" WHERE "id" = ?', [id]);
      if (!c) throw new NotFoundError('COMMENT_NOT_FOUND', 'Comment not found');
      const issue = await issues().loadFor(ctx, c.issue_id, 'member');
      if (c.author_id !== ctx.user?.id && !isAdmin(ctx)) throw new ForbiddenError('NOT_AUTHOR', 'Only the author can delete a comment');
      await db().remove('comments', { id });
      emit(core, ctx, 'comment.deleted', topics(issue), { id, data: { issueId: issue.id } });
      return { ok: true };
    },
  };

  // ---- attachments ----------------------------------------------------------------------------------------
  const META = ['id', 'issue_id', 'file_name', 'mime', 'size', 'author_id', 'created_at'];
  const attachments = {
    async list(ctx, issueId) {
      const issue = await issues().loadFor(ctx, issueId, 'viewer');
      return (await db().select('attachments', { issue_id: issue.id }, { order: 'created_at', columns: META })).map((r) => toApi('attachments', r));
    },
    /** body: { fileName, mime, data: base64 } or { fileName, mime, buffer } */
    async add(ctx, issueId, body) {
      const issue = await issues().loadFor(ctx, issueId, 'member');
      const fileName = requireText(body.fileName || body.file_name, 'fileName', 255).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_');
      const data = body.buffer ? Buffer.from(body.buffer) : Buffer.from(String(body.data || ''), 'base64');
      check(data.length > 0, 'EMPTY_FILE', 'The file is empty');
      const max = core.config?.maxAttachmentBytes || MAX_ATTACHMENT_BYTES;
      check(data.length <= max, 'FILE_TOO_LARGE', `Files are limited to ${Math.round(max / 1048576)} MB`, { max });
      const mime = String(body.mime || 'application/octet-stream').slice(0, 100);
      const now = nowOf(ctx);
      const row = await db().tx(async () => {
        const r = await db().insert('attachments', { id: newId(), issue_id: issue.id, file_name: fileName, mime, size: data.length, data, author_id: ctx.user?.id || null, created_at: now });
        await writeHistory(db(), issue.id, ctx.user?.id, now, [{ field: 'attachment', to_value: r.id, to_label: fileName }]);
        await touch(ctx, issue);
        return r;
      });
      const out = toApi('attachments', row);
      emit(core, ctx, 'attachment.created', topics(issue), { id: row.id, data: out });
      return out;
    },
    /** → { fileName, mime, size, data: Buffer } */
    async download(ctx, id) {
      const a = await db().get('SELECT * FROM "attachments" WHERE "id" = ?', [id]);
      if (!a) throw new NotFoundError('ATTACHMENT_NOT_FOUND', 'Attachment not found');
      await issues().loadFor(ctx, a.issue_id, 'viewer');
      return { fileName: a.file_name, mime: a.mime, size: Number(a.size), data: a.data };
    },
    async remove(ctx, id) {
      const a = await db().get(`SELECT ${META.map((c) => db().q(c)).join(', ')} FROM "attachments" WHERE "id" = ?`, [id]);
      if (!a) throw new NotFoundError('ATTACHMENT_NOT_FOUND', 'Attachment not found');
      const issue = await issues().loadFor(ctx, a.issue_id, 'member');
      await db().tx(async () => {
        await db().remove('attachments', { id });
        await writeHistory(db(), issue.id, ctx.user?.id, nowOf(ctx), [{ field: 'attachment', from_value: id, from_label: a.file_name }]);
      });
      emit(core, ctx, 'attachment.deleted', topics(issue), { id, data: { issueId: issue.id } });
      return { ok: true };
    },
  };

  // ---- worklogs -------------------------------------------------------------------------------------------
  /** Recompute time_spent; adjust remaining (auto = reduce by the delta, or an explicit value). */
  async function retime(ctx, issue, delta, remaining) {
    const spent = Number(await db().value('SELECT SUM("seconds") AS s FROM "worklogs" WHERE "issue_id" = ?', [issue.id], 0));
    const patch = { time_spent: spent, updated_at: nowOf(ctx) };
    if (remaining !== undefined && remaining !== 'auto') patch.remaining_estimate = parseTimeSpent(remaining);
    else if (issue.remaining_estimate != null || issue.original_estimate != null) {
      const base = issue.remaining_estimate ?? issue.original_estimate;
      patch.remaining_estimate = Math.max(0, Number(base) - delta);
    }
    const hist = [{ field: 'timeSpent', from_value: issue.time_spent, to_value: spent }];
    if ('remaining_estimate' in patch && patch.remaining_estimate !== issue.remaining_estimate) hist.push({ field: 'remainingEstimate', from_value: issue.remaining_estimate, to_value: patch.remaining_estimate });
    await writeHistory(db(), issue.id, ctx.user?.id, nowOf(ctx), hist);
    return db().update('issues', issue.id, patch);
  }

  const worklogs = {
    async list(ctx, issueId) {
      const issue = await issues().loadFor(ctx, issueId, 'viewer');
      return (await db().select('worklogs', { issue_id: issue.id }, { order: 'started_at' })).map((r) => toApi('worklogs', r));
    },
    /** body: { seconds | timeSpent: '1h 30m', startedAt?, comment?, remainingEstimate?: 'auto' | duration } */
    async add(ctx, issueId, body) {
      const issue = await issues().loadFor(ctx, issueId, 'member');
      const seconds = parseTimeSpent(body.seconds ?? body.timeSpent);
      check(seconds > 0, 'INVALID_DURATION', 'The time spent must be positive');
      const now = nowOf(ctx);
      const row = await db().tx(async () => {
        const r = await db().insert('worklogs', { id: newId(), issue_id: issue.id, author_id: ctx.user?.id || null, started_at: Number(body.startedAt) || now, seconds, comment: body.comment || null, created_at: now, updated_at: now });
        await retime(ctx, await issues().load(issue.id), seconds, body.remainingEstimate);
        return r;
      });
      emit(core, ctx, 'worklog.created', topics(issue), { id: row.id, data: toApi('worklogs', row) });
      return toApi('worklogs', row);
    },
    async update(ctx, id, body) {
      const w = await db().get('SELECT * FROM "worklogs" WHERE "id" = ?', [id]);
      if (!w) throw new NotFoundError('WORKLOG_NOT_FOUND', 'Work log not found');
      const issue = await issues().loadFor(ctx, w.issue_id, 'member');
      if (w.author_id !== ctx.user?.id && !isAdmin(ctx)) throw new ForbiddenError('NOT_AUTHOR', 'Only the author can edit a work log');
      const patch = {};
      if (body.seconds !== undefined || body.timeSpent !== undefined) { patch.seconds = parseTimeSpent(body.seconds ?? body.timeSpent); check(patch.seconds > 0, 'INVALID_DURATION', 'The time spent must be positive'); }
      if (body.startedAt !== undefined) patch.started_at = Number(body.startedAt);
      if (body.comment !== undefined) patch.comment = body.comment;
      const row = await db().tx(async () => {
        const r = await db().update('worklogs', id, patch, { rev: body.rev });
        await retime(ctx, await issues().load(issue.id), (patch.seconds ?? w.seconds) - w.seconds, body.remainingEstimate);
        return r;
      });
      emit(core, ctx, 'worklog.updated', topics(issue), { id, data: toApi('worklogs', row) });
      return toApi('worklogs', row);
    },
    async remove(ctx, id) {
      const w = await db().get('SELECT * FROM "worklogs" WHERE "id" = ?', [id]);
      if (!w) throw new NotFoundError('WORKLOG_NOT_FOUND', 'Work log not found');
      const issue = await issues().loadFor(ctx, w.issue_id, 'member');
      if (w.author_id !== ctx.user?.id && !isAdmin(ctx)) throw new ForbiddenError('NOT_AUTHOR', 'Only the author can delete a work log');
      await db().tx(async () => {
        await db().remove('worklogs', { id });
        await retime(ctx, await issues().load(issue.id), -Number(w.seconds), undefined);
      });
      emit(core, ctx, 'worklog.deleted', topics(issue), { id, data: { issueId: issue.id } });
      return { ok: true };
    },
  };

  // ---- links ----------------------------------------------------------------------------------------------
  const links = {
    async list(ctx, issueId) { return (await issues().get(ctx, issueId)).links; },
    /** body: { targetId | targetKey, kind } (source = this issue; "blocks" means this blocks target) */
    async add(ctx, issueId, body) {
      const issue = await issues().loadFor(ctx, issueId, 'member');
      const kind = body.kind || 'relates';
      check(kind in LINK_KINDS, 'INVALID_LINK_KIND', `kind must be one of ${Object.keys(LINK_KINDS).join(', ')}`);
      const target = await issues().loadFor(ctx, body.targetId || body.targetKey, 'viewer');
      check(target.id !== issue.id, 'INVALID_LINK', 'An issue cannot link to itself');
      const dup = await db().get('SELECT "id" FROM "issue_links" WHERE "source_id" = ? AND "target_id" = ? AND "kind" = ?', [issue.id, target.id, kind]);
      if (dup) throw new AppError('LINK_EXISTS', 'These issues are already linked this way', 409);
      const now = nowOf(ctx);
      const row = await db().tx(async () => {
        const r = await db().insert('issue_links', { id: newId(), source_id: issue.id, target_id: target.id, kind, created_by: ctx.user?.id || null, created_at: now });
        await writeHistory(db(), issue.id, ctx.user?.id, now, [{ field: 'link', to_value: target.id, to_label: `${LINK_KINDS[kind][0]} ${target.key}` }]);
        await writeHistory(db(), target.id, ctx.user?.id, now, [{ field: 'link', to_value: issue.id, to_label: `${LINK_KINDS[kind][1]} ${issue.key}` }]);
        return r;
      });
      emit(core, ctx, 'link.created', [...topics(issue), `issue:${target.id}`], { id: row.id, data: { id: row.id, sourceId: issue.id, targetId: target.id, kind } });
      return { id: row.id, sourceId: issue.id, targetId: target.id, kind };
    },
    async remove(ctx, linkId) {
      const l = await db().get('SELECT * FROM "issue_links" WHERE "id" = ?', [linkId]);
      if (!l) throw new NotFoundError('LINK_NOT_FOUND', 'Link not found');
      const issue = await issues().loadFor(ctx, l.source_id, 'member');
      await db().remove('issue_links', { id: linkId });
      emit(core, ctx, 'link.deleted', [...topics(issue), `issue:${l.target_id}`], { id: linkId, data: { sourceId: l.source_id, targetId: l.target_id } });
      return { ok: true };
    },
  };

  // ---- checklist ------------------------------------------------------------------------------------------
  async function itemOf(ctx, id, need) {
    const it = await db().get('SELECT * FROM "checklist_items" WHERE "id" = ?', [id]);
    if (!it) throw new NotFoundError('CHECKLIST_ITEM_NOT_FOUND', 'Checklist item not found');
    const issue = await issues().loadFor(ctx, it.issue_id, need);
    return { it, issue };
  }
  async function positionBetween(issueId, afterId, beforeId) {
    const pos = async (id) => (id ? (await db().get('SELECT "position" FROM "checklist_items" WHERE "id" = ? AND "issue_id" = ?', [id, issueId]))?.position ?? null : null);
    let a = await pos(afterId);
    let b = await pos(beforeId);
    if (a && b && a >= b) b = null;
    if (a && !b) b = await db().value('SELECT MIN("position") AS p FROM "checklist_items" WHERE "issue_id" = ? AND "position" > ?', [issueId, a]);
    if (!a && !b && !beforeId) a = await db().value('SELECT MAX("position") AS p FROM "checklist_items" WHERE "issue_id" = ?', [issueId]);
    if (!a && b && !afterId) a = await db().value('SELECT MAX("position") AS p FROM "checklist_items" WHERE "issue_id" = ? AND "position" < ?', [issueId, b]);
    return rank.between(a || null, b || null);
  }
  const checklist = {
    async list(ctx, issueId) {
      const issue = await issues().loadFor(ctx, issueId, 'viewer');
      return (await db().select('checklist_items', { issue_id: issue.id }, { order: 'position' })).map((r) => toApi('checklist_items', r));
    },
    async add(ctx, issueId, body) {
      const issue = await issues().loadFor(ctx, issueId, 'member');
      const now = nowOf(ctx);
      const row = await db().tx(async () => db().insert('checklist_items', {
        id: newId(), issue_id: issue.id, text: requireText(body.text, 'text', 500), done: body.done ? 1 : 0,
        position: await positionBetween(issue.id, body.afterId, body.beforeId), created_at: now, updated_at: now,
      }));
      emit(core, ctx, 'checklist.created', topics(issue), { id: row.id, rev: row.rev, data: toApi('checklist_items', row) });
      return toApi('checklist_items', row);
    },
    async update(ctx, id, body) {
      const { issue } = await itemOf(ctx, id, 'member');
      const patch = {};
      if (body.text !== undefined) patch.text = requireText(body.text, 'text', 500);
      if (body.done !== undefined) patch.done = body.done ? 1 : 0;
      const row = await db().tx(async () => {
        if (body.afterId !== undefined || body.beforeId !== undefined) patch.position = await positionBetween(issue.id, body.afterId, body.beforeId);
        return db().update('checklist_items', id, patch, { rev: body.rev });
      });
      emit(core, ctx, 'checklist.updated', topics(issue), { id, rev: row.rev, data: toApi('checklist_items', row) });
      return toApi('checklist_items', row);
    },
    async remove(ctx, id) {
      const { issue } = await itemOf(ctx, id, 'member');
      await db().remove('checklist_items', { id });
      emit(core, ctx, 'checklist.deleted', topics(issue), { id, data: { issueId: issue.id } });
      return { ok: true };
    },
  };

  // ---- watchers / votes -----------------------------------------------------------------------------------
  const userList = async (table, issueId) => (await db().all(
    `SELECT u."id", u."username", u."display_name", u."avatar" FROM ${db().q(table)} w JOIN "users" u ON u."id" = w."user_id" WHERE w."issue_id" = ? ORDER BY u."display_name"`, [issueId],
  )).map((u) => ({ id: u.id, username: u.username, displayName: u.display_name, avatar: u.avatar }));

  const watchers = {
    async list(ctx, issueId) { const issue = await issues().loadFor(ctx, issueId, 'viewer'); return userList('issue_watchers', issue.id); },
    async add(ctx, issueId, body = {}) {
      const issue = await issues().loadFor(ctx, issueId, 'viewer');
      const userId = body.userId || ctx.user?.id;
      if (userId !== ctx.user?.id) await issues().loadFor(ctx, issueId, 'member');
      if (!(await db().get('SELECT "id" FROM "users" WHERE "id" = ?', [userId]))) throw new NotFoundError('USER_NOT_FOUND', 'User not found');
      await issues().addWatcher(issue.id, userId, nowOf(ctx));
      emit(core, ctx, 'watcher.created', topics(issue), { id: userId, data: { issueId: issue.id, userId } });
      return userList('issue_watchers', issue.id);
    },
    async remove(ctx, issueId, userId) {
      const issue = await issues().loadFor(ctx, issueId, 'viewer');
      const uid = userId || ctx.user?.id;
      if (uid !== ctx.user?.id) await issues().loadFor(ctx, issueId, 'member');
      await db().remove('issue_watchers', { issue_id: issue.id, user_id: uid });
      emit(core, ctx, 'watcher.deleted', topics(issue), { id: uid, data: { issueId: issue.id, userId: uid } });
      return userList('issue_watchers', issue.id);
    },
  };

  const votes = {
    async list(ctx, issueId) { const issue = await issues().loadFor(ctx, issueId, 'viewer'); return userList('issue_votes', issue.id); },
    async vote(ctx, issueId) {
      const issue = await issues().loadFor(ctx, issueId, 'viewer');
      check(!!ctx.user, 'LOGIN_REQUIRED', 'Login required');
      check(issue.reporter_id !== ctx.user.id, 'CANNOT_VOTE_OWN', 'You cannot vote for your own issue');
      if (!(await db().get('SELECT 1 AS x FROM "issue_votes" WHERE "issue_id" = ? AND "user_id" = ?', [issue.id, ctx.user.id]))) {
        await db().insert('issue_votes', { issue_id: issue.id, user_id: ctx.user.id, created_at: nowOf(ctx) });
      }
      emit(core, ctx, 'vote.created', topics(issue), { id: ctx.user.id, data: { issueId: issue.id } });
      return { count: await db().count('issue_votes', { issue_id: issue.id }), voted: true };
    },
    async unvote(ctx, issueId) {
      const issue = await issues().loadFor(ctx, issueId, 'viewer');
      await db().remove('issue_votes', { issue_id: issue.id, user_id: ctx.user?.id });
      emit(core, ctx, 'vote.deleted', topics(issue), { id: ctx.user?.id, data: { issueId: issue.id } });
      return { count: await db().count('issue_votes', { issue_id: issue.id }), voted: false };
    },
  };

  const history = {
    async list(ctx, issueId) {
      const issue = await issues().loadFor(ctx, issueId, 'viewer');
      const rows = await db().all(
        'SELECT h.*, u."display_name" AS user_name FROM "issue_history" h LEFT JOIN "users" u ON u."id" = h."user_id" WHERE h."issue_id" = ? ORDER BY h."at", h."id"', [issue.id]);
      return rows.map((r) => ({ ...toApi('issue_history', r), userName: r.user_name || null }));
    },
  };

  return { comments, attachments, worklogs, links, checklist, watchers, votes, history };
}

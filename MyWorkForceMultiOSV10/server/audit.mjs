// The audit log: every change to administrator rights and accounts ("admin"), and what people do
// ("user": signing in and out, and what each save created, changed or deleted). Kept in the audit_log
// table of the connected database, whatever its engine. Who and what are sealed with the database's key
// like the rest of the data; the time, the kind of event and the category stay plain so they can be sorted.

import { randomBytes } from 'node:crypto';
import { isWorkspaceAdmin } from '../src/domain/permissions.js';
import { openValue, seal } from './privacy.mjs';

/** Every event the log knows, with its category. */
export const AUDIT_EVENTS = {
  'admin-seed': 'admin',
  'admin-grant': 'admin',
  'admin-revoke': 'admin',
  'user-create': 'admin',
  'user-delete': 'admin',
  'login-change': 'admin',
  'user-activate': 'admin',
  'user-deactivate': 'admin',
  'password-set': 'admin',
  'lock-policy': 'admin',
  'lock-release': 'admin',
  'database-connect': 'admin',
  'encryption-key-view': 'admin',
  'signin': 'user',
  'signin-failed': 'user',
  'signin-locked': 'user',
  'signout': 'user',
  'password-change': 'user',
  'save': 'user',
};

const lower = (record) => Object.fromEntries(Object.entries(record || {}).map(([name, value]) => [name.toLowerCase(), value]));

/**
 * Writes one event. `actor` is the person who did it ({ id, login }) or null for the program itself.
 * Never throws: a log that cannot be written must not stop the work it describes (it is reported on stderr).
 */
export async function writeAudit(engine, key, { action, actor = null, targetId = '', detail = {}, source = '' }) {
  if (!engine) return null;
  const at = new Date().toISOString();
  const id = `log-${at.replace(/[^0-9]/g, '')}-${randomBytes(4).toString('hex')}`;
  try {
    await engine.query(
      'INSERT INTO audit_log (id, created_at, category, actor_id, actor_login, action, target_id, detail, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, at, AUDIT_EVENTS[action] || 'user', actor?.id || '', seal(actor?.login || '', key), action, targetId || '', seal(JSON.stringify(detail || {}), key), seal(source || '', key)],
    );
    return id;
  } catch (error) {
    console.error('audit', action, error?.message || error);
    return null;
  }
}

/**
 * Reads the log, newest first. Filters: category ('admin' | 'user'), action, actor (login or id),
 * from / to (dates or ISO times, inclusive), q (words found anywhere in the entry). The time range and
 * category are applied in SQL; the rest after opening the sealed values.
 */
export async function readAudit(engine, key, filter = {}) {
  const where = [];
  const params = [];
  if (filter.category === 'admin' || filter.category === 'user') { where.push('category = ?'); params.push(filter.category); }
  if (filter.action) { where.push('action = ?'); params.push(String(filter.action)); }
  const from = String(filter.from || '').trim();
  const to = String(filter.to || '').trim();
  if (from) { where.push('created_at >= ?'); params.push(from); }
  // A date alone means the whole of that day.
  if (to) { where.push('created_at <= ?'); params.push(/^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to}T23:59:59.999Z` : to); }
  const limit = Math.min(Math.max(Number(filter.limit) || 200, 1), 1000);
  // Scanning is bounded so a large log stays quick; the newest entries come first.
  const scan = Math.max(limit, 5000);
  const sql = `SELECT id, created_at, category, actor_id, actor_login, action, target_id, detail, source FROM audit_log${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC`;
  const rows = (await engine.query(sql, params)).slice(0, scan).map(lower);
  const actor = String(filter.actor || '').trim().toLowerCase();
  const words = String(filter.q || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const out = [];
  for (const row of rows) {
    let detail = {};
    try { detail = JSON.parse(openValue(row.detail, key) || '{}'); } catch { detail = { unreadable: true }; }
    const entry = {
      id: row.id,
      at: row.created_at,
      category: row.category,
      action: row.action,
      actorId: row.actor_id,
      actorLogin: safeOpen(row.actor_login, key),
      targetId: row.target_id,
      detail,
      source: safeOpen(row.source, key),
    };
    if (actor && entry.actorLogin.toLowerCase() !== actor && entry.actorId.toLowerCase() !== actor) continue;
    if (words.length) {
      const text = `${entry.action} ${entry.actorLogin} ${entry.targetId} ${entry.source} ${JSON.stringify(entry.detail)}`.toLowerCase();
      if (!words.every((word) => text.includes(word))) continue;
    }
    out.push(entry);
    if (out.length >= limit) break;
  }
  return out;
}

function safeOpen(value, key) {
  try { return openValue(value, key); } catch { return ''; }
}

const byId = (list) => new Map((list || []).map((item) => [item.id, item]));
const label = (user) => user?.login || user?.name || user?.id || '';

/**
 * What a save changed. `admin` lists account and rights changes (one event each); `user` sums up the work:
 * projects, issues and pages created, changed or deleted.
 */
export function workspaceChanges(before, after) {
  const admin = [];
  const was = byId(before?.users);
  const now = byId(after?.users);
  for (const [id, user] of now) {
    const old = was.get(id);
    if (!old) { admin.push({ action: 'user-create', targetId: id, detail: { login: label(user), name: user.name || '', admin: isWorkspaceAdmin(user) } }); continue; }
    if ((old.login || '') !== (user.login || '')) admin.push({ action: 'login-change', targetId: id, detail: { from: old.login || '', to: user.login || '' } });
    if (isWorkspaceAdmin({ ...old, active: true }) !== isWorkspaceAdmin({ ...user, active: true })) {
      admin.push({ action: isWorkspaceAdmin({ ...user, active: true }) ? 'admin-grant' : 'admin-revoke', targetId: id, detail: { login: label(user) } });
    }
    if ((old.active !== false) !== (user.active !== false)) admin.push({ action: user.active === false ? 'user-deactivate' : 'user-activate', targetId: id, detail: { login: label(user) } });
  }
  for (const [id, user] of was) if (!now.has(id)) admin.push({ action: 'user-delete', targetId: id, detail: { login: label(user) } });
  const oldLock = before?.security?.lockMinutes;
  const newLock = after?.security?.lockMinutes;
  if (before && (oldLock ?? null) !== (newLock ?? null)) admin.push({ action: 'lock-policy', targetId: '', detail: { from: oldLock ?? 10, to: newLock ?? 10 } });

  const work = { projects: { created: [], deleted: [] }, issues: { created: [], changed: [], deleted: [] }, pages: { created: [], changed: [], deleted: [] } };
  const oldProjects = byId(before?.projects);
  const newProjects = byId(after?.projects);
  for (const [id, project] of newProjects) if (!oldProjects.has(id)) work.projects.created.push(project.key || project.name || id);
  for (const [id, project] of oldProjects) if (!newProjects.has(id)) work.projects.deleted.push(project.key || project.name || id);
  const issues = (ws) => new Map((ws?.projects || []).flatMap((project) => (project.issues || []).map((issue) => [issue.id, issue])));
  const oldIssues = issues(before);
  const newIssues = issues(after);
  for (const [id, issue] of newIssues) {
    const old = oldIssues.get(id);
    if (!old) work.issues.created.push(issue.key || id);
    else if ((old.updated || '') !== (issue.updated || '') || old.statusId !== issue.statusId || old.summary !== issue.summary) work.issues.changed.push(issue.key || id);
  }
  for (const [id, issue] of oldIssues) if (!newIssues.has(id)) work.issues.deleted.push(issue.key || id);
  const oldPages = byId(before?.articles);
  const newPages = byId(after?.articles);
  for (const [id, page] of newPages) {
    const old = oldPages.get(id);
    if (!old) work.pages.created.push(page.title || id);
    else if ((old.updated || '') !== (page.updated || '') || old.title !== page.title || old.body !== page.body) work.pages.changed.push(page.title || id);
  }
  for (const [id, page] of oldPages) if (!newPages.has(id)) work.pages.deleted.push(page.title || id);
  // Only what happened is kept, each list capped so one big import stays one readable entry.
  const user = {};
  for (const [kind, lists] of Object.entries(work)) {
    for (const [what, items] of Object.entries(lists)) {
      if (!items.length) continue;
      user[kind] = user[kind] || {};
      user[kind][what] = { count: items.length, items: items.slice(0, 20) };
    }
  }
  return { admin, user: Object.keys(user).length ? user : null };
}

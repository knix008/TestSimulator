import { nowIso, uid } from './util.js';

/** Events a person can turn on for one target. `watch` keeps notices for issues they already watch. */
export const NOTICE_EVENTS = {
  project: ['watch', 'created', 'assign', 'comment', 'transition', 'page'],
  page: ['edit', 'comment'],
  document: ['edit'],
  issue: ['assign', 'comment', 'transition'],
};

export function upgradeNotices(ws) {
  ws.notices = Array.isArray(ws.notices) ? ws.notices : [];
  return ws;
}

export function noticeOf(ws, userId, scope, targetId) {
  return (ws?.notices || []).find((item) => item.userId === userId && item.scope === scope && item.targetId === targetId) || null;
}

export function noticeChecked(ws, userId, scope, targetId, event, fallback = false) {
  const notice = noticeOf(ws, userId, scope, targetId);
  if (!notice) return fallback;
  return Boolean(notice.events?.[event]);
}

function syncWatch(list, userId, on) {
  const watchers = Array.isArray(list) ? list : [];
  const index = watchers.indexOf(userId);
  if (on && index < 0) watchers.push(userId);
  if (!on && index >= 0) watchers.splice(index, 1);
  return watchers;
}

export function setNotice(ws, userId, scope, targetId, events) {
  const keys = NOTICE_EVENTS[scope];
  if (!userId || !targetId || !keys) throw new Error('not-found');
  upgradeNotices(ws);
  const clean = {};
  for (const key of keys) clean[key] = Boolean(events?.[key]);
  const index = ws.notices.findIndex((item) => item.userId === userId && item.scope === scope && item.targetId === targetId);
  const row = { userId, scope, targetId, events: clean };
  if (index >= 0) ws.notices[index] = row;
  else ws.notices.push(row);
  const on = Object.values(clean).some(Boolean);
  if (scope === 'page') {
    const page = (ws.articles || []).find((item) => item.id === targetId);
    if (page) page.watchers = syncWatch(page.watchers, userId, on);
  }
  if (scope === 'issue') {
    for (const project of ws.projects || []) {
      const issue = (project.issues || []).find((item) => item.id === targetId);
      if (issue) issue.watchers = syncWatch(issue.watchers, userId, on);
    }
  }
  return row;
}

/** `direct` means this person already watches the issue, was assigned, or was mentioned. */
export function wantsEvent(ws, userId, projectId, event, { direct = false, issueId = '', pageId = '', documentId = '' } = {}) {
  if (documentId) return Boolean(noticeOf(ws, userId, 'document', documentId)?.events?.[event]);
  if (pageId) {
    const page = noticeOf(ws, userId, 'page', pageId);
    if (page) return Boolean(page.events?.[event]);
    if (noticeOf(ws, userId, 'project', projectId)?.events?.page) return true;
    return direct;
  }
  const issue = issueId ? noticeOf(ws, userId, 'issue', issueId) : null;
  if (issue && Object.prototype.hasOwnProperty.call(issue.events || {}, event)) return Boolean(issue.events[event]);
  const project = noticeOf(ws, userId, 'project', projectId);
  if (project) {
    if (project.events?.[event]) return true;
    if (direct && project.events?.watch !== false) return true;
    return false;
  }
  return direct;
}

/** Sends one notice to direct recipients and to anyone whose saved choice includes the event. */
export function deliver(ws, project, directIds, entry, target = {}) {
  if (!project) return;
  project.notifications = project.notifications || [];
  const event = target.event || entry.kind;
  const issueId = target.issueId || entry.issueId || '';
  const pageId = target.pageId || '';
  const documentId = target.documentId || '';
  const direct = new Set((directIds || []).filter(Boolean));
  const ids = new Set(direct);
  for (const notice of ws?.notices || []) {
    if (!notice?.userId) continue;
    if (notice.scope === 'project' && notice.targetId === project.id) {
      if (pageId ? notice.events?.page : notice.events?.[event]) ids.add(notice.userId);
    } else if (issueId && notice.scope === 'issue' && notice.targetId === issueId && notice.events?.[event]) ids.add(notice.userId);
    else if (pageId && notice.scope === 'page' && notice.targetId === pageId && notice.events?.[event]) ids.add(notice.userId);
    else if (documentId && notice.scope === 'document' && notice.targetId === documentId && notice.events?.[event]) ids.add(notice.userId);
  }
  const at = nowIso();
  for (const userId of ids) {
    if (!userId || userId === entry.actorId) continue;
    if (!wantsEvent(ws, userId, project.id, event, { direct: direct.has(userId), issueId, pageId, documentId })) continue;
    project.notifications.unshift({ id: uid('n'), userId, read: false, at, issueKey: entry.issueKey || '', ...entry });
  }
  if (project.notifications.length > 300) project.notifications.length = 300;
}

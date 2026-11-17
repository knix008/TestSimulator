import { nowIso, uid } from './util.js';
import { addPage, deletePage, ensureWiki } from './wiki.js';

export const MODULES = [
  { id: 'knowledge', ko: '페이지', en: 'Pages' },
  { id: 'calendar', ko: '근무 달력', en: 'Work calendar' },
  { id: 'portal', ko: '고객 포털', en: 'Customer portal' },
  { id: 'approvals', ko: '승인', en: 'Approvals' },
  { id: 'webhooks', ko: '웹훅', en: 'Webhooks' },
  { id: 'mail', ko: '메일', en: 'Mail' },
  { id: 'plans', ko: '교차 계획', en: 'Cross-project plan' },
  { id: 'documents', ko: '문서', en: 'Documents' },
  { id: 'rest', ko: '외부 API', en: 'External API' },
];

export const CREATE_FIELDS = [
  ['type', '유형', 'Type'],
  ['summary', '요약', 'Summary'],
  ['description', '설명', 'Description'],
  ['priority', '우선순위', 'Priority'],
  ['assignee', '담당', 'Assignee'],
  ['epic', '에픽', 'Epic'],
  ['sprint', '스프린트', 'Sprint'],
  ['points', '포인트', 'Points'],
];

const WEEK_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WEEK_NAME = { Sun: 'sun', Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat' };

export function defaultWeek() {
  const day = ['09:00', '18:00'];
  return { mon: day, tue: day, wed: day, thu: day, fri: [...day], sat: null, sun: null };
}

export function ensureServices(ws) {
  ws.mode = 'company';
  ws.articles = Array.isArray(ws.articles) ? ws.articles : [];
  ws.documents = Array.isArray(ws.documents) ? ws.documents : [];
  ws.calendars = Array.isArray(ws.calendars) ? ws.calendars : [];
  ws.approvals = Array.isArray(ws.approvals) ? ws.approvals : [];
  ws.webhooks = Array.isArray(ws.webhooks) ? ws.webhooks : [];
  ws.mailOutbox = Array.isArray(ws.mailOutbox) ? ws.mailOutbox : [];
  ws.apiTokens = Array.isArray(ws.apiTokens) ? ws.apiTokens : [];
  ws.calendarId = ws.calendarId || '';
  ws.mail = ws.mail && typeof ws.mail === 'object' ? ws.mail : { host: '', port: 587, security: 'starttls', user: '', password: '', from: '' };
  if (!ws.mail.security) ws.mail.security = ws.mail.secure ? 'ssl' : 'starttls';
  ws.sso = ws.sso && typeof ws.sso === 'object' ? ws.sso : { issuer: '', clientId: '', clientSecret: '' };
  const modules = ws.modules && typeof ws.modules === 'object' ? ws.modules : {};
  ws.modules = Object.fromEntries(MODULES.map((item) => [item.id, modules[item.id] !== false]));
  ensureWiki(ws);
  return ws;
}

export const moduleOn = (ws, id) => ws?.modules?.[id] !== false;

export function createFields(project) {
  const chosen = project?.screen?.create;
  const all = CREATE_FIELDS.map((field) => field[0]);
  if (!Array.isArray(chosen) || !chosen.length) return all;
  return all.filter((id) => id === 'summary' || chosen.includes(id));
}

export function addArticle(ws, input, actorId) {
  ensureServices(ws);
  return addPage(ws, input, actorId);
}

export function updateArticle(ws, articleId, patch) {
  const article = (ws.articles || []).find((item) => item.id === articleId);
  if (!article) throw new Error('not-found');
  if (patch.title != null) {
    const title = String(patch.title).trim();
    if (!title) throw new Error('name-required');
    article.title = title;
  }
  if (patch.body != null) article.body = String(patch.body);
  if (patch.published != null) article.published = Boolean(patch.published);
  article.updated = nowIso();
  return article;
}

export function deleteArticle(ws, articleId, actorId) {
  deletePage(ws, articleId, actorId || '');
}

export function addCalendar(ws, input) {
  ensureServices(ws);
  const name = String(input.name || '').trim();
  if (!name) throw new Error('name-required');
  const calendar = {
    id: uid('cal'), name, timezone: input.timezone || 'Asia/Seoul',
    week: input.week || defaultWeek(), holidays: Array.isArray(input.holidays) ? input.holidays : [],
  };
  ws.calendars.push(calendar);
  return calendar;
}

export function calendarOf(ws) {
  return (ws?.calendars || []).find((item) => item.id === ws.calendarId) || null;
}

function partsInZone(ms, timeZone) {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || 'UTC', weekday: 'short', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = Object.fromEntries(format.formatToParts(new Date(ms)).map((part) => [part.type, part.value]));
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return { ...parts, hour };
}

export function atWork(calendar, ms) {
  if (!calendar) return true;
  const parts = partsInZone(ms, calendar.timezone);
  const stamp = `${parts.year}-${parts.month}-${parts.day}`;
  if ((calendar.holidays || []).includes(stamp)) return false;
  const window = calendar.week?.[WEEK_NAME[parts.weekday]];
  if (!window) return false;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const [startHour, startMinute] = String(window[0]).split(':').map(Number);
  const [endHour, endMinute] = String(window[1]).split(':').map(Number);
  return minutes >= startHour * 60 + startMinute && minutes < endHour * 60 + endMinute;
}

function zoned(timeZone, year, month, day, hour, minute) {
  let utc = Date.UTC(year, month - 1, day, hour, minute);
  for (let pass = 0; pass < 3; pass += 1) {
    const parts = partsInZone(utc, timeZone);
    const shown = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    const wanted = Date.UTC(year, month - 1, day, hour, minute);
    if (shown === wanted) return utc;
    utc += wanted - shown;
  }
  return utc;
}

export function addBusinessHours(calendar, startMs, hours) {
  let left = Math.max(0, Number(hours) || 0) * 60;
  let cursor = startMs;
  const end = startMs + 400 * 86400000;
  while (left > 0 && cursor < end) {
    const parts = partsInZone(cursor, calendar?.timezone);
    const stamp = `${parts.year}-${parts.month}-${parts.day}`;
    const window = (calendar?.holidays || []).includes(stamp) ? null : calendar?.week?.[WEEK_NAME[parts.weekday]];
    if (!window) {
      const midnight = zoned(calendar?.timezone, Number(parts.year), Number(parts.month), Number(parts.day), 0, 0);
      cursor = midnight + 86400000;
      continue;
    }
    const [startHour, startMinute] = String(window[0]).split(':').map(Number);
    const [endHour, endMinute] = String(window[1]).split(':').map(Number);
    const minutes = Number(parts.hour) * 60 + Number(parts.minute);
    const open = startHour * 60 + startMinute;
    const close = endHour * 60 + endMinute;
    if (minutes < open) {
      cursor = zoned(calendar?.timezone, Number(parts.year), Number(parts.month), Number(parts.day), startHour, startMinute);
      continue;
    }
    if (minutes >= close) {
      const midnight = zoned(calendar?.timezone, Number(parts.year), Number(parts.month), Number(parts.day), 0, 0);
      cursor = midnight + 86400000;
      continue;
    }
    const take = Math.min(left, close - minutes);
    left -= take;
    cursor += take * 60000;
  }
  return cursor;
}

export function openApproval(ws, project, issue, statusId, approverId, actorId) {
  ensureServices(ws);
  const pending = ws.approvals.find((item) => item.issueId === issue.id && item.statusId === statusId && item.state === 'pending');
  if (pending) return pending;
  const approval = {
    id: uid('ap'), projectId: project.id, issueId: issue.id, statusId,
    requesterId: actorId || '', approverId: approverId || '', state: 'pending', comment: '', created: nowIso(),
  };
  ws.approvals.unshift(approval);
  return approval;
}

export function decideApproval(ws, approvalId, state, actorId, comment = '') {
  const approval = (ws.approvals || []).find((item) => item.id === approvalId);
  if (!approval) throw new Error('not-found');
  if (approval.approverId && approval.approverId !== actorId) throw new Error('permission');
  approval.state = state === 'rejected' ? 'rejected' : 'approved';
  approval.comment = String(comment || '');
  approval.decidedBy = actorId || '';
  return approval;
}

export function addWebhook(ws, input) {
  ensureServices(ws);
  const url = String(input.url || '').trim();
  if (!/^https?:\/\//i.test(url)) throw new Error('url-invalid');
  const hook = {
    id: uid('wh'), url, secret: String(input.secret || ''),
    events: String(input.events || '').split(/[,，\s]+/).map((item) => item.trim()).filter(Boolean),
    enabled: input.enabled !== false,
  };
  ws.webhooks.push(hook);
  return hook;
}

export function deleteWebhook(ws, webhookId) {
  ws.webhooks = (ws.webhooks || []).filter((item) => item.id !== webhookId);
}

export function webhookPayload(event, issue, project) {
  return {
    event: event?.kind || 'update',
    at: event?.at || nowIso(),
    project: project?.key || '',
    issue: issue ? { id: issue.id, key: issue.key, summary: issue.summary, statusId: issue.statusId, typeId: issue.typeId } : null,
  };
}

export function describeMail(mail = {}) {
  const named = String(mail.security || '').toLowerCase();
  const security = named === 'ssl' || named === 'starttls' || named === 'none' ? named : (mail.secure ? 'ssl' : 'starttls');
  const port = Number(mail.port) || (security === 'ssl' ? 465 : security === 'none' ? 25 : 587);
  return {
    host: String(mail.host || '').trim(),
    port,
    security,
    secure: security === 'ssl',
    requireTLS: security === 'starttls',
    ignoreTLS: security === 'none',
  };
}

export function queueMail(ws, input) {
  ensureServices(ws);
  const message = {
    id: input.id || uid('mail'), to: String(input.to || ''), subject: String(input.subject || ''),
    body: String(input.body || ''), state: 'queued', created: nowIso(),
  };
  if (!message.to) return null;
  if (ws.mailOutbox.some((item) => item.id === message.id)) return ws.mailOutbox.find((item) => item.id === message.id);
  ws.mailOutbox.unshift(message);
  return message;
}

export function addToken(ws, name) {
  ensureServices(ws);
  const token = { id: uid('tok'), name: String(name || '').trim() || 'API', token: uid('mwf'), created: nowIso() };
  ws.apiTokens.unshift(token);
  return token;
}

export function deleteToken(ws, tokenId) {
  ws.apiTokens = (ws.apiTokens || []).filter((item) => item.id !== tokenId);
}

export function authorizationUrl(sso, redirect, state) {
  const issuer = String(sso?.issuer || '').trim().replace(/\/$/, '');
  if (!issuer || !sso?.clientId) throw new Error('sso-required');
  const url = new URL(`${issuer}/authorize`);
  url.searchParams.set('client_id', sso.clientId);
  url.searchParams.set('redirect_uri', redirect);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  return url.toString();
}

export function groupLanes(issues, mode) {
  if (!mode || mode === 'none') return [{ id: 'all', issues }];
  const groups = new Map();
  for (const issue of issues) {
    const id = mode === 'assignee' ? (issue.assigneeId || 'none') : mode === 'epic' ? (issue.epicId || 'none') : (issue.priorityId || 'none');
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(issue);
  }
  return [...groups.entries()].map(([id, list]) => ({ id, issues: list }));
}

export function planItems(ws) {
  const items = [];
  for (const project of ws?.projects || []) {
    for (const version of project.versions || []) {
      if (!version.releaseDate && !version.startDate) continue;
      items.push({ kind: 'version', projectId: project.id, project: project.key, id: version.id, label: version.name, at: version.releaseDate || version.startDate });
    }
    for (const issue of project.issues || []) {
      if (issue.typeId === 'epic' && issue.due) items.push({ kind: 'epic', projectId: project.id, project: project.key, id: issue.id, label: issue.summary, at: issue.due });
    }
  }
  return items.sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

export function controlChart(project, now = Date.now()) {
  const points = [];
  for (const issue of project?.issues || []) {
    if (issue.typeId === 'epic' || issue.typeId === 'subtask') continue;
    const changes = (issue.history || []).filter((entry) => entry.field === 'status' && entry.at).slice().sort((a, b) => String(a.at).localeCompare(String(b.at)));
    const started = changes.find((entry) => project.statuses?.find((status) => status.id === entry.to)?.category === 'indeterminate');
    const finished = changes.find((entry) => project.statuses?.find((status) => status.id === entry.to)?.category === 'done');
    if (!started || !finished) continue;
    const days = (Date.parse(finished.at) - Date.parse(started.at)) / 86400000;
    if (!Number.isFinite(days)) continue;
    points.push({ id: issue.id, key: issue.key, days: Math.max(0, days) });
  }
  const average = points.length ? points.reduce((sum, point) => sum + point.days, 0) / points.length : 0;
  return { points, average, now };
}

export function epicBurndown(project, epic, now = Date.now()) {
  if (!epic?.created) return null;
  const start = Date.parse(epic.created);
  if (!Number.isFinite(start)) return null;
  const issues = (project.issues || []).filter((issue) => issue.epicId === epic.id && issue.typeId !== 'subtask');
  const pointed = issues.some((issue) => Number(issue.storyPoints) > 0);
  const weight = (issue) => (pointed ? (Number(issue.storyPoints) || 0) : 1);
  const total = issues.reduce((sum, issue) => sum + weight(issue), 0);
  const end = Math.max(start + 86400000, now);
  const steps = Math.min(60, Math.max(2, Math.round((end - start) / 86400000) + 1));
  const days = [];
  for (let index = 0; index < steps; index += 1) {
    const t = Math.min(end, start + index * 86400000);
    let remaining = 0;
    for (const issue of issues) {
      if (Date.parse(issue.created) > t) continue;
      const changes = (issue.history || []).filter((entry) => entry.field === 'status' && entry.at && Date.parse(entry.at) <= t);
      const status = changes.length ? changes[changes.length - 1].to : issue.statusId;
      const done = project.statuses?.find((item) => item.id === status)?.category === 'done';
      if (!done) remaining += weight(issue);
    }
    days.push({ t, remaining, total });
    if (t >= end) break;
  }
  return { total, days };
}

export function parseCsv(text) {
  const source = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const ch = source[index];
    if (quoted) {
      if (ch === '"') {
        if (source[index + 1] === '"') { cell += '"'; index += 1; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  const header = (rows.shift() || []).map((item) => item.trim().toLowerCase());
  return rows.filter((item) => item.some((value) => String(value).trim())).map((item) => Object.fromEntries(header.map((key, index) => [key, item[index] ?? ''])));
}

export function csvIssueRows(text) {
  return parseCsv(text).map((row) => ({
    summary: row.summary || row['요약'] || '',
    typeId: (row.type || row['유형'] || 'task').trim().toLowerCase(),
    priorityId: (row.priority || row['우선순위'] || 'medium').trim().toLowerCase(),
    statusId: (row.status || row['상태'] || '').trim().toLowerCase(),
    assignee: row.assignee || row['담당'] || '',
    labels: row.labels || row['라벨'] || '',
    description: row.description || row['설명'] || '',
  })).filter((row) => row.summary.trim());
}

export { WEEK_DAYS };

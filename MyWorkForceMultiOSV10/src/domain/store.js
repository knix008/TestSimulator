import { applyRules } from './automation.js';
import { boardsFor, defaultFilters, defaultGadgets, defaultQueues, freshCatalog, ROLES } from './catalog.js';
import { allowed } from './permissions.js';
import { isDoneStatus } from './reports.js';
import { byId, clone, nowIso, uid } from './util.js';

const EDITABLE = new Set([
  'summary', 'description', 'environment', 'typeId', 'priorityId', 'assigneeId', 'reporterId',
  'epicId', 'parentId', 'sprintId', 'storyPoints', 'originalEstimate', 'remainingEstimate', 'due',
  'rank', 'resolutionId', 'labels', 'componentIds', 'fixVersionIds', 'affectsVersionIds', 'fields',
]);

function mustProject(ws, projectId) {
  const project = (ws.projects || []).find((item) => item.id === projectId);
  if (!project) throw new Error('not-found');
  return project;
}

function mustIssue(project, issueId) {
  const issue = project.issues.find((item) => item.id === issueId || item.key === issueId);
  if (!issue) throw new Error('not-found');
  return issue;
}

function assertPerm(ws, project, actorId, perm) {
  if (!allowed(ws, project, actorId, perm)) throw new Error('permission');
}

function snapshot(value) {
  if (Array.isArray(value) || (value && typeof value === 'object')) return clone(value);
  return value ?? '';
}

function same(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function pushHistory(issue, actorId, field, from, to) {
  issue.history.push({ id: uid('h'), at: nowIso(), actorId, field, from: snapshot(from), to: snapshot(to) });
  issue.updated = nowIso();
}

function activity(project, entry) {
  const issue = project.issues.find((item) => item.id === entry.issueId);
  project.activity.unshift({ id: uid('a'), at: nowIso(), issueKey: issue?.key || entry.issueKey || '', ...entry });
  if (project.activity.length > 400) project.activity.length = 400;
}

function notify(project, userIds, entry) {
  const at = nowIso();
  for (const userId of new Set((userIds || []).filter(Boolean))) {
    if (userId === entry.actorId) continue;
    project.notifications.unshift({ id: uid('n'), userId, read: false, at, issueKey: entry.issueKey || '', ...entry });
  }
  if (project.notifications.length > 300) project.notifications.length = 300;
}

function watch(issue, userId) {
  if (userId && !(issue.watchers || []).includes(userId)) issue.watchers.push(userId);
}

export function upgradeIssue(issue) {
  issue.labels = issue.labels || [];
  issue.componentIds = issue.componentIds || [];
  issue.fixVersionIds = issue.fixVersionIds || [];
  issue.affectsVersionIds = issue.affectsVersionIds || [];
  issue.comments = issue.comments || [];
  issue.worklogs = issue.worklogs || [];
  issue.links = issue.links || [];
  issue.watchers = issue.watchers || [];
  issue.attachments = issue.attachments || [];
  issue.history = issue.history || [];
  issue.fields = issue.fields || {};
  issue.epicId = issue.epicId || '';
  issue.parentId = issue.parentId || '';
  issue.sprintId = issue.sprintId || '';
  issue.assigneeId = issue.assigneeId || '';
  issue.resolutionId = issue.resolutionId || '';
  issue.environment = issue.environment || '';
  issue.due = issue.due || '';
  return issue;
}

export function upgradeProject(project) {
  const catalog = freshCatalog();
  if (!Array.isArray(project.issueTypes)) project.issueTypes = catalog.issueTypes;
  if (!Array.isArray(project.priorities)) project.priorities = catalog.priorities;
  if (!Array.isArray(project.statuses)) project.statuses = catalog.statuses;
  if (!Array.isArray(project.resolutions)) project.resolutions = catalog.resolutions;
  if (!Array.isArray(project.transitions)) project.transitions = catalog.transitions;
  project.boards = Array.isArray(project.boards) && project.boards.length ? project.boards : boardsFor(project.type || 'software');
  project.sprints = project.sprints || [];
  project.components = project.components || [];
  project.versions = project.versions || [];
  project.issues = project.issues || [];
  project.filters = project.filters || defaultFilters();
  project.dashboard = project.dashboard || defaultGadgets();
  project.rules = project.rules || [];
  project.activity = project.activity || [];
  project.notifications = project.notifications || [];
  project.fields = project.fields || [];
  project.queues = project.queues || (project.type === 'service' ? defaultQueues() : []);
  project.members = project.members || [];
  project.description = project.description || '';
  project.archived = Boolean(project.archived);
  if (project.allowAnyTransition == null) project.allowAnyTransition = true;
  project.seq = project.seq || 0;
  for (const issue of project.issues) upgradeIssue(issue);
  return project;
}

export function upgradeWorkspace(data) {
  const ws = data && typeof data === 'object' ? data : {};
  ws.format = 'myworkforce';
  ws.version = 1;
  ws.kind = 'workspace';
  ws.users = Array.isArray(ws.users) ? ws.users : [];
  ws.groups = Array.isArray(ws.groups) ? ws.groups : [];
  ws.projects = Array.isArray(ws.projects) ? ws.projects : [];
  if (!ws.users.length) {
    const admin = { id: uid('u'), name: '관리자', email: '', active: true };
    ws.users.push(admin);
    ws.currentUserId = admin.id;
  }
  for (const user of ws.users) if (user.active == null) user.active = true;
  for (const project of ws.projects) upgradeProject(project);
  if (!ws.users.some((user) => user.id === ws.currentUserId && user.active !== false)) {
    ws.currentUserId = ws.users.find((user) => user.active !== false)?.id || ws.users[0].id;
  }
  if (!ws.projects.some((project) => project.id === ws.activeProjectId)) ws.activeProjectId = ws.projects[0]?.id || null;
  return ws;
}

export function blankWorkspace() {
  const admin = { id: uid('u'), name: '관리자', email: '', active: true };
  return upgradeWorkspace({
    currentUserId: admin.id,
    activeProjectId: null,
    users: [admin],
    groups: [],
    projects: [],
  });
}

export function newProject(ws, input) {
  const name = String(input.name || '').trim();
  const key = String(input.key || '').trim().toUpperCase();
  if (!name) throw new Error('name-required');
  if (!/^[A-Z][A-Z0-9]{1,9}$/.test(key)) throw new Error('key-invalid');
  if (ws.projects.some((project) => project.key === key)) throw new Error('duplicate-key');
  const leadId = input.leadId || ws.currentUserId;
  if (!ws.users.some((user) => user.id === leadId)) throw new Error('not-found');
  const type = ['software', 'business', 'service'].includes(input.type) ? input.type : 'software';
  const project = upgradeProject({
    id: uid('p'),
    key,
    name,
    description: String(input.description || ''),
    type,
    leadId,
    category: input.category || '',
    seq: 0,
    created: nowIso(),
    ...freshCatalog(),
    boards: boardsFor(type),
    filters: defaultFilters(),
    dashboard: defaultGadgets(),
    queues: type === 'service' ? defaultQueues() : [],
    members: [{ userId: leadId, role: 'administrator' }],
    allowAnyTransition: true,
  });
  if (type === 'software') {
    const board = project.boards.find((item) => item.type === 'scrum');
    project.sprints.push({
      id: uid('s'), name: 'Sprint 1', goal: '', state: 'future',
      start: new Date().toISOString(), end: new Date(Date.now() + 14 * 86400000).toISOString(),
      boardId: board?.id || '', completedAt: '',
    });
  }
  ws.projects.push(project);
  ws.activeProjectId = project.id;
  return project;
}

export function updateProject(ws, projectId, patch, actorId) {
  const project = mustProject(ws, projectId);
  assertPerm(ws, project, actorId, 'admin');
  if (patch.name != null) {
    const name = String(patch.name).trim();
    if (!name) throw new Error('name-required');
    project.name = name;
  }
  if (patch.description != null) project.description = String(patch.description);
  if (patch.category != null) project.category = String(patch.category);
  if (patch.leadId) {
    if (!ws.users.some((user) => user.id === patch.leadId)) throw new Error('not-found');
    project.leadId = patch.leadId;
  }
  if (patch.allowAnyTransition != null) project.allowAnyTransition = Boolean(patch.allowAnyTransition);
  return project;
}

export function setArchived(ws, projectId, archived, actorId) {
  const project = mustProject(ws, projectId);
  assertPerm(ws, project, actorId, 'admin');
  project.archived = Boolean(archived);
}

export function makeIssue(project, partial, actorId) {
  let key = partial.key;
  if (!key) {
    project.seq = (project.seq || 0) + 1;
    key = `${project.key}-${project.seq}`;
  } else {
    const number = Number(String(key).split('-').pop());
    if (Number.isFinite(number) && number > (project.seq || 0)) project.seq = number;
  }
  const reporterId = partial.reporterId || actorId || '';
  const assigneeId = partial.assigneeId || '';
  const watchers = partial.watchers ? [...partial.watchers] : [...new Set([reporterId, assigneeId].filter(Boolean))];
  const issue = upgradeIssue({
    id: partial.id || uid('i'),
    key,
    typeId: partial.typeId || 'task',
    summary: partial.summary ?? '',
    description: partial.description || '',
    statusId: partial.statusId || (partial.sprintId ? 'todo' : 'backlog'),
    priorityId: partial.priorityId || 'medium',
    resolutionId: partial.resolutionId || '',
    assigneeId,
    reporterId,
    labels: partial.labels ? [...partial.labels] : [],
    componentIds: partial.componentIds ? [...partial.componentIds] : [],
    fixVersionIds: partial.fixVersionIds ? [...partial.fixVersionIds] : [],
    affectsVersionIds: partial.affectsVersionIds ? [...partial.affectsVersionIds] : [],
    epicId: partial.epicId || '',
    parentId: partial.parentId || '',
    sprintId: partial.sprintId || '',
    rank: partial.rank ?? (project.issues.length + 1) * 10,
    storyPoints: partial.storyPoints ?? null,
    originalEstimate: partial.originalEstimate ?? null,
    remainingEstimate: partial.remainingEstimate ?? null,
    timeSpent: partial.timeSpent ?? 0,
    environment: partial.environment || '',
    due: partial.due || '',
    created: partial.created || nowIso(),
    updated: partial.updated || partial.created || nowIso(),
    comments: partial.comments || [],
    worklogs: partial.worklogs || [],
    links: partial.links || [],
    watchers,
    attachments: partial.attachments || [],
    history: partial.history || [],
    fields: partial.fields ? { ...partial.fields } : {},
  });
  project.issues.push(issue);
  return issue;
}

function applyStatus(ws, project, issue, statusId, actorId) {
  if (issue.statusId === statusId) return;
  if (!transitionAllowed(project, issue.statusId, statusId)) throw new Error('transition-blocked');
  assertPerm(ws, project, actorId, 'transition');
  const from = issue.statusId;
  const wasDone = isDoneStatus(project, from);
  const nowDone = isDoneStatus(project, statusId);
  issue.statusId = statusId;
  if (nowDone && !wasDone && !issue.resolutionId) issue.resolutionId = project.resolutions[0]?.id || 'fixed';
  if (!nowDone && wasDone) issue.resolutionId = '';
  pushHistory(issue, actorId, 'status', from, statusId);
  applyRules(project, { kind: 'transition', from, to: statusId }, issue, actorId);
  activity(project, { actorId, issueId: issue.id, kind: 'transition', from, to: statusId });
  notify(project, issue.watchers, { actorId, issueId: issue.id, kind: 'transition', from, to: statusId });
}

export function transitionAllowed(project, from, to) {
  if (!to || from === to) return true;
  if (project.allowAnyTransition !== false) return true;
  return (project.transitions || []).some((item) => item.from === from && item.to === to);
}

export function movesFrom(project, statusId) {
  const named = (project.transitions || []).filter((item) => item.from === statusId);
  if (named.length) return named.map((item) => ({ to: item.to, ko: item.ko, en: item.en }));
  if (project.allowAnyTransition === false) return [];
  return (project.statuses || []).filter((status) => status.id !== statusId).map((status) => ({ to: status.id, ko: status.ko || status.name, en: status.en || status.name }));
}

export function createIssue(ws, projectId, partial, actorId) {
  const project = mustProject(ws, projectId);
  assertPerm(ws, project, actorId, 'create');
  const summary = String(partial.summary || '').trim();
  if (!summary) throw new Error('summary-required');
  if ((partial.typeId || 'task') === 'subtask' && !partial.parentId) throw new Error('parent-required');
  const issue = makeIssue(project, { ...partial, summary }, actorId);
  applyRules(project, { kind: 'created' }, issue, actorId);
  if (isDoneStatus(project, issue.statusId) && !issue.resolutionId) issue.resolutionId = project.resolutions[0]?.id || 'fixed';
  watch(issue, issue.assigneeId);
  watch(issue, actorId);
  activity(project, { actorId, issueId: issue.id, kind: 'created' });
  notify(project, issue.watchers, { actorId, issueId: issue.id, kind: 'created' });
  return issue;
}

export function updateIssue(ws, projectId, issueId, patch, actorId) {
  const project = mustProject(ws, projectId);
  const issue = mustIssue(project, issueId);
  const statusId = patch.statusId;
  const entries = Object.entries(patch).filter(([key]) => key !== 'statusId' && EDITABLE.has(key));
  if (entries.length) assertPerm(ws, project, actorId, 'edit');
  for (const [key, value] of entries) {
    if (key === 'assigneeId') assertPerm(ws, project, actorId, 'assign');
    const before = snapshot(issue[key]);
    const after = snapshot(value);
    if (same(before, after)) continue;
    issue[key] = snapshot(value);
    pushHistory(issue, actorId, key, before, issue[key]);
    if (key === 'assigneeId') {
      watch(issue, value);
      activity(project, { actorId, issueId: issue.id, kind: 'assign', userId: value || '' });
      notify(project, [value, ...issue.watchers], { actorId, issueId: issue.id, kind: 'assign', userId: value || '' });
    }
  }
  if (statusId && statusId !== issue.statusId) applyStatus(ws, project, issue, statusId, actorId);
  return issue;
}

export function setCustomField(ws, projectId, issueId, fieldId, value, actorId) {
  const project = mustProject(ws, projectId);
  const issue = mustIssue(project, issueId);
  assertPerm(ws, project, actorId, 'edit');
  const before = issue.fields[fieldId] ?? '';
  if (same(before, value)) return issue;
  issue.fields[fieldId] = value;
  pushHistory(issue, actorId, `field:${fieldId}`, before, value);
  return issue;
}

export function addComment(ws, projectId, issueId, body, actorId) {
  const project = mustProject(ws, projectId);
  const issue = mustIssue(project, issueId);
  assertPerm(ws, project, actorId, 'comment');
  const text = String(body || '').trim();
  if (!text) throw new Error('summary-required');
  const comment = { id: uid('c'), authorId: actorId, body: text, created: nowIso() };
  issue.comments.push(comment);
  issue.updated = comment.created;
  watch(issue, actorId);
  const mentioned = ws.users.filter((user) => user.name && text.includes(`@${user.name}`)).map((user) => user.id);
  activity(project, { actorId, issueId: issue.id, kind: 'comment' });
  notify(project, [...issue.watchers, ...mentioned], { actorId, issueId: issue.id, kind: 'comment' });
  return comment;
}

export function deleteComment(ws, projectId, issueId, commentId, actorId) {
  const project = mustProject(ws, projectId);
  const issue = mustIssue(project, issueId);
  const comment = issue.comments.find((item) => item.id === commentId);
  if (!comment) throw new Error('not-found');
  if (comment.authorId !== actorId) assertPerm(ws, project, actorId, 'delete');
  issue.comments = issue.comments.filter((item) => item.id !== commentId);
}

export function addWorklog(ws, projectId, issueId, { minutes, comment, started }, actorId) {
  const project = mustProject(ws, projectId);
  const issue = mustIssue(project, issueId);
  assertPerm(ws, project, actorId, 'work');
  const amount = Math.round(Number(minutes));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('summary-required');
  issue.worklogs.push({ id: uid('w'), authorId: actorId, minutes: amount, comment: String(comment || ''), started: started || nowIso() });
  issue.timeSpent = (Number(issue.timeSpent) || 0) + amount;
  if (issue.remainingEstimate != null) issue.remainingEstimate = Math.max(0, Number(issue.remainingEstimate) - amount);
  issue.updated = nowIso();
  activity(project, { actorId, issueId: issue.id, kind: 'worklog', minutes: amount });
  return issue;
}

export function deleteWorklog(ws, projectId, issueId, worklogId, actorId) {
  const project = mustProject(ws, projectId);
  const issue = mustIssue(project, issueId);
  assertPerm(ws, project, actorId, 'work');
  const log = issue.worklogs.find((item) => item.id === worklogId);
  if (!log) throw new Error('not-found');
  if (log.authorId !== actorId) assertPerm(ws, project, actorId, 'delete');
  issue.worklogs = issue.worklogs.filter((item) => item.id !== worklogId);
  issue.timeSpent = Math.max(0, (Number(issue.timeSpent) || 0) - log.minutes);
  if (issue.remainingEstimate != null) issue.remainingEstimate = Number(issue.remainingEstimate) + log.minutes;
}

export function addLink(ws, projectId, fromId, type, toRef, actorId) {
  const project = mustProject(ws, projectId);
  assertPerm(ws, project, actorId, 'edit');
  const from = mustIssue(project, fromId);
  const to = project.issues.find((item) => item.id === toRef || item.key.toLowerCase() === String(toRef || '').trim().toLowerCase());
  if (!to) throw new Error('not-found');
  if (to.id === from.id) throw new Error('self-link');
  if (from.links.some((link) => link.type === type && link.direction === 'out' && link.otherId === to.id)) return;
  const id = uid('l');
  from.links.push({ id, type, direction: 'out', otherId: to.id });
  to.links.push({ id, type, direction: 'in', otherId: from.id });
  activity(project, { actorId, issueId: from.id, kind: 'link', otherKey: to.key });
}

export function removeLink(ws, projectId, issueId, linkId, actorId) {
  const project = mustProject(ws, projectId);
  assertPerm(ws, project, actorId, 'edit');
  const issue = mustIssue(project, issueId);
  const link = issue.links.find((item) => item.id === linkId);
  if (!link) return;
  issue.links = issue.links.filter((item) => item.id !== linkId);
  const other = project.issues.find((item) => item.id === link.otherId);
  if (other) other.links = other.links.filter((item) => item.id !== linkId);
}

export function toggleWatch(ws, projectId, issueId, actorId) {
  const project = mustProject(ws, projectId);
  const issue = mustIssue(project, issueId);
  assertPerm(ws, project, actorId, 'browse');
  if (issue.watchers.includes(actorId)) issue.watchers = issue.watchers.filter((id) => id !== actorId);
  else issue.watchers.push(actorId);
}

export function addAttachment(ws, projectId, issueId, file, actorId) {
  const project = mustProject(ws, projectId);
  const issue = mustIssue(project, issueId);
  assertPerm(ws, project, actorId, 'attach');
  if ((file.size || 0) > 700_000 || String(file.data || '').length > 1_200_000) throw new Error('attachment-big');
  issue.attachments.push({ id: uid('f'), name: file.name || 'file', mime: file.mime || '', size: file.size || 0, data: file.data || '', created: nowIso() });
  issue.updated = nowIso();
}

export function removeAttachment(ws, projectId, issueId, attachmentId, actorId) {
  const project = mustProject(ws, projectId);
  const issue = mustIssue(project, issueId);
  assertPerm(ws, project, actorId, 'attach');
  issue.attachments = issue.attachments.filter((item) => item.id !== attachmentId);
}

export function cloneIssue(ws, projectId, issueId, actorId) {
  const project = mustProject(ws, projectId);
  const source = mustIssue(project, issueId);
  const copy = createIssue(ws, projectId, {
    typeId: source.typeId === 'subtask' ? 'task' : source.typeId,
    summary: `${source.summary} (2)`,
    description: source.description,
    priorityId: source.priorityId,
    assigneeId: source.assigneeId,
    labels: [...source.labels],
    componentIds: [...source.componentIds],
    epicId: source.epicId,
    storyPoints: source.storyPoints,
    originalEstimate: source.originalEstimate,
    remainingEstimate: source.originalEstimate,
    environment: source.environment,
    fields: { ...source.fields },
    sprintId: project.sprints.find((sprint) => sprint.id === source.sprintId && sprint.state !== 'closed') ? source.sprintId : '',
  }, actorId);
  addLink(ws, projectId, copy.id, 'clones', source.id, actorId);
  return copy;
}

export function deleteIssue(ws, projectId, issueId, actorId) {
  const project = mustProject(ws, projectId);
  assertPerm(ws, project, actorId, 'delete');
  const issue = mustIssue(project, issueId);
  const ids = new Set([issue.id, ...project.issues.filter((item) => item.parentId === issue.id).map((item) => item.id)]);
  activity(project, { actorId, issueId: issue.id, issueKey: issue.key, kind: 'delete' });
  project.issues = project.issues.filter((item) => !ids.has(item.id));
  for (const item of project.issues) {
    item.links = item.links.filter((link) => !ids.has(link.otherId));
    if (ids.has(item.epicId)) item.epicId = '';
    if (ids.has(item.parentId)) item.parentId = '';
  }
}

export function rankIssues(project, orderedIds) {
  orderedIds.forEach((id, index) => {
    const issue = project.issues.find((item) => item.id === id);
    if (issue) issue.rank = (index + 1) * 10;
  });
}

export function createSprint(ws, projectId, input, actorId) {
  const project = mustProject(ws, projectId);
  assertPerm(ws, project, actorId, 'sprint');
  const name = String(input.name || '').trim();
  if (!name) throw new Error('name-required');
  if (input.start && input.end && Date.parse(input.end) < Date.parse(input.start)) throw new Error('sprint-dates');
  const sprint = {
    id: uid('s'), name, goal: String(input.goal || ''), state: 'future',
    start: input.start || '', end: input.end || '',
    boardId: input.boardId || project.boards.find((board) => board.type === 'scrum')?.id || project.boards[0]?.id || '',
    completedAt: '',
  };
  project.sprints.push(sprint);
  return sprint;
}

export function updateSprint(ws, projectId, sprintId, patch, actorId) {
  const project = mustProject(ws, projectId);
  assertPerm(ws, project, actorId, 'sprint');
  const sprint = project.sprints.find((item) => item.id === sprintId);
  if (!sprint) throw new Error('not-found');
  if (patch.name != null && String(patch.name).trim()) sprint.name = String(patch.name).trim();
  if (patch.goal != null) sprint.goal = String(patch.goal);
  if (patch.start != null) sprint.start = patch.start;
  if (patch.end != null) sprint.end = patch.end;
  if (sprint.start && sprint.end && Date.parse(sprint.end) < Date.parse(sprint.start)) throw new Error('sprint-dates');
  return sprint;
}

export function startSprint(ws, projectId, sprintId, actorId) {
  const project = mustProject(ws, projectId);
  assertPerm(ws, project, actorId, 'sprint');
  const sprint = project.sprints.find((item) => item.id === sprintId);
  if (!sprint || sprint.state !== 'future') throw new Error('sprint-state');
  if (!sprint.start || !sprint.end) throw new Error('sprint-dates');
  if (project.sprints.some((item) => item.state === 'active' && item.boardId === sprint.boardId)) throw new Error('sprint-active');
  sprint.state = 'active';
  activity(project, { actorId, kind: 'sprint', state: 'active', sprintId });
  return sprint;
}

export function completeSprint(ws, projectId, sprintId, destination, actorId) {
  const project = mustProject(ws, projectId);
  assertPerm(ws, project, actorId, 'sprint');
  const sprint = project.sprints.find((item) => item.id === sprintId);
  if (!sprint || sprint.state !== 'active') throw new Error('sprint-state');
  const dest = destination && destination !== 'backlog' ? project.sprints.find((item) => item.id === destination) : null;
  if (destination && destination !== 'backlog' && (!dest || dest.state === 'closed')) throw new Error('not-found');
  for (const issue of project.issues) {
    if (issue.sprintId !== sprint.id || isDoneStatus(project, issue.statusId)) continue;
    if (dest) issue.sprintId = dest.id;
    else {
      issue.sprintId = '';
      if (issue.statusId === 'todo') issue.statusId = 'backlog';
    }
  }
  sprint.state = 'closed';
  sprint.completedAt = nowIso();
  activity(project, { actorId, kind: 'sprint', state: 'closed', sprintId });
  return sprint;
}

export function addVersion(ws, projectId, input, actorId) {
  const project = mustProject(ws, projectId);
  assertPerm(ws, project, actorId, 'admin');
  const name = String(input.name || '').trim();
  if (!name) throw new Error('name-required');
  const version = { id: uid('v'), name, description: String(input.description || ''), released: false, releaseDate: '', startDate: input.startDate || '' };
  project.versions.push(version);
  return version;
}

export function releaseVersion(ws, projectId, versionId, released, actorId) {
  const project = mustProject(ws, projectId);
  assertPerm(ws, project, actorId, 'admin');
  const version = project.versions.find((item) => item.id === versionId);
  if (!version) throw new Error('not-found');
  version.released = Boolean(released);
  version.releaseDate = released ? nowIso() : '';
  activity(project, { actorId, kind: 'release', versionId, name: version.name });
}

export function addComponent(ws, projectId, input, actorId) {
  const project = mustProject(ws, projectId);
  assertPerm(ws, project, actorId, 'admin');
  const name = String(input.name || '').trim();
  if (!name) throw new Error('name-required');
  const component = { id: uid('c'), name, description: String(input.description || ''), leadId: input.leadId || actorId };
  project.components.push(component);
  return component;
}

export function addUser(ws, input) {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('name-required');
  const email = String(input.email || '').trim();
  if (email && ws.users.some((user) => user.email.toLowerCase() === email.toLowerCase())) throw new Error('duplicate-user');
  const user = { id: uid('u'), name, email, active: true };
  ws.users.push(user);
  return user;
}

export function setUserActive(ws, userId, active) {
  const user = ws.users.find((item) => item.id === userId);
  if (!user) throw new Error('not-found');
  if (!active && ws.users.filter((item) => item.active !== false).length <= 1) throw new Error('permission');
  user.active = Boolean(active);
}

export function setMember(ws, projectId, userId, role, actorId) {
  const project = mustProject(ws, projectId);
  assertPerm(ws, project, actorId, 'admin');
  if (!ws.users.some((user) => user.id === userId)) throw new Error('not-found');
  project.members = project.members.filter((member) => member.userId !== userId);
  if (role) {
    if (!ROLES.some((item) => item.id === role)) throw new Error('not-found');
    project.members.push({ userId, role });
  }
}

export function addGroup(ws, name, actorId, projectId) {
  if (projectId) assertPerm(ws, mustProject(ws, projectId), actorId, 'admin');
  const label = String(name || '').trim();
  if (!label) throw new Error('name-required');
  const group = { id: uid('g'), name: label, userIds: [] };
  ws.groups.push(group);
  return group;
}

export function toggleGroupUser(ws, groupId, userId) {
  const group = ws.groups.find((item) => item.id === groupId);
  if (!group) throw new Error('not-found');
  group.userIds = group.userIds || [];
  if (group.userIds.includes(userId)) group.userIds = group.userIds.filter((id) => id !== userId);
  else group.userIds.push(userId);
}

export function saveFilter(ws, projectId, { name, query }, actorId) {
  const project = mustProject(ws, projectId);
  assertPerm(ws, project, actorId, 'browse');
  const label = String(name || '').trim();
  if (!label) throw new Error('name-required');
  const filter = { id: uid('f'), ko: label, en: label, query: String(query || ''), ownerId: actorId };
  project.filters.push(filter);
  return filter;
}

export function deleteFilter(ws, projectId, filterId, actorId) {
  const project = mustProject(ws, projectId);
  const filter = project.filters.find((item) => item.id === filterId);
  if (!filter) return;
  if (filter.ownerId && filter.ownerId !== actorId) assertPerm(ws, project, actorId, 'admin');
  project.filters = project.filters.filter((item) => item.id !== filterId);
}

export function addGadget(project, type) {
  project.dashboard.push({ id: uid('g'), type });
}

export function removeGadget(project, gadgetId) {
  project.dashboard = project.dashboard.filter((item) => item.id !== gadgetId);
}

export function addStatus(ws, projectId, input, actorId) {
  const project = mustProject(ws, projectId);
  assertPerm(ws, project, actorId, 'admin');
  const name = String(input.name || '').trim();
  if (!name) throw new Error('name-required');
  const category = ['new', 'indeterminate', 'done'].includes(input.category) ? input.category : 'new';
  const status = { id: uid('st'), ko: name, en: name, category, color: input.color || '#3a6cf0' };
  project.statuses.push(status);
  return status;
}

export function removeStatus(ws, projectId, statusId, actorId) {
  const project = mustProject(ws, projectId);
  assertPerm(ws, project, actorId, 'admin');
  if (project.issues.some((issue) => issue.statusId === statusId)) throw new Error('status-used');
  project.statuses = project.statuses.filter((status) => status.id !== statusId);
  project.transitions = project.transitions.filter((item) => item.from !== statusId && item.to !== statusId);
  for (const board of project.boards) board.columns = board.columns.filter((column) => column.statusId !== statusId);
}

export function addTransition(ws, projectId, input, actorId) {
  const project = mustProject(ws, projectId);
  assertPerm(ws, project, actorId, 'admin');
  const name = String(input.name || '').trim();
  if (!name || !input.from || !input.to) throw new Error('name-required');
  project.transitions.push({ id: uid('t'), from: input.from, to: input.to, ko: name, en: name });
}

export function removeTransition(ws, projectId, transitionId, actorId) {
  const project = mustProject(ws, projectId);
  assertPerm(ws, project, actorId, 'admin');
  project.transitions = project.transitions.filter((item) => item.id !== transitionId);
}

export function addColumn(ws, projectId, boardId, statusId, actorId) {
  const project = mustProject(ws, projectId);
  assertPerm(ws, project, actorId, 'admin');
  const board = project.boards.find((item) => item.id === boardId);
  if (!board || board.columns.some((column) => column.statusId === statusId)) return;
  board.columns.push({ id: uid('c'), statusId, wip: null });
}

export function setColumnWip(ws, projectId, boardId, columnId, wip, actorId) {
  const project = mustProject(ws, projectId);
  assertPerm(ws, project, actorId, 'admin');
  const column = project.boards.find((item) => item.id === boardId)?.columns.find((item) => item.id === columnId);
  if (column) column.wip = wip == null || wip === '' ? null : Math.max(0, Number(wip) || 0);
}

export function addField(ws, projectId, input, actorId) {
  const project = mustProject(ws, projectId);
  assertPerm(ws, project, actorId, 'admin');
  const name = String(input.name || '').trim();
  if (!name) throw new Error('name-required');
  const type = ['text', 'number', 'select', 'date', 'user'].includes(input.type) ? input.type : 'text';
  const options = type === 'select' ? String(input.options || '').split(/[,，]/).map((item) => item.trim()).filter(Boolean) : [];
  const field = { id: uid('cf'), ko: name, en: name, name, type, options };
  project.fields.push(field);
  return field;
}

export function removeField(ws, projectId, fieldId, actorId) {
  const project = mustProject(ws, projectId);
  assertPerm(ws, project, actorId, 'admin');
  project.fields = project.fields.filter((field) => field.id !== fieldId);
}

export function addRule(ws, projectId, input, actorId) {
  const project = mustProject(ws, projectId);
  assertPerm(ws, project, actorId, 'admin');
  const name = String(input.name || '').trim() || (input.then || 'rule');
  project.rules.push({
    id: uid('r'), ko: name, en: name, enabled: true,
    when: input.when === 'transition' ? 'transition' : 'created',
    typeId: input.typeId || '', statusId: input.statusId || '',
    then: ['assign', 'priority', 'label', 'watch'].includes(input.then) ? input.then : 'watch',
    userId: input.userId || '', priorityId: input.priorityId || '', label: input.label || '',
  });
}

export function deleteRule(ws, projectId, ruleId, actorId) {
  const project = mustProject(ws, projectId);
  assertPerm(ws, project, actorId, 'admin');
  project.rules = project.rules.filter((rule) => rule.id !== ruleId);
}

export function markRead(project, notificationId, userId) {
  const item = project.notifications.find((entry) => entry.id === notificationId && entry.userId === userId);
  if (item) item.read = true;
}

export function markAllRead(project, userId) {
  for (const item of project.notifications) if (item.userId === userId) item.read = true;
}

export function workspaceDocument(ws) {
  return { ...clone(ws), format: 'myworkforce', version: 1, kind: 'workspace' };
}

export function projectDocument(ws, projectId) {
  const project = mustProject(ws, projectId);
  const ids = new Set([project.leadId, ...project.members.map((member) => member.userId)]);
  for (const issue of project.issues) {
    ids.add(issue.assigneeId);
    ids.add(issue.reporterId);
    for (const watcher of issue.watchers || []) ids.add(watcher);
  }
  return {
    format: 'myworkforce', version: 1, kind: 'project',
    users: ws.users.filter((user) => ids.has(user.id)),
    groups: clone(ws.groups),
    project: clone(project),
  };
}

export function readDocument(data) {
  if (!data || data.format !== 'myworkforce') throw new Error('file-invalid');
  if (data.kind === 'project') {
    if (!data.project) throw new Error('file-invalid');
    return { mode: 'project', users: data.users || [], groups: data.groups || [], project: data.project };
  }
  if (!Array.isArray(data.projects) || !Array.isArray(data.users)) throw new Error('file-invalid');
  return { mode: 'workspace', workspace: data };
}

export function mergeProject(ws, project, users = [], groups = []) {
  upgradeProject(project);
  for (const user of users) if (!ws.users.some((item) => item.id === user.id)) ws.users.push(user);
  for (const group of groups) if (!ws.groups.some((item) => item.id === group.id)) ws.groups.push(group);
  const index = ws.projects.findIndex((item) => item.id === project.id);
  if (index >= 0) ws.projects[index] = project;
  else ws.projects.push(project);
  ws.activeProjectId = project.id;
}

export const findProject = (ws, id) => ws.projects.find((project) => project.id === id) || null;
export const findIssue = (project, id) => project?.issues.find((issue) => issue.id === id || issue.key === id) || null;
export const findUser = (ws, id) => ws.users.find((user) => user.id === id) || null;

export function activeSprint(project, boardId) {
  return project?.sprints.find((sprint) => sprint.boardId === boardId && sprint.state === 'active')
    || project?.sprints.find((sprint) => sprint.state === 'active')
    || null;
}

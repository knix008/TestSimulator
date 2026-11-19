// "Switch to Kanban / Scrum": turns a schedule (schedule.js) into the board way of working.
//
//   top-level summary task  → epic (its tasks get that epic)
//   working task            → issue of the task's kind, with the task's dates, person and points
//   milestone               → release version on the milestone's date
//   FS/SS/FF/SF link        → "blocks" between the two issues
//   Scrum                   → sprints of `sprintDays` from the sprint start; a task goes into the sprint its
//                             start falls in, tasks past the last sprint stay in the backlog
//   Kanban                  → tasks starting within the coming window go to "To Do", later ones to "Backlog"
//
// Running it again updates what changed: tasks remember their issue, sprints are matched by start day, and
// issues already in progress or done keep their sprint and status.
import { addLink, createIssue, updateIssue } from './store.js';
import { allowed } from './permissions.js';
import { boardsFor } from './catalog.js';
import { computeSchedule, DAY, dayOf, ensureSchedule, isoDay, isSummary, sprintWindows, subtree } from './schedule.js';
import { setProjectMethod } from './teams.js';
import { byId, fromDateInput, uid } from './util.js';

const categoryOf = (project, issue) => byId(project.statuses, issue?.statusId)?.category || 'new';
const asIssueDate = (day) => (day == null ? '' : fromDateInput(isoDay(day)));

function topSummaryOf(tasks, at) {
  let found = null;
  for (let i = at - 1; i >= 0; i -= 1) {
    if (tasks[i].level < tasks[at].level && isSummary(tasks, i)) {
      found = i;
      if (tasks[i].level === 1) break;
    }
    if (tasks[i].level === 1) break;
  }
  return found;
}

function options(project, opts = {}) {
  const schedule = ensureSchedule(project);
  return {
    sprintDays: Math.max(1, Math.min(90, Math.round(Number(opts.sprintDays ?? schedule.sprintDays) || 14))),
    sprintStart: opts.sprintStart ? isoDay(dayOf(opts.sprintStart)) : (schedule.sprintStart || schedule.start),
    sprintCount: Math.max(0, Math.round(Number(opts.sprintCount) || 0)),
    startCurrent: opts.startCurrent !== false,
    windowDays: Math.max(1, Math.round(Number(opts.windowDays ?? opts.sprintDays ?? schedule.sprintDays) || 14)),
    sprintName: String(opts.sprintName || 'Sprint').trim() || 'Sprint',
    now: opts.now ?? Date.now(),
  };
}

/** What switching would do, without doing it (the preview in the dialog). */
export function planConversion(ws, project, mode, opts = {}, calendar = null) {
  const o = options(project, opts);
  computeSchedule(project, calendar);
  const tasks = ensureSchedule(project).tasks;
  const today = dayOf(o.now);
  const windows = mode === 'scrum' ? sprintWindows(project, { sprintDays: o.sprintDays, start: o.sprintStart, count: o.sprintCount }) : [];
  const sprints = windows.map((window, i) => {
    const existing = (project.sprints || []).find((sprint) => sprint.state !== 'closed' && dayOf(sprint.start) === window.start);
    const holds = tasks.filter((task, at) => !isSummary(tasks, at) && !task.milestone && dayOf(task.start) >= window.start && dayOf(task.start) <= window.end);
    const goals = [...new Set(holds.map((task) => { const top = topSummaryOf(tasks, tasks.indexOf(task)); return top == null ? '' : tasks[top].name; }).filter(Boolean))];
    return { index: i, start: window.start, end: window.end, existingId: existing?.id || '', name: existing?.name || `${o.sprintName} ${i + 1}`, goal: goals.join(', '), current: today >= window.start && today <= window.end, tasks: holds.length };
  });
  const lastEnd = windows.length ? windows[windows.length - 1].end : null;
  const rows = tasks.map((task, at) => {
    const issue = task.issueId ? (project.issues || []).find((item) => item.id === task.issueId) : null;
    const summary = isSummary(tasks, at);
    let role = 'issue';
    if (summary) role = task.level === 1 ? 'epic' : 'group';
    if (task.milestone) role = 'version';
    let place = '';
    if (role === 'issue') {
      const start = dayOf(task.start);
      if (mode === 'scrum') {
        const sprint = sprints.find((item) => start >= item.start && start <= item.end);
        place = sprint ? `sprint:${sprint.index}` : (lastEnd != null && start > lastEnd ? 'backlog' : 'backlog');
      } else {
        place = start <= today + o.windowDays * DAY ? 'todo' : 'backlog';
      }
    }
    const locked = issue && ['indeterminate', 'done'].includes(categoryOf(project, issue));
    return { task, at, role, issue, action: role === 'group' ? 'skip' : (issue || (role === 'version' && task.versionId && (project.versions || []).some((v) => v.id === task.versionId)) ? 'update' : 'create'), place, locked };
  });
  return {
    mode,
    options: o,
    sprints,
    rows,
    counts: {
      create: rows.filter((row) => row.action === 'create' && row.role === 'issue').length,
      update: rows.filter((row) => row.action === 'update' && row.role === 'issue').length,
      epics: rows.filter((row) => row.role === 'epic').length,
      versions: rows.filter((row) => row.role === 'version').length,
      newSprints: sprints.filter((sprint) => !sprint.existingId).length,
      sprints: sprints.length,
      backlog: rows.filter((row) => row.role === 'issue' && row.place === 'backlog').length,
      todo: rows.filter((row) => row.role === 'issue' && (row.place === 'todo' || row.place.startsWith('sprint:'))).length,
      locked: rows.filter((row) => row.locked).length,
    },
  };
}

function ensureBoard(project, type) {
  if (project.boards.some((board) => board.type === type)) return project.boards.find((board) => board.type === type);
  const board = boardsFor('software').find((item) => item.type === type);
  const copy = JSON.parse(JSON.stringify(board));
  if (project.boards.some((item) => item.id === copy.id)) copy.id = uid('board');
  if (type === 'scrum') project.boards.unshift(copy);
  else project.boards.push(copy);
  return copy;
}

/**
 * Switches the project to Kanban or Scrum from its schedule. Returns the counts and the board to open.
 * Needs a person who may change the project's methods (its lead or an administrator).
 */
export function applyConversion(ws, project, mode, opts = {}, actorId = '', calendar = null) {
  if (!['kanban', 'scrum'].includes(mode)) throw new Error('not-found');
  const plan = planConversion(ws, project, mode, opts, calendar);
  const o = plan.options;
  if (!plan.rows.length) throw new Error('schedule-empty');
  if (actorId && !allowed(ws, project, actorId, 'create')) throw new Error('permission');
  // The board way of working is turned on (the schedule stays).
  if (!(project.methods || []).includes(mode)) setProjectMethod(ws, project.id, mode, true, actorId);
  const board = ensureBoard(project, mode);
  const schedule = ensureSchedule(project);
  schedule.sprintDays = o.sprintDays;
  schedule.sprintStart = o.sprintStart;

  // Sprints.
  const sprintIds = [];
  if (mode === 'scrum') {
    if (actorId && !allowed(ws, project, actorId, 'sprint')) throw new Error('permission');
    const hasActive = (project.sprints || []).some((sprint) => sprint.state === 'active' && sprint.boardId === board.id);
    for (const item of plan.sprints) {
      let sprint = item.existingId ? project.sprints.find((s) => s.id === item.existingId) : null;
      if (!sprint) {
        sprint = { id: uid('s'), name: item.name, goal: item.goal, state: 'future', start: asIssueDate(item.start), end: asIssueDate(item.end), boardId: board.id, completedAt: '' };
        project.sprints.push(sprint);
      } else {
        sprint.end = asIssueDate(item.end);
        if (!sprint.goal) sprint.goal = item.goal;
      }
      if (item.current && o.startCurrent && !hasActive && sprint.state === 'future') sprint.state = 'active';
      sprintIds[item.index] = sprint.id;
    }
  }

  const tasks = schedule.tasks;
  const result = { created: 0, updated: 0, epics: 0, versions: 0, links: 0, sprints: plan.sprints.length, board: board.id, mode };
  // Epics first so tasks can point at them.
  for (const row of plan.rows.filter((item) => item.role === 'epic')) {
    const patch = { summary: row.task.name || '—', start: asIssueDate(dayOf(row.task.start)), due: asIssueDate(dayOf(row.task.finish)) };
    if (row.issue) { updateIssue(ws, project.id, row.issue.id, patch, actorId); result.updated += 1; } else {
      const epic = createIssue(ws, project.id, { ...patch, typeId: 'epic', statusId: 'backlog', assigneeId: row.task.assigneeId, description: row.task.notes }, actorId);
      row.task.issueId = epic.id;
      row.issue = epic;
      result.created += 1;
    }
    result.epics += 1;
  }
  // Milestones become versions.
  for (const row of plan.rows.filter((item) => item.role === 'version')) {
    let version = (project.versions || []).find((v) => v.id === row.task.versionId);
    if (!version) {
      version = { id: uid('v'), name: row.task.name || 'Milestone', description: row.task.notes || '', released: false, releaseDate: '', startDate: '' };
      project.versions.push(version);
      row.task.versionId = version.id;
    }
    version.name = row.task.name || version.name;
    version.releaseDate = asIssueDate(dayOf(row.task.finish));
    result.versions += 1;
  }
  // Working tasks.
  for (const row of plan.rows.filter((item) => item.role === 'issue')) {
    const task = row.task;
    const top = topSummaryOf(tasks, row.at);
    const epicId = top != null ? tasks[top].issueId : '';
    const nextMilestone = tasks.slice(row.at + 1).find((other) => other.milestone && other.versionId && other.level <= task.level + 1);
    const patch = {
      summary: task.name || '—', start: asIssueDate(dayOf(task.start)), due: asIssueDate(dayOf(task.finish)),
      assigneeId: task.assigneeId, epicId: epicId || '', storyPoints: task.points,
      originalEstimate: task.duration * 8 * 60,
    };
    if (nextMilestone) patch.fixVersionIds = [nextMilestone.versionId];
    let place = {};
    if (row.place.startsWith('sprint:')) place = { sprintId: sprintIds[Number(row.place.slice(7))] || '', statusId: 'todo' };
    else if (row.place === 'todo') place = { sprintId: '', statusId: 'todo' };
    else place = { sprintId: '', statusId: 'backlog' };
    if (mode === 'kanban') delete place.sprintId;
    if (row.issue) {
      // An issue someone is already working on keeps its sprint and status.
      const keep = row.locked ? {} : place;
      if (keep.statusId && keep.statusId === row.issue.statusId) delete keep.statusId;
      const { statusId, ...rest } = { ...patch, ...keep };
      updateIssue(ws, project.id, row.issue.id, rest, actorId);
      if (statusId && !row.locked) updateIssue(ws, project.id, row.issue.id, { statusId }, actorId);
      result.updated += 1;
    } else {
      const issue = createIssue(ws, project.id, { ...patch, ...place, typeId: task.kind || 'task', description: task.notes || '' }, actorId);
      task.issueId = issue.id;
      row.issue = issue;
      result.created += 1;
    }
  }
  // Links between the issues of linked working tasks.
  const issueOf = new Map(tasks.map((task) => [task.id, task.issueId]));
  tasks.forEach((task, at) => {
    if (isSummary(tasks, at) || task.milestone || !task.issueId) return;
    for (const pred of task.preds) {
      const p = tasks.findIndex((other) => other.id === pred.id);
      if (p < 0) continue;
      // A summary predecessor means its last working tasks.
      const sources = isSummary(tasks, p)
        ? tasks.slice(subtree(tasks, p)[0] + 1, subtree(tasks, p)[1]).filter((other, k) => !isSummary(tasks, subtree(tasks, p)[0] + 1 + k) && !other.milestone)
        : [tasks[p]];
      for (const source of sources) {
        const fromId = issueOf.get(source.id);
        if (!fromId || fromId === task.issueId) continue;
        const from = project.issues.find((issue) => issue.id === fromId);
        if (!from || from.links.some((link) => link.type === 'blocks' && link.direction === 'out' && link.otherId === task.issueId)) continue;
        try { addLink(ws, project.id, fromId, 'blocks', task.issueId, actorId); result.links += 1; } catch { /* a loop is left out */ }
      }
    }
  });
  schedule.applied = { mode, at: new Date(o.now).toISOString() };
  return result;
}

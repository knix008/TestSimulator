import { addBusinessHours } from './services.js';

const SLA_HOURS = { highest: 4, high: 8, medium: 24, low: 72, lowest: 120 };

export function isDoneStatus(project, statusId) {
  return project.statuses?.find((status) => status.id === statusId)?.category === 'done';
}

export function isDone(project, issue) {
  return isDoneStatus(project, issue?.statusId);
}

/** Status at an instant, walked forward from the first recorded change. Null if the issue did not exist yet. */
export function statusAt(issue, time) {
  if (!issue || Date.parse(issue.created) > time) return null;
  const changes = (issue.history || [])
    .filter((entry) => entry.field === 'status' && entry.at)
    .slice()
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
  let status = changes.length ? (changes[0].from || issue.statusId) : issue.statusId;
  for (const change of changes) {
    if (Date.parse(change.at) > time) break;
    status = change.to;
  }
  return status || issue.statusId;
}

export function slaState(project, issue, now = Date.now(), calendar = null) {
  if (!issue || !['incident', 'request'].includes(issue.typeId)) return null;
  const hours = SLA_HOURS[issue.priorityId] ?? 24;
  const due = calendar ? addBusinessHours(calendar, Date.parse(issue.created), hours) : Date.parse(issue.created) + hours * 3600000;
  const done = isDone(project, issue);
  const stopped = done ? Date.parse(issue.updated) : now;
  const breached = Number.isFinite(stopped) && stopped > due;
  return { due, hours, breached, met: done && !breached, remaining: due - (done ? Date.parse(issue.updated) : now), business: Boolean(calendar) };
}

function pointsWeight(issues) {
  const pointed = issues.some((issue) => Number(issue.storyPoints) > 0);
  return (issue) => (pointed ? (Number(issue.storyPoints) || 0) : 1);
}

export function burndown(project, sprint, now = Date.now()) {
  if (!sprint?.start || !sprint?.end) return null;
  const start = Date.parse(sprint.start);
  const end = Date.parse(sprint.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const issues = project.issues.filter((issue) => issue.sprintId === sprint.id && issue.typeId !== 'epic');
  const weight = pointsWeight(issues);
  const total = issues.reduce((sum, issue) => sum + weight(issue), 0);
  const steps = Math.min(60, Math.max(2, Math.round((end - start) / 86400000) + 1));
  const days = [];
  for (let index = 0; index < steps; index += 1) {
    const t = Math.min(end, start + index * 86400000);
    let remaining = null;
    if (t <= now) {
      remaining = 0;
      for (const issue of issues) {
        const status = statusAt(issue, t);
        if (status && !isDoneStatus(project, status)) remaining += weight(issue);
      }
    }
    days.push({
      t,
      ideal: total * (1 - index / (steps - 1)),
      remaining,
    });
    if (t >= end) break;
  }
  // pointed: the work is counted in story points (else in issues), for the chart's axis.
  return { start, end, total, days, pointed: issues.some((issue) => Number(issue.storyPoints) > 0) };
}

export function velocity(project) {
  return project.sprints
    .filter((sprint) => sprint.state === 'closed')
    .map((sprint) => {
      const issues = project.issues.filter((issue) => issue.sprintId === sprint.id && issue.typeId !== 'epic' && issue.typeId !== 'subtask');
      const weight = pointsWeight(issues);
      const committed = issues.reduce((sum, issue) => sum + weight(issue), 0);
      const completed = issues.filter((issue) => isDone(project, issue)).reduce((sum, issue) => sum + weight(issue), 0);
      return { id: sprint.id, name: sprint.name, committed, completed };
    });
}

export function cumulativeFlow(project, now = Date.now(), days = 14) {
  const rows = [];
  for (let index = days - 1; index >= 0; index -= 1) {
    const t = now - index * 86400000;
    const counts = { t, new: 0, indeterminate: 0, done: 0 };
    for (const issue of project.issues) {
      if (issue.typeId === 'epic' || issue.typeId === 'subtask') continue;
      const status = statusAt(issue, t);
      if (!status) continue;
      const category = project.statuses.find((item) => item.id === status)?.category || 'new';
      counts[category] = (counts[category] || 0) + 1;
    }
    rows.push(counts);
  }
  return rows;
}

export function createdResolved(project, now = Date.now(), weeks = 8) {
  const rows = [];
  for (let index = weeks - 1; index >= 0; index -= 1) {
    const from = now - (index + 1) * 7 * 86400000;
    const to = now - index * 7 * 86400000;
    let created = 0;
    let resolved = 0;
    for (const issue of project.issues) {
      const born = Date.parse(issue.created);
      if (born > from && born <= to) created += 1;
      const finished = (issue.history || []).some((entry) => entry.field === 'status' && isDoneStatus(project, entry.to) && Date.parse(entry.at) > from && Date.parse(entry.at) <= to);
      if (finished) resolved += 1;
    }
    rows.push({ from, to, created, resolved });
  }
  return rows;
}

/** Fields issues can be grouped by in reports, distributions and lists. */
export const GROUP_FIELDS = ['status', 'priority', 'type', 'assignee', 'reporter', 'epic', 'sprint', 'component', 'version', 'label', 'resolution'];

/** The group keys of one issue for a field ('none' / 'unassigned' when empty; components, versions and labels may give several). */
export function groupKeys(issue, field) {
  const one = (value, empty = 'none') => [value || empty];
  const many = (list) => (list && list.length ? [...new Set(list)] : ['none']);
  if (field === 'status') return one(issue.statusId);
  if (field === 'priority') return one(issue.priorityId);
  if (field === 'type') return one(issue.typeId);
  if (field === 'assignee') return one(issue.assigneeId, 'unassigned');
  if (field === 'reporter') return one(issue.reporterId, 'unassigned');
  if (field === 'epic') return one(issue.typeId === 'epic' ? issue.id : issue.epicId);
  if (field === 'sprint') return one(issue.sprintId);
  if (field === 'component') return many(issue.componentIds);
  if (field === 'version') return many(issue.fixVersionIds);
  if (field === 'label') return many(issue.labels);
  if (field === 'resolution') return one(issue.resolutionId);
  return ['none'];
}

/** Issues in groups for a field, in the order the project lists the values (empty group last). */
export function groupIssues(project, issues, field) {
  const groups = new Map();
  for (const issue of issues) {
    for (const key of groupKeys(issue, field)) {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(issue);
    }
  }
  const order = {
    status: project.statuses, priority: project.priorities, type: project.issueTypes, sprint: project.sprints,
    component: project.components, version: project.versions, resolution: project.resolutions,
    epic: (project.issues || []).filter((issue) => issue.typeId === 'epic'),
  }[field];
  const rank = (key) => {
    if (key === 'none' || key === 'unassigned') return Number.MAX_SAFE_INTEGER;
    const at = (order || []).findIndex((item) => item.id === key);
    return at < 0 ? Number.MAX_SAFE_INTEGER - 1 : at;
  };
  return [...groups.entries()].map(([id, list]) => ({ id, issues: list })).sort((a, b) => rank(a.id) - rank(b.id) || String(a.id).localeCompare(String(b.id)));
}

export function pie(project, issues, field) {
  return groupIssues(project, issues, field).map((group) => ({ id: group.id, value: group.issues.length }));
}

/** Estimates, remaining and logged time per group (by person unless another field is given). */
export function timeReport(project, issues, field = 'assignee') {
  return groupIssues(project, issues, field).map((group) => ({
    id: group.id,
    userId: field === 'assignee' ? group.id : undefined,
    count: group.issues.length,
    original: group.issues.reduce((sum, issue) => sum + (Number(issue.originalEstimate) || 0), 0),
    remaining: group.issues.reduce((sum, issue) => sum + (Number(issue.remainingEstimate) || 0), 0),
    spent: group.issues.reduce((sum, issue) => sum + (Number(issue.timeSpent) || 0), 0),
  }));
}

export function sprintReport(project, sprint) {
  if (!sprint) return null;
  const issues = project.issues.filter((issue) => issue.sprintId === sprint.id && issue.typeId !== 'subtask');
  const weight = pointsWeight(issues);
  const completed = issues.filter((issue) => isDone(project, issue));
  const incomplete = issues.filter((issue) => !isDone(project, issue));
  const start = Date.parse(sprint.start);
  return {
    completed: completed.map((issue) => issue.id),
    incomplete: incomplete.map((issue) => issue.id),
    added: issues.filter((issue) => start && Date.parse(issue.created) > start).map((issue) => issue.id),
    pointsDone: completed.reduce((sum, issue) => sum + weight(issue), 0),
    pointsTotal: issues.reduce((sum, issue) => sum + weight(issue), 0),
  };
}

export function inspect(project, now = Date.now(), calendar = null) {
  const warnings = [];
  const active = new Set(project.sprints.filter((sprint) => sprint.state === 'active').map((sprint) => sprint.id));
  for (const issue of project.issues) {
    if (issue.typeId === 'subtask' && issue.parentId && !project.issues.some((item) => item.id === issue.parentId)) {
      warnings.push({ severity: 'error', issueId: issue.id, code: 'orphan-subtask' });
    }
    if (isDone(project, issue) && !issue.resolutionId) warnings.push({ severity: 'warn', issueId: issue.id, code: 'done-unresolved' });
    if (active.has(issue.sprintId) && !issue.assigneeId && !isDone(project, issue) && issue.typeId !== 'epic' && issue.typeId !== 'subtask') {
      warnings.push({ severity: 'warn', issueId: issue.id, code: 'unassigned-sprint' });
    }
    const sla = slaState(project, issue, now, calendar);
    if (sla?.breached && !isDone(project, issue)) warnings.push({ severity: 'error', issueId: issue.id, code: 'sla-breached' });
    const blocked = (issue.links || []).some((link) => {
      if (link.type !== 'blocks' || link.direction !== 'in') return false;
      const other = project.issues.find((item) => item.id === link.otherId);
      return other && !isDone(project, other);
    });
    if (blocked && !isDone(project, issue)) warnings.push({ severity: 'warn', issueId: issue.id, code: 'blocked' });
  }
  return warnings;
}

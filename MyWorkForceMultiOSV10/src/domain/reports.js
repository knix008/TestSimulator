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

export function slaState(project, issue, now = Date.now()) {
  if (!issue || !['incident', 'request'].includes(issue.typeId)) return null;
  const hours = SLA_HOURS[issue.priorityId] ?? 24;
  const due = Date.parse(issue.created) + hours * 3600000;
  const done = isDone(project, issue);
  const stopped = done ? Date.parse(issue.updated) : now;
  const breached = Number.isFinite(stopped) && stopped > due;
  return { due, hours, breached, met: done && !breached, remaining: due - (done ? Date.parse(issue.updated) : now) };
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
  return { start, end, total, days };
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

export function pie(project, issues, field) {
  const groups = new Map();
  for (const issue of issues) {
    let key = 'none';
    if (field === 'status') key = issue.statusId || 'none';
    else if (field === 'priority') key = issue.priorityId || 'none';
    else if (field === 'type') key = issue.typeId || 'none';
    else if (field === 'assignee') key = issue.assigneeId || 'unassigned';
    groups.set(key, (groups.get(key) || 0) + 1);
  }
  return [...groups.entries()].map(([id, value]) => ({ id, value }));
}

export function timeReport(project, issues) {
  const rows = new Map();
  for (const issue of issues) {
    const id = issue.assigneeId || 'unassigned';
    const row = rows.get(id) || { userId: id, original: 0, remaining: 0, spent: 0 };
    row.original += Number(issue.originalEstimate) || 0;
    row.remaining += Number(issue.remainingEstimate) || 0;
    row.spent += Number(issue.timeSpent) || 0;
    rows.set(id, row);
  }
  return [...rows.values()];
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

export function inspect(project, now = Date.now()) {
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
    const sla = slaState(project, issue, now);
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

import { fromDateInput } from './util.js';

// Dependencies between issues ("A blocks B") and the dates the timeline draws them on.

const DAY = 86_400_000;

function isDone(project, issue) {
  return (project.statuses || []).find((status) => status.id === issue?.statusId)?.category === 'done';
}

function byId(project, id) {
  return (project.issues || []).find((issue) => issue.id === id) || null;
}

/** Issues this one waits for (they block it), and the ones still open among them. */
export function blockersOf(project, issue) {
  const all = (issue?.links || []).filter((link) => link.type === 'blocks' && link.direction === 'in').map((link) => byId(project, link.otherId)).filter(Boolean);
  return { all, open: all.filter((other) => !isDone(project, other)) };
}

/** Issues waiting for this one. */
export function blockedBy(project, issue) {
  return (issue?.links || []).filter((link) => link.type === 'blocks' && link.direction === 'out').map((link) => byId(project, link.otherId)).filter(Boolean);
}

/** True when `from` blocking `to` would close a loop (`to` already blocks `from`, directly or through others). */
export function wouldCycle(project, fromId, toId) {
  const seen = new Set();
  const stack = [toId];
  while (stack.length) {
    const id = stack.pop();
    if (id === fromId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const next of blockedBy(project, byId(project, id))) stack.push(next.id);
  }
  return false;
}

const dayOf = (value) => {
  const time = Date.parse(value || '');
  if (!Number.isFinite(time)) return null;
  const date = new Date(time);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};

/**
 * The days an issue covers on the timeline: its own start and due dates, else its sprint's, else from when
 * it was made for a week. `planned` is true only when both ends were set on the issue.
 */
export function issueSpan(project, issue) {
  const sprint = (project.sprints || []).find((item) => item.id === issue.sprintId);
  let start = dayOf(issue.start) ?? dayOf(sprint?.start);
  let end = dayOf(issue.due) ?? dayOf(sprint?.end);
  const planned = dayOf(issue.start) != null && dayOf(issue.due) != null;
  if (start == null && end == null) start = dayOf(issue.created) ?? dayOf(new Date().toISOString());
  if (start == null) start = end - 6 * DAY;
  if (end == null) end = start + 6 * DAY;
  if (end < start) [start, end] = [end, start];
  return { start, end, planned };
}

/** "A blocks B" where A ends after B starts: B cannot start on time. */
export function scheduleConflicts(project) {
  const out = [];
  for (const issue of project.issues || []) {
    for (const next of blockedBy(project, issue)) {
      if (isDone(project, issue)) continue;
      const a = issueSpan(project, issue);
      const b = issueSpan(project, next);
      if (a.end >= b.start) out.push({ fromId: issue.id, toId: next.id, days: Math.round((a.end - b.start) / DAY) + 1 });
    }
  }
  return out;
}

/** Moves an issue's dates by whole days (dragging its bar), or one end of it (dragging an edge). */
export function shiftedDates(project, issue, days, edge = 'both') {
  const span = issueSpan(project, issue);
  const start = edge === 'end' ? span.start : span.start + days * DAY;
  let end = edge === 'start' ? span.end : span.end + days * DAY;
  if (end < start) end = start;
  // Stored like a date picked in the issue (local noon), so both read back as the same day.
  const iso = (time) => fromDateInput(new Date(time).toISOString().slice(0, 10));
  return { start: iso(start), due: iso(end) };
}

export const DAY_MS = DAY;

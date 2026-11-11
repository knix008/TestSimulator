// Reports, computed from issue_history (status timelines) and the issues table:
// cumulative flow, control chart (cycle/lead time), throughput, created vs resolved, workload, version report,
// and a breakdown (pie gadget).
import { NotFoundError, ValidationError, check } from '../errors.js';
import { requireUser, assertProject, accessibleProjectIds, nowOf, parseJson, today } from './common.js';

const DAY = 86400000;

/** 'YYYY-MM-DD' | epoch ms | undefined → epoch ms (local midnight for dates). */
function toMs(v, fallback) {
  if (v == null || v === '') return fallback;
  if (typeof v === 'number' || /^\d{10,}$/.test(String(v))) return Number(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
  if (!m) throw new ValidationError('INVALID_DATE', 'Dates are YYYY-MM-DD or epoch milliseconds');
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
}
const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const addDays = (ms, n) => { const d = new Date(ms); d.setDate(d.getDate() + n); return d.getTime(); };
const startOfWeek = (ms) => { const d = new Date(startOfDay(ms)); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return d.getTime(); };

function stats(values) {
  if (!values.length) return { count: 0, average: null, median: null, min: null, max: null, stddev: null };
  const s = [...values].sort((a, b) => a - b);
  const avg = s.reduce((a, b) => a + b, 0) / s.length;
  const median = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  const sd = Math.sqrt(s.reduce((a, b) => a + (b - avg) ** 2, 0) / s.length);
  return { count: s.length, average: avg, median, min: s[0], max: s[s.length - 1], stddev: sd };
}

export function createReports(core) {
  const db = () => core.db;
  const S = () => core.services;

  /** Columns of a board in board order (left → right). */
  async function boardColumns(boardId) {
    return (await db().select('board_columns', { board_id: boardId }, { order: 'position' }))
      .map((c) => ({ id: c.id, name: c.name, icon: c.icon ?? null, statusIds: parseJson(c.status_ids, []) || [] }));
  }

  /**
   * The reference ("done") column of a board: its RIGHTMOST column, whatever its statuses' categories say.
   * It follows column reordering. → { id, name, icon, statusIds } | null (no columns).
   */
  const referenceOf = (cols) => (cols.length ? cols[cols.length - 1] : null);
  const refOut = (c) => (c ? { id: c.id, name: c.name, icon: c.icon ?? null } : null);

  /**
   * Issue scope + columns of a report. q: { boardId } or { projectId } (or { jql }).
   * Columns come from the board, or one per status of the project. `reference` = the board's rightmost
   * column (board scope only; null for a project scope, whose "done" stays the done-category / resolution).
   */
  async function scope(ctx, q) {
    requireUser(ctx);
    if (q.boardId) {
      const board = await S().boards.loadRaw(q.boardId);
      if (board.project_id) await assertProject(db(), ctx, board.project_id, 'viewer');
      const { where, params } = await S().boards.boardWhere(ctx, board);
      const cols = await boardColumns(board.id);
      return { where, params, columns: cols, board, reference: referenceOf(cols) };
    }
    if (q.projectId) {
      await assertProject(db(), ctx, q.projectId, 'viewer');
      const sts = await db().select('statuses', { project_id: q.projectId }, { order: 'position' });
      const extra = q.jql ? await S().issues.compileFor(ctx, q.jql) : null;
      return {
        where: 'i."project_id" = ? AND i."archived" = 0' + (extra ? ` AND (${extra.where})` : ''), params: [q.projectId, ...(extra?.params || [])],
        columns: sts.map((s) => ({ id: s.id, name: s.name, statusIds: [s.id] })),
        reference: null,
      };
    }
    throw new ValidationError('REQUIRED', 'boardId or projectId is required', { field: 'boardId' });
  }

  async function statusCategories(statusIds) {
    if (!statusIds.length) return {};
    const rows = await db().all(`SELECT "id", "category" FROM "statuses" WHERE "id" IN (${statusIds.map(() => '?').join(', ')})`, statusIds);
    return Object.fromEntries(rows.map((r) => [r.id, r.category]));
  }

  /** Status timelines: issueId → { created, steps: [[at, statusId]] } (sorted). */
  async function timelines(sc) {
    const issues = await db().all(`SELECT i."id", i."key", i."summary", i."created_at", i."status_id", i."story_points", i."type_id" FROM "issues" i WHERE ${sc.where}`, sc.params);
    const hist = await db().all(
      `SELECT h."issue_id", h."field", h."from_value", h."to_value", h."at" FROM "issue_history" h JOIN "issues" i ON i."id" = h."issue_id" WHERE ${sc.where} AND h."field" IN ('created', 'status') ORDER BY h."issue_id", h."at", h."id"`,
      sc.params);
    const by = {};
    for (const h of hist) (by[h.issue_id] ||= []).push(h);
    const out = new Map();
    for (const i of issues) {
      const hs = by[i.id] || [];
      const steps = [];
      const created = hs.find((h) => h.field === 'created');
      const firstStatus = hs.find((h) => h.field === 'status');
      steps.push([created ? Number(created.at) : Number(i.created_at), created?.to_value || firstStatus?.from_value || i.status_id]);
      for (const h of hs) if (h.field === 'status') steps.push([Number(h.at), h.to_value]);
      out.set(i.id, { issue: i, steps });
    }
    return out;
  }

  /** Status of a timeline at time t (null before creation). */
  function statusAt(steps, t) {
    let s = null;
    for (const [at, sid] of steps) { if (at <= t) s = sid; else break; }
    return s;
  }

  /** Completion info of a timeline against end/start status sets. */
  function cycle(tl, startSet, endSet) {
    const { steps } = tl;
    const cur = steps[steps.length - 1][1];
    if (!endSet.has(cur)) return null;
    let doneAt = null;
    for (let k = steps.length - 1; k >= 0; k--) {
      if (endSet.has(steps[k][1]) && (k === 0 || !endSet.has(steps[k - 1][1]))) { doneAt = steps[k][0]; break; }
    }
    let startAt = null;
    for (const [at, sid] of steps) if (startSet.has(sid) || endSet.has(sid)) { startAt = at; break; }
    return { doneAt, startAt: startAt ?? doneAt, createdAt: steps[0][0] };
  }

  async function defaultSets(sc, q) {
    const allIds = sc.columns.flatMap((c) => c.statusIds);
    const cat = await statusCategories(allIds);
    const pick = (ids) => new Set(sc.columns.filter((c) => ids.includes(c.id)).flatMap((c) => c.statusIds));
    // Board scope: the end is the rightmost column. Project scope: the done-category statuses.
    const endCols = q.endColumnIds ? String(q.endColumnIds).split(',')
      : sc.reference ? [sc.reference.id]
        : sc.columns.filter((c) => c.statusIds.length && c.statusIds.every((s) => cat[s] === 'done')).map((c) => c.id);
    let startCols;
    if (q.startColumnIds) startCols = String(q.startColumnIds).split(',');
    else {
      // Columns with an in-progress status (never an end column); without any (a board whose columns are
      // all to-do / done statuses) the columns after the leading "not started" ones, else the one before the end.
      const notEnd = sc.columns.filter((c) => !endCols.includes(c.id));
      startCols = notEnd.filter((c) => c.statusIds.some((s) => cat[s] === 'inprogress')).map((c) => c.id);
      if (!startCols.length && sc.reference) {
        const settings = parseJson(sc.board?.settings, {}) || {};
        const backlog = new Set(settings.backlog?.enabled ? settings.backlog.statusIds || [] : []);
        const notStarted = (c) => !c.statusIds.length || c.statusIds.every((s) => backlog.has(s) || cat[s] === 'todo');
        const first = notEnd.findIndex((c) => !notStarted(c));
        if (first >= 0) startCols = notEnd.slice(first).map((c) => c.id);
        else if (notEnd.length > 1) startCols = [notEnd[notEnd.length - 1].id];
      }
    }
    return { startSet: pick(startCols), endSet: pick(endCols), startCols, endCols, cat };
  }

  /** Status ids that count as done in a board scope (the rightmost column's), or null for a project scope. */
  const doneSetOf = (sc) => (sc.reference ? new Set(sc.reference.statusIds) : null);

  function range(ctx, q, days) {
    const now = nowOf(ctx);
    const to = Math.min(toMs(q.to, now), now);
    const from = toMs(q.from, startOfDay(addDays(to, -days)));
    check(from <= to, 'INVALID_RANGE', 'from must be before to');
    check((to - from) / DAY <= 3660, 'INVALID_RANGE', 'The range is limited to 10 years');
    return { from, to, now };
  }

  return {
    /** Cumulative flow: issues per column at the end of each day. */
    async cfd(ctx, q = {}) {
      const sc = await scope(ctx, q);
      const { from, to } = range(ctx, q, 30);
      const tls = await timelines(sc);
      const days = [];
      for (let d = startOfDay(from); d <= to; d = addDays(d, 1)) days.push(d);
      const colOf = {};
      for (const c of sc.columns) for (const s of c.statusIds) colOf[s] = c.id;
      const series = Object.fromEntries(sc.columns.map((c) => [c.id, new Array(days.length).fill(0)]));
      for (const { steps } of tls.values()) {
        let k = 0;
        let cur = null;
        for (let di = 0; di < days.length; di++) {
          const t = Math.min(addDays(days[di], 1) - 1, to);
          while (k < steps.length && steps[k][0] <= t) cur = steps[k++][1];
          if (cur && colOf[cur]) series[colOf[cur]][di]++;
        }
      }
      return {
        from, to, days: days.map((d) => today(d)),
        columns: sc.columns.map((c) => ({ id: c.id, name: c.name, icon: c.icon ?? null, statusIds: c.statusIds })),
        series: sc.columns.map((c) => ({ columnId: c.id, values: series[c.id] })),
        // board order left → right; the last (rightmost) column is the done band
        referenceColumn: refOut(sc.reference), doneColumnId: sc.reference?.id ?? null,
      };
    },

    /** Control chart: cycle time (start columns → end columns) and lead time (created → done) per completed issue. */
    async control(ctx, q = {}) {
      const sc = await scope(ctx, q);
      const { from, to } = range(ctx, q, 90);
      const { startSet, endSet, startCols, endCols } = await defaultSets(sc, q);
      const tls = await timelines(sc);
      const points = [];
      for (const tl of tls.values()) {
        const c = cycle(tl, startSet, endSet);
        if (!c || c.doneAt == null || c.doneAt < from || c.doneAt > to) continue;
        points.push({
          issueId: tl.issue.id, key: tl.issue.key, summary: tl.issue.summary, typeId: tl.issue.type_id,
          completedAt: c.doneAt, cycleTime: Math.max(0, c.doneAt - c.startAt), leadTime: Math.max(0, c.doneAt - c.createdAt),
        });
      }
      points.sort((a, b) => a.completedAt - b.completedAt);
      const w = Math.max(3, Math.round(points.length * 0.2));
      const rolling = points.map((p, k) => {
        const win = points.slice(Math.max(0, k - w + 1), k + 1);
        return { at: p.completedAt, average: win.reduce((a, b) => a + b.cycleTime, 0) / win.length };
      });
      return { from, to, referenceColumn: refOut(sc.reference), startColumnIds: startCols, endColumnIds: endCols, points, cycle: stats(points.map((p) => p.cycleTime)), lead: stats(points.map((p) => p.leadTime)), rolling, window: w };
    },

    /** Throughput: completed issues (and points) per day or week. */
    async throughput(ctx, q = {}) {
      const sc = await scope(ctx, q);
      const interval = q.interval === 'day' ? 'day' : 'week';
      const { from, to } = range(ctx, q, interval === 'day' ? 30 : 84);
      const { startSet, endSet } = await defaultSets(sc, q);
      const tls = await timelines(sc);
      const bucketOf = interval === 'day' ? startOfDay : startOfWeek;
      const buckets = new Map();
      for (let b = bucketOf(from); b <= to; b = addDays(b, interval === 'day' ? 1 : 7)) buckets.set(b, { start: b, date: today(b), count: 0, points: 0 });
      for (const tl of tls.values()) {
        const c = cycle(tl, startSet, endSet);
        if (!c || c.doneAt < from || c.doneAt > to) continue;
        const b = buckets.get(bucketOf(c.doneAt));
        if (b) { b.count++; b.points += Number(tl.issue.story_points || 0); }
      }
      const list = [...buckets.values()];
      return { from, to, interval, referenceColumn: refOut(sc.reference), buckets: list, average: list.length ? list.reduce((a, b) => a + b.count, 0) / list.length : 0 };
    },

    /**
     * Created vs resolved per day (with cumulative totals). Board scope: "resolved" = the (last) entry into the
     * board's rightmost column of an issue still there; project scope: the issue's resolution date.
     */
    async createdResolved(ctx, q = {}) {
      const sc = await scope(ctx, q);
      const { from, to } = range(ctx, q, 30);
      let rows;
      const doneSet = doneSetOf(sc);
      if (doneSet) {
        rows = [];
        for (const tl of (await timelines(sc)).values()) {
          const c = cycle(tl, doneSet, doneSet);
          rows.push({ created_at: tl.issue.created_at, resolved_at: c?.doneAt ?? null });
        }
      } else rows = await db().all(`SELECT i."created_at", i."resolved_at" FROM "issues" i WHERE ${sc.where}`, sc.params);
      const days = [];
      for (let d = startOfDay(from); d <= to; d = addDays(d, 1)) days.push({ start: d, date: today(d), created: 0, resolved: 0, cumulativeCreated: 0, cumulativeResolved: 0 });
      const idx = (ms) => { if (ms == null || ms < days[0].start || ms > to) return -1; return Math.floor((startOfDay(ms) - days[0].start) / DAY + 0.5); };
      for (const r of rows) {
        const c = idx(Number(r.created_at)); if (c >= 0 && days[c]) days[c].created++;
        const s = r.resolved_at == null ? -1 : idx(Number(r.resolved_at)); if (s >= 0 && days[s]) days[s].resolved++;
      }
      let cc = 0; let cr = 0;
      for (const d of days) { cc += d.created; cr += d.resolved; d.cumulativeCreated = cc; d.cumulativeResolved = cr; }
      return { from, to, referenceColumn: refOut(sc.reference), resolvedBy: doneSet ? 'column' : 'resolution', days, created: cc, resolved: cr };
    },

    /** Workload: open issues per assignee (board scope: not in the rightmost column; project scope: unresolved). */
    async workload(ctx, q = {}) {
      const sc = await scope(ctx, q);
      const done = sc.reference ? sc.reference.statusIds : null;
      const open = done ? (done.length ? `i."status_id" NOT IN (${done.map(() => '?').join(', ')})` : '1 = 1') : 'i."resolution_id" IS NULL';
      const rows = await db().all(
        `SELECT i."assignee_id", COUNT(*) AS n, SUM(COALESCE(i."story_points", 0)) AS points,
           SUM(CASE WHEN i."remaining_estimate" IS NOT NULL THEN i."remaining_estimate" WHEN i."original_estimate" IS NOT NULL THEN i."original_estimate" - i."time_spent" ELSE 0 END) AS remaining
         FROM "issues" i WHERE ${sc.where} AND ${open} GROUP BY i."assignee_id"`, [...sc.params, ...(done || [])]);
      const users = Object.fromEntries((await db().all('SELECT "id", "display_name", "avatar" FROM "users"')).map((u) => [u.id, u]));
      const items = rows.map((r) => ({
        userId: r.assignee_id || null, name: r.assignee_id ? users[r.assignee_id]?.display_name || null : null, avatar: r.assignee_id ? users[r.assignee_id]?.avatar || null : null,
        count: Number(r.n), points: Number(r.points || 0), remaining: Math.max(0, Number(r.remaining || 0)),
      })).sort((a, b) => b.count - a.count);
      return { referenceColumn: refOut(sc.reference), items, total: items.reduce((a, b) => a + b.count, 0) };
    },

    /**
     * Version report: progress, burn-up from history, predicted release date by recent velocity.
     * q.boardId: done = in that board's rightmost column (the categories of the other statuses stay, a
     * done-category status outside it counts as in progress); without it done = the done category.
     */
    async version(ctx, versionId, q = {}) {
      const v = await db().get('SELECT * FROM "versions" WHERE "id" = ?', [versionId]);
      if (!v) throw new NotFoundError('VERSION_NOT_FOUND', 'Version not found');
      await assertProject(db(), ctx, v.project_id, 'viewer');
      let reference = null;
      if (q.boardId) {
        const board = await S().boards.loadRaw(q.boardId);
        if (board.project_id) await assertProject(db(), ctx, board.project_id, 'viewer');
        reference = referenceOf(await boardColumns(board.id));
      }
      const sc = { where: 'i."id" IN (SELECT "issue_id" FROM "issue_versions" WHERE "version_id" = ? AND "kind" = \'fix\')', params: [versionId] };
      const tls = await timelines(sc);
      const allStatus = [...new Set([...tls.values()].flatMap((t) => t.steps.map((s) => s[1])))];
      const cat = await statusCategories(allStatus);
      if (reference) {
        const doneSet = new Set(reference.statusIds);
        for (const s of allStatus) if (doneSet.has(s)) cat[s] = 'done'; else if (cat[s] === 'done') cat[s] = 'inprogress';
      }
      const now = nowOf(ctx);
      const created = [...tls.values()].map((t) => t.steps[0][0]);
      const start = v.start_date ? toMs(v.start_date) : created.length ? startOfDay(Math.min(...created)) : startOfDay(now);
      const end = startOfDay(now);
      const byCat = { todo: 0, inprogress: 0, done: 0 };
      const pts = { total: 0, done: 0 };
      const issues = [];
      for (const tl of tls.values()) {
        const c = cat[tl.steps[tl.steps.length - 1][1]] || 'todo';
        byCat[c]++;
        const p = Number(tl.issue.story_points || 0);
        pts.total += p; if (c === 'done') pts.done += p;
        issues.push({ id: tl.issue.id, key: tl.issue.key, summary: tl.issue.summary, statusId: tl.issue.status_id, category: c, storyPoints: tl.issue.story_points });
      }
      const burnup = [];
      const unit = (tl) => (pts.total > 0 ? Number(tl.issue.story_points || 0) : 1);
      for (let d = start; d <= end && burnup.length < 3660; d = addDays(d, 1)) {
        const t = addDays(d, 1) - 1;
        let scope = 0; let done = 0;
        for (const tl of tls.values()) {
          const s = statusAt(tl.steps, t);
          if (!s) continue;
          scope += unit(tl);
          if (cat[s] === 'done') done += unit(tl);
        }
        burnup.push({ date: today(d), scope, done });
      }
      // velocity over the last 14 days of the burn-up
      let predicted = null;
      if (burnup.length >= 2) {
        const last = burnup[burnup.length - 1];
        const past = burnup[Math.max(0, burnup.length - 15)];
        const days = Math.max(1, burnup.length - 1 - Math.max(0, burnup.length - 15));
        const velocity = (last.done - past.done) / days;
        const remaining = last.scope - last.done;
        if (remaining <= 0) predicted = today(now);
        else if (velocity > 0) predicted = today(addDays(now, Math.ceil(remaining / velocity)));
      }
      return {
        version: { id: v.id, name: v.name, releaseDate: v.release_date, startDate: v.start_date, released: !!Number(v.released) },
        referenceColumn: refOut(reference), total: tls.size, byCategory: byCat, points: pts, issues, burnup, unit: pts.total > 0 ? 'storyPoints' : 'count', predictedReleaseDate: predicted,
      };
    },

    /** Counts of JQL results grouped by a field (pie gadget). q: { jql, field } */
    async breakdown(ctx, q = {}) {
      requireUser(ctx);
      const field = q.field || 'status';
      const c = await S().issues.compileFor(ctx, q.jql || '');
      const ids = await accessibleProjectIds(db(), ctx);
      let where = `(${c.where}) AND i."archived" = 0`;
      const params = [...c.params];
      if (ids) { if (!ids.length) return { field, items: [], total: 0 }; where += ` AND i."project_id" IN (${ids.map(() => '?').join(', ')})`; params.push(...ids); }
      const col = { status: 'status_id', assignee: 'assignee_id', priority: 'priority_id', type: 'type_id', project: 'project_id', reporter: 'reporter_id', epic: 'epic_id', resolution: 'resolution_id' }[field];
      let rows;
      if (col) rows = await db().all(`SELECT i.${db().q(col)} AS k, COUNT(*) AS n FROM "issues" i WHERE ${where} GROUP BY i.${db().q(col)}`, params);
      else if (field === 'labels') rows = await db().all(`SELECT x."label" AS k, COUNT(*) AS n FROM "issue_labels" x JOIN "issues" i ON i."id" = x."issue_id" WHERE ${where} GROUP BY x."label"`, params);
      else if (field === 'component') rows = await db().all(`SELECT x."component_id" AS k, COUNT(*) AS n FROM "issue_components" x JOIN "issues" i ON i."id" = x."issue_id" WHERE ${where} GROUP BY x."component_id"`, params);
      else throw new ValidationError('INVALID_FIELD', 'field must be status, assignee, priority, type, project, reporter, epic, resolution, labels or component');
      const total = Number(await db().value(`SELECT COUNT(*) AS n FROM "issues" i WHERE ${where}`, params, 0));
      return { field, items: rows.map((r) => ({ key: r.k ?? null, count: Number(r.n) })).sort((a, b) => b.count - a.count), total };
    },
  };
}

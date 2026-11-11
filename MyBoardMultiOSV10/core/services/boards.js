// Boards: board CRUD, columns (WIP min/max, status mapping), swimlanes, quick filters, card colours, and the
// board data endpoint (one round trip, shaped for fast rendering).
import { newId } from '../ids.js';
import { NotFoundError, ValidationError, ForbiddenError, check } from '../errors.js';
import { likeEscape } from '../db/sqlgen.js';
import {
  crud, toApi, fromApi, emit, nowOf, requireText, requireUser, assertProject, accessibleProjectIds, isAdmin, parseJson,
} from './common.js';
import { defaultBoardSettings } from './templates.js';
import { defaultColumnIcon } from '../columnicons.js';

const SWIMLANE_MODES = ['none', 'assignee', 'epic', 'project', 'queries', 'priority', 'type'];
const CARD_COLOR_MODES = ['none', 'type', 'priority', 'assignee', 'queries'];
const DAY = 86400000;

export function createBoards(core) {
  const db = () => core.db;
  const S = () => core.services;

  async function loadRaw(id) {
    const b = await db().get('SELECT * FROM "boards" WHERE "id" = ?', [id]);
    if (!b) throw new NotFoundError('BOARD_NOT_FOUND', 'Board not found');
    return b;
  }

  /** Read access: project boards need a project role; cross-project boards are visible to every user. */
  async function loadFor(ctx, id, need = 'viewer') {
    requireUser(ctx);
    const b = await loadRaw(id);
    if (b.project_id) await assertProject(db(), ctx, b.project_id, need === 'config' ? 'admin' : need);
    else if (need === 'config' && !isAdmin(ctx) && b.created_by !== ctx.user?.id) {
      throw new ForbiddenError('BOARD_PERMISSION', 'Only the owner or an administrator can change this board');
    }
    return b;
  }

  function normaliseSettings(input, current) {
    const s = { ...defaultBoardSettings(), ...(current || {}), ...(input || {}) };
    s.backlog = { enabled: false, statusIds: [], ...(current?.backlog || {}), ...(input?.backlog || {}) };
    check(SWIMLANE_MODES.includes(s.swimlanes), 'INVALID_SETTINGS', `swimlanes must be one of ${SWIMLANE_MODES.join(', ')}`);
    check(CARD_COLOR_MODES.includes(s.cardColors), 'INVALID_SETTINGS', `cardColors must be one of ${CARD_COLOR_MODES.join(', ')}`);
    check(Array.isArray(s.cardFields) && s.cardFields.length <= 3, 'INVALID_SETTINGS', 'cardFields holds up to 3 fields');
    check(['storyPoints', 'originalEstimate', 'count'].includes(s.estimation), 'INVALID_SETTINGS', 'estimation must be storyPoints, originalEstimate or count');
    check(['cards', 'parent'].includes(s.subtasks), 'INVALID_SETTINGS', 'subtasks must be cards or parent');
    check(['issueCount', 'none'].includes(s.columnConstraint), 'INVALID_SETTINGS', 'columnConstraint must be issueCount or none');
    s.doneHideDays = s.doneHideDays == null || s.doneHideDays === '' ? null : Math.max(0, Number(s.doneHideDays));
    return s;
  }

  const boardOut = (b) => toApi('boards', b);

  /**
   * The base WHERE of a board (scope + board filter + subtasks mode + access), portable SQL over issues `i`.
   * @returns {Promise<{ where: string, params: any[] }>}
   */
  async function boardWhere(ctx, board, settings) {
    const parts = ['i."archived" = 0'];
    const params = [];
    if (board.project_id) { parts.push('i."project_id" = ?'); params.push(board.project_id); }
    if (board.filter_jql && board.filter_jql.trim()) {
      const c = await S().issues.compileFor(ctx, board.filter_jql);
      parts.push(`(${c.where})`); params.push(...c.params);
    }
    if (settings.subtasks === 'parent') parts.push('i."parent_id" IS NULL');
    const ids = await accessibleProjectIds(db(), ctx);
    if (ids) {
      if (!ids.length) parts.push('1 = 0');
      else { parts.push(`i."project_id" IN (${ids.map(() => '?').join(', ')})`); params.push(...ids); }
    }
    return { where: parts.join(' AND '), params };
  }

  /** The default icon of a column of `boardId` named `name` holding statuses `ids` (core/columnicons.js). */
  async function columnDefaultIcon(d, boardId, name, ids = []) {
    const list = [].concat(ids || []);
    const cats = list.length ? (await d.all(`SELECT "category" FROM "statuses" WHERE "id" IN (${list.map(() => '?').join(', ')})`, list)).map((s) => s.category) : [];
    let backlog = false;
    if (list.length && boardId) {
      const b = await d.get('SELECT "settings" FROM "boards" WHERE "id" = ?', [boardId]);
      const st = parseJson(b?.settings, {}) || {};
      backlog = Boolean(st.backlog?.enabled) && list.every((s) => (st.backlog.statusIds || []).includes(s));
    }
    return defaultColumnIcon(name, cats, { backlog });
  }

  async function columnsOf(boardId) {
    const rows = (await db().select('board_columns', { board_id: boardId }, { order: 'position' })).map((c) => ({ ...c, ids: parseJson(c.status_ids, []) || [] }));
    // rows written around the API (an old import, a copy from an old database) get their default on the way out
    for (const c of rows) if (!c.icon) c.icon = await columnDefaultIcon(db(), boardId, c.name, c.ids);
    return rows;
  }

  // ---- child config entities --------------------------------------------------------------------------------
  const boardProject = async (d, rowOrId, isParent) => {
    const b = await d.get('SELECT "project_id" FROM "boards" WHERE "id" = ?', [isParent ? rowOrId : rowOrId.board_id]);
    if (!b) throw new NotFoundError('BOARD_NOT_FOUND', 'Board not found');
    return b.project_id;
  };
  const boardTopics = (row) => [row.board_id && `board:${row.board_id}`];
  const jqlCheck = async (d, r) => {
    if (r.jql && String(r.jql).trim()) {
      const v = await S().issues.validateJql({ system: true }, r.jql);
      if (!v.ok) throw new ValidationError(v.error.code, v.error.message, v.error.details);
    }
  };
  const columns = crud(core, {
    table: 'board_columns', entity: 'column', parent: 'board_id', projectOf: boardProject, topics: boardTopics,
    fields: ['name', 'icon', 'position', 'wip_min', 'wip_max', 'status_ids'],
    defaults: async () => ({ status_ids: [] }),
    validate: async (d, r, existing) => {
      requireText(r.name, 'name', 100);
      const ids = typeof r.status_ids === 'string' ? JSON.parse(r.status_ids) : r.status_ids || [];
      check(Array.isArray(ids), 'INVALID_STATUS_IDS', 'statusIds must be an array');
      if (r.icon != null && r.icon !== '') requireText(r.icon, 'icon', 255);
      // every column has an icon: a new one without gets the default of its name / statuses (§3.6)
      if (!existing && !r.icon) r.icon = await columnDefaultIcon(d, r.board_id, r.name, ids);
      if (r.wip_min != null && r.wip_max != null) check(Number(r.wip_min) <= Number(r.wip_max), 'INVALID_WIP', 'The minimum must not exceed the maximum');
      // a status belongs to one column only
      const others = await d.all('SELECT "id", "status_ids" FROM "board_columns" WHERE "board_id" = ? AND "id" <> ?', [r.board_id, r.id]);
      for (const o of others) {
        const oi = JSON.parse(o.status_ids || '[]');
        const clash = ids.find((s) => oi.includes(s));
        if (clash) await d.update('board_columns', o.id, { status_ids: oi.filter((s) => !ids.includes(s)) });
      }
    },
  });
  /** PATCH with icon '' / null → the default icon again (never an empty icon). */
  const columnUpdate = columns.update;
  columns.update = async (ctx, id, body = {}) => {
    const clear = body && ('icon' in body) && !body.icon;
    if (clear) {
      const c = await db().get('SELECT * FROM "board_columns" WHERE "id" = ?', [id]);
      if (c) {
        const ids = body.statusIds ?? body.status_ids ?? parseJson(c.status_ids, []) ?? [];
        body = { ...body, icon: await columnDefaultIcon(db(), c.board_id, body.name ?? c.name, ids) };
      }
    }
    return columnUpdate(ctx, id, body);
  };
  const swimlanes = crud(core, { table: 'swimlanes', entity: 'swimlane', parent: 'board_id', projectOf: boardProject, topics: boardTopics, fields: ['name', 'jql', 'position'], validate: async (d, r) => { requireText(r.name, 'name', 100); await jqlCheck(d, r); } });
  const quickFilters = crud(core, { table: 'quick_filters', entity: 'quickFilter', parent: 'board_id', projectOf: boardProject, topics: boardTopics, fields: ['name', 'jql', 'icon', 'position'], validate: async (d, r) => { requireText(r.name, 'name', 100); await jqlCheck(d, r); } });
  const cardColors = crud(core, { table: 'card_colors', entity: 'cardColor', parent: 'board_id', projectOf: boardProject, topics: boardTopics, fields: ['jql', 'color', 'position'], validate: async (d, r) => { requireText(r.color, 'color', 16); await jqlCheck(d, r); } });

  const svc = {
    loadRaw,
    columns, swimlanes, quickFilters, cardColors,

    async list(ctx, q = {}) {
      requireUser(ctx);
      const ids = await accessibleProjectIds(db(), ctx);
      let rows = await db().select('boards', q.projectId ? { project_id: q.projectId } : {}, { order: 'name' });
      if (ids) rows = rows.filter((b) => !b.project_id || ids.includes(b.project_id));
      return rows.map(boardOut);
    },

    async get(ctx, id) {
      const b = await loadFor(ctx, id);
      const cols = await columnsOf(b.id);
      return {
        ...boardOut(b),
        columns: cols.map((c) => toApi('board_columns', c)),
        swimlanes: (await db().select('swimlanes', { board_id: b.id }, { order: 'position' })).map((r) => toApi('swimlanes', r)),
        quickFilters: (await db().select('quick_filters', { board_id: b.id }, { order: 'position' })).map((r) => toApi('quick_filters', r)),
        cardColors: (await db().select('card_colors', { board_id: b.id }, { order: 'position' })).map((r) => toApi('card_colors', r)),
      };
    },

    /** body: { name, projectId?, filterJql?, icon?, settings?, columns?: [{ name, statusIds, wipMin, wipMax }] } */
    async create(ctx, body = {}) {
      requireUser(ctx);
      const projectId = body.projectId || body.project_id || null;
      if (projectId) await assertProject(db(), ctx, projectId, 'admin');
      else check(body.filterJql && String(body.filterJql).trim(), 'REQUIRED', 'A board without a project needs a filter', { field: 'filterJql' });
      if (body.filterJql) await jqlCheck(db(), { jql: body.filterJql });
      const now = nowOf(ctx);
      const name = requireText(body.name, 'name', 200);
      const board = await db().tx(async () => {
        let cols = body.columns;
        const sts = projectId ? await db().select('statuses', { project_id: projectId }, { order: 'position' }) : [];
        const statusCat = Object.fromEntries(sts.map((s) => [s.id, s.category]));
        if (!cols && projectId) cols = sts.map((s) => ({ name: s.name, statusIds: [s.id] }));
        const b = await db().insert('boards', {
          id: newId(), project_id: projectId, name, icon: body.icon || 'b:layers', filter_jql: body.filterJql || null,
          settings: normaliseSettings(body.settings), created_by: ctx.user?.id || null, created_at: now, updated_at: now,
        });
        for (const [i, c] of (cols || []).entries()) {
          const cname = requireText(c.name, 'name', 100);
          const cicon = c.icon || defaultColumnIcon(cname, (c.statusIds || []).map((sid) => statusCat[sid]).filter(Boolean));
          await db().insert('board_columns', { id: newId(), board_id: b.id, name: cname, icon: cicon, position: i, wip_min: c.wipMin ?? null, wip_max: c.wipMax ?? null, status_ids: c.statusIds || [], created_at: now, updated_at: now });
        }
        return b;
      });
      emit(core, ctx, 'board.created', [projectId && `project:${projectId}`, `board:${board.id}`], { id: board.id, rev: board.rev, data: boardOut(board) });
      return svc.get(ctx, board.id);
    },

    async update(ctx, id, body = {}) {
      const b = await loadFor(ctx, id, 'config');
      const patch = fromApi('boards', body, ['name', 'icon', 'filter_jql']);
      if (patch.name !== undefined) patch.name = requireText(patch.name, 'name', 200);
      if (patch.filter_jql) await jqlCheck(db(), { jql: patch.filter_jql });
      if (!b.project_id && patch.filter_jql !== undefined) check(patch.filter_jql && patch.filter_jql.trim(), 'REQUIRED', 'A board without a project needs a filter', { field: 'filterJql' });
      if (body.settings !== undefined) patch.settings = normaliseSettings(body.settings, parseJson(b.settings, {}));
      const row = await db().update('boards', id, patch, { rev: body.rev });
      emit(core, ctx, 'board.updated', [`board:${id}`, b.project_id && `project:${b.project_id}`], { id, rev: row.rev, data: boardOut(row) });
      return boardOut(row);
    },

    async remove(ctx, id) {
      const b = await loadFor(ctx, id, 'config');
      await db().tx(async () => {
        for (const t of ['board_columns', 'swimlanes', 'quick_filters', 'card_colors']) await db().remove(t, { board_id: id });
        await db().remove('boards', { id });
      });
      emit(core, ctx, 'board.deleted', [`board:${id}`, b.project_id && `project:${b.project_id}`], { id });
      return { ok: true };
    },

    /** Issues currently in a column (base board scope, no quick filters) — for WIP checks. */
    async columnCount(ctx, board, column) {
      const settings = normaliseSettings(parseJson(board.settings, {}));
      const ids = parseJson(column.status_ids, []) || [];
      if (!ids.length) return 0;
      const { where, params } = await boardWhere({ system: true }, board, settings);
      return Number(await db().value(`SELECT COUNT(*) AS n FROM "issues" i WHERE ${where} AND i."status_id" IN (${ids.map(() => '?').join(', ')})`, [...params, ...ids], 0));
    },

    /**
     * Everything a board view renders, in one call.
     * q: { quick: 'id,id' (quick filter ids, ANDed), search: text, includeAllDone: bool }
     */
    async data(ctx, id, q = {}) {
      const t0 = Date.now();
      const board = await loadFor(ctx, id);
      const d = db();
      const settings = normaliseSettings(parseJson(board.settings, {}));
      const cols = await columnsOf(board.id);
      const swimlaneRows = await d.select('swimlanes', { board_id: board.id }, { order: 'position' });
      const quickRows = await d.select('quick_filters', { board_id: board.id }, { order: 'position' });
      const colorRows = await d.select('card_colors', { board_id: board.id }, { order: 'position' });

      const base = await boardWhere(ctx, board, settings);
      let where = base.where;
      const params = [...base.params];
      const quickIds = String(q.quick || '').split(',').map((s) => s.trim()).filter(Boolean);
      for (const qid of quickIds) {
        const qf = quickRows.find((r) => r.id === qid);
        if (!qf || !qf.jql) continue;
        const c = await S().issues.compileFor(ctx, qf.jql);
        where += ` AND (${c.where})`; params.push(...c.params);
      }
      if (q.search && String(q.search).trim()) {
        const pat = `%${likeEscape(String(q.search).trim().toLowerCase())}%`;
        where += ' AND (LOWER(i."summary") LIKE ? ESCAPE \'!\' OR LOWER(i."key") LIKE ? ESCAPE \'!\')';
        params.push(pat, pat);
      }
      // only issues whose status is mapped to a column
      const statusToCol = {};
      for (const c of cols) for (const s of c.ids) statusToCol[s] = c.id;
      const mapped = Object.keys(statusToCol);
      if (!mapped.length) where += ' AND 1 = 0';
      else { where += ` AND i."status_id" IN (${mapped.map(() => '?').join(', ')})`; params.push(...mapped); }

      // statuses of the board's issues (lookups for rendering + done columns)
      const statusRows = mapped.length ? await d.all(`SELECT * FROM "statuses" WHERE "id" IN (${mapped.map(() => '?').join(', ')})`, mapped) : [];
      const statusById = Object.fromEntries(statusRows.map((s) => [s.id, s]));
      const doneCols = new Set(cols.filter((c) => c.ids.length && c.ids.every((s) => statusById[s]?.category === 'done')).map((c) => c.id));
      const backlogStatus = new Set(settings.backlog?.enabled ? settings.backlog.statusIds || [] : []);
      if (settings.doneHideDays != null && !q.includeAllDone && doneCols.size) {
        const doneStatusIds = [...doneCols].flatMap((cid) => cols.find((c) => c.id === cid).ids);
        const cutoff = nowOf(ctx) - settings.doneHideDays * DAY;
        where += ` AND NOT (i."status_id" IN (${doneStatusIds.map(() => '?').join(', ')}) AND COALESCE(i."resolved_at", i."status_changed_at", i."updated_at") < ?)`;
        params.push(...doneStatusIds, cutoff);
      }

      const rows = await d.all(`SELECT i."id", i."project_id", i."key", i."number", i."type_id", i."status_id", i."priority_id", i."summary", i."assignee_id", i."epic_id", i."parent_id",
        i."story_points", i."original_estimate", i."remaining_estimate", i."time_spent", i."due_date", i."rank", i."color", i."cover", i."icon", i."flagged",
        i."resolution_id", i."resolved_at", i."status_changed_at", i."created_at", i."updated_at", i."rev"
        FROM "issues" i WHERE ${where} ORDER BY i."rank", i."id"`, params);

      // satellite data, one grouped query each (JOIN on the same WHERE — no giant IN lists)
      const join = (sel, table, col = 'issue_id') => d.all(`SELECT ${sel} FROM ${d.q(table)} x JOIN "issues" i ON i."id" = x.${d.q(col)} WHERE ${where}`, params);
      const [labels, comps, vers, subtasks, checklist, comments, attachments] = rows.length ? [
        await join('x."issue_id", x."label"', 'issue_labels'),
        await join('x."issue_id", x."component_id"', 'issue_components'),
        await d.all(`SELECT x."issue_id", x."version_id" FROM "issue_versions" x JOIN "issues" i ON i."id" = x."issue_id" WHERE x."kind" = 'fix' AND ${where}`, params),
        await d.all(`SELECT s."parent_id" AS issue_id, COUNT(*) AS total, SUM(CASE WHEN st."category" = 'done' THEN 1 ELSE 0 END) AS done
          FROM "issues" s JOIN "statuses" st ON st."id" = s."status_id" JOIN "issues" i ON i."id" = s."parent_id" WHERE ${where} GROUP BY s."parent_id"`, params),
        await d.all(`SELECT x."issue_id", COUNT(*) AS total, SUM(x."done") AS done FROM "checklist_items" x JOIN "issues" i ON i."id" = x."issue_id" WHERE ${where} GROUP BY x."issue_id"`, params),
        await d.all(`SELECT x."issue_id", COUNT(*) AS n FROM "comments" x JOIN "issues" i ON i."id" = x."issue_id" WHERE ${where} GROUP BY x."issue_id"`, params),
        await d.all(`SELECT x."issue_id", COUNT(*) AS n FROM "attachments" x JOIN "issues" i ON i."id" = x."issue_id" WHERE ${where} GROUP BY x."issue_id"`, params),
      ] : [[], [], [], [], [], [], []];
      const group = (arr, key, val) => { const g = {}; for (const x of arr) (g[x[key]] ||= []).push(val(x)); return g; };
      const L = group(labels, 'issue_id', (x) => x.label);
      const C = group(comps, 'issue_id', (x) => x.component_id);
      const V = group(vers, 'issue_id', (x) => x.version_id);
      const count = (arr) => Object.fromEntries(arr.map((x) => [x.issue_id, x]));
      const ST = count(subtasks); const CL = count(checklist); const CM = count(comments); const AT = count(attachments);

      // swimlane + card colour by query: one id query per rule
      const idsMatching = async (jql) => {
        const c = await S().issues.compileFor(ctx, jql);
        return new Set((await d.all(`SELECT i."id" FROM "issues" i WHERE ${where} AND (${c.where})`, [...params, ...c.params])).map((r) => r.id));
      };
      const laneSets = settings.swimlanes === 'queries' ? await Promise.all(swimlaneRows.map(async (s) => [s.id, s.jql ? await idsMatching(s.jql) : new Set()])) : [];
      const colorSets = settings.cardColors === 'queries' ? await Promise.all(colorRows.map(async (c) => [c.color, c.jql ? await idsMatching(c.jql) : new Set()])) : [];

      // lookups
      const pids = board.project_id ? [board.project_id] : [...new Set(rows.map((r) => r.project_id))];
      const inP = pids.length ? `IN (${pids.map(() => '?').join(', ')})` : 'IN (NULL)';
      const [types, priorities, users, epics, versions, components, projects] = [
        await d.all(`SELECT * FROM "issue_types" WHERE "project_id" ${inP} ORDER BY "position"`, pids),
        await d.select('priorities', {}, { order: 'position' }),
        await d.all('SELECT "id", "username", "display_name", "avatar", "active" FROM "users" ORDER BY "display_name"'),
        await d.all(`SELECT e."id", e."key", e."summary", e."color", e."status_id", e."project_id" FROM "issues" e JOIN "issue_types" t ON t."id" = e."type_id" WHERE t."level" = -1 AND e."archived" = 0 AND e."project_id" ${inP} ORDER BY e."rank"`, pids),
        await d.all(`SELECT * FROM "versions" WHERE "project_id" ${inP} AND "archived" = 0 ORDER BY "position"`, pids),
        await d.all(`SELECT * FROM "components" WHERE "project_id" ${inP} ORDER BY "name"`, pids),
        await d.all(`SELECT "id", "key", "name", "icon", "color" FROM "projects" WHERE "id" ${inP}`, pids),
      ];
      const resolutions = await d.select('resolutions', {}, { order: 'position' });
      const customFields = await d.all(`SELECT * FROM "custom_fields" WHERE "project_id" ${inP} OR "project_id" IS NULL ORDER BY "position"`, pids);
      const typeById = Object.fromEntries(types.map((t) => [t.id, t]));
      const prioById = Object.fromEntries(priorities.map((p) => [p.id, p]));
      const userColor = (uid) => { if (!uid) return null; let h = 0; for (const ch of uid) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return `hsl(${h % 360} 55% 50%)`; };

      const laneOf = (r) => {
        switch (settings.swimlanes) {
          case 'assignee': return r.assignee_id || 'none';
          case 'epic': return r.epic_id || 'none';
          case 'priority': return r.priority_id || 'none';
          case 'type': return r.type_id;
          case 'project': return r.project_id;
          case 'queries': { for (const [lid, set] of laneSets) if (set.has(r.id)) return lid; return 'other'; }
          default: return 'all';
        }
      };
      const colorOf = (r) => {
        switch (settings.cardColors) {
          case 'type': return typeById[r.type_id]?.color || null;
          case 'priority': return prioById[r.priority_id]?.color || null;
          case 'assignee': return userColor(r.assignee_id);
          case 'queries': { for (const [color, set] of colorSets) if (set.has(r.id)) return color; return null; }
          default: return null;
        }
      };

      const cards = [];
      const backlog = [];
      const colStats = Object.fromEntries(cols.map((c) => [c.id, { count: 0, points: 0 }]));
      for (const r of rows) {
        const card = {
          id: r.id, key: r.key, projectId: r.project_id, summary: r.summary, typeId: r.type_id, statusId: r.status_id, priorityId: r.priority_id,
          assigneeId: r.assignee_id, epicId: r.epic_id, parentId: r.parent_id, storyPoints: r.story_points, originalEstimate: r.original_estimate,
          remainingEstimate: r.remaining_estimate, timeSpent: r.time_spent, dueDate: r.due_date, rank: r.rank, color: r.color,
          cover: parseJson(r.cover, null), icon: r.icon, flagged: !!Number(r.flagged), resolutionId: r.resolution_id, resolvedAt: r.resolved_at,
          statusChangedAt: r.status_changed_at, createdAt: r.created_at, updatedAt: r.updated_at, rev: r.rev,
          labels: L[r.id] || [], componentIds: C[r.id] || [], fixVersionIds: V[r.id] || [],
          subtasks: ST[r.id] ? { total: Number(ST[r.id].total), done: Number(ST[r.id].done || 0) } : null,
          checklist: CL[r.id] ? { total: Number(CL[r.id].total), done: Number(CL[r.id].done || 0) } : null,
          commentCount: CM[r.id] ? Number(CM[r.id].n) : 0, attachmentCount: AT[r.id] ? Number(AT[r.id].n) : 0,
          columnId: statusToCol[r.status_id], lane: laneOf(r), cardColor: colorOf(r),
        };
        if (backlogStatus.has(r.status_id)) { backlog.push(card); continue; }
        cards.push(card);
        const st = colStats[card.columnId];
        st.count++;
        st.points += settings.estimation === 'originalEstimate' ? Number(r.original_estimate || 0) : settings.estimation === 'count' ? 1 : Number(r.story_points || 0);
      }

      // the lanes present, in display order
      let lanes;
      const present = new Set(cards.map((c) => c.lane));
      const named = (id, name, extra = {}) => ({ id, name, count: cards.filter((c) => c.lane === id).length, ...extra });
      switch (settings.swimlanes) {
        case 'assignee': lanes = [...users.filter((u) => present.has(u.id)).map((u) => named(u.id, u.display_name, { avatar: u.avatar })), ...(present.has('none') ? [named('none', null, { empty: true })] : [])]; break;
        case 'epic': lanes = [...epics.filter((e) => present.has(e.id)).map((e) => named(e.id, `${e.key} ${e.summary}`, { color: e.color, key: e.key })), ...(present.has('none') ? [named('none', null, { empty: true })] : [])]; break;
        case 'priority': lanes = [...priorities.filter((p) => present.has(p.id)).map((p) => named(p.id, p.name, { icon: p.icon, color: p.color })), ...(present.has('none') ? [named('none', null, { empty: true })] : [])]; break;
        case 'type': lanes = types.filter((t) => present.has(t.id)).map((t) => named(t.id, t.name, { icon: t.icon, color: t.color })); break;
        case 'project': lanes = projects.filter((p) => present.has(p.id)).map((p) => named(p.id, p.name, { icon: p.icon, key: p.key })); break;
        case 'queries': lanes = [...swimlaneRows.map((s) => named(s.id, s.name, { jql: s.jql })), named('other', null, { empty: true })]; break;
        default: lanes = [named('all', null)];
      }

      return {
        board: { ...boardOut(board), settings },
        columns: cols.map((c) => ({
          id: c.id, name: c.name, icon: c.icon, position: c.position, wipMin: c.wip_min, wipMax: c.wip_max, statusIds: c.ids, rev: c.rev,
          backlog: c.ids.length > 0 && c.ids.every((s) => backlogStatus.has(s)), done: doneCols.has(c.id),
          count: colStats[c.id].count, points: colStats[c.id].points,
          overMax: c.wip_max != null && colStats[c.id].count > Number(c.wip_max), underMin: c.wip_min != null && colStats[c.id].count < Number(c.wip_min),
        })),
        swimlanes: lanes,
        quickFilters: quickRows.map((r) => toApi('quick_filters', r)),
        cardColors: colorRows.map((r) => toApi('card_colors', r)),
        issues: cards,
        backlog,
        statuses: statusRows.map((s) => toApi('statuses', s)),
        types: types.map((t) => toApi('issue_types', t)),
        priorities: priorities.map((p) => toApi('priorities', p)),
        resolutions: resolutions.map((r) => toApi('resolutions', r)),
        fields: customFields.map((f) => toApi('custom_fields', f)),
        users: users.map((u) => ({ id: u.id, username: u.username, displayName: u.display_name, avatar: u.avatar, active: !!Number(u.active) })),
        epics: epics.map((e) => ({ id: e.id, key: e.key, summary: e.summary, color: e.color, statusId: e.status_id, projectId: e.project_id })),
        versions: versions.map((v) => toApi('versions', v)),
        components: components.map((c) => toApi('components', c)),
        projects: projects.map((p) => ({ id: p.id, key: p.key, name: p.name, icon: p.icon, color: p.color })),
        elapsedMs: Date.now() - t0,
      };
    },

    boardWhere: (ctx, board) => boardWhere(ctx, board, normaliseSettings(parseJson(board.settings, {}))),
    normaliseSettings,
  };
  return svc;
}

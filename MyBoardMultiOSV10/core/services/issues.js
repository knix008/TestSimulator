// Issues: create (key numbering), read, update with field history, transitions (conditions / validators /
// post functions), board moves (rank + status), bulk changes, JQL search, hydration for the in-memory matcher.
import { newId } from '../ids.js';
import * as rank from '../rank.js';
import { AppError, NotFoundError, ValidationError, ForbiddenError, ConflictError, check } from '../errors.js';
import { compile, createMatcher, validate as jqlValidate, customValueColumns } from '../jql/index.js';
import {
  toApi, requireUser, emit, nowOf, requireText, assertProject, accessibleProjectIds, parseJson, checkDate, paging,
} from './common.js';
import { writeHistory } from './history.js';

/** Issue columns settable through create/update (API name → column). */
const SIMPLE = {
  summary: 'summary', description: 'description', typeId: 'type_id', priorityId: 'priority_id', assigneeId: 'assignee_id',
  reporterId: 'reporter_id', parentId: 'parent_id', epicId: 'epic_id', storyPoints: 'story_points', originalEstimate: 'original_estimate',
  remainingEstimate: 'remaining_estimate', dueDate: 'due_date', startDate: 'start_date', color: 'color', cover: 'cover', icon: 'icon',
  flagged: 'flagged', archived: 'archived',
};
/** History field name for a column. */
const HIST_NAME = {
  summary: 'summary', description: 'description', type_id: 'type', priority_id: 'priority', assignee_id: 'assignee', reporter_id: 'reporter',
  parent_id: 'parent', epic_id: 'epic', story_points: 'storyPoints', original_estimate: 'originalEstimate', remaining_estimate: 'remainingEstimate',
  due_date: 'dueDate', start_date: 'startDate', color: 'color', cover: 'cover', icon: 'icon', flagged: 'flagged', archived: 'archived',
};
const LOOKUP = {
  type_id: ['issue_types', 'name'], priority_id: ['priorities', 'name'], assignee_id: ['users', 'display_name'], reporter_id: ['users', 'display_name'],
  parent_id: ['issues', 'key'], epic_id: ['issues', 'key'], status_id: ['statuses', 'name'], resolution_id: ['resolutions', 'name'],
};
export const LINK_KINDS = {
  blocks: ['blocks', 'is blocked by'], relates: ['relates to', 'relates to'], duplicates: ['duplicates', 'is duplicated by'],
  clones: ['clones', 'is cloned by'], causes: ['causes', 'is caused by'],
};
const CARD_COLUMNS = ['id', 'project_id', 'number', 'key', 'type_id', 'status_id', 'resolution_id', 'priority_id', 'summary', 'assignee_id',
  'reporter_id', 'parent_id', 'epic_id', 'story_points', 'original_estimate', 'remaining_estimate', 'time_spent', 'due_date', 'start_date',
  'rank', 'color', 'cover', 'icon', 'flagged', 'archived', 'resolved_at', 'status_changed_at', 'created_at', 'updated_at', 'rev'];

export function createIssues(core) {
  const db = () => core.db;
  const S = () => core.services;

  // ---- loading ----------------------------------------------------------------------------------------------
  async function load(idOrKey) {
    const row = await db().get('SELECT * FROM "issues" WHERE "id" = ? OR "key" = ?', [idOrKey, String(idOrKey).toUpperCase()]);
    if (!row) throw new NotFoundError('ISSUE_NOT_FOUND', 'Issue not found');
    return row;
  }

  async function loadFor(ctx, idOrKey, need = 'viewer') {
    const row = await load(idOrKey);
    await assertProject(db(), ctx, row.project_id, need);
    return row;
  }

  async function label(column, value) {
    if (value == null || value === '') return null;
    const lk = LOOKUP[column];
    if (!lk) return typeof value === 'object' ? JSON.stringify(value) : String(value);
    const r = await db().get(`SELECT ${db().q(lk[1])} AS v FROM ${db().q(lk[0])} WHERE "id" = ?`, [value]);
    return r ? r.v : String(value);
  }

  /** Custom fields with parsed options (the JQL module wants arrays). */
  async function allFields(where = {}) {
    return (await db().select('custom_fields', where)).map((f) => ({ ...f, options: parseJson(f.options, []) || [] }));
  }

  async function customFieldsFor(projectId) {
    return db().all('SELECT * FROM "custom_fields" WHERE "project_id" = ? OR "project_id" IS NULL ORDER BY "position"', [projectId]);
  }

  async function workflowOf(issue) {
    const t = await db().get('SELECT "workflow_id" FROM "issue_types" WHERE "id" = ?', [issue.type_id]);
    let wf = t?.workflow_id ? await db().get('SELECT * FROM "workflows" WHERE "id" = ?', [t.workflow_id]) : null;
    if (!wf) wf = await db().get('SELECT * FROM "workflows" WHERE "project_id" = ? ORDER BY "created_at"', [issue.project_id]);
    return wf;
  }

  // ---- validation of references -----------------------------------------------------------------------------
  async function checkRefs(issue, patch) {
    const pid = issue.project_id;
    const one = async (sql, params, code, msg) => { if (!(await db().get(sql, params))) throw new ValidationError(code, msg); };
    if (patch.type_id) await one('SELECT "id" FROM "issue_types" WHERE "id" = ? AND "project_id" = ?', [patch.type_id, pid], 'INVALID_TYPE', 'Unknown issue type');
    if (patch.priority_id) await one('SELECT "id" FROM "priorities" WHERE "id" = ?', [patch.priority_id], 'INVALID_PRIORITY', 'Unknown priority');
    for (const c of ['assignee_id', 'reporter_id']) {
      if (patch[c]) await one('SELECT "id" FROM "users" WHERE "id" = ?', [patch[c]], 'INVALID_USER', 'Unknown user');
    }
    const typeId = patch.type_id || issue.type_id;
    const type = typeId ? await db().get('SELECT * FROM "issue_types" WHERE "id" = ?', [typeId]) : null;
    const level = Number(type?.level ?? 0);
    if (patch.parent_id !== undefined || patch.type_id !== undefined) {
      const parentId = patch.parent_id !== undefined ? patch.parent_id : issue.parent_id;
      if (level === 1) check(!!parentId, 'PARENT_REQUIRED', 'A subtask needs a parent issue');
      if (parentId) {
        check(level === 1, 'PARENT_ONLY_FOR_SUBTASKS', 'Only subtasks have a parent');
        const parent = await db().get('SELECT p."id", p."project_id", t."level" FROM "issues" p JOIN "issue_types" t ON t."id" = p."type_id" WHERE p."id" = ?', [parentId]);
        check(!!parent, 'INVALID_PARENT', 'Unknown parent issue');
        check(parent.project_id === pid, 'INVALID_PARENT', 'The parent must be in the same project');
        check(Number(parent.level) !== 1, 'INVALID_PARENT', 'A subtask cannot be the parent of a subtask');
        check(parent.id !== issue.id, 'INVALID_PARENT', 'An issue cannot be its own parent');
      }
    }
    if (patch.epic_id) {
      check(level !== -1, 'INVALID_EPIC', 'An epic cannot belong to an epic');
      const epic = await db().get('SELECT e."id", t."level" FROM "issues" e JOIN "issue_types" t ON t."id" = e."type_id" WHERE e."id" = ?', [patch.epic_id]);
      check(!!epic && Number(epic.level) === -1, 'INVALID_EPIC', 'The epic must be an issue of an epic type');
    }
    if (patch.due_date !== undefined) checkDate(patch.due_date, 'dueDate');
    if (patch.start_date !== undefined) checkDate(patch.start_date, 'startDate');
    for (const c of ['story_points', 'original_estimate', 'remaining_estimate']) {
      if (patch[c] != null) check(Number.isFinite(Number(patch[c])) && Number(patch[c]) >= 0, 'INVALID_NUMBER', `${c} must be a positive number`);
    }
  }

  /** API body → issues columns patch. */
  function columnsPatch(body) {
    const patch = {};
    for (const [api, col] of Object.entries(SIMPLE)) {
      const v = api in body ? body[api] : col in body ? body[col] : undefined;
      if (v === undefined) continue;
      if (col === 'summary') patch[col] = requireText(v, 'summary', 500);
      else if (col === 'flagged' || col === 'archived') patch[col] = v ? 1 : 0;
      else if (col === 'cover') patch[col] = v == null ? null : JSON.stringify(v);
      else if (['story_points', 'original_estimate', 'remaining_estimate'].includes(col)) patch[col] = v === '' || v == null ? null : col === 'story_points' ? Number(v) : Math.round(Number(v));
      else patch[col] = v === '' ? null : v;
    }
    return patch;
  }

  // ---- multi-valued parts ------------------------------------------------------------------------------------
  async function currentMulti(issueId) {
    const [labels, comps, vers] = [
      (await db().all('SELECT "label" FROM "issue_labels" WHERE "issue_id" = ? ORDER BY "label"', [issueId])).map((r) => r.label),
      (await db().all('SELECT "component_id" FROM "issue_components" WHERE "issue_id" = ?', [issueId])).map((r) => r.component_id),
      await db().all('SELECT "version_id", "kind" FROM "issue_versions" WHERE "issue_id" = ?', [issueId]),
    ];
    return {
      labels, componentIds: comps,
      fixVersionIds: vers.filter((v) => v.kind === 'fix').map((v) => v.version_id),
      affectedVersionIds: vers.filter((v) => v.kind === 'affects').map((v) => v.version_id),
    };
  }

  const normLabels = (arr) => [...new Set((arr || []).map((l) => String(l).trim().replace(/\s+/g, '-')).filter(Boolean))].sort();

  /** Replace labels/components/versions given in `body`; returns history entries. */
  async function setMulti(issue, body, cur) {
    const hist = [];
    if (body.labels !== undefined) {
      const next = normLabels(body.labels);
      check(next.every((l) => l.length <= 100), 'TOO_LONG', 'labels are at most 100 characters');
      if (next.join(' ') !== cur.labels.join(' ')) {
        await db().remove('issue_labels', { issue_id: issue.id });
        if (next.length) await db().insertMany('issue_labels', next.map((label) => ({ issue_id: issue.id, label })));
        hist.push({ field: 'labels', from_value: cur.labels.join(' ') || null, to_value: next.join(' ') || null });
      }
    }
    if (body.componentIds !== undefined) {
      const next = [...new Set(body.componentIds || [])];
      for (const id of next) {
        if (!(await db().get('SELECT "id" FROM "components" WHERE "id" = ? AND "project_id" = ?', [id, issue.project_id]))) throw new ValidationError('INVALID_COMPONENT', 'Unknown component');
      }
      if ([...next].sort().join() !== [...cur.componentIds].sort().join()) {
        await db().remove('issue_components', { issue_id: issue.id });
        if (next.length) await db().insertMany('issue_components', next.map((component_id) => ({ issue_id: issue.id, component_id })));
        hist.push({ field: 'components', from_value: cur.componentIds.join(',') || null, to_value: next.join(',') || null, from_label: await names('components', cur.componentIds), to_label: await names('components', next) });
      }
    }
    for (const [key, kind, field] of [['fixVersionIds', 'fix', 'fixVersions'], ['affectedVersionIds', 'affects', 'affectedVersions']]) {
      if (body[key] === undefined) continue;
      const next = [...new Set(body[key] || [])];
      for (const id of next) {
        if (!(await db().get('SELECT "id" FROM "versions" WHERE "id" = ? AND "project_id" = ?', [id, issue.project_id]))) throw new ValidationError('INVALID_VERSION', 'Unknown version');
      }
      if ([...next].sort().join() !== [...cur[key]].sort().join()) {
        await db().run('DELETE FROM "issue_versions" WHERE "issue_id" = ? AND "kind" = ?', [issue.id, kind]);
        if (next.length) await db().insertMany('issue_versions', next.map((version_id) => ({ issue_id: issue.id, version_id, kind })));
        hist.push({ field, from_value: cur[key].join(',') || null, to_value: next.join(',') || null, from_label: await names('versions', cur[key]), to_label: await names('versions', next) });
      }
    }
    return hist;
  }

  async function names(table, ids) {
    if (!ids.length) return null;
    const rows = await db().all(`SELECT "name" FROM ${db().q(table)} WHERE "id" IN (${ids.map(() => '?').join(', ')})`, ids);
    return rows.map((r) => r.name).join(', ');
  }

  /** Normalise + validate one custom value. Returns undefined for "empty". */
  async function customValue(cf, raw) {
    if (raw == null || raw === '' || (Array.isArray(raw) && !raw.length)) return undefined;
    const opts = parseJson(cf.options, []) || [];
    const optValue = (v) => {
      const o = opts.find((x) => x.id === v || String(x.value).toLowerCase() === String(v).toLowerCase());
      if (!o) throw new ValidationError('INVALID_OPTION', `'${v}' is not an option of ${cf.name}`, { field: cf.id });
      return o.value;
    };
    switch (cf.type) {
      case 'number': { const n = Number(raw); check(Number.isFinite(n), 'INVALID_NUMBER', `${cf.name} must be a number`, { field: cf.id }); return n; }
      case 'date': check(/^\d{4}-\d{2}-\d{2}$/.test(raw), 'INVALID_DATE', `${cf.name} must be YYYY-MM-DD`, { field: cf.id }); return raw;
      case 'checkbox': return raw === true || raw === 1 || raw === '1' || raw === 'true';
      case 'select': return optValue(raw);
      case 'multiselect': return (Array.isArray(raw) ? raw : [raw]).map(optValue);
      case 'labels': return normLabels(Array.isArray(raw) ? raw : String(raw).split(/[\s,]+/));
      case 'user':
        if (!(await db().get('SELECT "id" FROM "users" WHERE "id" = ?', [raw]))) throw new ValidationError('INVALID_USER', 'Unknown user', { field: cf.id });
        return raw;
      case 'url': check(/^(https?:|mailto:)/i.test(String(raw)), 'INVALID_URL', `${cf.name} must be a http(s) link`, { field: cf.id }); return String(raw);
      default: return String(raw);
    }
  }

  /** Set custom values given in `custom` ({ fieldId | fieldName: value }); returns history entries. */
  async function setCustom(issue, custom, fields, { creating = false } = {}) {
    const hist = [];
    const existing = Object.fromEntries((await db().select('custom_values', { issue_id: issue.id })).map((r) => [r.field_id, parseJson(r.value)]));
    for (const [k, raw] of Object.entries(custom || {})) {
      const cf = fields.find((f) => f.id === k) || fields.find((f) => f.name.toLowerCase() === String(k).toLowerCase());
      if (!cf) throw new ValidationError('UNKNOWN_FIELD', `Unknown field: ${k}`, { field: k });
      const v = await customValue(cf, raw);
      const before = existing[cf.id];
      if (JSON.stringify(before ?? null) === JSON.stringify(v ?? null)) continue;
      await db().run('DELETE FROM "custom_values" WHERE "issue_id" = ? AND "field_id" = ?', [issue.id, cf.id]);
      if (v !== undefined) {
        const cols = customValueColumns(cf, v);
        await db().insert('custom_values', { issue_id: issue.id, field_id: cf.id, value: JSON.stringify(v), ...cols });
      } else if (cf.required) throw new ValidationError('REQUIRED', `${cf.name} is required`, { field: cf.id });
      if (!creating) hist.push({ field: `custom:${cf.id}`, from_value: before == null ? null : JSON.stringify(before), to_value: v == null ? null : JSON.stringify(v), from_label: fmt(before), to_label: fmt(v) });
    }
    if (creating) {
      for (const cf of fields) {
        if (Number(cf.required) && !(await db().get('SELECT 1 AS x FROM "custom_values" WHERE "issue_id" = ? AND "field_id" = ?', [issue.id, cf.id]))) {
          throw new ValidationError('REQUIRED', `${cf.name} is required`, { field: cf.id });
        }
      }
    }
    return hist;
  }
  const fmt = (v) => (v == null ? null : Array.isArray(v) ? v.join(', ') : String(v));

  async function addWatcher(issueId, userId, at) {
    if (!userId) return;
    if (await db().get('SELECT 1 AS x FROM "issue_watchers" WHERE "issue_id" = ? AND "user_id" = ?', [issueId, userId])) return;
    await db().insert('issue_watchers', { issue_id: issueId, user_id: userId, created_at: at });
  }

  /**
   * Inside a transaction: with a client `rev`, atomically check it under a row lock, so a
   * concurrent edit of the same issue fails with 409 instead of being overwritten. Returns the fresh row.
   */
  async function lockRev(id, rev) {
    if (rev != null) {
      // a same-value UPDATE still takes the row lock and reports the matched row on every dialect
      const r = await db().run('UPDATE "issues" SET "rev" = "rev" WHERE "id" = ? AND "rev" = ?', [id, Number(rev)]);
      if (!r.changes) {
        const cur = await load(id);
        throw new ConflictError('The issue was changed by someone else', toApi('issues', cur));
      }
    }
    return load(id);
  }

  /** Default priority: the one named Medium, else the middle one. */
  async function defaultPriorityId() {
    const list = await db().select('priorities', {}, { order: 'position' });
    return (list.find((p) => p.name.toLowerCase() === 'medium') || list[Math.floor(list.length / 2)])?.id || null;
  }

  async function nextRank(afterId, beforeId) {
    const rankOf = async (id) => (id ? (await db().get('SELECT "rank" FROM "issues" WHERE "id" = ?', [id]))?.rank ?? null : null);
    let a = await rankOf(afterId);
    let b = await rankOf(beforeId);
    if (afterId && !a) throw new ValidationError('INVALID_POSITION', 'Unknown issue to place after');
    if (beforeId && !b) throw new ValidationError('INVALID_POSITION', 'Unknown issue to place before');
    if (a && b && a >= b) b = null; // stale neighbours: just go after `a`
    if (a && !b) b = await db().value('SELECT MIN("rank") AS r FROM "issues" WHERE "rank" > ?', [a]);
    if (b && !a && !afterId) a = await db().value('SELECT MAX("rank") AS r FROM "issues" WHERE "rank" < ?', [b]);
    if (!a && !b) a = await db().value('SELECT MAX("rank") AS r FROM "issues"');
    if (a && b && a === b) b = null;
    return rank.between(a || null, b || null);
  }

  /** Re-space every issue's rank (when keys grew too long). Order is kept. */
  async function rebalanceRanks() {
    await db().tx(async () => {
      const rows = await db().all('SELECT "id" FROM "issues" ORDER BY "rank", "id"');
      const keys = rank.initial(rows.length);
      for (let i = 0; i < rows.length; i++) await db().run('UPDATE "issues" SET "rank" = ? WHERE "id" = ?', [keys[i], rows[i].id]);
    });
  }

  // ---- transitions --------------------------------------------------------------------------------------------
  async function transitionsFor(issue) {
    const wf = await workflowOf(issue);
    if (!wf) return [];
    const all = await db().all('SELECT * FROM "transitions" WHERE "workflow_id" = ? ORDER BY "position"', [wf.id]);
    return all.filter((t) => t.from_status_id == null || t.from_status_id === issue.status_id);
  }

  /** Why the transition's conditions block this user (null = allowed). */
  async function conditionFailure(ctx, issue, t) {
    if (ctx.system) return null;
    const rules = parseJson(t.rules, {}) || {};
    for (const c of rules.conditions || []) {
      switch (c.type) {
        case 'onlyAssignee': if (issue.assignee_id !== ctx.user?.id) return { code: 'CONDITION_ASSIGNEE', message: 'Only the assignee can do this' }; break;
        case 'onlyReporter': if (issue.reporter_id !== ctx.user?.id) return { code: 'CONDITION_REPORTER', message: 'Only the reporter can do this' }; break;
        case 'projectRole': {
          const role = await S().projects.projectRole(ctx, issue.project_id);
          const rk = { viewer: 1, member: 2, admin: 3 };
          if ((rk[role] || 0) < (rk[c.role] || 3)) return { code: 'CONDITION_ROLE', message: `Requires the ${c.role} role` };
          break;
        }
        case 'subtasksDone': {
          const open = await db().value('SELECT COUNT(*) AS n FROM "issues" s JOIN "statuses" st ON st."id" = s."status_id" WHERE s."parent_id" = ? AND st."category" <> ?', [issue.id, 'done'], 0);
          if (Number(open)) return { code: 'CONDITION_SUBTASKS', message: 'All subtasks must be done first' };
          break;
        }
        case 'jql': if (!(await matchesJql(ctx, issue, c.jql))) return { code: 'CONDITION_JQL', message: c.message || 'The issue does not meet the condition' }; break;
      }
    }
    return null;
  }

  /** Does the issue match a JQL query? (SQL — same compiler as search) */
  async function matchesJql(ctx, issue, jql) {
    if (!jql || !String(jql).trim()) return true;
    const fields = await allFields();
    const priorities = await db().select('priorities', {});
    const c = compile(jql, { userId: ctx.user?.id || null, now: nowOf(ctx), fields, priorities });
    return !!(await db().get(`SELECT i."id" FROM "issues" i WHERE i."id" = ? AND (${c.where})`, [issue.id, ...c.params]));
  }

  async function fieldEmpty(issue, field) {
    switch (field) {
      case 'assignee': return !issue.assignee_id;
      case 'resolution': return !issue.resolution_id;
      case 'storyPoints': return issue.story_points == null;
      case 'dueDate': return !issue.due_date;
      case 'description': return !issue.description || !String(issue.description).trim();
      case 'priority': return !issue.priority_id;
      case 'originalEstimate': return issue.original_estimate == null;
      case 'labels': return !(await db().count('issue_labels', { issue_id: issue.id }));
      case 'component': case 'components': return !(await db().count('issue_components', { issue_id: issue.id }));
      case 'fixVersion': case 'fixVersions': return !(await db().count('issue_versions', { issue_id: issue.id, kind: 'fix' }));
      default: return !(await db().get('SELECT 1 AS x FROM "custom_values" WHERE "issue_id" = ? AND "field_id" = ?', [issue.id, field]));
    }
  }

  /**
   * Run a transition inside the caller's transaction. Returns { row, history, transition, changed }.
   * @param {object} opts { transitionId?, statusId?, resolutionId?, comment?, fields? }
   */
  async function applyTransition(ctx, issue, opts) {
    const available = await transitionsFor(issue);
    let t = null;
    if (opts.transitionId) t = available.find((x) => x.id === opts.transitionId);
    else if (opts.statusId) {
      if (opts.statusId === issue.status_id) return { row: issue, history: [], transition: null, changed: false };
      const cands = available.filter((x) => x.to_status_id === opts.statusId);
      for (const c of cands.sort((a, b) => (a.from_status_id ? 0 : 1) - (b.from_status_id ? 0 : 1))) {
        if (!(await conditionFailure(ctx, issue, c))) { t = c; break; }
      }
      if (!t && cands.length) {
        const f = await conditionFailure(ctx, issue, cands[0]);
        throw new ForbiddenError(f.code, f.message);
      }
    }
    if (!t) {
      throw new AppError('TRANSITION_NOT_ALLOWED', 'This status change is not allowed by the workflow', 400, {
        available: available.map((x) => ({ id: x.id, name: x.name, toStatusId: x.to_status_id })),
      });
    }
    const fail = await conditionFailure(ctx, issue, t);
    if (fail) throw new ForbiddenError(fail.code, fail.message);
    const rules = parseJson(t.rules, {}) || {};
    const now = nowOf(ctx);
    const history = [];

    // screen fields first, so validators see them
    let row = issue;
    if (opts.fields && Object.keys(opts.fields).length) {
      const r = await updateInTx(ctx, row, opts.fields, { inTransition: true });
      row = r.row; history.push(...r.history);
    }
    if (!ctx.system) {
      for (const v of rules.validators || []) {
        if (v.type === 'fieldRequired' && (await fieldEmpty({ ...row, resolution_id: opts.resolutionId || row.resolution_id }, v.field))) {
          throw new ValidationError('VALIDATOR_FIELD_REQUIRED', v.message || `${v.field} is required for this transition`, { field: v.field });
        }
        if (v.type === 'commentRequired' && !(opts.comment && String(opts.comment).trim())) {
          throw new ValidationError('VALIDATOR_COMMENT_REQUIRED', v.message || 'A comment is required for this transition', { field: 'comment' });
        }
        if (v.type === 'jql' && !(await matchesJql(ctx, row, v.jql))) {
          throw new ValidationError('VALIDATOR_JQL', v.message || 'The issue does not meet the requirements of this transition');
        }
      }
    }

    const target = await db().get('SELECT * FROM "statuses" WHERE "id" = ?', [t.to_status_id]);
    const patch = { status_id: target.id, status_changed_at: now, updated_at: now };
    // resolution follows the status category (Done sets one, leaving done clears it)
    let resolutionId = row.resolution_id;
    if (target.category === 'done') {
      const setRes = (rules.postFunctions || []).find((p) => p.type === 'setResolution');
      resolutionId = opts.resolutionId || (setRes && (await resolutionByRef(setRes))) || row.resolution_id
        || (await db().value('SELECT "id" FROM "resolutions" ORDER BY "position"'));
      if (!row.resolved_at || !row.resolution_id) patch.resolved_at = now;
    } else {
      resolutionId = null;
      patch.resolved_at = null;
    }
    if ((rules.postFunctions || []).some((p) => p.type === 'clearResolution')) { resolutionId = null; patch.resolved_at = null; }
    patch.resolution_id = resolutionId;

    // other post functions
    const later = [];
    for (const p of rules.postFunctions || []) {
      switch (p.type) {
        case 'assignToCurrentUser': if (ctx.user) patch.assignee_id = ctx.user.id; break;
        case 'assignToReporter': patch.assignee_id = row.reporter_id; break;
        case 'unassign': patch.assignee_id = null; break;
        case 'setField': {
          const col = SIMPLE[p.field];
          if (col) patch[col] = p.value === '' ? null : p.value;
          else later.push((fields) => setCustom(row, { [p.field]: p.value }, fields));
          break;
        }
        case 'addLabel': later.push(async () => {
          const cur = await currentMulti(row.id);
          if (!cur.labels.includes(p.label)) return setMulti(row, { labels: [...cur.labels, p.label] }, cur);
          return [];
        }); break;
        case 'addComment': later.push(async () => { await S().comments.insertRaw(ctx, row, String(p.body || '')); return []; }); break;
      }
    }
    for (const col of ['status_id', 'resolution_id', 'assignee_id']) {
      if (col in patch && (patch[col] ?? null) !== (row[col] ?? null)) {
        history.push({ field: col === 'status_id' ? 'status' : col === 'resolution_id' ? 'resolution' : 'assignee', from_value: row[col], to_value: patch[col], from_label: await label(col, row[col]), to_label: await label(col, patch[col]) });
      }
    }
    if (patch.assignee_id) await addWatcher(row.id, patch.assignee_id, now);
    row = await db().update('issues', row.id, patch);
    const fields = later.length ? await customFieldsFor(row.project_id) : [];
    for (const fn of later) {
      const h = await fn(fields);
      if (Array.isArray(h)) history.push(...h);
    }
    if (opts.comment && String(opts.comment).trim()) await S().comments.insertRaw(ctx, row, String(opts.comment));
    return { row, history, transition: t, changed: true };
  }

  async function resolutionByRef(p) {
    if (p.resolutionId) return p.resolutionId;
    if (p.resolution) return db().value('SELECT "id" FROM "resolutions" WHERE LOWER("name") = ?', [String(p.resolution).toLowerCase()]);
    return null;
  }

  // ---- update -------------------------------------------------------------------------------------------------
  /** Apply a patch inside a transaction; returns { row, history }. Status changes go through transitions. */
  async function updateInTx(ctx, issue, body, { inTransition = false } = {}) {
    const now = nowOf(ctx);
    const patch = columnsPatch(body);
    // fields that did not change are dropped
    for (const k of Object.keys(patch)) if ((patch[k] ?? null) === (issue[k] ?? null)) delete patch[k];
    await checkRefs(issue, patch);
    const history = [];
    let row = issue;
    if (Object.keys(patch).length) {
      for (const [col, v] of Object.entries(patch)) {
        const field = HIST_NAME[col];
        if (!field) continue;
        const long = col === 'description';
        history.push({
          field, from_value: issue[col] == null ? null : String(issue[col]), to_value: v == null ? null : String(v),
          from_label: long ? null : await label(col, issue[col]), to_label: long ? null : await label(col, v),
        });
      }
      if (patch.assignee_id) await addWatcher(issue.id, patch.assignee_id, now);
      row = await db().update('issues', issue.id, { ...patch, updated_at: now });
      // a parent's epic is inherited by its subtasks
      if ('epic_id' in patch) await db().run('UPDATE "issues" SET "epic_id" = ? WHERE "parent_id" = ?', [patch.epic_id, issue.id]);
    }
    const cur = await currentMulti(issue.id);
    history.push(...(await setMulti(row, body, cur)));
    if (body.custom) history.push(...(await setCustom(row, body.custom, await customFieldsFor(row.project_id))));
    if (history.length && !Object.keys(patch).length) row = await db().update('issues', issue.id, { updated_at: now });
    if (!inTransition && (body.statusId || body.status_id) && (body.statusId || body.status_id) !== row.status_id) {
      const r = await applyTransition(ctx, row, { statusId: body.statusId || body.status_id, resolutionId: body.resolutionId });
      row = r.row; history.push(...r.history);
    }
    return { row, history };
  }

  // ---- output -------------------------------------------------------------------------------------------------
  async function full(ctx, row) {
    const id = row.id;
    const d = db();
    const multi = await currentMulti(id);
    const custom = Object.fromEntries((await d.select('custom_values', { issue_id: id })).map((r) => [r.field_id, parseJson(r.value)]));
    const subtasks = await d.all('SELECT "id", "key", "summary", "status_id", "type_id", "assignee_id", "priority_id", "rank" FROM "issues" WHERE "parent_id" = ? ORDER BY "rank"', [id]);
    const out = await d.all('SELECT l."id", l."kind", l."target_id" AS other, i."key", i."summary", i."status_id", i."type_id" FROM "issue_links" l JOIN "issues" i ON i."id" = l."target_id" WHERE l."source_id" = ?', [id]);
    const inn = await d.all('SELECT l."id", l."kind", l."source_id" AS other, i."key", i."summary", i."status_id", i."type_id" FROM "issue_links" l JOIN "issues" i ON i."id" = l."source_id" WHERE l."target_id" = ?', [id]);
    const link = (dir) => (l) => ({
      id: l.id, kind: l.kind, direction: dir, label: (LINK_KINDS[l.kind] || [l.kind, l.kind])[dir === 'outward' ? 0 : 1],
      issue: { id: l.other, key: l.key, summary: l.summary, statusId: l.status_id, typeId: l.type_id },
    });
    const uid = ctx.user?.id;
    const ref = async (rid) => (rid ? d.get('SELECT "id", "key", "summary", "color", "status_id" FROM "issues" WHERE "id" = ?', [rid]) : null);
    const small = (r) => (r ? { id: r.id, key: r.key, summary: r.summary, color: r.color, statusId: r.status_id } : null);
    return {
      ...toApi('issues', row),
      ...multi,
      custom,
      epic: small(await ref(row.epic_id)),
      parent: small(await ref(row.parent_id)),
      subtasks: subtasks.map((s) => ({ id: s.id, key: s.key, summary: s.summary, statusId: s.status_id, typeId: s.type_id, assigneeId: s.assignee_id, priorityId: s.priority_id })),
      links: [...out.map(link('outward')), ...inn.map(link('inward'))],
      checklist: (await d.select('checklist_items', { issue_id: id }, { order: 'position' })).map((r) => toApi('checklist_items', r)),
      watcherCount: await d.count('issue_watchers', { issue_id: id }),
      watching: uid ? !!(await d.get('SELECT 1 AS x FROM "issue_watchers" WHERE "issue_id" = ? AND "user_id" = ?', [id, uid])) : false,
      voteCount: await d.count('issue_votes', { issue_id: id }),
      voted: uid ? !!(await d.get('SELECT 1 AS x FROM "issue_votes" WHERE "issue_id" = ? AND "user_id" = ?', [id, uid])) : false,
      commentCount: await d.count('comments', { issue_id: id }),
      attachmentCount: await d.count('attachments', { issue_id: id }),
      childCount: await d.count('issues', { epic_id: id }),
    };
  }

  const topics = (row) => [`project:${row.project_id}`, `issue:${row.id}`];

  // ---- service ------------------------------------------------------------------------------------------------
  const svc = {
    load,
    loadFor,
    full,
    applyTransition,
    matchesJql,
    rebalanceRanks,
    topics,

    async get(ctx, idOrKey) {
      const row = await loadFor(ctx, idOrKey, 'viewer');
      return full(ctx, row);
    },

    /**
     * Create an issue. body: { projectId | projectKey, typeId?, summary, … (see SIMPLE), statusId?, labels?, componentIds?,
     * fixVersionIds?, affectedVersionIds?, custom?, checklist?: string[], afterId?, beforeId? }
     */
    async create(ctx, body = {}) {
      requireUser(ctx);
      const project = await S().projects.load(body.projectId || body.project_id || body.projectKey || body.project || '');
      await assertProject(db(), ctx, project.id, 'member');
      const now = nowOf(ctx);
      const userId = ctx.user?.id || null;
      const row = await db().tx(async () => {
        let typeId = body.typeId || body.type_id;
        if (!typeId) typeId = (await db().get('SELECT "id" FROM "issue_types" WHERE "project_id" = ? AND "level" = 0 ORDER BY "position"', [project.id]))?.id;
        check(!!typeId, 'INVALID_TYPE', 'The project has no issue type');
        const patch = columnsPatch({ ...body, typeId });
        check(patch.summary, 'REQUIRED', 'summary is required', { field: 'summary' });
        const shell = { id: newId(), project_id: project.id, type_id: null, parent_id: null };
        await checkRefs(shell, patch);
        // status: explicit (must exist in project) or the workflow's initial status
        let statusId = body.statusId || body.status_id;
        if (statusId) {
          if (!(await db().get('SELECT "id" FROM "statuses" WHERE "id" = ? AND "project_id" = ?', [statusId, project.id]))) throw new ValidationError('INVALID_STATUS', 'Unknown status');
        } else {
          const wf = await workflowOf({ type_id: typeId, project_id: project.id });
          statusId = wf?.initial_status_id || (await db().get('SELECT "id" FROM "statuses" WHERE "project_id" = ? ORDER BY "position"', [project.id]))?.id;
        }
        const status = await db().get('SELECT * FROM "statuses" WHERE "id" = ?', [statusId]);
        // key: bump the project's counter inside the transaction (the UPDATE locks the row everywhere)
        await db().run('UPDATE "projects" SET "issue_seq" = "issue_seq" + 1 WHERE "id" = ?', [project.id]);
        const number = Number(await db().value('SELECT "issue_seq" FROM "projects" WHERE "id" = ?', [project.id]));
        // subtasks inherit the parent's epic
        if (patch.parent_id && patch.epic_id === undefined) patch.epic_id = (await db().get('SELECT "epic_id" FROM "issues" WHERE "id" = ?', [patch.parent_id]))?.epic_id || null;
        const defPriority = patch.priority_id || (await defaultPriorityId());
        const r = await nextRank(body.afterId, body.beforeId);
        const resolved = status.category === 'done';
        const issue = await db().insert('issues', {
          ...patch, id: shell.id, project_id: project.id, number, key: `${project.key}-${number}`, type_id: typeId, status_id: statusId,
          priority_id: defPriority, reporter_id: patch.reporter_id !== undefined ? patch.reporter_id : userId,
          assignee_id: patch.assignee_id !== undefined ? patch.assignee_id : project.default_assignee_id,
          resolution_id: resolved ? (body.resolutionId || (await db().value('SELECT "id" FROM "resolutions" ORDER BY "position"'))) : null,
          resolved_at: resolved ? now : null, rank: r, status_changed_at: now, time_spent: 0, created_at: now, updated_at: now,
        });
        await setMulti(issue, body, { labels: [], componentIds: [], fixVersionIds: [], affectedVersionIds: [] });
        await setCustom(issue, body.custom || {}, await customFieldsFor(project.id), { creating: true });
        if (Array.isArray(body.checklist) && body.checklist.length) {
          const keys = rank.initial(body.checklist.length);
          await db().insertMany('checklist_items', body.checklist.map((it, i) => ({
            id: newId(), issue_id: issue.id, text: requireText(typeof it === 'string' ? it : it.text, 'text', 500), done: typeof it === 'object' && it.done ? 1 : 0, position: keys[i], created_at: now, updated_at: now,
          })));
        }
        await addWatcher(issue.id, issue.reporter_id, now);
        await addWatcher(issue.id, issue.assignee_id, now);
        await writeHistory(db(), issue.id, userId, now, [{ field: 'created', to_value: statusId, to_label: status.name }]);
        if (needsRebalanceKey(issue.rank)) await rebalanceRanks();
        return issue;
      });
      const out = await full(ctx, row);
      emit(core, ctx, 'issue.created', topics(row), { id: row.id, rev: row.rev, data: out });
      return out;
    },

    /** PATCH. body may carry `rev` (optimistic lock). */
    async update(ctx, idOrKey, body = {}) {
      const issue = await loadFor(ctx, idOrKey, 'member');
      if (body.rev != null && Number(body.rev) !== Number(issue.rev)) {
        throw new ConflictError('The issue was changed by someone else', await full(ctx, issue));
      }
      const before = issue.status_id;
      const { row, history } = await db().tx(async () => {
        const fresh = await lockRev(issue.id, body.rev);
        const r = await updateInTx(ctx, fresh, body);
        await writeHistory(db(), fresh.id, ctx.user?.id, nowOf(ctx), r.history);
        return r;
      });
      const out = await full(ctx, row);
      if (history.length) {
        emit(core, ctx, 'issue.updated', topics(row), { id: row.id, rev: row.rev, data: { ...out, changes: history.map((h) => ({ field: h.field, from: h.from_value, to: h.to_value })) } });
        if (row.status_id !== before) emit(core, ctx, 'issue.transitioned', topics(row), { id: row.id, rev: row.rev, data: { ...out, fromStatusId: before, toStatusId: row.status_id } });
      }
      return out;
    },

    async remove(ctx, idOrKey) {
      const issue = await loadFor(ctx, idOrKey, 'member');
      const subs = await db().all('SELECT "id" FROM "issues" WHERE "parent_id" = ?', [issue.id]);
      await db().tx(async () => {
        for (const s of subs) await deleteIssueRows(db(), s.id);
        await deleteIssueRows(db(), issue.id);
        await db().run('UPDATE "issues" SET "epic_id" = NULL WHERE "epic_id" = ?', [issue.id]);
      });
      for (const s of subs) emit(core, ctx, 'issue.deleted', [`project:${issue.project_id}`, `issue:${s.id}`], { id: s.id, data: { projectId: issue.project_id, parentId: issue.id } });
      emit(core, ctx, 'issue.deleted', topics(issue), { id: issue.id, data: { projectId: issue.project_id, key: issue.key } });
      return { ok: true };
    },

    /** Transitions available from the current status, with the reason a condition blocks one. */
    async transitions(ctx, idOrKey) {
      const issue = await loadFor(ctx, idOrKey, 'viewer');
      const list = await transitionsFor(issue);
      const out = [];
      for (const t of list) {
        if (t.to_status_id === issue.status_id && t.from_status_id == null) continue;
        const fail = await conditionFailure(ctx, issue, t);
        out.push({ ...toApi('transitions', t), available: !fail, reason: fail });
      }
      return out;
    },

    /** POST /issues/:id/transition { transitionId | statusId, resolutionId?, comment?, fields?, rev? } */
    async transition(ctx, idOrKey, body = {}) {
      const issue = await loadFor(ctx, idOrKey, 'member');
      const from = issue.status_id;
      const r = await db().tx(async () => {
        const fresh = await lockRev(issue.id, body.rev);
        const res = await applyTransition(ctx, fresh, body);
        await writeHistory(db(), fresh.id, ctx.user?.id, nowOf(ctx), res.history);
        return res;
      });
      const out = await full(ctx, r.row);
      if (r.changed) {
        emit(core, ctx, 'issue.transitioned', topics(r.row), { id: r.row.id, rev: r.row.rev, data: { ...out, fromStatusId: from, toStatusId: r.row.status_id, transitionId: r.transition?.id } });
      }
      return out;
    },

    /**
     * Board drag & drop: rank and (optionally) column/status and swimlane in one step.
     * body: { boardId?, columnId?, statusId?, afterId?, beforeId?, swimlane?, rev? }
     * Returns { issue, warnings: [{ code: 'WIP_LIMIT', columnId, max, count }] }.
     */
    async move(ctx, idOrKey, body = {}) {
      const issue = await loadFor(ctx, idOrKey, 'member');
      const board = body.boardId ? await S().boards.loadRaw(body.boardId) : null;
      const from = issue.status_id;
      const warnings = [];
      let column = null;
      if (body.columnId) {
        column = await db().get('SELECT * FROM "board_columns" WHERE "id" = ?', [body.columnId]);
        if (!column) throw new NotFoundError('COLUMN_NOT_FOUND', 'Column not found');
      }
      const r = await db().tx(async () => {
        let row = await lockRev(issue.id, body.rev);
        const history = [];
        let transitioned = false;
        let targetStatus = body.statusId || null;
        if (column) {
          const ids = parseJson(column.status_ids, []) || [];
          if (!ids.includes(row.status_id)) {
            if (!targetStatus || !ids.includes(targetStatus)) {
              const avail = await transitionsFor(row);
              targetStatus = null;
              for (const sid of ids) {
                const t = avail.find((x) => x.to_status_id === sid);
                if (t && !(await conditionFailure(ctx, row, t))) { targetStatus = sid; break; }
              }
              if (!targetStatus) throw new AppError('TRANSITION_NOT_ALLOWED', 'The issue cannot move to this column', 400, { columnId: column.id });
            }
          } else if (!targetStatus || !ids.includes(targetStatus)) targetStatus = null;
        }
        if (targetStatus && targetStatus !== row.status_id) {
          const t = await applyTransition(ctx, row, { statusId: targetStatus, resolutionId: body.resolutionId });
          row = t.row; history.push(...t.history); transitioned = t.changed;
        }
        const patch = {};
        if (body.afterId !== undefined || body.beforeId !== undefined) {
          patch.rank = await nextRank(body.afterId || null, body.beforeId || null);
        }
        if (body.swimlane !== undefined && board) {
          const mode = parseJson(board.settings, {})?.swimlanes;
          const lane = body.swimlane === '' || body.swimlane === 'none' ? null : body.swimlane;
          const col = { assignee: 'assignee_id', epic: 'epic_id', priority: 'priority_id' }[mode];
          if (col && (row[col] ?? null) !== lane) {
            const u = await updateInTx(ctx, row, { [Object.keys(SIMPLE).find((k) => SIMPLE[k] === col)]: lane });
            row = u.row; history.push(...u.history);
          }
        }
        if (Object.keys(patch).length) row = await db().update('issues', row.id, { ...patch, updated_at: nowOf(ctx) });
        await writeHistory(db(), row.id, ctx.user?.id, nowOf(ctx), history);
        return { row, history, transitioned };
      });
      if (needsRebalanceKey(r.row.rank)) await rebalanceRanks();
      if (column && column.wip_max != null && board) {
        const count = await S().boards.columnCount(ctx, board, column);
        if (count > Number(column.wip_max)) warnings.push({ code: 'WIP_LIMIT', message: 'The column is over its maximum', columnId: column.id, max: Number(column.wip_max), count });
      }
      const out = await full(ctx, r.row);
      emit(core, ctx, 'issue.moved', topics(r.row), { id: r.row.id, rev: r.row.rev, data: { ...out, columnId: column?.id || null, boardId: board?.id || null } });
      if (r.transitioned) emit(core, ctx, 'issue.transitioned', topics(r.row), { id: r.row.id, rev: r.row.rev, data: { ...out, fromStatusId: from, toStatusId: r.row.status_id } });
      else if (r.history.length) emit(core, ctx, 'issue.updated', topics(r.row), { id: r.row.id, rev: r.row.rev, data: { ...out, changes: r.history.map((h) => ({ field: h.field, from: h.from_value, to: h.to_value })) } });
      return { issue: out, warnings };
    },

    /** POST /issues/bulk { ids, patch | transition: {statusId|transitionId,…} | delete: true } → { ok: [ids], failed: [{id, error}] } */
    async bulk(ctx, body = {}) {
      requireUser(ctx);
      check(Array.isArray(body.ids) && body.ids.length, 'REQUIRED', 'ids is required', { field: 'ids' });
      check(body.ids.length <= 1000, 'TOO_MANY', 'At most 1000 issues at once');
      const ok = [];
      const failed = [];
      for (const id of body.ids) {
        try {
          if (body.delete) await svc.remove(ctx, id);
          else if (body.transition) await svc.transition(ctx, id, body.transition);
          else if (body.patch) await svc.update(ctx, id, { ...body.patch, rev: undefined });
          else throw new ValidationError('REQUIRED', 'patch, transition or delete is required');
          ok.push(id);
        } catch (err) {
          failed.push({ id, error: err.toJSON ? err.toJSON() : { code: 'ERROR', message: err.message } });
        }
      }
      return { ok, failed };
    },

    /** Clone an issue (fields, labels, components, versions, custom values, checklist) and link it 'clones'. */
    async clone(ctx, idOrKey, body = {}) {
      const src = await svc.get(ctx, idOrKey);
      const copy = await svc.create(ctx, {
        projectId: src.projectId, typeId: src.typeId, summary: body.summary || `${src.summary}`.slice(0, 500), description: src.description,
        priorityId: src.priorityId, assigneeId: src.assigneeId, parentId: src.parentId, epicId: src.epicId, storyPoints: src.storyPoints,
        originalEstimate: src.originalEstimate, dueDate: src.dueDate, startDate: src.startDate, color: src.color, cover: src.cover, icon: src.icon,
        labels: src.labels, componentIds: src.componentIds, fixVersionIds: src.fixVersionIds, affectedVersionIds: src.affectedVersionIds,
        custom: src.custom, checklist: src.checklist.map((c) => ({ text: c.text, done: false })), afterId: src.id,
      });
      await S().links.add(ctx, copy.id, { targetId: src.id, kind: 'clones' });
      return svc.get(ctx, copy.id);
    },

    /**
     * JQL search. q: { jql, limit, offset, includeArchived } → { items, total }.
     * Items are issue rows (camelCase) plus labels; the UI resolves names from the project config.
     */
    async search(ctx, q = {}) {
      requireUser(ctx);
      const { limit, offset } = paging(q, 50, 5000);
      const { where, params, orderBy } = await svc.compileFor(ctx, q.jql || '');
      let sqlWhere = `(${where})`;
      if (!q.includeArchived) sqlWhere += ' AND i."archived" = 0';
      const ids = await accessibleProjectIds(db(), ctx);
      const p = [...params];
      if (ids) {
        if (!ids.length) return { items: [], total: 0 };
        sqlWhere += ` AND i."project_id" IN (${ids.map(() => '?').join(', ')})`;
        p.push(...ids);
      }
      const total = Number(await db().value(`SELECT COUNT(*) AS n FROM "issues" i WHERE ${sqlWhere}`, p, 0));
      const order = orderBy || 'i."rank", i."id"';
      const rows = await db().all(`SELECT ${CARD_COLUMNS.map((c) => 'i.' + db().q(c)).join(', ')} FROM "issues" i WHERE ${sqlWhere} ORDER BY ${order}${db().limitClause(limit, offset)}`, p);
      const items = rows.map((r) => toApi('issues', r));
      if (items.length) {
        const labels = await db().all(`SELECT "issue_id", "label" FROM "issue_labels" WHERE "issue_id" IN (${items.map(() => '?').join(', ')}) ORDER BY "label"`, items.map((i) => i.id));
        const by = {};
        for (const l of labels) (by[l.issue_id] ||= []).push(l.label);
        for (const it of items) it.labels = by[it.id] || [];
      }
      return { items, total, limit, offset };
    },

    /** Compile JQL with this user's context (custom fields of every visible project, priorities). */
    async compileFor(ctx, jql, extra = {}) {
      const fields = await allFields();
      const priorities = await db().select('priorities', {});
      return compile(jql || '', { userId: ctx?.user?.id || null, now: nowOf(ctx), fields, priorities, ...extra });
    },

    async validateJql(ctx, jql) {
      requireUser(ctx);
      const fields = await allFields();
      return jqlValidate(jql || '', { fields, userId: ctx.user?.id, now: nowOf(ctx) });
    },

    /**
     * Hydrated issues for createMatcher/createComparator (see core/jql/index.js for the shape).
     * @param {string[]} ids
     */
    async hydrate(ids) {
      if (!ids.length) return [];
      const d = db();
      const out = [];
      for (let k = 0; k < ids.length; k += 500) {
        const chunk = ids.slice(k, k + 500);
        const ph = chunk.map(() => '?').join(', ');
        const rows = await d.all(`SELECT * FROM "issues" WHERE "id" IN (${ph})`, chunk);
        const pids = [...new Set(rows.map((r) => r.project_id))];
        const pph = pids.map(() => '?').join(', ');
        const [projects, types, statuses, prios, ress, users, labels, comps, vers, cvs, refs] = [
          await d.all(`SELECT "id", "key", "name" FROM "projects" WHERE "id" IN (${pph})`, pids),
          await d.all(`SELECT "id", "name", "position" FROM "issue_types" WHERE "project_id" IN (${pph})`, pids),
          await d.all(`SELECT "id", "name", "category", "position" FROM "statuses" WHERE "project_id" IN (${pph})`, pids),
          await d.select('priorities', {}),
          await d.select('resolutions', {}),
          await d.all('SELECT "id", "username", "display_name" FROM "users"'),
          await d.all(`SELECT "issue_id", "label" FROM "issue_labels" WHERE "issue_id" IN (${ph})`, chunk),
          await d.all(`SELECT ic."issue_id", c."id", c."name" FROM "issue_components" ic JOIN "components" c ON c."id" = ic."component_id" WHERE ic."issue_id" IN (${ph})`, chunk),
          await d.all(`SELECT iv."issue_id", iv."kind", v."id", v."name" FROM "issue_versions" iv JOIN "versions" v ON v."id" = iv."version_id" WHERE iv."issue_id" IN (${ph})`, chunk),
          await d.all(`SELECT "issue_id", "field_id", "value" FROM "custom_values" WHERE "issue_id" IN (${ph})`, chunk),
          await d.all(`SELECT "id", "key", "summary" FROM "issues" WHERE "id" IN (SELECT "epic_id" FROM "issues" WHERE "id" IN (${ph})) OR "id" IN (SELECT "parent_id" FROM "issues" WHERE "id" IN (${ph}))`, [...chunk, ...chunk]),
        ];
        const m = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]));
        const P = m(projects); const T = m(types); const St = m(statuses); const Pr = m(prios); const R = m(ress); const U = m(users); const Ref = m(refs);
        const user = (id) => (id && U[id] ? { id, username: U[id].username, displayName: U[id].display_name } : null);
        const group = (arr, fn) => { const g = {}; for (const x of arr) (g[x.issue_id] ||= []).push(fn(x)); return g; };
        const L = group(labels, (x) => x.label); const C = group(comps, (x) => ({ id: x.id, name: x.name }));
        const FV = group(vers.filter((v) => v.kind === 'fix'), (x) => ({ id: x.id, name: x.name }));
        const AV = group(vers.filter((v) => v.kind === 'affects'), (x) => ({ id: x.id, name: x.name }));
        const CV = {};
        for (const c of cvs) (CV[c.issue_id] ||= {})[c.field_id] = parseJson(c.value);
        for (const r of rows) {
          out.push({
            id: r.id, key: r.key, number: r.number, projectId: r.project_id, project: P[r.project_id] ? { id: r.project_id, key: P[r.project_id].key, name: P[r.project_id].name } : null,
            type: T[r.type_id] ? { id: r.type_id, name: T[r.type_id].name, position: T[r.type_id].position } : null,
            status: St[r.status_id] ? { id: r.status_id, name: St[r.status_id].name, category: St[r.status_id].category, position: St[r.status_id].position } : null,
            priority: Pr[r.priority_id] ? { id: r.priority_id, name: Pr[r.priority_id].name, position: Pr[r.priority_id].position } : null,
            resolution: R[r.resolution_id] ? { id: r.resolution_id, name: R[r.resolution_id].name } : null,
            assignee: user(r.assignee_id), reporter: user(r.reporter_id),
            labels: L[r.id] || [], components: C[r.id] || [], fixVersions: FV[r.id] || [], affectedVersions: AV[r.id] || [],
            created: r.created_at, updated: r.updated_at, resolved: r.resolved_at, due: r.due_date, summary: r.summary, description: r.description,
            epic: Ref[r.epic_id] ? { id: r.epic_id, key: Ref[r.epic_id].key, summary: Ref[r.epic_id].summary } : null,
            parent: Ref[r.parent_id] ? { id: r.parent_id, key: Ref[r.parent_id].key } : null,
            flagged: !!Number(r.flagged), storyPoints: r.story_points, rank: r.rank, archived: !!Number(r.archived), custom: CV[r.id] || {},
          });
        }
      }
      return out;
    },

    /** In-memory matcher with this user's context (custom fields, priorities, users). */
    async matcher(ctx, jql) {
      const fields = await allFields();
      const priorities = await db().select('priorities', {});
      const users = (await db().all('SELECT "id", "username", "display_name" FROM "users"')).map((u) => ({ id: u.id, username: u.username, displayName: u.display_name }));
      return createMatcher(jql || '', { userId: ctx?.user?.id || null, now: nowOf(ctx), fields, priorities, users });
    },

    addWatcher,
    customFieldsFor,
    allFields,
  };
  return svc;
}

const needsRebalanceKey = (k) => rank.needsRebalance(k);

/** Delete an issue row and everything hanging off it. */
export async function deleteIssueRows(db, issueId) {
  for (const t of ['issue_labels', 'issue_components', 'issue_versions', 'issue_watchers', 'issue_votes', 'custom_values', 'checklist_items', 'comments', 'attachments', 'worklogs', 'issue_history', 'notifications']) {
    await db.run(`DELETE FROM ${db.q(t)} WHERE "issue_id" = ?`, [issueId]);
  }
  await db.run('DELETE FROM "issue_links" WHERE "source_id" = ? OR "target_id" = ?', [issueId, issueId]);
  await db.run('DELETE FROM "issues" WHERE "id" = ?', [issueId]);
}

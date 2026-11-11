// Automation rules: CRUD + the engine.
//
// rule.trigger    { type: 'issue.created' | 'issue.transitioned' | 'issue.updated' | 'comment.created' | 'scheduled' | 'manual',
//                   fromStatusId?, toStatusId? (transitioned), fields?: string[] (updated), everyMinutes? (scheduled),
//                   jql? (scheduled/manual: which issues) }
// rule.conditions [{ jql }]            all must match the issue (JQL compiled to SQL, `AND i.id = ?`)
// rule.actions    [{ type: 'transition', statusId | transitionId } | { type: 'assign', userId | 'reporter' | 'currentUser' | null }
//                  | { type: 'setField', field, value } | { type: 'comment', body } | { type: 'addLabel', label } | { type: 'removeLabel', label }]
// Text values may use {{issue.key}} {{issue.summary}} {{user.name}} {{rule.name}}.
// Loops are prevented: an action's events carry depth+1 and the rule id; a rule never reacts to itself and
// nothing runs at depth ≥ MAX_DEPTH.
import { newId } from '../ids.js';
import { NotFoundError, ValidationError, check } from '../errors.js';
import { toApi, fromApi, emit, nowOf, requireText, assertProject, parseJson } from './common.js';

export const TRIGGERS = ['issue.created', 'issue.transitioned', 'issue.updated', 'comment.created', 'scheduled', 'manual'];
export const ACTIONS = ['transition', 'assign', 'setField', 'comment', 'addLabel', 'removeLabel'];
const MAX_DEPTH = 3;
const RUN_LIMIT = 500;

export function createAutomation(core) {
  const db = () => core.db;
  const S = () => core.services;
  const out = (r) => toApi('automation_rules', r);

  function validateRule(r) {
    const trigger = typeof r.trigger === 'string' ? parseJson(r.trigger) : r.trigger;
    const conditions = (typeof r.conditions === 'string' ? parseJson(r.conditions) : r.conditions) || [];
    const actions = typeof r.actions === 'string' ? parseJson(r.actions) : r.actions;
    check(trigger && TRIGGERS.includes(trigger.type), 'INVALID_TRIGGER', `trigger.type must be one of ${TRIGGERS.join(', ')}`);
    if (trigger.type === 'scheduled') check(Number(trigger.everyMinutes) >= 1, 'INVALID_TRIGGER', 'A scheduled rule needs everyMinutes ≥ 1');
    check(Array.isArray(conditions), 'INVALID_CONDITIONS', 'conditions must be an array of { jql }');
    check(Array.isArray(actions) && actions.length > 0, 'INVALID_ACTIONS', 'A rule needs at least one action');
    for (const a of actions) check(a && ACTIONS.includes(a.type), 'INVALID_ACTIONS', `Unknown action: ${a?.type}`, { types: ACTIONS });
    return { trigger, conditions, actions };
  }

  async function validateJqls(ctx, parts) {
    const list = [parts.trigger.jql, ...parts.conditions.map((c) => c.jql)].filter((j) => j && String(j).trim());
    for (const j of list) {
      const v = await S().issues.validateJql(ctx, j);
      if (!v.ok) throw new ValidationError(v.error.code, v.error.message, v.error.details);
    }
  }

  async function load(id) {
    const r = await db().get('SELECT * FROM "automation_rules" WHERE "id" = ?', [id]);
    if (!r) throw new NotFoundError('RULE_NOT_FOUND', 'Automation rule not found');
    return r;
  }

  const render = (text, vars) => String(text ?? '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, k) => (k in vars ? String(vars[k] ?? '') : m));

  /** Run the actions of `rule` on one issue (inside its own transaction). */
  async function act(rule, issueId, ev) {
    const actor = rule.created_by ? await db().get('SELECT * FROM "users" WHERE "id" = ?', [rule.created_by]) : null;
    const ctx = { system: true, user: actor ? { id: actor.id, role: actor.role, username: actor.username } : null, depth: (ev?.depth || 0) + 1, ruleId: rule.id, clientId: null };
    const triggerUser = ev?.by ? await db().get('SELECT "id", "display_name" FROM "users" WHERE "id" = ?', [ev.by]) : null;
    for (const a of parseJson(rule.actions, [])) {
      const issue = await S().issues.load(issueId);
      const vars = { 'issue.key': issue.key, 'issue.summary': issue.summary, 'user.name': triggerUser?.display_name || '', 'rule.name': rule.name };
      switch (a.type) {
        case 'transition':
          if (a.statusId === issue.status_id) break;
          await S().issues.transition(ctx, issueId, { statusId: a.statusId, transitionId: a.transitionId });
          break;
        case 'assign': {
          const uid = a.userId === 'reporter' ? issue.reporter_id : a.userId === 'currentUser' ? ev?.by || null : a.userId ?? null;
          if ((uid ?? null) !== (issue.assignee_id ?? null)) await S().issues.update(ctx, issueId, { assigneeId: uid });
          break;
        }
        case 'setField': {
          const value = typeof a.value === 'string' ? render(a.value, vars) : a.value;
          const body = a.field.startsWith('custom:') ? { custom: { [a.field.slice(7)]: value } } : { [a.field]: value };
          await S().issues.update(ctx, issueId, body);
          break;
        }
        case 'comment': await S().comments.add(ctx, issueId, { body: render(a.body, vars) }); break;
        case 'addLabel':
        case 'removeLabel': {
          const cur = (await db().all('SELECT "label" FROM "issue_labels" WHERE "issue_id" = ?', [issueId])).map((r) => r.label);
          const label = render(a.label, vars).trim().replace(/\s+/g, '-');
          const next = a.type === 'addLabel' ? [...new Set([...cur, label])] : cur.filter((l) => l !== label);
          if (next.length !== cur.length) await S().issues.update(ctx, issueId, { labels: next });
          break;
        }
      }
    }
  }

  async function conditionsMatch(rule, issue, ev) {
    const conds = parseJson(rule.conditions, []) || [];
    const ctx = { system: true, user: ev?.by ? { id: ev.by } : null };
    for (const c of conds) if (c.jql && !(await S().issues.matchesJql(ctx, issue, c.jql))) return false;
    return true;
  }

  async function record(rule, err) {
    await db().run('UPDATE "automation_rules" SET "run_count" = "run_count" + 1, "last_run_at" = ?, "last_error" = ? WHERE "id" = ?',
      [Date.now(), err ? String(err.code || '') + ' ' + String(err.message || err).slice(0, 1000) : null, rule.id]);
  }

  function triggerMatches(trigger, ev) {
    if (trigger.type !== ev.type) return false;
    if (ev.type === 'issue.transitioned') {
      if (trigger.fromStatusId && trigger.fromStatusId !== ev.data?.fromStatusId) return false;
      if (trigger.toStatusId && trigger.toStatusId !== ev.data?.toStatusId) return false;
    }
    if (ev.type === 'issue.updated' && Array.isArray(trigger.fields) && trigger.fields.length) {
      const changed = (ev.data?.changes || []).map((c) => c.field);
      if (!trigger.fields.some((f) => changed.includes(f))) return false;
    }
    return true;
  }

  const svc = {
    TRIGGERS, ACTIONS,

    async list(ctx, projectId) {
      await assertProject(db(), ctx, projectId, 'viewer');
      return (await db().select('automation_rules', { project_id: projectId }, { order: 'created_at' })).map(out);
    },
    async get(ctx, id) {
      const r = await load(id);
      await assertProject(db(), ctx, r.project_id, 'viewer');
      return out(r);
    },
    async create(ctx, projectId, body = {}) {
      await assertProject(db(), ctx, projectId, 'admin');
      const parts = validateRule(body);
      await validateJqls(ctx, parts);
      const now = nowOf(ctx);
      const r = await db().insert('automation_rules', {
        id: newId(), project_id: projectId, name: requireText(body.name, 'name', 200), enabled: body.enabled === false ? 0 : 1,
        ...parts, run_count: 0, created_by: ctx.user?.id || null, created_at: now, updated_at: now,
      });
      emit(core, ctx, 'rule.created', [`project:${projectId}`], { id: r.id, rev: r.rev, data: out(r) });
      return out(r);
    },
    async update(ctx, id, body = {}) {
      const existing = await load(id);
      await assertProject(db(), ctx, existing.project_id, 'admin');
      const patch = fromApi('automation_rules', body, ['name', 'enabled', 'trigger', 'conditions', 'actions']);
      if (patch.name !== undefined) patch.name = requireText(patch.name, 'name', 200);
      const merged = { trigger: patch.trigger ?? existing.trigger, conditions: patch.conditions ?? existing.conditions, actions: patch.actions ?? existing.actions };
      const parts = validateRule(merged);
      await validateJqls(ctx, parts);
      const r = await db().update('automation_rules', id, patch, { rev: body.rev });
      emit(core, ctx, 'rule.updated', [`project:${existing.project_id}`], { id, rev: r.rev, data: out(r) });
      return out(r);
    },
    async remove(ctx, id) {
      const existing = await load(id);
      await assertProject(db(), ctx, existing.project_id, 'admin');
      await db().remove('automation_rules', { id });
      emit(core, ctx, 'rule.deleted', [`project:${existing.project_id}`], { id });
      return { ok: true };
    },

    /**
     * Run a rule now over the project's issues matching trigger.jql + conditions (manual / scheduled run).
     * @returns {{ matched: number, acted: number, errors: Array<{ issueId, error }> }}
     */
    async run(ctx, id, { checkAccess = true } = {}) {
      const rule = await load(id);
      if (checkAccess) await assertProject(db(), ctx, rule.project_id, 'admin');
      const trigger = parseJson(rule.trigger, {});
      const conds = [trigger.jql, ...(parseJson(rule.conditions, []) || []).map((c) => c.jql)].filter((j) => j && String(j).trim());
      const runCtx = { system: true, user: ctx?.user || null };
      let where = 'i."project_id" = ? AND i."archived" = 0';
      const params = [rule.project_id];
      for (const j of conds) {
        const c = await S().issues.compileFor(runCtx, j);
        where += ` AND (${c.where})`; params.push(...c.params);
      }
      const ids = (await db().all(`SELECT i."id" FROM "issues" i WHERE ${where} ORDER BY i."rank", i."id"${db().limitClause(RUN_LIMIT, 0)}`, params)).map((r) => r.id);
      const errors = [];
      let acted = 0;
      for (const issueId of ids) {
        try { await act(rule, issueId, { by: ctx?.user?.id || null, depth: 0 }); acted++; } catch (err) { errors.push({ issueId, error: err.toJSON ? err.toJSON() : { code: 'ERROR', message: err.message } }); }
      }
      await record(rule, errors[0]?.error || null);
      return { matched: ids.length, acted, errors };
    },

    /** Event subscriber (registered by the core). */
    async onEvent(ev) {
      if ((ev.depth || 0) >= MAX_DEPTH) return;
      const issueId = ev.type === 'comment.created' ? ev.data?.issueId : ev.id;
      if (!issueId) return;
      const issue = await db().get('SELECT * FROM "issues" WHERE "id" = ?', [issueId]);
      if (!issue) return;
      const rules = await db().select('automation_rules', { project_id: issue.project_id, enabled: 1 }, { order: 'created_at' });
      for (const rule of rules) {
        if (ev.ruleId === rule.id) continue;
        const trigger = parseJson(rule.trigger, {});
        if (!triggerMatches(trigger, ev)) continue;
        let err = null;
        try {
          if (!(await conditionsMatch(rule, issue, ev))) continue;
          await act(rule, issueId, ev);
        } catch (e) { err = e; }
        await record(rule, err);
        if (!err) emit(core, { system: true, depth: ev.depth }, 'rule.ran', [`project:${issue.project_id}`], { id: rule.id, data: { ruleId: rule.id, issueId } });
      }
    },

    /** Scheduler tick: run due scheduled rules. */
    async tick(now = Date.now()) {
      const rules = await db().select('automation_rules', { enabled: 1 });
      for (const r of rules) {
        const t = parseJson(r.trigger, {});
        if (t.type !== 'scheduled') continue;
        if (r.last_run_at && Number(r.last_run_at) + Number(t.everyMinutes) * 60000 > now) continue;
        try { await svc.run({ system: true, user: null }, r.id, { checkAccess: false }); } catch (err) { await record(r, err); }
      }
    },
  };
  return svc;
}

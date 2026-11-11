// Projects, members, and the project templates/defaults (§3.1).
import { newId } from '../ids.js';
import { AppError, NotFoundError, check } from '../errors.js';
import {
  toApi, fromApi, requireUser, emit, nowOf, requireText, assertProject, accessibleProjectIds, isAdmin, projectRole,
} from './common.js';
import { TEMPLATES, ISSUE_TYPES, CATEGORY_COLOR, defaultBoardSettings } from './templates.js';
import { KEY_RE, projectKeyFree, rekeyProject, deleteProjectAliases } from './relocation.js';
import { defaultColumnIcon } from '../columnicons.js';
const PROJECT_FIELDS = ['name', 'description', 'icon', 'color', 'lead_id', 'default_assignee_id', 'archived'];

export function createProjects(core) {
  const db = () => core.db;

  async function load(idOrKey) {
    let row = await db().get('SELECT * FROM "projects" WHERE "id" = ? OR "key" = ?', [idOrKey, String(idOrKey).toUpperCase()]);
    // an earlier key (after a key rename) still finds the project
    if (!row) row = await db().get('SELECT p.* FROM "projects" p JOIN "project_key_aliases" a ON a."project_id" = p."id" WHERE a."key" = ?', [String(idOrKey).toUpperCase()]);
    if (!row) throw new NotFoundError('PROJECT_NOT_FOUND', 'Project not found');
    return row;
  }

  const svc = {
    load,

    async list(ctx, q = {}) {
      requireUser(ctx);
      const ids = await accessibleProjectIds(db(), ctx);
      const where = {};
      if (ids) where.id = ids;
      if (!q.archived) where.archived = 0;
      const rows = await db().select('projects', where, { order: 'name' });
      const counts = await db().all('SELECT "project_id", COUNT(*) AS n FROM "issues" WHERE "archived" = 0 GROUP BY "project_id"');
      const byId = Object.fromEntries(counts.map((c) => [c.project_id, Number(c.n)]));
      const roles = ctx.user ? Object.fromEntries((await db().all('SELECT "project_id", "role" FROM "project_members" WHERE "user_id" = ?', [ctx.user.id])).map((r) => [r.project_id, r.role])) : {};
      return rows.map((r) => ({ ...toApi('projects', r), issueCount: byId[r.id] || 0, myRole: isAdmin(ctx) ? (roles[r.id] || 'admin') : roles[r.id] || null }));
    },

    async get(ctx, idOrKey) {
      const row = await load(idOrKey);
      const role = await assertProject(db(), ctx, row.id, 'viewer');
      return { ...toApi('projects', row), myRole: role };
    },

    /**
     * Create a project with its template defaults.
     * @param {object} body { key, name, description?, icon?, color?, template?: 'kanban'|'software'|'bugs'|'simple',
     *   leadId?, names?: { statuses?: string[], types?: Record<string,string>, columns?: string[], board?: string } }
     */
    async create(ctx, body) {
      const user = requireUser(ctx);
      const key = requireText(body?.key, 'key', 10).toUpperCase();
      check(KEY_RE.test(key), 'INVALID_PROJECT_KEY', 'The key must be 2-10 letters or digits and start with a letter');
      const template = body.template || 'kanban';
      const tpl = TEMPLATES[template];
      check(!!tpl, 'INVALID_TEMPLATE', `Unknown template: ${template}`);
      const name = requireText(body.name, 'name', 200);
      const now = nowOf(ctx);
      const names = body.names || {};

      const result = await db().tx(async () => {
        if (!(await projectKeyFree(db(), key))) {
          throw new AppError('PROJECT_KEY_TAKEN', `The key ${key} is already used`, 409);
        }
        const extra = fromApi('projects', body, PROJECT_FIELDS);
        const project = await db().insert('projects', {
          ...extra, id: newId(), key, name, template, lead_id: extra.lead_id || user?.id || null, issue_seq: 0, created_at: now, updated_at: now,
        });
        if (user) await db().insert('project_members', { project_id: project.id, user_id: user.id, role: 'admin', created_at: now });

        // statuses
        const statuses = [];
        for (const [i, [sname, category]] of tpl.statuses.entries()) {
          statuses.push(await db().insert('statuses', {
            id: newId(), project_id: project.id, name: names.statuses?.[i] || sname, category, color: CATEGORY_COLOR[category], position: i, created_at: now, updated_at: now,
          }));
        }
        // workflow + transitions
        const workflow = await db().insert('workflows', { id: newId(), project_id: project.id, name: `${key} workflow`, initial_status_id: statuses[0].id, created_at: now, updated_at: now });
        const trans = tpl.transitions || statuses.map((s, i) => [s.name, null, i]);
        for (const [i, [tname, from, to]] of trans.entries()) {
          await db().insert('transitions', {
            id: newId(), workflow_id: workflow.id, name: tpl.transitions ? tname : statuses[to].name,
            from_status_id: from == null ? null : statuses[from].id, to_status_id: statuses[to].id,
            rules: { conditions: [], validators: [], postFunctions: [] }, position: i, created_at: now, updated_at: now,
          });
        }
        // issue types
        for (const [i, t] of tpl.types.entries()) {
          const def = ISSUE_TYPES[t];
          await db().insert('issue_types', {
            id: newId(), project_id: project.id, name: names.types?.[t] || def.name, icon: def.icon, color: def.color, level: def.level,
            workflow_id: workflow.id, position: i, created_at: now, updated_at: now,
          });
        }
        // board
        const backlogStatusIds = tpl.columns.filter((c) => c[2]?.backlog).flatMap((c) => c[1].map((i) => statuses[i].id));
        const board = await db().insert('boards', {
          id: newId(), project_id: project.id, name: names.board || `${key} board`, icon: body.icon || 'b:layers', filter_jql: null,
          settings: defaultBoardSettings(backlogStatusIds), created_by: user?.id || null, created_at: now, updated_at: now,
        });
        for (const [i, [cname, idx, opts = {}]] of tpl.columns.entries()) {
          await db().insert('board_columns', {
            id: newId(), board_id: board.id, name: names.columns?.[i] || cname, icon: opts.icon || defaultColumnIcon(cname, idx.map((k) => tpl.statuses[k][1]), { backlog: opts.backlog }), position: i, wip_min: opts.wipMin ?? null, wip_max: opts.wipMax ?? null,
            status_ids: idx.map((k) => statuses[k].id), created_at: now, updated_at: now,
          });
        }
        return { project, board };
      });
      emit(core, ctx, 'project.created', [`project:${result.project.id}`, 'projects'], { id: result.project.id, rev: result.project.rev, data: toApi('projects', result.project) });
      return { ...toApi('projects', result.project), boardId: result.board.id, myRole: 'admin' };
    },

    async update(ctx, id, body) {
      const existing = await load(id);
      await assertProject(db(), ctx, existing.id, 'admin');
      const patch = fromApi('projects', body, PROJECT_FIELDS);
      if (patch.name !== undefined) patch.name = requireText(patch.name, 'name', 200);
      // a new key re-keys every issue (OLD-12 → NEW-12); the old keys keep resolving (relocation.js)
      const newKey = body.key !== undefined && body.key !== null ? String(body.key).trim().toUpperCase() : existing.key;
      const rekey = newKey !== existing.key;
      if (rekey) check(KEY_RE.test(newKey), 'INVALID_PROJECT_KEY', 'The key must be 2-10 letters or digits and start with a letter', { field: 'key' });
      const row = await db().tx(async () => {
        if (rekey) {
          if (!(await projectKeyFree(db(), newKey, existing.id))) throw new AppError('PROJECT_KEY_TAKEN', `The key ${newKey} is already used`, 409, { field: 'key' });
          patch.key = newKey;
        }
        const updated = await db().update('projects', existing.id, patch, { rev: body?.rev });
        if (rekey) await rekeyProject(db(), existing, newKey, nowOf(ctx));
        return updated;
      });
      const data = { ...toApi('projects', row), ...(rekey ? { oldKey: existing.key } : {}) };
      emit(core, ctx, 'project.updated', [`project:${row.id}`, 'projects'], { id: row.id, rev: row.rev, data });
      return toApi('projects', row);
    },

    /** Delete a project and everything in it. */
    async remove(ctx, id) {
      const existing = await load(id);
      await assertProject(db(), ctx, existing.id, 'admin');
      await deleteProjectData(db(), existing.id);
      emit(core, ctx, 'project.deleted', [`project:${existing.id}`, 'projects'], { id: existing.id });
      return { ok: true };
    },

    // ---- members --------------------------------------------------------------------------------------------
    async members(ctx, projectId) {
      const p = await load(projectId);
      await assertProject(db(), ctx, p.id, 'viewer');
      const rows = await db().all(
        'SELECT m."user_id", m."role", u."username", u."display_name", u."avatar", u."active" FROM "project_members" m JOIN "users" u ON u."id" = m."user_id" WHERE m."project_id" = ? ORDER BY u."display_name"',
        [p.id]);
      return rows.map((r) => ({ userId: r.user_id, role: r.role, username: r.username, displayName: r.display_name, avatar: r.avatar, active: !!Number(r.active) }));
    },

    async setMember(ctx, projectId, { userId, role = 'member' }) {
      const p = await load(projectId);
      await assertProject(db(), ctx, p.id, 'admin');
      check(['admin', 'member', 'viewer'].includes(role), 'INVALID_ROLE', 'Role must be admin, member or viewer');
      if (!(await db().get('SELECT "id" FROM "users" WHERE "id" = ?', [userId]))) throw new NotFoundError('USER_NOT_FOUND', 'User not found');
      if (role !== 'admin') {
        const admins = await db().all('SELECT "user_id" FROM "project_members" WHERE "project_id" = ? AND "role" = ?', [p.id, 'admin']);
        check(!(admins.length === 1 && admins[0].user_id === userId), 'LAST_PROJECT_ADMIN', 'A project needs at least one administrator');
      }
      await db().tx(async () => {
        await db().remove('project_members', { project_id: p.id, user_id: userId });
        await db().insert('project_members', { project_id: p.id, user_id: userId, role, created_at: nowOf(ctx) });
      });
      emit(core, ctx, 'member.updated', [`project:${p.id}`], { id: userId, data: { userId, role } });
      return svc.members(ctx, p.id);
    },

    async removeMember(ctx, projectId, userId) {
      const p = await load(projectId);
      await assertProject(db(), ctx, p.id, 'admin');
      const admins = await db().all('SELECT "user_id" FROM "project_members" WHERE "project_id" = ? AND "role" = ?', [p.id, 'admin']);
      check(!(admins.length === 1 && admins[0].user_id === userId), 'LAST_PROJECT_ADMIN', 'A project needs at least one administrator');
      await db().remove('project_members', { project_id: p.id, user_id: userId });
      emit(core, ctx, 'member.deleted', [`project:${p.id}`], { id: userId });
      return { ok: true };
    },

    /** Everything the UI needs to edit issues of a project, in one call. */
    async config(ctx, idOrKey) {
      const p = await load(idOrKey);
      const role = await assertProject(db(), ctx, p.id, 'viewer');
      const d = db();
      const [types, statuses, workflows, components, versions, fields, priorities, resolutions, boards] = await Promise.all([
        d.select('issue_types', { project_id: p.id }, { order: 'position' }),
        d.select('statuses', { project_id: p.id }, { order: 'position' }),
        d.select('workflows', { project_id: p.id }, { order: 'name' }),
        d.select('components', { project_id: p.id }, { order: 'name' }),
        d.select('versions', { project_id: p.id }, { order: 'position' }),
        d.all('SELECT * FROM "custom_fields" WHERE "project_id" = ? OR "project_id" IS NULL ORDER BY "position"', [p.id]),
        d.select('priorities', {}, { order: 'position' }),
        d.select('resolutions', {}, { order: 'position' }),
        d.select('boards', { project_id: p.id }, { order: 'name' }),
      ]);
      const transitions = workflows.length
        ? await d.all(`SELECT * FROM "transitions" WHERE "workflow_id" IN (${workflows.map(() => '?').join(', ')}) ORDER BY "position"`, workflows.map((w) => w.id))
        : [];
      return {
        project: { ...toApi('projects', p), myRole: role },
        types: types.map((r) => toApi('issue_types', r)),
        statuses: statuses.map((r) => toApi('statuses', r)),
        workflows: workflows.map((w) => ({ ...toApi('workflows', w), transitions: transitions.filter((t) => t.workflow_id === w.id).map((t) => toApi('transitions', t)) })),
        components: components.map((r) => toApi('components', r)),
        versions: versions.map((r) => toApi('versions', r)),
        fields: fields.map((r) => toApi('custom_fields', r)),
        priorities: priorities.map((r) => toApi('priorities', r)),
        resolutions: resolutions.map((r) => toApi('resolutions', r)),
        boards: boards.map((r) => toApi('boards', r)),
        members: await svc.members(ctx, p.id),
      };
    },

    projectRole: (ctx, projectId) => projectRole(db(), ctx, projectId),
  };
  return svc;
}

/** Remove a project's rows from every table (used by delete and by import overwrite). */
export async function deleteProjectData(db, projectId) {
  const issues = 'SELECT "id" FROM "issues" WHERE "project_id" = ?';
  const boards = 'SELECT "id" FROM "boards" WHERE "project_id" = ?';
  await db.tx(async () => {
    await deleteProjectAliases(db, projectId);
    for (const t of ['issue_labels', 'issue_components', 'issue_versions', 'issue_watchers', 'issue_votes', 'custom_values', 'checklist_items', 'comments', 'attachments', 'worklogs', 'issue_history', 'notifications']) {
      await db.run(`DELETE FROM ${db.q(t)} WHERE "issue_id" IN (${issues})`, [projectId]);
    }
    await db.run(`DELETE FROM "issue_links" WHERE "source_id" IN (${issues}) OR "target_id" IN (${issues})`, [projectId, projectId]);
    await db.run('DELETE FROM "issues" WHERE "project_id" = ?', [projectId]);
    for (const t of ['board_columns', 'swimlanes', 'quick_filters', 'card_colors']) {
      await db.run(`DELETE FROM ${db.q(t)} WHERE "board_id" IN (${boards})`, [projectId]);
    }
    await db.run('DELETE FROM "boards" WHERE "project_id" = ?', [projectId]);
    await db.run('DELETE FROM "transitions" WHERE "workflow_id" IN (SELECT "id" FROM "workflows" WHERE "project_id" = ?)', [projectId]);
    for (const t of ['workflows', 'statuses', 'issue_types', 'components', 'versions', 'custom_fields', 'automation_rules', 'project_members']) {
      await db.run(`DELETE FROM ${db.q(t)} WHERE "project_id" = ?`, [projectId]);
    }
    await db.run('DELETE FROM "projects" WHERE "id" = ?', [projectId]);
  });
}


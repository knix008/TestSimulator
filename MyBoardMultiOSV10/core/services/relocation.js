// Keys that change: project key rename (issues re-keyed, old keys kept as aliases), moving an issue to another
// project (new key, subtasks along, fields mapped), and label rename / merge / delete (ARCHITECTURE §3.6).
//
// Aliases: `project_key_aliases` (a project's earlier keys — they still resolve and no other project may take
// them) and `issue_key_aliases` (an issue's earlier keys). Invariant: an alias never equals a live issue key —
// whoever gives an issue a key deletes the alias of that key — so lookups may simply try the live key first.
import { newId } from '../ids.js';
import { ConflictError, NotFoundError, ValidationError, check } from '../errors.js';
import { customValueColumns } from '../jql/index.js';
import { concatSql } from '../db/sqlgen.js';
import {
  toApi, requireUser, requireAdmin, assertProject, emit, nowOf, parseJson, isAdmin, accessibleProjectIds,
} from './common.js';
import { writeHistory } from './history.js';

export const KEY_RE = /^[A-Z][A-Z0-9]{1,9}$/;
const CHUNK = 500;

const chunks = (list, n = CHUNK) => { const out = []; for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n)); return out; };
const ph = (list) => list.map(() => '?').join(', ');
const lc = (s) => String(s ?? '').toLowerCase();

// ───────────────────────── key helpers

/** The project that owns `key` as its key or as an earlier key (alias), or null. */
export async function projectKeyOwner(db, key) {
  const k = String(key || '').toUpperCase();
  const live = await db.get('SELECT "id" FROM "projects" WHERE "key" = ?', [k]);
  if (live) return live.id;
  const alias = await db.get('SELECT "project_id" FROM "project_key_aliases" WHERE "key" = ?', [k]);
  return alias ? alias.project_id : null;
}

/** Is `key` free for a project (not some other project's key or earlier key)? */
export async function projectKeyFree(db, key, exceptProjectId = null) {
  const owner = await projectKeyOwner(db, key);
  return !owner || owner === exceptProjectId;
}

/** Issue id of an earlier issue key, or null. */
export async function issueIdByAlias(db, key) {
  const r = await db.get('SELECT "issue_id" FROM "issue_key_aliases" WHERE "key" = ?', [String(key || '').toUpperCase()]);
  return r ? r.issue_id : null;
}

/**
 * Re-key every issue of a project inside the caller's transaction: set-based (five statements whatever the
 * number of issues). Old keys become issue aliases, the old project key a project alias.
 */
export async function rekeyProject(db, project, key, now) {
  const old = project.key;
  check(KEY_RE.test(key), 'INVALID_PROJECT_KEY', 'The key must be 2-10 letters or digits and start with a letter');
  // the current keys become aliases (an alias equal to a live key cannot exist, but stay safe)
  await db.run('DELETE FROM "issue_key_aliases" WHERE "key" IN (SELECT "key" FROM "issues" WHERE "project_id" = ?)', [project.id]);
  await db.run('INSERT INTO "issue_key_aliases" ("key", "issue_id", "created_at") SELECT "key", "id", ? FROM "issues" WHERE "project_id" = ?', [now, project.id]);
  // KEY is validated ([A-Z0-9] only), so it can be a literal: PostgreSQL's || has no type for a parameter
  await db.run(`UPDATE "issues" SET "key" = ${concatSql(db.dialect, `'${key}-'`, '"number"')} WHERE "project_id" = ?`, [project.id]);
  // renaming back to an earlier key: those aliases are live keys again
  await db.run('DELETE FROM "issue_key_aliases" WHERE "key" IN (SELECT "key" FROM "issues" WHERE "project_id" = ?)', [project.id]);
  await db.run('DELETE FROM "project_key_aliases" WHERE "key" = ? OR "key" = ?', [key, old]);
  await db.insert('project_key_aliases', { key: old, project_id: project.id, created_at: now });
}

/** Remove the aliases of a project and its issues (project delete). */
export async function deleteProjectAliases(db, projectId) {
  await db.run('DELETE FROM "issue_key_aliases" WHERE "issue_id" IN (SELECT "id" FROM "issues" WHERE "project_id" = ?)', [projectId]);
  await db.run('DELETE FROM "project_key_aliases" WHERE "project_id" = ?', [projectId]);
}

// ───────────────────────── move to another project

export function createMoves(core) {
  const db = () => core.db;
  const S = () => core.services;

  /** What a target project offers: types, statuses (by position), workflows, fields, components, versions. */
  async function targetConfig(pid) {
    const d = db();
    const [types, statuses, workflows, fields, components, versions] = await Promise.all([
      d.select('issue_types', { project_id: pid }, { order: 'position' }),
      d.select('statuses', { project_id: pid }, { order: 'position' }),
      d.select('workflows', { project_id: pid }, { order: 'created_at' }),
      d.all('SELECT * FROM "custom_fields" WHERE "project_id" = ? OR "project_id" IS NULL ORDER BY "position"', [pid]),
      d.select('components', { project_id: pid }, { order: 'name' }),
      d.select('versions', { project_id: pid }, { order: 'position' }),
    ]);
    return { types, statuses, workflows, fields: fields.map((f) => ({ ...f, options: parseJson(f.options, []) || [] })), components, versions };
  }

  const levelOf = (t) => Number(t?.level ?? 0);

  /** Default target type: same name and level, else the first of the level (top level falls back to standard). */
  function defaultType(src, tc, level) {
    const same = tc.types.filter((t) => levelOf(t) === level);
    return same.find((t) => lc(t.name) === lc(src?.name)) || same[0]
      || (level === -1 ? tc.types.find((t) => levelOf(t) === 0) : null) || null;
  }

  /** Default target status: same name, else the type's workflow's initial status, else the first one. */
  function defaultStatus(src, tc, typeId) {
    const byName = tc.statuses.find((s) => lc(s.name) === lc(src?.name));
    if (byName) return byName;
    const type = tc.types.find((t) => t.id === typeId);
    const wf = tc.workflows.find((w) => w.id === type?.workflow_id) || tc.workflows[0];
    return tc.statuses.find((s) => s.id === wf?.initial_status_id)
      || tc.statuses.find((s) => s.category === src?.category) || tc.statuses[0] || null;
  }

  /** The target field a source field's values go to: global fields stay, else same name + type, else none. */
  function defaultField(f, tc) {
    if (f.project_id == null) return f;
    return tc.fields.find((x) => x.project_id != null && lc(x.name) === lc(f.name) && x.type === f.type)
      || tc.fields.find((x) => x.project_id == null && lc(x.name) === lc(f.name) && x.type === f.type) || null;
  }

  /** Values of the issue and its subtasks that the move would map or drop. */
  async function sourceParts(ids) {
    const d = db();
    const [values, comps, vers] = await Promise.all([
      d.all(`SELECT v."issue_id", v."field_id", v."value", f."project_id", f."name", f."type" FROM "custom_values" v JOIN "custom_fields" f ON f."id" = v."field_id" WHERE v."issue_id" IN (${ph(ids)})`, ids),
      d.all(`SELECT ic."issue_id", c."id", c."name" FROM "issue_components" ic JOIN "components" c ON c."id" = ic."component_id" WHERE ic."issue_id" IN (${ph(ids)})`, ids),
      d.all(`SELECT iv."issue_id", iv."kind", v."id", v."name" FROM "issue_versions" iv JOIN "versions" v ON v."id" = iv."version_id" WHERE iv."issue_id" IN (${ph(ids)})`, ids),
    ]);
    return { values, comps, vers };
  }

  /** The move plan for one target project (defaults + what would be lost). */
  async function plan(issue, subs, tc, parts, body = {}) {
    const d = db();
    const srcType = await d.get('SELECT * FROM "issue_types" WHERE "id" = ?', [issue.type_id]);
    const srcStatus = await d.get('SELECT * FROM "statuses" WHERE "id" = ?', [issue.status_id]);
    const level = levelOf(srcType) === 1 ? 0 : levelOf(srcType);
    const type = defaultType(srcType, tc, level);
    const status = type ? defaultStatus(srcStatus, tc, type.id) : null;
    let subtaskType = null;
    const statusMap = {};
    if (subs.length) {
      const subTypes = await d.all(`SELECT * FROM "issue_types" WHERE "id" IN (${ph([...new Set(subs.map((s) => s.type_id))])})`, [...new Set(subs.map((s) => s.type_id))]);
      subtaskType = defaultType(subTypes[0], tc, 1);
      const subStatuses = await d.all(`SELECT * FROM "statuses" WHERE "id" IN (${ph([...new Set(subs.map((s) => s.status_id))])})`, [...new Set(subs.map((s) => s.status_id))]);
      for (const s of subStatuses) statusMap[s.id] = defaultStatus(s, tc, subtaskType?.id)?.id ?? null;
    }
    const fieldMap = body.fieldMap || {};
    const lostFields = new Map();
    for (const v of parts.values) {
      const target = Object.prototype.hasOwnProperty.call(fieldMap, v.field_id) ? tc.fields.find((f) => f.id === fieldMap[v.field_id]) || null : defaultField(v, tc);
      if (!target) lostFields.set(v.field_id, v.name);
    }
    const names = (list) => new Set(list.map((x) => lc(x.name)));
    const tComps = names(tc.components);
    const tVers = names(tc.versions);
    return {
      typeId: type?.id ?? null, statusId: status?.id ?? null, subtaskTypeId: subtaskType?.id ?? null, statusMap,
      lost: {
        fields: [...new Set(lostFields.values())],
        components: [...new Set(parts.comps.filter((c) => !tComps.has(lc(c.name))).map((c) => c.name))],
        versions: [...new Set(parts.vers.filter((v) => !tVers.has(lc(v.name))).map((v) => v.name))],
      },
    };
  }

  /** Projects the user may move into (member or admin there), except the issue's own. */
  async function targetProjects(ctx, exceptId) {
    const rows = await db().all('SELECT * FROM "projects" WHERE "archived" = 0 AND "id" <> ? ORDER BY "name"', [exceptId]);
    if (isAdmin(ctx)) return rows;
    const roles = await db().all('SELECT "project_id", "role" FROM "project_members" WHERE "user_id" = ?', [ctx.user?.id || '']);
    const ok = new Set(roles.filter((r) => r.role === 'admin' || r.role === 'member').map((r) => r.project_id));
    return rows.filter((p) => ok.has(p.id));
  }

  /** Map one custom value to a target field; returns the value or undefined (dropped). */
  function mapValue(target, raw) {
    if (raw == null) return undefined;
    if (target.type === 'select') {
      const o = target.options.find((x) => lc(x.value) === lc(raw) || x.id === raw);
      return o ? o.value : undefined;
    }
    if (target.type === 'multiselect') {
      const out = (Array.isArray(raw) ? raw : [raw]).map((v) => target.options.find((x) => lc(x.value) === lc(v) || x.id === v)?.value).filter((v) => v != null);
      return out.length ? out : undefined;
    }
    return raw;
  }

  /**
   * Move one issue row (inside the transaction). Returns the history entries. `opt`: { typeId, statusId, number,
   * key, tc, fieldMap, components, versions, epicId }.
   */
  async function relocate(ctx, row, target, opt, now) {
    const d = db();
    const hist = [];
    const label = async (table, col, id) => (id ? (await d.get(`SELECT ${d.q(col)} AS v FROM ${d.q(table)} WHERE "id" = ?`, [id]))?.v ?? id : null);
    const oldProject = await d.get('SELECT "id", "key", "name" FROM "projects" WHERE "id" = ?', [row.project_id]);
    hist.push({ field: 'project', from_value: row.project_id, to_value: target.id, from_label: oldProject?.name ?? null, to_label: target.name });
    hist.push({ field: 'key', from_value: row.key, to_value: opt.key, from_label: row.key, to_label: opt.key });
    if (opt.typeId !== row.type_id) hist.push({ field: 'type', from_value: row.type_id, to_value: opt.typeId, from_label: await label('issue_types', 'name', row.type_id), to_label: await label('issue_types', 'name', opt.typeId) });
    if (opt.statusId !== row.status_id) hist.push({ field: 'status', from_value: row.status_id, to_value: opt.statusId, from_label: await label('statuses', 'name', row.status_id), to_label: await label('statuses', 'name', opt.statusId) });
    const status = opt.tc.statuses.find((s) => s.id === opt.statusId);
    const patch = {
      project_id: target.id, number: opt.number, key: opt.key, type_id: opt.typeId, status_id: opt.statusId, updated_at: now,
    };
    if (opt.statusId !== row.status_id) patch.status_changed_at = now;
    if (status.category === 'done') {
      if (!row.resolution_id) {
        patch.resolution_id = await d.value('SELECT "id" FROM "resolutions" ORDER BY "position"');
        patch.resolved_at = now;
      }
    } else if (row.resolution_id) { patch.resolution_id = null; patch.resolved_at = null; }
    if ('resolution_id' in patch && (patch.resolution_id ?? null) !== (row.resolution_id ?? null)) {
      hist.push({ field: 'resolution', from_value: row.resolution_id, to_value: patch.resolution_id, from_label: await label('resolutions', 'name', row.resolution_id), to_label: await label('resolutions', 'name', patch.resolution_id) });
    }
    if (opt.epicId !== undefined && (opt.epicId ?? null) !== (row.epic_id ?? null)) {
      patch.epic_id = opt.epicId;
      hist.push({ field: 'epic', from_value: row.epic_id, to_value: opt.epicId, from_label: await label('issues', 'key', row.epic_id), to_label: await label('issues', 'key', opt.epicId) });
    }
    await d.update('issues', row.id, patch);
    // keys: the old one becomes an alias, the new one must not be one
    await d.run('DELETE FROM "issue_key_aliases" WHERE "key" = ? OR "key" = ?', [opt.key, row.key]);
    await d.insert('issue_key_aliases', { key: row.key, issue_id: row.id, created_at: now });

    // components and versions: kept by name (case-insensitive) or cleared
    const comps = await d.all('SELECT c."id", c."name" FROM "issue_components" ic JOIN "components" c ON c."id" = ic."component_id" WHERE ic."issue_id" = ?', [row.id]);
    if (comps.length) {
      const next = opt.components === 'clear' ? [] : [...new Set(comps.map((c) => opt.tc.components.find((x) => lc(x.name) === lc(c.name))?.id).filter(Boolean))];
      await d.remove('issue_components', { issue_id: row.id });
      if (next.length) await d.insertMany('issue_components', next.map((component_id) => ({ issue_id: row.id, component_id })));
      hist.push({ field: 'components', from_value: comps.map((c) => c.id).join(','), to_value: next.join(',') || null, from_label: comps.map((c) => c.name).join(', '), to_label: next.map((id) => opt.tc.components.find((x) => x.id === id).name).join(', ') || null });
    }
    for (const [kind, field] of [['fix', 'fixVersions'], ['affects', 'affectedVersions']]) {
      const vers = await d.all('SELECT v."id", v."name" FROM "issue_versions" iv JOIN "versions" v ON v."id" = iv."version_id" WHERE iv."issue_id" = ? AND iv."kind" = ?', [row.id, kind]);
      if (!vers.length) continue;
      const next = opt.versions === 'clear' ? [] : [...new Set(vers.map((v) => opt.tc.versions.find((x) => lc(x.name) === lc(v.name))?.id).filter(Boolean))];
      await d.run('DELETE FROM "issue_versions" WHERE "issue_id" = ? AND "kind" = ?', [row.id, kind]);
      if (next.length) await d.insertMany('issue_versions', next.map((version_id) => ({ issue_id: row.id, version_id, kind })));
      hist.push({ field, from_value: vers.map((v) => v.id).join(','), to_value: next.join(',') || null, from_label: vers.map((v) => v.name).join(', '), to_label: next.map((id) => opt.tc.versions.find((x) => x.id === id).name).join(', ') || null });
    }

    // custom values: global fields stay; project fields go to the mapped / same-named field or are dropped
    const values = await d.all('SELECT v."field_id", v."value", f."project_id", f."name", f."type" FROM "custom_values" v JOIN "custom_fields" f ON f."id" = v."field_id" WHERE v."issue_id" = ?', [row.id]);
    for (const v of values) {
      if (v.project_id == null) continue;
      const has = Object.prototype.hasOwnProperty.call(opt.fieldMap, v.field_id);
      const target = has ? opt.tc.fields.find((f) => f.id === opt.fieldMap[v.field_id]) || null : defaultField(v, opt.tc);
      if (target && target.id === v.field_id) continue;
      const raw = parseJson(v.value);
      await d.run('DELETE FROM "custom_values" WHERE "issue_id" = ? AND "field_id" = ?', [row.id, v.field_id]);
      const fmt = (x) => (x == null ? null : Array.isArray(x) ? x.join(', ') : String(x));
      hist.push({ field: `custom:${v.field_id}`, from_value: v.value, to_value: null, from_label: fmt(raw), to_label: null });
      const mapped = target ? mapValue(target, raw) : undefined;
      if (mapped === undefined) continue;
      await d.run('DELETE FROM "custom_values" WHERE "issue_id" = ? AND "field_id" = ?', [row.id, target.id]);
      await d.insert('custom_values', { issue_id: row.id, field_id: target.id, value: JSON.stringify(mapped), ...customValueColumns(target, mapped) });
      hist.push({ field: `custom:${target.id}`, from_value: null, to_value: JSON.stringify(mapped), from_label: null, to_label: fmt(mapped) });
    }
    await writeHistory(d, row.id, ctx.user?.id, now, hist);
    return hist;
  }

  return {
    /** GET /issues/:id/move-project → the projects the issue can go to, with defaults and what would be lost. */
    async targets(ctx, idOrKey) {
      const issue = await S().issues.loadFor(ctx, idOrKey, 'member');
      const subs = await db().all('SELECT "id", "type_id", "status_id" FROM "issues" WHERE "parent_id" = ?', [issue.id]);
      const parts = await sourceParts([issue.id, ...subs.map((s) => s.id)]);
      const out = [];
      for (const p of await targetProjects(ctx, issue.project_id)) {
        const tc = await targetConfig(p.id);
        const pl = await plan(issue, subs, tc, parts);
        out.push({
          id: p.id, key: p.key, name: p.name, icon: p.icon, color: p.color,
          types: tc.types.map((t) => ({ id: t.id, name: t.name, icon: t.icon, color: t.color, level: levelOf(t) })),
          statuses: tc.statuses.map((s) => ({ id: s.id, name: s.name, category: s.category, color: s.color })),
          fields: tc.fields.map((f) => ({ id: f.id, name: f.name, type: f.type, projectId: f.project_id })),
          defaults: { typeId: pl.typeId, statusId: pl.statusId, subtaskTypeId: pl.subtaskTypeId, statusMap: pl.statusMap },
          lost: pl.lost,
          problem: subs.length && !pl.subtaskTypeId ? 'NO_SUBTASK_TYPE' : !pl.typeId ? 'NO_TYPE' : null,
        });
      }
      return {
        issue: { id: issue.id, key: issue.key, projectId: issue.project_id, typeId: issue.type_id, statusId: issue.status_id, parentId: issue.parent_id, subtaskCount: subs.length },
        projects: out,
      };
    },

    /**
     * POST /issues/:id/move-project { projectId | projectKey, typeId?, statusId?, subtaskTypeId?, statusMap? { fromStatusId: toStatusId },
     * fieldMap? { fieldId: targetFieldId | null }, components? 'keep' | 'clear', versions? 'keep' | 'clear', rev? }
     * → { issue, subtasks: [{ id, key, fromKey }], fromKey, fromProjectId }
     */
    async move(ctx, idOrKey, body = {}) {
      const issue = await S().issues.loadFor(ctx, idOrKey, 'member');
      check(!issue.parent_id, 'MOVE_SUBTASK', 'A subtask moves with its parent issue');
      const target = await S().projects.load(body.projectId || body.projectKey || '');
      await assertProject(db(), ctx, target.id, 'member');
      check(target.id !== issue.project_id, 'SAME_PROJECT', 'The issue is already in this project');
      check(!Number(target.archived), 'PROJECT_ARCHIVED', 'The target project is archived');
      const now = nowOf(ctx);
      const fromProjectId = issue.project_id;
      const result = await db().tx(async () => {
        if (body.rev != null) {
          const r = await db().run('UPDATE "issues" SET "rev" = "rev" WHERE "id" = ? AND "rev" = ?', [issue.id, Number(body.rev)]);
          if (!r.changes) throw new ConflictError('The issue was changed by someone else', toApi('issues', await S().issues.load(issue.id)));
        }
        const row = await S().issues.load(issue.id);
        const subs = await db().all('SELECT * FROM "issues" WHERE "parent_id" = ? ORDER BY "number"', [row.id]);
        const tc = await targetConfig(target.id);
        const pl = await plan(row, subs, tc, await sourceParts([row.id, ...subs.map((s) => s.id)]), body);
        const typeId = body.typeId || pl.typeId;
        const type = tc.types.find((t) => t.id === typeId);
        if (!type) throw new ValidationError('INVALID_TYPE', 'Unknown issue type in the target project', { field: 'typeId' });
        check(levelOf(type) !== 1, 'INVALID_TYPE', 'A subtask type needs a parent issue', { field: 'typeId' });
        const statusId = body.statusId || pl.statusId;
        if (!tc.statuses.some((s) => s.id === statusId)) throw new ValidationError('INVALID_STATUS', 'Unknown status in the target project', { field: 'statusId' });
        let subtaskTypeId = null;
        if (subs.length) {
          subtaskTypeId = body.subtaskTypeId || pl.subtaskTypeId;
          const st = tc.types.find((t) => t.id === subtaskTypeId);
          if (!st || levelOf(st) !== 1) throw new ValidationError('NO_SUBTASK_TYPE', 'The target project has no subtask type', { field: 'subtaskTypeId' });
        }
        const fieldMap = body.fieldMap && typeof body.fieldMap === 'object' ? body.fieldMap : {};
        for (const [from, to] of Object.entries(fieldMap)) {
          if (to != null && !tc.fields.some((f) => f.id === to)) throw new ValidationError('UNKNOWN_FIELD', `Unknown target field: ${to}`, { field: from });
        }
        const statusMap = { ...pl.statusMap, ...(body.statusMap || {}) };
        for (const sid of Object.values(statusMap)) if (sid && !tc.statuses.some((s) => s.id === sid)) throw new ValidationError('INVALID_STATUS', 'Unknown status in the target project', { field: 'statusMap' });
        const common = { tc, fieldMap, components: body.components === 'clear' ? 'clear' : 'keep', versions: body.versions === 'clear' ? 'clear' : 'keep' };

        // numbers: bump the target's counter once for all (the UPDATE locks the project row everywhere)
        await db().run('UPDATE "projects" SET "issue_seq" = "issue_seq" + ? WHERE "id" = ?', [1 + subs.length, target.id]);
        const last = Number(await db().value('SELECT "issue_seq" FROM "projects" WHERE "id" = ?', [target.id]));
        let number = last - subs.length;
        const epicId = levelOf(type) === -1 ? null : row.epic_id;
        const fromKey = row.key;
        const key = `${target.key}-${number}`;
        await relocate(ctx, row, target, { ...common, typeId, statusId, number, key, epicId: levelOf(type) === -1 ? null : undefined }, now);
        // an epic that is no longer one lets its children go
        let unlinked = [];
        if (levelOf(type) !== -1) {
          unlinked = (await db().all('SELECT "id" FROM "issues" WHERE "epic_id" = ? AND "parent_id" IS NULL', [row.id])).map((r) => r.id);
          const wasEpic = levelOf(await db().get('SELECT "level" FROM "issue_types" WHERE "id" = ?', [row.type_id])) === -1;
          if (wasEpic && unlinked.length) {
            await db().run('UPDATE "issues" SET "epic_id" = NULL WHERE "epic_id" = ?', [row.id]);
            for (const id of unlinked) await writeHistory(db(), id, ctx.user?.id, now, [{ field: 'epic', from_value: row.id, to_value: null, from_label: key, to_label: null }]);
          } else unlinked = [];
        }
        const moved = [];
        for (const s of subs) {
          number += 1;
          const sKey = `${target.key}-${number}`;
          const sStatus = statusMap[s.status_id] || pl.statusId || statusId;
          await relocate(ctx, s, target, { ...common, typeId: subtaskTypeId, statusId: sStatus, number, key: sKey, epicId }, now);
          moved.push({ id: s.id, key: sKey, fromKey: s.key });
        }
        return { id: row.id, fromKey, subtasks: moved, unlinked };
      });
      const out = await S().issues.full(ctx, await S().issues.load(result.id));
      const topics = (id) => [`project:${fromProjectId}`, `project:${target.id}`, `issue:${id}`];
      emit(core, ctx, 'issue.projectMoved', topics(out.id), { id: out.id, rev: out.rev, data: { ...out, fromProjectId, fromKey: result.fromKey } });
      for (const s of result.subtasks) {
        const sub = await S().issues.full(ctx, await S().issues.load(s.id));
        emit(core, ctx, 'issue.projectMoved', topics(s.id), { id: s.id, rev: sub.rev, data: { ...sub, fromProjectId, fromKey: s.fromKey } });
      }
      for (const id of result.unlinked) {
        const r = await S().issues.load(id);
        emit(core, ctx, 'issue.updated', [`project:${r.project_id}`, `issue:${id}`], { id, rev: r.rev, data: { ...(await S().issues.full(ctx, r)), changes: [{ field: 'epic', from: out.id, to: null }] } });
      }
      return { issue: out, fromKey: result.fromKey, fromProjectId, subtasks: result.subtasks };
    },
  };
}

// ───────────────────────── labels

/** Same normalisation as issue labels (issues.js): trimmed, inner spaces → '-'. Case is kept (labels are case-sensitive). */
export const normLabel = (l) => String(l ?? '').trim().replace(/\s+/g, '-');

export function createLabels(core) {
  const db = () => core.db;

  /** Scope: a project (its admins) or every project (global admins). */
  async function scopeOf(ctx, projectId, need = 'admin') {
    requireUser(ctx);
    if (projectId == null) {
      if (need === 'viewer') return { pid: null, sql: '', params: [], ids: await accessibleProjectIds(db(), ctx) };
      requireAdmin(ctx);
      return { pid: null, sql: '', params: [] };
    }
    const p = await core.services.projects.load(projectId);
    await assertProject(db(), ctx, p.id, need);
    return { pid: p.id, sql: ' AND "issue_id" IN (SELECT "id" FROM "issues" WHERE "project_id" = ?)', params: [p.id] };
  }

  /** Issues of the scope that carry `label`: [{ issue_id, project_id }]. */
  async function carriers(scope, label) {
    return db().all(`SELECT l."issue_id", i."project_id" FROM "issue_labels" l JOIN "issues" i ON i."id" = l."issue_id" WHERE l."label" = ?${scope.pid ? ' AND i."project_id" = ?' : ''}`, scope.pid ? [label, scope.pid] : [label]);
  }

  /** The labels of a set of issues: { issueId: [labels sorted] }. */
  async function labelsOf(ids) {
    const by = Object.fromEntries(ids.map((id) => [id, []]));
    for (const part of chunks(ids)) {
      for (const r of await db().all(`SELECT "issue_id", "label" FROM "issue_labels" WHERE "issue_id" IN (${ph(part)})`, part)) by[r.issue_id].push(r.label);
    }
    for (const k of Object.keys(by)) by[k].sort();
    return by;
  }

  /** History ('labels', space separated as everywhere) + rev/updated_at bump of the changed issues. */
  async function finish(ctx, before, now) {
    const ids = Object.keys(before);
    const after = await labelsOf(ids);
    const rows = [];
    const changed = [];
    for (const id of ids) {
      const a = before[id].join(' ');
      const b = after[id].join(' ');
      if (a === b) continue;
      changed.push(id);
      rows.push({ id: newId(), issue_id: id, user_id: ctx.user?.id || null, field: 'labels', from_value: a || null, to_value: b || null, from_label: null, to_label: null, at: now });
    }
    if (rows.length) await db().insertMany('issue_history', rows);
    for (const part of chunks(changed)) await db().run(`UPDATE "issues" SET "updated_at" = ?, "rev" = "rev" + 1 WHERE "id" IN (${ph(part)})`, [now, ...part]);
    return changed;
  }

  /** One event per affected project (+ the issue topics when there are few, so open detail panels refresh). */
  function announce(ctx, type, byProject, data) {
    for (const [pid, ids] of byProject) {
      const topics = [`project:${pid}`, ...(ids.length <= 200 ? ids.map((id) => `issue:${id}`) : [])];
      emit(core, ctx, type, topics, { data: { ...data, projectId: pid, count: ids.length, issueIds: ids.length <= 200 ? ids : undefined } });
    }
  }
  const groupByProject = (rows, keep = null) => {
    const m = new Map();
    for (const r of rows) if (!keep || keep.has(r.issue_id)) (m.get(r.project_id) || m.set(r.project_id, []).get(r.project_id)).push(r.issue_id);
    return m;
  };

  return {
    /** GET /projects/:id/labels | /labels → [{ label, count }] (non-archived and archived issues alike). */
    async list(ctx, projectId = null) {
      const scope = await scopeOf(ctx, projectId, 'viewer');
      let where = '';
      let params = [];
      if (scope.pid) { where = ' WHERE i."project_id" = ?'; params = [scope.pid]; } else if (scope.ids) {
        if (!scope.ids.length) return [];
        where = ` WHERE i."project_id" IN (${ph(scope.ids)})`; params = scope.ids;
      }
      const rows = await db().all(`SELECT l."label", COUNT(*) AS n FROM "issue_labels" l JOIN "issues" i ON i."id" = l."issue_id"${where} GROUP BY l."label" ORDER BY l."label"`, params);
      return rows.map((r) => ({ label: r.label, count: Number(r.n) }));
    },

    /**
     * POST …/labels/rename { from, to } — `to` already used in the scope = a merge (issues with both keep one).
     * → { from, to, merged, count, issueIds, addedIds (issues that got `to` — undo removes it from them) }
     */
    async rename(ctx, projectId, body = {}) {
      const scope = await scopeOf(ctx, projectId);
      const from = String(body.from ?? '');
      check(from.trim(), 'REQUIRED', 'from is required', { field: 'from' });
      const to = normLabel(body.to);
      check(to, 'REQUIRED', 'to is required', { field: 'to' });
      check(to.length <= 100, 'TOO_LONG', 'labels are at most 100 characters', { field: 'to', max: 100 });
      check(to !== from, 'SAME_LABEL', 'The new name is the same', { field: 'to' });
      const now = nowOf(ctx);
      const out = await db().tx(async () => {
        const rows = await carriers(scope, from);
        if (!rows.length) throw new NotFoundError('LABEL_NOT_FOUND', `No issue has the label ${from}`);
        const ids = rows.map((r) => r.issue_id);
        const before = await labelsOf(ids);
        const both = ids.filter((id) => before[id].includes(to));
        const merged = both.length > 0 || (await carriers(scope, to)).length > 0;
        // issues with both keep `to`; the others get `from` renamed (one statement)
        for (const part of chunks(both)) await db().run(`DELETE FROM "issue_labels" WHERE "label" = ? AND "issue_id" IN (${ph(part)})`, [from, ...part]);
        await db().run(`UPDATE "issue_labels" SET "label" = ? WHERE "label" = ?${scope.sql}`, [to, from, ...scope.params]);
        await finish(ctx, before, now);
        const bothSet = new Set(both);
        return { rows, ids, merged, addedIds: ids.filter((id) => !bothSet.has(id)) };
      });
      announce(ctx, 'label.renamed', groupByProject(out.rows), { from, to, merged: out.merged });
      return { from, to, merged: out.merged, count: out.ids.length, issueIds: out.ids, addedIds: out.addedIds };
    },

    /** DELETE …/labels/:label → { label, count, issueIds } */
    async remove(ctx, projectId, label) {
      const scope = await scopeOf(ctx, projectId);
      const name = String(label ?? '');
      check(name.trim(), 'REQUIRED', 'label is required', { field: 'label' });
      const now = nowOf(ctx);
      const out = await db().tx(async () => {
        const rows = await carriers(scope, name);
        if (!rows.length) throw new NotFoundError('LABEL_NOT_FOUND', `No issue has the label ${name}`);
        const before = await labelsOf(rows.map((r) => r.issue_id));
        await db().run(`DELETE FROM "issue_labels" WHERE "label" = ?${scope.sql}`, [name, ...scope.params]);
        await finish(ctx, before, now);
        return rows;
      });
      announce(ctx, 'label.deleted', groupByProject(out), { label: name });
      return { label: name, count: out.length, issueIds: out.map((r) => r.issue_id) };
    },

    /**
     * POST …/labels/apply { changes: [{ label, add?: [issueIds], remove?: [issueIds] }] } — adds / removes one label on
     * given issues (the undo of rename / merge / delete). → { count }
     */
    async apply(ctx, projectId, body = {}) {
      const scope = await scopeOf(ctx, projectId);
      const changes = Array.isArray(body.changes) ? body.changes : [];
      check(changes.length, 'REQUIRED', 'changes is required', { field: 'changes' });
      const all = [...new Set(changes.flatMap((c) => [...(c.add || []), ...(c.remove || [])]))];
      check(all.length <= 20000, 'TOO_MANY', 'At most 20000 issues at once');
      const now = nowOf(ctx);
      const out = await db().tx(async () => {
        const rows = [];
        for (const part of chunks(all)) {
          rows.push(...(await db().all(`SELECT "id" AS "issue_id", "project_id" FROM "issues" WHERE "id" IN (${ph(part)})${scope.pid ? ' AND "project_id" = ?' : ''}`, scope.pid ? [...part, scope.pid] : part)));
        }
        const known = new Set(rows.map((r) => r.issue_id));
        const before = await labelsOf([...known]);
        for (const c of changes) {
          const label = normLabel(c.label);
          check(label && label.length <= 100, 'INVALID_LABEL', 'A label is 1-100 characters', { field: 'label' });
          const add = [...new Set(c.add || [])].filter((id) => known.has(id) && !before[id].includes(label));
          if (add.length) await db().insertMany('issue_labels', add.map((issue_id) => ({ issue_id, label })));
          for (const part of chunks([...new Set(c.remove || [])].filter((id) => known.has(id)))) {
            await db().run(`DELETE FROM "issue_labels" WHERE "label" = ? AND "issue_id" IN (${ph(part)})`, [label, ...part]);
          }
        }
        const changed = new Set(await finish(ctx, before, now));
        return { rows, changed };
      });
      announce(ctx, 'label.applied', groupByProject(out.rows, out.changed), {});
      return { count: out.changed.size };
    },
  };
}

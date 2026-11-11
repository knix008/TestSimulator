// Import a card-board JSON export (the format of a popular list/card board service):
//   lists → statuses + board columns, cards → issues (labels, due date, cover colour, members, checklists,
//   comments), closed cards → archived issues.
import { newId } from '../../ids.js';
import * as rank from '../../rank.js';
import { check } from '../../errors.js';
import { nowOf, toApi, emit, today } from '../common.js';
import { CATEGORY_COLOR } from '../templates.js';
import { writeHistory } from '../history.js';
import { projectKeyOwner } from '../relocation.js';
import { defaultColumnIcon } from '../../columnicons.js';

const COLORS = { green: '#61bd4f', yellow: '#f2d600', orange: '#ff9f1a', red: '#eb5a46', purple: '#c377e0', blue: '#0079bf', sky: '#00c2e0', lime: '#51e898', pink: '#ff78cb', black: '#344563' };
const DONE_RE = /\b(done|complete[d]?|finished|closed|shipped|released)\b|완료|끝/i;
const TODO_RE = /\b(to ?do|backlog|ideas?|inbox|later|someday)\b|할 ?일|백로그|아이디어/i;

/** Creation time encoded in the first 8 hex digits of the service's ids. */
const idTime = (id) => (/^[0-9a-f]{24}$/i.test(id || '') ? parseInt(id.slice(0, 8), 16) * 1000 : null);

function keyFrom(name) {
  const letters = String(name || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
  let k = letters.length > 1 ? letters.map((w) => w[0]).join('') : (letters[0] || '');
  k = k.replace(/^[0-9]+/, '').slice(0, 6);
  return k.length >= 2 ? k : 'BRD';
}

/**
 * @param {object} core
 * @param {object} ctx
 * @param {object} data the board JSON
 * @param {{ key?: string, name?: string }} opts
 */
export async function importCardBoard(core, ctx, data, opts = {}) {
  check(data && Array.isArray(data.lists) && Array.isArray(data.cards), 'INVALID_FILE', 'This is not a board JSON export (lists and cards are missing)');
  const db = core.db;
  const S = core.services;
  const now = nowOf(ctx);
  let key = String(opts.key || keyFrom(data.name)).toUpperCase();
  for (let n = 2; await projectKeyOwner(db, key); n++) key = keyFrom(data.name).slice(0, 10 - String(n).length) + n;

  const lists = data.lists.filter((l) => !l.closed).sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0));
  check(lists.length > 0, 'INVALID_FILE', 'The board has no open lists');
  const created = await S.projects.create(ctx, { key, name: opts.name || data.name || key, description: data.desc || null, template: 'simple', icon: 'b:layers' });
  const pid = created.id;
  const boardId = created.boardId;

  const result = await db.tx(async () => {
    // replace the template's statuses / transitions / columns with the board's lists
    const wf = await db.get('SELECT * FROM "workflows" WHERE "project_id" = ?', [pid]);
    await db.remove('transitions', { workflow_id: wf.id });
    await db.remove('statuses', { project_id: pid });
    await db.remove('board_columns', { board_id: boardId });
    const statusOf = {};
    const lastIdx = lists.length - 1;
    for (const [i, l] of lists.entries()) {
      const category = DONE_RE.test(l.name) || (i === lastIdx && lists.length > 1 && !TODO_RE.test(l.name)) ? 'done' : i === 0 || TODO_RE.test(l.name) ? 'todo' : 'inprogress';
      const st = await db.insert('statuses', { id: newId(), project_id: pid, name: String(l.name).slice(0, 100), category, color: CATEGORY_COLOR[category], position: i, created_at: now, updated_at: now });
      statusOf[l.id] = st;
      await db.insert('transitions', { id: newId(), workflow_id: wf.id, name: st.name, from_status_id: null, to_status_id: st.id, rules: { conditions: [], validators: [], postFunctions: [] }, position: i, created_at: now, updated_at: now });
      await db.insert('board_columns', { id: newId(), board_id: boardId, name: st.name, icon: defaultColumnIcon(st.name, category), position: i, status_ids: [st.id], created_at: now, updated_at: now });
    }
    await db.update('workflows', wf.id, { initial_status_id: statusOf[lists[0].id].id });
    const settings = { ...(JSON.parse((await db.get('SELECT "settings" FROM "boards" WHERE "id" = ?', [boardId])).settings)), backlog: { enabled: false, statusIds: [] }, doneHideDays: null };
    await db.update('boards', boardId, { settings });

    // members → users (by username; unknown ones are created inactive so names survive)
    const userOf = {};
    for (const m of data.members || []) {
      const username = String(m.username || m.id).toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 64) || `user${Object.keys(userOf).length + 1}`;
      let u = await db.get('SELECT "id" FROM "users" WHERE "username" = ?', [username]);
      if (!u) {
        u = { id: newId() };
        await db.insert('users', { id: u.id, username, display_name: m.fullName || username, role: 'user', active: 0, created_at: now, updated_at: now });
      }
      userOf[m.id] = u.id;
    }
    const memberOf = (id) => userOf[id] || null;

    const task = await db.get('SELECT "id" FROM "issue_types" WHERE "project_id" = ? AND "level" = 0 ORDER BY "position"', [pid]);
    const prio = await db.value('SELECT "id" FROM "priorities" WHERE LOWER("name") = ?', ['medium']);
    const doneRes = await db.value('SELECT "id" FROM "resolutions" ORDER BY "position"');
    const listPos = Object.fromEntries(lists.map((l, i) => [l.id, i]));
    const cards = data.cards.filter((c) => c.idList in listPos || c.closed)
      .sort((a, b) => (listPos[a.idList] ?? 999) - (listPos[b.idList] ?? 999) || (a.pos ?? 0) - (b.pos ?? 0));
    const keys = rank.initial(cards.length);
    const maxRank = await db.value('SELECT MAX("rank") AS r FROM "issues" WHERE "project_id" <> ?', [pid]);
    let number = 0;
    const issueOf = {};
    for (const [i, c] of cards.entries()) {
      const st = statusOf[c.idList] || statusOf[lists[0].id];
      const at = idTime(c.id) || (c.dateLastActivity ? Date.parse(c.dateLastActivity) : now);
      const labels = (c.labels || []).map((l) => (l.name || l.color || '').trim().replace(/\s+/g, '-')).filter(Boolean);
      const color = c.cover?.color ? COLORS[c.cover.color] || null : null;
      number++;
      const id = newId();
      const done = st.category === 'done';
      await db.insert('issues', {
        id, project_id: pid, number, key: `${key}-${number}`, type_id: task.id, status_id: st.id, priority_id: prio, summary: String(c.name || '(untitled)').slice(0, 500),
        description: c.desc || null, assignee_id: memberOf((c.idMembers || [])[0]), reporter_id: ctx.user?.id || null, due_date: c.due ? today(Date.parse(c.due)) : null,
        rank: maxRank ? rank.between(maxRank, null) + keys[i] : keys[i], color, cover: color ? { color } : null, archived: c.closed ? 1 : 0,
        resolution_id: done ? doneRes : null, resolved_at: done ? at : null, status_changed_at: at, time_spent: 0, created_at: at, updated_at: at,
      });
      issueOf[c.id] = { id, at };
      if (labels.length) await db.insertMany('issue_labels', [...new Set(labels)].map((label) => ({ issue_id: id, label: label.slice(0, 100) })));
      await writeHistory(db, id, ctx.user?.id, at, [{ field: 'created', to_value: st.id, to_label: st.name }]);
    }
    await db.run('UPDATE "projects" SET "issue_seq" = ? WHERE "id" = ?', [number, pid]);

    let checklistCount = 0;
    for (const cl of data.checklists || []) {
      const iss = issueOf[cl.idCard];
      if (!iss) continue;
      const items = [...(cl.checkItems || [])].sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0));
      const existing = await db.value('SELECT MAX("position") AS p FROM "checklist_items" WHERE "issue_id" = ?', [iss.id]);
      let pos = existing || null;
      for (const it of items) {
        pos = rank.between(pos, null);
        await db.insert('checklist_items', { id: newId(), issue_id: iss.id, text: String(it.name || '').slice(0, 500) || '-', done: it.state === 'complete' ? 1 : 0, position: pos, created_at: iss.at, updated_at: iss.at });
        checklistCount++;
      }
    }
    let commentCount = 0;
    for (const a of data.actions || []) {
      if (a.type !== 'commentCard' || !a.data?.card?.id) continue;
      const iss = issueOf[a.data.card.id];
      if (!iss || !a.data.text) continue;
      const at = Date.parse(a.date) || now;
      await db.insert('comments', { id: newId(), issue_id: iss.id, author_id: memberOf(a.idMemberCreator || a.memberCreator?.id) || ctx.user?.id || null, body: a.data.text, created_at: at, updated_at: at });
      commentCount++;
    }
    return { issues: number, checklistItems: checklistCount, comments: commentCount };
  });
  const project = await db.get('SELECT * FROM "projects" WHERE "id" = ?', [pid]);
  emit(core, ctx, 'project.updated', [`project:${pid}`, 'projects'], { id: pid, data: toApi('projects', project) });
  return { ...toApi('projects', project), boardId, imported: result };
}

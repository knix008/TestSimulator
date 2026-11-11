// The full integration suite, run against every configured database (SQLite and PostgreSQL/PGlite always;
// MySQL, MariaDB, SQL Server when MYBOARD_TEST_* URLs are set): migrate, every service, JQL through SQL and in
// memory, reports from history, automation, notifications, import/export, optimistic locking, DB copy.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCore } from '../../core/app.js';
import { migrate } from '../../core/db/migrate.js';
import { openDatabase } from '../../core/db/index.js';
import { TABLES } from '../../core/db/schema.js';
import { createMatcher } from '../../core/jql/index.js';
import { TARGETS, freshConfig, configured, skipMessage, rejectsCode, dayAt } from './helpers/targets.js';

const DAY = 86400000;
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201f8b36a8b0000000049454e44ae426082', 'hex');

for (const target of TARGETS) {
  if (!configured(target)) {
    test(`${target.name} integration`, (t) => t.skip(skipMessage(target)));
    continue;
  }
  describe(`${target.name} integration`, () => suite(target));
}

function suite(target) {
  let core; let S; let admin; let alice; let bob; let A; let ALICE; let BOB;
  let proj; let cfg; let byName;

  before(async () => {
    core = await createCore({ db: await freshConfig(target), scheduler: false });
    S = core.services;
  });
  after(async () => { if (core) await core.close(); });

  test('migrate is idempotent and seeds global lists', async () => {
    const again = await migrate(core.db);
    assert.equal(again.from, 1);
    assert.deepEqual(again.created, []);
    assert.equal(await core.db.count('priorities'), 5);
    assert.equal(await core.db.count('resolutions'), 3);
  });

  test('users, passwords and sessions', async () => {
    admin = await S.users.create({ system: true }, { username: 'Admin', displayName: 'Admin', password: 'admin-pw', role: 'admin', avatar: 'l:AD#3366ff' }, { bootstrap: true });
    assert.equal(admin.username, 'admin');
    assert.equal(admin.passwordHash, undefined);
    A = { user: { id: admin.id, role: 'admin', username: 'admin' } };
    alice = await S.users.create(A, { username: 'alice', displayName: 'Alice Kim', password: 'alice-pw', email: 'alice@example.com' });
    bob = await S.users.create(A, { username: 'bob', displayName: 'Bob Lee', password: 'bob-pw' });
    ALICE = { user: { id: alice.id, role: 'user', username: 'alice' } };
    BOB = { user: { id: bob.id, role: 'user', username: 'bob' } };
    await rejectsCode(assert, S.users.create(A, { username: 'alice', displayName: 'x' }), 'USERNAME_TAKEN', 409);
    await rejectsCode(assert, S.users.create(ALICE, { username: 'carol', displayName: 'x' }), 'ADMIN_REQUIRED', 403);
    await rejectsCode(assert, S.users.create(A, { username: 'bad name', displayName: 'x' }), 'INVALID_USERNAME', 400);
    const s = await S.users.login({ username: 'alice@example.com', password: 'alice-pw' });
    assert.equal(s.user.id, alice.id);
    assert.equal((await S.users.sessionUser(s.token)).id, alice.id);
    await rejectsCode(assert, S.users.login({ username: 'alice', password: 'nope' }), 'BAD_LOGIN', 401);
    await rejectsCode(assert, S.users.setPassword(ALICE, { currentPassword: 'wrong', newPassword: 'new-pw' }), 'WRONG_PASSWORD');
    await S.users.setPassword(ALICE, { currentPassword: 'alice-pw', newPassword: 'alice-pw2' });
    await S.users.login({ username: 'alice', password: 'alice-pw2' });
    await S.users.logout(s.token);
    assert.equal(await S.users.sessionUser(s.token), null);
    const fresh = await S.users.get(ALICE, alice.id);
    assert.equal(fresh.rev, alice.rev + 1, 'the password change bumped rev');
    await rejectsCode(assert, S.users.update(ALICE, alice.id, { displayName: 'x', rev: alice.rev }), 'CONFLICT', 409);
    const upd = await S.users.update(ALICE, alice.id, { displayName: 'Alice K.', role: 'admin', rev: fresh.rev });
    assert.equal(upd.displayName, 'Alice K.');
    assert.equal(upd.role, 'user', 'users cannot promote themselves');
    await rejectsCode(assert, S.users.remove(A, admin.id), 'LAST_ADMIN', 403);
    assert.equal(await S.users.needsLogin(), true);
  });

  test('projects from templates, keys, members and access', async () => {
    proj = await S.projects.create(A, { key: 'shop', name: 'Shop', template: 'software', icon: 'e:🛒', color: '#3366ff' });
    assert.equal(proj.key, 'SHOP');
    assert.ok(proj.boardId);
    await rejectsCode(assert, S.projects.create(A, { key: 'SHOP', name: 'x' }), 'PROJECT_KEY_TAKEN', 409);
    await rejectsCode(assert, S.projects.create(A, { key: '1A', name: 'x' }), 'INVALID_PROJECT_KEY');
    await rejectsCode(assert, S.projects.create(A, { key: 'ZZ', name: 'x', template: 'nope' }), 'INVALID_TEMPLATE');
    for (const [key, template, statuses, types] of [['KB', 'kanban', 4, 5], ['BUGS', 'bugs', 4, 4], ['ME', 'simple', 3, 2]]) {
      const p = await S.projects.create(A, { key, name: key, template });
      const c = await S.projects.config(A, p.id);
      assert.equal(c.statuses.length, statuses, `${template} statuses`);
      assert.equal(c.types.length, types, `${template} types`);
      assert.equal(c.boards.length, 1);
    }
    cfg = await S.projects.config(A, 'SHOP');
    assert.deepEqual(cfg.statuses.map((s) => s.name), ['Backlog', 'To Do', 'In Progress', 'In Review', 'Done']);
    assert.equal(cfg.workflows[0].transitions.length, 5);
    byName = (list, name) => cfg[list].find((x) => x.name === name);

    // bob is not a member: the project does not exist for him
    await rejectsCode(assert, S.projects.get(BOB, proj.id), 'PROJECT_NOT_FOUND', 404);
    assert.ok(!(await S.projects.list(BOB)).some((p) => p.id === proj.id));
    await S.projects.setMember(A, proj.id, { userId: bob.id, role: 'viewer' });
    await S.projects.setMember(A, proj.id, { userId: alice.id, role: 'member' });
    assert.equal((await S.projects.get(BOB, proj.id)).myRole, 'viewer');
    await rejectsCode(assert, S.issues.create(BOB, { projectId: proj.id, summary: 'nope' }), 'PROJECT_PERMISSION', 403);
    await rejectsCode(assert, S.projects.update(ALICE, proj.id, { name: 'x' }), 'PROJECT_PERMISSION', 403);
    await rejectsCode(assert, S.projects.removeMember(A, proj.id, admin.id), 'LAST_PROJECT_ADMIN');
    const members = await S.projects.members(A, proj.id);
    assert.deepEqual(members.map((m) => m.username).sort(), ['admin', 'alice', 'bob']);
    const up = await S.projects.update(A, proj.id, { description: 'The **shop**', rev: proj.rev });
    assert.equal(up.description, 'The **shop**');
    await rejectsCode(assert, S.projects.update(A, proj.id, { description: 'stale', rev: proj.rev }), 'CONFLICT', 409);
  });

  let comps; let vers; let fImpact; let fValue; let fTags; let fOwner;
  test('configuration entities', async () => {
    comps = { api: await S.components.create(A, proj.id, { name: 'API', icon: 'b:code' }), web: await S.components.create(A, proj.id, { name: 'Web', icon: 'b:globe' }) };
    vers = { v1: await S.versions.create(A, proj.id, { name: '1.0', releaseDate: '2026-10-01' }), v2: await S.versions.create(A, proj.id, { name: '2.0' }) };
    assert.equal(vers.v2.position, 1);
    await rejectsCode(assert, S.versions.create(A, proj.id, { name: 'bad', releaseDate: '01/02/2026' }), 'INVALID_DATE');
    fImpact = await S.fields.create(A, proj.id, { name: 'Customer impact', type: 'select', options: ['Low', 'High'] });
    assert.equal(fImpact.options.length, 2);
    assert.ok(fImpact.options[0].id);
    fValue = await S.fields.create(A, proj.id, { name: 'Business value', type: 'number' });
    fTags = await S.fields.create(A, proj.id, { name: 'Platforms', type: 'multiselect', options: [{ value: 'iOS' }, { value: 'Android' }] });
    fOwner = await S.fields.create(A, proj.id, { name: 'Owner', type: 'user' });
    await rejectsCode(assert, S.fields.create(A, proj.id, { name: 'customer IMPACT', type: 'text' }), 'FIELD_NAME_TAKEN');
    await rejectsCode(assert, S.fields.create(A, proj.id, { name: 'X', type: 'weird' }), 'INVALID_FIELD_TYPE');
    await rejectsCode(assert, S.fields.update(A, fValue.id, { type: 'text' }), 'FIELD_TYPE_IMMUTABLE');
    // a new status gets a global transition in the open workflow
    const qa = await S.statuses.create(A, proj.id, { name: 'QA', category: 'inprogress' });
    const c2 = await S.projects.config(A, proj.id);
    assert.ok(c2.workflows[0].transitions.some((t) => t.toStatusId === qa.id && t.fromStatusId === null));
    await rejectsCode(assert, S.statuses.create(A, proj.id, { name: 'Bad', category: 'later' }), 'INVALID_CATEGORY');
    await S.statuses.remove(A, qa.id);
    const t = await S.types.create(A, proj.id, { name: 'Spike', icon: 'b:lightning', level: 0 });
    assert.ok(t.workflowId);
    const re = await S.types.reorder(A, proj.id, [t.id, ...cfg.types.map((x) => x.id)]);
    assert.equal(re[0].id, t.id);
    await S.types.remove(A, t.id);
    const comp = await S.components.update(A, comps.api.id, { description: 'Backend', rev: comps.api.rev });
    await rejectsCode(assert, S.components.update(A, comps.api.id, { description: 'stale', rev: comps.api.rev }), 'CONFLICT', 409);
    comps.api = comp;
    const prios = await S.priorities.list(ALICE);
    assert.deepEqual(prios.map((p) => p.name), ['Highest', 'High', 'Medium', 'Low', 'Lowest']);
    await rejectsCode(assert, S.priorities.create(ALICE, null, { name: 'Urgent' }), 'ADMIN_REQUIRED', 403);
    cfg = await S.projects.config(A, proj.id);
  });

  const iss = {};
  test('issues: create, keys, hierarchy, custom fields, history', async () => {
    const type = (n) => byName('types', n).id;
    iss.epic = await S.issues.create(A, { projectId: proj.id, typeId: type('Epic'), summary: 'Checkout', color: '#904ee2', icon: 'b:rocket' });
    iss.story = await S.issues.create(ALICE, {
      projectKey: 'SHOP', typeId: type('Story'), summary: 'Login with email', description: 'As a *user*…', epicId: iss.epic.id,
      labels: ['frontend', 'auth', 'frontend'], componentIds: [comps.web.id], fixVersionIds: [vers.v1.id], storyPoints: 5, dueDate: '2026-12-01',
      custom: { 'Customer impact': 'high', [fValue.id]: 8, [fTags.id]: ['iOS', 'Android'], [fOwner.id]: bob.id }, assigneeId: alice.id,
      checklist: ['design', { text: 'build', done: true }], cover: { color: '#ffcc00' },
    });
    iss.bug = await S.issues.create(A, { projectId: proj.id, typeId: type('Bug'), summary: 'Crash on login', priorityId: byName('priorities', 'Highest').id, labels: ['backend'], componentIds: [comps.api.id], affectedVersionIds: [vers.v1.id], flagged: true });
    iss.task = await S.issues.create(A, { projectId: proj.id, summary: 'Write docs' });
    assert.deepEqual([iss.epic.key, iss.story.key, iss.bug.key, iss.task.key], ['SHOP-1', 'SHOP-2', 'SHOP-3', 'SHOP-4']);
    assert.equal(iss.task.typeId, type('Epic') === cfg.types[0].id ? cfg.types[1].id : cfg.types[0].id, 'default type is the first standard one');
    assert.equal(iss.story.statusId, byName('statuses', 'Backlog').id, 'initial status');
    assert.equal(iss.story.priorityId, byName('priorities', 'Medium').id, 'default priority');
    assert.deepEqual(iss.story.labels, ['auth', 'frontend']);
    assert.deepEqual(iss.story.custom[fImpact.id], 'High');
    assert.deepEqual(iss.story.custom[fTags.id], ['iOS', 'Android']);
    assert.equal(iss.story.checklist.length, 2);
    assert.equal(iss.story.epic.key, 'SHOP-1');
    assert.equal(iss.story.reporterId, alice.id);
    assert.deepEqual(iss.story.cover, { color: '#ffcc00' });
    assert.ok(iss.story.rank > iss.epic.rank);
    await rejectsCode(assert, S.issues.create(A, { projectId: proj.id, typeId: type('Subtask'), summary: 'orphan' }), 'PARENT_REQUIRED');
    await rejectsCode(assert, S.issues.create(A, { projectId: proj.id, summary: 'x', epicId: iss.bug.id }), 'INVALID_EPIC');
    await rejectsCode(assert, S.issues.create(A, { projectId: proj.id, summary: 'x', custom: { 'Customer impact': 'Huge' } }), 'INVALID_OPTION');
    await rejectsCode(assert, S.issues.create(A, { projectId: proj.id, summary: '' }), 'REQUIRED');
    await rejectsCode(assert, S.issues.create(A, { projectId: proj.id, summary: 'x', dueDate: 'tomorrow' }), 'INVALID_DATE');
    iss.sub = await S.issues.create(A, { projectId: proj.id, typeId: type('Subtask'), summary: 'Form validation', parentId: iss.story.id });
    assert.equal(iss.sub.epicId, iss.epic.id, 'subtasks inherit the epic');
    await rejectsCode(assert, S.issues.create(A, { projectId: proj.id, typeId: type('Subtask'), summary: 'x', parentId: iss.sub.id }), 'INVALID_PARENT');
    const story = await S.issues.get(A, 'shop-2');
    assert.equal(story.subtasks.length, 1);
    assert.equal(story.watcherCount, 1, 'reporter = assignee watches once');

    // update with history
    const u = await S.issues.update(A, iss.story.id, { summary: 'Login with e-mail', labels: ['auth'], storyPoints: 8, custom: { [fValue.id]: 13 }, fixVersionIds: [vers.v2.id], rev: story.rev });
    assert.equal(u.rev, story.rev + 1);
    const hist = await S.history.list(A, iss.story.id);
    const fields = hist.map((h) => h.field);
    for (const f of ['created', 'summary', 'storyPoints', 'labels', 'fixVersions', `custom:${fValue.id}`]) assert.ok(fields.includes(f), f);
    const fv = hist.find((h) => h.field === 'fixVersions');
    assert.equal(fv.fromLabel, '1.0');
    assert.equal(fv.toLabel, '2.0');
    // stale rev → 409 with the current row
    const err = await rejectsCode(assert, S.issues.update(A, iss.story.id, { summary: 'stale', rev: story.rev }), 'CONFLICT', 409);
    assert.equal(err.details.current.rev, u.rev);
    assert.equal(err.details.current.summary, 'Login with e-mail');
    iss.story = u;
    // no-op update writes no history
    const before = (await S.history.list(A, iss.story.id)).length;
    await S.issues.update(A, iss.story.id, { summary: 'Login with e-mail' });
    assert.equal((await S.history.list(A, iss.story.id)).length, before);
  });

  test('transitions: resolution follows Done; workflow rules (conditions, validators, post functions)', async () => {
    const st = (n) => byName('statuses', n).id;
    const done = await S.issues.transition(ALICE, iss.task.id, { statusId: st('Done'), comment: 'finished' });
    assert.equal(done.resolutionId, byName('resolutions', 'Done').id);
    assert.ok(done.resolvedAt);
    const res = await S.issues.transition(A, iss.task.id, { statusId: st('Done') });
    assert.equal(res.rev, done.rev, 'same status: no change');
    const reopened = await S.issues.transition(A, iss.task.id, { statusId: st('To Do') });
    assert.equal(reopened.resolutionId, null);
    assert.equal(reopened.resolvedAt, null);
    const wont = await S.issues.transition(A, iss.task.id, { statusId: st('Done'), resolutionId: byName('resolutions', "Won't Do").id });
    assert.equal(wont.resolutionId, byName('resolutions', "Won't Do").id);
    assert.equal((await S.comments.list(A, iss.task.id)).length, 1);

    // the bug tracker workflow restricts transitions
    const bc = await S.projects.config(A, 'BUGS');
    const bst = (n) => bc.statuses.find((s) => s.name === n).id;
    const wf = bc.workflows[0];
    const tr = (name, from) => wf.transitions.find((t) => t.name === name && t.fromStatusId === bst(from));
    const bug = await S.issues.create(A, { projectId: bc.project.id, summary: 'Broken button' });
    const e = await rejectsCode(assert, S.issues.transition(A, bug.id, { statusId: bst('Closed') }), 'TRANSITION_NOT_ALLOWED');
    assert.deepEqual(e.details.available.map((x) => x.name).sort(), ['Resolve', 'Start progress']);
    await S.transitions.update(A, tr('Start progress', 'Open').id, { rules: { conditions: [{ type: 'onlyAssignee' }], validators: [], postFunctions: [] } });
    await S.transitions.update(A, tr('Resolve', 'Open').id, { rules: { conditions: [], validators: [{ type: 'fieldRequired', field: 'assignee' }, { type: 'commentRequired' }], postFunctions: [{ type: 'addLabel', label: 'resolved' }] } });
    await rejectsCode(assert, S.transitions.update(A, tr('Close', 'Resolved').id, { rules: { conditions: [{ type: 'magic' }] } }), 'INVALID_RULES');
    await S.projects.setMember(A, bc.project.id, { userId: alice.id, role: 'member' });
    await rejectsCode(assert, S.issues.transition(ALICE, bug.id, { statusId: bst('In Progress') }), 'CONDITION_ASSIGNEE', 403);
    const list = await S.issues.transitions(ALICE, bug.id);
    assert.equal(list.find((t) => t.name === 'Start progress').available, false);
    await rejectsCode(assert, S.issues.transition(A, bug.id, { transitionId: tr('Resolve', 'Open').id, comment: 'x' }), 'VALIDATOR_FIELD_REQUIRED');
    await rejectsCode(assert, S.issues.transition(A, bug.id, { transitionId: tr('Resolve', 'Open').id, fields: { assigneeId: bob.id } }), 'VALIDATOR_COMMENT_REQUIRED');
    const resolved = await S.issues.transition(A, bug.id, { transitionId: tr('Resolve', 'Open').id, fields: { assigneeId: bob.id }, comment: 'fixed in build 7' });
    assert.equal(resolved.statusId, bst('Resolved'));
    assert.equal(resolved.assigneeId, bob.id);
    assert.deepEqual(resolved.labels, ['resolved']);
    assert.ok(resolved.resolutionId);
    await S.transitions.update(A, tr('Reopen', 'Resolved').id, { rules: { conditions: [], validators: [], postFunctions: [{ type: 'assignToCurrentUser' }] } });
    const re = await S.issues.transition(ALICE, bug.id, { transitionId: tr('Reopen', 'Resolved').id });
    assert.equal(re.assigneeId, alice.id);
    assert.equal(re.resolutionId, null);
    // subtasksDone condition
    await S.transitions.update(A, tr('Start progress', 'Open').id, { rules: { conditions: [{ type: 'subtasksDone' }], validators: [], postFunctions: [] } });
    const sub = await S.issues.create(A, { projectId: bc.project.id, typeId: bc.types.find((t) => t.level === 1).id, parentId: bug.id, summary: 'part' });
    await rejectsCode(assert, S.issues.transition(ALICE, bug.id, { statusId: bst('In Progress') }), 'CONDITION_SUBTASKS', 403);
    await S.issues.transition(A, sub.id, { statusId: bst('Resolved'), comment: 'ok', fields: { assigneeId: alice.id } });
    assert.equal((await S.issues.transition(ALICE, bug.id, { statusId: bst('In Progress') })).statusId, bst('In Progress'));
  });

  test('issue parts: comments, attachments, worklogs, links, checklist, watchers, votes', async () => {
    const c = await S.comments.add(ALICE, iss.story.id, { body: 'Ping @bob please' });
    await rejectsCode(assert, S.comments.update(A, c.id, { body: 'x', rev: c.rev + 5 }), 'CONFLICT', 409);
    await rejectsCode(assert, S.comments.update(BOB, c.id, { body: 'x' }), 'PROJECT_PERMISSION', 403);
    const c2 = await S.comments.update(ALICE, c.id, { body: 'Ping @bob please!', rev: c.rev });
    assert.equal(c2.body, 'Ping @bob please!');
    const att = await S.attachments.add(ALICE, iss.story.id, { fileName: 'shot:1.png', mime: 'image/png', data: PNG.toString('base64') });
    assert.equal(att.fileName, 'shot_1.png');
    assert.equal(att.size, PNG.length);
    const dl = await S.attachments.download(BOB, att.id);
    assert.ok(Buffer.from(dl.data).equals(PNG));
    await rejectsCode(assert, S.attachments.add(A, iss.story.id, { fileName: 'e', data: '' }), 'EMPTY_FILE');
    assert.equal((await S.attachments.list(A, iss.story.id)).length, 1);

    await S.issues.update(A, iss.story.id, { originalEstimate: 8 * 3600 });
    const w = await S.worklogs.add(ALICE, iss.story.id, { timeSpent: '2h 30m', comment: 'pairing' });
    assert.equal(w.seconds, 9000);
    let s = await S.issues.get(A, iss.story.id);
    assert.equal(s.timeSpent, 9000);
    assert.equal(s.remainingEstimate, 8 * 3600 - 9000);
    await S.worklogs.update(ALICE, w.id, { timeSpent: '3h', rev: w.rev });
    s = await S.issues.get(A, iss.story.id);
    assert.equal(s.timeSpent, 3 * 3600);
    assert.equal(s.remainingEstimate, 5 * 3600);
    await rejectsCode(assert, S.worklogs.update(A, w.id, { timeSpent: 'later' }), 'INVALID_DURATION');

    const l = await S.links.add(A, iss.bug.id, { targetKey: 'SHOP-2', kind: 'blocks' });
    await rejectsCode(assert, S.links.add(A, iss.bug.id, { targetId: iss.story.id, kind: 'blocks' }), 'LINK_EXISTS', 409);
    await rejectsCode(assert, S.links.add(A, iss.bug.id, { targetId: iss.bug.id }), 'INVALID_LINK');
    const storyLinks = await S.links.list(A, iss.story.id);
    assert.deepEqual(storyLinks.map((x) => [x.direction, x.label, x.issue.key]), [['inward', 'is blocked by', 'SHOP-3']]);
    assert.ok(l.id);

    const ck = await S.checklist.list(A, iss.story.id);
    const first = await S.checklist.add(A, iss.story.id, { text: 'first!', beforeId: ck[0].id });
    const mid = await S.checklist.add(A, iss.story.id, { text: 'middle', afterId: ck[0].id });
    await S.checklist.update(A, ck[1].id, { afterId: first.id, beforeId: ck[0].id, done: true });
    const order = (await S.checklist.list(A, iss.story.id)).map((x) => x.text);
    assert.deepEqual(order, ['first!', 'build', 'design', 'middle']);
    await S.checklist.remove(A, mid.id);

    await S.watchers.add(BOB, iss.story.id);
    assert.deepEqual((await S.watchers.list(A, iss.story.id)).map((u) => u.username).sort(), ['alice', 'bob']);
    await S.watchers.remove(BOB, iss.story.id);
    await rejectsCode(assert, S.votes.vote(ALICE, iss.story.id), 'CANNOT_VOTE_OWN');
    assert.deepEqual(await S.votes.vote(BOB, iss.story.id), { count: 1, voted: true });
    assert.deepEqual(await S.votes.vote(BOB, iss.story.id), { count: 1, voted: true });
    const full = await S.issues.get(BOB, iss.story.id);
    assert.equal(full.voted, true);
    assert.equal(full.commentCount, 1);
    assert.equal(full.attachmentCount, 1);
    const hf = (await S.history.list(A, iss.story.id)).map((h) => h.field);
    for (const f of ['attachment', 'timeSpent', 'link']) assert.ok(hf.includes(f), f);
  });

  test('notifications: assignment, mentions, watchers', async () => {
    await core.events.idle();
    await S.issues.update(A, iss.bug.id, { assigneeId: bob.id });
    await S.comments.add(A, iss.bug.id, { body: 'see @alice' });
    await core.events.idle();
    const nb = await S.notifications.list(BOB);
    assert.ok(nb.items.some((n) => n.kind === 'assigned' && n.payload.key === 'SHOP-3'));
    assert.ok(nb.items.some((n) => n.kind === 'mentioned'), 'mentioned in the story comment earlier');
    const na = await S.notifications.list(ALICE);
    assert.ok(na.items.some((n) => n.kind === 'mentioned' && n.payload.key === 'SHOP-3'));
    assert.ok(!(await S.notifications.list(A)).items.some((n) => n.payload.by === admin.id), 'actors are not notified');
    assert.ok(nb.unread > 0);
    await S.notifications.markRead(BOB, { ids: [nb.items[0].id] });
    assert.equal((await S.notifications.list(BOB)).unread, nb.unread - 1);
    await S.notifications.markRead(BOB, {});
    assert.equal((await S.notifications.list(BOB, { unread: true })).total, 0);
  });

  test('JQL: SQL search and the in-memory matcher agree', async () => {
    const queries = [
      ['project = SHOP', null], ['status = "Backlog"', null], ['statusCategory = Done', null], ['assignee = currentUser()', ALICE],
      ['assignee is EMPTY', null], ['labels in (auth, backend)', null], ['labels ~ end', null], ['priority > Medium', null],
      ['"Customer impact" = High', null], ['"Business value" >= 10', null], ['Platforms = iOS', null], ['Owner = bob', null],
      ['storyPoints >= 5', null], ['created >= -1d', null], ['text ~ login', null], ['type = Bug AND flagged = true', null],
      ['epic = SHOP-1', null], ['parent is not EMPTY', null], ['fixVersion = "2.0"', null], ['affectedVersion = "1.0"', null],
      ['component = API', null], ['resolution is EMPTY AND project = SHOP', null], ['due < "2026-12-31"', null], ['NOT (labels = auth OR flagged = true) AND project = SHOP', null],
      ['reporter in (alice, admin) AND project = SHOP', null], ['summary !~ crash AND project = SHOP', null], ['key in (SHOP-1, SHOP-3)', null],
    ];
    for (const [jql, who] of queries) {
      const ctx = who || A;
      const res = await S.issues.search(ctx, { jql, limit: 500 });
      const sqlIds = res.items.map((i) => i.id).sort();
      const all = (await core.db.all('SELECT "id" FROM "issues" WHERE "archived" = 0')).map((r) => r.id);
      const hyd = await S.issues.hydrate(all);
      const m = await S.issues.matcher(ctx, jql);
      const memIds = hyd.filter(m).map((i) => i.id).sort();
      assert.deepEqual(sqlIds, memIds, jql);
      assert.equal(res.total, sqlIds.length, jql);
    }
    const r = await S.issues.search(A, { jql: 'project = SHOP AND labels = auth' });
    assert.deepEqual(r.items.map((i) => i.key), ['SHOP-2']);
    const ordered = await S.issues.search(A, { jql: 'project = SHOP ORDER BY priority DESC, key ASC', limit: 3 });
    assert.equal(ordered.items[0].key, 'SHOP-3', 'highest priority first');
    assert.equal(ordered.limit, 3);
    const page2 = await S.issues.search(A, { jql: 'project = SHOP ORDER BY key', limit: 2, offset: 2 });
    assert.deepEqual(page2.items.map((i) => i.key), ['SHOP-3', 'SHOP-4']);
    await rejectsCode(assert, S.issues.search(A, { jql: 'status = ' }), 'JQL_SYNTAX');
    const v = await S.search.validate(A, 'nosuchfield = 1');
    assert.equal(v.ok, false);
    assert.equal(v.error.code, 'JQL_UNKNOWN_FIELD');
    assert.equal(v.error.details.position, 0);
    // viewers only see their projects
    assert.ok((await S.issues.search(BOB, { jql: '' })).items.every((i) => i.projectId === proj.id));
    const sug = await S.search.suggest(A, 'assignee = al', 13);
    assert.equal(sug.kind, 'value');
    assert.deepEqual(sug.items.map((i) => i.label), ['alice']);
    const sug2 = await S.search.suggest(A, 'project = SH', 12);
    assert.equal(sug2.items[0].label, 'SHOP');
    const sug3 = await S.search.suggest(A, '"Customer impact" = ', 20);
    assert.deepEqual(sug3.items.filter((i) => !i.detail).map((i) => i.label).slice(0, 2), ['Low', 'High']);
  });

  test('boards: data, columns, quick filters, swimlanes, card colours, moves with rank and WIP', async () => {
    const st = (n) => byName('statuses', n).id;
    const boardId = proj.boardId;
    const b = await S.boards.get(A, boardId);
    assert.deepEqual(b.columns.map((c) => c.name), ['Backlog', 'To Do', 'In Progress', 'In Review', 'Done']);
    const colOf = (n) => b.columns.find((c) => c.name === n);
    let d = await S.boards.data(A, boardId);
    assert.ok(d.backlog.some((c) => c.key === 'SHOP-2'), 'backlog status goes to the kanban backlog');
    assert.ok(d.columns.find((c) => c.name === 'Backlog').backlog);
    assert.ok(d.columns.find((c) => c.name === 'Done').done);
    const story = d.backlog.find((c) => c.key === 'SHOP-2');
    assert.deepEqual(story.labels, ['auth']);
    assert.deepEqual(story.subtasks, { total: 1, done: 0 });
    assert.deepEqual(story.checklist, { total: 3, done: 1 });
    assert.equal(story.commentCount, 1);
    assert.equal(story.attachmentCount, 1);
    assert.equal(story.cardColor, byName('types', 'Story').color);
    assert.ok(d.epics.some((e) => e.key === 'SHOP-1'));
    assert.ok(d.users.length >= 3);
    // move: backlog → In Progress (status follows the column), then rank above the bug
    await S.issues.transition(A, iss.bug.id, { statusId: st('In Progress') });
    const mv = await S.issues.move(ALICE, iss.story.id, { boardId, columnId: colOf('In Progress').id, beforeId: iss.bug.id });
    assert.equal(mv.issue.statusId, st('In Progress'));
    d = await S.boards.data(A, boardId);
    const inProg = d.issues.filter((c) => c.columnId === colOf('In Progress').id).map((c) => c.key);
    assert.ok(inProg.indexOf('SHOP-2') < inProg.indexOf('SHOP-3'), `rank order ${inProg}`);
    const mv2 = await S.issues.move(A, iss.story.id, { boardId, afterId: iss.bug.id });
    assert.equal(mv2.issue.statusId, st('In Progress'));
    d = await S.boards.data(A, boardId);
    const again = d.issues.filter((c) => c.columnId === colOf('In Progress').id).map((c) => c.key);
    assert.ok(again.indexOf('SHOP-2') > again.indexOf('SHOP-3'));
    await rejectsCode(assert, S.issues.move(A, iss.story.id, { boardId, afterId: iss.bug.id, rev: 1 }), 'CONFLICT', 409);
    // WIP: limit In Review to 0 and move into it → warning, not an error
    await S.boards.columns.update(A, colOf('In Review').id, { wipMax: 0 });
    const w = await S.issues.move(A, iss.sub.id, { boardId, columnId: colOf('In Review').id });
    assert.equal(w.warnings[0].code, 'WIP_LIMIT');
    d = await S.boards.data(A, boardId);
    assert.equal(d.columns.find((c) => c.name === 'In Review').overMax, true);
    // quick filters (ANDed) and text search
    const qf1 = await S.boards.quickFilters.create(A, boardId, { name: 'Mine', jql: 'assignee = currentUser()', icon: 'b:user' });
    const qf2 = await S.boards.quickFilters.create(A, boardId, { name: 'Flagged', jql: 'flagged = true' });
    await rejectsCode(assert, S.boards.quickFilters.create(A, boardId, { name: 'Bad', jql: 'status = (' }), 'JQL_SYNTAX');
    d = await S.boards.data(ALICE, boardId, { quick: qf1.id });
    assert.ok([...d.issues, ...d.backlog].every((c) => c.assigneeId === alice.id));
    d = await S.boards.data(A, boardId, { quick: `${qf1.id},${qf2.id}` });
    assert.equal(d.issues.length + d.backlog.length, 0);
    d = await S.boards.data(A, boardId, { search: 'CRASH' });
    assert.deepEqual(d.issues.map((c) => c.key), ['SHOP-3']);
    // swimlanes by query + card colours by query
    const lane = await S.boards.swimlanes.create(A, boardId, { name: 'Urgent', jql: 'priority = Highest' });
    await S.boards.cardColors.create(A, boardId, { jql: 'type = Bug', color: '#ff0000' });
    const bs = await S.boards.update(A, boardId, { settings: { swimlanes: 'queries', cardColors: 'queries' } });
    assert.equal(bs.settings.swimlanes, 'queries');
    await rejectsCode(assert, S.boards.update(A, boardId, { settings: { swimlanes: 'moon' } }), 'INVALID_SETTINGS');
    d = await S.boards.data(A, boardId);
    const bugCard = d.issues.find((c) => c.key === 'SHOP-3');
    assert.equal(bugCard.lane, lane.id);
    assert.equal(bugCard.cardColor, '#ff0000');
    assert.deepEqual(d.swimlanes.map((l) => l.id), [lane.id, 'other']);
    await S.boards.update(A, boardId, { settings: { swimlanes: 'assignee', cardColors: 'priority' } });
    d = await S.boards.data(A, boardId);
    assert.ok(d.swimlanes.some((l) => l.id === alice.id));
    // swimlane move changes the assignee
    await S.issues.move(A, iss.bug.id, { boardId, swimlane: alice.id });
    assert.equal((await S.issues.get(A, iss.bug.id)).assigneeId, alice.id);
    // done older than doneHideDays is hidden
    const old = await S.issues.create({ ...A, now: () => Date.now() - 40 * DAY }, { projectId: proj.id, summary: 'Ancient', statusId: st('Done') });
    d = await S.boards.data(A, boardId);
    assert.ok(!d.issues.some((c) => c.id === old.id));
    d = await S.boards.data(A, boardId, { includeAllDone: true });
    assert.ok(d.issues.some((c) => c.id === old.id));
    // a cross-project board by filter
    const cross = await S.boards.create(A, { name: 'All bugs', filterJql: 'type = Bug', columns: [{ name: 'Open', statusIds: [st('In Progress')] }] });
    d = await S.boards.data(A, cross.id);
    assert.deepEqual(d.issues.map((c) => c.key), ['SHOP-3']);
    await rejectsCode(assert, S.boards.create(A, { name: 'No filter' }), 'REQUIRED');
    await S.boards.remove(A, cross.id);
    // bulk
    const bulk = await S.issues.bulk(A, { ids: [iss.task.id, iss.sub.id, 'nope'], patch: { labels: ['bulk'] } });
    assert.deepEqual(bulk.ok, [iss.task.id, iss.sub.id]);
    assert.equal(bulk.failed[0].error.code, 'ISSUE_NOT_FOUND');
    // clone
    const cl = await S.issues.clone(A, iss.story.id);
    assert.equal(cl.summary, 'Login with e-mail');
    assert.ok(cl.links.some((x) => x.kind === 'clones' && x.issue.id === iss.story.id));
    assert.deepEqual(cl.custom[fImpact.id], 'High');
    await S.issues.remove(A, cl.id);
    await rejectsCode(assert, S.issues.get(A, cl.id), 'ISSUE_NOT_FOUND', 404);
    assert.equal(await core.db.count('issue_links', { source_id: cl.id }), 0);
  });

  test('filters and dashboards: owner, sharing, validation', async () => {
    const f = await S.filters.create(ALICE, { name: 'My open', jql: 'assignee = currentUser() AND resolution is EMPTY', favourite: true });
    assert.equal(f.mine, true);
    await rejectsCode(assert, S.filters.create(ALICE, { name: 'Bad', jql: 'assignee ==' }), 'JQL_SYNTAX');
    await rejectsCode(assert, S.filters.get(BOB, f.id), 'FILTER_NOT_FOUND', 404);
    await S.filters.update(ALICE, f.id, { shared: true, rev: f.rev });
    assert.equal((await S.filters.get(BOB, f.id)).mine, false);
    await rejectsCode(assert, S.filters.update(BOB, f.id, { name: 'mine now' }), 'NOT_OWNER', 403);
    const dsh = await S.dashboards.create(ALICE, { name: 'Team', icon: 'e:📊', layout: { columns: 2, gadgets: [{ type: 'cfd', config: { boardId: proj.boardId }, col: 0, row: 0 }, { type: 'filterResults', config: { filterId: f.id }, col: 1, row: 0 }] } });
    assert.equal(dsh.layout.gadgets.length, 2);
    assert.ok(dsh.layout.gadgets[0].id);
    await rejectsCode(assert, S.dashboards.create(ALICE, { name: 'X', layout: { gadgets: [{ type: 'weather' }] } }), 'INVALID_GADGET');
    assert.equal((await S.dashboards.list(ALICE)).length, 1);
    await S.dashboards.remove(ALICE, dsh.id);
  });

  test('reports: cumulative flow, control chart, throughput, created vs resolved, workload, version, breakdown', async () => {
    const base = dayAt(Date.now(), -10);
    const clock = { t: base };
    const C = { ...A, now: () => clock.t };
    const p = await S.projects.create(C, { key: 'REP', name: 'Reports', template: 'kanban' });
    const rc = await S.projects.config(A, p.id);
    const st = (n) => rc.statuses.find((s) => s.name === n).id;
    const at = (n, h) => { clock.t = dayAt(base, n, h); };
    const ymd = (ms) => { const x = new Date(ms); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
    const v = await S.versions.create(A, p.id, { name: 'R1', startDate: ymd(base) });
    at(0, 1); const a = await S.issues.create(C, { projectId: p.id, summary: 'A', storyPoints: 3, fixVersionIds: [v.id] });
    at(0, 2); const b = await S.issues.create(C, { projectId: p.id, summary: 'B', storyPoints: 5, fixVersionIds: [v.id] });
    at(0, 4); const e = await S.issues.create(C, { projectId: p.id, summary: 'E' });
    at(1, 1); await S.issues.transition(C, a.id, { statusId: st('In Progress') });
    at(1, 2); await S.issues.transition(C, b.id, { statusId: st('Selected for Development') });
    at(1, 5); await S.issues.transition(C, e.id, { statusId: st('Done') });
    at(2, 2); await S.issues.transition(C, b.id, { statusId: st('In Progress') });
    at(2, 3); const c = await S.issues.create(C, { projectId: p.id, summary: 'C', storyPoints: 2, assigneeId: alice.id, fixVersionIds: [v.id] });
    at(3, 1); await S.issues.transition(C, a.id, { statusId: st('Done') });
    at(4, 3); await S.issues.transition(C, c.id, { statusId: st('In Progress') });
    at(5, 2); await S.issues.transition(C, b.id, { statusId: st('Done') });
    at(6, 1); await S.issues.create(C, { projectId: p.id, summary: 'D' });
    at(8, 0);
    const q = { boardId: p.boardId, from: dayAt(base, 0), to: dayAt(base, 7, 23) };

    const cfd = await S.reports.cfd(C, q);
    assert.equal(cfd.days.length, 8);
    const series = Object.fromEntries(cfd.columns.map((col, i) => [col.name, cfd.series[i].values]));
    assert.deepEqual(series.Backlog, [3, 0, 1, 1, 0, 0, 1, 1]);
    assert.deepEqual(series['Selected for Development'], [0, 1, 0, 0, 0, 0, 0, 0]);
    assert.deepEqual(series['In Progress'], [0, 1, 2, 1, 2, 1, 1, 1]);
    assert.deepEqual(series.Done, [0, 1, 1, 2, 2, 3, 3, 3]);

    const ctl = await S.reports.control(C, q);
    const byKey = Object.fromEntries(ctl.points.map((pt) => [pt.summary, pt]));
    assert.deepEqual(Object.keys(byKey).sort(), ['A', 'B', 'E']);
    assert.equal(byKey.A.cycleTime, dayAt(base, 3, 1) - dayAt(base, 1, 1));
    assert.equal(byKey.A.leadTime, dayAt(base, 3, 1) - dayAt(base, 0, 1));
    assert.equal(byKey.B.cycleTime, dayAt(base, 5, 2) - dayAt(base, 2, 2));
    assert.equal(byKey.E.cycleTime, 0);
    assert.equal(ctl.cycle.count, 3);
    assert.equal(ctl.cycle.average, (byKey.A.cycleTime + byKey.B.cycleTime) / 3);
    assert.equal(ctl.rolling.length, 3);

    const thr = await S.reports.throughput(C, { ...q, interval: 'day' });
    assert.deepEqual(thr.buckets.map((x) => x.count), [0, 1, 0, 1, 0, 1, 0, 0]);
    assert.equal(thr.buckets[5].points, 5);

    const cr = await S.reports.createdResolved(C, q);
    assert.deepEqual(cr.days.map((x) => x.created), [3, 0, 1, 0, 0, 0, 1, 0]);
    assert.deepEqual(cr.days.map((x) => x.resolved), [0, 1, 0, 1, 0, 1, 0, 0]);
    assert.equal(cr.days[7].cumulativeCreated, 5);

    const wl = await S.reports.workload(C, { projectId: p.id });
    const aliceLoad = wl.items.find((x) => x.userId === alice.id);
    assert.deepEqual([aliceLoad.count, aliceLoad.points], [1, 2]);
    assert.equal(wl.items.find((x) => x.userId === null).count, 1);

    const vr = await S.reports.version(C, v.id);
    assert.equal(vr.total, 3);
    assert.deepEqual(vr.byCategory, { todo: 0, inprogress: 1, done: 2 });
    assert.deepEqual(vr.points, { total: 10, done: 8 });
    assert.equal(vr.burnup[vr.burnup.length - 1].done, 8);
    assert.equal(vr.burnup[0].scope, 8);
    assert.ok(vr.predictedReleaseDate);

    const br = await S.reports.breakdown(A, { jql: 'project = REP', field: 'status' });
    assert.equal(br.total, 5);
    assert.deepEqual(br.items.find((x) => x.key === st('Done')).count, 3);
    await rejectsCode(assert, S.reports.cfd(A, {}), 'REQUIRED');
    await rejectsCode(assert, S.reports.cfd(BOB, { projectId: p.id }), 'PROJECT_NOT_FOUND', 404);
  });

  test('automation: event rules, conditions, loop guard, scheduled and manual runs', async () => {
    const st = (n) => byName('statuses', n).id;
    const high = byName('priorities', 'High').id;
    await rejectsCode(assert, S.automation.create(A, proj.id, { name: 'x', trigger: { type: 'never' }, actions: [{ type: 'comment', body: 'x' }] }), 'INVALID_TRIGGER');
    await rejectsCode(assert, S.automation.create(A, proj.id, { name: 'x', trigger: { type: 'issue.created' }, actions: [] }), 'INVALID_ACTIONS');
    await rejectsCode(assert, S.automation.create(A, proj.id, { name: 'x', trigger: { type: 'issue.created' }, conditions: [{ jql: 'type = (' }], actions: [{ type: 'comment', body: 'x' }] }), 'JQL_SYNTAX');
    const r1 = await S.automation.create(A, proj.id, { name: 'Done note', trigger: { type: 'issue.transitioned', toStatusId: st('Done') }, actions: [{ type: 'comment', body: 'Closed by {{user.name}}: {{issue.key}}' }, { type: 'addLabel', label: 'shipped' }] });
    const r2 = await S.automation.create(A, proj.id, { name: 'Bugs are urgent', trigger: { type: 'issue.created' }, conditions: [{ jql: 'type = Bug' }], actions: [{ type: 'setField', field: 'priorityId', value: high }, { type: 'assign', userId: 'reporter' }] });
    const r3 = await S.automation.create(A, proj.id, { name: 'Echo labels', trigger: { type: 'issue.updated', fields: ['labels'] }, actions: [{ type: 'addLabel', label: 'touched-{{issue.key}}' }] });
    const bug = await S.issues.create(ALICE, { projectId: proj.id, typeId: byName('types', 'Bug').id, summary: 'Auto bug' });
    const task = await S.issues.create(ALICE, { projectId: proj.id, summary: 'Auto task' });
    await core.events.idle();
    const bugNow = await S.issues.get(A, bug.id);
    assert.equal(bugNow.priorityId, high);
    assert.equal(bugNow.assigneeId, alice.id);
    assert.notEqual((await S.issues.get(A, task.id)).priorityId, high, 'condition filters');
    await S.issues.transition(ALICE, task.id, { statusId: st('Done') });
    await core.events.idle();
    const t2 = await S.issues.get(A, task.id);
    assert.ok(t2.labels.includes('shipped'));
    assert.ok(t2.labels.includes(`touched-${t2.key}`), 'r1 label change triggers r3 (other rule)');
    assert.equal(t2.labels.length, 2, 'r3 does not retrigger itself');
    const comments = await S.comments.list(A, task.id);
    assert.equal(comments.at(-1).body, `Closed by Alice K.: ${t2.key}`);
    const rules = await S.automation.list(A, proj.id);
    assert.equal(rules.find((r) => r.id === r1.id).runCount, 1);
    assert.equal(rules.find((r) => r.id === r2.id).runCount, 1);
    assert.ok(rules.find((r) => r.id === r3.id).runCount >= 1);
    for (const r of [r1, r2, r3]) await S.automation.update(A, r.id, { enabled: false });
    // scheduled
    const r4 = await S.automation.create(A, proj.id, { name: 'Nudge stale', trigger: { type: 'scheduled', everyMinutes: 60, jql: 'labels = bulk' }, actions: [{ type: 'comment', body: 'still open?' }] });
    await S.automation.tick();
    const nudged = await core.db.value('SELECT COUNT(*) AS n FROM "comments" WHERE "body" = ?', ['still open?']);
    assert.equal(Number(nudged), 2);
    await S.automation.tick();
    assert.equal(Number(await core.db.value('SELECT COUNT(*) AS n FROM "comments" WHERE "body" = ?', ['still open?'])), 2, 'not due again yet');
    const run = await S.automation.run(A, r4.id);
    assert.equal(run.matched, 2);
    assert.equal(run.acted, 2);
    await rejectsCode(assert, S.automation.run(ALICE, r4.id), 'PROJECT_PERMISSION', 403);
    await S.automation.remove(A, r4.id);
  });

  test('icons: upload raster and sanitised SVG, bytes, delete', async () => {
    const png = await S.icons.create(ALICE, { name: 'dot', data: PNG.toString('base64'), width: 1, height: 1 });
    assert.equal(png.mime, 'image/png');
    assert.equal(png.ref, `u:${png.id}`);
    const svg = await S.icons.create(A, { name: 'logo', data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="x()"><script>x()</script><circle r="4"/></svg>').toString('base64') });
    const bytes = await S.icons.bytes(svg.id);
    assert.equal(bytes.mime, 'image/svg+xml');
    assert.equal(Buffer.from(bytes.data).toString('utf8'), '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>');
    await rejectsCode(assert, S.icons.create(A, { name: 'txt', data: Buffer.from('hello').toString('base64') }), 'UNSUPPORTED_IMAGE');
    assert.ok((await S.icons.list(BOB)).length >= 2);
    await rejectsCode(assert, S.icons.remove(BOB, png.id), 'NOT_OWNER', 403);
    await S.projects.update(A, proj.id, { icon: svg.ref });
    await S.icons.remove(ALICE, png.id);
    await rejectsCode(assert, S.icons.bytes(png.id), 'ICON_NOT_FOUND', 404);
  });

  test('export / import .myboard round trip', async () => {
    const file = await S.exchange.exportProject(A, proj.id);
    assert.equal(file.format, 'myboard');
    assert.ok(file.icons.length >= 1, 'used uploaded icons travel with the file');
    const json = JSON.stringify(file);
    const e = await rejectsCode(assert, S.exchange.importMyboard(A, json), 'PROJECT_KEY_TAKEN', 409);
    assert.equal(e.details.suggested, 'SHOP2');
    const copy = await S.exchange.importMyboard(A, json, { key: 'COPY', name: 'Shop copy' });
    assert.equal(copy.key, 'COPY');
    const count = async (sql, pid) => Number(await core.db.value(sql, [pid], 0));
    for (const t of ['comments', 'attachments', 'issue_history', 'issue_labels', 'custom_values', 'checklist_items', 'worklogs']) {
      const sql = `SELECT COUNT(*) AS n FROM ${core.db.q(t)} WHERE "issue_id" IN (SELECT "id" FROM "issues" WHERE "project_id" = ?)`;
      assert.equal(await count(sql, copy.id), await count(sql, proj.id), t);
    }
    assert.equal(copy.issueCount, await core.db.count('issues', { project_id: proj.id }));
    const cc = await S.projects.config(A, copy.id);
    assert.ok(cc.project.icon.startsWith('u:') && cc.project.icon !== (await S.projects.get(A, proj.id)).icon, 'icon re-mapped');
    const keys = (await S.issues.search(A, { jql: 'project = COPY ORDER BY key', limit: 3 })).items.map((i) => i.key);
    assert.deepEqual(keys, ['COPY-1', 'COPY-2', 'COPY-3']);
    const story = await S.issues.get(A, 'COPY-2');
    assert.equal(story.epic.key, 'COPY-1');
    assert.equal(story.custom[cc.fields.find((f) => f.name === 'Customer impact').id], 'High');
    const att = (await S.attachments.list(A, story.id))[0];
    assert.ok(Buffer.from((await S.attachments.download(A, att.id)).data).equals(PNG));
    // board columns map to the copy's statuses
    const bd = await S.boards.data(A, cc.boards[0].id);
    const statusIds = new Set(cc.statuses.map((s) => s.id));
    assert.ok(bd.columns.every((c) => c.statusIds.every((s) => statusIds.has(s))));
    assert.ok(bd.issues.length + bd.backlog.length > 0);
    // JQL in the board's quick filters still works
    assert.ok((await S.boards.get(A, cc.boards[0].id)).quickFilters.length >= 2);
    await rejectsCode(assert, S.exchange.importMyboard(A, { hello: 1 }), 'INVALID_FILE');
    await S.projects.remove(A, copy.id);
    assert.equal(await core.db.count('issues', { project_id: copy.id }), 0);
  });

  test('CSV import (mapping, subtasks, custom fields, errors) and export', async () => {
    const me = await S.projects.config(A, 'ME');
    const csv = 'Key,Title,Status,Labels,Due,Parent,Points,Assignee\r\nX-1,Buy milk,To Do,home errand,2026-12-24,,1,alice\r\nX-2,Pick brand,Doing,,,X-1,,\r\nX-3,Bad row,Nowhere,,,,,\r\n';
    const dry = await S.exchange.importCsv(A, { projectId: me.project.id, csv });
    assert.deepEqual(dry.headers, ['Key', 'Title', 'Status', 'Labels', 'Due', 'Parent', 'Points', 'Assignee']);
    assert.equal(dry.rowCount, 3);
    assert.equal(dry.suggestedMapping.Title, 'summary');
    assert.equal(dry.suggestedMapping.Due, 'dueDate');
    const out = await S.exchange.importCsv(A, { projectId: me.project.id, csv, mapping: { ...dry.suggestedMapping, Points: 'storyPoints' } });
    assert.equal(out.created, 2);
    assert.deepEqual(out.errors.map((e) => [e.row, e.code]), [[4, 'UNKNOWN_VALUE']]);
    const milk = await S.issues.get(A, out.issues[0].key);
    assert.deepEqual(milk.labels, ['errand', 'home']);
    assert.equal(milk.dueDate, '2026-12-24');
    assert.equal(milk.assigneeId, alice.id);
    assert.equal(milk.subtasks.length, 1);
    assert.equal(milk.statusId, me.statuses.find((s) => s.name === 'To Do').id);
    const text = await S.exchange.exportCsv(A, { jql: 'project = ME ORDER BY key' });
    assert.ok(text.startsWith('﻿Key,Summary,Type,Status'));
    assert.match(text, /ME-1,Buy milk,Task,To Do/);
  });

  test('card board JSON import', async () => {
    const id = (n) => `5f0000${String(n).padStart(2, '0')}0000000000000000`.slice(0, 24);
    const board = {
      name: 'Garden Plan', desc: 'Spring',
      lists: [{ id: 'l1', name: 'Ideas', pos: 1 }, { id: 'l2', name: 'Doing', pos: 2 }, { id: 'l3', name: 'Done', pos: 3 }, { id: 'l4', name: 'Old', pos: 4, closed: true }],
      members: [{ id: 'm1', username: 'alice', fullName: 'Alice' }, { id: 'm2', username: 'gardener', fullName: 'Green Thumb' }],
      cards: [
        { id: id(1), name: 'Plant tomatoes', idList: 'l2', pos: 2, labels: [{ name: 'veg', color: 'green' }], idMembers: ['m1'], due: '2026-05-01T10:00:00.000Z', cover: { color: 'red' } },
        { id: id(2), name: 'Buy seeds', idList: 'l3', pos: 1, labels: [{ name: '', color: 'yellow' }], idMembers: ['m2'] },
        { id: id(3), name: 'Compost', idList: 'l1', pos: 1, desc: 'Find a **bin**' },
        { id: id(4), name: 'Old idea', idList: 'l1', pos: 2, closed: true },
      ],
      checklists: [{ id: 'c1', idCard: id(1), name: 'Steps', checkItems: [{ name: 'dig', state: 'complete', pos: 1 }, { name: 'water', state: 'incomplete', pos: 2 }] }],
      actions: [{ type: 'commentCard', date: '2026-04-01T09:00:00.000Z', idMemberCreator: 'm2', data: { text: 'Use cherry ones', card: { id: id(1) } } }],
    };
    const p = await S.exchange.importBoardJson(A, JSON.stringify(board));
    assert.equal(p.key, 'GP');
    assert.deepEqual(p.imported, { issues: 4, checklistItems: 2, comments: 1 });
    const c = await S.projects.config(A, p.id);
    assert.deepEqual(c.statuses.map((s) => [s.name, s.category]), [['Ideas', 'todo'], ['Doing', 'inprogress'], ['Done', 'done']]);
    const d = await S.boards.data(A, p.boardId);
    assert.deepEqual(d.columns.map((col) => [col.name, col.count]), [['Ideas', 1], ['Doing', 1], ['Done', 1]]);
    assert.equal((await S.issues.get(A, 'GP-1')).summary, 'Compost', 'cards keep list order');
    const tom = await S.issues.get(A, 'GP-3');
    assert.equal(tom.summary, 'Plant tomatoes');
    assert.equal(tom.assigneeId, alice.id);
    assert.deepEqual(tom.labels, ['veg']);
    assert.equal(tom.dueDate.slice(0, 7), '2026-05');
    assert.deepEqual(tom.checklist.map((x) => [x.text, x.done]), [['dig', true], ['water', false]]);
    assert.equal(tom.cover.color, '#eb5a46');
    assert.equal((await S.comments.list(A, tom.id))[0].body, 'Use cherry ones');
    assert.ok((await S.issues.get(A, 'GP-2')).archived);
    assert.ok(await core.db.get('SELECT "id" FROM "users" WHERE "username" = ? AND "active" = 0', ['gardener']));
    const again = await S.exchange.importBoardJson(A, board);
    assert.equal(again.key, 'GP2');
    await rejectsCode(assert, S.exchange.importBoardJson(A, { name: 'x' }), 'INVALID_FILE');
  });

  test('copy all data into another database', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myboard-copy-'));
    const file = path.join(dir, 'copy.sqlite3');
    const res = await core.copyDb(A, { type: 'sqlite', file });
    const other = await openDatabase({ type: 'sqlite', file });
    try {
      for (const t of TABLES) assert.equal(await other.count(t.name), await core.db.count(t.name), t.name);
      assert.equal(res.total, (await Promise.all(TABLES.map((t) => core.db.count(t.name)))).reduce((a, b) => a + b, 0));
      const blob = await other.get('SELECT "data" FROM "attachments"');
      assert.ok(Buffer.from(blob.data).equals(PNG));
    } finally { await other.close(); }
    await rejectsCode(assert, core.copyDb(A, { type: 'sqlite', file }), 'DB_NOT_EMPTY', 409);
    const again = await core.copyDb(A, { type: 'sqlite', file }, { overwrite: true });
    assert.equal(again.total, res.total);
    await rejectsCode(assert, core.copyDb(ALICE, { type: 'sqlite', file }), 'ADMIN_REQUIRED', 403);
    const probe = await core.testDb(A, { type: 'sqlite', file });
    assert.equal(probe.ok, true);
    assert.equal(probe.tables, TABLES.length);
    assert.ok(probe.users >= 3);
    const bad = await core.testDb(A, { type: 'postgres', host: '127.0.0.1', port: 1, database: 'x', user: 'x', password: 'x' });
    assert.equal(bad.ok, false);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('projects delete everything they own', async () => {
    const p = await S.projects.load('KB');
    await S.issues.create(A, { projectId: p.id, summary: 'temp', labels: ['x'] });
    await S.projects.remove(A, p.id);
    await rejectsCode(assert, S.projects.get(A, 'KB'), 'PROJECT_NOT_FOUND', 404);
    assert.equal(await core.db.count('statuses', { project_id: p.id }), 0);
    assert.equal(await core.db.count('boards', { project_id: p.id }), 0);
  });
}

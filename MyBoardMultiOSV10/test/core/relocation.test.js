// Keys that change, per database (SQLite and PostgreSQL/PGlite always; MySQL, MariaDB, SQL Server when configured):
// moving an issue to another project, renaming a project key (aliases, JQL by old key, export/import),
// and label rename / merge / delete / apply.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../../core/app.js';
import { TARGETS, freshConfig, configured, skipMessage, rejectsCode } from './helpers/targets.js';

for (const target of TARGETS) {
  if (!configured(target)) {
    test(`${target.name} relocation`, (t) => t.skip(skipMessage(target)));
    continue;
  }
  describe(`${target.name} relocation`, () => suite(target));
}

function suite(target) {
  let core; let S; let A; let ALICE; let BOB; let alice; let bob;
  let src; let dst; let srcCfg; let dstCfg;
  const events = [];
  const keysOf = async (jql, ctx = A) => (await S.issues.search(ctx, { jql, limit: 5000 })).items.map((i) => i.key).sort();

  before(async () => {
    core = await createCore({ db: await freshConfig(target), scheduler: false });
    S = core.services;
    core.events.on('*', (e) => events.push(e));
    const admin = await S.users.create({ system: true }, { username: 'admin', displayName: 'Admin', password: 'admin-pw', role: 'admin' }, { bootstrap: true });
    A = { user: { id: admin.id, role: 'admin', username: 'admin' } };
    alice = await S.users.create(A, { username: 'alice', displayName: 'Alice', password: 'pw-alice' });
    bob = await S.users.create(A, { username: 'bob', displayName: 'Bob', password: 'pw-bob' });
    ALICE = { user: { id: alice.id, role: 'user', username: 'alice' } };
    BOB = { user: { id: bob.id, role: 'user', username: 'bob' } };
    src = await S.projects.create(A, { key: 'SRC', name: 'Source', template: 'software' });
    dst = await S.projects.create(A, { key: 'DST', name: 'Target', template: 'kanban' });
    srcCfg = await S.projects.config(A, src.id);
    dstCfg = await S.projects.config(A, dst.id);
  });
  after(async () => { if (core) await core.close(); });

  const type = (cfg, name) => cfg.types.find((t) => t.name === name);
  const status = (cfg, name) => cfg.statuses.find((s) => s.name === name);

  test('move an issue with subtasks, custom fields, components and versions to another project', async () => {
    // fields: a global one (kept), a project one with a same-named twin in the target (mapped), one without (dropped)
    const global = await S.fields.create(A, null, { name: 'Customer', type: 'text' });
    const sev = await S.fields.create(A, src.id, { name: 'Severity', type: 'select', options: [{ value: 'High' }, { value: 'Low' }] });
    await S.fields.create(A, dst.id, { name: 'Severity', type: 'select', options: [{ value: 'high' }, { value: 'Medium' }] });
    const only = await S.fields.create(A, src.id, { name: 'Sprint goal', type: 'text' });
    const compA = await S.components.create(A, src.id, { name: 'API' });
    const compB = await S.components.create(A, src.id, { name: 'Web' });
    const dComp = await S.components.create(A, dst.id, { name: 'api' });
    const ver = await S.versions.create(A, src.id, { name: '1.0' });
    await S.versions.create(A, dst.id, { name: '1.0' });

    for (let i = 0; i < 3; i++) await S.issues.create(A, { projectId: dst.id, summary: `existing ${i}` }); // DST-1..3
    const story = await S.issues.create(A, {
      projectId: src.id, typeId: type(srcCfg, 'Story').id, summary: 'Checkout', statusId: status(srcCfg, 'In Review').id,
      labels: ['pay'], componentIds: [compA.id, compB.id], fixVersionIds: [ver.id],
      custom: { [sev.id]: 'High', [only.id]: 'ship it', ...(global ? { [global.id]: 'ACME' } : {}) },
    });
    const sub1 = await S.issues.create(A, { projectId: src.id, typeId: type(srcCfg, 'Subtask').id, parentId: story.id, summary: 'Sub one' });
    const sub2 = await S.issues.create(A, { projectId: src.id, typeId: type(srcCfg, 'Subtask').id, parentId: story.id, summary: 'Sub two', statusId: status(srcCfg, 'Done').id });
    const other = await S.issues.create(A, { projectId: src.id, summary: 'Linked' });
    await S.links.add(A, other.id, { targetKey: story.key, kind: 'blocks' });

    // the options for the dialog
    const opts = await S.moves.targets(A, story.key);
    assert.equal(opts.issue.subtaskCount, 2);
    const p = opts.projects.find((x) => x.id === dst.id);
    assert.ok(p && !opts.projects.some((x) => x.id === src.id));
    assert.equal(p.defaults.typeId, type(dstCfg, 'Story').id, 'same-named type');
    assert.equal(p.defaults.statusId, status(dstCfg, 'Backlog').id, 'no "In Review" there: the initial status');
    assert.equal(p.defaults.subtaskTypeId, type(dstCfg, 'Subtask').id);
    assert.deepEqual(p.lost.fields, ['Sprint goal']);
    assert.deepEqual(p.lost.components, ['Web']);
    assert.deepEqual(p.lost.versions, []);
    assert.equal(p.problem, null);

    // subtasks move only with their parent; members of both projects only
    await rejectsCode(assert, S.moves.move(A, sub1.id, { projectId: dst.id }), 'MOVE_SUBTASK');
    await rejectsCode(assert, S.moves.move(A, story.id, { projectId: src.id }), 'SAME_PROJECT');
    await S.projects.setMember(A, src.id, { userId: alice.id, role: 'member' });
    await rejectsCode(assert, S.moves.move(ALICE, story.id, { projectId: dst.id }), 'PROJECT_NOT_FOUND', 404);
    await S.projects.setMember(A, dst.id, { userId: alice.id, role: 'viewer' });
    await rejectsCode(assert, S.moves.move(ALICE, story.id, { projectId: dst.id }), 'PROJECT_PERMISSION', 403);
    await S.projects.setMember(A, dst.id, { userId: alice.id, role: 'member' });
    assert.ok((await S.moves.targets(ALICE, story.id)).projects.some((x) => x.id === dst.id));
    await rejectsCode(assert, S.moves.move(ALICE, story.id, { projectId: dst.id, statusId: status(srcCfg, 'To Do').id }), 'INVALID_STATUS');
    await rejectsCode(assert, S.moves.move(ALICE, story.id, { projectId: dst.id, rev: story.rev - 1 }), 'CONFLICT', 409);

    events.length = 0;
    const out = await S.moves.move(ALICE, story.key, { projectId: 'DST', statusId: status(dstCfg, 'In Progress').id, statusMap: { [status(srcCfg, 'Done').id]: status(dstCfg, 'Done').id } });
    await core.events.idle();
    assert.equal(out.fromKey, 'SRC-1');
    assert.equal(out.issue.key, 'DST-4');
    assert.equal(out.issue.projectId, dst.id);
    assert.equal(out.issue.typeId, type(dstCfg, 'Story').id);
    assert.equal(out.issue.statusId, status(dstCfg, 'In Progress').id);
    assert.deepEqual(out.subtasks.map((s) => s.key), ['DST-5', 'DST-6']);
    assert.deepEqual(out.issue.labels, ['pay'], 'labels stay');
    assert.deepEqual(out.issue.componentIds, [dComp.id], 'components by name, unmatched dropped');
    assert.equal(out.issue.fixVersionIds.length, 1);
    const dSev = (await S.projects.config(A, dst.id)).fields.find((f) => f.name === 'Severity' && f.projectId === dst.id);
    assert.equal(out.issue.custom[dSev.id], 'high', 'the value is the target option');
    assert.equal(out.issue.custom[sev.id], undefined);
    assert.equal(out.issue.custom[only.id], undefined, 'no such field in the target: dropped');
    if (global) assert.equal(out.issue.custom[global.id], 'ACME', 'global fields stay');
    assert.equal(out.issue.links.length, 1, 'links stay');

    const s1 = await S.issues.get(A, sub1.id);
    const s2 = await S.issues.get(A, sub2.id);
    assert.equal(s1.projectId, dst.id);
    assert.equal(s1.typeId, type(dstCfg, 'Subtask').id);
    assert.equal(s1.statusId, status(dstCfg, 'Backlog').id);
    assert.equal(s2.statusId, status(dstCfg, 'Done').id, 'status map');
    assert.ok(s2.resolutionId, 'done keeps a resolution');
    assert.equal(s1.parentId, story.id);
    // the target counter moved on; new issues follow
    assert.equal((await S.issues.create(A, { projectId: dst.id, summary: 'after' })).key, 'DST-7');
    assert.equal((await S.issues.create(A, { projectId: src.id, summary: 'next in source' })).key, 'SRC-5', 'source numbers are never reused');

    // old keys resolve: GET, JQL (SQL and in memory), links by key
    assert.equal((await S.issues.get(A, 'SRC-1')).id, story.id);
    assert.equal((await S.issues.get(A, 'src-2')).id, sub1.id);
    assert.deepEqual(await keysOf('key = SRC-1'), ['DST-4']);
    assert.deepEqual(await keysOf('key in (SRC-2, SRC-3)'), ['DST-5', 'DST-6']);
    assert.deepEqual(await keysOf('parent = SRC-1'), ['DST-5', 'DST-6']);
    const m = await S.issues.matcher(A, 'key = SRC-1');
    const [h] = await S.issues.hydrate([story.id]);
    assert.ok(m(h));
    assert.deepEqual(h.keyAliases, ['SRC-1']);
    const link = await S.links.add(A, (await S.issues.create(A, { projectId: dst.id, summary: 'x' })).id, { targetKey: 'SRC-1', kind: 'relates' });
    assert.ok(link);

    // history and events (both projects hear about it)
    const hist = await S.history.list(A, story.id);
    const fields = (hist.items ?? hist).map((x) => x.field);
    for (const f of ['project', 'key', 'status', 'components', `custom:${only.id}`]) assert.ok(fields.includes(f), `history ${f}`);
    const keyEntry = (hist.items ?? hist).find((x) => x.field === 'key');
    assert.equal(keyEntry.fromValue, 'SRC-1');
    assert.equal(keyEntry.toValue, 'DST-4');
    const moved = events.filter((e) => e.type === 'issue.projectMoved');
    assert.equal(moved.length, 3);
    assert.ok(moved[0].topics.includes(`project:${src.id}`) && moved[0].topics.includes(`project:${dst.id}`));
    assert.equal(moved[0].data.fromKey, 'SRC-1');
    assert.equal(moved[0].data.fromProjectId, src.id);

    // the source board does not show it any more, the target board does
    const srcBoard = await S.boards.data(A, srcCfg.boards[0].id, {});
    assert.ok(![...srcBoard.issues, ...srcBoard.backlog].some((c) => c.id === story.id));
    const dstBoard = await S.boards.data(A, dstCfg.boards[0].id, {});
    assert.ok([...dstBoard.issues, ...dstBoard.backlog].some((c) => c.id === story.id));

    // moving back: a new number there, every earlier key keeps working
    const back = await S.moves.move(A, story.id, { projectId: src.id });
    assert.equal(back.issue.key, 'SRC-6');
    assert.equal((await S.issues.get(A, 'DST-4')).id, story.id);
    assert.equal((await S.issues.get(A, 'SRC-1')).id, story.id);
    assert.deepEqual(await keysOf('key = DST-4'), ['SRC-6']);
  });

  test('move: an epic that becomes a story lets its children go; no subtask type → NO_SUBTASK_TYPE', async () => {
    const simple = await S.projects.create(A, { key: 'SIM', name: 'Simple', template: 'simple' });
    const simCfg = await S.projects.config(A, simple.id);
    const epic = await S.issues.create(A, { projectId: src.id, typeId: type(srcCfg, 'Epic').id, summary: 'Big' });
    const child = await S.issues.create(A, { projectId: src.id, summary: 'Child', epicId: epic.id });
    const opts = await S.moves.targets(A, epic.id);
    const sim = opts.projects.find((x) => x.id === simple.id);
    assert.equal(sim.defaults.typeId, type(simCfg, 'Task').id, 'no epic type: a standard type');
    const out = await S.moves.move(A, epic.id, { projectId: simple.id });
    assert.equal(out.issue.key, 'SIM-1');
    assert.equal((await S.issues.get(A, child.id)).epicId, null);
    // a parent with subtasks into a project without a subtask type
    await S.types.remove(A, simCfg.types.find((t) => Number(t.level) === 1).id);
    const parent = await S.issues.create(A, { projectId: src.id, summary: 'Parent' });
    await S.issues.create(A, { projectId: src.id, typeId: type(srcCfg, 'Subtask').id, parentId: parent.id, summary: 'S' });
    const again = await S.moves.targets(A, parent.id);
    assert.equal(again.projects.find((x) => x.id === simple.id).problem, 'NO_SUBTASK_TYPE');
    await rejectsCode(assert, S.moves.move(A, parent.id, { projectId: simple.id }), 'NO_SUBTASK_TYPE');
    await S.projects.remove(A, simple.id);
  });

  test('project key rename re-keys every issue, keeps the old keys and blocks their reuse', async () => {
    const p = await S.projects.create(A, { key: 'OLD', name: 'Old', template: 'simple' });
    const ids = [];
    for (let i = 0; i < 40; i++) ids.push((await S.issues.create(A, { projectId: p.id, summary: `issue ${i}` })).id);
    await S.links.add(A, ids[1], { targetKey: 'OLD-1', kind: 'relates' });
    const board = (await S.projects.config(A, p.id)).boards[0];
    await S.boards.quickFilters.create(A, board.id, { name: 'old ones', jql: 'project = OLD AND key <= OLD-10' });

    await rejectsCode(assert, S.projects.update(A, p.id, { key: '9X', rev: p.rev }), 'INVALID_PROJECT_KEY');
    await rejectsCode(assert, S.projects.update(A, p.id, { key: 'DST', rev: p.rev }), 'PROJECT_KEY_TAKEN', 409);
    await rejectsCode(assert, S.projects.update(ALICE, p.id, { key: 'NEW' }), 'PROJECT_NOT_FOUND', 404);
    await rejectsCode(assert, S.projects.update(A, p.id, { key: 'NEW', rev: p.rev + 5 }), 'CONFLICT', 409);
    assert.equal((await S.issues.get(A, ids[0])).key, 'OLD-1', 'a refused rename changes nothing');

    events.length = 0;
    const row = await S.projects.update(A, p.id, { key: 'new', rev: p.rev });
    await core.events.idle();
    assert.equal(row.key, 'NEW');
    const ev = events.find((e) => e.type === 'project.updated');
    assert.equal(ev.data.oldKey, 'OLD');
    assert.equal((await S.issues.get(A, ids[11])).key, 'NEW-12', 'numbers kept');
    assert.equal((await S.issues.get(A, 'OLD-12')).id, ids[11]);
    assert.equal((await S.projects.get(A, 'OLD')).id, p.id, 'the old project key still finds the project');
    assert.deepEqual(await keysOf('key = OLD-3'), ['NEW-3']);
    assert.equal((await keysOf('project = OLD')).length, 40, 'saved JQL with the old key keeps working');
    assert.equal((await keysOf('project = OLD AND key <= OLD-10')).length, 10);
    const data = await S.boards.data(A, board.id, { quick: (await S.boards.quickFilters.list(A, board.id))[0].id });
    assert.equal([...data.issues, ...data.backlog].length, 10, 'quick filter with old keys');
    assert.equal((await S.issues.get(A, ids[1])).links[0].issue.key, 'NEW-1');
    // new issues use the new key
    assert.equal((await S.issues.create(A, { projectId: p.id, summary: 'n' })).key, 'NEW-41');
    // another project cannot take the old key (create, rename, import)
    await rejectsCode(assert, S.projects.create(A, { key: 'OLD', name: 'x' }), 'PROJECT_KEY_TAKEN', 409);
    await rejectsCode(assert, S.projects.update(A, dst.id, { key: 'OLD', rev: (await S.projects.get(A, dst.id)).rev }), 'PROJECT_KEY_TAKEN', 409);
    // renaming twice and back to an earlier key
    const p2 = await S.projects.get(A, p.id);
    await S.projects.update(A, p.id, { key: 'THIRD', rev: p2.rev });
    assert.equal((await S.issues.get(A, 'OLD-5')).key, 'THIRD-5');
    assert.equal((await S.issues.get(A, 'NEW-5')).key, 'THIRD-5');
    const p3 = await S.projects.get(A, p.id);
    await S.projects.update(A, p.id, { key: 'OLD', rev: p3.rev });
    assert.equal((await S.issues.get(A, ids[4])).key, 'OLD-5');
    assert.equal((await S.issues.get(A, 'THIRD-5')).id, ids[4]);
    assert.equal(await core.db.value('SELECT COUNT(*) AS n FROM "issue_key_aliases" WHERE "key" LIKE ?', ['OLD-%'], 0) * 1, 0, 'no alias equals a live key');
    await rejectsCode(assert, S.projects.create(A, { key: 'NEW', name: 'x' }), 'PROJECT_KEY_TAKEN', 409);

    // export / import carries the aliases: into a fresh database they still resolve
    const file = await S.exchange.exportProject(A, p.id);
    assert.ok(file.tables.issue_key_aliases.length >= 80);
    assert.deepEqual(file.tables.project_key_aliases.map((r) => r.key).sort(), ['NEW', 'THIRD']);
    const other = await createCore({ db: { type: 'sqlite', file: ':memory:' }, scheduler: false });
    try {
      const S2 = other.services;
      const ad = await S2.users.create({ system: true }, { username: 'root', displayName: 'Root', password: 'root-pw', role: 'admin' }, { bootstrap: true });
      const A2 = { user: { id: ad.id, role: 'admin', username: 'root' } };
      const imported = await S2.exchange.importMyboard(A2, JSON.stringify(file));
      assert.equal(imported.key, 'OLD');
      assert.equal((await S2.issues.get(A2, 'NEW-7')).key, 'OLD-7');
      assert.equal((await S2.projects.get(A2, 'THIRD')).id, imported.id);
      await rejectsCode(assert, S2.projects.create(A2, { key: 'NEW', name: 'x' }), 'PROJECT_KEY_TAKEN', 409);
      // the database copy carries them too
      const copy = await other.copyDb({ system: true }, { type: 'sqlite', file: ':memory:' });
      assert.ok(copy.tables.issue_key_aliases >= 80);
    } finally { await other.close(); }
    // importing a second copy into the same database: the key is taken, aliases stay with their owner
    await rejectsCode(assert, S.exchange.importMyboard(A, file), 'PROJECT_KEY_TAKEN', 409);
    const twin = await S.exchange.importMyboard(A, file, { key: 'TWIN' });
    assert.equal((await S.issues.get(A, 'TWIN-7')).projectId, twin.id);
    assert.equal((await S.issues.get(A, 'NEW-7')).id, ids[6], 'the alias still belongs to the original');
    await S.projects.remove(A, twin.id);

    // deleting the project frees its keys
    await S.projects.remove(A, p.id);
    assert.equal(await core.db.count('project_key_aliases', { project_id: p.id }), 0);
    const reused = await S.projects.create(A, { key: 'NEW', name: 'Reused' });
    assert.equal(reused.key, 'NEW');
    await S.projects.remove(A, reused.id);
  });

  test('project key rename is set-based: 2000 issues quickly', async () => {
    const p = await S.projects.create(A, { key: 'BIG', name: 'Big', template: 'simple' });
    const typeId = (await S.projects.config(A, p.id)).types[0].id;
    const statusId = (await S.projects.config(A, p.id)).statuses[0].id;
    const rows = [];
    for (let n = 1; n <= 2000; n++) rows.push({ id: `big${String(n).padStart(17, '0')}`, project_id: p.id, number: n, key: `BIG-${n}`, type_id: typeId, status_id: statusId, summary: `bulk ${n}`, rank: `z${String(n).padStart(6, '0')}`, created_at: 1, updated_at: 1 });
    await core.db.insertMany('issues', rows);
    await core.db.run('UPDATE "projects" SET "issue_seq" = 2000 WHERE "id" = ?', [p.id]);
    const t0 = Date.now();
    await S.projects.update(A, p.id, { key: 'HUGE', rev: p.rev });
    const ms = Date.now() - t0;
    assert.ok(ms < 5000, `rename took ${ms} ms`);
    assert.equal((await S.issues.get(A, 'BIG-1999')).key, 'HUGE-1999');
    assert.equal(await core.db.count('issue_key_aliases', { issue_id: rows.map((r) => r.id).slice(0, 500) }), 500);
    await S.projects.remove(A, p.id);
  });

  test('label rename, merge, delete and apply (undo), per project and global', async () => {
    const p = await S.projects.create(A, { key: 'LAB', name: 'Labels', template: 'simple' });
    const q = await S.projects.create(A, { key: 'LAQ', name: 'Labels 2', template: 'simple' });
    const mk = (labels, pid = p.id) => S.issues.create(A, { projectId: pid, summary: labels.join(' ') || 'none', labels });
    const i1 = await mk(['bug', 'ui']);
    const i2 = await mk(['bug']);
    const i3 = await mk(['Bug', 'ui']);
    const i4 = await mk(['bug'], q.id);
    const labelsOf = async (i) => (await S.issues.get(A, i.id)).labels;

    assert.deepEqual(await S.labels.list(A, p.id), [{ label: 'Bug', count: 1 }, { label: 'bug', count: 2 }, { label: 'ui', count: 2 }]);
    await rejectsCode(assert, S.labels.rename(A, p.id, { from: 'nope', to: 'x' }), 'LABEL_NOT_FOUND', 404);
    await rejectsCode(assert, S.labels.rename(A, p.id, { from: 'bug', to: 'bug' }), 'SAME_LABEL');
    await rejectsCode(assert, S.labels.rename(A, p.id, { from: 'bug', to: '  ' }), 'REQUIRED');
    await S.projects.setMember(A, p.id, { userId: bob.id, role: 'member' });
    await rejectsCode(assert, S.labels.rename(BOB, p.id, { from: 'bug', to: 'x' }), 'PROJECT_PERMISSION', 403);
    await rejectsCode(assert, S.labels.rename(BOB, null, { from: 'bug', to: 'x' }), 'ADMIN_REQUIRED', 403);
    assert.deepEqual((await S.labels.list(BOB, null)).map((l) => l.label), ['Bug', 'bug', 'ui'], 'global list: only visible projects');

    // rename (spaces become dashes, case is kept)
    events.length = 0;
    const r = await S.labels.rename(A, p.id, { from: 'ui', to: 'front end' });
    await core.events.idle();
    assert.equal(r.to, 'front-end');
    assert.equal(r.merged, false);
    assert.equal(r.count, 2);
    assert.deepEqual(await labelsOf(i1), ['bug', 'front-end']);
    const ev = events.find((e) => e.type === 'label.renamed');
    assert.ok(ev.topics.includes(`project:${p.id}`) && ev.topics.includes(`issue:${i1.id}`));
    const hist = (await S.history.list(A, i1.id));
    const last = (hist.items ?? hist).filter((x) => x.field === 'labels').pop();
    assert.equal(last.fromValue, 'bug ui');
    assert.equal(last.toValue, 'bug front-end');
    assert.deepEqual(await keysOf('labels = front-end'), [i1.key, i3.key].sort());

    // merge: "Bug" into "bug" (i3 had only Bug); an issue with both keeps one
    await S.issues.update(A, i2.id, { labels: ['Bug', 'bug'] });
    const m = await S.labels.rename(A, p.id, { from: 'Bug', to: 'bug' });
    assert.equal(m.merged, true);
    assert.deepEqual(m.issueIds.sort(), [i2.id, i3.id].sort());
    assert.deepEqual(m.addedIds, [i3.id]);
    assert.deepEqual(await labelsOf(i2), ['bug']);
    assert.deepEqual(await labelsOf(i3), ['bug', 'front-end']);
    assert.deepEqual(await labelsOf(i4), ['bug'], 'the other project is untouched');
    // undo of the merge with apply: Bug back on both, bug off where it was added
    await S.labels.apply(A, p.id, { changes: [{ label: 'Bug', add: m.issueIds }, { label: 'bug', remove: m.addedIds }] });
    assert.deepEqual(await labelsOf(i2), ['Bug', 'bug']);
    assert.deepEqual(await labelsOf(i3), ['Bug', 'front-end']);
    // apply refuses issues of another project silently (they are not in the scope)
    assert.equal((await S.labels.apply(A, p.id, { changes: [{ label: 'zzz', add: [i4.id] }] })).count, 0);

    // delete in the project, then globally
    const d = await S.labels.remove(A, p.id, 'bug');
    assert.equal(d.count, 2);
    assert.deepEqual(await labelsOf(i1), ['front-end']);
    assert.deepEqual(await labelsOf(i4), ['bug']);
    await S.labels.apply(A, p.id, { changes: [{ label: 'bug', add: d.issueIds }] });
    assert.deepEqual(await labelsOf(i1), ['bug', 'front-end']);
    events.length = 0;
    const g = await S.labels.remove(A, null, 'bug');
    await core.events.idle();
    assert.equal(g.count, 3);
    assert.deepEqual(await labelsOf(i4), []);
    assert.deepEqual(events.filter((e) => e.type === 'label.deleted').map((e) => e.data.projectId).sort(), [p.id, q.id].sort());
    const gr = await S.labels.rename(A, null, { from: 'front-end', to: 'web' });
    assert.equal(gr.count, 2);
    assert.deepEqual((await S.labels.list(A, null)).filter((l) => l.label !== 'pay'), [{ label: 'Bug', count: 2 }, { label: 'web', count: 2 }]);
    await S.projects.remove(A, p.id);
    await S.projects.remove(A, q.id);
  });
}

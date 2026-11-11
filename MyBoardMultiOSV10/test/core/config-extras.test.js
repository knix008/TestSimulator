// Configuration extras, end to end through the REST API on every configured database: resolution icon/colour,
// component default assignee, custom field defaults + "applies to issue types", the workflow diagram layout
// (rev, export/import, DB copy), and the v1 → v2 migration of an existing database.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startWeb } from '../../server/web.js';
import { openDatabase } from '../../core/db/index.js';
import { migrate, DEFAULT_RESOLUTIONS } from '../../core/db/migrate.js';
import { SCHEMA_VERSION } from '../../core/db/schema.js';
import { TARGETS, freshConfig, configured, skipMessage } from './helpers/targets.js';

const tmpDir = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

function client(base, headers = {}) {
  return async (method, p, body) => {
    const res = await fetch(base + p, { method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const type = res.headers.get('content-type') || '';
    return { status: res.status, data: type.includes('json') ? await res.json() : null };
  };
}
/** The answer's data, or a failed assertion naming the error. */
const ok = (r, what = '') => { assert.ok(r.status < 300, `${what} → ${r.status} ${JSON.stringify(r.data?.error ?? r.data)}`); return r.data; };
const errCode = (r) => r.data?.error?.code;

for (const target of TARGETS) {
  if (!configured(target)) {
    test(`${target.name} configuration extras`, (t) => t.skip(skipMessage(target)));
    continue;
  }
  describe(`${target.name} configuration extras`, () => {
    let web; let A; let pid; let cfg; let alice; let bob; let story; let bug; let epic;
    const dataDir = tmpDir('myboard-extras-');
    before(async () => {
      web = await startWeb({ port: 0, host: '127.0.0.1', dataDir, staticDir: path.join(dataDir, 'dist'), db: await freshConfig(target), scheduler: false });
      const setup = await client(web.url)('POST', '/api/auth/setup', { username: 'boss', password: 'boss-pw', displayName: 'Boss' });
      A = client(web.url, { authorization: `Bearer ${setup.data.token}` });
      alice = ok(await A('POST', '/api/users', { username: 'alice', displayName: 'Alice', password: 'alice-pw' }));
      bob = ok(await A('POST', '/api/users', { username: 'bob', displayName: 'Bob', password: 'bob-pw' }));
      const p = ok(await A('POST', '/api/projects', { key: 'EXT', name: 'Extras', template: 'software' }));
      pid = p.id;
      for (const u of [alice, bob]) ok(await A('POST', `/api/projects/${pid}/members`, { userId: u.id, role: 'member' }));
      cfg = ok(await A('GET', `/api/projects/${pid}/config`));
      const type = (name) => cfg.types.find((t) => t.name === name);
      [story, bug, epic] = [type('Story'), type('Bug'), type('Epic')];
    });
    after(async () => { await web?.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

    test('resolutions carry an icon and a colour (defaults seeded, round trip, conflict)', async () => {
      const list = ok(await A('GET', '/api/resolutions'));
      assert.deepEqual(list.map((r) => [r.name, r.icon, r.color]), DEFAULT_RESOLUTIONS.map((r) => [r.name, r.icon, r.color]));
      const made = ok(await A('POST', '/api/resolutions', { name: 'Cannot Reproduce', icon: 'b:search#868e96', color: '#868e96' }));
      assert.deepEqual([made.icon, made.color], ['b:search#868e96', '#868e96']);
      const up = ok(await A('PATCH', `/api/resolutions/${made.id}`, { icon: 'e:🤷', color: '#1c7ed6', rev: made.rev }));
      assert.deepEqual([up.icon, up.color, up.rev], ['e:🤷', '#1c7ed6', made.rev + 1]);
      assert.equal(errCode(await A('PATCH', `/api/resolutions/${made.id}`, { color: '#000000', rev: made.rev })), 'CONFLICT');
      const inConfig = ok(await A('GET', `/api/projects/${pid}/config`)).resolutions.find((r) => r.id === made.id);
      assert.equal(inConfig.icon, 'e:🤷');
      const board = ok(await A('GET', `/api/boards/${cfg.boards[0].id}/data`));
      assert.equal(board.resolutions.find((r) => r.id === made.id).color, '#1c7ed6', 'board data has the resolutions (cards show the icon)');
      ok(await A('DELETE', `/api/resolutions/${made.id}`));
    });

    test('components: default assignee on create (first component that has one, else the project default)', async () => {
      const api = ok(await A('POST', `/api/projects/${pid}/components`, { name: 'API', defaultAssigneeId: alice.id }));
      const web2 = ok(await A('POST', `/api/projects/${pid}/components`, { name: 'Web', defaultAssigneeId: bob.id }));
      const docs = ok(await A('POST', `/api/projects/${pid}/components`, { name: 'Docs' }));
      assert.equal(api.defaultAssigneeId, alice.id);
      assert.equal(errCode(await A('POST', `/api/projects/${pid}/components`, { name: 'Bad', defaultAssigneeId: 'nobody' })), 'INVALID_USER');
      const make = async (body) => ok(await A('POST', '/api/issues', { projectId: pid, summary: 'c', ...body }), 'create issue');
      assert.equal((await make({ componentIds: [web2.id, api.id] })).assigneeId, bob.id, 'first listed component wins');
      assert.equal((await make({ componentIds: [docs.id, api.id] })).assigneeId, alice.id, 'components without one are skipped');
      assert.equal((await make({ componentIds: [api.id], assigneeId: bob.id })).assigneeId, bob.id, 'an explicit assignee wins');
      assert.equal((await make({ componentIds: [api.id], assigneeId: null })).assigneeId, null, 'explicit null = unassigned');
      assert.equal((await make({ componentIds: [docs.id] })).assigneeId, null);
      const p = ok(await A('GET', `/api/projects/${pid}`));
      ok(await A('PATCH', `/api/projects/${pid}`, { defaultAssigneeId: bob.id, rev: p.rev }));
      assert.equal((await make({ componentIds: [docs.id] })).assigneeId, bob.id, 'project default when no component has one');
      const later = await make({ assigneeId: null });
      const patched = ok(await A('PATCH', `/api/issues/${later.id}`, { componentIds: [api.id], rev: later.rev }));
      assert.equal(patched.assigneeId, null, 'only creation assigns (like the project default)');
      const cleared = ok(await A('PATCH', `/api/projects/${pid}/components/${api.id}`, { defaultAssigneeId: null, rev: api.rev }));
      assert.equal(cleared.defaultAssigneeId, null);
      const p2 = ok(await A('GET', `/api/projects/${pid}`));
      ok(await A('PATCH', `/api/projects/${pid}`, { defaultAssigneeId: null, rev: p2.rev }));
    });

    let fSev; let fNote; let fPts; let fTeam; let fOwner; let fOk;
    test('custom fields: default value checked by type, issue type list validated', async () => {
      fSev = ok(await A('POST', `/api/projects/${pid}/fields`, { name: 'Severity', type: 'select', options: [{ value: 'Minor', icon: 'b:flag' }, { value: 'Major' }], defaultValue: 'minor', issueTypeIds: [bug.id] }));
      assert.equal(fSev.defaultValue, 'Minor', 'option value text, case of the option');
      assert.deepEqual(fSev.issueTypeIds, [bug.id]);
      fNote = ok(await A('POST', `/api/projects/${pid}/fields`, { name: 'Note', type: 'text', defaultValue: 'Check the logs' }));
      fPts = ok(await A('POST', `/api/projects/${pid}/fields`, { name: 'Risk', type: 'number', defaultValue: '3', issueTypeIds: [] }));
      assert.deepEqual([fNote.defaultValue, fPts.defaultValue, fPts.issueTypeIds], ['Check the logs', 3, null]);
      fTeam = ok(await A('POST', `/api/projects/${pid}/fields`, { name: 'Teams', type: 'multiselect', options: ['Red', 'Blue', 'Green'], defaultValue: ['Blue', 'Red'], issueTypeIds: [story.id, bug.id] }));
      assert.deepEqual(fTeam.defaultValue, ['Blue', 'Red']);
      fOwner = ok(await A('POST', `/api/projects/${pid}/fields`, { name: 'Owner', type: 'user', defaultValue: alice.id, issueTypeIds: [story.id] }));
      fOk = ok(await A('POST', `/api/projects/${pid}/fields`, { name: 'Approved', type: 'checkbox', defaultValue: true }));
      assert.equal(fOk.defaultValue, true);
      assert.equal(errCode(await A('POST', `/api/projects/${pid}/fields`, { name: 'X1', type: 'number', defaultValue: 'abc' })), 'INVALID_NUMBER');
      assert.equal(errCode(await A('POST', `/api/projects/${pid}/fields`, { name: 'X2', type: 'select', options: ['A'], defaultValue: 'B' })), 'INVALID_OPTION');
      assert.equal(errCode(await A('POST', `/api/projects/${pid}/fields`, { name: 'X3', type: 'date', defaultValue: '1.2.2026' })), 'INVALID_DATE');
      assert.equal(errCode(await A('POST', `/api/projects/${pid}/fields`, { name: 'X4', type: 'text', issueTypeIds: ['nope'] })), 'INVALID_TYPE');
      // renaming the default option follows it; deleting it drops the default
      const renamed = ok(await A('PATCH', `/api/projects/${pid}/fields/${fSev.id}`, { options: fSev.options.map((o) => (o.value === 'Minor' ? { ...o, value: 'Low' } : o)), rev: fSev.rev }));
      assert.equal(renamed.defaultValue, 'Low');
      const unset = ok(await A('PATCH', `/api/projects/${pid}/fields/${fNote.id}`, { defaultValue: '', rev: fNote.rev }));
      assert.equal(unset.defaultValue, null);
      fNote = ok(await A('PATCH', `/api/projects/${pid}/fields/${fNote.id}`, { defaultValue: 'Check the logs', rev: unset.rev }));
      fSev = renamed;
    });

    test('custom fields: defaults fill POST /issues, applicability on create and PATCH, values kept on type change', async () => {
      const b = ok(await A('POST', '/api/issues', { projectId: pid, typeId: bug.id, summary: 'Crash' }));
      assert.equal(b.custom[fSev.id], 'Low');
      assert.equal(b.custom[fNote.id], 'Check the logs');
      assert.equal(b.custom[fPts.id], 3);
      assert.deepEqual(b.custom[fTeam.id], ['Blue', 'Red']);
      assert.equal(b.custom[fOk.id], true);
      assert.equal(b.custom[fOwner.id], undefined, 'Owner does not apply to bugs');
      const s = ok(await A('POST', '/api/issues', { projectId: pid, typeId: story.id, summary: 'Login', custom: { Note: null, [fPts.id]: 8 } }));
      assert.equal(s.custom[fNote.id], undefined, 'an explicit empty value is kept empty');
      assert.equal(s.custom[fPts.id], 8);
      assert.equal(s.custom[fOwner.id], alice.id);
      assert.equal(s.custom[fSev.id], undefined);
      // JQL sees default values like typed ones
      const found = ok(await A('GET', `/api/issues?jql=${encodeURIComponent(`project = EXT AND Severity = Low`)}`));
      assert.deepEqual(found.items.map((i) => i.key), [b.key]);
      // not applicable: refused on create and on PATCH
      assert.equal(errCode(await A('POST', '/api/issues', { projectId: pid, typeId: story.id, summary: 'x', custom: { Severity: 'Major' } })), 'FIELD_NOT_APPLICABLE');
      const r = await A('PATCH', `/api/issues/${s.id}`, { custom: { [fSev.id]: 'Major' }, rev: s.rev });
      assert.deepEqual([r.status, errCode(r)], [400, 'FIELD_NOT_APPLICABLE']);
      // the type changes: values stay stored; sending them back unchanged is fine; clearing is allowed
      const e = ok(await A('PATCH', `/api/issues/${b.id}`, { typeId: story.id, rev: b.rev }));
      assert.equal(e.custom[fSev.id], 'Low', 'Jira keeps values of fields that no longer apply');
      const same = ok(await A('PATCH', `/api/issues/${b.id}`, { custom: e.custom, summary: 'Crash!', rev: e.rev }));
      assert.equal(same.summary, 'Crash!');
      assert.equal(errCode(await A('PATCH', `/api/issues/${b.id}`, { custom: { [fSev.id]: 'Major' }, rev: same.rev })), 'FIELD_NOT_APPLICABLE');
      const cleared = ok(await A('PATCH', `/api/issues/${b.id}`, { custom: { [fSev.id]: null }, rev: same.rev }));
      assert.equal(cleared.custom[fSev.id], undefined);
      // a required field that does not apply is not required
      const req = ok(await A('POST', `/api/projects/${pid}/fields`, { name: 'Steps', type: 'textarea', required: true, issueTypeIds: [bug.id] }));
      ok(await A('POST', '/api/issues', { projectId: pid, typeId: story.id, summary: 'no steps needed' }));
      assert.equal(errCode(await A('POST', '/api/issues', { projectId: pid, typeId: bug.id, summary: 'steps needed' })), 'REQUIRED');
      // clone copies only applicable values and adds no defaults
      const src = ok(await A('POST', '/api/issues', { projectId: pid, typeId: bug.id, summary: 'to clone', custom: { Steps: '1. open', Note: null } }));
      const copy = ok(await A('POST', `/api/issues/${src.id}/clone`, {}));
      assert.equal(copy.custom[fNote.id], undefined);
      assert.equal(copy.custom[req.id], '1. open');
      // deleting an issue type takes it out of the fields' lists (the replacement takes its place)
      const tmp = ok(await A('POST', `/api/projects/${pid}/types`, { name: 'Spike', level: 0 }));
      const f2 = ok(await A('POST', `/api/projects/${pid}/fields`, { name: 'Spike notes', type: 'text', issueTypeIds: [tmp.id, bug.id] }));
      ok(await A('DELETE', `/api/projects/${pid}/types/${tmp.id}`));
      assert.deepEqual(ok(await A('GET', `/api/projects/${pid}/fields/${f2.id}`)).issueTypeIds, [bug.id]);
      ok(await A('DELETE', `/api/projects/${pid}/fields/${req.id}`));
      ok(await A('DELETE', `/api/projects/${pid}/fields/${f2.id}`));
    });

    test('custom fields: CSV import uses defaults and skips cells of fields that do not apply', async () => {
      const csv = 'Summary,Type,Severity,Note\nCsv bug,Bug,Major,\nCsv story,Story,Major,Typed note\n';
      const out = ok(await A('POST', '/api/import/csv', { projectId: pid, csv, mapping: { Summary: 'summary', Type: 'type', Severity: `custom:${fSev.id}`, Note: `custom:${fNote.id}` } }));
      assert.deepEqual(out.errors, []);
      const [b, s] = await Promise.all(out.issues.map(async (i) => ok(await A('GET', `/api/issues/${i.id}`))));
      assert.equal(b.custom[fSev.id], 'Major');
      assert.equal(b.custom[fNote.id], 'Check the logs', 'an empty cell gets the default');
      assert.equal(s.custom[fSev.id], undefined, 'Severity does not apply to stories: the cell is left out');
      assert.equal(s.custom[fNote.id], 'Typed note');
      assert.equal(s.custom[fOwner.id], alice.id);
    });

    test('workflow layout: PATCH with rev, config, export/import, DB copy', async () => {
      const wf = cfg.workflows[0];
      const [s1, s2] = cfg.statuses;
      const layout = { [s1.id]: { x: 120, y: 40 }, [s2.id]: { x: 380, y: 126 } };
      const saved = ok(await A('PATCH', `/api/projects/${pid}/workflows/${wf.id}`, { layout, rev: wf.rev }));
      assert.deepEqual(saved.layout, layout);
      assert.equal(saved.rev, wf.rev + 1);
      assert.equal(errCode(await A('PATCH', `/api/projects/${pid}/workflows/${wf.id}`, { layout: {}, rev: wf.rev })), 'CONFLICT');
      assert.equal(errCode(await A('PATCH', `/api/projects/${pid}/workflows/${wf.id}`, { layout: { [s1.id]: { x: 'a' } }, rev: saved.rev })), 'INVALID_LAYOUT');
      assert.equal(errCode(await A('PATCH', `/api/projects/${pid}/workflows/${wf.id}`, { layout: [1, 2], rev: saved.rev })), 'INVALID_LAYOUT');
      assert.deepEqual(ok(await A('GET', `/api/projects/${pid}/config`)).workflows[0].layout, layout);
      // export / import maps the status ids (the keys) to the copy's statuses
      const exported = ok(await A('GET', `/api/projects/${pid}/export`), 'export');
      assert.equal(exported.format, 'myboard');
      const copy = ok(await A('POST', '/api/import/myboard', { file: exported, key: 'EXTC', name: 'Extras copy' }));
      const cc = ok(await A('GET', `/api/projects/${copy.id}/config`));
      const byName = (list, id) => list.find((s) => s.name === cfg.statuses.find((x) => x.id === id).name).id;
      assert.deepEqual(cc.workflows[0].layout, { [byName(cc.statuses, s1.id)]: layout[s1.id], [byName(cc.statuses, s2.id)]: layout[s2.id] });
      const f = cc.fields.find((x) => x.name === 'Severity');
      assert.deepEqual([f.defaultValue, f.issueTypeIds], ['Low', [cc.types.find((t) => t.name === 'Bug').id]], 'field extras travel and map too');
      assert.equal(cc.fields.find((x) => x.name === 'Owner').defaultValue, alice.id, 'user default kept (same users)');
      // DB copy carries every new column
      const dir = tmpDir('myboard-extras-copy-');
      const target2 = path.join(dir, 'copy.sqlite3');
      await web.core.copyDb({ system: true }, { type: 'sqlite', file: target2 });
      const other = await openDatabase({ type: 'sqlite', file: target2 });
      try {
        assert.deepEqual(JSON.parse((await other.get('SELECT "layout" FROM "workflows" WHERE "id" = ?', [wf.id])).layout), layout);
        assert.equal((await other.get('SELECT "default_value" FROM "custom_fields" WHERE "id" = ?', [fSev.id])).default_value, '"Low"');
        assert.equal((await other.get('SELECT "icon" FROM "resolutions" WHERE "name" = ?', ['Done'])).icon, 'b:done');
      } finally { await other.close(); fs.rmSync(dir, { recursive: true, force: true }); }
    });
  });
}

// ───────────────────────── migration of an existing (version 1) database

const OLD_DB = [
  { name: 'SQLite', open: async (dir) => ({ type: 'sqlite', file: path.join(dir, 'v1.sqlite3') }) },
  { name: 'PostgreSQL (PGlite)', open: async () => { const { PGlite } = await import('@electric-sql/pglite'); return { type: 'postgres', pglite: new PGlite() }; } },
];
const NEW_COLUMNS = [['resolutions', 'icon'], ['resolutions', 'color'], ['components', 'default_assignee_id'], ['custom_fields', 'default_value'], ['custom_fields', 'issue_type_ids'], ['workflows', 'layout']];

for (const t of OLD_DB) {
  test(`${t.name}: migrating a version 1 database adds the new columns and default resolution icons (idempotent)`, async () => {
    const dir = tmpDir('myboard-v1-');
    const db = await openDatabase(await t.open(dir));
    try {
      await migrate(db);
      // turn it into what version 1 left behind: no new columns, version 1, resolutions without icons
      for (const [table, col] of NEW_COLUMNS) await db.run(`ALTER TABLE ${db.q(table)} DROP COLUMN ${db.q(col)}`);
      await db.run('UPDATE "meta" SET "value" = ? WHERE "key" = ?', ['1', 'schema_version']);
      await db.run('INSERT INTO "resolutions" ("id", "name", "position", "created_at", "updated_at", "rev") VALUES (?, ?, ?, ?, ?, ?)', ['zzzzzzzzzzzzzzzzzzzz', 'Mine', 9, 1, 1, 1]);
      const first = await migrate(db);
      assert.deepEqual([first.from, first.to, first.created], [1, SCHEMA_VERSION, []]);
      const rows = await db.select('resolutions', {}, { order: 'position' });
      assert.deepEqual(rows.map((r) => [r.name, r.icon ?? null, r.color ?? null]), [...DEFAULT_RESOLUTIONS.map((r) => [r.name, r.icon, r.color]), ['Mine', null, null]]);
      for (const [table, col] of NEW_COLUMNS) await db.run(`SELECT ${db.q(col)} FROM ${db.q(table)}`);
      // a cleared icon stays cleared: the data step runs once
      await db.run('UPDATE "resolutions" SET "icon" = NULL WHERE "name" = ?', ['Done']);
      const second = await migrate(db);
      assert.deepEqual([second.from, second.created], [SCHEMA_VERSION, []]);
      assert.equal((await db.get('SELECT "icon" FROM "resolutions" WHERE "name" = ?', ['Done'])).icon, null);
    } finally {
      await db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

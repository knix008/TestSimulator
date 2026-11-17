import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { databaseMissing, ensureSchema, inspectSchema, openEngine, validDatabaseName } from '../../server/engine.mjs';
import { checkPassword } from '../../server/repository.mjs';
import { createTable, INDEXES, SCHEMA_VERSION, schemaFor, schemaScript, TABLE_NAMES, TABLES } from '../../server/schema.mjs';
import { ensureAdmin, upgradeWorkspace, userByAccount } from '../../src/domain/store.js';

function tempFile() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'mwf-schema-'));
  return { dir, file: path.join(dir, 'db.sqlite'), done: () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* still held */ } } };
}

describe('Schema', () => {
  test('a new database gets every table, the indexes and the current version', async () => {
    const engine = await openEngine({ engine: 'sqlite', file: ':memory:' });
    assert.deepEqual([...engine.schemaChanges.created].sort(), [...TABLE_NAMES].sort());
    const status = await inspectSchema(engine);
    assert.equal(status.version, SCHEMA_VERSION);
    assert.equal(status.ready, true);
    assert.deepEqual(status.missing, []);
    const indexes = await engine.query("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'ix_%'", []);
    assert.equal(indexes.length, INDEXES.length);
    await engine.close();
  });

  test('a version 1 database (no version row) is upgraded in place, keeping its rows', async () => {
    const temp = tempFile();
    const old = new DatabaseSync(temp.file);
    // The tables as the earlier release made them, with a saved workspace and no schema_version row.
    for (const table of TABLES) old.exec(createTable('sqlite', table));
    old.prepare('INSERT INTO workspace_document (id, body, saved_at) VALUES (?, ?, ?)').run('main', '{"users":[]}', 'then');
    old.close();
    const engine = await openEngine({ engine: 'sqlite', file: temp.file, schema: false });
    const before = await inspectSchema(engine);
    assert.equal(before.version, 1);
    assert.equal(before.ready, false);
    assert.deepEqual(before.pending.map((step) => step.version), [2]);
    const changes = await ensureSchema(engine);
    assert.deepEqual(changes, { created: [], applied: [2] });
    const after = await inspectSchema(engine);
    assert.equal(after.ready, true);
    assert.equal(after.tables.find((table) => table.name === 'workspace_document').rows, 1);
    assert.deepEqual(await ensureSchema(engine), { created: [], applied: [] });
    await engine.close();
    temp.done();
  });

  test('a missing table is reported and created again', async () => {
    const engine = await openEngine({ engine: 'sqlite', file: ':memory:' });
    await engine.exec('DROP TABLE chat_files');
    const status = await inspectSchema(engine);
    assert.deepEqual(status.missing, ['chat_files']);
    assert.equal(status.ready, false);
    assert.deepEqual((await ensureSchema(engine)).created, ['chat_files']);
    assert.equal((await inspectSchema(engine)).ready, true);
    await engine.close();
  });

  test('a database from a newer program is refused, not changed', async () => {
    const engine = await openEngine({ engine: 'sqlite', file: ':memory:' });
    await engine.exec("UPDATE app_meta SET meta_value = '99' WHERE meta_key = 'schema_version'");
    assert.equal((await inspectSchema(engine)).newer, true);
    await assert.rejects(() => ensureSchema(engine), /schema-newer/);
    await engine.close();
  });

  test('key columns are bounded where the server cannot index unbounded text', () => {
    assert.match(schemaFor('mysql').join('\n'), /id VARCHAR\(191\) PRIMARY KEY/);
    assert.match(schemaFor('mssql').join('\n'), /id NVARCHAR\(191\) PRIMARY KEY/);
    assert.doesNotMatch(schemaFor('mssql').join('\n'), /IF NOT EXISTS/);
    assert.match(schemaFor('mssql').join('\n'), /IF OBJECT_ID\(N'workspace_document', N'U'\) IS NULL/);
  });

  test('the SQL script holds the tables, the indexes and the version for each engine', () => {
    for (const engine of ['sqlite', 'mysql', 'mariadb', 'postgres', 'mssql']) {
      const sql = schemaScript(engine);
      for (const name of TABLE_NAMES) assert.match(sql, new RegExp(`CREATE TABLE (IF NOT EXISTS )?${name} `), `${engine} ${name}`);
      for (const index of INDEXES) assert.match(sql, new RegExp(index.name), `${engine} ${index.name}`);
      assert.match(sql, new RegExp(`'schema_version', '${SCHEMA_VERSION}'`));
    }
    assert.match(schemaScript('mssql'), /\nGO/);
  });

  test('tells a missing database from other connection errors, and checks the name', () => {
    assert.equal(databaseMissing({ code: 'ER_BAD_DB_ERROR' }), true);
    assert.equal(databaseMissing({ code: '3D000' }), true);
    assert.equal(databaseMissing({ originalError: { info: { number: 4060 } } }), true);
    assert.equal(databaseMissing({ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED' }), false);
    assert.equal(validDatabaseName('myworkforce_1'), true);
    assert.equal(validDatabaseName('bad name'), false);
    assert.equal(validDatabaseName('x`; DROP'), false);
  });

  test('a fresh install has an administrator who signs in with the first password', () => {
    const ws = upgradeWorkspace({});
    const admin = userByAccount(ws.users, 'admin');
    assert.ok(admin);
    assert.equal(checkPassword('admin', admin.passwordHash), true);
    assert.equal(ensureAdmin(ws), false);
  });
});

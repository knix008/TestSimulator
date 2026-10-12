const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { describe, it } = require('../lib/framework');
const { ensureDatabaseReady, isMissingDatabaseError } = require('../../src/db/ensure-database');

describe('Database auto-creation helpers', () => {
  it('detects a missing MySQL database error', () => {
    assert.equal(isMissingDatabaseError({ code: 'ER_BAD_DB_ERROR' }, 'mysql2'), true);
    assert.equal(isMissingDatabaseError({ errno: 1049 }, 'mysql2'), true);
    assert.equal(isMissingDatabaseError({ message: "Unknown database 'x'" }, 'mysql2'), true);
    assert.equal(isMissingDatabaseError({ code: 'ECONNREFUSED' }, 'mysql2'), false);
  });

  it('detects a missing PostgreSQL database error', () => {
    assert.equal(isMissingDatabaseError({ code: '3D000' }, 'pg'), true);
    assert.equal(isMissingDatabaseError({ message: 'database "x" does not exist' }, 'pg'), true);
    assert.equal(isMissingDatabaseError({ message: 'password authentication failed' }, 'pg'), false);
  });

  it('detects a missing MSSQL database error', () => {
    assert.equal(isMissingDatabaseError({ number: 4060 }, 'mssql'), true);
    assert.equal(isMissingDatabaseError({ message: 'Cannot open database "x"' }, 'mssql'), true);
  });

  it('never reports a missing database for SQLite', () => {
    assert.equal(isMissingDatabaseError({ message: 'unknown database' }, 'sqlite3'), false);
  });

  it('reports created=true for a SQLite file that does not exist yet', async () => {
    const filename = path.join(process.env.KANBAN_DATA_PATH, 'ensure', 'new.db');
    const result = await ensureDatabaseReady('sqlite', { client: 'sqlite3', connection: { filename } });
    assert.equal(result.created, true);
    assert.ok(fs.existsSync(path.dirname(filename)), 'parent directory should be created');
  });

  it('reports created=false for an existing SQLite file', async () => {
    const filename = path.join(process.env.KANBAN_DATA_PATH, 'ensure', 'existing.db');
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, '');
    const result = await ensureDatabaseReady('sqlite', { client: 'sqlite3', connection: { filename } });
    assert.equal(result.created, false);
  });

  it('ignores unknown database types', async () => {
    const result = await ensureDatabaseReady('unknown', { client: 'other' });
    assert.deepEqual(result, { created: false });
  });
});

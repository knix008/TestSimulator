const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { describe, it } = require('../lib/framework');
const connection = require('../../src/db/connection');

describe('DB connection configuration', () => {
  it('uses KANBAN_DATA_PATH as the data directory', () => {
    assert.equal(connection.getDataPath(), process.env.KANBAN_DATA_PATH);
  });

  it('creates the uploads directory inside the data directory', () => {
    const dir = connection.getUploadsPath();
    assert.equal(dir, path.join(process.env.KANBAN_DATA_PATH, 'uploads'));
    assert.ok(fs.existsSync(dir));
  });

  it('defaults to SQLite when no db-config.json exists', () => {
    const cfg = connection.getCurrentConfig();
    assert.equal(cfg.client, 'sqlite3');
    assert.equal(cfg.connection.filename, path.join(process.env.KANBAN_DATA_PATH, 'kanban.db'));
  });

  it('builds a SQLite knex config', () => {
    const cfg = connection.buildKnexConfig({ dbType: 'sqlite', filename: 'C:/tmp/a.db' });
    assert.deepEqual(cfg, { client: 'sqlite3', connection: { filename: 'C:/tmp/a.db' }, useNullAsDefault: true });
  });

  it('builds a MySQL / MariaDB knex config with default port 3306', () => {
    for (const dbType of ['mysql', 'mariadb']) {
      const cfg = connection.buildKnexConfig({ dbType, host: 'db', database: 'kanban', username: 'u', password: 'p' });
      assert.equal(cfg.client, 'mysql2');
      assert.equal(cfg.connection.host, 'db');
      assert.equal(cfg.connection.port, 3306);
      assert.equal(cfg.connection.user, 'u');
    }
  });

  it('builds a PostgreSQL knex config with default port 5432', () => {
    const cfg = connection.buildKnexConfig({ dbType: 'postgresql', host: 'pg', database: 'kanban', username: 'u' });
    assert.equal(cfg.client, 'pg');
    assert.equal(cfg.connection.port, 5432);
  });

  it('builds an MSSQL knex config using "server" and port 1433', () => {
    const cfg = connection.buildKnexConfig({ dbType: 'mssql', host: 'sql', port: '', database: 'kanban', username: 'sa' });
    assert.equal(cfg.client, 'mssql');
    assert.equal(cfg.connection.server, 'sql');
    assert.equal(cfg.connection.port, 1433);
    assert.equal(cfg.connection.options.trustServerCertificate, true);
  });

  it('honours a custom port', () => {
    const cfg = connection.buildKnexConfig({ dbType: 'mysql', host: 'db', port: '3307', database: 'k', username: 'u' });
    assert.equal(cfg.connection.port, 3307);
  });

  it('rejects unsupported database types', () => {
    assert.throws(() => connection.buildKnexConfig({ dbType: 'oracle' }));
  });
});

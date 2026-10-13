const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { describe, it, before, after } = require('../lib/framework');
const { createMemoryDb } = require('../lib/memory-db');
const { runMigrations, seedDefaultAdmin } = require('../../src/db/migrate');

const TABLES = ['users', 'boards', 'board_members', 'columns', 'cards', 'attachments', 'comments', 'comment_attachments'];

describe('Schema migrations', () => {
  let db;
  before(async () => {
    db = createMemoryDb();
    await runMigrations(db);
  });
  after(async () => { await db.destroy(); });

  it('creates every application table', async () => {
    for (const table of TABLES) {
      assert.equal(await db.schema.hasTable(table), true, `table "${table}" should exist`);
    }
  });

  it('creates the color, type and comment columns', async () => {
    assert.ok(await db.schema.hasColumn('boards', 'bg_color'));
    assert.ok(await db.schema.hasColumn('columns', 'type'));
    assert.ok(await db.schema.hasColumn('columns', 'bg_color'));
    assert.ok(await db.schema.hasColumn('cards', 'stripe_color'));
    assert.ok(await db.schema.hasColumn('cards', 'due_date'));
    assert.ok(await db.schema.hasColumn('comments', 'deleted'));
    assert.ok(await db.schema.hasColumn('board_members', 'role'));
  });

  it('seeds the default admin account (admin / admin)', async () => {
    const admin = await db('users').where({ username: 'admin' }).first();
    assert.ok(admin, 'admin user should exist');
    assert.equal(admin.role, 'admin');
    assert.equal(admin.status, 'active');
    assert.equal(await bcrypt.compare('admin', admin.password), true);
  });

  it('is idempotent when run again', async () => {
    await runMigrations(db);
    const admins = await db('users').where({ username: 'admin' });
    assert.equal(admins.length, 1);
  });

  it('does not overwrite an existing admin when seeding', async () => {
    await db('users').where({ username: 'admin' }).update({ display_name: 'Custom Admin' });
    await seedDefaultAdmin(db);
    const admin = await db('users').where({ username: 'admin' }).first();
    assert.equal(admin.display_name, 'Custom Admin');
  });

  it('upgrades a legacy cards table by copying color into stripe_color', async () => {
    const legacy = createMemoryDb();
    try {
      await legacy.schema.createTable('cards', (t) => {
        t.increments('id');
        t.integer('column_id');
        t.string('title');
        t.string('color', 20);
        t.integer('position');
      });
      await legacy('cards').insert({ column_id: 1, title: 'old', color: 'red', position: 0 });
      await runMigrations(legacy);
      const card = await legacy('cards').first();
      assert.equal(card.stripe_color, 'red');
      assert.ok(await legacy.schema.hasColumn('cards', 'assignee_id'));
    } finally {
      await legacy.destroy();
    }
  });
});

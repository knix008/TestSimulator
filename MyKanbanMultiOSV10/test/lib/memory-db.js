const knex = require('knex');
const { runMigrations } = require('../../src/db/migrate');

/* In-memory SQLite DB. A single pooled connection keeps every query on the same database. */
function createMemoryDb() {
  return knex({
    client: 'sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
    pool: { min: 1, max: 1 },
  });
}

async function createMigratedDb() {
  const db = createMemoryDb();
  await runMigrations(db);
  return db;
}

module.exports = { createMemoryDb, createMigratedDb };

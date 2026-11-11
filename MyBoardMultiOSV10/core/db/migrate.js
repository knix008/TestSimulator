// Create / upgrade the schema. Idempotent: creates missing tables, indexes and columns, then runs
// versioned data steps. schema_version is kept in meta.
import { TABLES, SCHEMA_VERSION } from './schema.js';
import { createTableSql, createIndexSql, addColumnSql, listTablesSql, listColumnsSql } from './sqlgen.js';
import { newId } from '../ids.js';

/** Default global priorities (position 0 = highest) and resolutions. */
export const DEFAULT_PRIORITIES = [
  { name: 'Highest', icon: 'b:priority-highest', color: '#d0312d' },
  { name: 'High', icon: 'b:priority-high', color: '#e8590c' },
  { name: 'Medium', icon: 'b:priority-medium', color: '#e9a100' },
  { name: 'Low', icon: 'b:priority-low', color: '#2b8a3e' },
  { name: 'Lowest', icon: 'b:priority-lowest', color: '#1c7ed6' },
];
export const DEFAULT_RESOLUTIONS = [
  { name: 'Done', description: 'Work has been completed.' },
  { name: "Won't Do", description: 'This will not be worked on.' },
  { name: 'Duplicate', description: 'The problem is a duplicate of an existing issue.' },
];

/**
 * @param {import('./base.js').Db} db
 * @returns {Promise<{ from: number, to: number, created: string[] }>}
 */
export async function migrate(db) {
  const existing = new Set((await db.all(listTablesSql(db.dialect))).map((r) => String(r.name).toLowerCase()));
  const created = [];
  for (const t of TABLES) {
    if (existing.has(t.name)) {
      const cols = new Set((await db.all(listColumnsSql(db.dialect), [t.name])).map((r) => String(r.name).toLowerCase()));
      for (const c of t.columns) if (!cols.has(c.name)) await db.run(addColumnSql(db.dialect, t.name, c));
      continue;
    }
    await db.run(createTableSql(db.dialect, t));
    for (const ix of createIndexSql(db.dialect, t)) await db.run(ix);
    created.push(t.name);
  }
  const row = await db.get('SELECT "value" FROM "meta" WHERE "key" = ?', ['schema_version']);
  const from = row ? Number(row.value) : 0;
  if (from < 1) await seedGlobals(db);
  if (from !== SCHEMA_VERSION) {
    await db.tx(async () => {
      await db.run('DELETE FROM "meta" WHERE "key" = ?', ['schema_version']);
      await db.insert('meta', { key: 'schema_version', value: String(SCHEMA_VERSION) });
    });
  }
  return { from, to: SCHEMA_VERSION, created };
}

async function seedGlobals(db) {
  await db.tx(async () => {
    if (!(await db.count('priorities'))) {
      let i = 0;
      for (const p of DEFAULT_PRIORITIES) await db.insert('priorities', { id: newId(), ...p, position: i++ });
    }
    if (!(await db.count('resolutions'))) {
      let i = 0;
      for (const r of DEFAULT_RESOLUTIONS) await db.insert('resolutions', { id: newId(), ...r, position: i++ });
    }
  });
}

/** Drop every MyBoard table (tests and "copy into a non-empty database" with overwrite). */
export async function dropAll(db) {
  const existing = new Set((await db.all(listTablesSql(db.dialect))).map((r) => String(r.name).toLowerCase()));
  for (const t of [...TABLES].reverse()) if (existing.has(t.name)) await db.run(`DROP TABLE ${db.q(t.name)}`);
}

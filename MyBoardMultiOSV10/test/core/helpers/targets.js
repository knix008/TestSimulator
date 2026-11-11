// Database targets for the integration suites. SQLite and PostgreSQL (PGlite, in-process WASM) always run;
// MySQL, MariaDB and SQL Server run when a connection URL is given in the environment.
import { PGlite } from '@electric-sql/pglite';
import { openDatabase, parseDbUrl } from '../../../core/db/index.js';
import { dropAll } from '../../../core/db/migrate.js';

export const TARGETS = [
  { name: 'SQLite', make: async () => ({ type: 'sqlite', file: ':memory:' }) },
  { name: 'PostgreSQL (PGlite)', make: async () => ({ type: 'postgres', pglite: new PGlite() }) },
  { name: 'MySQL', env: 'MYBOARD_TEST_MYSQL' },
  { name: 'MariaDB', env: 'MYBOARD_TEST_MARIADB' },
  { name: 'SQL Server', env: 'MYBOARD_TEST_MSSQL' },
];

/** A fresh, empty database config for a target (server databases are wiped first). */
export async function freshConfig(target) {
  if (target.make) return target.make();
  const cfg = parseDbUrl(process.env[target.env]);
  if (target.env === 'MYBOARD_TEST_MARIADB') cfg.type = 'mariadb';
  const db = await openDatabase(cfg);
  try { await dropAll(db); } finally { await db.close(); }
  return cfg;
}

export const configured = (t) => !t.env || !!process.env[t.env];
// Skipped on purpose when no server is configured; set the variable to a connection URL
// (mysql:// · mariadb:// · mssql://user:password@localhost/myboard_test) to run the suite.
export const skipMessage = (t) => `no ${t.name} server (${t.env})`;

/** Assert a promise rejects with an AppError code (and HTTP status). */
export async function rejectsCode(assert, promise, code, status) {
  let err = null;
  try { await promise; } catch (e) { err = e; }
  assert.ok(err, `expected ${code}`);
  assert.equal(err.code, code, `expected ${code}, got ${err.code}: ${err.message}`);
  if (status) assert.equal(err.status, status);
  return err;
}

/** Local-time timestamp `n` days after `base` (midnight) at `h` hours. */
export const dayAt = (base, n, h = 0, m = 0) => { const d = new Date(base); d.setDate(d.getDate() + n); d.setHours(h, m, 0, 0); return d.getTime(); };

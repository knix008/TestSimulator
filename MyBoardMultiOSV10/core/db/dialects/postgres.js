// PostgreSQL through `pg` (a pool), or an injected PGlite instance (tests / embedded use).
import { Db, singleConnectionDriver } from '../base.js';

/**
 * @param {object} options { host, port, database, user, password, ssl?, options?, pglite?: PGlite instance }
 * @returns {Promise<Db>}
 */
export async function openPostgres(options = {}) {
  if (options.pglite) return openPglite(options.pglite);
  const pg = (await import('pg')).default;
  // int8 / numeric come back as strings by default; the core stores epoch ms in BIGINT and wants numbers
  const types = {
    getTypeParser(oid, format) {
      if (oid === 20 || oid === 1700) return (v) => (v === null ? null : Number(v));
      return pg.types.getTypeParser(oid, format);
    },
  };
  const pool = new pg.Pool({
    host: options.host || 'localhost', port: Number(options.port) || 5432, database: options.database,
    user: options.user, password: options.password, ssl: options.ssl ? { rejectUnauthorized: false } : undefined,
    max: 10, types, connectionTimeoutMillis: 10000, ...(options.options || {}),
  });
  pool.on('error', () => { /* idle client errors are reported on the next query */ });
  const exec = async (client, sql, params) => {
    const r = await client.query(sql, params);
    return { rows: r.rows || [], changes: r.rowCount ?? 0 };
  };
  const driver = {
    exec: (sql, params) => exec(pool, sql, params),
    async begin() {
      const client = await pool.connect();
      try { await client.query('BEGIN'); } catch (e) { client.release(); throw e; }
      let open = true;
      const end = async (stmt) => { if (!open) return; open = false; try { await client.query(stmt); } finally { client.release(); } };
      return { exec: (sql, params) => exec(client, sql, params), commit: () => end('COMMIT'), rollback: () => end('ROLLBACK') };
    },
    close: () => pool.end(),
  };
  return new Db('postgres', driver, { type: 'postgres', label: `PostgreSQL ${options.host || 'localhost'}/${options.database || ''}` });
}

/** PGlite (WASM Postgres): one connection, so statements are serialised like SQLite. */
function openPglite(pglite) {
  const run = async (sql, params) => {
    const r = await pglite.query(sql, params);
    return { rows: r.rows || [], changes: r.affectedRows ?? 0 };
  };
  const driver = singleConnectionDriver(run, { begin: 'BEGIN', commit: 'COMMIT', rollback: 'ROLLBACK', close: () => pglite.close() });
  return new Db('postgres', driver, { type: 'postgres', label: 'PostgreSQL (PGlite)' });
}

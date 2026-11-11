// MySQL and MariaDB through mysql2/promise.
import { Db } from '../base.js';

/**
 * @param {object} options { host, port, database, user, password, ssl?, options?, type: 'mysql'|'mariadb' }
 * @returns {Promise<Db>}
 */
export async function openMysql(options = {}) {
  const mysql = (await import('mysql2/promise')).default;
  const pool = mysql.createPool({
    host: options.host || 'localhost', port: Number(options.port) || 3306, database: options.database,
    user: options.user, password: options.password, ssl: options.ssl ? { rejectUnauthorized: false } : undefined,
    connectionLimit: 10, charset: 'utf8mb4', decimalNumbers: true, supportBigNumbers: true, bigNumberStrings: false,
    dateStrings: true, timezone: 'Z', ...(options.options || {}),
  });
  const exec = async (conn, sql, params) => {
    // query() (not execute()) — prepared statement caches on the server are limited and LIMIT params differ
    const [res] = await conn.query(sql, params);
    if (Array.isArray(res)) return { rows: res, changes: 0 };
    return { rows: [], changes: res.affectedRows ?? 0 };
  };
  const driver = {
    exec: (sql, params) => exec(pool, sql, params),
    async begin() {
      const conn = await pool.getConnection();
      try { await conn.query('START TRANSACTION'); } catch (e) { conn.release(); throw e; }
      let open = true;
      const end = async (stmt) => { if (!open) return; open = false; try { await conn.query(stmt); } finally { conn.release(); } };
      return { exec: (sql, params) => exec(conn, sql, params), commit: () => end('COMMIT'), rollback: () => end('ROLLBACK') };
    },
    close: () => pool.end(),
  };
  const type = options.type === 'mariadb' ? 'mariadb' : 'mysql';
  const label = `${type === 'mariadb' ? 'MariaDB' : 'MySQL'} ${options.host || 'localhost'}/${options.database || ''}`;
  return new Db('mysql', driver, { type, label });
}

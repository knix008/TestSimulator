// openDatabase(config) → Db (ARCHITECTURE §2).
import { openSqlite } from './dialects/sqlite.js';

export const DB_TYPES = ['sqlite', 'mysql', 'mariadb', 'postgres', 'mssql'];

/**
 * @param {{ type?: string, file?: string, host?: string, port?: number, database?: string, user?: string,
 *           password?: string, ssl?: boolean, options?: object, pglite?: object }} config
 * @returns {Promise<import('./base.js').Db>}
 */
export async function openDatabase(config = {}) {
  const type = config.type || 'sqlite';
  switch (type) {
    case 'sqlite': return openSqlite(config);
    case 'mysql':
    case 'mariadb': return (await import('./dialects/mysql.js')).openMysql({ ...config, type });
    case 'postgres':
    case 'postgresql': return (await import('./dialects/postgres.js')).openPostgres(config);
    case 'mssql':
    case 'sqlserver': return (await import('./dialects/mssql.js')).openMssql(config);
    default: {
      const { ValidationError } = await import('../errors.js');
      throw new ValidationError('DB_TYPE_UNKNOWN', `Unknown database type: ${type}`);
    }
  }
}

/**
 * Parse a connection URL (mysql://u:p@h:3306/db, mariadb://…, postgres://…, mssql://…, sqlite:path) into a config.
 * @param {string} url
 */
export function parseDbUrl(url) {
  if (/^sqlite:/i.test(url)) return { type: 'sqlite', file: url.replace(/^sqlite:(\/\/)?/i, '') || ':memory:' };
  const u = new URL(url);
  const scheme = u.protocol.replace(':', '').toLowerCase();
  const type = { postgresql: 'postgres', pg: 'postgres', sqlserver: 'mssql' }[scheme] || scheme;
  const cfg = {
    type, host: u.hostname, port: u.port ? Number(u.port) : undefined, database: decodeURIComponent(u.pathname.replace(/^\//, '')),
    user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
  };
  if (u.searchParams.get('ssl') === 'true' || u.searchParams.get('encrypt') === 'true') cfg.ssl = true;
  return cfg;
}

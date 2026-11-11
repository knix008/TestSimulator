// createCore(config) → { db, services, events, close() } (ARCHITECTURE §1).
//
// config: {
//   db: { type, ...options },        database (see core/db/index.js); default SQLite file in dataDir
//   dataDir?: string,                 where the default SQLite file lives
//   mode?: 'desktop' | 'web',
//   scheduler?: boolean,              run scheduled automation rules (default true; tests pass false)
//   changeLog?: boolean,              write every event to change_log (web mode: feed for multi-server realtime)
//   maxAttachmentBytes?: number,
// }
import path from 'node:path';
import { openDatabase, parseDbUrl } from './db/index.js';
import { migrate, dropAll } from './db/migrate.js';
import { TABLES } from './db/schema.js';
import { listTablesSql } from './db/sqlgen.js';
import { EventBus } from './events.js';
import { createServices } from './services/index.js';
import { newId } from './ids.js';
import { VERSION } from './version.js';
import { AppError, check } from './errors.js';
import { requireAdmin } from './services/common.js';

const AUTOMATION_EVENTS = ['issue.created', 'issue.transitioned', 'issue.updated', 'comment.created'];
const CHANGE_LOG_DAYS = 7;

/**
 * @param {object} config
 */
export async function createCore(config = {}) {
  const dbConfig = defaultDbConfig(config);
  const db = await openDatabase(dbConfig);
  try { await migrate(db); } catch (err) { await db.close().catch(() => {}); throw err; }

  const core = {
    version: VERSION,
    config,
    mode: config.mode || 'desktop',
    events: new EventBus(),
    db,
    dbConfig,
    services: null,
    timers: [],

    /** Stop timers and close the database. */
    async close() {
      core.stopScheduler();
      await core.events.idle();
      await core.db.close();
    },

    startScheduler(intervalMs = 60000) {
      if (core.timers.length) return;
      const tick = async () => {
        try {
          await core.services.automation.tick();
          await core.services.users.pruneSessions();
          if (config.changeLog) await core.db.run('DELETE FROM "change_log" WHERE "at" < ?', [Date.now() - CHANGE_LOG_DAYS * 86400000]);
        } catch (err) { console.error('[scheduler]', err.message); }
      };
      const t = setInterval(tick, intervalMs);
      t.unref?.();
      core.timers.push(t);
    },
    stopScheduler() { for (const t of core.timers) clearInterval(t); core.timers = []; },

    // ---- database administration (desktop settings / web admin) ---------------------------------------------
    /** Try a connection: → { ok, type, label, schemaVersion, tables, users, projects } or { ok: false, error }. */
    async testDb(ctx, cfg) {
      requireAdmin(ctx);
      let other;
      try {
        other = await openDatabase(normaliseDbConfig(cfg));
        await other.get('SELECT 1 AS x');
        const tables = (await other.all(listTablesSql(other.dialect))).map((r) => String(r.name).toLowerCase());
        const ours = TABLES.filter((t) => tables.includes(t.name)).length;
        let users = 0; let projects = 0; let schemaVersion = null;
        if (tables.includes('meta')) schemaVersion = Number((await other.get('SELECT "value" FROM "meta" WHERE "key" = ?', ['schema_version']))?.value ?? 0) || null;
        if (tables.includes('users')) users = await other.count('users');
        if (tables.includes('projects')) projects = await other.count('projects');
        return { ok: true, type: other.info.type, label: other.info.label, schemaVersion, tables: ours, users, projects, empty: !users && !projects };
      } catch (err) {
        return { ok: false, error: { code: err.code && /^[A-Z_]+$/.test(err.code) ? err.code : 'DB_CONNECT_FAILED', message: err.message } };
      } finally {
        if (other) await other.close().catch(() => {});
      }
    },

    /** Connect to another database (migrating it) and make it the live one. Returns the new info. */
    async switchDb(ctx, cfg) {
      requireAdmin(ctx);
      const next = await openDatabase(normaliseDbConfig(cfg));
      try { await migrate(next); } catch (err) { await next.close().catch(() => {}); throw new AppError('DB_MIGRATE_FAILED', err.message, 400); }
      const old = core.db;
      core.db = next;
      core.dbConfig = normaliseDbConfig(cfg);
      await core.events.idle();
      await old.close().catch(() => {});
      core.events.emit({ type: 'db.switched', topics: ['db'], data: next.info, at: Date.now() });
      return next.info;
    },

    /**
     * Copy every row of the live database into another one. The target must be empty unless overwrite is set
     * (then its MyBoard tables are dropped first). → { tables: { name: rows }, total }
     */
    async copyDb(ctx, cfg, { overwrite = false } = {}) {
      requireAdmin(ctx);
      const target = await openDatabase(normaliseDbConfig(cfg));
      try {
        if (overwrite) await dropAll(target);
        await migrate(target);
        const users = await target.count('users');
        const projects = await target.count('projects');
        if ((users || projects) && !overwrite) throw new AppError('DB_NOT_EMPTY', 'The target database already has data', 409, { users, projects });
        const counts = {};
        let total = 0;
        await target.tx(async () => {
          for (const t of TABLES) await target.run(`DELETE FROM ${target.q(t.name)}`);
          for (const t of TABLES) {
            const order = t.pk;
            let n = 0;
            for (let offset = 0; ; offset += 500) {
              const rows = await core.db.select(t.name, {}, { order, limit: 500, offset });
              if (!rows.length) break;
              await target.insertMany(t.name, rows);
              n += rows.length;
              if (rows.length < 500) break;
            }
            counts[t.name] = n;
            total += n;
          }
        });
        return { tables: counts, total };
      } finally {
        await target.close().catch(() => {});
      }
    },
  };
  core.services = createServices(core);

  // subscribers: automation + notifications (history is written inside the service transactions)
  for (const type of AUTOMATION_EVENTS) {
    core.events.on(type, (ev) => core.services.automation.onEvent(ev));
    core.events.on(type, (ev) => core.services.notifications.onEvent(ev));
  }
  if (config.changeLog) {
    core.events.on('*', (ev) => {
      if (!ev.topics?.length || ev.type.startsWith('notification.')) return undefined;
      return core.db.insert('change_log', { seq: newId(), topic: ev.topics[0], type: ev.type, payload: JSON.stringify({ ...ev, data: undefined }), at: ev.at || Date.now() });
    });
  }
  if (config.scheduler !== false) core.startScheduler();
  return core;
}

/** The configured DB, or SQLite in dataDir. */
function defaultDbConfig(config) {
  if (config.db) return normaliseDbConfig(config.db);
  return { type: 'sqlite', file: config.dataDir ? path.join(config.dataDir, 'myboard.sqlite3') : ':memory:' };
}

/** Accept { url } or field configs; validates the type. */
export function normaliseDbConfig(cfg) {
  check(cfg && typeof cfg === 'object', 'DB_CONFIG_INVALID', 'A database configuration is required');
  if (cfg.url) return { ...parseDbUrl(cfg.url), ...(cfg.pglite ? { pglite: cfg.pglite } : {}) };
  const type = cfg.type || 'sqlite';
  check(['sqlite', 'mysql', 'mariadb', 'postgres', 'mssql'].includes(type), 'DB_TYPE_UNKNOWN', `Unknown database type: ${type}`);
  if (type === 'sqlite') check(cfg.file, 'DB_CONFIG_INVALID', 'file is required for SQLite');
  else if (!cfg.pglite) check(cfg.host && cfg.database, 'DB_CONFIG_INVALID', 'host and database are required');
  return { ...cfg, type };
}

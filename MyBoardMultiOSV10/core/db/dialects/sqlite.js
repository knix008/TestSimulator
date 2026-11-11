// SQLite through node:sqlite (built into Node ≥ 22.13 — no native module to build or ship).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { Db, singleConnectionDriver } from '../base.js';

/**
 * @param {{ file?: string }} options  file ':memory:' allowed
 * @returns {Promise<Db>}
 */
export async function openSqlite(options = {}) {
  const file = options.file || ':memory:';
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const conn = new DatabaseSync(file);
  conn.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = OFF;');
  const cache = new Map();
  const prepare = (sql) => {
    let st = cache.get(sql);
    if (!st) {
      st = conn.prepare(sql);
      if (cache.size > 500) cache.clear();
      cache.set(sql, st);
    }
    return st;
  };
  const run = async (sql, params) => {
    if (!params.length && /^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(sql)) { conn.exec(sql); return { rows: [], changes: 0 }; }
    const st = prepare(sql);
    if (/^\s*(SELECT|WITH|PRAGMA)/i.test(sql)) return { rows: st.all(...params), changes: 0 };
    const r = st.run(...params);
    return { rows: [], changes: Number(r.changes) };
  };
  const driver = singleConnectionDriver(run, {
    begin: 'BEGIN IMMEDIATE', commit: 'COMMIT', rollback: 'ROLLBACK',
    close: () => { cache.clear(); conn.close(); },
  });
  return new Db('sqlite', driver, { type: 'sqlite', label: file === ':memory:' ? 'SQLite (memory)' : `SQLite ${path.basename(file)}` });
}

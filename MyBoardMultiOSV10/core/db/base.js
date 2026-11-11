// Db: the dialect-independent database interface (ARCHITECTURE §2).
//
// A dialect supplies a *driver*:
//   driver.exec(sql, params)  → Promise<{ rows, changes }>   (sql already rewritten for the dialect)
//   driver.begin()            → Promise<{ exec, commit(), rollback() }>  a connection pinned for a transaction
//   driver.close()
// The Db class adds placeholder/quote rewriting, value normalisation, helpers and transactions.
//
// Transactions: tx(fn) runs fn inside a transaction. While it runs, *every* call on this Db made from the
// same async context goes to the pinned connection (AsyncLocalStorage), so services can call helpers that
// take `db` without threading a handle around, and nested tx() calls join the outer one.
import { AsyncLocalStorage } from 'node:async_hooks';
import { rewriteSql, quoteIdent, limitClause } from './sqlgen.js';
import { TABLE } from './schema.js';
import { ConflictError } from '../errors.js';

export class Db {
  /**
   * @param {import('./sqlgen.js').Dialect} dialect
   * @param {object} driver
   * @param {object} [info] { type, label } for /info
   */
  constructor(dialect, driver, info = {}) {
    this.dialect = dialect;
    this.driver = driver;
    this.info = { type: info.type || dialect, label: info.label || dialect };
    this.als = new AsyncLocalStorage();
    this.sqlCache = new Map();
    /** count of executed statements (tests / diagnostics) */
    this.stats = { queries: 0 };
  }

  /** Portable SQL → dialect SQL (cached). */
  sql(text) {
    let s = this.sqlCache.get(text);
    if (s === undefined) {
      s = rewriteSql(this.dialect, text);
      if (this.sqlCache.size > 2000) this.sqlCache.clear();
      this.sqlCache.set(text, s);
    }
    return s;
  }

  q(name) { return quoteIdent(this.dialect, name); }

  limitClause(limit, offset) { return limitClause(this.dialect, limit, offset); }

  /** True while the current async context runs inside tx(). */
  get inTx() { const s = this.als.getStore(); return !!(s && !s.done); }

  async exec(sql, params = []) {
    const store = this.als.getStore();
    const target = store && !store.done ? store.conn : this.driver;
    this.stats.queries++;
    const p = params.map(toDbValue);
    try {
      return await target.exec(this.sql(sql), p);
    } catch (err) {
      err.sql = sql;
      throw err;
    }
  }

  /** @returns {Promise<object[]>} */
  async all(sql, params = []) { return (await this.exec(sql, params)).rows.map(normaliseRow); }

  /** @returns {Promise<object|null>} */
  async get(sql, params = []) {
    const { rows } = await this.exec(sql, params);
    return rows.length ? normaliseRow(rows[0]) : null;
  }

  /** @returns {Promise<{changes: number}>} */
  async run(sql, params = []) { const r = await this.exec(sql, params); return { changes: r.changes ?? 0 }; }

  /** Value of the first column of the first row (or `fallback`). */
  async value(sql, params = [], fallback = null) {
    const row = await this.get(sql, params);
    if (!row) return fallback;
    const v = Object.values(row)[0];
    return v == null ? fallback : v;
  }

  /**
   * Run `fn` in a transaction; nested calls join the outer transaction.
   * @template T
   * @param {(db: Db) => Promise<T>} fn
   * @returns {Promise<T>}
   */
  async tx(fn) {
    if (this.inTx) return fn(this);
    const conn = await this.driver.begin();
    const store = { conn, done: false, after: [] };
    try {
      const result = await this.als.run(store, () => fn(this));
      store.done = true;
      await conn.commit();
      for (const cb of store.after) cb();
      return result;
    } catch (err) {
      store.done = true;
      try { await conn.rollback(); } catch { /* connection may already be gone */ }
      throw err;
    }
  }

  /** Run `fn` after the current transaction commits (dropped on rollback), or now when not in a transaction. */
  afterCommit(fn) {
    const s = this.als.getStore();
    if (s && !s.done) s.after.push(fn); else fn();
  }

  // ---- helpers --------------------------------------------------------------------------------------------

  /** Fill defaults/timestamps from the schema and drop unknown keys. */
  prepareRow(table, row) {
    const t = TABLE[table];
    if (!t) throw new Error(`unknown table ${table}`);
    const out = {};
    for (const c of t.columns) {
      let v = row[c.name];
      if (v === undefined) {
        if (c.default !== undefined) v = c.default;
        else if ((c.name === 'created_at' || c.name === 'updated_at') && c.notNull) v = Date.now();
        else if (c.name === 'rev') v = 1;
        else v = null;
      }
      if (c.type === 'json' && v !== null && typeof v !== 'string') v = JSON.stringify(v);
      out[c.name] = v;
    }
    return out;
  }

  /** INSERT one row; returns the stored row (with defaults). */
  async insert(table, row) {
    const r = this.prepareRow(table, row);
    const cols = Object.keys(r);
    await this.run(`INSERT INTO ${this.q(table)} (${cols.map((c) => this.q(c)).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, cols.map((c) => r[c]));
    return r;
  }

  /** INSERT many rows with multi-row statements, chunked under every dialect's parameter limit. */
  async insertMany(table, rows) {
    if (!rows.length) return;
    const prepared = rows.map((r) => this.prepareRow(table, r));
    const cols = Object.keys(prepared[0]);
    const per = Math.max(1, Math.min(500, Math.floor(1000 / cols.length)));
    const head = `INSERT INTO ${this.q(table)} (${cols.map((c) => this.q(c)).join(', ')}) VALUES `;
    const tuple = `(${cols.map(() => '?').join(', ')})`;
    await this.tx(async () => {
      for (let i = 0; i < prepared.length; i += per) {
        const chunk = prepared.slice(i, i + per);
        const params = [];
        for (const r of chunk) for (const c of cols) params.push(r[c]);
        await this.run(head + chunk.map(() => tuple).join(', '), params);
      }
    });
  }

  /**
   * UPDATE by id. With `opts.rev` the update is optimistic: `AND rev = ?`, rev+1, ConflictError on 0 rows.
   * Sets updated_at when the table has it. Returns the updated row.
   */
  async update(table, id, patch, opts = {}) {
    const t = TABLE[table];
    const cols = [];
    const params = [];
    for (const c of t.columns) {
      if (!(c.name in patch) || c.name === 'id' || c.name === 'rev' || c.name === 'created_at') continue;
      let v = patch[c.name];
      if (v === undefined) continue;
      if (c.type === 'json' && v !== null && typeof v !== 'string') v = JSON.stringify(v);
      cols.push(`${this.q(c.name)} = ?`);
      params.push(v);
    }
    if (t.columns.some((c) => c.name === 'updated_at') && !('updated_at' in patch)) { cols.push(`${this.q('updated_at')} = ?`); params.push(Date.now()); }
    if (t.mutable) cols.push(`${this.q('rev')} = ${this.q('rev')} + 1`);
    let where = `${this.q('id')} = ?`;
    params.push(id);
    if (opts.rev != null && t.mutable) { where += ` AND ${this.q('rev')} = ?`; params.push(Number(opts.rev)); }
    if (cols.length) {
      const r = await this.run(`UPDATE ${this.q(table)} SET ${cols.join(', ')} WHERE ${where}`, params);
      if (r.changes === 0) {
        const current = await this.get(`SELECT * FROM ${this.q(table)} WHERE ${this.q('id')} = ?`, [id]);
        if (!current) return null;
        if (opts.rev != null) throw new ConflictError('The item was changed by someone else', current);
      }
    }
    return this.get(`SELECT * FROM ${this.q(table)} WHERE ${this.q('id')} = ?`, [id]);
  }

  /** DELETE rows matching an equality map `{ col: value }` (value array → IN). */
  async remove(table, where) {
    const { sql, params } = this.whereSql(where);
    return this.run(`DELETE FROM ${this.q(table)}${sql}`, params);
  }

  /**
   * SELECT * with an equality map. opts: { order: 'col' | 'col DESC' | ['a', 'b DESC'], limit, offset, columns }
   */
  async select(table, where = {}, opts = {}) {
    const { sql, params } = this.whereSql(where);
    const cols = opts.columns ? opts.columns.map((c) => this.q(c)).join(', ') : '*';
    let text = `SELECT ${cols} FROM ${this.q(table)}${sql}`;
    const order = this.orderSql(opts.order);
    if (order) text += ` ORDER BY ${order}`;
    if (opts.limit != null || opts.offset) {
      if (!order && this.dialect === 'mssql') text += ' ORDER BY (SELECT NULL)';
      text += this.limitClause(opts.limit, opts.offset);
    }
    return this.all(text, params);
  }

  async selectOne(table, where) {
    const rows = await this.select(table, where);
    return rows[0] || null;
  }

  async count(table, where = {}) {
    const { sql, params } = this.whereSql(where);
    return Number(await this.value(`SELECT COUNT(*) AS n FROM ${this.q(table)}${sql}`, params, 0));
  }

  whereSql(where) {
    const parts = [];
    const params = [];
    for (const [k, v] of Object.entries(where || {})) {
      if (v === undefined) continue;
      if (v === null) parts.push(`${this.q(k)} IS NULL`);
      else if (Array.isArray(v)) {
        if (!v.length) { parts.push('1 = 0'); continue; }
        parts.push(`${this.q(k)} IN (${v.map(() => '?').join(', ')})`);
        params.push(...v);
      } else { parts.push(`${this.q(k)} = ?`); params.push(v); }
    }
    return { sql: parts.length ? ' WHERE ' + parts.join(' AND ') : '', params };
  }

  orderSql(order) {
    if (!order) return '';
    const list = Array.isArray(order) ? order : [order];
    return list.map((o) => {
      const [col, dir] = o.trim().split(/\s+/);
      return this.q(col) + (dir && /^desc$/i.test(dir) ? ' DESC' : '');
    }).join(', ');
  }

  async close() { await this.driver.close(); }
}

/** JS value → driver value. Booleans → 0/1, undefined → null, Uint8Array → Buffer. */
export function toDbValue(v) {
  if (v === undefined) return null;
  if (v === true) return 1;
  if (v === false) return 0;
  if (v instanceof Uint8Array && !Buffer.isBuffer(v)) return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
  if (typeof v === 'bigint') return Number(v);
  return v;
}

/** Driver row → plain object: Uint8Array → Buffer, bigint → number. */
function normaliseRow(row) {
  const out = {};
  for (const k in row) {
    const v = row[k];
    if (v instanceof Uint8Array && !Buffer.isBuffer(v)) out[k] = Buffer.from(v.buffer, v.byteOffset, v.byteLength);
    else if (typeof v === 'bigint') out[k] = Number(v);
    else out[k] = v;
  }
  return out;
}

/**
 * A driver around ONE connection (node:sqlite, PGlite): statements are serialised with a mutex; a
 * transaction holds the mutex until commit/rollback so other requests wait instead of joining it.
 * @param {(sql: string, params: any[]) => Promise<{rows: any[], changes: number}>} run
 * @param {{ begin: string, commit: string, rollback: string, close: () => any }} opts
 */
export function singleConnectionDriver(run, opts) {
  let tail = Promise.resolve();
  const lock = () => {
    let release;
    const p = new Promise((r) => { release = r; });
    const prev = tail;
    tail = prev.then(() => p);
    return prev.then(() => release);
  };
  return {
    async exec(sql, params) {
      const release = await lock();
      try { return await run(sql, params); } finally { release(); }
    },
    async begin() {
      const release = await lock();
      try { await run(opts.begin, []); } catch (e) { release(); throw e; }
      let open = true;
      const end = async (stmt) => { if (!open) return; open = false; try { await run(stmt, []); } finally { release(); } };
      return { exec: (sql, params) => run(sql, params), commit: () => end(opts.commit), rollback: () => end(opts.rollback) };
    },
    async close() { await tail; await opts.close(); },
  };
}

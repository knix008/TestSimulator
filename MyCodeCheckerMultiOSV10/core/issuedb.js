'use strict';

// The issue lists of analyses in a local SQLite database (<configDir>/issues.db,
// node:sqlite). A list is stored as narrow rows that searches, filters, sorts
// and counts run on (issue) and the issue itself as JSON apart (body), so a
// page of a list of millions is read in milliseconds and a changed issue is
// one row, not a rewrite of the whole list.
//
//   lists(id, name UNIQUE, count)
//   issue(id, list, seq, key, rule, type, sev, status, file, line, lang,
//         engine, isnew, istd, text)      text: lower-case search text
//   body(id, data)                         data: the issue as JSON

const fs = require('fs');
const path = require('path');

const SEV_RANK = { BLOCKER: 0, CRITICAL: 1, MAJOR: 2, MINOR: 3, INFO: 4 };
const WRITE_CHUNK = 20000;

const arr = (v) => (v == null || v === false ? [] : Array.isArray(v) ? v : [v]);

// Coding standards of an issue (and its rule, when given), as the issue
// browser groups them (src/views/standards.js standardsOf / matchesStandard).
function standardsOf(issue, rule) {
  const out = {};
  for (const src of [rule && rule.standards, issue && issue.standards]) {
    if (!src) continue;
    for (const [k, v] of Object.entries(src)) {
      if (v === true || v === false) { out[k] = out[k] || v; continue; }
      out[k] = [...new Set([...arr(out[k] === true ? [] : out[k]), ...arr(v)])];
    }
  }
  const cert = (issue && issue.cert) || (rule && rule.cert);
  if (cert && !out.certC && !out.certCpp) out.cert = [cert];
  const tags = [...((rule && rule.tags) || []), ...((issue && issue.tags) || [])];
  if (tags.includes('cwe-top25')) out.cweTop25 = true;
  return out;
}
const STANDARD_IDS = ['mois', 'misraC', 'misraCpp', 'cert', 'cweTop25', 'owasp'];
function matchesStandard(std, id) {
  if (id === 'misraC') return arr(std.misraC2012).length + arr(std.misraC2023).length > 0;
  if (id === 'misraCpp') return arr(std.misraCpp2023).length > 0;
  if (id === 'cert') return arr(std.certC).length + arr(std.certCpp).length + arr(std.cert).length > 0;
  if (id === 'cweTop25') return std.cweTop25 === true || arr(std.cweTop25).length > 0;
  if (id === 'owasp') return arr(std.owasp2021).length + arr(std.owasp2017).length > 0;
  if (id === 'mois') return arr(std.mois2021).length > 0;
  return false;
}
/** The standard ids (STANDARD_IDS) an issue or rule belongs to. */
function standardIds(issue, rule) {
  const std = standardsOf(issue, rule);
  return STANDARD_IDS.filter((id) => matchesStandard(std, id));
}

const textOf = (m) => (m && typeof m === 'object' ? [m.en, m.ko].filter(Boolean).join(' ') : String(m || ''));

function row(issue) {
  return [
    issue.key || '', issue.rule || '', issue.type || '', SEV_RANK[issue.severity] ?? 5, issue.status || '',
    issue.file || '', Number(issue.line) || 0, issue.language || '', issue.engine || issue.externalEngine || 'core',
    issue.isNew ? 1 : 0, ` ${standardIds(issue, null).join(' ')} `,
    `${issue.rule || ''} ${textOf(issue.message)} ${issue.file || ''}`.toLowerCase(),
  ];
}

function open(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA temp_store=MEMORY; PRAGMA cache_size=-131072; PRAGMA busy_timeout=30000;');
  db.exec(`CREATE TABLE IF NOT EXISTS lists (id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL, count INTEGER NOT NULL DEFAULT 0, complete INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS issue (id INTEGER PRIMARY KEY, list INTEGER NOT NULL, seq INTEGER NOT NULL, key TEXT, rule TEXT, type TEXT, sev INTEGER, status TEXT, file TEXT, line INTEGER, lang TEXT, engine TEXT, isnew INTEGER, istd TEXT, text TEXT);
CREATE TABLE IF NOT EXISTS body (id INTEGER PRIMARY KEY, data TEXT);
CREATE INDEX IF NOT EXISTS issue_seq ON issue(list, seq);
CREATE INDEX IF NOT EXISTS issue_sev ON issue(list, sev, seq);
CREATE INDEX IF NOT EXISTS issue_key ON issue(list, key);
CREATE INDEX IF NOT EXISTS issue_rule ON issue(list, rule, sev, seq);
CREATE INDEX IF NOT EXISTS issue_type ON issue(list, type, sev, seq);
CREATE INDEX IF NOT EXISTS issue_file ON issue(list, file, line);`);

  const st = {
    listId: db.prepare('SELECT id, count, complete FROM lists WHERE name = ?'),
    newList: db.prepare('INSERT INTO lists (name, count, complete) VALUES (?, 0, 0)'),
    setCount: db.prepare('UPDATE lists SET count = ?, complete = ? WHERE id = ?'),
    insIssue: db.prepare('INSERT INTO issue (list, seq, key, rule, type, sev, status, file, line, lang, engine, isnew, istd, text) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)'),
    insBody: db.prepare('INSERT INTO body (id, data) VALUES (?, ?)'),
    delBody: db.prepare('DELETE FROM body WHERE id IN (SELECT id FROM issue WHERE list = ?)'),
    delIssue: db.prepare('DELETE FROM issue WHERE list = ?'),
    delList: db.prepare('DELETE FROM lists WHERE id = ?'),
    byKey: db.prepare('SELECT id FROM issue WHERE list = ? AND key = ?'),
    updIssue: db.prepare('UPDATE issue SET status = ?, isnew = ?, istd = ?, text = ? WHERE id = ?'),
    updBody: db.prepare('UPDATE body SET data = ? WHERE id = ?'),
    names: db.prepare('SELECT id, name FROM lists'),
  };

  function listOf(name) {
    const r = st.listId.get(name);
    return r ? { id: r.id, count: r.count, complete: !!r.complete } : null;
  }

  /** { count } of a stored (complete) list, else null. */
  function has(name) {
    const l = listOf(name);
    return l && l.complete ? { count: l.count } : null;
  }

  function begin(name) {
    const old = listOf(name);
    db.exec('BEGIN');
    try {
      if (old) { st.delBody.run(old.id); st.delIssue.run(old.id); st.delList.run(old.id); }
      const id = Number(st.newList.run(name).lastInsertRowid);
      db.exec('COMMIT');
      return id;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  function insertRange(id, issues, from, to) {
    db.exec('BEGIN');
    try {
      for (let n = from; n < to; n++) {
        const issue = issues[n];
        const r = st.insIssue.run(id, n, ...row(issue));
        st.insBody.run(Number(r.lastInsertRowid), JSON.stringify(issue));
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  /** Stores a whole list under name (replacing one of that name). */
  function write(name, issues) {
    const id = begin(name);
    for (let n = 0; n < issues.length; n += WRITE_CHUNK) insertRange(id, issues, n, Math.min(issues.length, n + WRITE_CHUNK));
    st.setCount.run(issues.length, 1, id);
  }

  /** write() a piece at a time, letting other calls run in between. */
  async function writeAsync(name, issues, onProgress) {
    const id = begin(name);
    for (let n = 0; n < issues.length; n += WRITE_CHUNK) {
      insertRange(id, issues, n, Math.min(issues.length, n + WRITE_CHUNK));
      if (onProgress) { try { onProgress(Math.min(issues.length, n + WRITE_CHUNK), issues.length); } catch { /* best effort */ } }
      await new Promise((resolve) => setImmediate(resolve));
    }
    st.setCount.run(issues.length, 1, id);
  }

  const readSql = 'SELECT b.data FROM issue i JOIN body b ON b.id = i.id WHERE i.list = ? AND i.seq >= ? AND i.seq < ? ORDER BY i.seq';
  /** The whole list, in its order. */
  function read(name) {
    const l = listOf(name);
    if (!l) return [];
    const out = [];
    for (const r of db.prepare('SELECT b.data FROM issue i JOIN body b ON b.id = i.id WHERE i.list = ? ORDER BY i.seq').iterate(l.id)) out.push(JSON.parse(r.data));
    return out;
  }
  /** read() a piece at a time. */
  async function readAsync(name, onProgress) {
    const l = listOf(name);
    if (!l) return [];
    const out = [];
    const q = db.prepare(readSql);
    for (let from = 0; from < l.count; from += WRITE_CHUNK) {
      for (const r of q.iterate(l.id, from, from + WRITE_CHUNK)) out.push(JSON.parse(r.data));
      if (onProgress) { try { onProgress(Math.min(l.count, from + WRITE_CHUNK), l.count); } catch { /* best effort */ } }
      await new Promise((resolve) => setImmediate(resolve));
    }
    return out;
  }

  /** Writes changed issues of a stored list (by key). */
  function update(name, issues) {
    const l = listOf(name);
    if (!l) return 0;
    let n = 0;
    db.exec('BEGIN');
    try {
      for (const issue of issues) {
        const r = st.byKey.get(l.id, issue.key);
        if (!r) continue;
        const [, , , , status, , , , , isnew, istd, text] = row(issue);
        st.updIssue.run(status, isnew, istd, text, r.id);
        st.updBody.run(JSON.stringify(issue), r.id);
        n++;
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    return n;
  }

  /** Drops the lists whose names are not in keep (a Set). */
  function keepOnly(keep) {
    for (const r of st.names.all()) {
      if (keep.has(r.name)) continue;
      db.exec('BEGIN');
      try { st.delBody.run(r.id); st.delIssue.run(r.id); st.delList.run(r.id); db.exec('COMMIT'); } catch (err) { db.exec('ROLLBACK'); throw err; }
    }
  }

  // ── search ──────────────────────────────────────────────
  // filter: { q, severity, type, status, newOnly, engine, standard,
  //   standardRules: [rule keys of that standard], lang: [file endings],
  //   hotspots: true | false | 'any', rules: [..], keys: [..], file: path prefix }
  function where(listId, f = {}) {
    const sql = ['i.list = ?'];
    const args = [listId];
    const drillRules = Array.isArray(f.rules) && f.rules.length ? f.rules : null;
    const drillKeys = Array.isArray(f.keys) && f.keys.length ? f.keys : null;
    if (f.hotspots === true) sql.push("i.type = 'SECURITY_HOTSPOT'");
    else if (f.hotspots !== 'any' && !drillRules && !drillKeys) sql.push("i.type <> 'SECURITY_HOTSPOT'");
    if (drillRules || drillKeys) {
      const or = [];
      if (drillKeys) { or.push('i.key IN (SELECT value FROM json_each(?))'); args.push(JSON.stringify(drillKeys)); }
      if (drillRules) { or.push('i.rule IN (SELECT value FROM json_each(?))'); args.push(JSON.stringify(drillRules)); }
      sql.push(`(${or.join(' OR ')})`);
    }
    if (f.type) { sql.push('i.type = ?'); args.push(f.type); }
    if (f.severity) { sql.push('i.sev = ?'); args.push(SEV_RANK[f.severity] ?? 5); }
    if (f.status) { sql.push('i.status = ?'); args.push(f.status); }
    if (f.newOnly) sql.push('i.isnew = 1');
    if (f.engine) { sql.push('i.engine = ?'); args.push(f.engine); }
    if (f.rule) { sql.push('i.rule = ?'); args.push(f.rule); }
    if (f.file) { sql.push('(i.file = ? OR substr(i.file, 1, ?) = ?)'); const p = String(f.file).replace(/\/+$/, ''); args.push(p, p.length + 1, `${p}/`); }
    if (Array.isArray(f.lang) && f.lang.length) {
      sql.push(`(${f.lang.map(() => 'lower(i.file) LIKE ?').join(' OR ')})`);
      for (const ext of f.lang) args.push(`%${String(ext).toLowerCase()}`);
    }
    if (f.standard) {
      const or = ['instr(i.istd, ?) > 0'];
      args.push(` ${f.standard} `);
      if (Array.isArray(f.standardRules) && f.standardRules.length) { or.push('i.rule IN (SELECT value FROM json_each(?))'); args.push(JSON.stringify(f.standardRules)); }
      sql.push(`(${or.join(' OR ')})`);
    }
    // Every word must appear (anywhere in the rule, message or path).
    for (const word of String(f.q || '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8)) {
      sql.push('instr(i.text, ?) > 0');
      args.push(word);
    }
    return { sql: sql.join(' AND '), args };
  }

  const ORDER = {
    severity: 'i.sev, i.seq',
    file: 'i.file, i.line, i.seq',
    rule: 'i.rule, i.sev, i.seq',
    list: 'i.seq',
    new: 'i.isnew DESC, i.sev, i.seq',
  };

  /** One page of a list: { total, issues }. */
  function search(name, filter = {}, { offset = 0, limit = 500, sort = 'severity' } = {}) {
    const l = listOf(name);
    if (!l) return { total: 0, issues: [] };
    const w = where(l.id, filter);
    const total = db.prepare(`SELECT count(*) AS c FROM issue i WHERE ${w.sql}`).get(...w.args).c;
    const order = ORDER[sort] || ORDER.severity;
    const rows = db.prepare(`SELECT b.data FROM (SELECT i.id, i.sev, i.seq, i.file, i.line, i.rule, i.isnew FROM issue i WHERE ${w.sql} ORDER BY ${order} LIMIT ? OFFSET ?) p JOIN body b ON b.id = p.id ORDER BY ${order.replace(/\bi\./g, 'p.')}`)
      .all(...w.args, Math.max(1, Math.min(50000, limit)), Math.max(0, offset));
    return { total, issues: rows.map((r) => JSON.parse(r.data)) };
  }

  /**
   * Counts of a filter's result per severity, type, status, engine and the
   * top rules. which: the ones wanted (each is one pass over the result).
   */
  function facets(name, filter = {}, which = ['severity', 'type', 'status', 'engine', 'rules']) {
    const l = listOf(name);
    if (!l) return {};
    const out = {};
    const by = (col, without, limit) => {
      const f = { ...filter };
      delete f[without];
      const w = where(l.id, f);
      return db.prepare(`SELECT ${col} AS v, count(*) AS c FROM issue i WHERE ${w.sql} GROUP BY v ORDER BY c DESC${limit ? ` LIMIT ${limit}` : ''}`).all(...w.args);
    };
    const want = new Set(which);
    const sevName = Object.fromEntries(Object.entries(SEV_RANK).map(([k, v]) => [v, k]));
    if (want.has('severity')) out.severity = Object.fromEntries(by('i.sev', 'severity').map((r) => [sevName[r.v] || 'UNKNOWN', r.c]));
    if (want.has('type')) out.type = Object.fromEntries(by('i.type', 'type').map((r) => [r.v, r.c]));
    if (want.has('status')) out.status = Object.fromEntries(by('i.status', 'status').map((r) => [r.v, r.c]));
    if (want.has('engine')) out.engine = Object.fromEntries(by('i.engine', 'engine').map((r) => [r.v, r.c]));
    if (want.has('rules')) out.rules = by('i.rule', 'rule', 15).map((r) => ({ rule: r.v, count: r.c }));
    return out;
  }

  // Folds the write-ahead log into the file (before copying it).
  function checkpoint() {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  }

  return { file, checkpoint, has, write, writeAsync, read, readAsync, update, keepOnly, search, facets, close: () => db.close() };
}

module.exports = { open, standardIds, standardsOf, matchesStandard, STANDARD_IDS, SEV_RANK };

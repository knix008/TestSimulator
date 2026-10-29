'use strict';

// The issue lists of analyses in local SQLite databases (node:sqlite), one
// file per list (openStore below). A list is stored as narrow rows that searches, filters, sorts
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
const { Worker, isMainThread } = require('worker_threads');

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

// The indexes a list's reads use, one per filter or sort (engine, status and
// new code too). Each ends with type: the default filter (no security
// hotspots) and the counts are then answered from the index alone, without
// reading the rows. A new file gets them when it is made (after a bulk
// write); a file of an earlier version the first time it is searched, when
// its older indexes (OLD_INDEXES) go.
const INDEXES = `CREATE INDEX IF NOT EXISTS issue_key ON issue(list, key);
CREATE INDEX IF NOT EXISTS issue_seq2 ON issue(list, seq, type);
CREATE INDEX IF NOT EXISTS issue_sev2 ON issue(list, sev, seq, type);
CREATE INDEX IF NOT EXISTS issue_rule2 ON issue(list, rule, sev, seq, type);
CREATE INDEX IF NOT EXISTS issue_type ON issue(list, type, sev, seq);
CREATE INDEX IF NOT EXISTS issue_file2 ON issue(list, file, line, seq, type);
CREATE INDEX IF NOT EXISTS issue_engine2 ON issue(list, engine, sev, seq, type);
CREATE INDEX IF NOT EXISTS issue_status2 ON issue(list, status, sev, seq, type);
CREATE INDEX IF NOT EXISTS issue_new2 ON issue(list, isnew, sev, seq, type);`;
const OLD_INDEXES = ['issue_seq', 'issue_sev', 'issue_rule', 'issue_file', 'issue_engine', 'issue_status', 'issue_new'];
// Words this long or longer are looked up in the trigram text index.
const FTS_MIN = 3;
const FTS_CHUNK = 20000;
// Rows copied from an older issues.db per step (see openStore migrate).
const IMPORT_CHUNK = 5000;

/**
 * opts.bulk: a new file that is filled once and then put in place (openStore
 * fresh): no journal, no indexes while rows go in (three times faster), then
 * finishBulk() makes the indexes.
 * opts.asIs: leave the indexes as they are (the issues.db of an earlier
 * version, read only until its lists have moved: indexing it takes minutes).
 */
function open(file, opts = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(file);
  db.exec(opts.bulk
    ? 'PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA locking_mode=EXCLUSIVE; PRAGMA temp_store=MEMORY; PRAGMA cache_size=-262144;'
    : 'PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA temp_store=MEMORY; PRAGMA cache_size=-131072; PRAGMA busy_timeout=30000;');
  db.exec(`CREATE TABLE IF NOT EXISTS lists (id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL, count INTEGER NOT NULL DEFAULT 0, complete INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS issue (id INTEGER PRIMARY KEY, list INTEGER NOT NULL, seq INTEGER NOT NULL, key TEXT, rule TEXT, type TEXT, sev INTEGER, status TEXT, file TEXT, line INTEGER, lang TEXT, engine TEXT, isnew INTEGER, istd TEXT, text TEXT);
CREATE TABLE IF NOT EXISTS body (id INTEGER PRIMARY KEY, data TEXT);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);`);
  let searchReady = !!opts.asIs;
  /** Makes every index (once per open file) and drops those of earlier versions. */
  function ensureIndexes() {
    if (searchReady) return;
    db.exec(INDEXES);
    for (const name of OLD_INDEXES) db.exec(`DROP INDEX IF EXISTS ${name}`);
    searchReady = true;
  }
  // A new file (not a bulk one) has its indexes from the start, while it is empty.
  if (!opts.bulk && !opts.asIs && !db.prepare('SELECT 1 FROM lists LIMIT 1').get()) ensureIndexes();
  const metaGet = db.prepare('SELECT value FROM meta WHERE key = ?');
  const metaSet = db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)');
  const meta = (k) => { const r = metaGet.get(k); return r ? r.value : null; };

  const st = {
    listId: db.prepare('SELECT id, count, complete FROM lists WHERE name = ?'),
    newList: db.prepare('INSERT INTO lists (name, count, complete) VALUES (?, 0, 0)'),
    setCount: db.prepare('UPDATE lists SET count = ?, complete = ? WHERE id = ?'),
    insIssue: db.prepare('INSERT INTO issue (list, seq, key, rule, type, sev, status, file, line, lang, engine, isnew, istd, text) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)'),
    insBody: db.prepare('INSERT INTO body (id, data) VALUES (?, ?)'),
    delBody: db.prepare('DELETE FROM body WHERE id IN (SELECT id FROM issue WHERE list = ?)'),
    delIssue: db.prepare('DELETE FROM issue WHERE list = ?'),
    delList: db.prepare('DELETE FROM lists WHERE id = ?'),
    byKey: db.prepare('SELECT id, text FROM issue WHERE list = ? AND key = ?'),
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

  /** The issues of a stored list with these keys (the first of each key), as a Map key -> issue. */
  function byKeys(name, keys) {
    const l = listOf(name);
    const out = new Map();
    if (!l || !keys.length) return out;
    // Looked up by key (issue_key); the first of a key is the lowest seq.
    const first = new Map();
    for (const r of db.prepare('SELECT i.key, i.seq, b.data FROM issue i INDEXED BY issue_key JOIN body b ON b.id = i.id WHERE i.list = ? AND i.key IN (SELECT value FROM json_each(?))').iterate(l.id, JSON.stringify(keys))) {
      const had = first.get(r.key);
      if (!had || r.seq < had.seq) first.set(r.key, r);
    }
    for (const [k, r] of first) out.set(k, JSON.parse(r.data));
    return out;
  }

  /** Writes changed issues of a stored list (by key). */
  function update(name, issues) {
    const l = listOf(name);
    if (!l) return 0;
    let n = 0;
    // Holding the write lock before asking how far the text index got: the
    // job making it (another connection) cannot take in rows meanwhile.
    db.exec('BEGIN IMMEDIATE');
    const upto = textIndexed();
    try {
      for (const issue of issues) {
        const r = st.byKey.get(l.id, issue.key);
        if (!r) continue;
        const [, , , , status, , , , , isnew, istd, text] = row(issue);
        st.updIssue.run(status, isnew, istd, text, r.id);
        st.updBody.run(JSON.stringify(issue), r.id);
        // The text index keeps the words of the rows it has taken in.
        if (text !== r.text && r.id <= upto) {
          db.prepare("INSERT INTO fts (fts, rowid, text) VALUES ('delete', ?, ?)").run(r.id, r.text);
          db.prepare('INSERT INTO fts (rowid, text) VALUES (?, ?)').run(r.id, text);
        }
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
    // A folder: the paths from "<p>/" up to "<p>0" ('0' follows '/'), a range of the file index.
    if (f.file) { sql.push('(i.file = ? OR (i.file >= ? AND i.file < ?))'); const p = String(f.file).replace(/\/+$/, ''); args.push(p, `${p}/`, `${p}0`); }
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
    // Every word must appear (anywhere in the rule, message or path): through
    // the text index once it is made (words of FTS_MIN letters or more),
    // else by reading each row's text. The first word search makes the index.
    const words = String(f.q || '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
    const indexed = words.length && textReady() ? words.filter((w) => [...w].length >= FTS_MIN) : [];
    if (indexed.length) {
      sql.push('i.id IN (SELECT rowid FROM fts WHERE fts MATCH ?)');
      args.push(indexed.map((w) => `"${w.replace(/"/g, '""')}"`).join(' AND '));
    } else if (words.length) buildText();
    for (const word of words) {
      if (indexed.includes(word)) continue;
      sql.push('instr(i.text, ?) > 0');
      args.push(word);
    }
    return { sql: sql.join(' AND '), args };
  }

  // ── text index ──────────────────────────────────────────
  // A trigram index (FTS5) of issue.text, which finds any part of a word as
  // instr does, without reading every row. It is made the first time a list
  // is searched for words, on a thread of its own (runJob 'text') a piece at
  // a time, and goes on where it stopped if it was stopped meanwhile.
  let closed = false;
  let building = null;
  const textReady = () => meta('fts') === 'done';
  /** The last row id the text index has taken in (0: none). */
  function textIndexed() {
    if (textReady()) return Infinity;
    return Number(meta('fts_upto') || 0);
  }
  /** Makes the text index; o.stop() ends it between two pieces. Resolves when done or stopped. */
  function buildText(o = {}) {
    if (building || closed || opts.asIs || opts.bulk || textReady()) return building;
    if (isMainThread) {
      building = runJob('text', { file }).promise.catch(() => { /* words are still found row by row */ }).finally(() => { building = null; });
      return building;
    }
    building = (async () => {
      db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS fts USING fts5(text, content='issue', content_rowid='id', tokenize='trigram')");
      const last = db.prepare('SELECT max(id) AS m FROM (SELECT id FROM issue WHERE id > ? ORDER BY id LIMIT ?)');
      const take = db.prepare('INSERT INTO fts (rowid, text) SELECT id, text FROM issue WHERE id > ? AND id <= ?');
      let upto = textIndexed();
      for (;;) {
        await new Promise((resolve) => setImmediate(resolve));
        if (closed || (o.stop && o.stop())) return;
        const m = last.get(upto, FTS_CHUNK).m;
        if (m == null) break;
        db.exec('BEGIN IMMEDIATE');
        try {
          take.run(upto, m);
          metaSet.run('fts_upto', String(m));
          db.exec('COMMIT');
        } catch (err) {
          db.exec('ROLLBACK');
          throw err;
        }
        upto = m;
      }
      metaSet.run('fts', 'done');
    })().catch(() => { /* words are still found row by row */ }).finally(() => { building = null; });
    return building;
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
    ensureIndexes();
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
    ensureIndexes();
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

  /**
   * Copies list name of another database file (rows and ids as they are) into
   * this empty one, IMPORT_CHUNK rows at a time so other calls run in between.
   * stop(): true to give up (the caller throws this file away). Returns
   * whether the list was copied whole.
   */
  async function importListAsync(other, name, stop = () => false) {
    // An attached file takes the connection's locking mode: the other file is
    // open elsewhere (it is still being read), so not exclusive.
    db.exec('PRAGMA locking_mode=NORMAL; PRAGMA busy_timeout=30000;');
    db.prepare('ATTACH DATABASE ? AS src').run(other);
    try {
      const l = db.prepare('SELECT id, count, complete FROM src.lists WHERE name = ?').get(name);
      if (!l || !l.complete) return false;
      const id = Number(st.newList.run(name).lastInsertRowid);
      const last = db.prepare('SELECT max(id) AS m FROM (SELECT id FROM src.issue WHERE list = ? AND id > ? ORDER BY id LIMIT ?)');
      const rows = db.prepare('INSERT INTO issue (id, list, seq, key, rule, type, sev, status, file, line, lang, engine, isnew, istd, text) SELECT id, ?, seq, key, rule, type, sev, status, file, line, lang, engine, isnew, istd, text FROM src.issue WHERE list = ? AND id > ? AND id <= ?');
      const bodies = db.prepare('INSERT INTO body (id, data) SELECT b.id, b.data FROM src.body b WHERE b.id > ? AND b.id <= ? AND b.id IN (SELECT id FROM src.issue WHERE list = ? AND id > ? AND id <= ?)');
      for (let upto = 0; ;) {
        if (stop()) return false;
        const m = last.get(l.id, upto, IMPORT_CHUNK).m;
        if (m == null) break;
        db.exec('BEGIN');
        try {
          rows.run(id, l.id, upto, m);
          bodies.run(upto, m, l.id, upto, m);
          db.exec('COMMIT');
        } catch (err) {
          db.exec('ROLLBACK');
          throw err;
        }
        upto = m;
        await new Promise((resolve) => setImmediate(resolve));
      }
      if (stop()) return false;
      st.setCount.run(l.count, 1, id);
      return true;
    } finally {
      db.exec('DETACH DATABASE src');
    }
  }

  function close() {
    closed = true;
    db.close();
  }

  return { file, checkpoint, has, write, writeAsync, read, readAsync, byKeys, update, keepOnly, importListAsync, search, facets, buildText, finishBulk: ensureIndexes, close };
}

// ── one file per list ─────────────────────────────────────
// The lists of a workspace, each in a database file of its own under its
// project's folder:
//
//   <configDir>/projects/<project>/branch-<hash>.db   latest analysis of a branch
//                                  snap-<hash>.db     a snapshot
//                                  desktop.db         the desktop analysis
//
// A search runs on one small file, a new analysis is written to a new file
// that then takes the old one's place (a crash leaves the old list), and a
// removed project or snapshot is a file deleted, not millions of rows.
// Lists of the single issues.db of older versions move to their files in the
// background (served from issues.db meanwhile), and that file goes once every
// list in use has moved. New files are written in bulk (open opts.bulk).
const PROJECTS = 'projects';
const LEGACY_DB = 'issues.db';
const MAX_OPEN = 48;

// Open files, shared by every store of this process (a file being replaced
// must be closed by all of them): file -> { db, pins }.
const handles = new Map();

// Long SQLite jobs on threads of their own (core/issuedb-worker.js): kind
// 'indexes' | 'import' | 'text' on args.file. Returns { promise, stop() };
// jobs on one file are kept until done, so a file about to be replaced or
// deleted can stop them first (stopJobs).
const jobs = new Map(); // file -> Set of { promise, stop }
function runJob(kind, args) {
  const stop = new Int32Array(new SharedArrayBuffer(4));
  const promise = new Promise((resolve, reject) => {
    const w = new Worker(path.join(__dirname, 'issuedb-worker.js'), { workerData: { ...args, kind, stop } });
    // The text index goes on where it stopped: it does not keep the process alive.
    if (kind === 'text') w.unref();
    w.once('message', (m) => (m.ok ? resolve(m.out) : reject(new Error(m.error))));
    w.once('error', reject);
    w.once('exit', (code) => reject(new Error(`issue database job ${kind} ended (${code})`)));
  });
  const job = { promise, stop: () => Atomics.store(stop, 0, 1) };
  if (!jobs.has(args.file)) jobs.set(args.file, new Set());
  jobs.get(args.file).add(job);
  promise.catch(() => {}).finally(() => {
    const set = jobs.get(args.file);
    if (set) { set.delete(job); if (!set.size) jobs.delete(args.file); }
  });
  return job;
}
/** Asks the jobs on a file to stop; resolves when they have. */
function stopJobs(file) {
  const set = jobs.get(file);
  if (!set) return Promise.resolve();
  for (const j of set) j.stop();
  return Promise.all([...set].map((j) => j.promise.catch(() => {})));
}

function retire(file) {
  const h = handles.get(file);
  if (jobs.has(file)) for (const j of jobs.get(file)) j.stop();
  if (!h) return true;
  if (h.pins) return false;
  handles.delete(file);
  try { h.db.close(); } catch { /* already closed */ }
  return true;
}
function rmDb(file) {
  fs.rmSync(file, { force: true });
  for (const s of ['-wal', '-shm', '-journal']) fs.rmSync(file + s, { force: true });
}

function openStore(dir) {
  const root = path.join(dir, PROJECTS);
  const legacyFile = path.join(dir, LEGACY_DB);
  const writing = new Set();
  let seq = 0;

  /** The file of list name (see listsOf in store.js). */
  function fileOf(name) {
    const m = /^(.*?)-(desktop|snap-[0-9a-f]{12}|[0-9a-f]{12})$/.exec(String(name));
    const safe = (s) => String(s).replace(/[^\w.-]/g, '_');
    if (m && m[1] && m[1] !== '.' && m[1] !== '..') {
      return path.join(root, safe(m[1]), `${/^[0-9a-f]{12}$/.test(m[2]) ? `branch-${m[2]}` : m[2]}.db`);
    }
    return path.join(root, '_lists', `${safe(name)}.db`);
  }

  function handle(file, create) {
    let h = handles.get(file);
    if (h) {
      handles.delete(file);
      handles.set(file, h);
      return h;
    }
    if (!create && !fs.existsSync(file)) return null;
    h = { db: module.exports.open(file), pins: 0 };
    handles.set(file, h);
    for (const [f, old] of handles) {
      if (handles.size <= MAX_OPEN) break;
      if (old !== h && !old.pins) retire(f);
    }
    return h;
  }

  // An older issues.db: its lists are served from it until they have moved to
  // their own files. They move in the background, a piece at a time
  // (migrate), so opening a workspace of millions of issues does not wait
  // minutes; issues.db goes once every list in use has moved.
  let legacy;
  let legacyHandle = null;
  function legacyDb() {
    if (legacy === undefined) {
      legacy = fs.existsSync(legacyFile) ? open(legacyFile, { asIs: true }) : null;
      legacyHandle = legacy ? { db: legacy, pins: 0 } : null;
    }
    return legacy;
  }
  function dropLegacy() {
    if (legacy) { try { legacy.close(); } catch { /* closed */ } }
    legacy = null;
    legacyHandle = null;
    rmDb(legacyFile);
  }

  // A new file for list name, filled by the caller (o.open false: by a job,
  // through t.tmp) and then put in place.
  function fresh(name, o = {}) {
    const file = fileOf(name);
    const tmp = `${file}.${process.pid}-${++seq}.new`;
    rmDb(tmp);
    const db = o.open === false ? null : module.exports.open(tmp, { bulk: true });
    writing.add(tmp);
    const close = () => { if (db) { try { db.close(); } catch { /* closed */ } } };
    // false: the old file is still open (a read in progress here, or another
    // process); the caller then writes it in place.
    const swap = () => {
      writing.delete(tmp);
      try {
        if (!retire(file)) throw new Error('busy');
        for (const s of ['-wal', '-shm', '-journal']) fs.rmSync(file + s, { force: true });
        fs.renameSync(tmp, file);
        return true;
      } catch {
        rmDb(tmp);
        return false;
      }
    };
    return {
      file,
      tmp,
      db,
      abort() { close(); writing.delete(tmp); rmDb(tmp); },
      /** Indexes made here, then put in place. */
      commit() {
        try { if (db && db.finishBulk) db.finishBulk(); } catch { /* indexes are made on the first search */ }
        close();
        return swap();
      },
      /** Indexes made on a thread of their own (seconds for millions of rows), then put in place. */
      async commitAsync() {
        close();
        if (o.open !== false) {
          try { await runJob('indexes', { file: tmp }).promise; } catch { /* indexes are made on the first search */ }
        }
        await stopJobs(file);
        return swap();
      },
    };
  }

  // The open file of list name, or issues.db while the list has not moved yet.
  function existing(name) {
    const h = handle(fileOf(name), false);
    if (h) return h;
    const old = legacyDb();
    if (!old || !old.has(name)) return null;
    migrate(name);
    return legacyHandle;
  }

  const toMove = new Set();
  const dirty = new Set(); // changed in issues.db while being copied: copied again
  const importing = new Map(); // name -> the job copying it
  let moving = null;
  let keepNames = null; // the lists in use, from the last keepOnly
  let stopped = false;
  function migrate(name) {
    toMove.add(name);
    if (!moving) moving = moveAll().finally(() => { moving = null; legacyDone(); });
  }
  async function moveAll() {
    while (toMove.size && !stopped) {
      const name = toMove.values().next().value;
      toMove.delete(name);
      if (keepNames && !keepNames.has(name)) continue;
      try { await moveOne(name); } catch { /* stays in issues.db, which keeps serving it */ }
    }
  }
  // A list copied out of issues.db by a job (rows, then indexes), then put in place.
  async function moveOne(name) {
    const file = fileOf(name);
    for (let tries = 0; tries < 3; tries++) {
      if (fs.existsSync(file) || !legacy || !legacy.has(name)) return;
      dirty.delete(name);
      const t = fresh(name, { open: false });
      const job = runJob('import', { file: t.tmp, from: legacyFile, name });
      importing.set(name, job);
      let whole = false;
      try {
        whole = await job.promise;
      } catch (err) {
        t.abort();
        throw err;
      } finally {
        importing.delete(name);
      }
      if (!whole || stopped || dirty.has(name) || fs.existsSync(file)) { t.abort(); continue; }
      if (await t.commitAsync()) return;
    }
  }
  /** issues.db goes when nothing reads it and every list in use has its file. */
  function legacyDone() {
    if (!legacy || !keepNames || moving || toMove.size || legacyHandle.pins) return;
    for (const name of keepNames) if (!fs.existsSync(fileOf(name)) && legacy.has(name)) return;
    dropLegacy();
  }
  /** Resolves when no list is moving out of issues.db. */
  async function whenIdle() {
    while (moving) await moving;
  }

  async function pinned(name, fn, empty) {
    const h = existing(name);
    if (!h) return empty;
    h.pins++;
    try { return await fn(h.db); } finally { h.pins--; if (h === legacyHandle) legacyDone(); }
  }

  function has(name) {
    const h = existing(name);
    return h ? h.db.has(name) : null;
  }
  function write(name, issues) {
    const t = fresh(name);
    try { t.db.write(name, issues); } catch (err) { t.abort(); throw err; }
    if (!t.commit()) handle(t.file, true).db.write(name, issues);
  }
  async function writeAsync(name, issues, onProgress) {
    const t = fresh(name);
    try { await t.db.writeAsync(name, issues, onProgress); } catch (err) { t.abort(); throw err; }
    if (!(await t.commitAsync())) await handle(t.file, true).db.writeAsync(name, issues, onProgress);
  }
  function read(name) {
    const h = existing(name);
    return h ? h.db.read(name) : [];
  }
  function readAsync(name, onProgress) {
    return pinned(name, (db) => db.readAsync(name, onProgress), []);
  }
  function byKeys(name, keys) {
    const h = existing(name);
    return h ? h.db.byKeys(name, keys) : new Map();
  }
  function update(name, issues) {
    const h = existing(name);
    if (h && h === legacyHandle) {
      dirty.add(name);
      if (importing.has(name)) importing.get(name).stop();
    }
    return h ? h.db.update(name, issues) : 0;
  }
  function search(name, filter, page) {
    const h = existing(name);
    return h ? h.db.search(name, filter, page) : { total: 0, issues: [] };
  }
  function facets(name, filter, which) {
    const h = existing(name);
    return h ? h.db.facets(name, filter, which) : {};
  }

  /** Deletes the files of lists not in keep (a Set of names); issues.db goes once its kept lists moved out. */
  function keepOnly(keep) {
    const files = new Set();
    keepNames = new Set(keep);
    for (const name of keep) {
      files.add(fileOf(name));
      if (legacyDb() && !fs.existsSync(fileOf(name)) && legacy.has(name)) migrate(name);
    }
    legacyDone();
    let folders = [];
    try { folders = fs.readdirSync(root); } catch { return; }
    for (const folder of folders) {
      const full = path.join(root, folder);
      let names;
      try { names = fs.readdirSync(full); } catch { continue; }
      for (const n of names) {
        const f = path.join(full, n);
        if (n.endsWith('.db')) {
          if (files.has(f) || !retire(f)) continue;
        } else {
          // Left over from a write that never finished (not one going on now).
          const tmp = /^(.*\.new)(-wal|-shm|-journal)?$/.exec(n);
          if (!tmp || writing.has(path.join(full, tmp[1]))) continue;
        }
        try { rmDb(f); } catch { /* open elsewhere: next save */ }
      }
      try { if (!fs.readdirSync(full).length) fs.rmdirSync(full); } catch { /* not empty */ }
    }
  }

  function checkpoint() {
    for (const h of handles.values()) if (h.db.file.startsWith(root)) { try { h.db.checkpoint(); } catch { /* best effort */ } }
    if (legacy) legacy.checkpoint();
  }
  /** Copies every list file (and an issues.db not moved yet) into another config folder. */
  function copyTo(target) {
    checkpoint();
    if (fs.existsSync(legacyFile)) fs.copyFileSync(legacyFile, path.join(target, LEGACY_DB));
    let folders = [];
    try { folders = fs.readdirSync(root); } catch { return; }
    for (const folder of folders) {
      const from = path.join(root, folder);
      let names;
      try { names = fs.readdirSync(from).filter((n) => n.endsWith('.db')); } catch { continue; }
      fs.mkdirSync(path.join(target, PROJECTS, folder), { recursive: true });
      for (const n of names) fs.copyFileSync(path.join(from, n), path.join(target, PROJECTS, folder, n));
    }
  }
  function close() {
    stopped = true;
    for (const job of importing.values()) job.stop();
    for (const f of [...handles.keys()]) if (f.startsWith(root)) retire(f);
    if (legacy) { try { legacy.close(); } catch { /* closed */ } legacy = undefined; }
  }

  return { dir: root, fileOf, checkpoint, copyTo, has, write, writeAsync, read, readAsync, byKeys, update, keepOnly, search, facets, whenIdle, close };
}

module.exports = { open, openStore, standardIds, standardsOf, matchesStandard, STANDARD_IDS, SEV_RANK };

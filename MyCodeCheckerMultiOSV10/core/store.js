'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { LANGS } = require('./languages');
const { listRules } = require('./analyze');
const { DEFAULT_GATE, upgradeGates } = require('./qualitygate');
const { DEFAULT_POLICY, VIEWS } = require('./defects');
const { migrateWorkspace } = require('./compat/migrate');
const { jsonChunks } = require('./json');

function defaultConfigDir() {
  if (process.env.MCC_USER_DATA) return process.env.MCC_USER_DATA;
  if (process.platform === 'win32') {
    const base = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(base, 'MyCodeChecker');
  }
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'MyCodeChecker');
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'MyCodeChecker');
}

// 8000 files was the default cap of older versions; analyses have no cap now.
function upgradeSettings(settings) {
  if (settings.maxFiles === 8000) settings.maxFiles = 0;
  return settings;
}

function freshWorkspace() {
  const rules = listRules();
  const profiles = Object.keys(LANGS).map((lang) => ({
    id: `${lang}-checker-way`,
    name: 'Checker way',
    language: lang,
    isDefault: true,
    inactive: [],
    overrides: {},
  }));
  profiles.unshift({
    id: 'all-checker-way',
    name: 'Checker way',
    language: '*',
    isDefault: true,
    inactive: [],
    overrides: {},
  });
  return {
    version: 1,
    settings: {
      theme: 'midnight',
      language: 'ko',
      customThemes: [],
      exclusions: ['**/*.min.js', '**/vendor/**', '**/node_modules/**', '**/dist/**', '**/build/**'],
      newCode: 'previous',
      newCodeDays: 30,
      maxFiles: 0, // 0 = no limit
      memoryLimitGb: require('./memory').defaultLimitGb(),
      analysisMode: 'sequential', // or 'parallel': C/C++ batches on several workers (core/cfamily-pool.js)
      webhookUrl: '',
      assignee: '',
      limits: {},
      showStartOnLaunch: true,
    },
    gates: [{ ...DEFAULT_GATE, conditions: DEFAULT_GATE.conditions.map((c) => ({ ...c })) }],
    profiles,
    customRules: [],
    projects: [],
    portfolios: [],
    tasks: [],
    users: [],
    activeProjectId: null,
    ruleCount: rules.length,
    defectAnalysis: {
      policies: [{ ...DEFAULT_POLICY, conditions: DEFAULT_POLICY.conditions.map((c) => ({ ...c })) }],
      components: [],
      models: [],
      views: VIEWS.map((v) => ({ ...v })),
    },
  };
}

function createStore(configDir) {
  const dir = configDir || defaultConfigDir();
  const file = path.join(dir, 'workspace.json');
  // Issue lists live in local SQLite files, one per list under
  // projects/<project>/ (core/issuedb.js openStore), opened on first use.
  // Lists of older versions (issues.db, issues/*.ndjson) are still read, and
  // move to their files the next time they are used or saved.
  let issueDb = null;
  function idb() {
    if (!issueDb) issueDb = require('./issuedb').openStore(dir);
    return issueDb;
  }
  // Lists this store read from or wrote to the database: name -> list, list -> name.
  const dbLists = new Map();
  const dbNameOf = new WeakMap();
  function rememberDb(name, list) {
    dbLists.set(name, overlay(name, list));
    dbNameOf.set(list, name);
  }

  // Issues changed in the database while their list was not read
  // (updatePending): name -> Map key -> issue. A list read later, or being
  // read meanwhile, gets them in place of what it read.
  const patched = new Map();
  function overlay(name, list) {
    const m = patched.get(name);
    if (!m) return list;
    patched.delete(name);
    const seen = new Set();
    for (let n = 0; n < list.length; n++) {
      const key = list[n] && list[n].key;
      if (m.has(key) && !seen.has(key)) { list[n] = m.get(key); seen.add(key); }
    }
    return list;
  }
  /**
   * The issues with these keys of an analysis whose list was not read yet,
   * from the database without reading the list: Map key -> issue, or null
   * when the list is not in the database (older files are read whole).
   */
  function pendingByKeys(a, keys) {
    const pending = pendingIssues(a);
    if (!pending || !pending.$db || !idb().has(pending.$db)) return null;
    const out = idb().byKeys(pending.$db, keys);
    const m = patched.get(pending.$db);
    if (m) for (const k of keys) if (m.has(k)) out.set(k, m.get(k));
    return out;
  }
  /** Writes changed issues of a list not read yet to their rows (see pendingByKeys); the list stays unread. */
  function updatePending(a, issues) {
    const pending = pendingIssues(a);
    if (!pending || !pending.$db) throw new Error('The issue list is not pending');
    idb().update(pending.$db, issues);
    revision++;
    const m = patched.get(pending.$db) || new Map();
    for (const i of issues) m.set(i.key, i);
    patched.set(pending.$db, m);
  }
  function load() {
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      // Unreadable: moved aside (never overwritten by the next save), then a fresh workspace.
      if (err.code !== 'ENOENT') {
        try { fs.renameSync(file, `${file}.broken-${Date.now()}`); } catch { /* keep going */ }
      }
      return freshWorkspace();
    }
    try {
      // Issue files are always written in the current form; only workspace.json
      // (and issue lists still kept inline by older versions) needs migrating.
      const data = joinIssues(migrateWorkspace(raw));
      const fresh = freshWorkspace();
      const defectAnalysis = data.defectAnalysis || {};
      return {
        ...fresh,
        ...data,
        gates: upgradeGates(data.gates || fresh.gates),
        settings: upgradeSettings({ ...fresh.settings, ...(data.settings || {}) }),
        defectAnalysis: {
          ...fresh.defectAnalysis,
          ...defectAnalysis,
          policies: defectAnalysis.policies && defectAnalysis.policies.length ? defectAnalysis.policies : fresh.defectAnalysis.policies,
          views: defectAnalysis.views && defectAnalysis.views.length ? defectAnalysis.views : fresh.defectAnalysis.views,
          components: defectAnalysis.components || [],
          models: defectAnalysis.models || [],
        },
      };
    } catch {
      return freshWorkspace();
    }
  }
  function save(data) {
    fs.mkdirSync(dir, { recursive: true });
    const next = data && data.version ? data : { ...load(), ...data };
    const kept = new Set();
    const keptDb = new Set();
    const out = { ...next, projects: (next.projects || []).map((p) => splitIssues(p, kept, keptDb)) };
    writeAtomic(file, jsonChunks(out));
    idb().keepOnly(keptDb);
    for (const name of [...dbLists.keys()]) if (!keptDb.has(name)) dbLists.delete(name);
    // Issue files of removed projects and branches go.
    for (const name of safeList(path.join(dir, ISSUES))) {
      if (kept.has(`${ISSUES}/${name}`) || kept.has(`${ISSUES}/${name.replace(HEAD_SUFFIX, '.ndjson')}`)) continue;
      fs.rmSync(path.join(dir, ISSUES, name), { force: true });
      cache.delete(path.join(dir, ISSUES, name));
      blobs.delete(path.join(dir, ISSUES, name));
    }
    return next;
  }

  // The issue lists of analyses live in the database, one list (and file)
  // per analysis (and per snapshot), so a workspace never needs a string
  // larger than one issue. listsOf names them; workspace.json keeps
  // { $db: name, count } in their place.
  const short = (text) => crypto.createHash('sha1').update(text).digest('hex').slice(0, 12);
  function listsOf(project) {
    const stem = String(project.id).replace(/[^\w.-]/g, '_');
    const out = [];
    for (const [name, state] of Object.entries(project.branches || {})) {
      if (!state) continue;
      const bh = short(name);
      if (state.latest) out.push({ owner: state.latest, name: `${stem}-${bh}`, frozen: false });
      for (const s of state.snapshots || []) if (s) out.push({ owner: s, name: `${stem}-snap-${short(`${name}|${s.snapshot}|${s.at}`)}`, frozen: true });
    }
    if (project.desktop) out.push({ owner: project.desktop, name: `${stem}-desktop`, frozen: false });
    return out;
  }
  // Whether a list must be (re)written under name: not stored there yet, or
  // changed as a whole (touch). Single changed issues (changed) are rows.
  function needsWrite(issues, name, frozen) {
    if (dbNameOf.get(issues) !== name || !idb().has(name)) return true;
    return !frozen && touched.has(issues);
  }
  function stored(issues, name) {
    touched.delete(issues);
    changedItems.delete(issues);
    rememberDb(name, issues);
  }
  /**
   * Writes the lists of a workspace that its next save would write, a piece at
   * a time (an analysis of millions of issues takes minutes), so the service
   * keeps answering; save() then only writes workspace.json.
   */
  async function prepareLists(ws, onProgress) {
    for (const project of (ws && ws.projects) || []) {
      for (const { owner, name, frozen } of listsOf(project)) {
        if (pendingIssues(owner) || !Array.isArray(owner.issues) || !needsWrite(owner.issues, name, frozen)) continue;
        await idb().writeAsync(name, owner.issues, onProgress);
        stored(owner.issues, name);
      }
    }
  }

  function splitIssues(project, kept, keptDb) {
    const stem = String(project.id).replace(/[^\w.-]/g, '_');
    const names = new Map(listsOf(project).map((l) => [l.owner, l]));
    const ref = (owner, issues) => {
      const { name, frozen } = names.get(owner);
      if (needsWrite(issues, name, frozen)) {
        idb().write(name, issues);
        stored(issues, name);
      } else if (changedItems.has(issues)) {
        idb().update(name, [...changedItems.get(issues)]);
        changedItems.delete(issues);
      }
      keptDb.add(name);
      return { $db: name, count: issues.length };
    };
    // New-code baselines (issue keys, CIDs, line hashes) of every analysis in
    // the history: megabytes each, never changed once made, so they live in
    // issues/*.json and are written once. An array already on disk (even under
    // another field: latest.keys is branch.keys) reuses its file.
    const blob = (value, name) => {
      const big = Array.isArray(value) ? value.length >= BLOB_MIN : value && typeof value === 'object' && Object.keys(value).length >= BLOB_MIN / 10;
      if (!big) return value;
      const known = blobOf.get(value);
      if (known && cachedBlob(path.join(dir, known)) === value) { kept.add(known); return { $blob: known }; }
      const rel = `${ISSUES}/${stem}-${name}.json`;
      const full = path.join(dir, rel);
      if (cachedBlob(full) !== value) {
        fs.mkdirSync(path.join(dir, ISSUES), { recursive: true });
        writeAtomic(full, jsonChunks(value));
        rememberBlob(full, rel, value);
      }
      kept.add(rel);
      return { $blob: rel };
    };
    const baselines = (a, tag) => {
      if (!a) return a;
      const out = copyAnalysis(a);
      if (a.keys) out.keys = blob(a.keys, `${tag}-keys`);
      if (a.cids) out.cids = blob(a.cids, `${tag}-cids`);
      if (a.lineHashes) out.lineHashes = blob(a.lineHashes, `${tag}-lines`);
      if (a.defectAnalysis && a.defectAnalysis.cids) out.defectAnalysis = { ...a.defectAnalysis, cids: blob(a.defectAnalysis.cids, `${tag}-dcids`) };
      return out;
    };
    let out = project;
    if (project.branches) {
      const branches = {};
      for (const [name, state] of Object.entries(project.branches)) {
        if (!state) { branches[name] = state; continue; }
        const bh = short(name);
        const next = baselines(state, `${bh}-branch`);
        if (state.latest) next.latest = baselines(state.latest, `${bh}-${short(String(state.latest.finishedAt || ''))}`);
        if (Array.isArray(state.history)) next.history = state.history.map((h) => baselines(h, `${bh}-h${short(String(h && h.at))}`));
        const pendingLatest = state.latest && pendingIssues(state.latest);
        if (pendingLatest) next.latest = keepPending(next.latest, pendingLatest);
        else if (state.latest && Array.isArray(state.latest.issues)) next.latest = { ...next.latest, issues: ref(state.latest, state.latest.issues) };
        // Snapshots stay references until snapshot.compare / defect.lifecycle read them (issuesOf).
        if (Array.isArray(state.snapshots)) {
          next.snapshots = state.snapshots.map((s) => {
            if (s && Array.isArray(s.issues)) return { ...s, issues: ref(s, s.issues) };
            if (s && s.issues && typeof s.issues.$file === 'string') kept.add(`${ISSUES}/${path.basename(s.issues.$file)}`);
            if (s && s.issues && typeof s.issues.$db === 'string') keptDb.add(s.issues.$db);
            return s;
          });
        }
        branches[name] = next;
      }
      out = { ...out, branches };
    }
    if (project.desktop) out = { ...out, desktop: baselines(project.desktop, 'desktop') };
    const pendingDesktop = project.desktop && pendingIssues(project.desktop);
    if (pendingDesktop) out = { ...out, desktop: keepPending(out.desktop, pendingDesktop) };
    else if (project.desktop && Array.isArray(project.desktop.issues)) {
      out = { ...out, desktop: { ...out.desktop, issues: ref(project.desktop, project.desktop.issues) } };
    }
    void stem;
    return out;
    // A list nobody read since the load is still where it was: the reference is written as is.
    function keepPending(a, pending) {
      if (pending.$db) keptDb.add(pending.$db);
      else kept.add(`${ISSUES}/${path.basename(pending.$file)}`);
      return Object.defineProperty(a, 'issues', { value: pending, writable: true, enumerable: true, configurable: true });
    }
  }

  function joinIssues(data) {
    const fill = (a) => {
      if (!a) return;
      for (const k of ['keys', 'cids', 'lineHashes']) if (a[k] && a[k].$blob) a[k] = readBlob(a[k]);
      if (a.defectAnalysis && a.defectAnalysis.cids && a.defectAnalysis.cids.$blob) a.defectAnalysis.cids = readBlob(a.defectAnalysis.cids);
    };
    for (const project of (data && data.projects) || []) {
      for (const state of Object.values(project.branches || {})) {
        if (!state) continue;
        fill(state);
        for (const h of state.history || []) fill(h);
        if (state.latest) { fill(state.latest); lazyIssues(state.latest, state.latest.issues); }
      }
      if (project.desktop) { fill(project.desktop); lazyIssues(project.desktop, project.desktop.issues); }
    }
    return data;
  }

  // An analysis's issue list stays its file until something reads
  // analysis.issues: a large project's list takes minutes and gigabytes to
  // parse, and most calls (and the window's workspace) need only its count.
  // A list already parsed (and unchanged on disk) is used at once.
  const LAZY = Symbol('pendingIssues');
  function lazyIssues(a, ref) {
    if (!isRef(ref)) { a.issues = ref; return; }
    const hit = ref.$db ? dbLists.get(ref.$db) : cached(path.join(dir, ISSUES, path.basename(ref.$file)));
    if (hit) { a.issues = hit; return; }
    const settle = (obj, value) => Object.defineProperty(obj, 'issues', { value, writable: true, enumerable: true, configurable: true });
    const get = function get() { return settle(this, readIssues(ref)).issues; };
    get[LAZY] = ref;
    Object.defineProperty(a, 'issues', { get, set(value) { settle(this, value); }, enumerable: true, configurable: true });
  }
  function isRef(ref) {
    return !!ref && !Array.isArray(ref) && (typeof ref.$db === 'string' || typeof ref.$file === 'string');
  }
  /** The { $db | $file, count } of an analysis whose issue list was not read yet, else null. */
  function pendingIssues(a) {
    const d = a && typeof a === 'object' ? Object.getOwnPropertyDescriptor(a, 'issues') : null;
    return (d && d.get && d.get[LAZY]) || null;
  }
  /** The number of issues of an analysis, without reading a pending list. */
  function issueCount(a) {
    const pending = pendingIssues(a);
    if (pending) return pending.count || 0;
    return a && Array.isArray(a.issues) ? a.issues.length : 0;
  }
  /** A shallow copy of an analysis that leaves a pending list pending. */
  function copyAnalysis(a) {
    return Object.defineProperties({}, Object.getOwnPropertyDescriptors(a));
  }

  // The head of a large issue list: its first HEAD_SIZE issues, most severe
  // first, in a file of their own (<list>.head.ndjson, first line = what it
  // was made from). The window shows only these, so opening a project with
  // millions of issues reads this file instead of the whole list (minutes and
  // gigabytes). Written with the list; made once from an older list.
  const heads = new Map();
  function headFileOf(full) {
    return full.replace(/\.ndjson$/, HEAD_SUFFIX);
  }
  function writeHead(full, issues) {
    const target = headFileOf(full);
    if (issues.length <= HEAD_SIZE) { fs.rmSync(target, { force: true }); heads.delete(target); return; }
    const st = fs.statSync(full);
    const order = severityOrder(issues);
    const head = [];
    for (let n = 0; n < HEAD_SIZE; n++) head.push(issues[order[n]]);
    const meta = { $head: path.basename(full), mtimeMs: st.mtimeMs, size: st.size, total: issues.length };
    writeAtomic(target, (function* lines() { yield `${JSON.stringify(meta)}\n`; yield* issueLines(head); })());
    heads.set(target, { meta, issues: head });
  }
  /**
   * The database list of an analysis, written there first when it is not
   * (an older version's file, read a piece at a time): its name, or null.
   */
  async function dbListOf(project, a, onProgress) {
    const pending = pendingIssues(a);
    if (pending && pending.$db) return idb().has(pending.$db) ? pending.$db : null;
    const list = pending ? await loadIssues(a, onProgress) : a && a.issues;
    if (!Array.isArray(list)) return null;
    const known = dbNameOf.get(list);
    if (known && idb().has(known)) return known;
    const entry = listsOf(project).find((l) => l.owner === a);
    if (!entry) return null;
    await idb().writeAsync(entry.name, list);
    stored(list, entry.name);
    return entry.name;
  }
  /** A page of an analysis's issues from the database: { total, issues }. See issuedb.search. */
  async function searchIssues(project, a, filter, page) {
    const name = await dbListOf(project, a);
    return name ? idb().search(name, filter, page) : { total: 0, issues: [] };
  }
  async function issueFacets(project, a, filter, which) {
    const name = await dbListOf(project, a);
    return name ? idb().facets(name, filter, which) : {};
  }

  /** Whether a pending list's head file is current (severityPage then reads only it). */
  function headReady(a) {
    const pending = pendingIssues(a);
    if (pending && pending.$db) return idb().has(pending.$db) !== null;
    if (!pending || (pending.count || 0) <= HEAD_SIZE) return false;
    const full = path.join(dir, ISSUES, path.basename(pending.$file));
    try {
      const st = fs.statSync(full);
      const known = heads.get(headFileOf(full));
      if (known) return known.meta.mtimeMs === st.mtimeMs && known.meta.size === st.size;
      const fd = fs.openSync(headFileOf(full), 'r');
      const buf = Buffer.alloc(4096);
      const n = fs.readSync(fd, buf, 0, buf.length, 0);
      fs.closeSync(fd);
      const meta = JSON.parse(buf.toString('utf8', 0, n).split('\n')[0]);
      return meta.mtimeMs === st.mtimeMs && meta.size === st.size;
    } catch {
      return false;
    }
  }

  /**
   * The first `limit` issues (from `offset`) of an analysis in severity order,
   * with the list's total, when they are in its head: { total, issues } or null.
   * A list still pending is not read when its head file is current.
   */
  function severityPage(a, offset, limit) {
    const pending = pendingIssues(a);
    if (pending && pending.$db && idb().has(pending.$db)) {
      const page = idb().search(pending.$db, { hotspots: 'any' }, { offset, limit, sort: 'severity' });
      return { total: pending.count || page.total, issues: page.issues };
    }
    if (offset + limit > HEAD_SIZE) return null;
    if (!pending) {
      const list = Array.isArray(a && a.issues) ? a.issues : [];
      const order = severityOrder(list);
      const out = [];
      for (let n = offset; n < Math.min(order.length, offset + limit); n++) out.push(list[order[n]]);
      return { total: list.length, issues: out };
    }
    const full = path.join(dir, ISSUES, path.basename(pending.$file));
    const target = headFileOf(full);
    let st;
    try { st = fs.statSync(full); } catch { return null; }
    let head = heads.get(target);
    const current = (h) => h && h.meta.mtimeMs === st.mtimeMs && h.meta.size === st.size;
    if (!current(head)) {
      head = null;
      try {
        let meta = null;
        const issues = [];
        eachLine(target, (line) => { if (meta) issues.push(JSON.parse(line)); else meta = JSON.parse(line); });
        head = { meta, issues };
      } catch { /* none yet */ }
      if (!current(head)) {
        // An older list without a head: read it once and make the head.
        if ((pending.count || 0) <= HEAD_SIZE) return null;
        writeHead(full, a.issues);
        head = heads.get(target);
      } else heads.set(target, head);
    }
    return { total: head.meta.total, issues: head.issues.slice(offset, offset + limit) };
  }

  // Baseline files (see splitIssues), parsed once and shared while unchanged.
  const blobs = new Map();
  const blobOf = new WeakMap();
  function rememberBlob(full, rel, value) {
    try {
      const st = fs.statSync(full);
      blobs.set(full, { mtimeMs: st.mtimeMs, size: st.size, value });
      blobOf.set(value, rel);
    } catch {
      blobs.delete(full);
    }
  }
  function cachedBlob(full) {
    const hit = blobs.get(full);
    if (!hit) return null;
    try {
      const st = fs.statSync(full);
      return hit.mtimeMs === st.mtimeMs && hit.size === st.size ? hit.value : null;
    } catch {
      return null;
    }
  }
  function readBlob(ref) {
    const rel = `${ISSUES}/${path.basename(ref.$blob)}`;
    const full = path.join(dir, rel);
    const hit = cachedBlob(full);
    if (hit) return hit;
    try {
      const value = JSON.parse(fs.readFileSync(full, 'utf8'));
      rememberBlob(full, rel, value);
      return value;
    } catch {
      return Array.isArray(ref.$empty) ? [] : null;
    }
  }

  // Parsed issue files, shared by every load while the file is unchanged: a
  // large analysis takes seconds to parse and close to a gigabyte of memory,
  // and each API call loads the workspace. Whoever changes an issue in place
  // saves the workspace, which writes the file again.
  const cache = new Map();
  const touched = new WeakSet();
  /** Mark issue lists changed in place, so the next save writes them. */
  function touch(...lists) {
    revision++;
    for (const l of lists) {
      if (!Array.isArray(l)) continue;
      touched.add(l);
      changes.set(l, (changes.get(l) || 0) + 1);
    }
  }
  // Issues changed in place one by one (issue.update): only their rows are
  // written on the next save. A list touched as a whole is written again.
  const changedItems = new WeakMap();
  function changed(list, items) {
    if (!Array.isArray(list)) return;
    revision++;
    let set = changedItems.get(list);
    if (!set) { set = new Set(); changedItems.set(list, set); }
    for (const item of items || []) set.add(item);
    changes.set(list, (changes.get(list) || 0) + 1);
  }

  // How often a list was changed in place (touch): results computed from a
  // list (its measures) are reused while this stays the same.
  const changes = new WeakMap();
  function changesOf(list) {
    return changes.get(list) || 0;
  }
  // Every change to an issue in place (touch, changed, updatePending) counts:
  // results read from issues are reused while this stays the same.
  let revision = 0;
  const issueRevision = () => revision;
  function remember(full, issues) {
    try {
      const st = fs.statSync(full);
      cache.set(full, { mtimeMs: st.mtimeMs, size: st.size, issues });
    } catch {
      cache.delete(full);
    }
  }

  function cached(full) {
    const hit = cache.get(full);
    if (!hit) return null;
    try {
      const st = fs.statSync(full);
      return hit.mtimeMs === st.mtimeMs && hit.size === st.size ? hit.issues : null;
    } catch {
      return null;
    }
  }

  // An analysis's issue list from its { $file } reference (a list is returned as is).
  function readIssues(ref) {
    if (!isRef(ref)) return ref;
    if (ref.$db) {
      const hit = dbLists.get(ref.$db);
      if (hit) return hit;
      const list = idb().read(ref.$db);
      rememberDb(ref.$db, list);
      return dbLists.get(ref.$db);
    }
    const full = path.join(dir, ISSUES, path.basename(ref.$file));
    const hit = cached(full);
    if (hit) return hit;
    let st;
    try {
      st = fs.statSync(full);
    } catch {
      return [];
    }
    const out = [];
    eachLine(full, (line) => out.push(JSON.parse(line)));
    cache.set(full, { mtimeMs: st.mtimeMs, size: st.size, issues: out });
    return out;
  }

  // readIssues without holding up the service: the file is parsed 8 MB at a
  // time and other calls (progress polls, closing a tab) run in between; a
  // list of millions of issues takes minutes. target: an analysis (its list,
  // if still a file) or a { $file } reference. Two calls for one file share
  // the work. onProgress(bytesDone, bytesTotal).
  const loading = new Map();
  async function loadIssues(target, onProgress) {
    const ref = isRef(target) ? target : pendingIssues(target);
    if (!ref) return target && Array.isArray(target.issues) ? target.issues : Array.isArray(target) ? target : [];
    if (ref.$db) {
      const settleDb = (list) => { if (target !== ref && pendingIssues(target)) target.issues = list; return list; };
      const hit = dbLists.get(ref.$db);
      if (hit) return settleDb(hit);
      const key = `db:${ref.$db}`;
      if (!loading.has(key)) {
        loading.set(key, idb().readAsync(ref.$db, onProgress).then((list) => { rememberDb(ref.$db, list); return list; }).finally(() => loading.delete(key)));
      }
      return settleDb(await loading.get(key));
    }
    const full = path.join(dir, ISSUES, path.basename(ref.$file));
    const settleOn = (list) => { if (target !== ref && pendingIssues(target)) target.issues = list; return list; };
    const hit = cached(full);
    if (hit) return settleOn(hit);
    if (!loading.has(full)) {
      loading.set(full, (async () => {
        try {
          const st = fs.statSync(full);
          const out = [];
          const fd = fs.openSync(full, 'r');
          try {
            const CHUNK = 8 * 1048576;
            let rest = Buffer.alloc(0);
            let done = 0;
            for (;;) {
              const chunk = Buffer.allocUnsafe(CHUNK);
              const n = fs.readSync(fd, chunk, 0, CHUNK, null);
              const buf = rest.length ? Buffer.concat([rest, chunk.subarray(0, n)]) : chunk.subarray(0, n);
              let start = 0;
              for (let end = buf.indexOf(10, start); end >= 0; end = buf.indexOf(10, start)) {
                if (end > start) out.push(JSON.parse(buf.toString('utf8', start, end)));
                start = end + 1;
              }
              rest = Buffer.from(buf.subarray(start));
              done += n;
              if (onProgress) { try { onProgress(done, st.size); } catch { /* progress is best effort */ } }
              if (n === 0) break;
              await new Promise((resolve) => setImmediate(resolve));
            }
            if (rest.length) out.push(JSON.parse(rest.toString('utf8')));
          } finally {
            fs.closeSync(fd);
          }
          cache.set(full, { mtimeMs: st.mtimeMs, size: st.size, issues: out });
          return out;
        } catch {
          return [];
        } finally {
          loading.delete(full);
        }
      })());
    }
    return settleOn(await loading.get(full));
  }

  // The lines of a file, read 64 MB at a time: one read cannot pass 2 GB, and
  // the issue list of a very large analysis is several times that.
  function eachLine(full, fn) {
    const CHUNK = 64 * 1048576;
    const fd = fs.openSync(full, 'r');
    try {
      let rest = Buffer.alloc(0);
      for (;;) {
        const chunk = Buffer.allocUnsafe(CHUNK);
        const n = fs.readSync(fd, chunk, 0, CHUNK, null);
        const buf = rest.length ? Buffer.concat([rest, chunk.subarray(0, n)]) : chunk.subarray(0, n);
        let start = 0;
        for (let end = buf.indexOf(10, start); end >= 0; end = buf.indexOf(10, start)) {
          if (end > start) fn(buf.toString('utf8', start, end));
          start = end + 1;
        }
        rest = Buffer.from(buf.subarray(start));
        if (n === 0) break;
      }
      if (rest.length) fn(rest.toString('utf8'));
    } finally {
      fs.closeSync(fd);
    }
  }

  /** Copies the workspace (with its issue lists) to another folder. */
  function copyTo(target) {
    fs.mkdirSync(path.join(target, ISSUES), { recursive: true });
    fs.copyFileSync(file, path.join(target, 'workspace.json'));
    idb().copyTo(target);
    for (const name of safeList(path.join(dir, ISSUES))) fs.copyFileSync(path.join(dir, ISSUES, name), path.join(target, ISSUES, name));
  }
  /** Resolves when the lists of an older issues.db have moved to their files (they move in the background). */
  const storageIdle = () => idb().whenIdle();
  return { dir, file, load, save, copyTo, touch, changed, prepareLists, storageIdle, pendingByKeys, updatePending, issueRevision, searchIssues, issueFacets, issuesOf: readIssues, loadIssues, pendingIssues, issueCount, copyAnalysis, changesOf, severityPage, severityOrder, headReady };
}

const ISSUES = 'issues';
// Issues in the head file of a large list (see severityPage): what the window
// shows of one analysis (src/lib/backend.js MAX_WINDOW_ISSUES).
const HEAD_SIZE = 200000;
const HEAD_SUFFIX = '.head.ndjson';

// Indexes of an issue list, most severe first (stable), kept per list until it changes.
const SEVERITY_RANK = { BLOCKER: 0, CRITICAL: 1, MAJOR: 2, MINOR: 3, INFO: 4 };
const severityOrders = new WeakMap();
function severityOrder(list) {
  let hit = severityOrders.get(list);
  if (!hit || hit.length !== list.length) {
    const rank = (i) => SEVERITY_RANK[i.severity] ?? 5;
    hit = Uint32Array.from({ length: list.length }, (_, n) => n).sort((x, y) => rank(list[x]) - rank(list[y]) || x - y);
    severityOrders.set(list, hit);
  }
  return hit;
}
// Baselines this long (or line-hash maps with a tenth as many files) get a file of their own.
const BLOB_MIN = 1000;

function* issueLines(issues) {
  let buf = '';
  for (const issue of issues) {
    buf += `${JSON.stringify(issue)}\n`;
    if (buf.length >= 1 << 20) { yield buf; buf = ''; }
  }
  if (buf) yield buf;
}

// Written to a temporary file first: a crash mid-write leaves the old file.
function writeAtomic(target, chunks) {
  const tmp = `${target}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try {
    for (const chunk of chunks) fs.writeSync(fd, chunk);
  } finally {
    fs.closeSync(fd);
  }
  try {
    fs.renameSync(tmp, target);
  } catch {
    // Windows refuses the rename while another process has the file open.
    fs.copyFileSync(tmp, target);
    fs.rmSync(tmp, { force: true });
  }
}

function safeList(folder) {
  try {
    return fs.readdirSync(folder).filter((name) => name.endsWith('.ndjson') || name.endsWith('.json'));
  } catch {
    return [];
  }
}

function projectIdFor(folder) {
  return crypto.createHash('sha1').update(path.resolve(folder).toLowerCase()).digest('hex').slice(0, 12);
}

module.exports = { defaultConfigDir, freshWorkspace, createStore, projectIdFor };

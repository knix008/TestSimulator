'use strict';

// MyCodeChecker language server (SonarQube for IDE / Coverity Code Sight style).
// Plain Node, JSON-RPC over any byte stream (stdio in server.js). Every
// analysis goes through core/analyze.js analyzeSources(), so all engines in
// core/engines.js run exactly as in a server scan.
//
// Custom protocol (besides the standard LSP features):
//   request  mycodechecker/ruleDescription  { rule, language? }        -> RuleDescription
//   request  mycodechecker/analyzeWorkspace { uri? }                   -> { files, issues, durationMs }
//   request  mycodechecker/analyzeFile      { uri }                    -> { issues }
//   request  mycodechecker/securityFindings { kind?: 'all'|'hotspots'|'taint'|'vulnerabilities' } -> { analyzed, items }
//   request  mycodechecker/issues           { uri? }                   -> { items }
//   request  mycodechecker/connectedStatus  {}                         -> status
//   request  mycodechecker/issueLink        { key }                    -> { url }
//   notify   mycodechecker/analysisDone     (server -> client)  { kind, uris, issues, durationMs }
//   notify   mycodechecker/settingsChanged  (server -> client)  { inactiveRules, activeRules }
//   commands mycodechecker.deactivateRule / activateRule / analyzeWorkspace / analyzeFile /
//            refreshConnection / showRuleDescription / openIssue (workspace/executeCommand)

const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');
const { createConnection, ERR } = require('./jsonrpc');
const { normalize, analysisKey, connectionKey } = require('./config');
const { uriToPath, pathToUri, pathKey, isInside, toRel, toDiagnostic, issueRange, text } = require('./issues');
const { fixesFor, suppressionEdit, toTextEdit } = require('./fixes');
const { describeRule } = require('./rules');
const { fetchConnected } = require('./connected');

const COMMANDS = [
  'mycodechecker.deactivateRule',
  'mycodechecker.activateRule',
  'mycodechecker.analyzeWorkspace',
  'mycodechecker.analyzeFile',
  'mycodechecker.refreshConnection',
  'mycodechecker.showRuleDescription',
  'mycodechecker.openIssue',
];

function splitLines(t) {
  return String(t == null ? '' : t).split(/\r?\n/);
}

function createAnalyzer() {
  let worker = null;
  let seq = 0;
  const waiting = new Map();
  const failAll = (err) => {
    for (const w of waiting.values()) w.reject(err);
    waiting.clear();
  };
  function ensure() {
    if (worker) return worker;
    worker = new Worker(path.join(__dirname, 'worker.js'), { stdout: true, stderr: true });
    worker.stdout.resume();
    worker.stderr.resume();
    worker.on('message', (m) => {
      const w = waiting.get(m.id);
      if (!w) return;
      waiting.delete(m.id);
      if (m.ok) w.resolve(m.result);
      else w.reject(new Error(m.error));
    });
    worker.on('error', (err) => { worker = null; failAll(err); });
    worker.on('exit', () => { worker = null; failAll(new Error('Analysis worker stopped')); });
    return worker;
  }
  return {
    run(job) {
      const w = ensure();
      const id = ++seq;
      return new Promise((resolve, reject) => {
        waiting.set(id, { resolve, reject });
        w.postMessage({ ...job, id });
      });
    },
    terminate() {
      const w = worker;
      worker = null;
      if (w) return w.terminate();
      return Promise.resolve();
    },
  };
}

function createLanguageServer(input, output, opts = {}) {
  const conn = createConnection(input, output, { onClose: () => { if (opts.onClose) opts.onClose(); } });
  const analyzer = createAnalyzer();
  let cfg = normalize({});
  let initialized = false;
  let shutdownRequested = false;
  const docs = new Map();          // pathKey -> { uri, path, text, version }
  const roots = new Map();         // pathKey(root) -> RootState
  const published = new Map();     // uri -> true
  let connected = null;            // fetchConnected() result
  let connError = null;
  let refreshTimer = null;

  // ── Roots and index ─────────────────────────────────────
  function rootState(rootPath, isFolder) {
    const k = pathKey(rootPath);
    let st = roots.get(k);
    if (!st) {
      st = { path: path.resolve(rootPath), folder: !!isFolder, analyzed: false, issues: new Map() };
      roots.set(k, st);
    } else if (isFolder) st.folder = true;
    return st;
  }

  function rootFor(file) {
    let best = null;
    for (const st of roots.values()) {
      if (!st.folder) continue;
      if (isInside(st.path, file) && (!best || st.path.length > best.path.length)) best = st;
    }
    return best || rootState(path.dirname(file), false);
  }

  function folderRoots() {
    return [...roots.values()].filter((r) => r.folder);
  }

  function absOf(st, rel) {
    return path.join(st.path, rel);
  }

  function uriOf(abs) {
    const d = docs.get(pathKey(abs));
    return d ? d.uri : pathToUri(abs);
  }

  function linesOfAbs(abs, cache) {
    const k = pathKey(abs);
    const d = docs.get(k);
    if (d) return splitLines(d.text);
    if (cache && cache.has(k)) return cache.get(k);
    let lines = null;
    try { lines = splitLines(fs.readFileSync(abs, 'utf8')); } catch { lines = null; }
    if (cache) cache.set(k, lines);
    return lines;
  }

  // ── Filtering (local rule switches, connected-mode statuses) ─────
  function inactiveSet() {
    const set = new Set([...(connected ? connected.inactive : []), ...cfg.inactiveRules]);
    for (const k of cfg.activeRules) set.delete(k);
    return set;
  }

  function visible(issue, inactive) {
    if (inactive.has(issue.rule)) return false;
    if (!cfg.showHotspots && issue.type === 'SECURITY_HOTSPOT') return false;
    if (connected) {
      if (connected.suppressedKeys.has(issue.key)) return false;
      if (issue.cid != null && connected.suppressedCids.has(String(issue.cid))) return false;
    }
    return true;
  }

  function visibleIssues(st, rel) {
    const inactive = inactiveSet();
    return (st.issues.get(rel) || []).filter((i) => visible(i, inactive));
  }

  function ruleLink(key) {
    const enc = encodeURIComponent(key);
    if (cfg.ruleLinkTemplate) return cfg.ruleLinkTemplate.replace(/\{key\}/g, enc);
    const server = connected && connected.serverUrl;
    if (server) return `${server.replace(/\/+$/, '')}/?rule=${enc}`;
    return null;
  }

  function analysisOptions(st) {
    const severityOverrides = { ...(connected ? connected.overrides : {}), ...cfg.severityOverrides };
    return {
      root: st.path,
      inactive: [...inactiveSet()],
      overrides: severityOverrides,
      exclusions: ['.mycodechecker/**', ...(connected ? connected.exclusions : []), ...cfg.exclusions],
      customRules: connected ? connected.customRules : [],
      cfamily: {
        includeDirs: cfg.includeDirs.map((d) => path.resolve(st.path, d)),
        defines: cfg.defines,
      },
    };
  }

  // ── Publishing ──────────────────────────────────────────
  function publishFile(st, rel, cache) {
    const abs = absOf(st, rel);
    const uri = uriOf(abs);
    const issues = visibleIssues(st, rel);
    if (!issues.length) {
      if (published.has(uri)) {
        conn.notify('textDocument/publishDiagnostics', { uri, diagnostics: [] });
        published.delete(uri);
      }
      return 0;
    }
    const lines = linesOfAbs(abs, cache) || [];
    const ctx = {
      lang: cfg.language,
      lines,
      rootPath: st.path,
      linesOf: (other) => linesOfAbs(absOf(st, other), cache),
      ruleLink,
    };
    const doc = docs.get(pathKey(abs));
    const params = { uri, diagnostics: issues.map((i) => toDiagnostic(i, ctx)) };
    if (doc && doc.version != null) params.version = doc.version;
    conn.notify('textDocument/publishDiagnostics', params);
    published.set(uri, true);
    return issues.length;
  }

  function publishRoot(st, rels) {
    const cache = new Map();
    let n = 0;
    for (const rel of rels || st.issues.keys()) n += publishFile(st, rel, cache);
    return n;
  }

  function republishAll() {
    const shown = new Set();
    for (const st of roots.values()) {
      publishRoot(st);
      for (const rel of st.issues.keys()) shown.add(uriOf(absOf(st, rel)));
    }
    for (const uri of [...published.keys()]) {
      if (!shown.has(uri)) {
        conn.notify('textDocument/publishDiagnostics', { uri, diagnostics: [] });
        published.delete(uri);
      }
    }
  }

  // ── Analysis scheduling ─────────────────────────────────
  const queue = [];               // workspace jobs: { st, promise, resolve, reject }
  const dirty = new Map();        // pathKey -> { abs, waiters: [] }
  const timers = new Map();       // pathKey -> timeout
  let busy = false;
  let connReady = Promise.resolve();

  function markDirty(abs, delay) {
    const k = pathKey(abs);
    if (timers.has(k)) { clearTimeout(timers.get(k)); timers.delete(k); }
    const entry = dirty.get(k) || { abs, waiters: [], ready: false };
    dirty.set(k, entry);
    const fire = () => { timers.delete(k); entry.ready = true; pump(); };
    if (delay > 0) {
      const t = setTimeout(fire, delay);
      timers.set(k, t);
    } else fire();
    return new Promise((resolve) => entry.waiters.push(resolve));
  }

  function enqueueWorkspace(st) {
    const existing = queue.find((j) => j.st === st);
    if (existing) return existing.promise;
    const job = { st };
    job.promise = new Promise((resolve, reject) => { job.resolve = resolve; job.reject = reject; });
    queue.push(job);
    pump();
    return job.promise;
  }

  async function pump() {
    if (busy) return;
    busy = true;
    try {
      await connReady;
      for (;;) {
        if (shutdownRequested) break;
        if (queue.length) {
          const job = queue.shift();
          try { job.resolve(await runWorkspace(job.st)); } catch (err) { log(1, `Workspace analysis failed: ${err.message}`); job.reject(err); }
          continue;
        }
        const ready = [...dirty.entries()].filter(([, e]) => e.ready);
        if (!ready.length) break;
        // One root per job: files of the same root share one analysis.
        const st = rootFor(ready[0][1].abs);
        const batch = ready.filter(([, e]) => rootFor(e.abs) === st);
        for (const [k] of batch) dirty.delete(k);
        let result = null;
        try { result = await runFiles(st, batch.map(([, e]) => e.abs)); } catch (err) { log(1, `Analysis failed: ${err.message}`); }
        for (const [, e] of batch) for (const w of e.waiters) w(result);
      }
    } finally {
      busy = false;
    }
  }

  function overlaySources(st) {
    const sources = [];
    for (const d of docs.values()) if (rootFor(d.path) === st) sources.push({ path: d.path, text: d.text });
    return sources;
  }

  // Files whose findings cross into `rels` (and the other way round).
  function linkedFiles(st, rels) {
    const want = new Set(rels);
    const out = new Set();
    for (const [file, issues] of st.issues) {
      for (const issue of issues) {
        for (const ev of issue.events || []) {
          if (!ev.file || ev.file === issue.file) continue;
          if (want.has(file)) out.add(ev.file);
          if (want.has(ev.file)) out.add(file);
        }
      }
    }
    for (const r of rels) out.delete(r);
    return [...out];
  }

  function refsAny(issue, set) {
    return (issue.events || []).some((ev) => ev.file && ev.file !== issue.file && set.has(ev.file));
  }

  async function runFiles(st, absList) {
    const rels = absList.map((a) => toRel(st.path, a));
    const linked = linkedFiles(st, rels);
    const relSet = new Set(rels);
    // The changed files plus the files their findings link to; open editors
    // give their unsaved text, the rest is read from disk.
    const sources = [];
    const readPaths = [];
    for (const abs of [...absList, ...linked.map((rel) => absOf(st, rel))]) {
      const d = docs.get(pathKey(abs));
      if (d) sources.push({ path: d.path, text: d.text });
      else readPaths.push(abs);
    }
    const result = await analyzer.run({ sources, readPaths, options: analysisOptions(st) });
    const fresh = result.issues;
    for (const rel of rels) {
      const mine = fresh.filter((i) => i.file === rel);
      if (mine.length) st.issues.set(rel, mine);
      else st.issues.delete(rel);
    }
    const touched = new Set(rels);
    for (const rel of linked) {
      if (relSet.has(rel)) continue;
      const old = st.issues.get(rel) || [];
      const keep = old.filter((i) => !refsAny(i, relSet));
      const add = fresh.filter((i) => i.file === rel && refsAny(i, relSet));
      if (keep.length === old.length && !add.length) continue;
      const seen = new Set();
      const merged = [...keep, ...add].filter((i) => (seen.has(i.key) ? false : seen.add(i.key)));
      if (merged.length) st.issues.set(rel, merged);
      else st.issues.delete(rel);
      touched.add(rel);
    }
    const count = publishRoot(st, [...touched]);
    // Files dropped from the index still need their old diagnostics cleared.
    for (const rel of touched) if (!st.issues.has(rel)) publishFile(st, rel);
    const uris = rels.map((rel) => uriOf(absOf(st, rel)));
    conn.notify('mycodechecker/analysisDone', { kind: 'file', uris, issues: count, durationMs: result.durationMs });
    return { uris, issues: fresh.filter((i) => relSet.has(i.file)).length, durationMs: result.durationMs };
  }

  async function runWorkspace(st) {
    const options = analysisOptions(st);
    const result = await analyzer.run({
      sources: overlaySources(st),
      walk: { root: st.path, exclusions: options.exclusions, maxFiles: cfg.maxWorkspaceFiles },
      options,
    });
    const before = [...st.issues.keys()];
    st.issues = new Map();
    for (const issue of result.issues) {
      if (!st.issues.has(issue.file)) st.issues.set(issue.file, []);
      st.issues.get(issue.file).push(issue);
    }
    st.analyzed = true;
    const count = publishRoot(st);
    for (const rel of before) if (!st.issues.has(rel)) publishFile(st, rel);
    conn.notify('mycodechecker/analysisDone', { kind: 'workspace', uris: [pathToUri(st.path)], issues: count, files: result.files.length, durationMs: result.durationMs });
    log(3, `Analyzed ${result.files.length} files in ${result.durationMs} ms: ${count} issues`);
    return { files: result.files.length, issues: count, durationMs: result.durationMs };
  }

  function reanalyzeAll() {
    const jobs = [];
    for (const st of roots.values()) {
      if (st.analyzed) jobs.push(enqueueWorkspace(st));
    }
    for (const d of docs.values()) if (!rootFor(d.path).analyzed) jobs.push(markDirty(d.path, 0));
    return Promise.all(jobs);
  }

  // ── Connected mode ──────────────────────────────────────
  async function refreshConnection() {
    const c = cfg.connected;
    if (!c.enabled || !c.serverUrl) {
      const had = !!connected;
      connected = null;
      connError = null;
      return { changed: had };
    }
    const first = folderRoots()[0];
    try {
      const next = await fetchConnected({
        serverUrl: c.serverUrl.replace(/\/+$/, ''),
        token: c.token,
        projectKey: c.projectKey,
        profile: cfg.qualityProfile,
        rootPath: first ? first.path : null,
      });
      const prevAnalysis = connected ? JSON.stringify([connected.inactive, connected.overrides, connected.exclusions, connected.customRules]) : '';
      connected = next;
      connError = null;
      const nextAnalysis = JSON.stringify([next.inactive, next.overrides, next.exclusions, next.customRules]);
      return { changed: true, analysisChanged: prevAnalysis !== nextAnalysis };
    } catch (err) {
      connError = String(err.message || err);
      log(2, `Connected mode: ${connError}`);
      return { changed: false, error: connError };
    }
  }

  function connectedStatus() {
    const c = cfg.connected;
    return {
      enabled: !!(c.enabled && c.serverUrl),
      connected: !!connected,
      serverUrl: c.serverUrl || null,
      project: connected ? connected.project : null,
      profile: connected ? connected.profile : null,
      inactiveRules: connected ? connected.inactive.length : 0,
      suppressedIssues: connected ? connected.suppressedKeys.size + connected.suppressedCids.size : 0,
      fetchedAt: connected ? connected.fetchedAt : null,
      error: connError,
    };
  }

  function scheduleRefresh() {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    const minutes = cfg.connected.refreshMinutes;
    if (!cfg.connected.enabled || !cfg.connected.serverUrl || !minutes) return;
    refreshTimer = setInterval(async () => {
      const r = await refreshConnection();
      if (r.analysisChanged) reanalyzeAll();
      else if (r.changed) republishAll();
    }, minutes * 60000);
    if (refreshTimer.unref) refreshTimer.unref();
  }

  async function applyConfig(raw) {
    const prev = cfg;
    const next = normalize(raw, cfg);
    cfg = next;
    let reanalyze = analysisKey(prev) !== analysisKey(next);
    if (connectionKey(prev) !== connectionKey(next)) {
      // Data fetched with other credentials or for another server is dropped;
      // a failed periodic refresh, by contrast, keeps the last good copy.
      const had = !!connected;
      connected = null;
      await refreshConnection();
      if (had || connected) reanalyze = true;
      scheduleRefresh();
    }
    if (reanalyze) await reanalyzeAll();
    republishAll();
  }

  function log(type, message) {
    conn.notify('window/logMessage', { type, message: `[MyCodeChecker] ${message}` });
  }

  // ── Lookup helpers ──────────────────────────────────────
  function docIssues(uri) {
    const abs = uriToPath(uri);
    if (!abs) return { st: null, rel: null, abs: null, issues: [] };
    const st = rootFor(abs);
    const rel = toRel(st.path, abs);
    return { st, rel, abs, issues: visibleIssues(st, rel) };
  }

  function containsPos(range, pos) {
    const after = pos.line > range.start.line || (pos.line === range.start.line && pos.character >= range.start.character);
    const before = pos.line < range.end.line || (pos.line === range.end.line && pos.character <= range.end.character);
    return after && before;
  }

  function overlaps(a, b) {
    return !(a.end.line < b.start.line || (a.end.line === b.start.line && a.end.character < b.start.character)
      || b.end.line < a.start.line || (b.end.line === a.start.line && b.end.character < a.start.character));
  }

  function findIssueByKey(key) {
    for (const st of roots.values()) {
      for (const issues of st.issues.values()) {
        const hit = issues.find((i) => i.key === key);
        if (hit) return { st, issue: hit };
      }
    }
    return null;
  }

  function issueLink(key) {
    if (!connected || !connected.project) return null;
    return `${connected.serverUrl.replace(/\/+$/, '')}/?project=${encodeURIComponent(connected.project.id)}&issue=${encodeURIComponent(key)}`;
  }

  function issueItem(st, issue, category) {
    const lang = cfg.language;
    return {
      key: issue.key,
      rule: issue.rule,
      type: issue.type,
      severity: issue.severity,
      category,
      engine: issue.engine || null,
      uri: uriOf(absOf(st, issue.file)),
      file: issue.file,
      line: issue.line,
      message: text(issue.message, lang),
      flows: (issue.events || []).filter((ev) => ev && ev.line).map((ev) => ({
        uri: uriOf(absOf(st, ev.file || issue.file)),
        file: ev.file || issue.file,
        line: ev.line,
        tag: ev.tag || '',
        message: text(ev.text, lang),
      })),
    };
  }

  function categoryOf(issue) {
    if (issue.type === 'SECURITY_HOTSPOT') return 'hotspot';
    if (issue.engine === 'taint' || String(issue.rule).startsWith('taint:')) return 'taint';
    if (issue.type === 'VULNERABILITY') return 'vulnerability';
    return null;
  }

  // ── Protocol handlers ───────────────────────────────────
  conn.onRequest('initialize', (params = {}) => {
    const init = params.initializationOptions || {};
    const folders = params.workspaceFolders || [];
    for (const f of folders) { const p = uriToPath(f.uri); if (p) rootState(p, true); }
    if (!folders.length) {
      const p = uriToPath(params.rootUri) || (params.rootPath ? path.resolve(params.rootPath) : null);
      if (p) rootState(p, true);
    }
    // Settings: defaults < settings file < initializationOptions. The file is
    // for clients that cannot send initializationOptions (see ide/*/README.md).
    const fileSettings = readSettingsFile(folderRoots()[0]);
    cfg = normalize(init, normalize(fileSettings || {}));
    const langGiven = (o) => !!(o && (o.language || (o.mycodechecker && o.mycodechecker.language)));
    if (!langGiven(init) && !langGiven(fileSettings) && /^ko/i.test(params.locale || '')) cfg.language = 'ko';
    return {
      capabilities: {
        textDocumentSync: { openClose: true, change: 1, save: { includeText: false } },
        hoverProvider: true,
        codeActionProvider: { codeActionKinds: ['quickfix'] },
        executeCommandProvider: { commands: COMMANDS },
        workspace: { workspaceFolders: { supported: true, changeNotifications: true } },
      },
      serverInfo: { name: 'MyCodeChecker', version: opts.version || '1.0.0' },
    };
  });

  conn.onNotification('initialized', async () => {
    initialized = true;
    // Analyses wait for the first connected-mode fetch so the server's profile
    // and issue statuses apply from the first diagnostics on.
    connReady = refreshConnection().then(() => scheduleRefresh(), () => {});
    await connReady;
    if (cfg.analyzeWorkspaceOnStart) for (const st of folderRoots()) enqueueWorkspace(st).catch(() => {});
  });

  conn.onRequest('shutdown', async () => {
    shutdownRequested = true;
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
    if (refreshTimer) clearInterval(refreshTimer);
    await analyzer.terminate();
    return null;
  });

  conn.onNotification('exit', () => {
    conn.close();
    if (opts.onExit) opts.onExit(shutdownRequested ? 0 : 1);
  });

  conn.onNotification('textDocument/didOpen', (params) => {
    const td = params.textDocument;
    const abs = uriToPath(td.uri);
    if (!abs) return;
    docs.set(pathKey(abs), { uri: td.uri, path: abs, text: td.text || '', version: td.version });
    markDirty(abs, 0);
  });

  conn.onNotification('textDocument/didChange', (params) => {
    const td = params.textDocument;
    const abs = uriToPath(td.uri);
    if (!abs) return;
    const d = docs.get(pathKey(abs));
    if (!d) return;
    for (const ch of params.contentChanges || []) {
      if (!ch.range) d.text = ch.text;
      else d.text = applyRangeChange(d.text, ch.range, ch.text);
    }
    d.version = td.version;
    if (cfg.analyzeOnChange) markDirty(abs, cfg.debounceMs);
  });

  conn.onNotification('textDocument/didSave', (params) => {
    const abs = uriToPath(params.textDocument.uri);
    if (!abs) return;
    const d = docs.get(pathKey(abs));
    if (d && typeof params.text === 'string') d.text = params.text;
    markDirty(abs, 0);
  });

  conn.onNotification('textDocument/didClose', (params) => {
    const abs = uriToPath(params.textDocument.uri);
    if (!abs) return;
    const k = pathKey(abs);
    docs.delete(k);
    if (timers.has(k)) { clearTimeout(timers.get(k)); timers.delete(k); }
    dirty.delete(k);
    const st = rootFor(abs);
    const rel = toRel(st.path, abs);
    if (st.analyzed) {
      markDirty(abs, 0); // back to the text on disk
    } else {
      st.issues.delete(rel);
      const uri = params.textDocument.uri;
      if (published.has(uri)) {
        conn.notify('textDocument/publishDiagnostics', { uri, diagnostics: [] });
        published.delete(uri);
      }
    }
  });

  conn.onNotification('workspace/didChangeConfiguration', (params) => applyConfig(params && params.settings !== undefined ? params.settings : params));

  conn.onNotification('workspace/didChangeWorkspaceFolders', (params) => {
    const ev = (params && params.event) || {};
    for (const f of ev.removed || []) {
      const p = uriToPath(f.uri);
      if (!p) continue;
      const st = roots.get(pathKey(p));
      if (st) { st.issues.clear(); roots.delete(pathKey(p)); }
    }
    for (const f of ev.added || []) { const p = uriToPath(f.uri); if (p) rootState(p, true); }
    republishAll();
  });

  conn.onNotification('workspace/didChangeWatchedFiles', (params) => {
    for (const ch of (params && params.changes) || []) {
      const abs = uriToPath(ch.uri);
      if (!abs || docs.has(pathKey(abs))) continue;
      const st = rootFor(abs);
      if (!st.analyzed) continue;
      if (ch.type === 3) {
        const rel = toRel(st.path, abs);
        st.issues.delete(rel);
        publishFile(st, rel);
      } else markDirty(abs, cfg.debounceMs);
    }
  });

  conn.onRequest('textDocument/hover', (params) => {
    const { st, abs, issues } = docIssues(params.textDocument.uri);
    if (!st || !issues.length) return null;
    const lines = linesOfAbs(abs) || [];
    const hits = issues.filter((i) => containsPos(issueRange(i, lines), params.position));
    if (!hits.length) return null;
    const seen = new Set();
    const parts = [];
    for (const issue of hits) {
      if (seen.has(issue.rule + issue.line)) continue;
      seen.add(issue.rule + issue.line);
      parts.push(describeRule(issue.rule, cfg.language, issue).markdown);
    }
    return { contents: { kind: 'markdown', value: parts.join('\n\n---\n\n') } };
  });

  conn.onRequest('textDocument/codeAction', (params) => {
    const uri = params.textDocument.uri;
    const { st, abs, issues } = docIssues(uri);
    if (!st || !issues.length) return [];
    const lines = linesOfAbs(abs) || [];
    const ko = cfg.language === 'ko';
    const diags = (params.context && params.context.diagnostics) || [];
    let targets = [];
    for (const d of diags) {
      const key = d.data && d.data.key;
      const hit = key ? issues.find((i) => i.key === key) : issues.find((i) => i.rule === d.code && i.line === d.range.start.line + 1);
      if (hit) targets.push({ issue: hit, diag: d });
    }
    if (!targets.length) {
      targets = issues.filter((i) => overlaps(issueRange(i, lines), params.range)).map((issue) => ({ issue, diag: null }));
    }
    const ctx = { lang: cfg.language, lines, rootPath: st.path, linesOf: (rel) => linesOfAbs(absOf(st, rel)), ruleLink };
    const actions = [];
    const ruleDone = new Set();
    const only = params.context && params.context.only;
    const wantQuickfix = !only || only.some((k) => k === 'quickfix' || k.startsWith('quickfix'));
    if (!wantQuickfix) return [];
    for (const { issue, diag } of targets) {
      const diagnostic = diag || toDiagnostic(issue, ctx);
      const fixes = fixesFor(issue, lines);
      fixes.forEach((fix, n) => {
        const changes = {};
        for (const e of fix.edits) {
          const target = e.file ? uriOf(absOf(st, e.file)) : uri;
          (changes[target] = changes[target] || []).push(toTextEdit(e));
        }
        actions.push({ title: text(fix.title, cfg.language) || 'Fix', kind: 'quickfix', diagnostics: [diagnostic], isPreferred: n === 0, edit: { changes } });
      });
      const sup = suppressionEdit(issue, lines, abs);
      if (sup) {
        actions.push({
          title: ko ? `NOSONAR로 '${issue.rule}' 숨기기` : `Suppress '${issue.rule}' with NOSONAR`,
          kind: 'quickfix',
          diagnostics: [diagnostic],
          edit: { changes: { [uri]: [toTextEdit(sup)] } },
        });
      }
      if (ruleDone.has(issue.rule)) continue;
      ruleDone.add(issue.rule);
      const name = describeRule(issue.rule, cfg.language, issue).title;
      actions.push({
        title: ko ? `규칙 설명 보기: ${name}` : `Show rule description: ${name}`,
        kind: 'quickfix',
        diagnostics: [diagnostic],
        command: { title: 'Show rule description', command: 'mycodechecker.showRuleDescription', arguments: [issue.rule] },
      });
      actions.push({
        title: ko ? `규칙 끄기: ${issue.rule}` : `Deactivate rule '${issue.rule}'`,
        kind: 'quickfix',
        diagnostics: [diagnostic],
        command: { title: 'Deactivate rule', command: 'mycodechecker.deactivateRule', arguments: [issue.rule] },
      });
      if (connected && connected.project) {
        actions.push({
          title: ko ? 'MyCodeChecker에서 이슈 열기' : 'Open issue in MyCodeChecker',
          kind: 'quickfix',
          diagnostics: [diagnostic],
          command: { title: 'Open issue', command: 'mycodechecker.openIssue', arguments: [issue.key] },
        });
      }
    }
    return actions;
  });

  async function setRuleActive(key, active) {
    const inactive = new Set(cfg.inactiveRules);
    const activeRules = new Set(cfg.activeRules);
    if (active) {
      inactive.delete(key);
      if (connected && connected.inactive.includes(key)) activeRules.add(key);
    } else {
      inactive.add(key);
      activeRules.delete(key);
    }
    cfg = { ...cfg, inactiveRules: [...inactive], activeRules: [...activeRules] };
    conn.notify('mycodechecker/settingsChanged', { inactiveRules: cfg.inactiveRules, activeRules: cfg.activeRules });
    republishAll();
    if (active) await reanalyzeAll();
    return { ok: true, inactiveRules: cfg.inactiveRules, activeRules: cfg.activeRules };
  }

  async function analyzeWorkspace(params = {}) {
    let targets = folderRoots();
    if (params.uri) {
      const p = uriToPath(params.uri);
      if (p) targets = [roots.get(pathKey(p)) || rootState(p, true)];
    }
    if (!targets.length) return { files: 0, issues: 0, durationMs: 0 };
    const results = await Promise.all(targets.map((st) => enqueueWorkspace(st)));
    return results.reduce((a, r) => ({ files: a.files + r.files, issues: a.issues + r.issues, durationMs: a.durationMs + r.durationMs }), { files: 0, issues: 0, durationMs: 0 });
  }

  async function analyzeFile(params = {}) {
    const abs = uriToPath(params.uri);
    if (!abs) throw Object.assign(new Error('Not a file URI'), { code: ERR.InvalidParams });
    await markDirty(abs, 0);
    return { issues: docIssues(params.uri).issues.length };
  }

  conn.onRequest('workspace/executeCommand', async (params = {}) => {
    const args = params.arguments || [];
    switch (params.command) {
      case 'mycodechecker.deactivateRule': return setRuleActive(String(args[0]), false);
      case 'mycodechecker.activateRule': return setRuleActive(String(args[0]), true);
      case 'mycodechecker.analyzeWorkspace': return analyzeWorkspace(args[0] || {});
      case 'mycodechecker.analyzeFile': return analyzeFile(typeof args[0] === 'string' ? { uri: args[0] } : (args[0] || {}));
      case 'mycodechecker.refreshConnection': {
        const r = await refreshConnection();
        if (r.analysisChanged) await reanalyzeAll();
        republishAll();
        return connectedStatus();
      }
      case 'mycodechecker.showRuleDescription': return describeRule(String(args[0]), args[1] || cfg.language);
      case 'mycodechecker.openIssue': return { url: issueLink(String(args[0])) };
      default: throw Object.assign(new Error(`Unknown command ${params.command}`), { code: ERR.InvalidParams });
    }
  });

  conn.onRequest('mycodechecker/ruleDescription', (params = {}) => {
    const key = params.rule || params.key;
    if (!key) throw Object.assign(new Error('rule is required'), { code: ERR.InvalidParams });
    const found = params.issueKey ? findIssueByKey(params.issueKey) : null;
    return describeRule(String(key), params.language || cfg.language, found ? found.issue : null);
  });
  conn.onRequest('mycodechecker/analyzeWorkspace', (params) => analyzeWorkspace(params || {}));
  conn.onRequest('mycodechecker/analyzeFile', (params) => analyzeFile(params || {}));
  conn.onRequest('mycodechecker/connectedStatus', () => connectedStatus());
  conn.onRequest('mycodechecker/issueLink', (params = {}) => ({ url: issueLink(String(params.key || '')) }));
  conn.onRequest('mycodechecker/issues', (params = {}) => {
    const items = [];
    if (params.uri) {
      const { st, issues } = docIssues(params.uri);
      if (st) for (const i of issues) items.push(issueItem(st, i, categoryOf(i)));
      return { items };
    }
    const inactive = inactiveSet();
    for (const st of roots.values()) for (const list of st.issues.values()) for (const i of list) if (visible(i, inactive)) items.push(issueItem(st, i, categoryOf(i)));
    return { items };
  });
  conn.onRequest('mycodechecker/securityFindings', (params = {}) => {
    const kind = params.kind || 'all';
    const inactive = inactiveSet();
    const items = [];
    let analyzed = folderRoots().length > 0;
    for (const st of roots.values()) {
      if (st.folder && !st.analyzed) analyzed = false;
      for (const list of st.issues.values()) {
        for (const issue of list) {
          if (!visible(issue, inactive)) continue;
          const cat = categoryOf(issue);
          if (!cat) continue;
          if (kind === 'hotspots' && cat !== 'hotspot') continue;
          if (kind === 'taint' && cat !== 'taint') continue;
          if (kind === 'vulnerabilities' && cat === 'hotspot') continue;
          items.push(issueItem(st, issue, cat));
        }
      }
    }
    const order = { BLOCKER: 0, CRITICAL: 1, MAJOR: 2, MINOR: 3, INFO: 4 };
    items.sort((a, b) => (order[a.severity] - order[b.severity]) || a.file.localeCompare(b.file) || a.line - b.line);
    return { analyzed, items };
  });

  // Requests we do not implement get MethodNotFound; notifications are ignored.
  conn.onUnhandled((method, params, isRequest) => {
    if (!isRequest) return undefined;
    if (method.startsWith('$/')) return null;
    throw Object.assign(new Error(`Unhandled method ${method}`), { code: ERR.MethodNotFound });
  });

  return {
    connection: conn,
    get config() { return cfg; },
    get initialized() { return initialized; },
    dispose: () => analyzer.terminate(),
  };
}

// <root>/.mycodechecker/lsp.json, or the file named by MCC_LSP_SETTINGS.
function readSettingsFile(st) {
  const candidates = [process.env.MCC_LSP_SETTINGS, st && path.join(st.path, '.mycodechecker', 'lsp.json')].filter(Boolean);
  for (const file of candidates) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* missing or invalid */ }
  }
  return null;
}

function offsetAt(textValue, pos) {
  let offset = 0;
  let line = 0;
  while (line < pos.line) {
    const nl = textValue.indexOf('\n', offset);
    if (nl < 0) return textValue.length;
    offset = nl + 1;
    line++;
  }
  return Math.min(offset + pos.character, textValue.length);
}

function applyRangeChange(textValue, range, newText) {
  const a = offsetAt(textValue, range.start);
  const b = offsetAt(textValue, range.end);
  return textValue.slice(0, a) + newText + textValue.slice(b);
}

module.exports = { createLanguageServer, COMMANDS, applyRangeChange };

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
      maxFiles: 8000,
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
        settings: { ...fresh.settings, ...(data.settings || {}) },
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
    const out = { ...next, projects: (next.projects || []).map((p) => splitIssues(p, kept)) };
    writeAtomic(file, jsonChunks(out));
    // Issue files of removed projects and branches go.
    for (const name of safeList(path.join(dir, ISSUES))) {
      if (kept.has(`${ISSUES}/${name}`)) continue;
      fs.rmSync(path.join(dir, ISSUES, name), { force: true });
      cache.delete(path.join(dir, ISSUES, name));
      blobs.delete(path.join(dir, ISSUES, name));
    }
    return next;
  }

  // The issue lists of analyses live in issues/*.ndjson, one issue per line,
  // so a workspace never needs a string larger than one issue: a large
  // project's analysis is more JSON than one JavaScript string can hold.
  function splitIssues(project, kept) {
    const stem = String(project.id).replace(/[^\w.-]/g, '_');
    // A list already on disk (the same array this store read or wrote) is not
    // written again: snapshots never change, and an analysis's issues only when
    // touch() marked them (issue.update changes issues in place).
    const ref = (issues, name, frozen) => {
      const rel = `${ISSUES}/${stem}-${name}.ndjson`;
      const full = path.join(dir, rel);
      if (!(cached(full) === issues && (frozen || !touched.has(issues)))) {
        touched.delete(issues);
        fs.mkdirSync(path.join(dir, ISSUES), { recursive: true });
        writeAtomic(full, issueLines(issues));
        remember(full, issues);
      }
      kept.add(rel);
      return { $file: rel, count: issues.length };
    };
    const short = (text) => crypto.createHash('sha1').update(text).digest('hex').slice(0, 12);
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
      const out = { ...a };
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
        if (state.latest && Array.isArray(state.latest.issues)) next.latest = { ...next.latest, issues: ref(state.latest.issues, bh) };
        // Snapshots stay files until snapshot.compare / defect.lifecycle read them (issuesOf).
        if (Array.isArray(state.snapshots)) {
          next.snapshots = state.snapshots.map((s) => {
            if (s && Array.isArray(s.issues)) return { ...s, issues: ref(s.issues, `snap-${short(`${name}|${s.snapshot}|${s.at}`)}`, true) };
            if (s && s.issues && typeof s.issues.$file === 'string') kept.add(`${ISSUES}/${path.basename(s.issues.$file)}`);
            return s;
          });
        }
        branches[name] = next;
      }
      out = { ...out, branches };
    }
    if (project.desktop) out = { ...out, desktop: baselines(project.desktop, 'desktop') };
    if (project.desktop && Array.isArray(project.desktop.issues)) {
      out = { ...out, desktop: { ...out.desktop, issues: ref(project.desktop.issues, 'desktop') } };
    }
    return out;
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
        if (state.latest) { fill(state.latest); state.latest.issues = readIssues(state.latest.issues); }
      }
      if (project.desktop) { fill(project.desktop); project.desktop.issues = readIssues(project.desktop.issues); }
    }
    return data;
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
    for (const l of lists) if (Array.isArray(l)) touched.add(l);
  }
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
    if (Array.isArray(ref) || !ref || typeof ref.$file !== 'string') return ref;
    const full = path.join(dir, ISSUES, path.basename(ref.$file));
    const hit = cached(full);
    if (hit) return hit;
    let buf;
    try {
      buf = fs.readFileSync(full);
    } catch {
      return [];
    }
    const st = fs.statSync(full);
    const out = [];
    for (let start = 0; start < buf.length;) {
      let end = buf.indexOf(10, start);
      if (end < 0) end = buf.length;
      if (end > start) out.push(JSON.parse(buf.toString('utf8', start, end)));
      start = end + 1;
    }
    cache.set(full, { mtimeMs: st.mtimeMs, size: st.size, issues: out });
    return out;
  }

  /** Copies the workspace (with its issue files) to another folder. */
  function copyTo(target) {
    fs.mkdirSync(path.join(target, ISSUES), { recursive: true });
    fs.copyFileSync(file, path.join(target, 'workspace.json'));
    for (const name of safeList(path.join(dir, ISSUES))) fs.copyFileSync(path.join(dir, ISSUES, name), path.join(target, ISSUES, name));
  }
  return { dir, file, load, save, copyTo, touch, issuesOf: readIssues };
}

const ISSUES = 'issues';
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

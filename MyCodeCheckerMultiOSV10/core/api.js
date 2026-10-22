'use strict';

const fs = require('fs');
const path = require('path');
const { analyzePath, listRules } = require('./analyze');
const { toJson, toCsv, toSarif, toHtml, badge, toDefects } = require('./report');
const { createStore, projectIdFor, freshWorkspace } = require('./store');
const { SONAR_WAY } = require('./qualitygate');
const { DEFAULT_POLICY, slimIssue, isDismissed } = require('./coverity');
const { createExtensions } = require('./api-ext');

function createApi(opts = {}) {
  const store = createStore(opts.configDir);
  const sampleRoot = opts.sampleRoot || path.join(__dirname, '..', 'samples', 'demo');

  function workspace() {
    return store.load();
  }

  function saveWorkspace(data) {
    return store.save(data);
  }

  function gateFor(ws, project) {
    const id = (project && project.gateId) || (ws.gates.find((g) => g.isDefault) || ws.gates[0] || SONAR_WAY).id;
    return ws.gates.find((g) => g.id === id) || ws.gates[0] || SONAR_WAY;
  }

  function inactiveFor(ws) {
    const inactive = new Set();
    const overrides = {};
    for (const profile of ws.profiles || []) {
      for (const key of profile.inactive || []) inactive.add(key);
      Object.assign(overrides, profile.overrides || {});
    }
    return { inactive: [...inactive], overrides };
  }

  const ext = createExtensions({ workspace, saveWorkspace, configDir: opts.configDir });

  async function scan(args) {
    const ws = workspace();
    const folder = args.path || sampleRoot;
    const abs = path.resolve(folder);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
      const err = new Error(`Folder not found: ${abs}`);
      err.code = 'NOT_FOUND';
      throw err;
    }
    const id = args.projectId || projectIdFor(abs);
    let project = (ws.projects || []).find((p) => p.id === id);
    const branch = args.branch || (project && project.mainBranch) || 'main';
    if (!project) {
      project = {
        id,
        key: path.basename(abs).replace(/\s+/g, '-').toLowerCase() || id,
        name: args.name || path.basename(abs),
        path: abs,
        mainBranch: 'main',
        gateId: (ws.gates.find((g) => g.isDefault) || SONAR_WAY).id,
        branches: {},
        issueState: {},
        createdAt: new Date().toISOString(),
      };
      ws.projects.push(project);
    }
    project.path = abs;
    if (args.name) project.name = args.name;
    const branchState = (project.branches && project.branches[branch]) || {};
    const target = args.target || (branch !== project.mainBranch ? project.mainBranch : null);
    const targetKeys = target && project.branches && project.branches[target] ? project.branches[target].keys || [] : [];
    const previousKeys = args.baseline === 'none' ? [] : (target ? targetKeys : (branchState.keys || []));
    const days = Number(ws.settings.newCodeDays) || 30;
    let keys = previousKeys;
    if (!target && ws.settings.newCode === 'days' && branchState.history) {
      const cutoff = Date.now() - days * 86400000;
      const older = [...branchState.history].reverse().find((h) => new Date(h.at).getTime() <= cutoff);
      if (older && older.keys) keys = older.keys;
    }
    const profile = inactiveFor(ws);
    const cov = ws.coverity || {};
    const policy = (cov.policies || []).find((p) => p.id === (project.policyId || '')) || (cov.policies || []).find((p) => p.isDefault) || DEFAULT_POLICY;
    const previousIssues = ((branchState.latest && branchState.latest.issues) || []).map(slimIssue);
    const task = {
      id: `t-${Date.now().toString(36)}`,
      projectId: id,
      branch,
      status: 'SUCCESS',
      submittedAt: new Date().toISOString(),
      warnings: [],
    };
    let analysis;
    try {
      analysis = analyzePath(abs, {
        exclusions: ws.settings.exclusions || [],
        inactive: profile.inactive,
        overrides: profile.overrides,
        customRules: ws.customRules || [],
        limits: ws.settings.limits || {},
        maxFiles: ws.settings.maxFiles || 8000,
        previousKeys: keys,
        hasBaseline: keys.length > 0,
        previousDuplicatedLines: branchState.measures ? branchState.measures.duplicated_lines : 0,
        issueState: project.issueState || {},
        gate: gateFor(ws, project),
        components: cov.components || [],
        models: cov.models || [],
        previousCids: branchState.cids || [],
        previousIssues,
        policy,
        ...ext.engineOptions(ws, project),
      });
    } catch (err) {
      task.status = 'FAILED';
      task.error = err.message;
      task.executedAt = new Date().toISOString();
      ws.tasks = [task, ...(ws.tasks || [])].slice(0, 100);
      saveWorkspace(ws);
      throw err;
    }
    const snapshot = (branchState.snapshot || 0) + (args.commit === false ? 0 : 1);
    analysis.coverity.snapshot = snapshot || 1;
    analysis.coverity.stream = branch;
    analysis.committed = args.commit !== false;
    const summary = {
      at: analysis.finishedAt,
      durationMs: analysis.durationMs,
      measures: analysis.measures,
      ratings: analysis.ratings,
      gate: analysis.qualityGate.status,
      keys: analysis.keys,
      cids: analysis.coverity.cids,
      coverity: {
        snapshot: analysis.coverity.snapshot,
        outstanding: analysis.coverity.outstanding,
        outstandingHigh: analysis.coverity.outstandingHigh,
        newlyDetected: analysis.coverity.newlyDetected,
        dismissed: analysis.coverity.dismissed,
        fixed: analysis.coverity.fixed,
        policy: analysis.coverity.policy.status,
        reference: analysis.coverity.reference,
      },
    };
    if (args.commit === false) {
      project.desktop = analysis;
      project.updatedAt = analysis.finishedAt;
      ws.activeProjectId = id;
      task.executedAt = analysis.finishedAt;
      task.durationMs = analysis.durationMs;
      task.gate = analysis.qualityGate.status;
      task.policy = analysis.coverity.policy.status;
      task.committed = false;
      ws.tasks = [task, ...(ws.tasks || [])].slice(0, 100);
      saveWorkspace(ws);
      return { project: { ...publicProject(project), history: [] }, analysis, task, committed: false };
    }
    project.branches = project.branches || {};
    delete project.desktop;
    const previousLatest = branchState.latest || null;
    const history = [...(branchState.history || []), summary].slice(-30);
    project.branches[branch] = {
      latest: analysis,
      history,
      keys: analysis.keys,
      cids: analysis.coverity.cids,
      measures: analysis.measures,
      snapshot,
      snapshots: branchState.snapshots || [],
      updatedAt: analysis.finishedAt,
    };
    project.updatedAt = analysis.finishedAt;
    ws.activeProjectId = id;
    task.executedAt = analysis.finishedAt;
    task.durationMs = analysis.durationMs;
    task.gate = analysis.qualityGate.status;
    task.policy = analysis.coverity.policy.status;
    task.committed = true;
    try {
      await ext.afterScan(ws, project, branch, analysis, previousLatest);
    } catch (err) {
      task.warnings.push(err.message);
    }
    ws.tasks = [task, ...(ws.tasks || [])].slice(0, 100);
    saveWorkspace(ws);
    const publicHistory = (project.branches[branch].history || []).map(({ keys, cids, ...rest }) => rest);
    return { project: { ...publicProject(project), history: publicHistory }, analysis, task, committed: true };
  }

  function updateIssues(args) {
    const ws = workspace();
    const project = (ws.projects || []).find((p) => p.id === args.projectId);
    if (!project) throw new Error('Project not found');
    const keys = args.keys || [];
    const patch = args.patch || {};
    project.issueState = project.issueState || {};
    const now = new Date().toISOString();
    for (const key of keys) {
      const prev = project.issueState[key] || {};
      const next = { ...prev };
      if (patch.status) next.status = patch.status;
      if (patch.resolution !== undefined) next.resolution = patch.resolution;
      if (patch.assignee !== undefined) { next.assignee = patch.assignee; next.owner = patch.assignee; }
      if (patch.owner !== undefined) { next.owner = patch.owner; next.assignee = patch.owner; }
      if (patch.classification) next.classification = patch.classification;
      if (patch.action) next.action = patch.action;
      if (patch.impact) next.impact = patch.impact;
      if (patch.classification === 'False Positive') { next.status = 'RESOLVED'; next.resolution = 'FALSE-POSITIVE'; }
      else if (patch.classification === 'Intentional' || patch.action === 'Ignore') { next.status = 'RESOLVED'; next.resolution = 'WONTFIX'; }
      else if (patch.classification === 'Bug') { next.status = 'CONFIRMED'; next.resolution = null; }
      else if (patch.classification === 'Pending' || patch.classification === 'Unclassified') { next.status = 'OPEN'; next.resolution = null; }
      next.changelog = [...(prev.changelog || []), { at: now, patch }];
      if (patch.comment) next.comments = [...(prev.comments || []), { at: now, author: patch.author || ws.settings.assignee || 'me', text: patch.comment }];
      project.issueState[key] = next;
      const targets = [];
      for (const branch of Object.values(project.branches || {})) {
        const issue = branch.latest && (branch.latest.issues || []).find((i) => i.key === key);
        if (issue) targets.push(issue);
      }
      if (project.desktop && project.desktop.issues) {
        const issue = project.desktop.issues.find((i) => i.key === key);
        if (issue) targets.push(issue);
      }
      let cid = (args.cids && args.cids[key]) || (keys.length === 1 ? patch.cid : null);
      for (const issue of targets) {
        if (next.status) issue.status = next.status;
        if (next.resolution !== undefined) issue.resolution = next.resolution;
        if (next.assignee !== undefined) issue.assignee = next.assignee;
        if (next.owner !== undefined) issue.owner = next.owner;
        if (next.classification) issue.classification = next.classification;
        if (next.action) issue.action = next.action;
        if (next.impact) issue.impact = next.impact;
        issue.coverityStatus = isDismissed(issue) ? 'Dismissed' : (issue.coverityStatus === 'Dismissed' ? 'Outstanding' : issue.coverityStatus);
        issue.comments = next.comments || [];
        issue.changelog = next.changelog || [];
        if (issue.cid) cid = issue.cid;
      }
      if (cid) project.issueState[`cid:${cid}`] = next;
    }
    saveWorkspace(ws);
    return { ok: true, count: keys.length };
  }

  function readFile(args) {
    const ws = workspace();
    const project = (ws.projects || []).find((p) => p.id === args.projectId);
    if (!project) throw new Error('Project not found');
    const rel = String(args.file || '').replace(/\\/g, '/');
    if (rel.includes('..')) throw new Error('Invalid path');
    const full = path.join(project.path, rel);
    return { path: rel, text: fs.readFileSync(full, 'utf8') };
  }

  function report(args) {
    const ws = workspace();
    const project = (ws.projects || []).find((p) => p.id === args.projectId);
    if (!project) throw new Error('Project not found');
    const branch = (project.branches || {})[args.branch || project.mainBranch || 'main'];
    if (!branch || !branch.latest) throw new Error('No analysis');
    const format = args.format || 'json';
    const lang = args.language || ws.settings.language || 'ko';
    if (format === 'sarif') return { format, body: toSarif(branch.latest), type: 'application/sarif+json' };
    if (format === 'csv') return { format, body: toCsv(branch.latest), type: 'text/csv' };
    if (format === 'html') return { format, body: toHtml(branch.latest, lang), type: 'text/html' };
    if (format === 'badge') return { format, body: badge(branch.latest.qualityGate.status), type: 'image/svg+xml' };
    if (format === 'defects') return { format, body: toDefects(branch.latest), type: 'text/csv' };
    return { format: 'json', body: toJson(branch.latest), type: 'application/json' };
  }

  const methods = {
    'app.info': () => ({ name: 'MyCodeChecker', version: opts.version || '1.0.0', rules: listRules().length }),
    'workspace.load': () => workspace(),
    'workspace.save': (args) => saveWorkspace(args.workspace || args),
    'rules.list': () => listRules(),
    'project.scan': (args) => scan(args || {}),
    'project.sample': (args) => scan({ path: sampleRoot, name: 'Demo', ...(args || {}) }),
    'project.file': (args) => readFile(args || {}),
    'issue.update': (args) => updateIssues(args || {}),
    'report.build': (args) => report(args || {}),
    'project.remove': (args) => {
      const ws = workspace();
      ws.projects = (ws.projects || []).filter((p) => p.id !== args.projectId);
      if (ws.activeProjectId === args.projectId) ws.activeProjectId = ws.projects[0] ? ws.projects[0].id : null;
      return saveWorkspace(ws);
    },
    ...ext.methods,
  };

  async function call(name, args) {
    const fn = methods[name];
    if (!fn) {
      const err = new Error(`Unknown API: ${name}`);
      err.code = 'NO_METHOD';
      throw err;
    }
    return fn(args || {});
  }

  return { call, store, freshWorkspace };
}

function publicProject(project) {
  const { branches, desktop, ...rest } = project;
  const brief = {};
  for (const [name, branch] of Object.entries(branches || {})) {
    brief[name] = { updatedAt: branch.updatedAt, gate: branch.latest && branch.latest.qualityGate.status, measures: branch.measures };
  }
  return { ...rest, branches: brief, latestBranch: project.mainBranch || 'main' };
}

function serializeError(err) {
  return { code: err.code || 'ERROR', message: err.message || String(err) };
}

module.exports = { createApi, serializeError, publicProject };

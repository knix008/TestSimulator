'use strict';

const fs = require('fs');
const path = require('path');
const { analyzePath, listRules, walk, SKIP_DIRS } = require('./analyze');
const { toJson, toCsv, toSarif, toHtml, badge, toDefects } = require('./report');
const { createStore, projectIdFor, freshWorkspace } = require('./store');
const { DEFAULT_GATE, evaluateGate, currentMeasures } = require('./qualitygate');
const { DEFAULT_POLICY, slimIssue, isDismissed } = require('./defects');
const { createExtensions } = require('./api-ext');
const access = require('./access');
const scm = require('./platform/scm');
const tools = require('./platform/tools');
const scheduler = require('./scheduler');
const integrate = require('./integrate');
const aifix = require('./aifix');
const dbsink = require('./dbsink');
const projectfile = require('./projectfile');
const profiles = require('./profiles');
const users = require('./platform/users');
const { merge3 } = require('./merge');

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
    const id = (project && project.gateId) || (ws.gates.find((g) => g.isDefault) || ws.gates[0] || DEFAULT_GATE).id;
    return ws.gates.find((g) => g.id === id) || ws.gates[0] || DEFAULT_GATE;
  }

  // The quality gate as of now: issue-based measures recomputed from the issues'
  // current states and judged by the project's gate as configured now.
  function refreshGates(ws, projectId) {
    for (const project of ws.projects || []) {
      if (projectId && project.id !== projectId) continue;
      const gate = gateFor(ws, project);
      const analyses = [...Object.values(project.branches || {}).map((b) => b && b.latest), project.desktop];
      for (const a of analyses) {
        if (!a || !a.measures) continue;
        a.measures = currentMeasures(a);
        a.qualityGate = evaluateGate(gate, a.measures);
      }
      for (const b of Object.values(project.branches || {})) {
        if (b && b.latest) b.measures = b.latest.measures;
      }
    }
    return ws;
  }

  // The project's profile per language (else the language default), with inheritance.
  function inactiveFor(ws, project) {
    return profiles.resolveForProject(ws, project, listRules());
  }

  // Reports, history and the other extensions see the gate as of now.
  const ext = createExtensions({ workspace: () => refreshGates(workspace()), saveWorkspace, configDir: opts.configDir || store.dir, issuesOf: store.issuesOf });

  // New code definition (code quality): 'previous' analysis, 'days', a specific
  // 'analysis', a 'version' tag or an 'scm' reference branch. SCM and version
  // modes use changed lines from git; the others compare line hashes with the
  // baseline analysis. A project can override the workspace setting.
  async function newCodeOptions(ws, project, branchState, target, keys) {
    const s = { ...(ws.settings || {}), ...((project && project.newCode) || {}) };
    const mode = s.newCode || 'previous';
    if (mode === 'scm' || mode === 'version') {
      const ref = mode === 'version' ? (s.newCodeVersion || null) : (s.newCodeRef || null);
      if (mode === 'version' && !ref) return {};
      try {
        const changed = await scm.changedLines(project.path, ref, { target: mode === 'scm' && !ref ? target : undefined });
        if (changed && changed.files) return { scmChanged: changed };
      } catch { /* not a git folder: fall back to the baseline analysis */ }
    }
    // Older baselines keep only issue keys, not line hashes.
    if (mode === 'days' || mode === 'analysis') return {};
    if (target && project.branches && project.branches[target]) {
      return { previousLineHashes: project.branches[target].lineHashes || null };
    }
    if (!keys.length) return {};
    return { previousLineHashes: branchState.lineHashes || null };
  }

  async function scan(args) {
    const ws = workspace();
    // Changes saved by other calls while this analysis runs are kept: every
    // save merges this scan's changes into the workspace as it is now.
    let base = workspace();
    const commitScan = () => {
      const merged = merge3(base, ws, workspace());
      saveWorkspace(merged);
      // merge3 returns this scan's own object when nothing else changed.
      if (merged !== ws) {
        for (const k of Object.keys(ws)) delete ws[k];
        Object.assign(ws, merged);
      }
      base = cloneSharingAnalyses(merged);
    };
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
        gateId: (ws.gates.find((g) => g.isDefault) || DEFAULT_GATE).id,
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
    const newCodeSetting = { ...ws.settings, ...((project && project.newCode) || {}) };
    if (!target && newCodeSetting.newCode === 'days' && branchState.history) {
      const cutoff = Date.now() - (Number(newCodeSetting.newCodeDays) || days) * 86400000;
      const older = [...branchState.history].reverse().find((h) => new Date(h.at).getTime() <= cutoff);
      if (older && older.keys) keys = older.keys;
    }
    if (!target && newCodeSetting.newCode === 'analysis' && branchState.history) {
      const chosen = branchState.history.find((h) => h.at === newCodeSetting.newCodeAnalysis);
      if (chosen && chosen.keys) keys = chosen.keys;
    }
    const profile = inactiveFor(ws, project);
    const newCode = await newCodeOptions(ws, project, branchState, target, keys);
    const cov = ws.defectAnalysis || {};
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
      analysis = await analyzeFor(args.__job, ws, abs, {
        exclusions: [...(ws.settings.exclusions || []), ...((project && project.exclusions) || []), ...(Array.isArray(args.exclusions) ? args.exclusions : [])],
        excludeDirs: [...((project && project.excludeDirs) || []), ...(Array.isArray(args.excludeDirs) ? args.excludeDirs : [])],
        disabledChecks: require('./checks').disabledChecks(ws.settings),
        coverageReports: (Array.isArray(args.coverageReports) && args.coverageReports.length ? args.coverageReports : null) || (project && project.coverageReports && project.coverageReports.length ? project.coverageReports : ws.settings.coverageReports) || undefined,
        inactive: profile.inactive,
        overrides: profile.overrides,
        customRules: ws.customRules || [],
        limits: ws.settings.limits || {},
        maxFiles: ws.settings.maxFiles || 0,
        previousKeys: keys,
        hasBaseline: keys.length > 0,
        ...newCode,
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
      // A cancelled analysis is recorded as such and sends no failure notice.
      const cancelled = err.code === 'CANCELLED';
      task.status = cancelled ? 'CANCELED' : 'FAILED';
      task.error = err.message;
      task.executedAt = new Date().toISOString();
      ws.tasks = [task, ...(ws.tasks || [])].slice(0, 100);
      commitScan();
      if (!cancelled) integrate.notify(ws, 'scan-failed', { project: { id: project.id, key: project.key, name: project.name }, branch, error: err.message });
      throw err;
    }
    for (const [engine, ext0] of Object.entries(project.external || {})) {
      if (!Array.isArray(ext0.issues)) continue;
      analysis.issues = [...analysis.issues.filter((i) => i.externalEngine !== engine), ...ext0.issues.map((i) => ({ ...i, externalEngine: engine }))];
    }
    const snapshot = (branchState.snapshot || 0) + (args.commit === false ? 0 : 1);
    analysis.defectAnalysis.snapshot = snapshot || 1;
    analysis.defectAnalysis.stream = branch;
    analysis.committed = args.commit !== false;
    const summary = {
      at: analysis.finishedAt,
      durationMs: analysis.durationMs,
      measures: analysis.measures,
      ratings: analysis.ratings,
      gate: analysis.qualityGate.status,
      keys: analysis.keys,
      cids: analysis.defectAnalysis.cids,
      defectAnalysis: {
        snapshot: analysis.defectAnalysis.snapshot,
        outstanding: analysis.defectAnalysis.outstanding,
        outstandingHigh: analysis.defectAnalysis.outstandingHigh,
        newlyDetected: analysis.defectAnalysis.newlyDetected,
        dismissed: analysis.defectAnalysis.dismissed,
        fixed: analysis.defectAnalysis.fixed,
        policy: analysis.defectAnalysis.policy.status,
        reference: analysis.defectAnalysis.reference,
      },
    };
    if (args.commit === false) {
      delete analysis.lineHashes;
      project.desktop = analysis;
      project.updatedAt = analysis.finishedAt;
      ws.activeProjectId = id;
      task.executedAt = analysis.finishedAt;
      task.durationMs = analysis.durationMs;
      task.gate = analysis.qualityGate.status;
      task.policy = analysis.defectAnalysis.policy.status;
      task.committed = false;
      ws.tasks = [task, ...(ws.tasks || [])].slice(0, 100);
      commitScan();
      return { project: { ...publicProject(project), history: [] }, analysis, task, committed: false };
    }
    project.branches = project.branches || {};
    delete project.desktop;
    const previousLatest = branchState.latest || null;
    const history = [...(branchState.history || []), summary].slice(-30);
    const lineHashes = analysis.lineHashes;
    delete analysis.lineHashes;
    project.branches[branch] = {
      lineHashes,
      latest: analysis,
      history,
      keys: analysis.keys,
      cids: analysis.defectAnalysis.cids,
      measures: analysis.measures,
      snapshot,
      snapshots: branchState.snapshots || [],
      updatedAt: analysis.finishedAt,
    };
    project.updatedAt = analysis.finishedAt;
    ws.activeProjectId = id;
    if (!project.projectFile) touchRecent(ws, { kind: 'folder', path: abs, name: project.name, projectId: id });
    task.executedAt = analysis.finishedAt;
    task.durationMs = analysis.durationMs;
    task.gate = analysis.qualityGate.status;
    task.policy = analysis.defectAnalysis.policy.status;
    task.committed = true;
    housekeep(ws);
    try {
      await ext.afterScan(ws, project, branch, analysis, previousLatest);
    } catch (err) {
      task.warnings.push(err.message);
    }
    ws.tasks = [task, ...(ws.tasks || [])].slice(0, 100);
    commitScan();
    for (const [event, ctx] of integrate.analysisEvents(project, branch, analysis, previousLatest)) await integrate.notify(ws, event, ctx);
    // Results to the configured database (Settings › Database › automatic export).
    const dbs = dbsink.settingsOf(ws, store.dir);
    if (dbs.enabled && dbs.autoExport) {
      const job = args.__job;
      try {
        const out = await dbsink.exportAnalysis(dbs, { project, branch, analysis, settings: ws.settings }, {
          isCancelled: () => !!(job && job.status === 'cancelled'),
          onProgress: job ? (pr) => { job.progress = { ...job.progress, ...dbProgress(pr, job.startedAt, job.progress && job.progress.percent) }; } : undefined,
        });
        task.db = { analysisId: out.analysisId, issues: out.issues };
      } catch (err) {
        task.warnings.push(`DB: ${err.message}`);
        // The GUI shows this in a popup after the analysis.
        const { code, text } = require('./errors').describe(err);
        task.dbError = { code, message: err.message, text };
      }
      ws.tasks = [{ ...task }, ...(ws.tasks || []).filter((t) => t.id !== task.id)].slice(0, 100);
      commitScan();
    }
    // Reports written automatically after the analysis (Settings › Reports).
    try {
      const fresh = refreshGates(workspace());
      const stored = (fresh.projects || []).find((p) => p.id === project.id);
      if (stored && ((fresh.settings && fresh.settings.reports) || {}).auto && fresh.settings.reports.auto.enabled) {
        if (args.__job) args.__job.progress = { ...args.__job.progress, phase: 'report', detail: '' };
        const rep = ext.autoReports(fresh, stored, branch);
        if (rep) {
          task.reports = { folder: rep.folder, files: rep.files.map((f) => path.basename(f)) };
          for (const e of rep.errors) task.warnings.push(`Report: ${e}`);
          ws.tasks = [{ ...task }, ...(ws.tasks || []).filter((t) => t.id !== task.id)].slice(0, 100);
          commitScan();
        }
      }
    } catch (err) {
      task.warnings.push(`Report: ${err.message}`);
    }
    const publicHistory = (project.branches[branch].history || []).map(({ keys, cids, ...rest }) => rest);
    return { project: { ...publicProject(project), history: publicHistory }, analysis, task, committed: true };
  }

  // Issue workflow values (code quality statuses and resolutions, hotspot review
  // states, Defect Analysis triage). Anything else is rejected instead of stored.
  const ISSUE_VALUES = {
    status: ['OPEN', 'CONFIRMED', 'REOPENED', 'RESOLVED', 'CLOSED', 'ACCEPTED', 'TO_REVIEW', 'REVIEWED', 'ACKNOWLEDGED', 'SAFE', 'FIXED'],
    resolution: [null, '', 'FALSE-POSITIVE', 'WONTFIX', 'FIXED', 'REMOVED', 'SAFE', 'ACKNOWLEDGED'],
    classification: ['Unclassified', 'Pending', 'False Positive', 'Intentional', 'Bug'],
  };
  function checkIssuePatch(patch) {
    for (const [field, allowed] of Object.entries(ISSUE_VALUES)) {
      if (patch[field] === undefined || (field !== 'resolution' && !patch[field])) continue;
      if (!allowed.includes(patch[field])) throw Object.assign(new Error(`Invalid ${field}: ${patch[field]}`), { code: 'BAD_REQUEST', field });
    }
  }

  function updateIssues(args) {
    const ws = workspace();
    const project = (ws.projects || []).find((p) => p.id === args.projectId);
    if (!project) throw Object.assign(new Error('Project not found'), { code: 'NOT_FOUND' });
    const keys = args.keys || [];
    const patch = args.patch || {};
    project.issueState = project.issueState || {};
    checkIssuePatch(patch);
    const known = new Set(Object.keys(project.issueState));
    for (const b of Object.values(project.branches || {})) for (const i of (b.latest && b.latest.issues) || []) known.add(i.key);
    for (const i of (project.desktop && project.desktop.issues) || []) known.add(i.key);
    const unknown = keys.filter((k) => !known.has(k));
    if (unknown.length) throw Object.assign(new Error(`Unknown issue: ${unknown.slice(0, 3).join(', ')}`), { code: 'NOT_FOUND', keys: unknown });
    const now = new Date().toISOString();
    // security-weakness approval: when required, false positives and accepted
    // issues go through issue.review (request → approve) instead.
    const approval = (ws.settings && ws.settings.approval) || {};
    const closing = patch.resolution === 'FALSE-POSITIVE' || patch.resolution === 'WONTFIX' || patch.status === 'ACCEPTED'
      || patch.classification === 'False Positive' || patch.classification === 'Intentional' || patch.action === 'Ignore';
    if (approval.required && closing && !args.viaApproval) {
      throw Object.assign(new Error('This change needs an approved exception request'), { code: 'APPROVAL_REQUIRED' });
    }
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
      // defect-analysis servers triage attributes.
      if (patch.triageSeverity !== undefined) next.triageSeverity = ['Major', 'Moderate', 'Minor', 'Unspecified'].includes(patch.triageSeverity) ? patch.triageSeverity : 'Unspecified';
      if (patch.externalReference !== undefined) next.externalReference = String(patch.externalReference || '').slice(0, 256);
      if (patch.legacy !== undefined) next.legacy = !!patch.legacy;
      if (Array.isArray(patch.tags)) next.tags = patch.tags.map((x) => String(x).trim().toLowerCase()).filter(Boolean);
      if (patch.review !== undefined) next.review = patch.review;
      if (patch.status === 'ACCEPTED') next.resolution = 'WONTFIX';
      if (patch.classification === 'False Positive') { next.status = 'RESOLVED'; next.resolution = 'FALSE-POSITIVE'; }
      else if (patch.classification === 'Intentional' || patch.action === 'Ignore') { next.status = 'RESOLVED'; next.resolution = 'WONTFIX'; }
      else if (patch.classification === 'Bug') { next.status = 'CONFIRMED'; next.resolution = null; }
      else if (patch.classification === 'Pending' || patch.classification === 'Unclassified') { next.status = 'OPEN'; next.resolution = null; }
      next.changelog = [...(prev.changelog || []), { at: now, patch, ...(args.by ? { by: args.by } : {}) }];
      if (patch.comment) next.comments = [...(prev.comments || []), { at: now, author: args.by || patch.author || ws.settings.assignee || 'me', text: patch.comment }];
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
        if (next.tags) issue.tags = next.tags;
        if (next.triageSeverity !== undefined) issue.triageSeverity = next.triageSeverity;
        if (next.externalReference !== undefined) issue.externalReference = next.externalReference;
        if (next.legacy !== undefined) issue.legacy = next.legacy;
        if (next.review !== undefined) issue.review = next.review;
        issue.defectStatus = isDismissed(issue) ? 'Dismissed' : (issue.defectStatus === 'Dismissed' ? 'Outstanding' : issue.defectStatus);
        issue.comments = next.comments || [];
        issue.changelog = next.changelog || [];
        if (issue.cid) cid = issue.cid;
      }
      if (cid) project.issueState[`cid:${cid}`] = next;
    }
    // Issues were changed in place: their files are written on this save.
    store.touch(...Object.values(project.branches || {}).map((b) => b && b.latest && b.latest.issues), project.desktop && project.desktop.issues);
    refreshGates(ws, project.id);
    saveWorkspace(ws);
    if (patch.assignee || patch.owner) {
      const latest = (((project.branches || {})[project.mainBranch || 'main'] || {}).latest || { issues: [] }).issues.filter((i) => keys.includes(i.key));
      integrate.notify(ws, 'issues-assigned', { project: { id: project.id, key: project.key, name: project.name }, issues: latest.map((i) => ({ assignee: patch.assignee || patch.owner, rule: i.rule, message: i.message, file: i.file, line: i.line, severity: i.severity, type: i.type })) });
    }
    return { ok: true, count: keys.length };
  }

  // Exception (예외) requests: a user asks to close an issue as false positive
  // or accepted with a reason; an issue admin approves or rejects it.
  function reviewIssues(args) {
    const ws = workspace();
    const project = (ws.projects || []).find((p) => p.id === args.projectId);
    if (!project) throw new Error('Project not found');
    const action = args.action;
    if (!['request', 'approve', 'reject', 'cancel'].includes(action)) throw new Error(`Unknown review action: ${action}`);
    const approval = (ws.settings && ws.settings.approval) || {};
    const now = new Date().toISOString();
    const by = args.by || (ws.settings && ws.settings.assignee) || 'me';
    const done = [];
    for (const key of args.keys || []) {
      const prev = ((project.issueState || {})[key] || {}).review || null;
      let review;
      let resolve = null;
      if (action === 'request') {
        if (!String(args.reason || '').trim()) throw new Error('A reason is required');
        const resolution = args.resolution === 'WONTFIX' ? 'WONTFIX' : 'FALSE-POSITIVE';
        review = { state: 'REQUESTED', resolution, reason: String(args.reason).trim(), requestedBy: by, requestedAt: now, history: [...((prev && prev.history) || []), { at: now, by, action, reason: args.reason, resolution }] };
      } else {
        if (!prev || prev.state !== 'REQUESTED') throw Object.assign(new Error('No pending request for this issue'), { code: 'NOT_FOUND' });
        if (action === 'approve' && approval.selfApproval === false && prev.requestedBy === by) {
          throw Object.assign(new Error('The requester cannot approve their own request'), { code: 'FORBIDDEN' });
        }
        if (action === 'cancel' && prev.requestedBy !== by && args.who && args.who.type === 'USER') {
          throw Object.assign(new Error('Only the requester can cancel'), { code: 'FORBIDDEN' });
        }
        const state = { approve: 'APPROVED', reject: 'REJECTED', cancel: 'CANCELLED' }[action];
        review = { ...prev, state, decidedBy: by, decidedAt: now, comment: args.reason || '', history: [...(prev.history || []), { at: now, by, action, reason: args.reason || '' }] };
        if (action === 'approve') resolve = { status: 'RESOLVED', resolution: prev.resolution };
      }
      done.push({ key, review, resolve });
    }
    const approvers = ((ws.security && ws.security.users) || []).filter((u) => u.active !== false && users.authorize(ws, u.login, 'issueadmin', project.id)).map((u) => u.login);
    for (const { key, review } of done) {
      const issue = (((project.branches || {})[project.mainBranch || 'main'] || {}).latest || { issues: [] }).issues.find((i) => i.key === key) || {};
      const event = { request: 'exception-pending', approve: 'exception-approved', reject: 'exception-rejected' }[action];
      if (event) integrate.notify(ws, event, { project: { id: project.id, key: project.key, name: project.name }, request: { id: key, rule: issue.rule, file: issue.file, line: issue.line, reason: review.reason, requester: review.requestedBy, approvers, decidedBy: review.decidedBy, comment: review.comment } });
    }
    for (const { key, review, resolve } of done) {
      const patch = { review, ...(resolve || {}) };
      if (action === 'request' || action === 'reject') patch.comment = `[${action === 'request' ? 'exception requested' : 'request rejected'}] ${args.reason}`;
      updateIssues({ projectId: project.id, keys: [key], patch, by, viaApproval: true });
    }
    return { ok: true, count: done.length };
  }

  // Pending and decided exception requests of a project.
  function reviewList(args) {
    const ws = workspace();
    const project = (ws.projects || []).find((p) => p.id === args.projectId);
    if (!project) throw new Error('Project not found');
    const branch = (project.branches || {})[args.branch || project.mainBranch || 'main'];
    const issues = (branch && branch.latest && branch.latest.issues) || [];
    return issues.filter((i) => i.review && (!args.state || i.review.state === args.state)).map((i) => ({
      key: i.key, rule: i.rule, file: i.file, line: i.line, message: i.message, severity: i.severity, type: i.type, review: i.review,
    }));
  }

  // CI scanner upload (scripts/scan.mjs --server): the sources are written to a
  // server-side copy and analyzed with the server's profiles, gate and history,
  // like a code-quality scanner report.
  async function submit(args) {
    const key = String(args.key || '').trim();
    if (!/^[\w.:-]{1,200}$/.test(key)) throw Object.assign(new Error('A project key (letters, digits, . : _ -) is required'), { code: 'BAD_REQUEST' });
    const files = Array.isArray(args.files) ? args.files : [];
    const base = path.join(store.dir, 'sources', key.replace(/[:]/g, '_'));
    fs.rmSync(base, { recursive: true, force: true });
    fs.mkdirSync(base, { recursive: true });
    let count = 0;
    for (const f of files) {
      const rel = String(f.path || '').replace(/\\/g, '/').replace(/^\/+/, '');
      if (!rel || rel.split('/').includes('..') || /^[a-z]:/i.test(rel)) continue;
      const full = path.join(base, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, String(f.text == null ? '' : f.text));
      count++;
    }
    if (!count) throw Object.assign(new Error('No source files were uploaded'), { code: 'BAD_REQUEST' });
    const ws = workspace();
    const existing = (ws.projects || []).find((p) => p.key === key);
    const result = await scan({ path: base, projectId: existing ? existing.id : `k-${require('crypto').createHash('sha1').update(key).digest('hex').slice(0, 10)}`, name: args.name || key, branch: args.branch || undefined, target: args.target || undefined, commit: true });
    const after = workspace();
    const project = after.projects.find((p) => p.id === result.project.id);
    if (project && project.key !== key) { project.key = key; saveWorkspace(after); }
    return { projectKey: key, branch: result.analysis.defectAnalysis.stream, files: count, qualityGate: result.analysis.qualityGate, measures: result.analysis.measures, taskId: result.task.id };
  }

  // ai.test may get unsaved settings from the form; keep the stored key when the mask comes back.
  function unmaskAi(ai) {
    if (!ai) return {};
    const out = { ...ai };
    if (out.apiKey === aifix.MASK) delete out.apiKey;
    return out;
  }

  // Register (or update) the workspace project a project file points at.
  function adoptProjectFile(ws, info) {
    if (!fs.existsSync(info.sourcePath) || !fs.statSync(info.sourcePath).isDirectory()) {
      throw Object.assign(new Error(`Source folder not found: ${info.sourcePath}`), { code: 'NOT_FOUND' });
    }
    const id = projectIdFor(info.sourcePath);
    ws.projects = ws.projects || [];
    let project = ws.projects.find((p) => p.id === id);
    if (!project) {
      project = { id, key: info.key, name: info.name, path: info.sourcePath, mainBranch: 'main', gateId: (ws.gates.find((g) => g.isDefault) || DEFAULT_GATE).id, branches: {}, issueState: {}, createdAt: new Date().toISOString() };
      ws.projects.push(project);
    }
    Object.assign(project, info.settings, { key: info.key || project.key, name: info.name || project.name, path: info.sourcePath, projectFile: info.file });
    ws.activeProjectId = id;
    touchRecent(ws, { kind: 'file', path: info.file, name: project.name, projectId: id });
    return project;
  }

  // Recently used projects: .mccp files and analyzed folders, newest first, 10 kept.
  const RECENT_MAX = 10;
  function touchRecent(ws, entry) {
    const key = (p) => path.resolve(p).toLowerCase();
    const list = (ws.recent || []).filter((e) => key(e.path) !== key(entry.path));
    ws.recent = [{ ...entry, at: new Date().toISOString() }, ...list].slice(0, RECENT_MAX);
  }
  function recentList(ws) {
    return (ws.recent || []).slice(0, RECENT_MAX).map((e) => {
      const exists = fs.existsSync(e.path);
      const project = e.projectId ? (ws.projects || []).find((p) => p.id === e.projectId) : null;
      return { ...e, exists, analyzed: !!(project && Object.keys(project.branches || {}).length) };
    });
  }

  // Sample projects shipped next to the app (samples/<name>), for the start page gallery.
  function sampleList() {
    const dir = path.dirname(sampleRoot);
    const { detectLanguage } = require('./languages');
    const out = [];
    let names = [];
    try { names = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort(); } catch { return out; }
    for (const name of names) {
      const folder = path.join(dir, name);
      const mccp = fs.readdirSync(folder).find((f) => f.toLowerCase().endsWith(projectfile.EXT));
      let title = name;
      let description = '';
      if (mccp) {
        try { const info = projectfile.readProjectFile(path.join(folder, mccp)); title = info.name; description = info.settings.description || ''; } catch { /* plain folder */ }
      }
      if (!description) {
        try {
          const md = fs.readFileSync(path.join(folder, 'README.md'), 'utf8').split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'));
          description = (md[0] || '').slice(0, 200);
        } catch { /* no readme */ }
      }
      const languages = {};
      let files = 0;
      for (const f of walk(folder, {})) {
        const lang = detectLanguage(f);
        if (!lang) continue;
        languages[lang] = (languages[lang] || 0) + 1;
        files++;
      }
      out.push({ id: name, title, description, path: folder, projectFile: mccp ? path.join(folder, mccp) : null, languages, files });
    }
    return out;
  }

  // ── Analyses with progress (scan.start / scan.job / scan.cancel) ──
  // A job runs the same scan() but analyzes in a worker thread and keeps a
  // progress record the UI polls; plain project.scan stays in-process.
  const jobs = new Map();
  let jobSeq = 0;
  const dbJobs = new Map();

  // Database export as a job (db.exportStart / db.exportJob / db.exportCancel), so
  // the GUI can show progress and a timeout or failure while it runs.
  function startDbExport(args, who) {
    const ws = workspace();
    const project = (ws.projects || []).find((p) => p.id === args.projectId);
    if (!project) throw Object.assign(new Error('Project not found'), { code: 'NOT_FOUND' });
    const branch = args.branch || project.mainBranch || 'main';
    const b = (project.branches || {})[branch];
    if (!b || !b.latest) throw Object.assign(new Error('No analysis'), { code: 'NOT_FOUND' });
    const s = dbsink.settingsOf(ws, store.dir);
    if (!s.enabled && !args.force) return dbsink.exportAnalysis(s, { project, branch, analysis: b.latest, settings: ws.settings }, { force: false });
    const id = `dbjob-${Date.now().toString(36)}-${++jobSeq}`;
    const job = { id, status: 'running', by: (who && who.login) || null, startedAt: Date.now(), path: `${s.kind} · ${s.kind === 'sqlite' ? s.file : `${s.host}:${s.port}/${s.database}`}`, timeoutSec: s.timeoutSec, progress: { phase: 'connect', done: 0, total: 0, percent: 0, elapsedMs: 0, etaMs: null } };
    dbJobs.set(id, job);
    dbsink.exportAnalysis(s, { project, branch, analysis: b.latest, settings: ws.settings }, {
      force: !!args.force,
      isCancelled: () => job.status === 'cancelled',
      onProgress: (pr) => { job.progress = dbProgress(pr, job.startedAt); },
    }).then((result) => {
      if (job.status === 'cancelled') return;
      job.status = 'done';
      job.result = result;
      job.progress = { ...job.progress, percent: 100, etaMs: 0, elapsedMs: Date.now() - job.startedAt };
    }, (err) => {
      const { code, text } = require('./errors').describe(err);
      if (job.status !== 'cancelled' || err.code !== 'CANCELLED') job.status = err.code === 'CANCELLED' ? 'cancelled' : 'failed';
      job.error = { code, message: err.message, text };
    }).finally(() => forgetLater(dbJobs, id));
    return { jobId: id };
  }

  // A finished job is kept 10 minutes for the window that polls it (a large
  // analysis runs much longer than that, so the clock starts at the end).
  function forgetLater(map, id) {
    setTimeout(() => map.delete(id), 600000).unref();
  }

  function ownDbJob(args, who) {
    const job = dbJobs.get(args && args.jobId);
    if (!job) throw Object.assign(new Error('Unknown database job'), { code: 'NOT_FOUND' });
    if (who && job.by && who.login !== job.by && !users.authorize(workspace(), who.login, 'admin')) throw Object.assign(new Error('This export was started by another user'), { code: 'FORBIDDEN' });
    return job;
  }
  const WEIGHT = { collect: [0, 10], rules: [10, 45], engines: [55, 42], finish: [97, 3] };
  // With the C/C++ pool (phase 'cfamily') that phase comes first and is most of the time.
  const WEIGHT_POOL = { collect: [0, 5], cfamily: [5, 65], rules: [70, 12], engines: [82, 12], finish: [94, 6] };

  // Indexes of an issue list, most severe first (stable); kept per list.
  const severityOrders = new WeakMap();
  const SEVERITY_RANK = { BLOCKER: 0, CRITICAL: 1, MAJOR: 2, MINOR: 3, INFO: 4 };
  function severityOrder(list) {
    let order = severityOrders.get(list);
    if (!order) {
      const rank = (i) => SEVERITY_RANK[i.severity] ?? 5;
      order = Uint32Array.from({ length: list.length }, (_, n) => n).sort((x, y) => rank(list[x]) - rank(list[y]) || x - y);
      severityOrders.set(list, order);
    }
    return order;
  }

  // A worker gets V8's default heap (about 4 GB), which a large project can
  // outgrow; settings.memoryLimitGb sets it (core/memory.js).
  function workerHeapMb() {
    return require('./memory').workerHeapMb(workspace().settings);
  }

  // An analysis that runs out of memory is run again with less detail rather
  // than failing (REDUCED steps); the result says what was left out.
  const REDUCED = [
    {
      options: (o) => ({ ...o, issueBudget: Math.max(50000, Math.floor(issueBudgetFor(workerHeapMb()) / 4)), cfamilyBatch: { ...(o.cfamilyBatch || {}), tokens: 250000, maxSources: 50 }, cfamilyMaxBytes: 1000000 }),
      text: {
        en: 'The analysis ran out of memory and was run again with less detail: C/C++ files over 1 MB were left out of the deep C/C++ checks and repeated issues were folded sooner.',
        ko: '분석 중 메모리가 부족해 범위를 줄여 다시 분석했습니다. 1 MB가 넘는 C/C++ 파일은 정밀 C/C++ 점검에서 뺐고 반복 이슈는 더 일찍 합쳤습니다.',
      },
    },
    {
      options: (o) => ({ ...o, issueBudget: Math.max(20000, Math.floor(issueBudgetFor(workerHeapMb()) / 8)), skipEngines: [...require('./cfront').ENGINE_IDS, 'taint'] }),
      text: {
        en: 'The analysis ran out of memory twice and was run again without the deep C/C++ and taint engines; the other checks ran.',
        ko: '분석 중 메모리가 두 번 부족해 정밀 C/C++ 엔진과 테인트 엔진 없이 다시 분석했습니다. 나머지 점검은 모두 했습니다.',
      },
    },
  ];
  const issueBudgetFor = (heapMb) => Math.max(200000, Math.min(8000000, Math.floor((heapMb * 1048576 * 0.25) / 2048)));

  async function analyzeFor(job, ws, abs, opts) {
    if (!job) return analyzePath(abs, opts);
    for (let step = 0; ; step++) {
      try {
        const analysis = await analyzeOnce(job, ws, abs, step ? REDUCED[step - 1].options(opts) : opts);
        if (step) {
          analysis.warnings = [...(analysis.warnings || []), {
            engine: 'limits',
            reduced: step,
            message: {
              en: `${REDUCED[step - 1].text.en} Raise Settings › Analysis › Analysis memory limit (now ${Math.round(workerHeapMb() / 1024)} GB) for a full analysis.`,
              ko: `${REDUCED[step - 1].text.ko} 전체를 분석하려면 설정 › 분석 › 분석 메모리 한도(지금 ${Math.round(workerHeapMb() / 1024)} GB)를 올리십시오.`,
            },
          }];
        }
        return analysis;
      } catch (err) {
        if (!err || err.code !== 'OUT_OF_MEMORY' || step >= REDUCED.length || job.status === 'cancelled') throw err;
        job.retry = step + 1;
        job.pool = false;
        job.progress = { ...(job.progress || {}), phase: 'collect', percent: 0, detail: '', retry: job.retry };
      }
    }
  }

  function analyzeOnce(job, ws, abs, opts) {
    const { Worker } = require('worker_threads');
    const safe = { ...opts, sca: opts.sca ? { ...opts.sca, advisoryDb: undefined } : opts.sca };
    return new Promise((resolve, reject) => {
      const worker = new Worker(path.join(__dirname, 'analyze-worker.js'), {
        workerData: { root: abs, options: safe, osvSource: ws.settings && ws.settings.osvSource },
        resourceLimits: { maxOldGenerationSizeMb: workerHeapMb() },
      });
      job.worker = worker;
      const issues = [];
      worker.on('message', (m) => {
        if (m.type === 'progress') {
          if (m.phase === 'cfamily') job.pool = true;
          const [base, span] = (job.pool ? WEIGHT_POOL : WEIGHT)[m.phase] || [0, 0];
          const percent = Math.min(99, Math.round(base + (m.total ? (m.done / m.total) * span : 0)));
          const elapsedMs = Date.now() - job.startedAt;
          job.progress = { phase: m.phase, done: m.done, total: m.total, detail: m.detail, percent, elapsedMs, etaMs: percent > 3 ? Math.round((elapsedMs / percent) * (100 - percent)) : null, retry: job.retry || 0 };
        } else if (m.type === 'issues') {
          for (const item of m.items) issues.push(item);
        } else if (m.type === 'done') resolve({ ...m.analysis, issues });
        else if (m.type === 'error') reject(new Error(m.message));
      });
      worker.on('error', (err) => reject(err && err.code === 'ERR_WORKER_OUT_OF_MEMORY'
        ? Object.assign(new Error(`The analysis ran out of memory (${workerHeapMb()} MB). Exclude third-party or generated folders and analyze again.`), { code: 'OUT_OF_MEMORY' })
        : err));
      worker.on('exit', (code) => {
        job.worker = null;
        if (job.status === 'cancelled') reject(Object.assign(new Error('Analysis cancelled'), { code: 'CANCELLED' }));
        else if (code !== 0) reject(new Error(`Analysis worker stopped (${code})`));
      });
    });
  }

  // { slim: true } leaves the issue lists out of the result (the GUI reloads the
  // workspace anyway; a large analysis is hundreds of MB).
  function jobView(job, slim) {
    const { worker, result, ...rest } = job;
    if (job.status !== 'done') return rest;
    if (!slim || !result || !result.analysis) return { ...rest, result };
    const { issues, keys, lineHashes, ...analysis } = result.analysis;
    return { ...rest, result: { ...result, analysis: { ...analysis, issueCount: (issues || []).length } } };
  }

  // A job is visible to the user who started it and to administrators.
  function ownJob(args, who) {
    const job = jobs.get(args && args.jobId);
    if (!job) throw Object.assign(new Error('Unknown analysis job'), { code: 'NOT_FOUND' });
    if (who && job.by && who.login !== job.by && !users.authorize(workspace(), who.login, 'admin')) {
      throw Object.assign(new Error('This analysis was started by another user'), { code: 'FORBIDDEN' });
    }
    return job;
  }

  function listDirs(args) {
    const root = path.resolve(String(args.path || ''));
    if (!args.path || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw Object.assign(new Error(`Folder not found: ${root}`), { code: 'NOT_FOUND' });
    const sub = String(args.sub || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const dir = path.resolve(root, sub);
    if (dir !== root && !dir.startsWith(root + path.sep)) throw Object.assign(new Error('Outside the project folder'), { code: 'BAD_REQUEST' });
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
    const hasDirs = (full) => {
      try { return fs.readdirSync(full, { withFileTypes: true }).some((e) => e.isDirectory()); } catch { return false; }
    };
    return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort((a, b) => a.localeCompare(b))
      .map((name) => ({ name, rel: sub ? `${sub}/${name}` : name, hasChildren: hasDirs(path.join(dir, name)), skipped: SKIP_DIRS.has(name) }));
  }

  // Prepared source files of a project folder, as engines receive them.
  function sourceFiles(project, keep = () => true) {
    const { detectLanguage } = require('./languages');
    const ws = workspace();
    const out = [];
    for (const full of walk(project.path, { exclusions: [...(ws.settings.exclusions || []), ...(project.exclusions || [])], excludeDirs: project.excludeDirs || [] })) {
      const lang = detectLanguage(full);
      const rel = path.relative(project.path, full).replace(/\\/g, '/');
      const f = { path: rel, lang };
      if (!keep(f)) continue;
      try { f.text = fs.readFileSync(full, 'utf8'); } catch { continue; }
      out.push(f);
    }
    return out;
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
    // { slim: true } leaves the issue lists out (the GUI keeps its own); a large
    // project's issues are hundreds of MB.
    // { issuesFor: '<project id>' | 'active' } keeps that one project's issues.
    'workspace.load': (args, who) => slimmed(access.filterWorkspace(refreshGates(workspace()), who), args && (args.slim || args.issuesFor), args && args.issuesFor),
    'workspace.save': (args, who) => {
      const stored = workspace();
      const merged = access.mergeWorkspace(stored, args.workspace || args, who);
      merged.profiles = profiles.stampChanges(stored.profiles, merged.profiles, who ? who.login : null);
      // A changed gate (or gate assignment) is judged at once.
      const saved = saveWorkspace(refreshGates(merged));
      return slimmed(access.filterWorkspace(saved, who), args.slim || args.issuesFor, args.issuesFor);
    },
    // Settings (and the quality gates) from the settings window: the patch is
    // merged into the stored settings here, so the window never loads or sends
    // the whole workspace. Same permission checks as workspace.save.
    // A project's issues, one page at a time: { projectId, branch (or '' for the
    // desktop analysis), offset, limit } -> { total, issues }. The GUI holds the
    // open project's issues only and fetches them in pages, so no answer comes
    // near the size one JavaScript string can hold, however large the project.
    'project.issues': (args, who) => {
      const ws = access.filterWorkspace(workspace(), who);
      const project = (ws.projects || []).find((p) => p.id === (args && args.projectId));
      if (!project) throw Object.assign(new Error('Project not found'), { code: 'NOT_FOUND' });
      const a = args.branch ? ((project.branches || {})[args.branch] || {}).latest : project.desktop;
      const all = (a && a.issues) || [];
      const offset = Math.max(0, Number(args.offset) || 0);
      const limit = Math.min(50000, Math.max(1, Number(args.limit) || 20000));
      // order: 'severity' pages the most severe first (a window that cannot hold
      // millions of issues takes the head of this order).
      if (args.order === 'severity') {
        const order = severityOrder(all);
        const issues = [];
        for (let n = offset; n < Math.min(order.length, offset + limit); n++) issues.push(all[order[n]]);
        return { total: all.length, offset, issues };
      }
      return { total: all.length, offset, issues: all.slice(offset, offset + limit) };
    },
    'settings.patch': (args, who) => {
      const stored = workspace();
      const incoming = { settings: { ...(stored.settings || {}), ...((args && args.patch) || {}) } };
      if (args && Array.isArray(args.gates)) incoming.gates = args.gates;
      const merged = access.mergeWorkspace(stored, incoming, who);
      const saved = saveWorkspace(incoming.gates ? refreshGates(merged) : merged);
      return { settings: access.filterWorkspace(saved, who).settings, gates: saved.gates };
    },
    'security.me': (args, who) => {
      const ws = workspace();
      const login = who ? who.login : null;
      return { enabled: access.enabled(ws), login, permissions: login ? users.permissionsOf(ws, login, args.projectId || null) : null };
    },
    'security.logout': (args, who) => {
      const ws = workspace();
      const sec = users.ensureSecurity(ws);
      const before = sec.tokens.length;
      if (who) sec.tokens = sec.tokens.filter((t) => !(t.login === who.login && t.name === who.name && /^session-/.test(t.name)));
      if (sec.tokens.length !== before) saveWorkspace(ws);
      return { ok: true };
    },
    'rules.list': () => listRules(),
    'checks.list': () => require('./checks').listChecks(),
    // External software: status, start-up offers, installation with consent.
    'tools.status': () => tools.status(workspace().settings || {}),
    'tools.offers': () => tools.offers(workspace().settings || {}),
    'tools.install': (args) => tools.startInstall(args.id, { manager: args.manager }),
    'tools.job': (args) => tools.job(args.id),
    'tools.decline': (args) => {
      const ws = workspace();
      const cur = (ws.settings && ws.settings.tools) || {};
      const declined = new Set(cur.declined || []);
      if (args.undo) declined.delete(args.id); else declined.add(args.id);
      ws.settings = { ...ws.settings, tools: { ...cur, declined: [...declined] } };
      saveWorkspace(ws);
      return tools.status(ws.settings);
    },
    'tools.askOnStart': (args) => {
      const ws = workspace();
      ws.settings = { ...ws.settings, tools: { ...((ws.settings && ws.settings.tools) || {}), askOnStart: !!args.value } };
      saveWorkspace(ws);
      return tools.status(ws.settings);
    },
    'profile.compare': (args) => profiles.compare(workspace(), args.a, args.b, listRules()),
    'profile.backup': (args) => profiles.backup(workspace(), args.id),
    'profile.restore': (args) => {
      const ws = workspace();
      const restored = profiles.restore(ws, typeof args.data === 'string' ? JSON.parse(args.data) : args.data);
      saveWorkspace(ws);
      return restored;
    },
    'profile.effective': (args) => {
      const ws = workspace();
      const project = (ws.projects || []).find((p) => p.id === args.projectId) || null;
      return inactiveFor(ws, project);
    },
    'project.scan': (args) => scan(args || {}),
    // Sub-folders of a source folder for the exclusion picker: { path, sub } →
    // [{ name, rel, hasChildren, skipped }] (skipped: never analyzed anyway).
    'project.dirs': (args) => listDirs(args || {}),
    // The analysis target as it is now (core/target.js), for the Overview.
    'project.target': (args, who) => {
      const ws = access.filterWorkspace(workspace(), who);
      const project = (ws.projects || []).find((p) => p.id === (args && args.projectId));
      if (!project) throw Object.assign(new Error('Project not found'), { code: 'NOT_FOUND' });
      return require('./target').survey(project.path, {
        exclusions: [...(ws.settings.exclusions || []), ...(project.exclusions || [])],
        excludeDirs: project.excludeDirs || [],
        maxFiles: ws.settings.maxFiles || 0,
      });
    },
    'scan.start': (args, who) => {
      args = args || {};
      // One running analysis per project: a second start joins the running one.
      const projectId = args.projectId || projectIdFor(path.resolve(args.path || sampleRoot));
      const running = [...jobs.values()].find((j) => j.status === 'running' && j.projectId === projectId);
      if (running) return { jobId: running.id, joined: true };
      const id = `job-${Date.now().toString(36)}-${++jobSeq}`;
      const job = { id, status: 'running', projectId, by: (who && who.login) || null, startedAt: Date.now(), path: args.path || null, progress: { phase: 'collect', done: 0, total: 1, percent: 0, elapsedMs: 0, etaMs: null, detail: '' } };
      jobs.set(id, job);
      scan({ ...(args || {}), __job: job }).then((result) => {
        job.status = 'done';
        job.result = result;
        job.progress = { ...job.progress, phase: 'finish', percent: 100, etaMs: 0, elapsedMs: Date.now() - job.startedAt };
      }, (err) => {
        if (job.status !== 'cancelled') { job.status = 'failed'; job.error = { code: err.code || 'ERROR', message: err.message, text: require('./errors').describe(err).text }; }
      }).finally(() => forgetLater(jobs, id));
      return { jobId: id };
    },
    'scan.job': (args, who) => jobView(ownJob(args, who), !!(args && args.slim)),
    'scan.cancel': (args, who) => {
      const job = ownJob(args, who);
      if (job.status === 'running') {
        job.status = 'cancelled';
        if (job.worker) job.worker.terminate();
      }
      return jobView(job);
    },
    'project.submit': (args) => submit(args || {}),
    // Project files (*.mccp)
    'project.create': async (args) => {
      const source = path.resolve(args.source || '');
      if (!args.source || !fs.existsSync(source) || !fs.statSync(source).isDirectory()) throw Object.assign(new Error(`Source folder not found: ${source}`), { code: 'NOT_FOUND' });
      // A folder that is already a project keeps its name and history unless
      // the caller confirms replacing it ({ replace: true }).
      const existing = (workspace().projects || []).find((p) => p.id === projectIdFor(source));
      if (existing && !args.replace) {
        throw Object.assign(new Error(`This folder is already the project "${existing.name}"`), {
          code: 'CONFLICT', projectId: existing.id, projectName: existing.name,
          text: { en: `This folder is already the project "${existing.name}".`, ko: `이 폴더는 이미 '${existing.name}' 프로젝트로 등록되어 있습니다.` },
        });
      }
      const file = projectfile.withExt(args.file || path.join(source, `${projectfile.keyFrom(args.name || path.basename(source))}${projectfile.EXT}`));
      const written = projectfile.writeProjectFile(file, { name: args.name || path.basename(source), key: args.key, source, settings: args.settings || {} }, { overwrite: !!args.overwrite });
      const ws = workspace();
      const project = adoptProjectFile(ws, projectfile.readProjectFile(written.file));
      saveWorkspace(ws);
      const out = { file: written.file, project: publicProject(project) };
      if (args.scan) out.scan = await scan({ path: project.path, projectId: project.id, name: project.name });
      return out;
    },
    'project.open': (args) => {
      const info = projectfile.readProjectFile(projectfile.withExt(args.file));
      const ws = workspace();
      const project = adoptProjectFile(ws, info);
      saveWorkspace(ws);
      return { file: info.file, project: publicProject(project), analyzed: Object.keys(project.branches || {}).length > 0 };
    },
    'project.saveFile': (args) => {
      const ws = workspace();
      const project = (ws.projects || []).find((p) => p.id === args.projectId);
      if (!project) throw Object.assign(new Error('Project not found'), { code: 'NOT_FOUND' });
      const target = args.file || project.projectFile || path.join(project.path, `${projectfile.keyFrom(project.key || project.name)}${projectfile.EXT}`);
      // A project file this project was not opened from is only replaced when asked.
      const own = project.projectFile && path.resolve(project.projectFile) === path.resolve(projectfile.withExt(target));
      if (!own && !args.overwrite && fs.existsSync(projectfile.withExt(target))) {
        throw Object.assign(new Error(`A project file already exists: ${projectfile.withExt(target)}`), {
          code: 'CONFLICT', file: projectfile.withExt(target),
          text: { en: `A project file already exists: ${projectfile.withExt(target)}`, ko: `프로젝트 파일이 이미 있습니다: ${projectfile.withExt(target)}` },
        });
      }
      const written = projectfile.writeProjectFile(target, { name: project.name, key: project.key, source: project.path, settings: projectfile.settingsOfProject(project) }, { overwrite: true });
      project.projectFile = written.file;
      ws.recentProjectFiles = [written.file, ...(ws.recentProjectFiles || []).filter((f) => f !== written.file)].slice(0, 15);
      saveWorkspace(ws);
      return { file: written.file };
    },
    // Desktop only (createApi({ localFiles: true })): write an export to a path
    // the user picked in the save dialog.
    'file.save': (args) => {
      if (!opts.localFiles) throw Object.assign(new Error('Saving to a local path is only available in the desktop app'), { code: 'NO_METHOD' });
      const target = path.resolve(String(args.path || ''));
      if (!args.path || !fs.existsSync(path.dirname(target))) throw Object.assign(new Error('Invalid path'), { code: 'BAD_REQUEST' });
      fs.writeFileSync(target, args.base64 != null ? Buffer.from(String(args.base64), 'base64') : String(args.text == null ? '' : args.text));
      return { path: target };
    },
    // Files next to a saved file (a Markdown report's pictures): { base, files: [{ path, base64 }] },
    // paths relative to the folder of `base`, never outside it.
    'file.saveBeside': (args) => {
      if (!opts.localFiles) throw Object.assign(new Error('Saving to a local path is only available in the desktop app'), { code: 'NO_METHOD' });
      const dir = path.dirname(path.resolve(String(args.base || '')));
      if (!args.base || !fs.existsSync(dir)) throw Object.assign(new Error('Invalid path'), { code: 'BAD_REQUEST' });
      const written = [];
      for (const f of args.files || []) {
        const target = path.resolve(dir, String(f.path || ''));
        if (!target.startsWith(dir + path.sep)) throw Object.assign(new Error('Invalid path'), { code: 'BAD_REQUEST' });
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, Buffer.from(String(f.base64 || ''), 'base64'));
        written.push(target);
      }
      return { files: written };
    },
    'project.recentFiles': () => recentList(workspace()).filter((e) => e.kind === 'file').map((e) => ({ file: e.path, exists: e.exists })),
    'recent.list': () => recentList(workspace()),
    'recent.remove': (args) => {
      const ws = workspace();
      const key = path.resolve(String(args.path || '')).toLowerCase();
      ws.recent = (ws.recent || []).filter((e) => path.resolve(e.path).toLowerCase() !== key);
      saveWorkspace(ws);
      return recentList(ws);
    },
    'recent.clear': () => {
      const ws = workspace();
      ws.recent = [];
      saveWorkspace(ws);
      return [];
    },
    'samples.list': () => sampleList(),
    // Physical memory and the default analysis memory limit, in GB.
    'system.memory': () => ({ totalGb: require('./memory').totalGb(), defaultGb: require('./memory').defaultLimitGb() }),
    'samples.open': async (args) => {
      const s = sampleList().find((x) => x.id === args.id);
      if (!s) throw Object.assign(new Error(`Sample not found: ${args.id}`), { code: 'NOT_FOUND' });
      if (s.projectFile) {
        const opened = methods['project.open']({ file: s.projectFile });
        const ws = workspace();
        const p = (ws.projects || []).find((x) => x.id === opened.project.id);
        if (args.scan !== false && !opened.analyzed) return { ...opened, scan: await scan({ path: p.path, projectId: p.id, name: p.name }) };
        return opened;
      }
      return { scan: await scan({ path: s.path, name: s.title }) };
    },
    'integrations.get': () => integrate.publicConfig(workspace()),
    'integrations.save': (args) => {
      const ws = workspace();
      const out = integrate.saveConfig(ws, args.integrations || args);
      saveWorkspace(ws);
      return out;
    },
    'integrations.testSmtp': async (args) => {
      const c = integrate.config(workspace()).smtp || {};
      if (args.to) {
        const smtp = require('./integrations').smtp;
        return smtp.sendMail(c, { to: args.to, subject: 'MyCodeChecker test mail / 테스트 메일', text: 'SMTP works. / SMTP 설정이 정상입니다.' });
      }
      return require('./integrations').smtp.verify(c);
    },
    'integrations.testLdap': async () => require('./integrations').ldap.testConnection(integrate.config(workspace()).ldap || {}),
    'notify.subscribe': (args, who) => {
      const ws = workspace();
      const login = (who && who.login) || args.login || 'admin';
      const c = integrate.config(ws);
      const subs = (c.subscriptions || []).filter((s) => s.login !== login);
      if (!args.remove) subs.push({ login, email: args.email || '', events: args.events || [], projects: args.projects || [], lang: args.lang });
      ws.settings = { ...ws.settings, integrations: { ...c, subscriptions: subs } };
      saveWorkspace(ws);
      return subs.filter((s) => s.login === login);
    },
    'issue.ticket': async (args) => {
      const ws = workspace();
      const project = (ws.projects || []).find((p) => p.id === args.projectId);
      if (!project) throw Object.assign(new Error('Project not found'), { code: 'NOT_FOUND' });
      const b = (project.branches || {})[args.branch || project.mainBranch || 'main'];
      const issues = ((b && b.latest && b.latest.issues) || []).filter((i) => (args.keys || []).includes(i.key));
      const made = await integrate.createTickets(ws, args.kind, issues, { lang: args.lang || ws.settings.language });
      for (const t of made) updateIssues({ projectId: project.id, keys: [t.issue], patch: { externalReference: t.url || t.key, comment: `[${args.kind}] ${t.key || ''} ${t.url || ''}`.trim() }, viaApproval: true, by: args.by });
      return made;
    },
    'pr.decorate': async (args) => {
      const pr = await methods['pr.analyze'](args);
      return integrate.decorate(workspace(), args.provider, pr, args.config || {});
    },
    // HIS metric table and module dependency graph of a project (read from disk).
    'metrics.his': (args) => {
      const ws = workspace();
      const project = (ws.projects || []).find((p) => p.id === args.projectId);
      if (!project) throw Object.assign(new Error('Project not found'), { code: 'NOT_FOUND' });
      const his = require('./his');
      const files = sourceFiles(project, (f) => f.lang === 'c' || f.lang === 'cpp');
      const options = ext.engineOptions(ws, project);
      const rows = his.functionMetrics(files, options);
      return { rows, summary: his.summary(rows, options) };
    },
    'arch.graph': (args) => {
      const ws = workspace();
      const project = (ws.projects || []).find((p) => p.id === args.projectId);
      if (!project) throw Object.assign(new Error('Project not found'), { code: 'NOT_FOUND' });
      return require('./arch').dependencyGraph(sourceFiles(project), ext.engineOptions(ws, project));
    },
    // Database export of results
    'db.get': () => dbsink.publicSettings(workspace(), store.dir),
    'db.save': (args) => {
      const ws = workspace();
      const out = dbsink.saveSettings(ws, args.db || args, store.dir);
      saveWorkspace(ws);
      return out;
    },
    'db.test': async (args) => {
      const s = { ...dbsink.settingsOf(workspace(), store.dir), ...(args.db || {}) };
      if (s.password === dbsink.MASK) s.password = dbsink.settingsOf(workspace(), store.dir).password;
      return dbsink.testConnection(s);
    },
    'db.exportStart': (args, who) => startDbExport(args || {}, who),
    'db.exportJob': (args, who) => ownDbJob(args, who),
    'db.exportCancel': (args, who) => {
      const job = ownDbJob(args, who);
      if (job.status === 'running') job.status = 'cancelled';
      return job;
    },
    'db.export': async (args) => {
      const ws = workspace();
      const project = (ws.projects || []).find((p) => p.id === args.projectId);
      if (!project) throw Object.assign(new Error('Project not found'), { code: 'NOT_FOUND' });
      const branch = args.branch || project.mainBranch || 'main';
      const b = (project.branches || {})[branch];
      if (!b || !b.latest) throw Object.assign(new Error('No analysis'), { code: 'NOT_FOUND' });
      return dbsink.exportAnalysis(dbsink.settingsOf(ws, store.dir), { project, branch, analysis: b.latest, settings: ws.settings }, { force: !!args.force });
    },
    // AI CodeFix
    'ai.get': () => aifix.publicSettings(workspace()),
    'ai.save': (args) => {
      const ws = workspace();
      const out = aifix.saveSettings(ws, args.ai || args);
      saveWorkspace(ws);
      return out;
    },
    'ai.test': async (args) => aifix.testConnection({ ...aifix.settingsOf(workspace()), ...unmaskAi(args.ai) }),
    'issue.aiFix': async (args) => {
      const ws = workspace();
      const project = (ws.projects || []).find((p) => p.id === args.projectId);
      if (!project) throw Object.assign(new Error('Project not found'), { code: 'NOT_FOUND' });
      const b = (project.branches || {})[args.branch || project.mainBranch || 'main'];
      const issue = ((b && b.latest && b.latest.issues) || []).find((i) => i.key === args.key);
      if (!issue) throw Object.assign(new Error('Issue not found'), { code: 'NOT_FOUND' });
      const rule = listRules().find((r) => r.key === issue.rule) || null;
      return aifix.proposeFix(aifix.settingsOf(ws), { projectPath: project.path, issue, rule });
    },
    'issue.aiFixApply': (args, who) => {
      const ws = workspace();
      const project = (ws.projects || []).find((p) => p.id === args.projectId);
      if (!project) throw Object.assign(new Error('Project not found'), { code: 'NOT_FOUND' });
      const { previous, ...result } = aifix.applyFix(project.path, args.proposal);
      // The source before the fix is kept so issue.aiFixRevert can undo it.
      result.undoId = aifix.saveUndo(store.dir, project.path, { ...result, previous });
      if (args.proposal && args.proposal.issueKey) {
        updateIssues({ projectId: project.id, keys: [args.proposal.issueKey], patch: { comment: `[AI CodeFix] ${args.proposal.file}:${args.proposal.startLine}-${args.proposal.endLine} (${args.proposal.model || 'model'})` }, viaApproval: true, by: who ? who.login : args.by });
      }
      return result;
    },
    'issue.aiFixRevert': (args, who) => {
      const ws = workspace();
      const project = (ws.projects || []).find((p) => p.id === args.projectId);
      if (!project) throw Object.assign(new Error('Project not found'), { code: 'NOT_FOUND' });
      const result = aifix.revertFix(store.dir, args.undoId);
      if (args.issueKey) updateIssues({ projectId: project.id, keys: [args.issueKey], patch: { comment: `[AI CodeFix] undone: ${result.file}` }, viaApproval: true, by: who ? who.login : args.by });
      return result;
    },
    'audit.list': (args) => {
      const log = workspace().auditLog || [];
      const q = String(args.q || '').toLowerCase();
      return log.filter((e) => (!args.login || e.login === args.login) && (!args.method || e.method === args.method) && (!q || JSON.stringify(e).toLowerCase().includes(q))).slice(0, Number(args.limit) || 500);
    },
    'housekeeping.run': () => {
      const ws = workspace();
      const removed = housekeep(ws);
      saveWorkspace(ws);
      return removed;
    },
    'portfolio.measures': (args, who) => {
      const ws = workspace();
      const visible = { ...ws, projects: access.filterWorkspace(ws, who).projects };
      const list = (ws.portfolios || []).filter((p) => !args.id || p.id === args.id);
      return list.map((p) => portfolioMeasures(visible, p));
    },
    // DAST credentials in schedules are shown to administrators only.
    'schedule.list': (args, who) => {
      const ws = workspace();
      const list = ws.schedules || [];
      if (!(ws.security && ws.security.enabled) || (who && users.authorize(ws, who.login, 'admin'))) return list;
      return list.map((s) => (s.auth ? { ...s, auth: { redacted: true } } : s));
    },
    'schedule.save': (args) => {
      const ws = workspace();
      const s = scheduler.normalize(args.schedule || args);
      ws.schedules = [...(ws.schedules || []).filter((x) => x.id !== s.id), s];
      saveWorkspace(ws);
      return s;
    },
    'schedule.delete': (args) => {
      const ws = workspace();
      ws.schedules = (ws.schedules || []).filter((x) => x.id !== args.id);
      saveWorkspace(ws);
      return { ok: true };
    },
    'schedule.preview': (args) => {
      const out = [];
      let from = new Date();
      for (let i = 0; i < (Number(args.count) || 5); i++) {
        const n = scheduler.nextRun(args.cron, from);
        if (!n) break;
        out.push(n.toISOString());
        from = n;
      }
      return out;
    },
    'schedule.runNow': async (args) => {
      const s = (workspace().schedules || []).find((x) => x.id === args.id);
      if (!s) throw Object.assign(new Error('Schedule not found'), { code: 'NOT_FOUND' });
      return runSchedule(s);
    },
    'project.sample': (args) => scan({ path: sampleRoot, name: 'Demo', ...(args || {}) }),
    'project.file': (args) => readFile(args || {}),
    'issue.update': (args, who) => updateIssues({ ...(args || {}), viaApproval: false, by: who ? who.login : args.by }),
    'issue.review': (args, who) => reviewIssues({ ...(args || {}), who, by: who ? who.login : args.by }),
    'issue.reviews': (args) => reviewList(args || {}),
    'report.build': (args) => report(args || {}),
    // Deletes a project's stored analyses (every branch: latest, history,
    // snapshots, new-code baseline; and the desktop analysis), so the next
    // analysis starts over and treats all code as new. { clearTriage: true }
    // also drops issue states (status, comments, assignees).
    'project.resetAnalysis': (args, who) => {
      const ws = workspace();
      const project = (ws.projects || []).find((p) => p.id === args.projectId);
      if (!project) throw Object.assign(new Error('Project not found'), { code: 'NOT_FOUND' });
      if ([...jobs.values()].some((j) => j.status === 'running' && j.projectId === project.id)) {
        throw Object.assign(new Error('An analysis of this project is running'), { code: 'CONFLICT' });
      }
      const branches = Object.keys(project.branches || {}).length;
      project.branches = {};
      delete project.desktop;
      if (args.clearTriage) project.issueState = {};
      project.updatedAt = new Date().toISOString();
      return { ...access.filterWorkspace(saveWorkspace(ws), who), reset: { projectId: project.id, branches, clearTriage: !!args.clearTriage } };
    },
    'project.remove': (args, who) => {
      const ws = workspace();
      if (!(ws.projects || []).some((p) => p.id === args.projectId)) throw Object.assign(new Error('Project not found'), { code: 'NOT_FOUND' });
      ws.projects = (ws.projects || []).filter((p) => p.id !== args.projectId);
      if (ws.activeProjectId === args.projectId) ws.activeProjectId = ws.projects[0] ? ws.projects[0].id : null;
      ws.recent = (ws.recent || []).filter((r) => r.projectId !== args.projectId);
      // The answer is the workspace as this caller may see it (no secrets).
      return access.filterWorkspace(saveWorkspace(ws), who);
    },
    ...ext.methods,
  };

  // Scheduled scans run inside the server process (opts.scheduler), as the system.
  async function runSchedule(s) {
    if (s.kind === 'dast') {
      const r = await methods['dast.start']({ target: s.target, mode: s.mode || 'passive', maxPages: s.maxPages, auth: s.auth });
      const n = (r.findings || r.alerts || []).length;
      return { status: 'SUCCESS', summary: `${n} findings` };
    }
    const ws = workspace();
    const project = s.projectId ? (ws.projects || []).find((p) => p.id === s.projectId) : null;
    const folder = project ? project.path : s.path;
    if (!folder) return { status: 'FAILED', summary: 'Project not found' };
    const r = await scan({ path: folder, projectId: project ? project.id : undefined, branch: s.branch || undefined, commit: true });
    const m = r.analysis.measures;
    return { status: r.analysis.qualityGate.status === 'OK' ? 'SUCCESS' : 'GATE_FAILED', summary: `gate ${r.analysis.qualityGate.status}, bugs ${m.bugs}, vulnerabilities ${m.vulnerabilities}` };
  }
  const runner = scheduler.createScheduler({
    load: () => workspace().schedules || [],
    save: (list) => { const ws = workspace(); ws.schedules = list; saveWorkspace(ws); },
    run: runSchedule,
    tickMs: opts.schedulerTickMs || 30000,
  });
  if (opts.scheduler) runner.start();

  // ctx.token is the caller's user token; it matters only when permissions are on.
  async function call(name, args, ctx = {}) {
    const fn = methods[name];
    if (!fn) {
      const err = new Error(`Unknown API: ${name}`);
      err.code = 'NO_METHOD';
      throw err;
    }
    let who;
    try {
      who = access.check(workspace(), name, args || {}, ctx.token || '');
    } catch (err) {
      if (err.code === 'FORBIDDEN' || (err.code === 'UNAUTHORIZED' && name === 'security.login')) audit(name, args, null, err.code);
      throw err;
    }
    let result;
    try {
      result = await fn(args || {}, who);
    } catch (err) {
      if (AUDITED.test(name)) audit(name, args, who, err.code || 'FAILED');
      throw err;
    }
    if (AUDITED.test(name)) audit(name, args, who, 'OK');
    return result;
  }

  // Audit log (enterprise code-quality servers / defect-analysis servers): security, settings and
  // triage changes with who, when and what. Kept to the last 5000 entries.
  const AUDITED = /^(security\.(call|login|logout)|workspace\.save|issue\.(update|review|aiFixApply|aiFixRevert)|project\.(remove|submit|create|open)|profile\.restore|schedule\.(save|delete|runNow)|(integrations|ai|db)\.save|housekeeping\.run|dast\.start|scan\.cancel|tools\.(install|decline)|webhook\.(save|delete)|misra\.savePlan|sca\.setOsvSource|external\.import)$/;
  function audit(name, args, who, outcome) {
    try {
      const ws = workspace();
      const detail = name === 'security.call' ? { fn: args && args.fn }
        : name === 'security.login' ? { login: args && args.login }
        : name.startsWith('issue.') ? { projectId: args.projectId, keys: (args.keys || []).length, patch: args.patch ? Object.keys(args.patch) : undefined, action: args.action }
        : name === 'workspace.save' ? { sections: Object.keys((args && (args.workspace || args)) || {}).filter((k) => k !== 'projects') }
        : { id: args && (args.id || args.projectId || args.key) };
      const entry = { at: new Date().toISOString(), login: who ? who.login : (detail.login || null), method: name, outcome, detail };
      ws.auditLog = [entry, ...(ws.auditLog || [])].slice(0, 5000);
      saveWorkspace(ws);
    } catch { /* auditing never breaks a call */ }
  }

  // Housekeeping: drop analyses of branches not scanned for N days and closed
  // issue states older than N days (settings.housekeeping).
  function housekeep(ws, now = Date.now()) {
    const h = (ws.settings && ws.settings.housekeeping) || {};
    const removed = { branches: 0, issueStates: 0 };
    for (const p of ws.projects || []) {
      if (h.branchDays > 0) {
        for (const [name, b] of Object.entries(p.branches || {})) {
          if (name === (p.mainBranch || 'main')) continue;
          if (b.updatedAt && now - Date.parse(b.updatedAt) > h.branchDays * 86400000) { delete p.branches[name]; removed.branches++; }
        }
      }
      if (h.closedIssueDays > 0) {
        for (const [key, st] of Object.entries(p.issueState || {})) {
          const last = (st.changelog || []).slice(-1)[0];
          if (st.status === 'CLOSED' && last && now - Date.parse(last.at) > h.closedIssueDays * 86400000) { delete p.issueState[key]; removed.issueStates++; }
        }
      }
    }
    if (h.auditDays > 0) ws.auditLog = (ws.auditLog || []).filter((e) => now - Date.parse(e.at) <= h.auditDays * 86400000);
    return removed;
  }

  // Portfolio / application measures aggregated from the members' main branches.
  function portfolioMeasures(ws, portfolio) {
    const members = [...new Set([...(portfolio.projects || []), ...(portfolio.projectIds || []), ...(portfolio.members || [])])].map((id) => (ws.projects || []).find((p) => p.id === id || p.key === id)).filter(Boolean);
    const sum = {};
    const worst = {};
    const gates = { OK: 0, ERROR: 0, NONE: 0 };
    const rows = [];
    for (const p of members) {
      const b = (p.branches || {})[p.mainBranch || 'main'];
      const m = (b && b.latest && b.latest.measures) || null;
      const gate = b && b.latest ? b.latest.qualityGate.status : 'NONE';
      gates[gate] = (gates[gate] || 0) + 1;
      rows.push({ id: p.id, key: p.key, name: p.name, gate, measures: m });
      if (!m) continue;
      for (const k of ['ncloc', 'bugs', 'vulnerabilities', 'code_smells', 'security_hotspots', 'sqale_index', 'new_bugs', 'new_vulnerabilities', 'new_code_smells', 'duplicated_lines', 'lines']) sum[k] = (sum[k] || 0) + (Number(m[k]) || 0);
      for (const k of ['reliability_rating', 'security_rating', 'maintainability_rating', 'security_review_rating', 'new_reliability_rating', 'new_security_rating', 'new_maintainability_rating']) if (m[k] != null) worst[k] = Math.max(worst[k] || 1, Number(m[k]));
    }
    const letter = (v) => (v ? 'ABCDE'[Math.min(4, Math.max(0, Math.round(v) - 1))] : null);
    return {
      id: portfolio.id, name: portfolio.name, projects: rows, gates,
      measures: { ...sum, ...worst, duplicated_lines_density: sum.lines ? Math.round((sum.duplicated_lines / sum.lines) * 1000) / 10 : 0 },
      ratings: Object.fromEntries(Object.entries(worst).map(([k, v]) => [k, letter(v)])),
      releasability: gates.ERROR ? 'ERROR' : members.length ? 'OK' : 'NONE',
    };
  }

  return { call, store, freshWorkspace, scheduler: runner };
}

// A copy for merge3's base that shares the analyses (issue lists): a large
// project's analysis fills close to a gigabyte, and stored analyses are only
// replaced by the next scan, never edited by it.
function cloneSharingAnalyses(ws) {
  const held = [];
  (ws.projects || []).forEach((p, i) => {
    for (const [name, state] of Object.entries(p.branches || {})) {
      if (!state) continue;
      held.push({ i, name, latest: state.latest, snapshots: state.snapshots });
      state.latest = null;
      state.snapshots = null;
    }
    if (p.desktop) { held.push({ i, desktop: p.desktop }); p.desktop = null; }
  });
  let copy;
  try {
    copy = structuredClone(ws);
  } finally {
    for (const h of held) {
      for (const target of copy ? [ws, copy] : [ws]) {
        const p = target.projects[h.i];
        if (h.desktop) p.desktop = h.desktop;
        else Object.assign(p.branches[h.name], { latest: h.latest, snapshots: h.snapshots });
      }
    }
  }
  return copy;
}

// A workspace without the issue lists (each analysis keeps issueCount).
function slimmed(ws, slim, issuesFor) {
  if (!slim || !ws) return ws;
  const keep = issuesFor === 'active' ? ws.activeProjectId : issuesFor || null;
  // Also the new-code baselines (issue keys, line hashes): the GUI never reads them.
  const strip = (a, keepIssues) => (a && Array.isArray(a.issues) ? { ...a, issues: keepIssues ? a.issues : undefined, keys: undefined, issueCount: a.issues.length, ...(a.defectAnalysis ? { defectAnalysis: { ...a.defectAnalysis, cids: undefined } } : {}) } : a);
  const branch = (b, keepIssues) => ({ ...b, keys: undefined, cids: undefined, lineHashes: undefined, latest: strip(b.latest, keepIssues), history: (b.history || []).map(({ keys, ...h }) => h) });
  return {
    ...ws,
    slim: true,
    projects: (ws.projects || []).map((p) => {
      const branches = {};
      const mine = keep != null && p.id === keep;
      for (const [name, b] of Object.entries(p.branches || {})) branches[name] = b && b.latest ? branch(b, mine) : b;
      return { ...p, branches, ...(p.desktop ? { desktop: strip(p.desktop, mine) } : {}) };
    }),
  };
}

function publicProject(project) {
  const { branches, desktop, ...rest } = project;
  const brief = {};
  for (const [name, branch] of Object.entries(branches || {})) {
    brief[name] = { updatedAt: branch.updatedAt, gate: branch.latest && branch.latest.qualityGate.status, measures: branch.measures };
  }
  return { ...rest, branches: brief, latestBranch: project.mainBranch || 'main' };
}

// { code, message, text: { en, ko } } — see core/errors.js.
// Percent / ETA of a database export from dbsink's { phase, done, total }.
// Inside an analysis (`from`, e.g. 99) the bar stays where the scan left it.
function dbProgress(pr, startedAt, from) {
  const elapsedMs = Date.now() - startedAt;
  const write = pr.total ? pr.done / pr.total : 0;
  const percent = from != null ? from : Math.min(99, Math.round({ connect: 1, schema: 4, write: 5 + 90 * write, commit: 96 }[pr.phase] || 0));
  const etaMs = pr.phase === 'write' && write > 0.02 && from == null ? Math.round(elapsedMs / write * (1 - write)) : null;
  return { phase: 'db', dbPhase: pr.phase, done: pr.done || 0, total: pr.total || 0, percent, elapsedMs, etaMs, detail: '' };
}

function serializeError(err) {
  const { code, text } = require('./errors').describe(err);
  // Extra details the GUI uses (e.g. which project a CONFLICT is about).
  const extra = {};
  for (const k of ['projectId', 'projectName', 'file', 'keys', 'field']) if (err && err[k] !== undefined) extra[k] = err[k];
  return { code, message: (err && err.message) || String(err), text, ...extra };
}

module.exports = { createApi, serializeError, publicProject };

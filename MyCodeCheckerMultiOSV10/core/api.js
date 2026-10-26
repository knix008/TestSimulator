'use strict';

const fs = require('fs');
const path = require('path');
const { analyzePath, listRules, walk } = require('./analyze');
const { toJson, toCsv, toSarif, toHtml, badge, toDefects } = require('./report');
const { createStore, projectIdFor, freshWorkspace } = require('./store');
const { SONAR_WAY } = require('./qualitygate');
const { DEFAULT_POLICY, slimIssue, isDismissed } = require('./coverity');
const { createExtensions } = require('./api-ext');
const access = require('./access');
const scm = require('./platform/scm');
const tools = require('./platform/tools');
const scheduler = require('./scheduler');
const integrate = require('./integrate');
const profiles = require('./profiles');
const users = require('./platform/users');

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

  // The project's profile per language (else the language default), with inheritance.
  function inactiveFor(ws, project) {
    return profiles.resolveForProject(ws, project, listRules());
  }

  const ext = createExtensions({ workspace, saveWorkspace, configDir: opts.configDir });

  // New code definition (SonarQube): 'previous' analysis, 'days', a specific
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
        if (changed && changed.files) return { isNewLine: (file, line) => scm.isChangedLine(changed, file, line) };
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
        coverageReports: (project && project.coverageReports && project.coverageReports.length ? project.coverageReports : ws.settings.coverageReports) || undefined,
        inactive: profile.inactive,
        overrides: profile.overrides,
        customRules: ws.customRules || [],
        limits: ws.settings.limits || {},
        maxFiles: ws.settings.maxFiles || 8000,
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
      task.status = 'FAILED';
      task.error = err.message;
      task.executedAt = new Date().toISOString();
      ws.tasks = [task, ...(ws.tasks || [])].slice(0, 100);
      saveWorkspace(ws);
      integrate.notify(ws, 'scan-failed', { project: { id: project.id, key: project.key, name: project.name }, branch, error: err.message });
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
      delete analysis.lineHashes;
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
    const lineHashes = analysis.lineHashes;
    delete analysis.lineHashes;
    project.branches[branch] = {
      lineHashes,
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
    housekeep(ws);
    try {
      await ext.afterScan(ws, project, branch, analysis, previousLatest);
    } catch (err) {
      task.warnings.push(err.message);
    }
    ws.tasks = [task, ...(ws.tasks || [])].slice(0, 100);
    saveWorkspace(ws);
    for (const [event, ctx] of integrate.analysisEvents(project, branch, analysis, previousLatest)) await integrate.notify(ws, event, ctx);
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
    // Sparrow-style approval: when required, false positives and accepted
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
      // Coverity Connect triage attributes.
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
        issue.coverityStatus = isDismissed(issue) ? 'Dismissed' : (issue.coverityStatus === 'Dismissed' ? 'Outstanding' : issue.coverityStatus);
        issue.comments = next.comments || [];
        issue.changelog = next.changelog || [];
        if (issue.cid) cid = issue.cid;
      }
      if (cid) project.issueState[`cid:${cid}`] = next;
    }
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
  // like a SonarQube scanner report.
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
    return { projectKey: key, branch: result.analysis.coverity.stream, files: count, qualityGate: result.analysis.qualityGate, measures: result.analysis.measures, taskId: result.task.id };
  }

  // Prepared source files of a project folder, as engines receive them.
  function sourceFiles(project, keep = () => true) {
    const { detectLanguage } = require('./languages');
    const ws = workspace();
    const out = [];
    for (const full of walk(project.path, { exclusions: ws.settings.exclusions || [] })) {
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
    'workspace.load': (args, who) => access.filterWorkspace(workspace(), who),
    'workspace.save': (args, who) => {
      const stored = workspace();
      const merged = access.mergeWorkspace(stored, args.workspace || args, who);
      merged.profiles = profiles.stampChanges(stored.profiles, merged.profiles, who ? who.login : null);
      const saved = saveWorkspace(merged);
      return access.filterWorkspace(saved, who);
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
    'project.submit': (args) => submit(args || {}),
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
    'portfolio.measures': (args) => {
      const ws = workspace();
      const list = (ws.portfolios || []).filter((p) => !args.id || p.id === args.id);
      return list.map((p) => portfolioMeasures(ws, p));
    },
    'schedule.list': () => (workspace().schedules || []),
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
    'project.remove': (args) => {
      const ws = workspace();
      ws.projects = (ws.projects || []).filter((p) => p.id !== args.projectId);
      if (ws.activeProjectId === args.projectId) ws.activeProjectId = ws.projects[0] ? ws.projects[0].id : null;
      return saveWorkspace(ws);
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

  // Audit log (SonarQube Enterprise / Coverity Connect): security, settings and
  // triage changes with who, when and what. Kept to the last 5000 entries.
  const AUDITED = /^(security\.(call|login|logout)|workspace\.save|issue\.(update|review)|project\.(remove|submit)|profile\.restore|schedule\.(save|delete)|tools\.(install|decline)|webhook\.(save|delete)|misra\.savePlan|sca\.setOsvSource|external\.import)$/;
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
    const members = (portfolio.projects || portfolio.members || []).map((id) => (ws.projects || []).find((p) => p.id === id || p.key === id)).filter(Boolean);
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

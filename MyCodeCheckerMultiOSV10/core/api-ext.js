'use strict';

// API methods for compliance, reports, SCA, SCM / pull requests, webhooks,
// users and permissions, external issues and snapshot history. They work on
// the same workspace object as core/api.js.

const fs = require('fs');
const path = require('path');
const platform = require('./platform');
const sca = require('./sca');
const dast = require('./dast');
const { listRules } = require('./analyze');

const { compliance, reports, scm, pullrequest, webhooks, users, external, history, measures } = platform;

const SNAPSHOTS_KEPT = 12;

function createExtensions({ workspace, saveWorkspace, configDir }) {
  let osvCache = null; // { source, db }

  function projectOf(ws, projectId) {
    const project = (ws.projects || []).find((p) => p.id === (projectId || ws.activeProjectId));
    if (!project) throw Object.assign(new Error('Project not found'), { code: 'NOT_FOUND' });
    return project;
  }

  function branchOf(project, branch) {
    const name = branch || project.mainBranch || 'main';
    const state = (project.branches || {})[name];
    if (!state || !state.latest) throw Object.assign(new Error('No analysis'), { code: 'NOT_FOUND' });
    return { name, state };
  }

  function latestFor(args) {
    const ws = workspace();
    const project = projectOf(ws, args.projectId);
    const { name, state } = branchOf(project, args.branch);
    return { ws, project, branch: name, state, analysis: state.latest };
  }

  function advisoryDb(ws) {
    const source = ws.settings && ws.settings.osvSource;
    if (!source) return null;
    if (osvCache && osvCache.source === source) return osvCache.db;
    if (!fs.existsSync(source)) return null;
    const { db } = sca.importOsvDatabase(source, { includeBundled: true });
    osvCache = { source, db };
    return db;
  }

  // Options the analyzer engines read from analyzeSources(options).
  function engineOptions(ws, project) {
    return {
      sca: {
        advisoryDb: advisoryDb(ws) || undefined,
        licensePolicy: ws.settings && ws.settings.licensePolicy,
        internalPatterns: (ws.settings && ws.settings.internalPackages) || [],
      },
      misra: (ws.settings && ws.settings.misra) || {},
      cfamily: {
        includeDirs: ((project && project.includeDirs) || []).map((d) => path.resolve(project.path, d)),
        defines: (project && project.defines) || {},
        target: (ws.settings && ws.settings.cTarget) || undefined,
      },
      absint: (ws.settings && ws.settings.absint) || {},
      taintModels: (ws.settings && ws.settings.taintModels) || undefined,
    };
  }

  let dastRun = null; // { id, scan, progress }

  // Called by api.scan after a committed analysis has been stored.
  async function afterScan(ws, project, branch, analysis, previous) {
    const state = project.branches[branch];
    analysis.issues = history.stampCreationDates(previous && previous.issues, analysis.issues);
    state.snapshots = [...(state.snapshots || []), {
      snapshot: analysis.coverity && analysis.coverity.snapshot,
      at: analysis.finishedAt,
      issues: analysis.issues.map(slim),
    }].slice(-SNAPSHOTS_KEPT);
    try {
      Object.assign(analysis.measures, measures.extraMeasures(analysis, { tests: project.tests }));
    } catch { /* extra measures are best effort */ }
    if (ws.settings && ws.settings.newCode === 'scm') {
      const changed = await scm.changedLines(project.path, ws.settings.newCodeRef || null, {});
      if (changed && changed.files && Object.keys(changed.files).length) {
        for (const issue of analysis.issues) issue.isNew = scm.isChangedLine(changed, issue.file, issue.line);
      }
    }
    if (ws.settings && ws.settings.autoAssign) {
      const files = [...new Set(analysis.issues.filter((i) => !i.assignee).map((i) => i.file))];
      const blame = await scm.blameFiles(project.path, files, {});
      analysis.issues = scm.assignAuthors(analysis.issues, blame, {});
    }
    const events = webhooks.eventsFor({ previousGate: previous && previous.qualityGate && previous.qualityGate.status, gate: analysis.qualityGate.status });
    if (ws.settings && ws.settings.webhookUrl && !(ws.webhooks || []).length) {
      // The old single-URL setting becomes a regular webhook definition.
      ws.webhooks = [webhooks.defineWebhook({ name: 'Default', url: ws.settings.webhookUrl })];
    }
    const hooks = webhooks.selectWebhooks(ws.webhooks || [], project.id, events);
    for (const hook of hooks) {
      for (const event of events.filter((e) => (hook.events || ['analysis-done']).includes(e))) {
        const payload = webhooks.buildPayload({ project, analysis, branch });
        const record = await webhooks.deliver(hook, payload, { event });
        ws.webhookDeliveries = webhooks.appendDelivery(ws.webhookDeliveries || [], record);
      }
    }
  }

  function catalog() {
    return listRules();
  }

  const methods = {
    // ── Compliance and reports ───────────────────────────
    'compliance.standards': () => compliance.standardIds ? compliance.standardIds() : [],
    'compliance.report': (args) => {
      const { analysis } = latestFor(args);
      const issues = args.newCodeOnly ? analysis.issues.filter((i) => i.isNew) : analysis.issues;
      return compliance.report(issues, catalog(), args.standard || 'owasp2021', { level: args.level, lang: args.lang });
    },
    'compliance.security': (args) => {
      const { analysis } = latestFor(args);
      return compliance.securityReports(analysis.issues, catalog(), { lang: args.lang });
    },
    'misra.plan': (args) => {
      const ws = workspace();
      const plans = ws.misraPlans || {};
      const key = `${args.projectId || ws.activeProjectId}:${args.standard || 'misraC2012'}`;
      return plans[key] || compliance.defaultMisraPlan(args.standard || 'misraC2012');
    },
    'misra.savePlan': (args) => {
      const ws = workspace();
      const standard = (args.plan && args.plan.standard) || args.standard || 'misraC2012';
      ws.misraPlans = ws.misraPlans || {};
      ws.misraPlans[`${args.projectId || ws.activeProjectId}:${standard}`] = { ...args.plan, standard };
      saveWorkspace(ws);
      return ws.misraPlans[`${args.projectId || ws.activeProjectId}:${standard}`];
    },
    'misra.compliance': (args) => {
      const { analysis } = latestFor(args);
      const plan = methods['misra.plan'](args);
      return compliance.misraCompliance(analysis.issues, catalog(), plan, { lang: args.lang });
    },
    'report.kinds': () => reports.REPORT_KINDS,
    'report.export': (args) => {
      const { ws, project, branch, state, analysis } = latestFor(args);
      const kind = args.kind || 'executive';
      const opts = {
        catalog: catalog(),
        history: state.history || [],
        lang: args.lang || (ws.settings && ws.settings.language) || 'ko',
        project, branch,
        standard: args.standard,
        ruleSet: args.ruleSet,
      };
      if (kind === 'misra') opts.plan = methods['misra.plan']({ projectId: project.id, standard: args.standard || 'misraC2012' });
      if (kind === 'sbom') opts.sca = sca.scanDependencies(project.path, engineOptions(ws, project).sca);
      const out = reports.build(kind, analysis, opts);
      if (args.format === 'csv') return { format: 'csv', body: out.csv, type: 'text/csv', fileName: `${out.fileName}.csv` };
      return { format: 'html', body: out.html, type: 'text/html', fileName: `${out.fileName}.html` };
    },

    // ── SCA ──────────────────────────────────────────────
    'sca.scan': (args) => {
      const ws = workspace();
      const project = projectOf(ws, args.projectId);
      const result = sca.scanDependencies(project.path, { ...engineOptions(ws, project).sca, includeDev: !!args.includeDev });
      return {
        summary: result.summary,
        dependencies: result.dependencies,
        vulnerabilities: result.vulnerabilities,
        licenses: result.licenses,
        manifests: result.manifests,
        errors: result.errors,
      };
    },
    'sca.sbom': (args) => {
      const ws = workspace();
      const project = projectOf(ws, args.projectId);
      const result = sca.scanDependencies(project.path, engineOptions(ws, project).sca);
      const meta = { name: project.name, version: args.version || '' };
      if (args.format === 'spdx') return { format: 'spdx', body: JSON.stringify(sca.toSpdx(result, meta), null, 2), type: 'application/spdx+json', fileName: `${project.key}.spdx.json` };
      if (args.format === 'spdx-tv') return { format: 'spdx-tv', body: sca.toSpdxTagValue(result, meta), type: 'text/spdx', fileName: `${project.key}.spdx` };
      return { format: 'cyclonedx', body: JSON.stringify(sca.toCycloneDx(result, meta), null, 2), type: 'application/vnd.cyclonedx+json', fileName: `${project.key}.cdx.json` };
    },
    'sca.setOsvSource': (args) => {
      const ws = workspace();
      const source = args.source ? path.resolve(args.source) : '';
      if (source && !fs.existsSync(source)) throw Object.assign(new Error(`Not found: ${source}`), { code: 'NOT_FOUND' });
      ws.settings.osvSource = source;
      osvCache = null;
      saveWorkspace(ws);
      const db = advisoryDb(ws);
      return { source, advisories: db && db.size != null ? db.size : null };
    },
    // Online lookup; runs only when the user asks for it.
    'sca.queryOsv': async (args) => {
      const ws = workspace();
      const project = projectOf(ws, args.projectId);
      const result = sca.scanDependencies(project.path, engineOptions(ws, project).sca);
      return sca.queryOsv(result.dependencies, { timeoutMs: args.timeoutMs || 15000 });
    },

    // ── DAST (only the target origins the user enters) ───
    'dast.rules': () => dast.catalog(),
    'dast.start': async (args) => {
      if (dastRun) throw Object.assign(new Error('A DAST scan is already running'), { code: 'BUSY' });
      if (!args.target) throw Object.assign(new Error('Target URL is required'), { code: 'BAD_ARGS' });
      const scan = dast.createScan({
        target: args.target,
        scope: args.scope,
        mode: args.mode === 'active' ? 'active' : 'passive',
        rateLimit: args.rateLimit,
        maxRequests: args.maxRequests,
        maxPages: args.maxPages,
        maxDepth: args.maxDepth,
        seeds: args.seeds,
        openapi: args.openapi,
        auth: args.auth,
      });
      dastRun = { id: `dast-${Date.now().toString(36)}`, scan, progress: null };
      scan.on('progress', (p) => { if (dastRun) dastRun.progress = p; });
      try {
        const result = await scan.start();
        const ws = workspace();
        const record = { id: dastRun.id, ...result };
        ws.dast = [record, ...(ws.dast || [])].slice(0, 20);
        saveWorkspace(ws);
        return record;
      } finally {
        dastRun = null;
      }
    },
    'dast.progress': () => (dastRun ? { running: true, id: dastRun.id, progress: dastRun.progress } : { running: false }),
    'dast.cancel': () => {
      if (dastRun) dastRun.scan.cancel();
      return { ok: true };
    },
    'dast.results': () => (workspace().dast || []).map(({ pages, findings, ...rest }) => ({ ...rest, findingCount: (findings || []).length, pageCount: (pages || []).length })),
    'dast.result': (args) => (workspace().dast || []).find((r) => r.id === args.id) || null,
    'dast.report': (args) => {
      const result = (workspace().dast || []).find((r) => r.id === args.id);
      if (!result) throw Object.assign(new Error('DAST result not found'), { code: 'NOT_FOUND' });
      if (args.format === 'sarif') return { format: 'sarif', body: dast.toSarif(result), type: 'application/sarif+json', fileName: `${result.id}.sarif` };
      return { format: 'html', body: dast.toHtml(result, args.lang || 'ko'), type: 'text/html', fileName: `${result.id}.html` };
    },

    // ── IDE connected mode (core/lsp/connected.js) ───────
    // The slim part of the workspace an IDE needs: profiles, exclusions, custom
    // rules and each project's issue states, without the stored analyses.
    'ide.config': () => {
      const ws = workspace();
      return {
        settings: { exclusions: (ws.settings && ws.settings.exclusions) || [] },
        profiles: ws.profiles || [],
        customRules: ws.customRules || [],
        projects: (ws.projects || []).map((p) => ({ id: p.id, key: p.key, name: p.name, path: p.path, issueState: p.issueState || {} })),
      };
    },

    // ── SCM and pull requests ────────────────────────────
    'scm.info': async (args) => {
      const ws = workspace();
      const project = projectOf(ws, args.projectId);
      const repo = await scm.detectRepo(project.path);
      if (!repo || !repo.isRepo) return { isRepo: false };
      return { ...repo, branches: await scm.listBranches(project.path), tags: await scm.listTags(project.path) };
    },
    'pr.analyze': async (args) => {
      const { project, analysis } = latestFor(args);
      const changed = await scm.changedLines(project.path, null, { target: args.target || project.mainBranch || 'main' });
      const pr = pullrequest.analyzePullRequest(analysis, changed, { key: args.key, target: args.target });
      return { pr, markdown: pullrequest.summaryMarkdown(pr, { lang: args.lang }), decorations: pullrequest.decorations(pr, { headSha: args.headSha }) };
    },

    // ── Webhooks ─────────────────────────────────────────
    'webhook.list': () => (workspace().webhooks || []).map(webhooks.publicWebhook),
    'webhook.save': (args) => {
      const ws = workspace();
      const prev = (ws.webhooks || []).find((h) => h.id === (args.webhook && args.webhook.id));
      const hook = webhooks.defineWebhook({ ...(prev || {}), ...args.webhook });
      ws.webhooks = [...(ws.webhooks || []).filter((h) => h.id !== hook.id), hook];
      saveWorkspace(ws);
      return webhooks.publicWebhook(hook);
    },
    'webhook.delete': (args) => {
      const ws = workspace();
      ws.webhooks = (ws.webhooks || []).filter((h) => h.id !== args.id);
      saveWorkspace(ws);
      return { ok: true };
    },
    'webhook.deliveries': (args) => (workspace().webhookDeliveries || []).filter((d) => !args.webhookId || d.webhookId === args.webhookId),

    // ── Users and permissions ────────────────────────────
    'security.get': () => {
      const ws = workspace();
      users.ensureSecurity(ws);
      return users.publicSecurity(ws);
    },
    'security.call': (args) => {
      // One entry point for the users.js mutators: { fn: 'createUser', args: {...} }
      const allowed = new Set([
        'createUser', 'updateUser', 'deactivateUser', 'setPassword', 'createGroup', 'deleteGroup',
        'addMember', 'removeMember', 'grantGlobal', 'revokeGlobal', 'grantProject', 'revokeProject',
        'createTemplate', 'setDefaultTemplate', 'applyTemplate', 'generateToken', 'revokeToken', 'listTokens', 'setEnabled',
      ]);
      if (!allowed.has(args.fn)) throw Object.assign(new Error(`Unknown security call: ${args.fn}`), { code: 'NO_METHOD' });
      const ws = workspace();
      users.ensureSecurity(ws);
      const params = Array.isArray(args.args) ? args.args : [args.args];
      const result = users[args.fn](ws, ...params);
      saveWorkspace(ws);
      return { result, security: users.publicSecurity(ws) };
    },
    'security.login': (args) => {
      const ws = workspace();
      users.ensureSecurity(ws);
      const user = users.authenticate(ws, args.login, args.password);
      if (!user) throw Object.assign(new Error('Invalid login'), { code: 'UNAUTHORIZED' });
      const token = users.generateToken(ws, { login: args.login, name: `session-${Date.now()}` });
      saveWorkspace(ws);
      return { login: args.login, token: token.token || token };
    },

    // ── External issues and tests ────────────────────────
    'external.import': (args) => {
      const { ws, project, state, analysis } = latestFor(args);
      const text = args.text != null ? args.text : fs.readFileSync(path.resolve(args.file), 'utf8');
      const imported = external.importExternal(text, { format: args.format, fileName: args.fileName || args.file, root: project.path });
      const added = external.toIssues(imported.findings, {});
      const engine = imported.engine;
      analysis.issues = [...analysis.issues.filter((i) => i.externalEngine !== engine), ...added.map((i) => ({ ...i, externalEngine: engine }))];
      project.external = { ...(project.external || {}), [engine]: { at: new Date().toISOString(), count: added.length, rules: imported.rules } };
      state.latest = analysis;
      saveWorkspace(ws);
      return { format: imported.format, engine, count: added.length, warnings: imported.warnings };
    },
    'tests.import': (args) => {
      const ws = workspace();
      const project = projectOf(ws, args.projectId);
      const text = args.text != null ? args.text : fs.readFileSync(path.resolve(args.file), 'utf8');
      const report = external.importTests(text, { fileName: args.fileName || args.file });
      project.tests = report;
      saveWorkspace(ws);
      return measures.testMetrics(report);
    },

    // ── History, measures ────────────────────────────────
    'snapshot.list': (args) => {
      const { state } = latestFor(args);
      return (state.snapshots || []).map((s) => ({ snapshot: s.snapshot, at: s.at, count: s.issues.length }));
    },
    'snapshot.compare': (args) => {
      const { state } = latestFor(args);
      const snaps = state.snapshots || [];
      const find = (n) => snaps.find((s) => s.snapshot === Number(n));
      const before = find(args.from) || snaps[snaps.length - 2] || { issues: [] };
      const after = find(args.to) || snaps[snaps.length - 1] || { issues: [] };
      return history.compareSnapshots(before.issues, after.issues);
    },
    'defect.lifecycle': (args) => {
      const { state } = latestFor(args);
      const out = history.defectLifecycle(state.snapshots || []);
      return out instanceof Map ? Object.fromEntries(out) : out;
    },
    'activity.events': (args) => history.activityEvents(latestFor(args).state.history || [], { category: args.category }),
    'activity.trend': (args) => history.trendSeries(latestFor(args).state.history || [], args.metrics || ['bugs', 'vulnerabilities', 'code_smells']),
    'issue.age': (args) => history.issueAge(latestFor(args).analysis.issues),
    'component.tree': (args) => {
      const tree = measures.componentTree(latestFor(args).analysis);
      return args.path ? measures.findComponent(tree, args.path) : tree;
    },
  };

  return { methods, afterScan, engineOptions, configDir };
}

function slim(issue) {
  const { snippet, events, comments, changelog, ...rest } = issue;
  return rest;
}

module.exports = { createExtensions };

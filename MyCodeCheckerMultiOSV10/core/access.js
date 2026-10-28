'use strict';

// Permission enforcement for the API. While ws.security.enabled is off every
// call is allowed (the single-user desktop case). When it is on, each call
// carries a user token (security.login or a generated token) and must hold the
// permission listed below. Project permissions are checked on args.projectId.

const users = require('./platform/users');
const { sameJson: same } = require('./json');

// method -> 'public' | 'auth' | [permission, 'global' | 'project']
const ACCESS = {
  'app.info': 'public',
  'security.login': 'public',
  'rules.list': 'public',
  'tools.status': 'auth',
  'tools.offers': 'auth',
  'tools.job': 'auth',
  'tools.install': ['admin', 'global'],
  'tools.decline': ['admin', 'global'],
  'tools.askOnStart': ['admin', 'global'],
  'profile.compare': 'auth',
  'profile.backup': 'auth',
  'profile.effective': 'auth',
  'profile.restore': ['profileadmin', 'global'],
  'report.kinds': 'public',
  'dast.rules': 'public',
  'dast.policies': 'public',
  'compliance.standards': 'public',

  'workspace.load': 'auth',
  'workspace.save': 'auth',
  'settings.patch': 'auth',
  'project.issues': 'auth',
  'project.target': 'auth',
  'security.me': 'auth',
  'security.logout': 'auth',
  'ide.config': 'auth',

  'project.scan': ['scan', 'project'],
  'scan.start': ['scan', 'project'],
  'checks.list': 'auth',
  'project.dirs': ['scan', 'global'],
  'scan.job': 'auth',
  'scan.cancel': 'auth',
  'project.submit': ['scan', 'global'],
  'project.create': ['provisioning', 'global'],
  'project.open': ['scan', 'global'],
  'project.saveFile': ['admin', 'project'],
  'file.save': 'auth',
  'file.saveBeside': 'auth',
  'project.recentFiles': 'auth',
  'recent.list': 'auth',
  'recent.remove': 'auth',
  'recent.clear': 'auth',
  'samples.list': 'auth',
  'system.memory': 'auth',
  'samples.open': ['scan', 'global'],
  'audit.list': ['admin', 'global'],
  'ai.get': 'auth',
  'db.get': ['admin', 'global'],
  'db.save': ['admin', 'global'],
  'db.test': ['admin', 'global'],
  'db.export': ['admin', 'project'],
  'db.exportStart': ['admin', 'project'],
  'db.exportJob': 'auth',
  'db.exportCancel': 'auth',
  'ai.save': ['admin', 'global'],
  'ai.test': ['admin', 'global'],
  'issue.aiFix': ['codeviewer', 'project'],
  'issue.aiFixApply': ['issueadmin', 'project'],
  'issue.aiFixRevert': ['issueadmin', 'project'],
  'metrics.his': ['user', 'project'],
  'arch.graph': ['user', 'project'],
  'integrations.get': ['admin', 'global'],
  'integrations.save': ['admin', 'global'],
  'integrations.testSmtp': ['admin', 'global'],
  'integrations.testLdap': ['admin', 'global'],
  'notify.subscribe': 'auth',
  'issue.ticket': ['user', 'project'],
  'pr.decorate': ['scan', 'project'],
  'housekeeping.run': ['admin', 'global'],
  'portfolio.measures': 'auth',
  'schedule.list': 'auth',
  'schedule.preview': 'auth',
  'schedule.save': ['admin', 'global'],
  'schedule.delete': ['admin', 'global'],
  'schedule.runNow': ['scan', 'global'],
  'project.sample': ['scan', 'global'],
  'project.file': ['codeviewer', 'project'],
  'project.remove': ['admin', 'project'],
  'project.resetAnalysis': ['admin', 'project'],
  'issue.update': ['user', 'project'],
  'issue.review': ['user', 'project'],
  'issue.reviews': ['user', 'project'],
  'report.build': ['user', 'project'],
  'report.export': ['user', 'project'],
  'report.regulatory': ['user', 'project'],

  'compliance.report': ['user', 'project'],
  'compliance.security': ['user', 'project'],
  'misra.plan': ['user', 'project'],
  'misra.compliance': ['user', 'project'],
  'misra.savePlan': ['admin', 'project'],

  'sca.scan': ['scan', 'project'],
  'sca.sbom': ['user', 'project'],
  'sca.setOsvSource': ['admin', 'global'],
  'sca.queryOsv': ['scan', 'global'],

  'dast.start': ['scan', 'global'],
  'dast.progress': ['scan', 'global'],
  'dast.cancel': ['scan', 'global'],
  'dast.results': ['scan', 'global'],
  'dast.result': ['scan', 'global'],
  'dast.report': ['scan', 'global'],

  'scm.info': ['user', 'project'],
  'pr.analyze': ['scan', 'project'],
  'external.import': ['scan', 'project'],
  'tests.import': ['scan', 'project'],
  'snapshot.list': ['user', 'project'],
  'snapshot.compare': ['user', 'project'],
  'defect.lifecycle': ['user', 'project'],
  'defect.streamDiff': ['user', 'project'],
  'activity.events': ['user', 'project'],
  'activity.trend': ['user', 'project'],
  'issue.age': ['user', 'project'],
  'component.tree': ['user', 'project'],

  'webhook.list': ['admin', 'global'],
  'webhook.save': ['admin', 'global'],
  'webhook.delete': ['admin', 'global'],
  'webhook.deliveries': ['admin', 'global'],
  'security.get': ['admin', 'global'],
  'security.call': ['admin', 'global'],
};

// security.call functions a signed-in user may run on their own account.
const SELF_SERVICE = new Set(['generateToken', 'revokeToken', 'listTokens', 'setPassword']);

// Workspace sections and the global permission needed to change them.
const SECTION_PERMISSION = {
  profiles: 'profileadmin',
  gates: 'gateadmin',
  customRules: 'profileadmin',
  settings: 'admin',
  portfolios: 'admin',
  defectAnalysis: 'admin',
  webhooks: 'admin',
};

// Sections a client may change without any permission (view state).
const FREE_SECTIONS = new Set(['activeProjectId', 'version', 'security', 'tasks', 'webhookDeliveries', 'auditLog']);

function fail(code, message) {
  return Object.assign(new Error(message), { code });
}

function enabled(ws) {
  return !!(ws && ws.security && ws.security.enabled);
}

/** Resolve the caller from a user token. Returns { login, type, projectId } or null. */
function caller(ws, token) {
  if (!token) return null;
  return users.verifyToken(ws, token);
}

function allowed(ws, who, permission, projectId) {
  if (!who) return false;
  if (who.type !== 'USER') {
    if (permission !== 'scan') return false;
    if (who.type === 'PROJECT_ANALYSIS' && who.projectId !== projectId) return false;
  }
  return users.authorize(ws, who.login, permission, projectId || null);
}

/**
 * Throw UNAUTHORIZED / FORBIDDEN unless the call is allowed. Returns the
 * caller (null when security is off) so handlers can filter by it.
 */
function check(ws, name, args, token) {
  if (!enabled(ws)) return null;
  const rule = ACCESS[name] || ['admin', 'global'];
  if (rule === 'public') return caller(ws, token);
  const who = caller(ws, token);
  if (!who) throw fail('UNAUTHORIZED', 'Sign in first');
  if (rule === 'auth') {
    if (who.type !== 'USER') throw fail('FORBIDDEN', 'Analysis tokens can only scan');
    return who;
  }
  const [permission, scope] = rule;
  if (name === 'security.call' && SELF_SERVICE.has(args && args.fn) && ownAccount(args, who)) return who;
  if (name === 'issue.update' && changesStatus(args)) {
    const permission = HOTSPOT_STATUS.has(args.patch.status) ? 'securityhotspotadmin' : 'issueadmin';
    if (!allowed(ws, who, permission, args.projectId)) throw fail('FORBIDDEN', `Permission denied: ${permission}`);
    return who;
  }
  if (name === 'issue.review' && (args.action === 'approve' || args.action === 'reject')) {
    if (!allowed(ws, who, 'issueadmin', args.projectId)) throw fail('FORBIDDEN', 'Permission denied: issueadmin');
    return who;
  }
  const projectId = scope === 'project' ? projectIdOf(ws, name, args) : null;
  if (scope === 'project' && !projectId && name === 'project.scan') {
    if (!allowed(ws, who, 'provisioning', null) || !allowed(ws, who, 'scan', null)) throw fail('FORBIDDEN', 'Permission denied: provisioning');
    return who;
  }
  if (!allowed(ws, who, permission, projectId)) throw fail('FORBIDDEN', `Permission denied: ${permission}`);
  return who;
}

function ownAccount(args, who) {
  const params = Array.isArray(args.args) ? args.args : [args.args];
  const first = params[0];
  const login = typeof first === 'string' ? first : first && first.login;
  return who.type === 'USER' && (!login || login === who.login);
}

const HOTSPOT_STATUS = new Set(['TO_REVIEW', 'ACKNOWLEDGED', 'SAFE', 'FIXED', 'REVIEWED']);

// Assigning and commenting need 'user'; status, resolution and triage need issue admin.
function changesStatus(args) {
  const p = (args && args.patch) || {};
  return !!(p.status || p.resolution !== undefined || p.classification || p.action || p.impact);
}

function projectIdOf(ws, name, args) {
  if (args && args.projectId) return args.projectId;
  if (name === 'project.scan' && args && args.path) {
    const { projectIdFor } = require('./store');
    const id = projectIdFor(args.path);
    return (ws.projects || []).some((p) => p.id === id) ? id : null;
  }
  return null;
}

/** workspace.load for a caller: hide secrets and projects they cannot browse. */
function filterWorkspace(ws, who) {
  const out = { ...ws };
  delete out.auditLog; // read through audit.list (admins)
  if (ws.security) out.security = users.publicSecurity(ws);
  if (!enabled(ws)) return out;
  out.projects = (ws.projects || []).filter((p) => allowed(ws, who, 'user', p.id));
  if (!allowed(ws, who, 'admin', null)) {
    out.webhooks = [];
    out.security = { enabled: true, me: who && who.login };
  }
  return out;
}

/**
 * workspace.save from a caller: keep the stored security section, and reject
 * changes to sections the caller may not administer. Returns the workspace to
 * write.
 */
function mergeWorkspace(stored, incoming, who) {
  const next = { ...stored, ...incoming };
  next.security = stored.security;
  next.auditLog = stored.auditLog;
  if (!enabled(stored)) {
    if (incoming.projects) next.projects = keepAnalyses(stored, incoming.projects);
    return next;
  }
  const admin = allowed(stored, who, 'admin', null);
  if (!admin) next.webhooks = stored.webhooks;
  for (const key of Object.keys(incoming)) {
    if (FREE_SECTIONS.has(key) || key === 'projects') continue;
    if (key === 'webhooks' && !admin) continue;
    if (key === 'settings' && same(omit(stored.settings, PERSONAL_SETTINGS), omit(incoming.settings, PERSONAL_SETTINGS))) continue;
    if (same(stored[key], incoming[key])) continue;
    const permission = SECTION_PERMISSION[key] || 'admin';
    if (!allowed(stored, who, permission, null)) throw fail('FORBIDDEN', `Permission denied: ${permission}`);
  }
  if (incoming.projects) next.projects = mergeProjects(stored, incoming.projects, who);
  return next;
}

// Projects the caller cannot see are kept as stored; visible projects can be
// changed only by project admins (settings, gate, profiles) — analysis data
// is never taken from the client.
function mergeProjects(stored, incoming, who) {
  const byId = new Map((incoming || []).map((p) => [p.id, p]));
  const out = [];
  for (const p of stored.projects || []) {
    const inc = byId.get(p.id);
    byId.delete(p.id);
    if (!inc) {
      if (!allowed(stored, who, 'admin', p.id)) out.push(p);
      continue;
    }
    if (!allowed(stored, who, 'admin', p.id)) { out.push(p); continue; }
    out.push({ ...inc, branches: p.branches, issueState: p.issueState, desktop: p.desktop });
  }
  if (byId.size) throw fail('FORBIDDEN', 'Projects are created by scanning');
  return out;
}

// Analyses are written by scans only; the client sends projects without them
// (a large analysis is more than a request may carry).
function keepAnalyses(stored, incoming) {
  const byId = new Map((stored.projects || []).map((p) => [p.id, p]));
  return incoming.map((p) => {
    const old = byId.get(p.id);
    if (!old) return p;
    const out = { ...p, branches: old.branches };
    if (old.desktop) out.desktop = old.desktop; else delete out.desktop;
    return out;
  });
}

// Display preferences anyone may change.
const PERSONAL_SETTINGS = ['theme', 'language', 'customThemes', 'showStartOnLaunch'];

function omit(obj, keys) {
  const out = { ...(obj || {}) };
  for (const k of keys) delete out[k];
  return out;
}


module.exports = { ACCESS, check, filterWorkspace, mergeWorkspace, enabled };

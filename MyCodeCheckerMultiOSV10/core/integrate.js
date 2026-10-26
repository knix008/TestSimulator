'use strict';

// Glue between the workspace and core/integrations: stored configuration with
// masked secrets, e-mail notifications for events, LDAP sign-in, issue tracker
// tickets and pull request decoration.
//
// ws.settings.integrations = {
//   smtp: { enabled, host, port, secure, user, pass, from },
//   ldap: { enabled, url, bindDn, bindPassword, baseDn, userFilter, groupMap, defaultGroups },
//   trackers: { jira: {...}, redmine: {...}, github: {...}, gitlab: {...} },
//   alm: { github: {...}, gitlab: {...}, azure: {...}, bitbucket: {...} },
//   subscriptions: [{ login, email, events, projects, lang }],
//   baseUrl: 'https://checker.example.com'   // links in mails and tickets
// }

const integrations = require('./integrations');
const users = require('./platform/users');

const MASK = '••••••••';
// (AI settings keep their own mask in core/aifix.js.)
const SECRET_KEYS = new Set(['pass', 'password', 'bindPassword', 'apiToken', 'apiKey', 'token', 'pat', 'appPassword', 'bearer']);

function config(ws) {
  return (ws.settings && ws.settings.integrations) || {};
}

function mask(value) {
  if (Array.isArray(value)) return value.map(mask);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = SECRET_KEYS.has(k) && v ? MASK : mask(v);
  return out;
}

// Keep stored secrets when the client sends the mask back unchanged.
function unmask(next, prev) {
  if (Array.isArray(next)) return next.map((v, i) => unmask(v, Array.isArray(prev) ? prev[i] : undefined));
  if (!next || typeof next !== 'object') return next;
  const out = {};
  for (const [k, v] of Object.entries(next)) {
    if (SECRET_KEYS.has(k) && v === MASK) out[k] = prev && prev[k];
    else out[k] = unmask(v, prev && prev[k]);
  }
  return out;
}

function publicConfig(ws) {
  return mask(config(ws));
}

function saveConfig(ws, incoming) {
  const merged = unmask(incoming || {}, config(ws));
  ws.settings = { ...(ws.settings || {}), integrations: merged };
  return mask(merged);
}

// ---------------------------------------------------------------------------
// Notifications

function directory(ws) {
  return ((ws.security && ws.security.users) || []).map((u) => ({ login: u.login, email: u.email, name: u.name, active: u.active !== false }));
}

/** Send `event` mail to subscribers. Never throws; returns the dispatch summary or null. */
async function notify(ws, event, ctx, opts = {}) {
  const c = config(ws);
  if (!c.smtp || !c.smtp.enabled || !c.smtp.host) return null;
  try {
    return await integrations.notify.dispatch(event, { baseUrl: c.baseUrl, ...ctx }, {
      subscriptions: c.subscriptions || [],
      users: directory(ws),
      smtpConfig: c.smtp,
      lang: (ws.settings && ws.settings.language) || 'ko',
      from: c.smtp.from,
      send: opts.send,
    });
  } catch (err) {
    return { event, sent: 0, failed: [{ error: err.message }] };
  }
}

/** Events after a committed analysis: gate change, new high-impact defects. */
function analysisEvents(project, branch, analysis, previous) {
  const events = [];
  const gate = analysis.qualityGate && analysis.qualityGate.status;
  const before = previous && previous.qualityGate && previous.qualityGate.status;
  if (before && gate && before !== gate) {
    events.push(['gate-changed', {
      project: { id: project.id, key: project.key, name: project.name }, branch,
      previousGate: before, gate,
      failedConditions: (analysis.qualityGate.conditions || []).filter((c) => c.status === 'ERROR'),
    }]);
  }
  const known = new Set(((previous && previous.issues) || []).map((i) => i.cid).filter(Boolean));
  const fresh = (analysis.issues || []).filter((i) => i.cid && i.impact === 'High' && !known.has(i.cid));
  if (previous && fresh.length) {
    events.push(['defect-high-impact', {
      project: { id: project.id, key: project.key, name: project.name }, stream: branch, snapshot: analysis.defectAnalysis && analysis.defectAnalysis.snapshot,
      defects: fresh.slice(0, 200).map((i) => ({ cid: i.cid, checker: i.checker, impact: i.impact, file: i.file, line: i.line, message: i.message, component: i.component, owner: i.componentOwner || undefined })),
    }]);
  }
  return events;
}

// ---------------------------------------------------------------------------
// LDAP sign-in: authenticate against the directory and keep a local account
// (no password) in sync, with group mapping.

async function ldapLogin(ws, login, password) {
  const c = config(ws).ldap;
  if (!c || !c.enabled || !password) return null;
  const found = await integrations.ldap.authenticate(c, login, password);
  if (!found) return null;
  users.ensureSecurity(ws);
  const sec = ws.security;
  const groups = [...new Set([...(found.mappedGroups || []), ...(c.defaultGroups || [users.USERS_GROUP])])].filter((g) => sec.groups.some((x) => x.name === g));
  let u = sec.users.find((x) => x.login === found.login || x.login === login);
  if (!u) {
    users.createUser(ws, { login: found.login || login, name: found.name || login, email: found.email || '', groups });
    u = sec.users.find((x) => x.login === (found.login || login));
  }
  if (!u.active) return null;
  u.local = false;
  u.external = 'ldap';
  u.name = found.name || u.name;
  u.email = found.email || u.email;
  if (c.syncGroups !== false) u.groups = [...new Set([...groups, ...(u.groups || []).filter((g) => g === users.ADMINS_GROUP && c.keepAdmin !== false)])];
  u.lastLogin = new Date().toISOString();
  return users.publicUser(u);
}

// ---------------------------------------------------------------------------
// Tickets and PR decoration

async function createTickets(ws, kind, issues, opts = {}) {
  const c = (config(ws).trackers || {})[kind];
  if (!c) throw Object.assign(new Error(`No ${kind} tracker is configured`), { code: 'NOT_CONFIGURED' });
  const out = [];
  for (const issue of issues) {
    const t = await integrations.tracker.createTicket(kind, c, issue, { lang: opts.lang, issueUrl: config(ws).baseUrl ? `${config(ws).baseUrl.replace(/\/+$/, '')}/#issue=${issue.key}` : undefined, transport: opts.transport });
    out.push({ issue: issue.key, ...t });
  }
  return out;
}

async function decorate(ws, provider, payload, overrides = {}) {
  const c = { ...((config(ws).alm || {})[provider] || {}), ...overrides };
  if (!Object.keys(c).length) throw Object.assign(new Error(`No ${provider} connection is configured`), { code: 'NOT_CONFIGURED' });
  return integrations.alm.postDecoration(provider, c, payload);
}

module.exports = { MASK, publicConfig, saveConfig, notify, analysisEvents, ldapLogin, createTickets, decorate, config };

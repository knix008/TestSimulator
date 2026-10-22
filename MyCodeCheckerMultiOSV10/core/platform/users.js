'use strict';

// Local users, groups and permissions like SonarQube / Coverity Connect.
// Everything lives in `ws.security` of the workspace object. Functions mutate
// that plain object in place and return the changed record; the caller saves
// the workspace. Passwords use crypto.scrypt, tokens are stored as SHA-256
// hashes (the plain token is returned once, at creation).
//
// Default: one local admin, `enabled: false`. While disabled, authorize()
// always allows, so the desktop app works without login.

const crypto = require('crypto');

const GLOBAL_PERMISSIONS = ['admin', 'gateadmin', 'profileadmin', 'scan', 'provisioning'];
const PROJECT_PERMISSIONS = ['user', 'codeviewer', 'issueadmin', 'securityhotspotadmin', 'admin', 'scan'];
/** Friendly aliases: browse = user, see-source = codeviewer, ... */
const ALIASES = {
  browse: 'user', 'see-source': 'codeviewer', seesource: 'codeviewer', 'issue-admin': 'issueadmin', 'hotspot-admin': 'securityhotspotadmin',
  'security-hotspot-admin': 'securityhotspotadmin', 'gate-admin': 'gateadmin', 'profile-admin': 'profileadmin', provision: 'provisioning',
};
const ANYONE = 'Anyone';
const USERS_GROUP = 'users';
const ADMINS_GROUP = 'administrators';
const TOKEN_PREFIX = { USER: 'mcu_', PROJECT_ANALYSIS: 'mcp_', GLOBAL_ANALYSIS: 'mca_' };
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function perm(p) {
  const k = String(p || '').toLowerCase();
  return ALIASES[k] || k;
}

function now() { return new Date().toISOString(); }

/** A fresh security section. */
function freshSecurity() {
  return {
    enabled: false,
    users: [{ login: 'admin', name: 'Administrator', email: '', active: true, local: true, groups: [ADMINS_GROUP, USERS_GROUP], password: null, createdAt: now(), lastLogin: null }],
    groups: [
      { name: ADMINS_GROUP, description: 'System administrators', default: false },
      { name: USERS_GROUP, description: 'Every authenticated user', default: true },
    ],
    global: {
      admin: { users: [], groups: [ADMINS_GROUP] },
      gateadmin: { users: [], groups: [ADMINS_GROUP] },
      profileadmin: { users: [], groups: [ADMINS_GROUP] },
      scan: { users: [], groups: [ADMINS_GROUP, USERS_GROUP] },
      provisioning: { users: [], groups: [ADMINS_GROUP, USERS_GROUP] },
    },
    projects: {},
    templates: [{
      id: 'default-template', name: 'Default template', description: 'Applied to new projects', projectKeyPattern: '', isDefault: true,
      permissions: {
        user: { users: [], groups: [ANYONE] }, codeviewer: { users: [], groups: [ANYONE] },
        issueadmin: { users: [], groups: [ADMINS_GROUP] }, securityhotspotadmin: { users: [], groups: [ADMINS_GROUP] },
        admin: { users: [], groups: [ADMINS_GROUP] }, scan: { users: [], groups: [ADMINS_GROUP, USERS_GROUP] },
      },
    }],
    tokens: [],
  };
}

/** Ensure ws.security exists and has every part. Returns ws.security. */
function ensureSecurity(ws) {
  const fresh = freshSecurity();
  const s = ws.security || {};
  ws.security = {
    ...fresh, ...s,
    users: s.users && s.users.length ? s.users : fresh.users,
    groups: s.groups && s.groups.length ? s.groups : fresh.groups,
    global: { ...fresh.global, ...(s.global || {}) },
    projects: s.projects || {},
    templates: s.templates && s.templates.length ? s.templates : fresh.templates,
    tokens: s.tokens || [],
  };
  return ws.security;
}

// ---------------------------------------------------------------------------
// Passwords

/** scrypt hash string: scrypt$N$r$p$saltB64$hashB64 */
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

/** Check a password against a hashPassword() string (constant time). */
function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, hashB64] = parts;
  const want = Buffer.from(hashB64, 'base64');
  let got;
  try { got = crypto.scryptSync(String(password), Buffer.from(saltB64, 'base64'), want.length, { N: Number(N), r: Number(r), p: Number(p) }); } catch { return false; }
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

// ---------------------------------------------------------------------------
// Users and groups

function publicUser(u) {
  if (!u) return null;
  const { password, ...rest } = u;
  return { ...rest, hasPassword: !!password };
}

function findUser(ws, login) {
  return ensureSecurity(ws).users.find((u) => u.login === login) || null;
}

/** Create a user. Throws when the login is taken or invalid. */
function createUser(ws, { login, name, email = '', password = null, groups = [] } = {}) {
  const sec = ensureSecurity(ws);
  if (!/^[A-Za-z0-9._@-]{2,255}$/.test(String(login || ''))) throw new Error('Login must be 2-255 letters, digits, . _ @ -');
  if (sec.users.some((u) => u.login === login)) throw new Error(`User already exists: ${login}`);
  const defaults = sec.groups.filter((g) => g.default).map((g) => g.name);
  const user = {
    login, name: name || login, email, active: true, local: true,
    groups: [...new Set([...defaults, ...groups.filter((g) => sec.groups.some((x) => x.name === g))])],
    password: password ? hashPassword(password) : null, createdAt: now(), lastLogin: null,
  };
  sec.users.push(user);
  return publicUser(user);
}

/** Update name/email/active. */
function updateUser(ws, login, patch = {}) {
  const u = findUser(ws, login);
  if (!u) throw new Error(`No such user: ${login}`);
  for (const k of ['name', 'email', 'active']) if (patch[k] !== undefined) u[k] = k === 'active' ? !!patch[k] : String(patch[k]);
  return publicUser(u);
}

/** Deactivate a user, revoke their tokens and remove direct permissions. The last active admin cannot be deactivated. */
function deactivateUser(ws, login) {
  const sec = ensureSecurity(ws);
  const u = findUser(ws, login);
  if (!u) throw new Error(`No such user: ${login}`);
  const admins = sec.users.filter((x) => x.active && hasGlobal(ws, x.login, 'admin'));
  if (admins.length === 1 && admins[0].login === login) throw new Error('Cannot deactivate the last administrator');
  u.active = false;
  sec.tokens = sec.tokens.filter((t) => t.login !== login);
  for (const entry of Object.values(sec.global)) entry.users = entry.users.filter((x) => x !== login);
  for (const proj of Object.values(sec.projects)) for (const entry of Object.values(proj)) entry.users = entry.users.filter((x) => x !== login);
  return publicUser(u);
}

/** Set (or clear with null) a user's password. */
function setPassword(ws, login, password) {
  const u = findUser(ws, login);
  if (!u) throw new Error(`No such user: ${login}`);
  if (password != null && String(password).length < 8) throw new Error('Password must be at least 8 characters');
  u.password = password == null ? null : hashPassword(password);
  return publicUser(u);
}

/** Log in with a password. Returns the public user or null. */
function authenticate(ws, login, password) {
  const u = findUser(ws, login);
  if (!u || !u.active || !u.password) return null;
  if (!verifyPassword(password, u.password)) return null;
  u.lastLogin = now();
  return publicUser(u);
}

function createGroup(ws, { name, description = '' } = {}) {
  const sec = ensureSecurity(ws);
  if (!name || name === ANYONE) throw new Error('Invalid group name');
  if (sec.groups.some((g) => g.name === name)) throw new Error(`Group already exists: ${name}`);
  const g = { name, description, default: false };
  sec.groups.push(g);
  return g;
}

function deleteGroup(ws, name) {
  const sec = ensureSecurity(ws);
  if (name === ADMINS_GROUP || name === USERS_GROUP) throw new Error('Built-in groups cannot be deleted');
  sec.groups = sec.groups.filter((g) => g.name !== name);
  for (const u of sec.users) u.groups = u.groups.filter((g) => g !== name);
  for (const entry of Object.values(sec.global)) entry.groups = entry.groups.filter((g) => g !== name);
  for (const proj of Object.values(sec.projects)) for (const entry of Object.values(proj)) entry.groups = entry.groups.filter((g) => g !== name);
  return true;
}

function addMember(ws, group, login) {
  const sec = ensureSecurity(ws);
  const u = findUser(ws, login);
  if (!u || !sec.groups.some((g) => g.name === group)) throw new Error('No such user or group');
  if (!u.groups.includes(group)) u.groups.push(group);
  return publicUser(u);
}

function removeMember(ws, group, login) {
  const u = findUser(ws, login);
  if (!u) throw new Error(`No such user: ${login}`);
  u.groups = u.groups.filter((g) => g !== group);
  return publicUser(u);
}

// ---------------------------------------------------------------------------
// Permissions

function entryOf(map, p) {
  return map[p] || (map[p] = { users: [], groups: [] });
}

function checkPerm(p, list) {
  const k = perm(p);
  if (!list.includes(k)) throw new Error(`Unknown permission: ${p}`);
  return k;
}

/** Grant a global permission to { user } or { group }. */
function grantGlobal(ws, permission, { user, group } = {}) {
  const sec = ensureSecurity(ws);
  const e = entryOf(sec.global, checkPerm(permission, GLOBAL_PERMISSIONS));
  if (user && !e.users.includes(user)) e.users.push(user);
  if (group && !e.groups.includes(group)) e.groups.push(group);
  return e;
}

function revokeGlobal(ws, permission, { user, group } = {}) {
  const sec = ensureSecurity(ws);
  const e = entryOf(sec.global, checkPerm(permission, GLOBAL_PERMISSIONS));
  if (user) e.users = e.users.filter((x) => x !== user);
  if (group) e.groups = e.groups.filter((x) => x !== group);
  return e;
}

/** Grant a project permission. */
function grantProject(ws, projectId, permission, { user, group } = {}) {
  const sec = ensureSecurity(ws);
  const proj = sec.projects[projectId] || (sec.projects[projectId] = {});
  const e = entryOf(proj, checkPerm(permission, PROJECT_PERMISSIONS));
  if (user && !e.users.includes(user)) e.users.push(user);
  if (group && !e.groups.includes(group)) e.groups.push(group);
  return e;
}

function revokeProject(ws, projectId, permission, { user, group } = {}) {
  const sec = ensureSecurity(ws);
  const proj = sec.projects[projectId] || (sec.projects[projectId] = {});
  const e = entryOf(proj, checkPerm(permission, PROJECT_PERMISSIONS));
  if (user) e.users = e.users.filter((x) => x !== user);
  if (group) e.groups = e.groups.filter((x) => x !== group);
  return e;
}

function matches(entry, user) {
  if (!entry) return false;
  if (entry.groups.includes(ANYONE)) return true;
  if (!user) return false;
  return entry.users.includes(user.login) || entry.groups.some((g) => user.groups.includes(g));
}

function hasGlobal(ws, login, p) {
  const sec = ensureSecurity(ws);
  const u = sec.users.find((x) => x.login === login && x.active);
  return matches(sec.global[perm(p)], u);
}

/**
 * Can `login` do `permission` (on `projectId` for project permissions)?
 * Disabled security allows everything. Global admin allows everything.
 * Project 'admin' implies all project permissions on that project. A project
 * with no permission entries falls back to the default template.
 * Anonymous access: pass login null; only grants to 'Anyone' apply.
 * @returns {boolean}
 */
function authorize(ws, login, permission, projectId = null) {
  const sec = ensureSecurity(ws);
  if (!sec.enabled) return true;
  const p = perm(permission);
  const u = login ? sec.users.find((x) => x.login === login && x.active) || null : null;
  if (login && !u) return false;
  if (matches(sec.global.admin, u)) return true;
  if (!projectId) return GLOBAL_PERMISSIONS.includes(p) && matches(sec.global[p], u);
  const proj = effectiveProjectPermissions(ws, projectId);
  if (matches(proj.admin, u)) return true;
  if (p === 'scan' && matches(sec.global.scan, u)) return true;
  if (!PROJECT_PERMISSIONS.includes(p)) return GLOBAL_PERMISSIONS.includes(p) && matches(sec.global[p], u);
  return matches(proj[p], u);
}

/** Project permissions, falling back to the default template when none are set. */
function effectiveProjectPermissions(ws, projectId) {
  const sec = ensureSecurity(ws);
  const own = sec.projects[projectId];
  if (own && Object.keys(own).length) return own;
  const tpl = sec.templates.find((t) => t.isDefault) || sec.templates[0];
  return (tpl && tpl.permissions) || {};
}

/** All permissions a user has (global list, and project list when projectId is given). */
function permissionsOf(ws, login, projectId = null) {
  return {
    global: GLOBAL_PERMISSIONS.filter((p) => authorize(ws, login, p)),
    project: projectId ? PROJECT_PERMISSIONS.filter((p) => authorize(ws, login, p, projectId)) : [],
  };
}

// ---------------------------------------------------------------------------
// Permission templates

function createTemplate(ws, { name, description = '', projectKeyPattern = '', permissions = {} } = {}) {
  const sec = ensureSecurity(ws);
  if (!name) throw new Error('Template name is required');
  if (projectKeyPattern) { try { new RegExp(projectKeyPattern); } catch { throw new Error('Project key pattern is not a valid regular expression'); } }
  const perms = {};
  for (const [p, e] of Object.entries(permissions)) perms[checkPerm(p, PROJECT_PERMISSIONS)] = { users: [...(e.users || [])], groups: [...(e.groups || [])] };
  const tpl = { id: `tpl-${crypto.randomBytes(5).toString('hex')}`, name, description, projectKeyPattern, isDefault: false, permissions: perms };
  sec.templates.push(tpl);
  return tpl;
}

/** Make a template the default. */
function setDefaultTemplate(ws, templateId) {
  const sec = ensureSecurity(ws);
  if (!sec.templates.some((t) => t.id === templateId)) throw new Error('No such template');
  for (const t of sec.templates) t.isDefault = t.id === templateId;
  return true;
}

/** Template for a new project key: first whose key pattern matches, else the default. */
function templateFor(ws, projectKey) {
  const sec = ensureSecurity(ws);
  const hit = sec.templates.find((t) => t.projectKeyPattern && new RegExp(t.projectKeyPattern).test(projectKey || ''));
  return hit || sec.templates.find((t) => t.isDefault) || sec.templates[0];
}

/** Copy a template's permissions onto a project (replacing what it had). */
function applyTemplate(ws, templateId, projectId) {
  const sec = ensureSecurity(ws);
  const tpl = sec.templates.find((t) => t.id === templateId);
  if (!tpl) throw new Error('No such template');
  const copy = {};
  for (const [p, e] of Object.entries(tpl.permissions)) copy[p] = { users: [...e.users], groups: [...e.groups] };
  sec.projects[projectId] = copy;
  return copy;
}

// ---------------------------------------------------------------------------
// Tokens

function sha256(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }

/**
 * Generate a token. The plain value is returned once; only its hash is stored.
 * @param {{login:string, name:string, type?:'USER'|'PROJECT_ANALYSIS'|'GLOBAL_ANALYSIS', projectId?:string, expiresAt?:string}} args
 * @returns {{token:string, record:object}}
 */
function generateToken(ws, { login, name, type = 'USER', projectId = null, expiresAt = null } = {}) {
  const sec = ensureSecurity(ws);
  const u = findUser(ws, login);
  if (!u || !u.active) throw new Error(`No such active user: ${login}`);
  if (!TOKEN_PREFIX[type]) throw new Error(`Unknown token type: ${type}`);
  if (type === 'PROJECT_ANALYSIS' && !projectId) throw new Error('A project analysis token needs a project');
  if (!name) throw new Error('Token name is required');
  if (sec.tokens.some((t) => t.login === login && t.name === name)) throw new Error(`Token name already used: ${name}`);
  const token = `${TOKEN_PREFIX[type]}${crypto.randomBytes(20).toString('hex')}`;
  const record = { id: `tok-${crypto.randomBytes(5).toString('hex')}`, login, name, type, projectId, hash: sha256(token), createdAt: now(), expiresAt, lastUsedAt: null };
  sec.tokens.push(record);
  const { hash, ...pub } = record;
  return { token, record: pub };
}

/**
 * Resolve a plain token. Returns { login, type, projectId, name } or null
 * (unknown, expired, or owner inactive). Updates lastUsedAt.
 */
function verifyToken(ws, token, at = Date.now()) {
  const sec = ensureSecurity(ws);
  const h = sha256(token);
  const rec = sec.tokens.find((t) => {
    const a = Buffer.from(t.hash, 'hex');
    const b = Buffer.from(h, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
  if (!rec) return null;
  if (rec.expiresAt && Date.parse(rec.expiresAt) < at) return null;
  const u = findUser(ws, rec.login);
  if (!u || !u.active) return null;
  rec.lastUsedAt = new Date(at).toISOString();
  return { login: rec.login, type: rec.type, projectId: rec.projectId, name: rec.name };
}

/**
 * authorize() for a token: analysis tokens only carry 'scan' (project tokens on their project only).
 */
function authorizeToken(ws, token, permission, projectId = null) {
  const sec = ensureSecurity(ws);
  if (!sec.enabled) return true;
  const t = verifyToken(ws, token);
  if (!t) return false;
  if (t.type !== 'USER') {
    if (perm(permission) !== 'scan') return false;
    if (t.type === 'PROJECT_ANALYSIS' && t.projectId !== projectId) return false;
  }
  return authorize(ws, t.login, permission, projectId);
}

function listTokens(ws, login) {
  return ensureSecurity(ws).tokens.filter((t) => !login || t.login === login).map(({ hash, ...rest }) => rest);
}

function revokeToken(ws, login, name) {
  const sec = ensureSecurity(ws);
  const before = sec.tokens.length;
  sec.tokens = sec.tokens.filter((t) => !(t.login === login && t.name === name));
  return sec.tokens.length < before;
}

/** Turn permission checking on/off. Turning it on requires an active admin with a password. */
function setEnabled(ws, enabled) {
  const sec = ensureSecurity(ws);
  if (enabled && !sec.users.some((u) => u.active && u.password && matches(sec.global.admin, u))) {
    throw new Error('Set a password for an administrator before enabling permissions');
  }
  sec.enabled = !!enabled;
  return sec.enabled;
}

/** The security section without password or token hashes (for the UI). */
function publicSecurity(ws) {
  const sec = ensureSecurity(ws);
  return { ...sec, users: sec.users.map(publicUser), tokens: listTokens(ws) };
}

module.exports = {
  GLOBAL_PERMISSIONS, PROJECT_PERMISSIONS, ANYONE, USERS_GROUP, ADMINS_GROUP, TOKEN_PREFIX,
  freshSecurity, ensureSecurity, hashPassword, verifyPassword, publicUser, findUser, createUser, updateUser, deactivateUser,
  setPassword, authenticate, createGroup, deleteGroup, addMember, removeMember, grantGlobal, revokeGlobal, grantProject,
  revokeProject, authorize, effectiveProjectPermissions, permissionsOf, createTemplate, setDefaultTemplate, templateFor,
  applyTemplate, generateToken, verifyToken, authorizeToken, listTokens, revokeToken, setEnabled, publicSecurity,
};

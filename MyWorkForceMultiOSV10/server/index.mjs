import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isWorkspaceAdmin } from '../src/domain/permissions.js';
import { createLockout, lockPolicy } from '../src/domain/signin-lock.js';
import { ensureAdmin, updateProfile, upgradeWorkspace, userByAccount } from '../src/domain/store.js';
import { checkMessage, inviteMembers, listMessages, listRooms, noticeTarget, openRoom, postFile, postMessage, readFile } from './chat.mjs';
import { createDatabase, inspectSchema, openEngine, tlsState } from './engine.mjs';
import { createLive } from './live.mjs';
import { readAudit, workspaceChanges, writeAudit } from './audit.mjs';
import { checkPassword, hashPassword, keyState, openRepository } from './repository.mjs';
import { keyFingerprint, keyFor, openValue, parseKey, rememberKeyFor } from './privacy.mjs';
import { schemaScript } from './schema.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function argument(name) {
  const at = process.argv.indexOf(name);
  return at > 0 ? process.argv[at + 1] || '' : '';
}
// The installed app passes its own data folder (the program folder is not the place for the database).
const dataDir = path.resolve(argument('--data') || process.env.MYWORKFORCE_DATA_DIR || path.join(root, 'data'));
const configPath = path.join(dataDir, 'connection.json');
const port = Number(process.env.MYWORKFORCE_DATA_PORT || 1481);
const host = process.env.MYWORKFORCE_DATA_HOST || '0.0.0.0';
const sessionsPath = path.join(dataDir, 'sessions.json');
function loadSessions() {
  try { return new Map(Object.entries(JSON.parse(readFileSync(sessionsPath, 'utf8')))); }
  catch { return new Map(); }
}
function storeSessions() {
  try {
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(sessionsPath, JSON.stringify(Object.fromEntries(sessions)));
  } catch { /* a restart asks for the password again */ }
}
const sessions = loadSessions();

// Failed sign-ins in a row, per account. Kept in a file so restarting the program does not lift a lock.
const lockoutsPath = path.join(dataDir, 'lockouts.json');
const lockout = createLockout((() => { try { return JSON.parse(readFileSync(lockoutsPath, 'utf8')); } catch { return {}; } })());
function storeLockouts() {
  try {
    lockout.prune();
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(lockoutsPath, JSON.stringify(lockout.entries));
  } catch { /* the count lives on in memory */ }
}
function lockedReply(res, until, policy) {
  const seconds = Math.max(1, Math.ceil((until - Date.now()) / 1000));
  res.setHeader('retry-after', String(seconds));
  return send(res, 429, { error: 'locked', until, seconds, attempts: policy.attempts, minutes: policy.minutes });
}

let repository = null;
// Pages being written together; tied to the open database.
let live = null;

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 32_000_000) { reject(new Error('too-large')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) return resolve({});
      try { resolve(JSON.parse(text)); } catch { reject(new Error('file-invalid')); }
    });
    req.on('error', reject);
  });
}

function publicConfig(config) {
  return {
    engine: config.engine, host: config.host || '', port: config.port || '', database: config.database || '', user: config.user || '', file: config.file || '',
    tls: config.tls !== false, tlsVerify: Boolean(config.tlsVerify),
  };
}

function savedConfig() {
  try { return JSON.parse(readFileSync(configPath, 'utf8')); } catch { return null; }
}

function remember(config) {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(configPath, JSON.stringify(publicConfig({ ...config, file: config.file }), null, 2));
  if (config.password) writeFileSync(path.join(dataDir, 'secret.json'), JSON.stringify({ password: config.password }));
}

/** A connection as the engine needs it: the saved password when none is typed, the default SQLite file. */
function fullConfig(config) {
  const secret = (() => { try { return JSON.parse(readFileSync(path.join(dataDir, 'secret.json'), 'utf8')).password || ''; } catch { return ''; } })();
  const engine = config.engine || 'sqlite';
  return {
    engine,
    host: config.host || '127.0.0.1',
    port: config.port,
    database: config.database || '',
    user: config.user || '',
    password: config.password || (engine === 'sqlite' ? '' : secret),
    // A database on its own server is reached over TLS unless the administrator turns it off.
    tls: config.tls !== false,
    tlsVerify: Boolean(config.tlsVerify),
    encrypt: config.tls !== false,
    file: config.file || path.join(dataDir, 'myworkforce.sqlite'),
    dataDir,
  };
}

/** The key for a database: one the administrator imported for it, or this data service's own. */
function databaseKey(next, typed) {
  if (typed) return parseKey(typed);
  return keyFor(dataDir, storeKey(next));
}

async function connect(config) {
  const secret = (() => { try { return JSON.parse(readFileSync(path.join(dataDir, 'secret.json'), 'utf8')).password || ''; } catch { return ''; } })();
  const typedKey = String(config.encryptionKey || '').trim();
  const next = {
    engine: config.engine || 'sqlite',
    host: config.host || '127.0.0.1',
    port: config.port,
    database: config.database || '',
    user: config.user || '',
    password: config.password || secret,
    tls: config.tls !== false,
    tlsVerify: Boolean(config.tlsVerify),
    encrypt: config.tls !== false,
    file: config.file || path.join(dataDir, 'myworkforce.sqlite'),
    dataDir,
  };
  next.privacyKey = databaseKey(next, typedKey);
  if (next.engine === 'sqlite') mkdirSync(dataDir, { recursive: true });
  let opened;
  let createdDatabase = false;
  try {
    opened = await openRepository(next);
  } catch (error) {
    if (error?.message !== 'database-missing' || !config.createDatabase) throw error;
    createdDatabase = await createDatabase(next);
    opened = await openRepository(next);
  }
  // A key the administrator brought from another data service is kept for this database.
  if (typedKey) rememberKeyFor(dataDir, storeKey(next), next.privacyKey);
  await seedAdmin(opened);
  // A session names a person in one database; another database has other people.
  const moved = Boolean(repository) && storeKey(repository.config) !== storeKey(next);
  if (moved) {
    sessions.clear();
    storeSessions();
  }
  if (live) await live.flush().catch(() => {});
  if (repository) await repository.close().catch(() => {});
  repository = opened;
  live = createLive(opened);
  remember({ ...next, privacyKey: undefined });
  opened.lastConnect = { createdDatabase, sessionsReset: moved, ...(opened.engine.schemaChanges || {}) };
  return opened;
}

function storeKey(config) {
  return [config.engine, config.host, config.port, config.database, config.engine === 'sqlite' ? path.resolve(config.file || '') : ''].join('|').toLowerCase();
}

/**
 * Who may choose or try a database: the administrator. Before any database is connected nobody can sign in
 * (the accounts live in it), so then only the computer the data service runs on may set it up.
 */
function mayConfigure(req) {
  if (repository) return Boolean(signedAdmin(req));
  return loopback(req) || Boolean(signedAdmin(req));
}

/** Writes one audit event against the open database. */
function audit(req, action, { actor, targetId = '', detail = {} } = {}) {
  if (!repository) return Promise.resolve(null);
  const who = actor === undefined ? signedUser(req) : actor;
  const source = req ? `${req.socket?.remoteAddress || ''}${req.headers?.['user-agent'] ? ` · ${String(req.headers['user-agent']).slice(0, 120)}` : ''}` : 'MyWorkForce';
  return writeAudit(repository.engine, repository.privacyKey, { action, actor: who ? { id: who.id, login: who.login || '' } : null, targetId, detail, source });
}

function signedAdmin(req) {
  const user = signedUser(req);
  // An administrator still on a given password acts as an administrator only after changing it.
  return isWorkspaceAdmin(user) && !user.mustChangePassword ? user : null;
}

// A fresh database has no workspace, so nobody could sign in to create one.
// The server seeds the administrator account itself.
/** "sqlite · C:/…/myworkforce.sqlite" or "postgres · db.example.com:5432/work" — a database in words for the log. */
function describeStore(config) {
  if (!config) return '';
  if (config.engine === 'sqlite') return `sqlite · ${config.file || ''}`;
  return `${config.engine} · ${config.host || ''}${config.port ? `:${config.port}` : ''}/${config.database || ''}`;
}

async function seedAdmin(repo) {
  if (!repo.cached) {
    await repo.writeWorkspace(upgradeWorkspace({}));
    const first = (repo.cached?.users || []).find((user) => isWorkspaceAdmin(user));
    if (first) await writeAudit(repo.engine, repo.privacyKey, { action: 'admin-seed', actor: null, targetId: first.id, detail: { login: first.login || '' }, source: 'MyWorkForce' });
  }
  else if (ensureAdmin(repo.cached)) await repo.writeWorkspace(repo.cached);
  // An administrator still on the first password "admin" must choose another at the next sign-in.
  let changed = false;
  for (const admin of (repo.cached?.users || []).filter((user) => isWorkspaceAdmin(user))) {
    if (!admin.mustChangePassword && admin.passwordHash && checkPassword('admin', admin.passwordHash)) {
      admin.mustChangePassword = true;
      changed = true;
    }
  }
  if (changed) await repo.writeWorkspace(repo.cached);
}

/** A password people may choose: 6 to 128 characters, not only spaces. */
function passwordProblem(password) {
  const text = String(password || '');
  if (text.trim().length < 6 || text.length > 128) return 'password-weak';
  return '';
}

function sessionUser(user) {
  return { id: user.id, name: user.name || '', login: user.login || '', email: user.email || '', mustChangePassword: Boolean(user.mustChangePassword) };
}

function tokenOf(req) {
  return String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
}

function loopback(req) {
  const address = req.socket?.remoteAddress || '';
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function sessionOf(req) {
  const token = tokenOf(req);
  return token ? sessions.get(token) || null : null;
}

function signedUser(req) {
  const session = sessionOf(req);
  if (!session) return null;
  return (repository?.cached?.users || []).find((user) => user.id === session.userId && user.active !== false) || null;
}

function publicPerson(user, withPhoto = false) {
  return {
    id: user.id,
    name: user.name || user.login || user.id,
    login: user.login || '',
    email: user.email || '',
    phone: user.phone || '',
    jobTitle: user.jobTitle || '',
    team: user.team || '',
    photo: withPhoto ? (user.photo || '') : '',
    hasPhoto: Boolean(user.photo),
    admin: isWorkspaceAdmin(user),
    // The teams this person belongs to (Company → Teams), for Talk's people list.
    teams: (repository?.cached?.teams || [])
      .filter((item) => item.leadId === user.id || (item.members || []).some((member) => member.userId === user.id))
      .map((item) => ({ id: item.id, name: item.name, lead: item.leadId === user.id || (item.members || []).some((member) => member.userId === user.id && member.role === 'lead') })),
  };
}

function peopleOf() {
  return (repository?.cached?.users || [])
    .filter((user) => user.active !== false)
    .map((user) => publicPerson(user));
}

function publicWorkspace(ws) {
  if (!ws) return null;
  const copy = structuredClone(ws);
  for (const user of copy.users || []) {
    user.hasPassword = Boolean(user.passwordHash);
    delete user.passwordHash;
  }
  if (copy.mail && typeof copy.mail === 'object') {
    copy.mail.hasPassword = Boolean(copy.mail.password);
    delete copy.mail.password;
  }
  return copy;
}

function allowed(req) {
  const tokens = repository?.cached?.apiTokens || [];
  if (!tokens.length) return false;
  const token = tokenOf(req);
  return tokens.some((item) => item.token === token);
}

/** A row with its sealed columns opened (column names as the driver gives them, in any case). */
function opened(record, columns) {
  const out = {};
  for (const [name, value] of Object.entries(record || {})) {
    const lower = name.toLowerCase();
    out[lower] = columns.includes(lower) && typeof value === 'string' ? openValue(value, repository.privacyKey) : value;
  }
  return out;
}

/**
 * Tries a connection without switching to it: can it connect, is it encrypted on the wire, are the tables
 * there (or will they be made at the first connection), and does this data service hold the database's key.
 */
async function testConnection(config) {
  const next = fullConfig(config);
  const started = Date.now();
  const report = { ok: false, engine: next.engine, database: next.engine === 'sqlite' ? next.file : next.database, host: next.engine === 'sqlite' ? '' : next.host };
  let key;
  try { key = databaseKey(next, String(config.encryptionKey || '').trim()); }
  catch (error) { return { ...report, error: error.message }; }
  let engine;
  try {
    engine = await openEngine({ ...next, schema: false });
  } catch (error) {
    return { ...report, error: error?.message || 'connect', detail: error?.detail || '', ms: Date.now() - started, canCreate: error?.message === 'database-missing' };
  }
  try {
    report.ok = true;
    report.ms = Date.now() - started;
    report.tls = next.engine === 'sqlite' ? null : await tlsState(engine);
    const schema = await inspectSchema(engine);
    report.schema = { version: schema.version, expected: schema.expected, ready: schema.ready, newer: schema.newer, missing: schema.missing, pending: schema.pending.map((step) => step.version) };
    report.key = { state: await keyState(engine, key), fingerprint: keyFingerprint(key) };
    report.current = Boolean(repository) && storeKey(repository.config) === storeKey(next);
  } catch (error) {
    report.ok = false;
    report.error = error?.message || 'connect';
    report.detail = error?.detail || '';
  } finally {
    await engine.close().catch(() => {});
  }
  return report;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  if (req.method === 'OPTIONS') return send(res, 204, {});
  try {
    if (req.method === 'GET' && url.pathname === '/api/status') {
      const saved = savedConfig();
      if (!signedUser(req)) {
        // Signed out: whether the service answers and has a database, nothing about the database itself.
        return send(res, 200, { company: true, listening: true, connected: Boolean(repository), setup: !repository && loopback(req), locked: true });
      }
      return send(res, 200, {
        company: true,
        adminApp: 'later',
        listening: true,
        connected: Boolean(repository),
        engine: repository?.engine.engine || saved?.engine || 'sqlite',
        database: repository?.config.database || repository?.config.file || saved?.file || '',
        host: repository?.config.host || saved?.host || '',
        saved: saved ? publicConfig(saved) : null,
        locked: Boolean(repository?.cached?.users?.some((user) => user.passwordHash)),
        revision: Number(repository?.cached?.revision) || 0,
        encryption: repository ? { algorithm: 'AES-256-GCM', fingerprint: repository.keyFingerprint || keyFingerprint(repository.privacyKey) } : null,
        schema: repository ? await repository.schemaStatus().then((item) => ({ version: item.version, expected: item.expected, ready: item.ready })).catch(() => null) : null,
      });
    }
    if (req.method === 'GET' && url.pathname === '/api/schema/sql') {
      if (!mayConfigure(req)) return send(res, 403, { error: 'permission' });
      const engine = url.searchParams.get('engine') || repository?.engine.engine || 'sqlite';
      if (!['sqlite', 'mysql', 'mariadb', 'mssql', 'postgres'].includes(engine)) return send(res, 400, { error: 'engine-unknown' });
      return send(res, 200, { engine, sql: schemaScript(engine) });
    }
    if (req.method === 'POST' && url.pathname === '/api/connect') {
      const body = await readBody(req);
      // Already connected to that very database: nothing to change, any signed-in person may ask.
      if (repository && sessionOf(req) && (!body.engine || storeKey(repository.config) === storeKey(fullConfig(body)))) {
        return send(res, 200, { ...repository.describe(), schema: await repository.schemaStatus() });
      }
      if (!mayConfigure(req)) return send(res, 403, { error: 'permission' });
      // No database named: the one this service was set up with (never silently a different one).
      const by = signedAdmin(req);
      const from = repository ? describeStore(repository.config) : '';
      await connect(body.engine ? body : (savedConfig() || { engine: 'sqlite' }));
      // Logged in the database now open (a new one starts its log with how it was reached).
      await audit(req, 'database-connect', { actor: by || null, detail: { from, to: describeStore(repository.config), created: Boolean(repository.lastConnect?.createdDatabase), firstSetup: !by, tls: repository.config.engine === 'sqlite' ? null : repository.config.tls !== false } });
      return send(res, 200, { ...repository.describe(), ...repository.lastConnect, schema: await repository.schemaStatus() });
    }
    if (req.method === 'POST' && url.pathname === '/api/connect/test') {
      if (!mayConfigure(req)) return send(res, 403, { error: 'permission' });
      const body = await readBody(req);
      return send(res, 200, await testConnection(body.engine ? body : { engine: 'sqlite' }));
    }
    if (req.method === 'POST' && url.pathname === '/api/disconnect') {
      if (!signedAdmin(req)) return send(res, 403, { error: 'permission' });
      if (repository) await repository.close().catch(() => {});
      repository = null;
      return send(res, 200, { connected: false, company: true });
    }
    if (!repository) return send(res, 409, { error: 'connect', detail: 'Connect a database first.' });
    if (url.pathname === '/api/schema' && (req.method === 'GET' || req.method === 'POST')) {
      if (!signedAdmin(req)) return send(res, 403, { error: 'permission' });
      if (req.method === 'GET') return send(res, 200, await repository.schemaStatus());
      const body = await readBody(req);
      if (body.action !== 'upgrade') return send(res, 400, { error: 'schema-action' });
      return send(res, 200, await repository.upgradeSchema());
    }
    if (req.method === 'POST' && url.pathname === '/api/session') {
      const body = await readBody(req);
      const policy = lockPolicy(repository.cached);
      const held = lockout.check(body.account);
      // A locked account waits even with the right password.
      if (held.locked) {
        await audit(req, 'signin-locked', { actor: null, detail: { account: String(body.account || ''), until: new Date(held.until).toISOString(), refused: true } });
        return lockedReply(res, held.until, policy);
      }
      const user = userByAccount(repository.cached?.users || [], body.account);
      const problem = !user || user.active === false ? 'not-registered'
        : user.passwordHash && !checkPassword(body.password || '', user.passwordHash) ? 'password' : '';
      if (problem) {
        const counted = lockout.fail(body.account, policy);
        storeLockouts();
        await audit(req, 'signin-failed', { actor: null, targetId: user?.id || '', detail: { account: String(body.account || ''), reason: problem, remaining: counted.remaining } });
        if (counted.locked) {
          await audit(req, 'signin-locked', { actor: null, targetId: user?.id || '', detail: { account: String(body.account || ''), until: new Date(counted.until).toISOString(), minutes: policy.minutes } });
          return lockedReply(res, counted.until, policy);
        }
        return send(res, 403, { error: problem, remaining: counted.remaining, attempts: policy.attempts, minutes: policy.minutes });
      }
      if (lockout.check(body.account).fails) { lockout.succeed(body.account); storeLockouts(); }
      const token = randomBytes(24).toString('hex');
      sessions.set(token, { userId: user.id, login: user.login || '' });
      storeSessions();
      await audit(req, 'signin', { actor: user, targetId: user.id });
      return send(res, 200, { token, user: sessionUser(user) });
    }
    if (req.method === 'GET' && url.pathname === '/api/session') {
      const user = signedUser(req);
      if (!user) return send(res, 401, { error: 'permission' });
      return send(res, 200, { user: sessionUser(user) });
    }
    if (req.method === 'DELETE' && url.pathname === '/api/session') {
      const leaving = signedUser(req);
      if (leaving) await audit(req, 'signout', { actor: leaving, targetId: leaving.id });
      sessions.delete(tokenOf(req));
      storeSessions();
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/account/password') {
      // A person changes their own password (and must, at the first sign-in after one was given to them).
      const me = signedUser(req);
      if (!me) return send(res, 401, { error: 'permission' });
      const body = await readBody(req);
      if (me.passwordHash && !checkPassword(body.current || '', me.passwordHash)) return send(res, 403, { error: 'password' });
      const problem = passwordProblem(body.next);
      if (problem) return send(res, 400, { error: problem });
      if (String(body.next) === String(body.current || '')) return send(res, 400, { error: 'password-same' });
      await repository.setPassword(me.id, String(body.next), false);
      await audit(req, 'password-change', { actor: me, targetId: me.id, detail: { login: me.login || '', first: Boolean(me.mustChangePassword) } });
      return send(res, 200, { ok: true, revision: repository.cached?.revision || 0, user: sessionUser(me) });
    }
    if (req.method === 'POST' && url.pathname === '/api/users/password') {
      // The administrator gives someone a password; they choose their own at the next sign-in.
      if (!signedAdmin(req)) return send(res, 403, { error: 'permission' });
      const body = await readBody(req);
      const problem = passwordProblem(body.password);
      if (problem) return send(res, 400, { error: problem });
      const user = await repository.setPassword(String(body.userId || ''), String(body.password), body.mustChange !== false);
      await audit(req, 'password-set', { targetId: user.id, detail: { login: user.login || '', mustChange: Boolean(user.mustChangePassword) } });
      return send(res, 200, { ok: true, revision: repository.cached?.revision || 0, userId: user.id, mustChangePassword: Boolean(user.mustChangePassword) });
    }
    if (req.method === 'GET' && url.pathname === '/api/encryption') {
      if (!signedAdmin(req)) return send(res, 403, { error: 'permission' });
      const key = repository.privacyKey;
      if (url.searchParams.get('reveal') === '1') await audit(req, 'encryption-key-view', { detail: { fingerprint: keyFingerprint(key) } });
      return send(res, 200, {
        fingerprint: keyFingerprint(key),
        algorithm: 'AES-256-GCM',
        ...(url.searchParams.get('reveal') === '1' ? { key: Buffer.from(key).toString('base64') } : {}),
      });
    }
    if (req.method === 'GET' && url.pathname === '/api/audit') {
      if (!signedAdmin(req)) return send(res, 403, { error: 'permission' });
      const pick = (name) => url.searchParams.get(name) || '';
      const entries = await readAudit(repository.engine, repository.privacyKey, {
        category: pick('category'), action: pick('action'), actor: pick('actor'), from: pick('from'), to: pick('to'), q: pick('q'), limit: Number(pick('limit')) || 500,
      });
      // Names as people know them now, for ids in the log.
      const people = Object.fromEntries((repository.cached?.users || []).map((user) => [user.id, { login: user.login || '', name: user.name || '' }]));
      return send(res, 200, { entries, people });
    }
    if (url.pathname === '/api/lockouts' && (req.method === 'GET' || req.method === 'POST')) {
      // The administrator sees the accounts waiting after failed sign-ins, and may let one try again now.
      if (!signedAdmin(req)) return send(res, 403, { error: 'permission' });
      if (req.method === 'POST') {
        const body = await readBody(req);
        lockout.release(body.account);
        storeLockouts();
        await audit(req, 'lock-release', { detail: { account: String(body.account || '') } });
      }
      lockout.prune();
      const now = Date.now();
      const locked = Object.entries(lockout.entries)
        .filter(([, entry]) => entry.until > now)
        .map(([account, entry]) => ({ account, until: entry.until, fails: entry.fails }));
      return send(res, 200, { locked, policy: lockPolicy(repository.cached) });
    }
    if (signedUser(req)?.mustChangePassword && url.pathname !== '/api/status') {
      // Until the first password is replaced, nothing else opens.
      return send(res, 403, { error: 'password-change' });
    }
    if ((req.method === 'GET' || req.method === 'PUT') && url.pathname === '/api/workspace' && !sessionOf(req)) {
      return send(res, 401, { error: 'permission' });
    }
    if (req.method === 'GET' && url.pathname === '/api/workspace') {
      return send(res, 200, { workspace: publicWorkspace(repository.cached) });
    }
    if (req.method === 'PUT' && url.pathname === '/api/workspace') {
      const body = await readBody(req);
      if (!body.workspace) return send(res, 400, { error: 'file-invalid' });
      const before = repository.cached ? structuredClone(repository.cached) : null;
      // Who acted, as they were before the save (their own ID may change in it).
      const me = signedUser(req);
      const actor = me ? { id: me.id, login: me.login || '' } : null;
      await repository.writeWorkspace(body.workspace, body.revision, { trusted: Boolean(signedAdmin(req)) });
      const changes = workspaceChanges(before, repository.cached);
      for (const item of changes.admin) await audit(req, item.action, { actor, targetId: item.targetId, detail: item.detail });
      if (changes.user) await audit(req, 'save', { actor, detail: { revision: repository.cached?.revision || 0, ...changes.user } });
      return send(res, 200, { saved: true, revision: repository.cached?.revision || 0 });
    }
    if (req.method === 'POST' && (url.pathname === '/api/live/page' || url.pathname === '/api/live/leave')) {
      // Writing a page together: send what you have, get the merged text and who else is writing.
      const user = signedUser(req);
      if (!user) return send(res, 401, { error: 'permission' });
      if (!live) return send(res, 503, { error: 'connect' });
      const body = await readBody(req);
      try {
        if (url.pathname === '/api/live/leave') return send(res, 200, await live.leave(user, String(body.pageId || '')));
        return send(res, 200, live.sync(user, body));
      } catch (error) {
        const code = error?.message || 'failed';
        return send(res, code === 'not-found' ? 404 : code === 'permission' ? 403 : 400, { error: code });
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/unlock') {
      if (!signedUser(req)) return send(res, 401, { error: 'permission' });
      const body = await readBody(req);
      const ok = repository.unlock(body.userId, body.password);
      return send(res, ok ? 200 : 403, ok ? { ok: true } : { error: 'password' });
    }
    if (url.pathname.startsWith('/api/chat/')) {
      const actor = signedUser(req);
      if (!actor) return send(res, 401, { error: 'permission' });
      const people = peopleOf();
      if (req.method === 'GET' && url.pathname === '/api/chat/people') return send(res, 200, { people });
      if (req.method === 'GET' && url.pathname === '/api/chat/profile') {
        const user = (repository.cached?.users || []).find((item) => item.id === (url.searchParams.get('id') || actor.id) && item.active !== false);
        if (!user) return send(res, 404, { error: 'not-found' });
        return send(res, 200, { person: publicPerson(user, true) });
      }
      if (req.method === 'PUT' && url.pathname === '/api/chat/profile') {
        const body = await readBody(req);
        const ws = repository.cached;
        const user = updateProfile(ws, body.id || actor.id, body, actor.id);
        await repository.writeWorkspace(ws, ws.revision);
        return send(res, 200, { person: publicPerson(user, true) });
      }
      if (req.method === 'GET' && url.pathname === '/api/chat/rooms') return send(res, 200, { rooms: await listRooms(repository.engine, actor.id, people) });
      if (req.method === 'POST' && url.pathname === '/api/chat/rooms') {
        const body = await readBody(req);
        return send(res, 200, { room: await openRoom(repository.engine, actor.id, body, people) });
      }
      if (req.method === 'POST' && url.pathname === '/api/chat/members') {
        const body = await readBody(req);
        return send(res, 200, { room: await inviteMembers(repository.engine, actor.id, body.roomId, body.members, people) });
      }
      if (req.method === 'GET' && url.pathname === '/api/chat/messages') {
        const messages = await listMessages(repository.engine, actor.id, url.searchParams.get('room') || '', url.searchParams.get('after') || '');
        const ws = repository.cached;
        return send(res, 200, { messages: messages.map((message) => (message.kind === 'notice' ? { ...message, target: noticeTarget(ws, actor.id, message) } : message)) });
      }
      if (req.method === 'POST' && url.pathname === '/api/chat/messages') {
        const body = await readBody(req);
        return send(res, 200, { message: await postMessage(repository.engine, actor.id, body.roomId, body.body) });
      }
      if (req.method === 'POST' && url.pathname === '/api/chat/checks') {
        const body = await readBody(req);
        return send(res, 200, { check: await checkMessage(repository.engine, actor.id, body.messageId) });
      }
      if (req.method === 'POST' && url.pathname === '/api/chat/files') {
        const body = await readBody(req);
        return send(res, 200, { message: await postFile(repository.engine, actor.id, body.roomId, body) });
      }
      const fileMatch = url.pathname.match(/^\/api\/chat\/files\/([a-z0-9-]+)$/i);
      if (req.method === 'GET' && fileMatch) {
        const file = await readFile(repository.engine, actor.id, fileMatch[1]);
        const bytes = Buffer.from(file.data || '', 'base64');
        const name = encodeURIComponent(file.name || 'file');
        res.writeHead(200, {
          'content-type': file.mime || 'application/octet-stream',
          'content-length': bytes.length,
          'content-disposition': `attachment; filename*=UTF-8''${name}`,
          'access-control-allow-origin': '*',
        });
        res.end(bytes);
        return;
      }
      return send(res, 404, { error: 'not-found' });
    }
    if (req.method === 'POST' && url.pathname === '/api/mail/test') {
      const session = sessionOf(req);
      if (!session) return send(res, 401, { error: 'permission' });
      const actor = (repository.cached?.users || []).find((user) => user.id === session.userId);
      if (!isWorkspaceAdmin(actor)) return send(res, 403, { error: 'permission' });
      const body = await readBody(req);
      const to = String(body.to || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return send(res, 400, { error: 'mail-to' });
      try {
        await repository.sendMail(repository.cached?.mail || {}, {
          to,
          subject: 'MyWorkForce',
          body: 'MyWorkForce에서 보낸 시험 메일입니다.\nThis is a test message from MyWorkForce.',
        });
      } catch (error) {
        return send(res, 502, { error: error?.message || 'mail', detail: error?.detail || error?.message || 'mail' });
      }
      return send(res, 200, { sent: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/password') {
      if (!sessionOf(req)) return send(res, 401, { error: 'permission' });
      const body = await readBody(req);
      if (!String(body.password || '').trim()) return send(res, 400, { error: 'summary-required' });
      return send(res, 200, { passwordHash: hashPassword(body.password) });
    }
    if (url.pathname.startsWith('/api/rest/')) {
      if (!allowed(req)) return send(res, 401, { error: 'permission' });
      if (req.method === 'GET' && url.pathname === '/api/rest/issues') {
        const project = url.searchParams.get('project');
        const rows = await repository.engine.query('SELECT id, project_id, issue_key, summary, type_id, status_id, assignee_id FROM issue_index', []);
        return send(res, 200, { issues: rows.map((row) => opened(row, ['summary'])).filter((row) => !project || row.project_id === project || row.issue_key?.startsWith(`${project}-`)) });
      }
      if (req.method === 'GET' && url.pathname === '/api/rest/documents') {
        const rows = await repository.engine.query("SELECT id, project_id, template_id, title, body, author_id, visibility, issue_key, updated_at FROM documents WHERE visibility <> 'private'", []);
        return send(res, 200, { documents: rows.map((row) => opened(row, ['title', 'body'])) });
      }
      if (req.method === 'GET' && url.pathname === '/api/rest/articles') {
        const rows = await repository.engine.query('SELECT id, project_id, title, body, published, author_id, updated_at FROM articles', []);
        return send(res, 200, { articles: rows.map((row) => opened(row, ['title', 'body'])) });
      }
    }
    return send(res, 404, { error: 'not-found' });
  } catch (error) {
    const code = error?.message || 'connect';
    send(res, 400, { error: code, detail: error?.detail || error?.message || 'connect' });
  }
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.log(`MyWorkForce data service is already listening on ${host}:${port}`);
    process.exit(0);
  }
  console.error(error);
  process.exit(1);
});

server.listen(port, host, () => {
  console.log(`MyWorkForce data service  ${host}:${port}  (company)`);
  connect(savedConfig() || { engine: 'sqlite' }).catch((error) => {
    console.error(error?.detail || error?.message || error);
  }).finally(() => console.log(`MYWORKFORCE_READY ${port}`));
});

const parentPid = Number(argument('--parent-pid')) || 0;
if (parentPid) {
  setInterval(() => {
    try { process.kill(parentPid, 0); } catch { process.exit(0); }
  }, 2000).unref();
}

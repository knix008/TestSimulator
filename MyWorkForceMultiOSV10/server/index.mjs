import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isWorkspaceAdmin } from '../src/domain/permissions.js';
import { ensureAdmin, updateProfile, upgradeWorkspace, userByAccount } from '../src/domain/store.js';
import { checkMessage, inviteMembers, listMessages, listRooms, noticeTarget, openRoom, postFile, postMessage, readFile } from './chat.mjs';
import { createDatabase } from './engine.mjs';
import { checkPassword, hashPassword, openRepository } from './repository.mjs';
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

let repository = null;

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
  return { engine: config.engine, host: config.host || '', port: config.port || '', database: config.database || '', user: config.user || '', file: config.file || '' };
}

function savedConfig() {
  try { return JSON.parse(readFileSync(configPath, 'utf8')); } catch { return null; }
}

function remember(config) {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(configPath, JSON.stringify(publicConfig({ ...config, file: config.file }), null, 2));
  if (config.password) writeFileSync(path.join(dataDir, 'secret.json'), JSON.stringify({ password: config.password }));
}

async function connect(config) {
  const secret = (() => { try { return JSON.parse(readFileSync(path.join(dataDir, 'secret.json'), 'utf8')).password || ''; } catch { return ''; } })();
  const next = {
    engine: config.engine || 'sqlite',
    host: config.host || '127.0.0.1',
    port: config.port,
    database: config.database || '',
    user: config.user || '',
    password: config.password || secret,
    encrypt: Boolean(config.encrypt),
    file: config.file || path.join(dataDir, 'myworkforce.sqlite'),
    dataDir,
  };
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
  await seedAdmin(opened);
  // A session names a person in one database; another database has other people.
  const moved = Boolean(repository) && storeKey(repository.config) !== storeKey(next);
  if (moved) {
    sessions.clear();
    storeSessions();
  }
  if (repository) await repository.close().catch(() => {});
  repository = opened;
  remember(next);
  opened.lastConnect = { createdDatabase, sessionsReset: moved, ...(opened.engine.schemaChanges || {}) };
  return opened;
}

function storeKey(config) {
  return [config.engine, config.host, config.port, config.database, config.engine === 'sqlite' ? path.resolve(config.file || '') : ''].join('|').toLowerCase();
}

function signedAdmin(req) {
  const user = signedUser(req);
  return isWorkspaceAdmin(user) ? user : null;
}

// A fresh database has no workspace, so nobody could sign in to create one.
// The server seeds the administrator account itself.
async function seedAdmin(repo) {
  if (!repo.cached) await repo.writeWorkspace(upgradeWorkspace({}));
  else if (ensureAdmin(repo.cached)) await repo.writeWorkspace(repo.cached);
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

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  if (req.method === 'OPTIONS') return send(res, 204, {});
  try {
    if (req.method === 'GET' && url.pathname === '/api/status') {
      const saved = savedConfig();
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
        schema: repository ? await repository.schemaStatus().then((item) => ({ version: item.version, expected: item.expected, ready: item.ready })).catch(() => null) : null,
      });
    }
    if (req.method === 'GET' && url.pathname === '/api/schema/sql') {
      const engine = url.searchParams.get('engine') || repository?.engine.engine || 'sqlite';
      if (!['sqlite', 'mysql', 'mariadb', 'mssql', 'postgres'].includes(engine)) return send(res, 400, { error: 'engine-unknown' });
      return send(res, 200, { engine, sql: schemaScript(engine) });
    }
    if (req.method === 'POST' && url.pathname === '/api/connect') {
      if (!loopback(req) && !sessionOf(req)) return send(res, 403, { error: 'permission' });
      const body = await readBody(req);
      await connect(body.engine ? body : { engine: 'sqlite' });
      return send(res, 200, { ...repository.describe(), ...repository.lastConnect, schema: await repository.schemaStatus() });
    }
    if (req.method === 'POST' && url.pathname === '/api/disconnect') {
      if (!loopback(req) && !sessionOf(req)) return send(res, 403, { error: 'permission' });
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
      const user = userByAccount(repository.cached?.users || [], body.account);
      if (!user || user.active === false) return send(res, 403, { error: 'not-registered' });
      if (user.passwordHash && !checkPassword(body.password || '', user.passwordHash)) return send(res, 403, { error: 'password' });
      const token = randomBytes(24).toString('hex');
      sessions.set(token, { userId: user.id, login: user.login || '' });
      storeSessions();
      return send(res, 200, { token, user: { id: user.id, name: user.name || '', login: user.login || '', email: user.email || '' } });
    }
    if (req.method === 'GET' && url.pathname === '/api/session') {
      const user = signedUser(req);
      if (!user) return send(res, 401, { error: 'permission' });
      return send(res, 200, { user: { id: user.id, name: user.name || '', login: user.login || '', email: user.email || '' } });
    }
    if (req.method === 'DELETE' && url.pathname === '/api/session') {
      sessions.delete(tokenOf(req));
      storeSessions();
      return send(res, 200, { ok: true });
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
      await repository.writeWorkspace(body.workspace, body.revision);
      return send(res, 200, { saved: true, revision: repository.cached?.revision || 0 });
    }
    if (req.method === 'POST' && url.pathname === '/api/unlock') {
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
        return send(res, 200, { issues: rows.filter((row) => !project || row.project_id === project || row.issue_key?.startsWith(`${project}-`)) });
      }
      if (req.method === 'GET' && url.pathname === '/api/rest/documents') {
        const rows = await repository.engine.query("SELECT id, project_id, template_id, title, body, author_id, visibility, issue_key, updated_at FROM documents WHERE visibility <> 'private'", []);
        return send(res, 200, { documents: rows });
      }
      if (req.method === 'GET' && url.pathname === '/api/rest/articles') {
        const rows = await repository.engine.query('SELECT id, project_id, title, body, published, author_id, updated_at FROM articles', []);
        return send(res, 200, { articles: rows });
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

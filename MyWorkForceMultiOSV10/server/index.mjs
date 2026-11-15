import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword, openRepository } from './repository.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
const configPath = path.join(dataDir, 'connection.json');
const port = Number(process.env.MYWORKFORCE_DATA_PORT || 1481);
const host = process.env.MYWORKFORCE_DATA_HOST || '127.0.0.1';

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
  };
  if (next.engine === 'sqlite') mkdirSync(dataDir, { recursive: true });
  const opened = await openRepository(next);
  if (repository) await repository.close().catch(() => {});
  repository = opened;
  remember(next);
  return opened;
}

function tokenOf(req) {
  return String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
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
        personal: true,
        adminApp: 'later',
        listening: true,
        connected: Boolean(repository),
        engine: repository?.engine.engine || saved?.engine || 'sqlite',
        database: repository?.config.database || repository?.config.file || saved?.file || '',
        host: repository?.config.host || saved?.host || '',
        saved: saved ? publicConfig(saved) : null,
        locked: Boolean(repository?.cached?.users?.some((user) => user.passwordHash)),
        people: (repository?.cached?.users || []).filter((user) => user.active !== false).map((user) => ({ id: user.id, name: user.name || '', login: user.login || '', email: user.email || '', hasPassword: Boolean(user.passwordHash) })),
      });
    }
    if (req.method === 'POST' && url.pathname === '/api/connect') {
      const body = await readBody(req);
      await connect(body.engine ? body : { engine: 'sqlite' });
      return send(res, 200, repository.describe());
    }
    if (req.method === 'POST' && url.pathname === '/api/disconnect') {
      if (repository) await repository.close().catch(() => {});
      repository = null;
      return send(res, 200, { connected: false, personal: true });
    }
    if (!repository) return send(res, 409, { error: 'connect', detail: 'Connect a database first.' });
    if (req.method === 'GET' && url.pathname === '/api/workspace') {
      return send(res, 200, { workspace: repository.cached });
    }
    if (req.method === 'PUT' && url.pathname === '/api/workspace') {
      const body = await readBody(req);
      if (!body.workspace) return send(res, 400, { error: 'file-invalid' });
      await repository.writeWorkspace(body.workspace);
      return send(res, 200, { saved: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/unlock') {
      const body = await readBody(req);
      const ok = repository.unlock(body.userId, body.password);
      return send(res, ok ? 200 : 403, ok ? { ok: true } : { error: 'password' });
    }
    if (req.method === 'POST' && url.pathname === '/api/password') {
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
  console.log(`MyWorkForce data service  ${host}:${port}  (personal)`);
  connect(savedConfig() || { engine: 'sqlite' }).catch((error) => {
    console.error(error?.detail || error?.message || error);
  });
});

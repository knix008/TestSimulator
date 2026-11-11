// Web server entry: static dist/ + /api + /api/live (WebSocket realtime) + login.
//
//   node server/web.js [--config myboard.config.json] [--port 8080] [--host 0.0.0.0] [--data ./data] [--static ./dist]
//
// Config file (JSON): { port, host, dataDir, staticDir, db: { type, host, port, database, user, password, ssl } | { url },
//                       sessionDays, secureCookies, corsOrigins: [] }
// Environment (overrides the file): MYBOARD_PORT, MYBOARD_HOST, MYBOARD_DATA, MYBOARD_STATIC, MYBOARD_DB_URL, or
//   MYBOARD_DB_TYPE / _HOST / _PORT / _NAME / _USER / _PASSWORD / _FILE / _SSL.
// Without a configured database: <dataDir>/database.json (saved by POST /api/db/switch), else SQLite in dataDir.
// First run (no users): GET /api/info says setupRequired; POST /api/auth/setup creates the administrator.
import fs from 'node:fs';
import path from 'node:path';
import { createCore } from '../core/app.js';
import { UnauthorizedError, ForbiddenError } from '../core/errors.js';
import { publicUser } from '../core/services/users.js';
import { createHub } from '../core/realtime/hub.js';
import { createRouter } from './router.js';
import { registerApi } from './api.js';
import { createHttpServer, listen, parseArgs, bearer, parseCookies } from './host.js';
import { loadDbConfig, saveDbConfig, publicDbConfig } from './dbconfig.js';

export const SESSION_COOKIE = 'myboard_session';

/** Read config file + environment. */
export function loadWebConfig(args = {}, env = process.env) {
  let cfg = {};
  if (args.config) cfg = JSON.parse(fs.readFileSync(path.resolve(String(args.config)), 'utf8'));
  const db = { ...(cfg.db || {}) };
  if (env.MYBOARD_DB_URL) Object.assign(db, { url: env.MYBOARD_DB_URL });
  const map = { MYBOARD_DB_TYPE: 'type', MYBOARD_DB_HOST: 'host', MYBOARD_DB_PORT: 'port', MYBOARD_DB_NAME: 'database', MYBOARD_DB_USER: 'user', MYBOARD_DB_PASSWORD: 'password', MYBOARD_DB_FILE: 'file' };
  for (const [k, f] of Object.entries(map)) if (env[k]) db[f] = f === 'port' ? Number(env[k]) : env[k];
  if (env.MYBOARD_DB_SSL) db.ssl = env.MYBOARD_DB_SSL === 'true' || env.MYBOARD_DB_SSL === '1';
  const scriptDir = process.argv[1] ? path.dirname(path.resolve(process.argv[1])) : process.cwd();
  return {
    ...cfg,
    port: Number(args.port ?? env.MYBOARD_PORT ?? cfg.port ?? 8080),
    host: String(args.host ?? env.MYBOARD_HOST ?? cfg.host ?? '0.0.0.0'),
    dataDir: path.resolve(String(args.data ?? env.MYBOARD_DATA ?? cfg.dataDir ?? './data')),
    staticDir: path.resolve(String(args.static ?? env.MYBOARD_STATIC ?? cfg.staticDir ?? path.join(scriptDir, '..', 'dist'))),
    db: Object.keys(db).length ? db : null,
  };
}

/**
 * @param {{ port?: number, host?: string, dataDir?: string, staticDir?: string, db?: object, sessionDays?: number,
 *           secureCookies?: boolean, corsOrigins?: string[], scheduler?: boolean, transport?: object }} cfg
 */
export async function startWeb(cfg = {}) {
  const dataDir = path.resolve(cfg.dataDir || './data');
  const stored = cfg.db ? null : loadDbConfig(dataDir);
  const core = await createCore({ mode: 'web', dataDir, db: cfg.db || stored || undefined, changeLog: true, scheduler: cfg.scheduler });
  const sessionDays = Number(cfg.sessionDays) || 30;
  const corsOrigins = new Set(cfg.corsOrigins || []);

  const ctxUser = (u) => (u ? { id: u.id, role: u.role, username: u.username, display_name: u.display_name } : null);
  const sessionToken = (req, url) => bearer(req, url) || parseCookies(req)[SESSION_COOKIE] || null;
  const cookie = (value, maxAge, req) => {
    const secure = cfg.secureCookies ?? String(req?.headers['x-forwarded-proto'] || '') === 'https';
    return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
  };

  const router = createRouter();
  registerApi(router, core, {
    async info(ctx) {
      return {
        version: core.version, mode: 'web', realtime: true, db: core.db.info,
        needsLogin: !ctx.user, setupRequired: (await core.services.users.count()) === 0,
        user: ctx.user ? publicUser(await core.services.users.raw(ctx.user.id)) : null,
      };
    },
    onLogin: (res, out, req) => res.setHeader('Set-Cookie', cookie(out.token, sessionDays * 86400, req)),
    onLogout: (res, req) => res.setHeader('Set-Cookie', cookie('', 0, req)),
    dbConfig: async (ctx) => {
      if (ctx.user?.role !== 'admin') throw new ForbiddenError('ADMIN_REQUIRED', 'Administrator rights are required');
      return publicDbConfig(core.dbConfig, core.db.info);
    },
    afterDbSwitch: async (dbCfg) => { if (!cfg.db) saveDbConfig(dataDir, dbCfg); },
    allowSetup: true,
  });

  async function userFor(req, url) {
    const tok = sessionToken(req, url);
    if (!tok) return { user: null, token: null };
    return { user: await core.services.users.sessionUser(tok), token: tok };
  }

  const makeCtx = async (req, route, url) => {
    const { user, token } = await userFor(req, url);
    const clientId = req.headers['x-client-id'] ? String(req.headers['x-client-id']).slice(0, 64) : null;
    if (!user && !route.public) throw new UnauthorizedError('LOGIN_REQUIRED', 'Login required');
    return { user: ctxUser(user), sessionToken: token, clientId };
  };

  const hub = createHub({
    events: core.events,
    transport: cfg.transport,
    authenticate: async (req) => (await userFor(req, new URL(req.url, 'http://localhost'))).user,
    canSubscribe: (user, topic) => canSubscribe(core, user, topic),
  });

  const server = createHttpServer({
    router, makeCtx, staticDir: cfg.staticDir,
    corsAllowed: (origin) => corsOrigins.has(origin),
    onUpgrade: (req, socket, head) => hub.handleUpgrade(req, socket, head),
  });
  const port = await listen(server, cfg.port ?? 8080, cfg.host || '0.0.0.0');

  async function close() {
    hub.close();
    await new Promise((r) => { server.close(() => r()); server.closeAllConnections?.(); });
    await core.close();
  }
  return { port, url: `http://127.0.0.1:${port}`, core, server, hub, close };
}

/** Topic authorisation for the realtime hub. */
export async function canSubscribe(core, user, topic) {
  const ctx = { user: { id: user.id, role: user.role } };
  const [kind, id] = String(topic).split(':');
  const role = (pid) => core.services.projects.projectRole(ctx, pid);
  try {
    switch (kind) {
      case 'projects': case 'users': case 'icons': case 'settings': case 'db': return !id;
      case 'user': return id === user.id;
      case 'project': return !!(await core.db.get('SELECT "id" FROM "projects" WHERE "id" = ?', [id])) && !!(await role(id));
      case 'issue': { const i = await core.services.issues.load(id); return !!(await role(i.project_id)); }
      case 'board': { const b = await core.services.boards.loadRaw(id); return b.project_id ? !!(await role(b.project_id)) : true; }
      default: return false;
    }
  } catch {
    return false;
  }
}

// ---- CLI ---------------------------------------------------------------------------------------------------------
const isMain = process.argv[1] && /web\.(c?js|mjs)$/i.test(process.argv[1]);
if (isMain) {
  const cfg = loadWebConfig(parseArgs(process.argv.slice(2)));
  startWeb(cfg).then(({ port, core, close }) => {
    console.log(`MyBoard web server on http://${cfg.host === '0.0.0.0' ? 'localhost' : cfg.host}:${port} — database: ${core.db.info.label}`);
    const stop = () => close().finally(() => process.exit(0));
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  }).catch((err) => { console.error('MyBoard failed to start:', err.message); process.exit(1); });
}

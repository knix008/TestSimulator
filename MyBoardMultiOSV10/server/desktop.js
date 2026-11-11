// Desktop core entry (ARCHITECTURE §7). The Tauri shell spawns:
//   node server/desktop.js --port 0 --data <appDataDir> --parent-pid <pid> [--packaged]
// and waits for the line `MYBOARD_READY <port> <token>` on stdout.
//
// - listens on 127.0.0.1 only; every /api request needs `Authorization: Bearer <token>` (or ?token= for <img>)
// - the local user is used unless the (shared) database has more than one user with a password; then the
//   UI logs in and sends the session as `X-Session: <session token>`
// - CORS: Tauri origins always; Vite dev origins (http://127.0.0.1:* / http://localhost:*) unless --packaged
// - exits when the parent process dies (polled every 2 s)
import path from 'node:path';
import os from 'node:os';
import { createCore } from '../core/app.js';
import { newToken } from '../core/ids.js';
import { UnauthorizedError } from '../core/errors.js';
import { createRouter } from './router.js';
import { registerApi } from './api.js';
import { createHttpServer, listen, parseArgs, bearer } from './host.js';
import { loadDbConfig, saveDbConfig, publicDbConfig } from './dbconfig.js';
import { publicUser } from '../core/services/users.js';

const TAURI_ORIGINS = new Set(['http://tauri.localhost', 'https://tauri.localhost', 'tauri://localhost']);
const DEV_ORIGIN = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;

/**
 * @param {{ port?: number, dataDir?: string, parentPid?: number, packaged?: boolean, token?: string, db?: object, scheduler?: boolean }} opts
 * @returns {Promise<{ port: number, token: string, url: string, core: object, server: import('node:http').Server, close: () => Promise<void> }>}
 */
export async function startDesktop(opts = {}) {
  const dataDir = path.resolve(opts.dataDir || path.join(os.homedir(), '.myboard'));
  let stored = null;
  try { stored = opts.db ? null : loadDbConfig(dataDir); } catch (err) { console.error('[desktop] database.json:', err.message); }
  let core;
  try {
    core = await createCore({ mode: 'desktop', dataDir, db: opts.db || stored || undefined, scheduler: opts.scheduler });
  } catch (err) {
    if (!stored) throw err;
    // the stored server is unreachable: fall back to the local file so the app still starts (the UI shows the error)
    console.error('[desktop] stored database failed, using the local file:', err.message);
    core = await createCore({ mode: 'desktop', dataDir, scheduler: opts.scheduler });
    core.dbError = { code: 'DB_CONNECT_FAILED', message: err.message, config: publicDbConfig(stored) };
  }
  const token = opts.token || newToken(32);
  let localUser = await core.services.users.ensureLocalUser(os.userInfo().username || 'Me');
  let needsLogin = await core.services.users.needsLogin();
  // serialised: user events and a DB switch can arrive together, and the local user must be created once
  let chain = Promise.resolve();
  const refresh = () => {
    chain = chain.catch(() => {}).then(async () => {
      localUser = await core.services.users.ensureLocalUser(os.userInfo().username || 'Me');
      needsLogin = await core.services.users.needsLogin();
    });
    return chain;
  };
  core.events.on('user.*', () => refresh().catch(() => {}));
  core.events.on('db.switched', () => refresh().catch(() => {}));

  const ctxUser = (u) => (u ? { id: u.id, role: u.role, username: u.username, display_name: u.display_name } : null);

  const router = createRouter();
  registerApi(router, core, {
    async info(ctx) {
      return {
        version: core.version, mode: 'desktop', realtime: false, db: core.db.info, dbError: core.dbError || null,
        needsLogin: needsLogin && !ctx.sessionUser, setupRequired: false, user: ctx.user ? publicUser(await core.services.users.raw(ctx.user.id)) : null,
      };
    },
    dbConfig: async () => publicDbConfig(core.dbConfig, core.db.info),
    afterDbSwitch: async (cfg) => { saveDbConfig(dataDir, cfg?.type === 'sqlite' && !cfg.file ? null : cfg); core.dbError = null; await refresh(); },
    allowSetup: false,
  });

  const makeCtx = async (req, route, url) => {
    if (bearer(req, url) !== token && !(route.public && route.method === 'GET' && /^\/api\/icons\//.test(url.pathname))) {
      throw new UnauthorizedError('BAD_TOKEN', 'Missing or wrong desktop token');
    }
    const clientId = req.headers['x-client-id'] ? String(req.headers['x-client-id']).slice(0, 64) : null;
    const session = req.headers['x-session'] ? String(req.headers['x-session']) : null;
    if (session) {
      const u = await core.services.users.sessionUser(session);
      if (u) return { user: ctxUser(u), sessionUser: true, sessionToken: session, clientId };
    }
    if (needsLogin) {
      if (route.public) return { user: null, clientId };
      throw new UnauthorizedError('LOGIN_REQUIRED', 'Login required');
    }
    return { user: ctxUser(localUser), clientId };
  };

  const server = createHttpServer({
    router, makeCtx,
    corsAllowed: (origin) => TAURI_ORIGINS.has(origin) || (!opts.packaged && DEV_ORIGIN.test(origin)),
  });
  const port = await listen(server, Number(opts.port) || 0, '127.0.0.1');

  let watch = null;
  if (opts.parentPid) {
    watch = setInterval(() => {
      try { process.kill(Number(opts.parentPid), 0); } catch (err) { if (err.code === 'ESRCH') { close().finally(() => process.exit(0)); } }
    }, 2000);
    watch.unref?.();
  }

  let closed = false;
  async function close() {
    if (closed) return;
    closed = true;
    if (watch) clearInterval(watch);
    await new Promise((r) => { server.close(() => r()); server.closeAllConnections?.(); });
    await core.close();
  }
  return { port, token, url: `http://127.0.0.1:${port}`, core, server, close };
}

// ---- CLI ---------------------------------------------------------------------------------------------------------
const isMain = process.argv[1] && /desktop\.(c?js|mjs)$/i.test(process.argv[1]);
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const packaged = !!args.packaged || process.env.MYBOARD_PACKAGED === '1';
  startDesktop({ port: Number(args.port) || 0, dataDir: args.data, parentPid: args['parent-pid'] ? Number(args['parent-pid']) : null, packaged })
    .then(({ port, token, close }) => {
      process.stdout.write(`MYBOARD_READY ${port} ${token}\n`);
      const stop = () => close().finally(() => process.exit(0));
      process.on('SIGINT', stop);
      process.on('SIGTERM', stop);
      process.stdin.on('end', () => {}); // the shell may keep stdin open; do not exit on it
    })
    .catch((err) => {
      process.stderr.write(`MYBOARD_FAILED ${err.code || 'ERROR'} ${err.message}\n`);
      process.exit(1);
    });
}

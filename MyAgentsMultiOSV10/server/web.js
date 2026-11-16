// Web server entry: static dist/ + /api (ARCHITECTURE.md §2).
//
//   node server/web.js [--port 8080] [--host 127.0.0.1] [--data ./data] [--static ./dist] [--password <pw>]
//
// Environment: MYAGENTS_PORT, MYAGENTS_HOST, MYAGENTS_DATA, MYAGENTS_STATIC, MYAGENTS_PASSWORD.
// With a password the page asks for it once (a session cookie follows); without one, the server listens on
// 127.0.0.1 unless --host says otherwise. Webhooks never need the password (their URL holds a secret).
// "Run command" nodes are off on the web server.
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { createCore } from '../core/app.js';
import { newToken } from '../core/ids.js';
import { AppError, UnauthorizedError } from '../core/errors.js';
import { createRouter } from './router.js';
import { registerApi } from './api.js';
import { createHttpServer, listen, parseArgs, bearer, parseCookies } from './host.js';

export const SESSION_COOKIE = 'myagents_session';

export function loadWebConfig(args = {}, env = process.env) {
  const scriptDir = process.argv[1] ? path.dirname(path.resolve(process.argv[1])) : process.cwd();
  const password = String(args.password ?? env.MYAGENTS_PASSWORD ?? '');
  return {
    port: Number(args.port ?? env.MYAGENTS_PORT ?? 8080),
    host: String(args.host ?? env.MYAGENTS_HOST ?? (password ? '0.0.0.0' : '127.0.0.1')),
    dataDir: path.resolve(String(args.data ?? env.MYAGENTS_DATA ?? './data')),
    staticDir: path.resolve(String(args.static ?? env.MYAGENTS_STATIC ?? path.join(scriptDir, '..', 'dist'))),
    password,
  };
}

const same = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

export async function startWeb(cfg = {}) {
  const core = createCore({ mode: 'web', dataDir: cfg.dataDir ?? './data', scheduler: cfg.scheduler, mockDelay: cfg.mockDelay });
  const sessions = new Set();
  const needsPassword = Boolean(cfg.password);
  const cookie = (value, maxAge, req) => `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${String(req?.headers['x-forwarded-proto'] || '') === 'https' ? '; Secure' : ''}`;
  const signedIn = (req, url) => !needsPassword || sessions.has(parseCookies(req)[SESSION_COOKIE]) || sessions.has(bearer(req, url));

  const router = createRouter();
  registerApi(router, core, {
    info: (ctx) => ({ version: core.version, mode: 'web', needsLogin: needsPassword && !ctx.signedIn, user: ctx.signedIn ? { username: 'web' } : null, allowShell: false }),
  });
  router.post('/api/auth/login', ({ body, res, req }) => {
    if (!needsPassword) return { ok: true };
    if (!same(body?.password ?? '', cfg.password)) throw new AppError('LOGIN_FAILED', 'Wrong password', 401);
    const token = newToken(32);
    sessions.add(token);
    res.setHeader('Set-Cookie', cookie(token, 30 * 86400, req));
    return { ok: true, token };
  }, { public: true });
  router.post('/api/auth/logout', ({ req, res }) => { sessions.delete(parseCookies(req)[SESSION_COOKIE]); res.setHeader('Set-Cookie', cookie('', 0, req)); }, { public: true });

  const makeCtx = async (req, route, url) => {
    const ok = signedIn(req, url);
    if (!ok && !route.public) throw new UnauthorizedError('LOGIN_REQUIRED', 'Login required');
    return { signedIn: ok, user: ok ? { username: 'web' } : null };
  };

  const server = createHttpServer({ router, makeCtx, staticDir: cfg.staticDir, corsAllowed: () => false });
  const port = await listen(server, cfg.port ?? 8080, cfg.host || '127.0.0.1');
  async function close() {
    await new Promise((r) => { server.close(() => r()); server.closeAllConnections?.(); });
    await core.close();
  }
  return { port, url: `http://127.0.0.1:${port}`, core, server, close };
}

const isMain = process.argv[1] && /web\.(c?js|mjs)$/i.test(process.argv[1]);
if (isMain) {
  const cfg = loadWebConfig(parseArgs(process.argv.slice(2)));
  startWeb(cfg).then(({ port }) => {
    console.log(`MyAgents web server on http://${cfg.host === '0.0.0.0' ? 'localhost' : cfg.host}:${port}${cfg.password ? ' (password required)' : ''} — data: ${cfg.dataDir}`);
  }).catch((err) => { console.error('MyAgents failed to start:', err.message); process.exit(1); });
}

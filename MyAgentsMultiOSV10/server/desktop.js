// Desktop core entry (ARCHITECTURE.md §2). The Tauri shell spawns:
//   node server/desktop.js --port 0 --data <appDataDir> --parent-pid <pid> [--packaged]
// and waits for the line `MYAGENTS_READY <port> <token>` on stdout.
//
// - listens on 127.0.0.1 only; every /api request needs `Authorization: Bearer <token>` (or ?token= for
//   EventSource), except webhooks (/api/hooks/<agent>/<secret>: the secret is the key) and /api/info
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

const TAURI_ORIGINS = new Set(['http://tauri.localhost', 'https://tauri.localhost', 'tauri://localhost']);
const DEV_ORIGIN = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;

/**
 * @param {{ port?: number, dataDir?: string, parentPid?: number, packaged?: boolean, token?: string, scheduler?: boolean, mockDelay?: number }} opts
 */
export async function startDesktop(opts = {}) {
  const dataDir = path.resolve(opts.dataDir || path.join(os.homedir(), '.myagents'));
  const core = createCore({ mode: 'desktop', dataDir, scheduler: opts.scheduler, mockDelay: opts.mockDelay });
  const token = opts.token || newToken(32);

  const router = createRouter();
  registerApi(router, core, {
    info: () => ({ version: core.version, mode: 'desktop', dataDir, needsLogin: false, user: { username: os.userInfo().username || 'me' }, allowShell: core.nodeServices.allowShell() }),
  });

  const makeCtx = async (req, route, url) => {
    if (!route.public && bearer(req, url) !== token) throw new UnauthorizedError('BAD_TOKEN', 'Missing or wrong desktop token');
    const clientId = req.headers['x-client-id'] ? String(req.headers['x-client-id']).slice(0, 64) : null;
    return { user: { username: os.userInfo().username || 'me' }, clientId };
  };

  const server = createHttpServer({
    router, makeCtx,
    // webhooks may be called from anywhere (a browser page, another tool): any origin, no credentials
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
  const packaged = !!args.packaged || process.env.MYAGENTS_PACKAGED === '1';
  startDesktop({ port: Number(args.port) || 0, dataDir: args.data, parentPid: args['parent-pid'] ? Number(args['parent-pid']) : null, packaged })
    .then(({ port, token, close }) => {
      process.stdout.write(`MYAGENTS_READY ${port} ${token}\n`);
      const stop = () => close().finally(() => process.exit(0));
      process.on('SIGINT', stop);
      process.on('SIGTERM', stop);
      process.stdin.on('end', () => {});
    })
    .catch((err) => {
      process.stderr.write(`MYAGENTS_FAILED ${err.code || 'ERROR'} ${err.message}\n`);
      process.exit(1);
    });
}

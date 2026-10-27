// Host file-system API for the engine (core/CONTRACT.md §6), shared by the
// web server (server/server.js) and the Vite dev / preview middleware
// (vite.config.mjs). The desktop app serves the same API from Rust
// (src-tauri/src/host.rs); keep the two in step.
//
//   POST /api/fs/<op>        JSON body { path, ... } → { ok: true, data } | { ok: false, error: { code, message } }
//   POST /api/host/info      platform, start folder, temp folder, whether system() works
//   POST /api/settings/get   the stored GUI settings ({} when none)
//   POST /api/settings/set   { settings } replaces them
//
// Bytes travel as base64 (`readBytes` → { base64 }, `writeBytes` ← { base64 }).
//
// Jail mode (the web build): every path the page or the engine sees is a
// virtual absolute path ("/", "/data/x.csv") inside `root`; ".." can never
// leave it and symbolic links that point outside are refused.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const API_PREFIX = '/api/';
const MAX_BODY = 512 * 1024 * 1024;

export class ApiError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/** Posix-normalises a virtual path: always absolute, no "." / ".." / empty parts. */
export function normVirtual(p) {
  const parts = [];
  for (const s of String(p == null ? '' : p).replace(/\\/g, '/').split('/')) {
    if (s === '' || s === '.') continue;
    if (s === '..') parts.pop(); else parts.push(s);
  }
  return '/' + parts.join('/');
}

/** A host path with "/" separators (Windows: C:/x/y). */
export const slash = (p) => String(p).replace(/\\/g, '/');

export function defaultWebRoot() {
  return path.join(os.homedir(), 'MySimulationMath');
}

export function defaultConfigDir() {
  if (process.env.MSM_USER_DATA) return process.env.MSM_USER_DATA;
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'MySimulationMath');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'MySimulationMath');
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'MySimulationMath');
}

/**
 * The path mapper. jail: { root } maps virtual paths into root; without a
 * jail the paths are real absolute paths ("/"-separated).
 */
export function createMapper({ root, jail = true }) {
  const realRoot = path.resolve(root);
  if (!jail) {
    return {
      jail: false,
      toReal(p) {
        const s = String(p || '');
        if (!s) throw new ApiError('EINVAL', 'Empty path.');
        return path.resolve(s);
      },
      toVirtual: (real) => slash(real),
      home: () => slash(os.homedir()),
      temp: () => slash(os.tmpdir()),
      start: () => slash(realRoot),
    };
  }
  const inside = (real) => {
    const rel = path.relative(realRoot, real);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  };
  // A symbolic link inside the root that points outside it is refused: the
  // nearest existing ancestor's real path must stay inside.
  const checkLinks = (real) => {
    let probe = real;
    for (;;) {
      if (fs.existsSync(probe)) {
        let resolved;
        try { resolved = fs.realpathSync(probe); } catch { resolved = probe; }
        let rootReal;
        try { rootReal = fs.realpathSync(realRoot); } catch { rootReal = realRoot; }
        const rel = path.relative(rootReal, resolved);
        if (!(rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)))) throw new ApiError('EACCES', 'Path is outside the workspace folder.');
        return;
      }
      const up = path.dirname(probe);
      if (up === probe) return;
      probe = up;
    }
  };
  return {
    jail: true,
    toReal(p) {
      const v = normVirtual(p);
      const real = path.join(realRoot, ...v.split('/').filter(Boolean));
      if (!inside(real)) throw new ApiError('EACCES', 'Path is outside the workspace folder.');
      checkLinks(real);
      return real;
    },
    toVirtual(real) {
      const rel = path.relative(realRoot, real);
      if (rel.startsWith('..') || path.isAbsolute(rel)) throw new ApiError('EACCES', 'Path is outside the workspace folder.');
      return '/' + slash(rel).replace(/^\/+/, '');
    },
    home: () => '/',
    temp: () => '/.tmp',
    start: () => '/',
  };
}

const errCode = (e) => (e && e.code) || 'EIO';
function wrapFs(fn) {
  try { return fn(); } catch (e) {
    if (e instanceof ApiError) throw e;
    const code = errCode(e);
    const msg = code === 'ENOENT' ? 'No such file or folder.' : code === 'EEXIST' ? 'Already exists.' : code === 'ENOTEMPTY' ? 'Folder is not empty.' : code === 'EACCES' || code === 'EPERM' ? 'Permission denied.' : code === 'EISDIR' ? 'Is a folder.' : code === 'ENOTDIR' ? 'Not a folder.' : (e && e.message) || 'I/O error.';
    throw new ApiError(code, msg);
  }
}

function statOf(real) {
  const st = fs.statSync(real);
  return { isDir: st.isDirectory(), size: st.isDirectory() ? 0 : st.size, mtimeMs: Math.round(st.mtimeMs) };
}

/** The file-system operations; `map` is a mapper from createMapper. */
export function createFsOps(map, { allowSystem = false, systemTimeoutMs = 120000 } = {}) {
  const R = (p) => map.toReal(p);
  const ops = {
    readText: ({ path: p }) => wrapFs(() => fs.readFileSync(R(p), 'utf8')),
    writeText: ({ path: p, text }) => wrapFs(() => { const r = R(p); fs.mkdirSync(path.dirname(r), { recursive: true }); fs.writeFileSync(r, String(text == null ? '' : text), 'utf8'); return true; }),
    appendText: ({ path: p, text }) => wrapFs(() => { const r = R(p); fs.mkdirSync(path.dirname(r), { recursive: true }); fs.appendFileSync(r, String(text == null ? '' : text), 'utf8'); return true; }),
    readBytes: ({ path: p }) => wrapFs(() => ({ base64: fs.readFileSync(R(p)).toString('base64') })),
    writeBytes: ({ path: p, base64 }) => wrapFs(() => { const r = R(p); fs.mkdirSync(path.dirname(r), { recursive: true }); fs.writeFileSync(r, Buffer.from(String(base64 || ''), 'base64')); return true; }),
    exists: ({ path: p }) => { try { return fs.existsSync(R(p)); } catch (e) { if (e instanceof ApiError) return false; throw e; } },
    stat: ({ path: p }) => wrapFs(() => statOf(R(p))),
    list: ({ path: p }) => wrapFs(() => {
      const dir = R(p);
      const out = [];
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        try {
          const st = fs.statSync(path.join(dir, ent.name));
          out.push({ name: ent.name, isDir: st.isDirectory(), size: st.isDirectory() ? 0 : st.size, mtimeMs: Math.round(st.mtimeMs) });
        } catch { /* broken link or no access: skipped */ }
      }
      return out.sort((a, b) => a.name.localeCompare(b.name));
    }),
    mkdir: ({ path: p }) => wrapFs(() => { fs.mkdirSync(R(p), { recursive: true }); return true; }),
    remove: ({ path: p, recursive }) => wrapFs(() => {
      const r = R(p);
      if (map.jail && path.resolve(r) === path.resolve(map.toReal('/'))) throw new ApiError('EACCES', 'The workspace folder itself cannot be removed.');
      const st = fs.statSync(r);
      if (st.isDirectory()) { if (recursive) fs.rmSync(r, { recursive: true, force: false }); else fs.rmdirSync(r); }
      else fs.unlinkSync(r);
      return true;
    }),
    rename: ({ from, to }) => wrapFs(() => { const b = R(to); fs.mkdirSync(path.dirname(b), { recursive: true }); fs.renameSync(R(from), b); return true; }),
    copy: ({ from, to }) => wrapFs(() => { const a = R(from); const b = R(to); fs.mkdirSync(path.dirname(b), { recursive: true }); fs.cpSync(a, b, { recursive: true }); return true; }),
    tempDir: () => { const v = map.temp(); try { fs.mkdirSync(map.toReal(v), { recursive: true }); } catch { /* read-only */ } return v; },
    homeDir: () => map.home(),
    system: ({ command, cwd }) => {
      if (!allowSystem) throw new ApiError('ENOSYS', 'system() is not available in the web version.');
      const dir = cwd ? R(cwd) : R(map.start());
      const isWin = process.platform === 'win32';
      const r = spawnSync(isWin ? (process.env.ComSpec || 'cmd.exe') : '/bin/sh', isWin ? ['/d', '/s', '/c', String(command)] : ['-c', String(command)], { cwd: dir, encoding: 'utf8', timeout: systemTimeoutMs, windowsHide: true, windowsVerbatimArguments: isWin, maxBuffer: 64 * 1024 * 1024 });
      return { status: r.status == null ? -1 : r.status, output: `${r.stdout || ''}${r.stderr || ''}` };
    },
  };
  return ops;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new ApiError('E2BIG', 'Request too large.')); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Headers every answer carries: cross-origin isolation-friendly and CORS for the desktop page. */
export function apiHeaders(origin, corsOrigins) {
  const h = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'cross-origin-resource-policy': 'cross-origin',
  };
  if (origin && (corsOrigins === '*' || (Array.isArray(corsOrigins) && corsOrigins.includes(origin)))) {
    h['access-control-allow-origin'] = origin;
    h['access-control-allow-headers'] = 'content-type, authorization';
    h['access-control-allow-methods'] = 'POST, OPTIONS';
    h['access-control-max-age'] = '600';
    h.vary = 'origin';
  }
  return h;
}

/**
 * The request handler: resolves true when it answered (an /api/ request),
 * false for anything else (static files are the caller's business).
 */
export function createFsApi({ root = defaultWebRoot(), jail = true, token = '', corsOrigins = [], configDir = defaultConfigDir(), allowSystem = false, version = '1.0.0', platform = process.platform } = {}) {
  try { fs.mkdirSync(root, { recursive: true }); } catch { /* reported by the calls */ }
  const map = createMapper({ root, jail });
  const ops = createFsOps(map, { allowSystem });
  const settingsFile = path.join(configDir, 'settings.json');
  const api = {
    'host/info': () => ({ platform, jail: map.jail, start: map.start(), home: map.home(), temp: map.temp(), system: !!allowSystem, version, root: map.jail ? '/' : slash(path.resolve(root)) }),
    'settings/get': () => { try { return JSON.parse(fs.readFileSync(settingsFile, 'utf8')); } catch { return {}; } },
    'settings/set': ({ settings }) => {
      if (!settings || typeof settings !== 'object') throw new ApiError('EINVAL', 'settings must be an object.');
      fs.mkdirSync(configDir, { recursive: true });
      const tmp = `${settingsFile}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(settings, null, 1), 'utf8');
      fs.renameSync(tmp, settingsFile);
      return true;
    },
  };
  for (const [name, fn] of Object.entries(ops)) api[`fs/${name}`] = fn;

  /** Runs one call directly (tests and the in-process host). */
  const call = (name, args = {}) => {
    const fn = api[name];
    if (!fn) throw new ApiError('ENOENT', `Unknown call ${name}.`);
    return fn(args || {});
  };

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith(API_PREFIX)) return false;
    const headers = apiHeaders(req.headers.origin, corsOrigins);
    if (req.method === 'OPTIONS') { res.writeHead(204, headers); res.end(); return true; }
    const send = (status, body) => { res.writeHead(status, headers); res.end(JSON.stringify(body)); };
    if (token && req.headers.authorization !== `Bearer ${token}`) { send(401, { ok: false, error: { code: 'UNAUTHORIZED', message: 'Missing or wrong token.' } }); return true; }
    if (req.method !== 'POST') { send(405, { ok: false, error: { code: 'EINVAL', message: 'Use POST.' } }); return true; }
    const name = url.pathname.slice(API_PREFIX.length);
    if (!api[name]) { send(404, { ok: false, error: { code: 'ENOENT', message: `Unknown call ${name}.` } }); return true; }
    try {
      const text = await readBody(req);
      const args = text ? JSON.parse(text) : {};
      send(200, { ok: true, data: await api[name](args) });
    } catch (e) {
      send(200, { ok: false, error: { code: (e && e.code) || 'EIO', message: (e && e.message) || String(e) } });
    }
    return true;
  }
  return { handle, call, map, ops, settingsFile };
}

/** COOP / COEP for pages that use SharedArrayBuffer (engine requests and Ctrl+C). */
export const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

// The host-agnostic API of My Editor. Both hosts wrap it:
//
//   electron/ipc.js      → ipcMain.handle('api', name, args)
//   server/server.js     → POST /api/<name>   (JSON body = args)
//
// The renderer (src/lib/backend.js) calls `api.call(name, args)` through
// whichever transport is present. Everything file-related happens here, so
// the UI never touches Node APIs.
'use strict';

const path = require('path');
const files = require('./files');
const enc = require('./encoding');
const { createSession } = require('./session');
const { createTerminals } = require('./terminal');

function serializeError(err) {
  if (!err) return { code: 'UNKNOWN', message: 'Unknown error' };
  return {
    code: err.code || 'ERROR',
    message: err.message || String(err),
    path: err.path || undefined,
    syscall: err.syscall || undefined,
    size: err.size || undefined,
    stack: err.stack || undefined,
  };
}

function createApi({ name = 'web', version = '', buildInfo = null, configDir, openPath, revealPath, clipboard } = {}) {
  const session = createSession(configDir);
  const terminals = createTerminals();

  const methods = {
    // ── App ──
    'app.info': async () => ({
      host: name,
      version,
      buildInfo,
      platform: process.platform,
      configDir: session.dir,
      home: files.homedir(),
      sep: path.sep,
      encodings: enc.ENCODINGS.map((e) => ({ id: e.id, label: e.label })),
      legacyEncoding: enc.legacyEncoding(),
    }),

    // ── Session / settings ──
    'session.get': async () => session.get(),
    'session.save': async (patch) => session.save(patch),
    'recent.touch': async ({ path: p }) => session.touchRecent(p),
    'recent.remove': async ({ path: p }) => session.removeRecent(p),
    'recent.clear': async () => session.clearRecent(),

    // ── Documents ──
    'file.read': async ({ path: p, encoding, defaultEol }) => {
      const r = await files.read(p, { encoding: encoding || null, defaultEol: defaultEol || session.get().defaultEol });
      return { path: path.resolve(p), name: path.basename(p), ...r };
    },
    // `force` skips the lossy-encoding guard (the UI asked the user first).
    'file.write': async ({ path: p, text, encoding, eol, force }) => {
      if (!force && !enc.canEncode(text, encoding || 'utf8')) {
        const e = new Error(`Some characters cannot be represented in ${enc.encodingInfo(encoding).label}`);
        e.code = 'EENCODE';
        throw e;
      }
      const r = await files.write(p, text, { encoding: encoding || 'utf8', eol: eol || 'lf' });
      return { path: path.resolve(p), name: path.basename(p), ...r };
    },
    'file.canEncode': async ({ text, encoding }) => enc.canEncode(text, encoding),
    'file.stat': async ({ path: p }) => files.stat(p),
    'file.dataUrl': async ({ path: p }) => files.dataUrl(p),
    'file.exists': async ({ path: p }) => files.exists(p),

    // ── Folders (sidebar tree, in-app file dialog) ──
    'fs.list': async ({ path: p, showHidden }) => files.list(p || files.homedir(), { showHidden: !!showHidden }),
    'fs.drives': async () => files.drives(),
    'fs.mkdir': async ({ path: p }) => files.mkdir(p),
    'fs.rename': async ({ from, to }) => files.rename(from, to),
    'fs.remove': async ({ path: p }) => files.remove(p),
    'fs.resolve': async ({ base, rel }) => path.resolve(base || files.homedir(), rel || ''),

    // ── OS integration ──
    'os.open': async ({ path: p }) => { if (openPath) { const r = await openPath(p); if (r) throw new Error(r); return true; } return files.openExternal(p); },
    'os.reveal': async ({ path: p }) => { if (revealPath) { await revealPath(p); return true; } return files.openExternal(path.dirname(p)); },
    // ── Terminal panel ──
    'term.shells': async () => terminals.shells(),
    'term.create': async ({ cwd, shell }) => terminals.create({ cwd, shell }),
    'term.run': async ({ id, line }) => terminals.run({ id, line }),
    'term.write': async ({ id, data }) => terminals.write({ id, data }),
    'term.read': async ({ id, since }) => terminals.read({ id, since }),
    'term.complete': async ({ id, line, cursor }) => terminals.complete({ id, line, cursor }),
    'term.kill': async ({ id }) => terminals.kill({ id }),
    'term.list': async () => terminals.list(),
    'git.status': async ({ cwd }) => terminals.git({ cwd }),

    'clipboard.read': async () => (clipboard ? clipboard.readText() : ''),
    'clipboard.write': async ({ text }) => { if (clipboard) clipboard.writeText(text || ''); return true; },
  };

  return {
    session,
    methods,
    async call(method, args) {
      const fn = methods[method];
      if (!fn) { const e = new Error(`Unknown API method: ${method}`); e.code = 'ENOMETHOD'; throw e; }
      return fn(args || {});
    },
    async shutdown() { terminals.shutdown(); },
  };
}

module.exports = { createApi, serializeError };

// The host-agnostic API of MyBrainMap. Both hosts wrap it:
//
//   host/desktop.js      → POST /api/<name>   (the Tauri sidecar)
//   server/server.js     → POST /api/<name>   (the web host)
//
// The renderer (src/lib/backend.js) calls `api.call(name, args)` through
// whichever transport is present. Everything file-related happens here, so
// the UI never touches Node APIs. Map formats (.tmap JSON, OPML, FreeMind,
// XMind, MindManager …) are converted in the renderer (src/lib/formats/);
// this side reads and writes the bytes and opens ZIP containers.
'use strict';

const os = require('os');
const path = require('path');
const files = require('./files');
const { readZip, writeZip } = require('./zip');
const { createSession } = require('./session');

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

const TEXT_IN_ZIP = /\.(xml|json|rels|txt|html?|md|opml|mm|css)$/i;
const MAX_ZIP_ENTRIES = 5000;
const MAX_ZIP_BYTES = 64 * 1024 * 1024;

// the entries of a ZIP container, text ones as text
function zipEntries(buf) {
  return readZip(buf).slice(0, MAX_ZIP_ENTRIES).map((e) => (TEXT_IN_ZIP.test(e.name) ? { name: e.name, text: files.decodeText(e.data) } : { name: e.name, base64: e.data.toString('base64') }));
}

function createApi({ name = 'web', version = '', buildInfo = null, configDir, openPath, revealPath, clipboard, writeImage } = {}) {
  const session = createSession(configDir);

  const methods = {
    // ── App ──
    'app.info': async () => ({
      host: name,
      version,
      buildInfo,
      platform: process.platform,
      configDir: session.dir,
      home: files.homedir(),
      documents: path.join(files.homedir(), 'Documents'),
      user: (() => { try { return os.userInfo().username; } catch { return process.env.USERNAME || process.env.USER || ''; } })(),
      hostname: os.hostname(),
      sep: path.sep,
    }),

    // ── Session / settings ──
    'session.get': async () => session.get(),
    'session.save': async (patch) => session.save(patch),
    'recent.touch': async ({ path: p }) => session.touchRecent(p),
    'recent.remove': async ({ path: p }) => session.removeRecent(p),
    'recent.clear': async () => session.clearRecent(),

    // ── Files ──
    'file.readText': async ({ path: p }) => ({ path: path.resolve(p), name: path.basename(p), ...(await files.readText(p)) }),
    'file.readBase64': async ({ path: p }) => ({ path: path.resolve(p), name: path.basename(p), ...(await files.readBase64(p)) }),
    'file.writeText': async ({ path: p, text, bom }) => files.writeText(p, text, { bom: !!bom }),
    'file.writeBase64': async ({ path: p, base64 }) => files.writeBase64(p, base64),
    'file.writeDataUrl': async ({ path: p, dataUrl }) => files.writeDataUrl(p, dataUrl),
    'file.stat': async ({ path: p }) => files.stat(p),
    'file.exists': async ({ path: p }) => files.exists(p),
    'file.dataUrl': async ({ path: p }) => files.dataUrl(p),
    // A ZIP container (XMind, MindManager): the entries, text ones as text.
    'zip.read': async ({ path: p }) => {
      const { buf } = await files.readBuffer(p);
      return { path: path.resolve(p), name: path.basename(p), entries: zipEntries(buf) };
    },
    // The same for a container the page already holds (a file dropped on the browser page).
    'zip.readData': async ({ base64, name = '' }) => {
      const buf = Buffer.from(String(base64 || ''), 'base64');
      if (buf.length > MAX_ZIP_BYTES) { const e = new Error('The file is too large'); e.code = 'ETOOBIG'; throw e; }
      return { path: '', name: path.basename(String(name)), entries: zipEntries(buf) };
    },
    // files: [{ name, text } | { name, base64 }, store?] → a ZIP file at `path`
    'zip.write': async ({ path: p, files: list }) => {
      const parts = (Array.isArray(list) ? list : []).map((f) => ({
        name: f.name,
        store: !!f.store,
        data: f.base64 != null ? Buffer.from(String(f.base64), 'base64') : Buffer.from(String(f.text ?? ''), 'utf8'),
      }));
      return files.writeBuffer(p, writeZip(parts));
    },

    // ── Folders (in-app file dialog of the web version) ──
    'fs.list': async ({ path: p, showHidden }) => files.list(p || files.homedir(), { showHidden: !!showHidden }),
    'fs.drives': async () => files.drives(),
    'fs.mkdir': async ({ path: p }) => files.mkdir(p),
    'fs.resolve': async ({ base, rel }) => path.resolve(base || files.homedir(), rel || ''),

    // ── OS integration (attachments, file links) ──
    'os.open': async ({ path: p }) => { if (openPath) { const r = await openPath(p); if (r) throw new Error(r); return true; } return files.openExternal(p); },
    'os.reveal': async ({ path: p }) => { if (revealPath) { await revealPath(p); return true; } return files.openExternal(path.dirname(p)); },

    'clipboard.read': async () => (clipboard ? clipboard.readText() : ''),
    'clipboard.write': async ({ text }) => { if (clipboard) clipboard.writeText(text || ''); return true; },
    'clipboard.writeImage': async ({ dataUrl }) => { if (!writeImage) return false; writeImage(dataUrl); return true; },
  };

  return {
    session,
    methods,
    async call(method, args) {
      const fn = methods[method];
      if (!fn) { const e = new Error(`Unknown API method: ${method}`); e.code = 'ENOMETHOD'; throw e; }
      return fn(args || {});
    },
    async shutdown() { /* nothing long-running */ },
  };
}

module.exports = { createApi, serializeError };

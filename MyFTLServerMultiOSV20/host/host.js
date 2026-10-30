// My FTP Server — the desktop app's Node host (started by src-tauri/src/host.rs).
//
// The FTP / FTPS / SFTP listeners, settings, profiles, certificates and the
// log are core/ (Node: net, tls, ssh2). This process serves core/api.js on
// 127.0.0.1, on a free port, behind a random token — the same HTTP API the
// web version uses (server/http-api.js) — and tells the Tauri shell where:
//
//   stdout, first line   {"ready":true,"port":<n>,"token":"<hex>"}
//   stdin closed         the shell is gone (or quits): stop the servers, exit
//
// The page reaches it with fetch (src/lib/backend.js) and polls `server.poll`
// for log lines and counters. Native bits (dialogs, reveal, clipboard, window,
// tray) are the shell's; the page calls them through Tauri directly.
//
// Environment (set by the shell):
//   MFS_CONFIG_DIR   settings / profiles / certificate / host key / log folder
//   MFS_VERSION      the app version (About)
//   MFS_BUILD_INFO   build-info.json (About), optional
'use strict';

const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const { createApi } = require('../core/api');
const { createApiHandler, sendJson } = require('../server/http-api');

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return null; }
}

function startHost({ configDir, version = '', buildInfo = null, autoStart = true } = {}) {
  const api = createApi({ name: 'tauri', version, buildInfo, configDir: configDir || undefined });
  const token = crypto.randomBytes(24).toString('hex');
  const handleApi = createApiHandler(api, { token, cors: true });
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    handleApi(req, res, url)
      .then((done) => { if (!done) sendJson(res, 404, { ok: false, error: { code: 'ENOENT', message: 'Not found' } }); })
      .catch((err) => sendJson(res, 500, { ok: false, error: { code: 'ERROR', message: err.message } }));
  });
  // Keep-alive sockets of the page must not hold the exit back.
  server.keepAliveTimeout = 5000;

  let stopping = null;
  const stop = () => {
    if (!stopping) {
      stopping = api.shutdown().catch(() => {}).finally(() => {
        server.close();
        if (server.closeAllConnections) server.closeAllConnections();
      });
    }
    return stopping;
  };

  const ready = new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      // "Start the server when the app opens".
      if (autoStart && api.session.get().autoStart) api.call('server.start', {}).catch(() => { /* the log shows why */ });
      resolve({ port, token });
    });
  });
  return { api, server, ready, stop, token };
}

if (require.main === module) {
  const buildInfo = process.env.MFS_BUILD_INFO ? readJson(process.env.MFS_BUILD_INFO) : null;
  const host = startHost({ configDir: process.env.MFS_CONFIG_DIR, version: process.env.MFS_VERSION || '', buildInfo });
  // Log lines go to stderr (the shell's console in `npm start`); stdout is the protocol.
  host.api.log.on('line', (l) => { if (l.level !== 'trace') process.stderr.write(`[${l.level}] ${l.text}\n`); });
  host.ready.then(({ port, token }) => {
    process.stdout.write(`${JSON.stringify({ ready: true, port, token })}\n`);
  }, (err) => {
    process.stdout.write(`${JSON.stringify({ ready: false, error: err.message })}\n`);
    process.exit(1);
  });
  const quit = () => host.stop().finally(() => process.exit(0));
  process.stdin.on('end', quit);
  process.stdin.on('close', quit);
  process.stdin.resume();
  process.on('SIGINT', quit);
  process.on('SIGTERM', quit);
}

module.exports = { startHost };

#!/usr/bin/env node
// Desktop sidecar. Tauri starts this and reads MCC_READY from stdout.
'use strict';

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createHandler } = require('../server/handle');

const root = path.join(__dirname, '..');
const token = crypto.randomBytes(24).toString('hex');
const config = arg('config');
// Page origins of the Tauri window: the Vite dev server in `npm start`, and
// the bundled app on Windows (http(s)://tauri.localhost) and macOS/Linux (tauri://localhost).
// The dev port is 5210 or the next free one (scripts/start.mjs passes MCC_DEV_PORT).
const devPort = Number(process.env.MCC_DEV_PORT) || 5210;
const corsOrigins = [
  `http://localhost:${devPort}`, `http://127.0.0.1:${devPort}`,
  'http://tauri.localhost', 'https://tauri.localhost', 'tauri://localhost',
];
applyInstallLanguage();
const { handle } = createHandler({ token, corsOrigins, configDir: config || undefined, version: readVersion(), scheduler: true, localFiles: true });

const server = http.createServer((req, res) => {
  handle(req, res).then((done) => {
    if (!done) { res.writeHead(404); res.end(); }
  }).catch((err) => {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: { message: err.message } }));
  });
});

server.listen(0, '127.0.0.1', () => {
  const { port } = server.address();
  process.stdout.write(`MCC_READY ${JSON.stringify({ port, token })}\n`);
});

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return '';
}
// The installer writes the language picked in its first page (ko / en) to
// <install dir>/install-language. Each installation sets the app's language
// once; changes made in the app afterwards stay until the next installation.
function applyInstallLanguage() {
  const file = process.env.MCC_INSTALL_LANGUAGE_FILE || path.join(root, '..', 'install-language');
  let lang;
  let stamp;
  try {
    lang = fs.readFileSync(file, 'utf8').trim();
    stamp = `${lang}@${Math.round(fs.statSync(file).mtimeMs)}`;
  } catch {
    return;
  }
  if (lang !== 'ko' && lang !== 'en') return;
  try {
    const { createStore } = require('../core/store');
    const store = createStore(config || undefined);
    const ws = store.load();
    if ((ws.settings || {}).installLanguage === stamp) return;
    ws.settings = { ...(ws.settings || {}), language: lang, installLanguage: stamp };
    store.save(ws);
  } catch { /* the app starts in its saved language */ }
}

function readVersion() {
  try { return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version; } catch { return '1.0.0'; }
}

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
const corsOrigins = [
  'http://localhost:5210', 'http://127.0.0.1:5210',
  'http://tauri.localhost', 'https://tauri.localhost', 'tauri://localhost',
];
const { handle } = createHandler({ token, corsOrigins, configDir: config || undefined, version: readVersion() });

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
function readVersion() {
  try { return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version; } catch { return '1.0.0'; }
}

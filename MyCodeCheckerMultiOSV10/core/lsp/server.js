#!/usr/bin/env node
'use strict';

// Entry point: `node core/lsp/server.js --stdio`
// Speaks the Language Server Protocol on stdin/stdout. Nothing else may write
// to stdout, so console output is sent to stderr.

const { createLanguageServer } = require('./index');

for (const name of ['log', 'info', 'debug']) console[name] = (...args) => process.stderr.write(`${args.join(' ')}\n`);

let version = '1.0.0';
try { version = require('../../package.json').version || version; } catch { /* bundled without package.json */ }

createLanguageServer(process.stdin, process.stdout, {
  version,
  onExit: (code) => process.exit(code),
  onClose: () => process.exit(0),
});

process.stdin.resume();

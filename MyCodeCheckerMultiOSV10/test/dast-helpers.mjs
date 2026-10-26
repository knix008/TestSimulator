import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Client } = require('../core/dast/client.js');
const { createScope } = require('../core/dast/scope.js');

export function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });
}

export function close(server) {
  return new Promise((resolve) => {
    if (server.closeAllConnections) server.closeAllConnections();
    server.close(() => resolve());
  });
}

export function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

export function rulesOf(result) {
  return new Set(result.findings.map((f) => f.rule));
}

export function makeClient(base) {
  return new Client({ scope: createScope({ target: base }), rateLimit: 1000, maxRequests: 500 });
}

export function html(res, code, body, headers = {}) {
  res.writeHead(code, { 'Content-Type': 'text/html', ...headers });
  res.end(body);
}

export { http, createScope };

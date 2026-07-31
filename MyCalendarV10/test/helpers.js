// Shared test helpers: spin up the real server on a throwaway SQLite DB.
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

// Start an isolated server instance backed by a temp data dir + random port.
async function startTestServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mycal-test-'));
  process.env.CALENDAR_DATA_PATH = dir;
  process.env.DISABLE_SUB_INTERVAL = '1'; // no background timer during tests

  // require after env is set (server reads the data path at start time)
  const { startServer, stopServer } = require('../server');
  const port = await startServer(0); // 0 → OS-assigned free port
  const base = `http://127.0.0.1:${port}`;

  return {
    base,
    port,
    dir,
    api: (method, url, body) => api(base, method, url, body),
    close: async () => {
      await stopServer();
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    },
  };
}

async function api(base, method, url, body) {
  // Connection: close avoids undici keep-alive sockets lingering after tests.
  const opts = { method, headers: { 'Content-Type': 'application/json', 'Connection': 'close' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(base + url, opts);
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

// A tiny HTTP server that serves an .ics string (for subscription tests).
function startIcsServer(getBody) {
  const http = require('node:http');
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'text/calendar');
      res.end(typeof getBody === 'function' ? getBody() : getBody);
    });
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        url: `http://127.0.0.1:${port}/cal.ics`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

module.exports = { startTestServer, startIcsServer };

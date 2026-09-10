// Serves the built dist/ over plain HTTP for the Web deployment.
//   npm run build:web && npm run serve:web -- --port 8080
//
// Cross-Origin-Opener-Policy / Embedder-Policy are NOT set: the analyzer runs
// in a plain module worker and needs no SharedArrayBuffer, and setting them
// would break the File System Access directory picker on some hosts.
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', 'dist');

const argPort = process.argv.indexOf('--port');
const port = Number(argPort > -1 ? process.argv[argPort + 1] : process.env.PORT || 8080);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

if (!fs.existsSync(root)) {
  console.error('[serve-web] dist/ not found. Run: npm run build:web');
  process.exit(1);
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (rel === '') rel = 'index.html';

    // Contain the resolved path inside dist/ — no traversal out of the root.
    const filePath = path.resolve(root, rel);
    if (!filePath.startsWith(path.resolve(root))) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        // SPA fallback
        fs.readFile(path.join(root, 'index.html'), (e2, html) => {
          if (e2) {
            res.writeHead(404).end('Not found');
            return;
          }
          res.writeHead(200, { 'Content-Type': MIME['.html'] }).end(html);
        });
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' }).end(data);
    });
  })
  .listen(port, () => {
    console.log(`[serve-web] CodeFactory Web  ->  http://localhost:${port}`);
    console.log('[serve-web] Directory analysis needs a Chromium browser (File System Access API)');
    console.log('[serve-web] or any browser via the "폴더 업로드" fallback.');
  });

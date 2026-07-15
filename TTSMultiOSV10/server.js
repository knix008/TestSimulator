import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = __dirname;
const port = Number(process.env.PORT || 4173);

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.json', 'application/json; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8']
]);

const server = http.createServer((request, response) => {
  const requestedPath = request.url === '/' ? '/index.html' : decodeURIComponent(request.url.split('?')[0]);
  const filePath = path.join(root, requestedPath);

  if (!filePath.startsWith(root) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  response.writeHead(200, {
    'Content-Type': mimeTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream'
  });
  createReadStream(filePath).pipe(response);
});

server.listen(port, () => {
  console.log(`Web preview running at http://localhost:${port}`);
});

'use strict';
/**
 * Serve the renderer directly in a browser (no Electron, no build step).
 *
 *   node scripts/start-web.js
 *   npm run start:web
 *   npm run web
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PROJECT = path.join(__dirname, '..');
const ROOT = path.join(PROJECT, 'src', 'renderer');
const SAMPLES = path.join(PROJECT, 'samples');
const MEDIAINFO = path.join(PROJECT, 'node_modules', 'mediainfo.js', 'dist');
const HOST = process.env.AV_WEB_HOST || '127.0.0.1';
const PORT = Number(process.env.AV_WEB_PORT || 4173);
const OPEN = !process.argv.includes('--no-open');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.m4a': 'audio/mp4',
  '.wasm': 'application/wasm',
};

function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent((urlPath || '/').split('?')[0].split('#')[0]);
  const rel = decoded.replace(/^\/+/, '');
  const full = path.normalize(path.join(root, rel || 'index.html'));
  if (!full.startsWith(path.normalize(root + path.sep)) && full !== path.normalize(root)) {
    return null;
  }
  return full;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}

function openBrowser(url) {
  const plat = process.platform;
  try {
    if (plat === 'win32') {
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    } else if (plat === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch (err) {
    console.warn('[start:web] Could not open browser:', err.message);
  }
}

function resolveRequest(urlPath) {
  const clean = (urlPath || '/').split('?')[0].split('#')[0];
  if (clean === '/samples' || clean.startsWith('/samples/')) {
    const rel = clean === '/samples' ? '/manifest.json' : clean.slice('/samples'.length);
    return safeJoin(SAMPLES, rel || '/manifest.json');
  }
  if (clean === '/mediainfo' || clean.startsWith('/mediainfo/')) {
    const rel = clean === '/mediainfo' ? '/esm-bundle/index.js' : clean.slice('/mediainfo'.length);
    return safeJoin(MEDIAINFO, rel || '/esm-bundle/index.js');
  }
  return safeJoin(ROOT, clean);
}

if (!fs.existsSync(ROOT)) {
  console.error('[start:web] Renderer not found:', ROOT);
  process.exit(1);
}

const server = http.createServer((req, res) => {
  let filePath = resolveRequest(req.url || '/');
  if (!filePath) {
    send(res, 403, 'Forbidden');
    return;
  }

  fs.stat(filePath, (err, st) => {
    if (!err && st.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    // Support Range requests for media seeking
    fs.open(filePath, 'r', (openErr, fd) => {
      if (openErr) {
        send(res, 404, `Not found: ${req.url}`);
        return;
      }
      fs.fstat(fd, (statErr, st2) => {
        if (statErr) {
          fs.close(fd, () => {});
          send(res, 404, `Not found: ${req.url}`);
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const type = MIME[ext] || 'application/octet-stream';
        const size = st2.size;
        const range = req.headers.range;

        if (range && /^bytes=/.test(range)) {
          const m = /^bytes=(\d*)-(\d*)$/.exec(range);
          let start = m && m[1] ? parseInt(m[1], 10) : 0;
          let end = m && m[2] ? parseInt(m[2], 10) : size - 1;
          if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
            fs.close(fd, () => {});
            res.writeHead(416, { 'Content-Range': `bytes */${size}` });
            res.end();
            return;
          }
          end = Math.min(end, size - 1);
          const chunk = end - start + 1;
          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunk,
            'Content-Type': type,
            'Cache-Control': 'no-store',
          });
          fs.createReadStream(null, { fd, start, end, autoClose: true }).pipe(res);
          return;
        }

        res.writeHead(200, {
          'Content-Type': type,
          'Content-Length': size,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-store',
        });
        if (req.method === 'HEAD') {
          fs.close(fd, () => {});
          res.end();
          return;
        }
        fs.createReadStream(null, { fd, autoClose: true }).pipe(res);
      });
    });
  });
});

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}/`;
  console.log('');
  console.log('  AV Editor (web)');
  console.log(`  Serving: ${ROOT}`);
  console.log(`  Samples: ${SAMPLES}`);
  console.log(`  URL:     ${url}`);
  console.log('  Press Ctrl+C to stop');
  console.log('');
  if (OPEN) openBrowser(url);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[start:web] Port ${PORT} is in use. Try: set AV_WEB_PORT=4174 && npm run start:web`);
  } else {
    console.error('[start:web]', err);
  }
  process.exit(1);
});

'use strict';
/**
 * Serve the renderer directly in a browser (no Electron, no build step).
 * Proxies /ollama/* → local Ollama (avoids browser CORS).
 *
 *   node scripts/start-web.js
 *   npm run start:web
 *   npm run web
 *
 * Env:
 *   AV_WEB_HOST, AV_WEB_PORT
 *   AV_OLLAMA_URL  (default http://127.0.0.1:11434)
 *   AV_WEB_ROOT    (optional override of renderer root)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { URL } = require('url');

const PROJECT = path.join(__dirname, '..');
const ROOT = process.env.AV_WEB_ROOT
  ? path.resolve(process.env.AV_WEB_ROOT)
  : path.join(PROJECT, 'src', 'renderer');
const SAMPLES = path.join(PROJECT, 'samples');
const MEDIAINFO = path.join(PROJECT, 'node_modules', 'mediainfo.js', 'dist');
const XENOVA = path.join(PROJECT, 'node_modules', '@xenova', 'transformers');
const HOST = process.env.AV_WEB_HOST || '127.0.0.1';
const PORT = Number(process.env.AV_WEB_PORT || 4173);
const OLLAMA = (process.env.AV_OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
const OPEN = !process.argv.includes('--no-open');

const WHISPER_QUANTIZED_FILES = [
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/encoder_model_quantized.onnx',
  'onnx/decoder_model_merged_quantized.onnx',
];

function whisperCacheCandidates() {
  const list = [
    path.join(PROJECT, '.cache', 'whisper-models'),
  ];
  if (process.env.APPDATA) {
    list.push(path.join(process.env.APPDATA, 'AV Editor', 'whisper-models'));
  }
  if (process.env.HOME || process.env.USERPROFILE) {
    list.push(path.join(process.env.HOME || process.env.USERPROFILE, '.av-editor', 'whisper-models'));
  }
  return list;
}

function isWhisperCachedAt(dir, modelId = 'Xenova/whisper-tiny') {
  if (!dir || !fs.existsSync(dir)) return false;
  return WHISPER_QUANTIZED_FILES.every((file) => {
    const p = path.join(dir, ...modelId.split('/'), 'resolve', 'main', ...file.split('/'));
    try {
      return fs.existsSync(p) && fs.statSync(p).size > 0;
    } catch {
      return false;
    }
  });
}

/** Prefer an existing full Whisper cache (Electron userData) over empty project .cache. */
function resolveWhisperCacheDir() {
  const candidates = whisperCacheCandidates();
  for (const dir of candidates) {
    if (isWhisperCachedAt(dir)) return dir;
  }
  const fallback = candidates[0];
  try {
    fs.mkdirSync(fallback, { recursive: true });
  } catch { /* ignore */ }
  return fallback;
}

const WHISPER_CACHE = resolveWhisperCacheDir();

try {
  require('./sync-transformers-vendor.js').main();
} catch (err) {
  console.warn('[web] Transformers vendor sync failed:', err?.message || err);
}

console.log('[web] Whisper cache:', WHISPER_CACHE,
  isWhisperCachedAt(WHISPER_CACHE) ? '(complete — no download)' : '(will download on first use)');


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
  if (clean === '/xenova' || clean.startsWith('/xenova/')) {
    const rel = clean === '/xenova' ? '/dist/transformers.min.js' : clean.slice('/xenova'.length);
    return safeJoin(XENOVA, rel || '/dist/transformers.min.js');
  }
  return safeJoin(ROOT, clean);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function proxyOllama(req, res) {
  const incoming = new URL(req.url || '/', `http://${HOST}:${PORT}`);
  const targetPath = incoming.pathname.replace(/^\/ollama/, '') || '/';
  const targetUrl = `${OLLAMA}${targetPath}${incoming.search || ''}`;

  try {
    const headers = { ...req.headers };
    delete headers.host;
    delete headers.connection;
    delete headers['content-length'];

    const init = {
      method: req.method || 'GET',
      headers,
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      init.body = await readRequestBody(req);
    }

    const upstream = await fetch(targetUrl, init);
    const buf = Buffer.from(await upstream.arrayBuffer());
    const outHeaders = {
      'Cache-Control': 'no-store',
      'Content-Type': upstream.headers.get('content-type') || 'application/json',
      'Content-Length': buf.length,
    };
    res.writeHead(upstream.status, outHeaders);
    res.end(buf);
  } catch (err) {
    send(res, 502, JSON.stringify({
      error: `Ollama proxy failed: ${err.message || err}. Is Ollama running at ${OLLAMA}?`,
    }), { 'Content-Type': 'application/json; charset=utf-8' });
  }
}

function whisperCacheFile(rel) {
  const parts = String(rel || '').split(/[/\\]+/).filter((p) => p && p !== '.' && p !== '..');
  if (!parts.length) return null;
  const file = path.resolve(path.join(WHISPER_CACHE, ...parts));
  const root = path.resolve(WHISPER_CACHE);
  const relTo = path.relative(root, file);
  if (!relTo || relTo.startsWith('..') || path.isAbsolute(relTo)) return null;
  return file;
}

async function proxyHuggingFace(req, res) {
  const incoming = new URL(req.url || '/', `http://${HOST}:${PORT}`);
  const rel = incoming.pathname.replace(/^\/hf\/?/, '');
  if (!rel || rel.includes('..')) {
    send(res, 400, 'Bad path');
    return;
  }

  const cacheFile = whisperCacheFile(rel);
  if (cacheFile && fs.existsSync(cacheFile)) {
    const buf = fs.readFileSync(cacheFile);
    const ext = path.extname(cacheFile).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': buf.length,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*',
      'X-AV-Cache': 'HIT',
    });
    res.end(req.method === 'HEAD' ? undefined : buf);
    return;
  }

  try {
    const target = `https://huggingface.co/${rel}${incoming.search || ''}`;
    console.log('[web] whisper download', rel);
    const upstream = await fetch(target, {
      redirect: 'follow',
      headers: { 'User-Agent': 'AVEditor-Web-STT/1.0', Accept: '*/*' },
    });
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (upstream.ok && cacheFile && buf.length) {
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
      fs.writeFileSync(cacheFile, buf);
    }
    res.writeHead(upstream.status, {
      'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
      'Content-Length': buf.length,
      'Cache-Control': upstream.ok ? 'public, max-age=31536000, immutable' : 'no-store',
      'Access-Control-Allow-Origin': '*',
      'X-AV-Cache': 'MISS',
    });
    res.end(req.method === 'HEAD' ? undefined : buf);
  } catch (err) {
    send(res, 502, `HF proxy failed: ${err.message || err}`);
  }
}

function whisperLocalModelFile(rel) {
  const parts = String(rel || '').split(/[/\\]+/).filter((p) => p && p !== '.' && p !== '..');
  if (parts.length < 2) return null;
  const modelId = parts.slice(0, 2).join('/');
  const rest = parts.slice(2).join('/');
  const hfRel = rest ? `${modelId}/resolve/main/${rest}` : `${modelId}/resolve/main`;
  return whisperCacheFile(hfRel);
}

function serveWhisperCacheStatus(req, res) {
  const u = new URL(req.url || '/', `http://${HOST}:${PORT}`);
  const model = u.searchParams.get('model') || 'Xenova/whisper-tiny';
  const body = JSON.stringify({
    cached: isWhisperCachedAt(WHISPER_CACHE, model),
    model,
    cacheDir: WHISPER_CACHE,
  });
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function serveLocalWhisperModel(req, res) {
  const incoming = new URL(req.url || '/', `http://${HOST}:${PORT}`);
  const rel = incoming.pathname.replace(/^\/models\/?/, '');
  if (!rel || rel.includes('..')) {
    send(res, 400, 'Bad path');
    return;
  }
  const file = whisperLocalModelFile(rel);
  if (!file || !fs.existsSync(file)) {
    send(res, 404, `Missing local model file: ${rel}`);
    return;
  }
  const buf = fs.readFileSync(file);
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': buf.length,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Access-Control-Allow-Origin': '*',
    'X-AV-Cache': 'LOCAL',
  });
  res.end(req.method === 'HEAD' ? undefined : buf);
}

if (!fs.existsSync(ROOT)) {
  console.error('[start:web] Renderer not found:', ROOT);
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const clean = (req.url || '/').split('?')[0];
  if (clean === '/ollama' || clean.startsWith('/ollama/')) {
    proxyOllama(req, res);
    return;
  }
  if (clean === '/whisper-cache') {
    serveWhisperCacheStatus(req, res);
    return;
  }
  if (clean === '/models' || clean.startsWith('/models/')) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      });
      res.end();
      return;
    }
    serveLocalWhisperModel(req, res);
    return;
  }
  if (clean === '/hf' || clean.startsWith('/hf/')) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      });
      res.end();
      return;
    }
    proxyHuggingFace(req, res);
    return;
  }

  let filePath = resolveRequest(req.url || '/');
  if (!filePath) {
    send(res, 403, 'Forbidden');
    return;
  }

  fs.stat(filePath, (err, st) => {
    if (!err && st.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

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
  console.log(`  Whisper: ${WHISPER_CACHE}${isWhisperCachedAt(WHISPER_CACHE) ? ' (complete — /models local)' : ' (download on first use → /hf cache)'}`);
  console.log(`  Ollama:  ${OLLAMA}  (proxied at ${url}ollama/)`);
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

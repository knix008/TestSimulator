'use strict';
/**
 * Local HTTP proxy for Whisper STT in Electron.
 * Renderer runs on file:// so direct fetches to Hugging Face / CDN fail (CORS).
 * This loopback server proxies HF (with on-disk cache) and serves ONNX WASM.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const crypto = require('crypto');

let server = null;
let baseUrl = null;
let cacheDir = null;

/** Files required for Xenova quantized Whisper ASR (must match transformers.js). */
const WHISPER_QUANTIZED_FILES = [
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/encoder_model_quantized.onnx',
  'onnx/decoder_model_merged_quantized.onnx',
];

const MIME = {
  '.wasm': 'application/wasm',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.onnx': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8',
  '.bin': 'application/octet-stream',
  '.model': 'application/octet-stream',
};

function sendCors(res, status, headers = {}) {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Expose-Headers': '*',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    ...headers,
  });
}

function contentTypeFor(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

/** Map HF path → safe cache file under cacheDir. */
function resolveCacheFile(relPath) {
  if (!cacheDir) return null;
  const parts = String(relPath || '')
    .split(/[/\\]+/)
    .filter((p) => p && p !== '.' && p !== '..');
  if (!parts.length) return null;
  const filePath = path.resolve(path.join(cacheDir, ...parts));
  const root = path.resolve(cacheDir);
  const rel = path.relative(root, filePath);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return filePath;
}

function metaPathFor(cacheFile) {
  return `${cacheFile}.meta.json`;
}

function readCache(relPath) {
  const file = resolveCacheFile(relPath);
  if (!file || !fs.existsSync(file)) return null;
  try {
    const buf = fs.readFileSync(file);
    let contentType = contentTypeFor(file);
    const metaFile = metaPathFor(file);
    if (fs.existsSync(metaFile)) {
      const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
      if (meta?.contentType) contentType = meta.contentType;
    }
    return { buf, contentType, file };
  } catch {
    return null;
  }
}

function writeCache(relPath, buf, contentType) {
  const file = resolveCacheFile(relPath);
  if (!file) return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, file);
    fs.writeFileSync(metaPathFor(file), JSON.stringify({
      contentType: contentType || 'application/octet-stream',
      savedAt: new Date().toISOString(),
      bytes: buf.length,
      etag: crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16),
    }), 'utf8');
  } catch (err) {
    console.warn('[stt-proxy] cache write failed:', err?.message || err);
  }
}

/**
 * HF cache layout: {model}/resolve/main/{file}
 * Transformers localModelPath layout: {model}/{file}
 */
function resolveLocalModelFile(relPath) {
  if (!cacheDir) return null;
  const parts = String(relPath || '')
    .split(/[/\\]+/)
    .filter((p) => p && p !== '.' && p !== '..');
  if (parts.length < 2) return null;
  // Xenova/whisper-tiny/... → Xenova/whisper-tiny/resolve/main/...
  const modelId = parts.slice(0, 2).join('/');
  const rest = parts.slice(2).join('/');
  const hfRel = rest ? `${modelId}/resolve/main/${rest}` : `${modelId}/resolve/main`;
  return resolveCacheFile(hfRel);
}

function isWhisperModelCached(modelId = 'Xenova/whisper-tiny') {
  const id = String(modelId || 'Xenova/whisper-tiny').replace(/^\/+|\/+$/g, '');
  if (!cacheDir || !id) return false;
  return WHISPER_QUANTIZED_FILES.every((file) => {
    const p = resolveCacheFile(`${id}/resolve/main/${file}`);
    if (!p || !fs.existsSync(p)) return false;
    try {
      return fs.statSync(p).size > 0;
    } catch {
      return false;
    }
  });
}

function serveLocalFile(filePath, req, res, cacheHeader = 'HIT') {
  const st = fs.statSync(filePath);
  sendCors(res, 200, {
    'Content-Type': contentTypeFor(filePath),
    'Content-Length': st.size,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-AV-Cache': cacheHeader,
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

async function proxyHuggingFace(rel, search, req, res) {
  // Serve from disk cache when present (skip re-download across app restarts)
  const cached = readCache(rel);
  if (cached) {
    console.log('[stt-proxy] cache hit', rel);
    sendCors(res, 200, {
      'Content-Type': cached.contentType,
      'Content-Length': cached.buf.length,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-AV-Cache': 'HIT',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    res.end(cached.buf);
    return;
  }

  const target = `https://huggingface.co/${rel}${search || ''}`;
  console.log('[stt-proxy] downloading', rel);
  const upstream = await fetch(target, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'User-Agent': 'AVEditor-STT/1.0',
      Accept: '*/*',
    },
  });
  const buf = Buffer.from(await upstream.arrayBuffer());
  const contentType = upstream.headers.get('content-type') || contentTypeFor(rel);

  if (upstream.ok && buf.length > 0) {
    writeCache(rel, buf, contentType);
  }

  sendCors(res, upstream.status, {
    'Content-Type': contentType,
    'Content-Length': buf.length,
    'Cache-Control': upstream.ok
      ? 'public, max-age=31536000, immutable'
      : 'no-store',
    'X-AV-Cache': 'MISS',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  res.end(buf);
}

/**
 * @param {{ vendorDir?: string, cacheDir?: string }} opts
 * @returns {Promise<string>} base URL e.g. http://127.0.0.1:54321
 */
function startTransformersProxy(opts = {}) {
  if (baseUrl) return Promise.resolve(baseUrl);

  const vendorDir = opts.vendorDir
    || path.join(__dirname, '../renderer/vendor/transformers');
  cacheDir = opts.cacheDir
    || path.join(require('os').homedir(), '.av-editor', 'whisper-models');
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
  } catch (err) {
    console.warn('[stt-proxy] could not create cache dir:', err?.message || err);
  }
  console.log('[stt-proxy] model cache:', cacheDir,
    isWhisperModelCached() ? '(complete — no download)' : '(incomplete — will download)');


  return new Promise((resolve, reject) => {
    server = http.createServer(async (req, res) => {
      try {
        if (req.method === 'OPTIONS') {
          sendCors(res, 204);
          res.end();
          return;
        }

        const u = new URL(req.url || '/', 'http://127.0.0.1');

        // GET /whisper-cache?model=Xenova/whisper-tiny
        if (u.pathname === '/whisper-cache') {
          const model = u.searchParams.get('model') || 'Xenova/whisper-tiny';
          const cached = isWhisperModelCached(model);
          const body = JSON.stringify({
            cached,
            model,
            cacheDir,
          });
          sendCors(res, 200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
          });
          res.end(body);
          return;
        }

        // GET /models/<org>/<name>/...  → disk cache (HF resolve/main layout)
        // Used by transformers.js env.localModelPath so cached models skip HF.
        if (u.pathname === '/models' || u.pathname.startsWith('/models/')) {
          const rel = u.pathname.replace(/^\/models\/?/, '');
          if (!rel || rel.includes('..')) {
            sendCors(res, 400, { 'Content-Type': 'text/plain' });
            res.end('Bad path');
            return;
          }
          const filePath = resolveLocalModelFile(rel);
          if (!filePath || !fs.existsSync(filePath)) {
            sendCors(res, 404, { 'Content-Type': 'text/plain' });
            res.end(`Missing local model file: ${rel}`);
            return;
          }
          console.log('[stt-proxy] local model', rel);
          serveLocalFile(filePath, req, res, 'LOCAL');
          return;
        }

        // GET /hf/<huggingface path...>  →  https://huggingface.co/<...> (+ disk cache)
        if (u.pathname === '/hf' || u.pathname.startsWith('/hf/')) {
          const rel = u.pathname.replace(/^\/hf\/?/, '');
          if (!rel || rel.includes('..')) {
            sendCors(res, 400, { 'Content-Type': 'text/plain' });
            res.end('Bad path');
            return;
          }
          await proxyHuggingFace(rel, u.search, req, res);
          return;
        }

        // GET /xenova-wasm/<file>  →  local vendor/transformers
        if (u.pathname === '/xenova-wasm' || u.pathname.startsWith('/xenova-wasm/')) {
          const name = path.basename(u.pathname);
          if (!name || name === 'xenova-wasm' || name.includes('..')) {
            sendCors(res, 400, { 'Content-Type': 'text/plain' });
            res.end('Bad path');
            return;
          }
          const filePath = path.resolve(path.join(vendorDir, name));
          const root = path.resolve(vendorDir);
          const relToRoot = path.relative(root, filePath);
          if (!relToRoot || relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) {
            sendCors(res, 403);
            res.end('Forbidden');
            return;
          }
          if (!fs.existsSync(filePath)) {
            sendCors(res, 404, { 'Content-Type': 'text/plain' });
            res.end(`Missing ${name}`);
            return;
          }
          const st = fs.statSync(filePath);
          sendCors(res, 200, {
            'Content-Type': contentTypeFor(filePath),
            'Content-Length': st.size,
            'Cache-Control': 'public, max-age=604800',
          });
          if (req.method === 'HEAD') {
            res.end();
            return;
          }
          fs.createReadStream(filePath).pipe(res);
          return;
        }

        sendCors(res, 404, { 'Content-Type': 'text/plain' });
        res.end('STT proxy: use /hf/, /models/, /whisper-cache, or /xenova-wasm/');
      } catch (err) {
        console.warn('[stt-proxy]', err?.message || err);
        try {
          sendCors(res, 502, { 'Content-Type': 'text/plain' });
          res.end(String(err?.message || err));
        } catch { /* ignore */ }
      }
    });

    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      baseUrl = `http://127.0.0.1:${port}`;
      console.log(`[stt-proxy] listening on ${baseUrl}`);
      resolve(baseUrl);
    });
  });
}

function getTransformersProxyBase() {
  return baseUrl;
}

function getTransformersCacheDir() {
  return cacheDir;
}

function stopTransformersProxy() {
  return new Promise((resolve) => {
    if (!server) {
      baseUrl = null;
      resolve();
      return;
    }
    server.close(() => {
      server = null;
      baseUrl = null;
      resolve();
    });
  });
}

module.exports = {
  startTransformersProxy,
  getTransformersProxyBase,
  getTransformersCacheDir,
  isWhisperModelCached,
  stopTransformersProxy,
  WHISPER_QUANTIZED_FILES,
};

// Vite plugin for the AI singing voice (src/audio/singer/):
//  • serves onnxruntime-web's files at ./ort/ in dev and copies them into dist/ort/ (no CDN: the
//    desktop app and the web build both load them from the app itself);
//  • sends Cross-Origin-Opener-Policy / Cross-Origin-Embedder-Policy so the page is cross-origin
//    isolated and onnxruntime can use WebAssembly threads (SharedArrayBuffer). "credentialless"
//    keeps cross-origin images, fonts and API calls working without CORP headers;
//  • /__voicebank_proxy?url=… (dev and preview servers only): GitHub release files carry no CORS
//    headers, so the web page downloads the catalog files through the local server. Only the URLs in
//    the catalog are forwarded.
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { CATALOG } from '../src/audio/singer/catalog.js';

const ORT_DIR = fileURLToPath(new URL('../node_modules/onnxruntime-web/dist/', import.meta.url));
/** The WebGPU build (it includes the WebAssembly backend) and its runtime. */
export const ORT_FILES = ['ort.webgpu.min.mjs', 'ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm'];
export const ISOLATION_HEADERS = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless' };
const TYPES = { '.mjs': 'text/javascript', '.wasm': 'application/wasm' };

function serveOrt(req, res, next) {
  const name = decodeURIComponent((req.url ?? '').split('?')[0].replace(/^.*\/ort\//, ''));
  if (!ORT_FILES.includes(name)) return next();
  const file = ORT_DIR + name;
  if (!existsSync(file)) return next();
  res.setHeader('Content-Type', TYPES[name.slice(name.lastIndexOf('.'))] ?? 'application/octet-stream');
  res.setHeader('Content-Length', statSync(file).size);
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  createReadStream(file).pipe(res);
  return undefined;
}

const ALLOWED = new Set(Object.values(CATALOG).map((c) => c.url));

async function proxy(req, res, next) {
  const url = new URL(req.url ?? '', 'http://local').searchParams.get('url');
  if (!url) return next();
  if (!ALLOWED.has(url)) { res.statusCode = 403; res.end('Not a catalog file'); return undefined; }
  try {
    const headers = { 'User-Agent': 'MyAudioMaker-voicebank' };
    if (req.headers.range) headers.Range = req.headers.range;
    const upstream = await fetch(url, { headers, redirect: 'follow' });
    res.statusCode = upstream.status;
    for (const h of ['content-length', 'content-range', 'accept-ranges', 'content-type']) { const v = upstream.headers.get(h); if (v) res.setHeader(h, v); }
    if (!upstream.body) { res.end(); return undefined; }
    const body = Readable.fromWeb(upstream.body);
    req.on('close', () => body.destroy());
    body.pipe(res);
  } catch (error) {
    res.statusCode = 502;
    res.end(String(error.message ?? error));
  }
  return undefined;
}

export function voicePlugin() {
  return {
    name: 'myaudiomaker-voice',
    configureServer(server) {
      server.middlewares.use((req, res, next) => (/\/ort\//.test(req.url ?? '') ? serveOrt(req, res, next) : next()));
      server.middlewares.use('/__voicebank_proxy', proxy);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/__voicebank_proxy', proxy);
    },
    generateBundle() {
      for (const name of ORT_FILES) this.emitFile({ type: 'asset', fileName: `ort/${name}`, source: readFileSync(ORT_DIR + name) });
    },
  };
}

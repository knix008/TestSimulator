// .mjs: the package has no "type": "module" (core/*.js and server/server.js are
// CommonJS), so a bare .js config would be loaded through
// the deprecated CJS Node API of Vite.
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';

// The DICOM codecs (@cornerstonejs/codec-*) are Emscripten builds whose glue does `require('fs')` /
// `require('path')` inside an `if (ENVIRONMENT_IS_NODE)` branch that never runs in the renderer
// (no `process` in the page). Vite still resolves the names and warns on every build that it
// "externalized" them; pointing both at an empty module keeps the log clean without changing anything.
const empty = fileURLToPath(new URL('./src/lib/empty-module.js', import.meta.url));
const docRoot = fileURLToPath(new URL('./doc', import.meta.url));

// The illustrated manual lives in doc/ and is opened from the start screen
// and at /doc/ in a browser. Dev serves that folder; the production build
// copies it into dist/doc so the desktop webview and the web server have it.
function manualPlugin() {
  const types = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  };
  return {
    name: 'manual-doc',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = decodeURIComponent((req.url || '').split('?')[0]);
        if (pathname !== '/doc' && !pathname.startsWith('/doc/')) return next();
        let rel = pathname === '/doc' || pathname === '/doc/' ? 'index.html' : pathname.slice('/doc/'.length);
        if (!rel || rel.endsWith('/')) rel += 'index.html';
        const file = path.normalize(path.join(docRoot, rel));
        if (!file.startsWith(path.normalize(docRoot))) return next();
        fs.stat(file, (err, st) => {
          if (err || !st.isFile()) { res.statusCode = 404; res.end('Not found'); return; }
          res.setHeader('Content-Type', types[path.extname(file).toLowerCase()] || 'application/octet-stream');
          res.setHeader('Cache-Control', 'no-cache');
          fs.createReadStream(file).pipe(res);
        });
      });
    },
    closeBundle() {
      fs.cpSync(docRoot, fileURLToPath(new URL('./dist/doc', import.meta.url)), { recursive: true });
    },
  };
}

// Production Electron loads dist/index.html via file:// and the web server
// serves it from any path, so every asset path must be relative.
export default defineConfig({
  base: './',
  plugins: [react(), manualPlugin()],
  resolve: { alias: [{ find: /^(fs|path)$/, replacement: empty }] },
  server: {
    port: 5185,
    strictPort: true,
    // `npm run dev` + `npm run web:serve` → the browser UI talks to the API server.
    proxy: { '/api': 'http://127.0.0.1:5186' },
    // Build output and smoke screenshots must not trigger dev reloads.
    watch: { ignored: ['**/release/**', '**/dist/**', '**/.smoke/**', '**/.record/**', '**/build/**', '**/src-tauri/**', '**/doc/**'] },
  },
  // The biggest chunk is libheif-js/wasm-bundle (~1.95 MB): the HEIC / HEIF decoder with its
  // WebAssembly inlined as base64. It is already a lazy import (src/lib/images.js, fetched only
  // when a HEIC file is previewed) and cannot be split further — the separate .wasm variant
  // needs fetch(), which the desktop build's file:// origin does not allow. The DICOM codecs
  // (cornerstone, ≤ 0.6 MB each) are lazy chunks of their own too.
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 2100 },
});

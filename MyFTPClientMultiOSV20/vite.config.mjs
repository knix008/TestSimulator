// .mjs: the package has no "type": "module" (core/*.js and server/server.js
// are CommonJS), so a bare .js config would be loaded through the deprecated
// CJS Node API of Vite.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const docRoot = fileURLToPath(new URL('./doc', import.meta.url));

// The illustrated user guide lives in doc/ (index.html, manual.css/js, img/).
// The dev server serves that folder at /doc/; the build copies it into
// dist/doc, where the desktop window and the web server find it.
function userGuide() {
  const types = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  };
  return {
    name: 'user-guide',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = decodeURIComponent((req.url || '').split('?')[0]);
        if (pathname !== '/doc' && !pathname.startsWith('/doc/')) return next();
        let rel = pathname.slice('/doc'.length).replace(/^\/+/, '');
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

// The Tauri window loads dist/ from its own origin and the web server serves
// it from any path, so every asset path must be relative.
export default defineConfig({
  base: './',
  plugins: [react(), userGuide()],
  server: {
    port: 5187,
    strictPort: true,
    // `npm run dev` → the browser UI talks to the API server it started (scripts/dev.mjs).
    proxy: { '/api': `http://127.0.0.1:${process.env.MFC_API_PORT || 5188}` },
    // Build output, the Rust shell and smoke screenshots must not trigger dev reloads.
    watch: { ignored: ['**/dist/**', '**/.smoke/**', '**/src-tauri/**', '**/doc/**'] },
  },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});

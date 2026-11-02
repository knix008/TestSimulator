// The dev / preview server answers /api/ with the same file-system API as the
// web host (server/fs-api.js) and sends the cross-origin isolation headers the
// engine needs (SharedArrayBuffer).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createFsApi, defaultWebRoot, ISOLATION_HEADERS } from './server/fs-api.js';

function apiPlugin() {
  // MSM_ROOT: the work folder the page sees (default ~/MySimulationMath).
  const { handle } = createFsApi({ root: process.env.MSM_ROOT || defaultWebRoot(), jail: true, version: '1.0.0', platform: 'web' });
  const attach = (middlewares) => {
    middlewares.use(async (req, res, next) => {
      try {
        if (await handle(req, res)) return;
      } catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ ok: false, error: { code: 'EIO', message: err.message } }));
        return;
      }
      next();
    });
  };
  return {
    name: 'mysimulationmath-api',
    configureServer(server) { attach(server.middlewares); },
    configurePreviewServer(server) { attach(server.middlewares); },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), apiPlugin()],
  server: {
    host: '127.0.0.1', // not 'localhost' (Node binds that to ::1 only; tauri dev waits on IPv4)
    port: 5230,
    strictPort: true,
    headers: ISOLATION_HEADERS,
    watch: { ignored: ['**/dist/**', '**/src-tauri/**', '**/samples/**'] },
  },
  preview: { headers: ISOLATION_HEADERS },
  build: {
    outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1500,
    // libraries in their own chunks, so the app's chunk holds the app (and a library update leaves it cached)
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](@codemirror|@lezer|crelt|style-mod|w3c-keyname)[\\/]/.test(id)) return 'codemirror';
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
          if (/[\\/]node_modules[\\/](nspell|dictionary-en)[\\/]/.test(id)) return 'spell';
          if (/[\\/]node_modules[\\/]three[\\/]/.test(id)) return 'three';
          return undefined;
        },
      },
    },
  },
  // The engine worker imports core/session.js lazily (code splitting): ES module workers only.
  worker: { format: 'es' },
});

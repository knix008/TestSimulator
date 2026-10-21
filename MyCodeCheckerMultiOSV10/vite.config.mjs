// .mjs because package.json is CommonJS (core/, server/ and host/ are require()).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createHandler } = require('./server/handle.js');

function apiPlugin() {
  const { handle } = createHandler({ version: '1.0.0' });
  const attach = (middlewares) => {
    middlewares.use(async (req, res, next) => {
      try {
        if (await handle(req, res)) return;
      } catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ ok: false, error: { message: err.message } }));
        return;
      }
      next();
    });
  };
  return {
    name: 'mycodechecker-api',
    configureServer(server) { attach(server.middlewares); },
    configurePreviewServer(server) { attach(server.middlewares); },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), apiPlugin()],
  server: {
    port: 5210,
    strictPort: true,
    watch: { ignored: ['**/dist/**', '**/src-tauri/**', '**/samples/**'] },
  },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});

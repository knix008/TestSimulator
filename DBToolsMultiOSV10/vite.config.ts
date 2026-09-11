import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  // Bind an explicit IPv4 address. Left to default, Vite listens on the IPv6
  // loopback only, and "localhost" then resolves differently in Node (fetch,
  // wait-on) than in Chromium — which shows up as a blank Electron window.
  // Keep the dev watcher out of the build output. Chokidar holds a handle on
  // every directory it watches, and on Windows that blocks electron-builder
  // from renaming release/win-unpacked.tmp while `npm start` is running.
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    watch: { ignored: ['**/release/**', '**/dist/**', '**/dist-electron/**'] },
  },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 4096 },
  // sql.js ships as UMD/CommonJS. It must be pre-bundled so `import initSqlJs
  // from 'sql.js'` has a default export in dev — excluding it works in the
  // production build (Rollup converts CJS) but breaks the dev server.
  // The .wasm is loaded separately via a `?url` import, so it needs no exclude.
  optimizeDeps: { include: ['sql.js'] },
});

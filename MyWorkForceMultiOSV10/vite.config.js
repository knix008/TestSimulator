import { execSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const commit = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
})();

// Tauri expects a fixed dev server port (tauri.conf.json → build.devUrl).
// The web build is relative (base './') so dist/ can be served from any folder.
export default defineConfig({
  base: './',
  clearScreen: false,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_NAME__: JSON.stringify(pkg.productName),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    __BUILD_COMMIT__: JSON.stringify(commit),
  },
  server: {
    host: true,
    port: 1480,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**', '**/test-results/**', '**/data/**'] },
    proxy: { '/api': { target: 'http://127.0.0.1:1481', changeOrigin: true } },
  },
  plugins: [{
    name: 'myworkforce-data',
    configureServer(server) {
      const child = spawn(process.execPath, ['server/index.mjs'], { cwd: root, stdio: 'inherit', env: process.env });
      const stop = () => { if (!child.killed) child.kill(); };
      return () => server.httpServer?.once('close', stop);
    },
  }],
  optimizeDeps: { entries: ['index.html', 'chat.html'] },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        main: path.resolve(root, 'index.html'),
        talk: path.resolve(root, 'chat.html'),
      },
      output: {
        // Separate, cacheable pieces: the libraries, the guide texts and the page templates. Modules that import
        // the store stay with the program so no chunk waits on another in a loop.
        manualChunks(id) {
          const file = id.replace(/\\/g, '/');
          if (file.includes('/node_modules/')) return 'vendor';
          if (/\.md(\?raw)?$/.test(file)) return 'docs';
          if (/\/src\/domain\/(page-templates|tutorial)\.js$/.test(file)) return 'templates';
          return undefined;
        },
      },
    },
  },
});

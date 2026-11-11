import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const commit = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
})();

/**
 * The web UI talks to a core over /api and /api/live. While developing (`npm run dev:web`) Vite proxies
 * both to a web core started on a free port: MYBOARD_API_TARGET=http://127.0.0.1:<port> (scripts/dev-web.mjs
 * sets it). Without it, /api goes nowhere and the UI shows "core not reachable".
 */
const apiTarget = process.env.MYBOARD_API_TARGET || null;
const proxy = apiTarget ? { '/api': { target: apiTarget, changeOrigin: false, ws: true } } : undefined;

export default defineConfig({
  base: './',
  clearScreen: false,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_NAME__: JSON.stringify(pkg.productName),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    __BUILD_COMMIT__: JSON.stringify(commit),
  },
  // MYBOARD_NO_HMR: test servers — an edit while tests run must not reload the app under test.
  // The port is chosen by scripts/start.mjs / dev-web.mjs (a free one from 5520); 5520 is the default for `vite` alone.
  server: {
    port: Number(process.env.MYBOARD_DEV_PORT) || 5520,
    strictPort: true,
    host: '127.0.0.1',
    proxy,
    hmr: process.env.MYBOARD_NO_HMR ? false : undefined,
    // Only the UI sources: the core, server, Rust and build output are not the page's (and are big).
    watch: { ignored: ['**/src-tauri/**', '**/core/**', '**/server/**', '**/test/**', '**/test-results/**', '**/doc/**', '**/release/**', '**/dist/**', '**/data/**'] },
  },
  preview: { port: 4185, strictPort: true, host: '127.0.0.1', proxy },
  // Only the app page is an entry: Vite must not scan core/, server/ or src-tauri/target for imports.
  optimizeDeps: { entries: ['index.html'] },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: { output: { manualChunks: chunkOf } },
  },
});

/**
 * The chunk a module goes into (undefined: Rollup's choice). Imports only run downwards:
 *   vendor           — third-party code (the Tauri API)
 *   i18n, icons      — the texts and the pictures (app icons, the built-in catalogue, the emoji list)
 *   shared           — the rest of the UI (shell, api client, live channel, ui helpers)
 *   app, popup, viewer — each window's own entry module (main.js loads one of them), left to Rollup.
 */
function chunkOf(id) {
  const file = id.replace(/\\/g, '/');
  if (file.includes('/node_modules/')) return 'vendor';
  if (!file.includes('/src/')) return undefined;
  if (/\/src\/(app|popup|viewer|main)\.js$/.test(file)) return undefined;
  if (file.includes('/src/i18n')) return 'i18n';
  if (file.includes('/src/icon') || file.endsWith('/emoji-data.js')) return 'icons';
  return 'shared';
}

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

// npm start hands Vite a free port (scripts/start.mjs); the web build is relative (base './')
// so dist/ can be served from any folder.
export default defineConfig({
  base: './',
  clearScreen: false,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_NAME__: JSON.stringify(pkg.productName),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    __BUILD_COMMIT__: JSON.stringify(commit),
  },
  // MYPHOTOCUT_NO_HMR: test runs — an edit while they run must not reload the app under test.
  server: {
    port: 5530,
    strictPort: true,
    hmr: process.env.MYPHOTOCUT_NO_HMR ? false : undefined,
    watch: { ignored: ['**/src-tauri/**', '**/test-results/**', '**/docs/**', '**/samples/**', '**/release/**', '**/dist/**'] },
  },
  // Only the app page is an entry (docs/*.html are standalone documents).
  optimizeDeps: { entries: ['index.html'], exclude: ['@mediapipe/tasks-vision'] },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: { output: { manualChunks: chunkOf } },
  },
});

/** The chunk a source module goes into (null: the chunk Rollup picks, e.g. the app shell). */
function chunkOf(id) {
  const file = id.replace(/\\/g, '/');
  if (file.includes('/node_modules/@mediapipe/')) return 'facemesh';
  if (file.includes('/node_modules/')) return 'vendor';
  const area = [
    ['/src/i18n/', 'i18n'],
    ['/src/icons', 'icons'],
    ['/src/engine/', 'engine'],
    ['/src/export/', 'export'],
  ].find(([part]) => file.includes(part));
  return area ? area[1] : null;
}

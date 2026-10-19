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

// npm start hands Tauri a free port (scripts/port.mjs); 1470 is only the default.
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
  // MYTRAINER_NO_HMR: the E2E harness's own server — an edit while the tests run must not reload the app under test.
  server: { port: 1470, strictPort: true, hmr: process.env.MYTRAINER_NO_HMR ? false : undefined, watch: { ignored: ['**/src-tauri/**', '**/test-results/**', '**/docs/**', '**/samples/**', '**/python/**'] } },
  optimizeDeps: { entries: ['index.html'] },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2500,
    rollupOptions: { output: { manualChunks: chunkOf } },
  },
});

/** The chunk a source module goes into (null: the chunk Rollup picks). */
function chunkOf(id) {
  const file = id.replace(/\\/g, '/');
  if (file.includes('/node_modules/@tensorflow/')) return 'tfjs';
  if (file.includes('/node_modules/@codemirror/') || file.includes('/node_modules/@lezer/') || file.includes('/node_modules/codemirror/')) return 'editor';
  if (file.includes('/node_modules/')) return 'vendor';
  const area = [
    ['/src/i18n/', 'i18n'],
    ['/src/icons', 'icons'],
    ['/src/domain/', 'model'],
  ].find(([part]) => file.includes(part));
  return area ? area[1] : null;
}

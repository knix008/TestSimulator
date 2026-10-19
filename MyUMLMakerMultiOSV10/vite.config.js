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
  // MYUMLMAKER_NO_HMR: the E2E harness's own server — an edit while the tests run must not reload the app under test.
  server: { port: 1450, strictPort: true, hmr: process.env.MYUMLMAKER_NO_HMR ? false : undefined, watch: { ignored: ['**/src-tauri/**', '**/test-results/**', '**/docs/**', '**/samples/**'] } },
  // Only the app page is an entry (docs/*.html are standalone documents).
  optimizeDeps: { entries: ['index.html'] },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    // One chunk per area instead of one ~1 MB file (Vite warns above 500 kB): each stays well below it.
    rollupOptions: { output: { manualChunks: chunkOf } },
  },
});

/** The chunk a source module goes into (null: the chunk Rollup picks, e.g. the app shell). */
function chunkOf(id) {
  const file = id.replace(/\\/g, '/');
  if (file.includes('/node_modules/')) return 'vendor';
  const area = [
    ['/src/i18n/', 'i18n'],
    ['/src/icons', 'icons'],
    // Leaf drawing data used by the renderer, the toolbox (model) and the UML icons: in 'render' it made model → render → model.
    ['/src/render/glyphs.js', 'icons'],
    ['/src/domain/interop/', 'interop'],
    ['/src/domain/codegen/', 'code'],
    ['/src/domain/reverse/', 'code'],
    ['/src/domain/templates', 'samples'],
    ['/src/export/', 'documents'],
    ['/src/print/', 'documents'],
    ['/src/domain/report.js', 'documents'],
    ['/src/domain/docs.js', 'documents'],
    ['/src/render/', 'render'],
    ['/src/domain/', 'model'],
  ].find(([part]) => file.includes(part));
  return area ? area[1] : null;
}

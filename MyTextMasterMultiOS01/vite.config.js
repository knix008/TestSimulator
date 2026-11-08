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
  // MYTEXTMASTER_NO_HMR: a test run's own server — an edit while the tests run must not reload the app under test.
  server: { port: 1472, strictPort: true, hmr: process.env.MYTEXTMASTER_NO_HMR ? false : undefined, watch: { ignored: ['**/src-tauri/**', '**/test-results/**', '**/samples/**', '**/release/**'] } },
  optimizeDeps: { entries: ['index.html'] },
  // The spell checker's worker loads each dictionary as a chunk of its own when first needed.
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    // The editor core (CodeMirror) is one ~600 kB chunk on purpose: every document needs it at once.
    chunkSizeWarningLimit: 700,
    rollupOptions: { output: { manualChunks: chunkOf } },
  },
});

/** The chunk a source module goes into (null: the chunk Rollup picks, e.g. the app shell). */
function chunkOf(id) {
  const file = id.replace(/\\/g, '/');
  // The editor core and the languages every start needs; the other languages (code blocks, .py, .json …)
  // stay in chunks of their own that load when a document asks for them.
  const core = /\/node_modules\/(@codemirror\/(state|view|commands|language|search|autocomplete|lint|lang-markdown|lang-html|lang-css|lang-javascript)|@lezer\/(common|highlight|lr|markdown|html|css|javascript)|style-mod|w3c-keyname|crelt)\//;
  if (core.test(file)) return 'codemirror';
  if (file.includes('/node_modules/@codemirror/') || file.includes('/node_modules/@lezer/')) return null;
  if (file.includes('/node_modules/')) return 'vendor';
  if (file.includes('/src/i18n/')) return 'i18n';
  if (file.includes('/src/icons')) return 'icons';
  if (file.includes('/doc/')) return 'docs';
  return null;
}

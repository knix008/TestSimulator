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

export default defineConfig({
  base: './',
  clearScreen: false,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_NAME__: JSON.stringify(pkg.productName),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    __BUILD_COMMIT__: JSON.stringify(commit),
  },
  // MYBROADCASTING_NO_HMR: test servers — an edit while tests run must not reload the app under test.
  // The port is chosen by scripts/start.mjs / dev-web.mjs (a free one from 5660); 5660 is the default for `vite` alone.
  server: {
    port: Number(process.env.MYBROADCASTING_DEV_PORT) || 5660,
    strictPort: true,
    host: '127.0.0.1',
    hmr: process.env.MYBROADCASTING_NO_HMR ? false : undefined,
    // Only the UI sources: Rust, tests and build output are not the page's (and are big).
    watch: { ignored: ['**/src-tauri/**', '**/test/**', '**/test-results/**', '**/doc/**', '**/release/**', '**/dist/**', '**/samples/**'] },
  },
  preview: { port: 4186, strictPort: true, host: '127.0.0.1' },
  // Only the app page is an entry: Vite must not scan src-tauri/target or samples/ for imports.
  optimizeDeps: { entries: ['index.html'] },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: { output: { manualChunks: chunkOf } },
  },
});

/**
 * The chunk a module goes into (undefined: Rollup's choice). Imports only run downwards:
 *   vendor           — the Tauri API and the Markdown renderer (every window needs them)
 *   editor           — CodeMirror (loaded when the Edit tab first opens)
 *   i18n, icons      — the texts and the pictures
 *   shared           — the rest of the UI (shell, ui helpers, the Markdown engine)
 *   app, popup, viewer, render, projector — each window's own entry module (main.js loads one of them), left to Rollup.
 * paged.js, the Word writer and the render window are loaded on demand and left to Rollup too.
 */
function chunkOf(id) {
  const file = id.replace(/\\/g, '/');
  if (file.includes('/node_modules/')) {
    if (/\/node_modules\/(@codemirror|@lezer|codemirror|crelt|style-mod|w3c-keyname|@marijn)\//.test(file)) return 'editor';
    if (/\/node_modules\/(@tauri-apps|marked|dompurify)\//.test(file)) return 'vendor';
    return undefined;
  }
  if (!file.includes('/src/')) return undefined;
  // Window entries run at load (projector.js replaces the whole page): never inside a shared chunk.
  if (/\/src\/(app|popup|viewer|main|render|projector)\.js$/.test(file) || file.includes('/src/editor/')) return undefined;
  if (file.includes('/src/i18n')) return 'i18n';
  if (file.includes('/src/icon')) return 'icons';
  return 'shared';
}

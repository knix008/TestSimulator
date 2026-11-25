import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// The project folder with an upper-case drive letter: started from a shell whose folder is
// "c:\…", Vite's inline-style proxy of index.html misses its own cache ("No matching HTML proxy").
const root = fileURLToPath(new URL('.', import.meta.url)).replace(/^[a-z]:/, (d) => d.toUpperCase());

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const commit = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
})();

// The port is chosen by scripts/start.mjs / dev-web.mjs (always a free one) and passed with --port.
// The web build is relative (base './') so dist/ can be served from any folder.
export default defineConfig({
  root,
  base: './',
  clearScreen: false,
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_NAME__: JSON.stringify(pkg.productName),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    __BUILD_COMMIT__: JSON.stringify(commit),
  },
  server: { port: 1470, strictPort: true, watch: { ignored: ['**/src-tauri/**', '**/test-results/**', '**/release/**'] } },
  // Only the app page is an entry (public/docs/*.html are standalone documents).
  optimizeDeps: { entries: ['index.html'] },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
});

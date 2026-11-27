import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { chunkOf } from './scripts/chunks.mjs';

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
  worker: { format: 'es' },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_NAME__: JSON.stringify(pkg.productName),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    __BUILD_COMMIT__: JSON.stringify(commit),
  },
  // MY3DMAKER_NO_HMR: test servers — an edit while tests run must not reload the app under test.
  server: { port: 5584, strictPort: true, hmr: process.env.MY3DMAKER_NO_HMR ? false : undefined, watch: { ignored: ['**/src-tauri/**', '**/crates/**', '**/target/**', '**/test-results/**', '**/doc/**', '**/samples/**', '**/release/**', '**/dist/**'] } },
  optimizeDeps: { entries: ['index.html'] },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2500,
    rollupOptions: { output: { manualChunks: chunkOf } },
  },
});

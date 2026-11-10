import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

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
  server: { port: 5490, strictPort: true, watch: { ignored: ['**/src-tauri/**', '**/release/**', '**/dist/**', '**/.sample-build/**'] } },
  optimizeDeps: { entries: ['index.html', 'guide.html', 'print.html'] },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: { main: resolve(root, 'index.html'), guide: resolve(root, 'guide.html'), print: resolve(root, 'print.html') },
      output: {
        manualChunks(id) {
          const file = id.replace(/\\/g, '/');
          if (file.includes('/node_modules/@codemirror/') || file.includes('/node_modules/@lezer/') || file.includes('/node_modules/codemirror/')) return 'editor';
          if (file.includes('/node_modules/')) return 'vendor';
          if (file.includes('/samples/')) return 'samples';
          return null;
        },
      },
    },
  },
});

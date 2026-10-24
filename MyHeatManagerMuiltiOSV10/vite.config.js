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

// The web build is relative (base './') so dist/ can be served from any folder.
// public/heat.wasm (npm run build:wasm) is the solver for the web build.
export default defineConfig({
  base: './',
  clearScreen: false,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_NAME__: JSON.stringify(pkg.productName),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    __BUILD_COMMIT__: JSON.stringify(commit),
  },
  // MYHEAT_NO_HMR: the test and recording servers — an edit while they run must not reload the app under test.
  server: { port: 1490, strictPort: true, hmr: process.env.MYHEAT_NO_HMR ? false : undefined, watch: { ignored: ['**/src-tauri/**', '**/engine/**', '**/test-results/**', '**/docs/**', '**/samples/**'] } },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const file = id.replace(/\\/g, '/');
          if (file.includes('/node_modules/three/')) return 'three';
          if (file.includes('/node_modules/')) return 'vendor';
          return null;
        },
      },
    },
  },
});

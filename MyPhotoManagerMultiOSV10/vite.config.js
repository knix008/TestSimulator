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

const DEV_PORT = Number(process.env.MYPHOTO_DEV_PORT) || 1440;

// Tauri expects the dev server on build.devUrl. `npm start` picks a free port
// and passes it here, so a busy 1440 does not stop the app.
export default defineConfig({
  base: './',
  clearScreen: false,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    __BUILD_COMMIT__: JSON.stringify(commit),
  },
  server: { port: DEV_PORT, strictPort: true, watch: { ignored: ['**/src-tauri/**', '**/test-results/**', '**/release/**'] } },
  worker: { format: 'es' },
  // OpenJPEG's decoder is CommonJS: pre-bundled so the browser gets its factory as the default export.
  optimizeDeps: { exclude: ['libheif-js', 'libraw-wasm', '@jsquash/jxl'], include: ['@cornerstonejs/codec-openjpeg/decode', '@cornerstonejs/codec-openjpeg'] },
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 4000 },
});

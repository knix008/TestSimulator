// .mjs rather than .js: the package has no "type": "module" — electron/main.js,
// electron/preload.js and scripts/copy-installer.js are CommonJS — so a bare
// .js config would be loaded through Vite's deprecated CJS Node API.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In production Electron serves dist/ over the custom `app://bundle` origin
// (see electron/main.js), so relative asset paths (`base: './'`) work there and
// in a plain web deployment alike.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5179,
    strictPort: true,
  },
  // pdf.js ships as pre-bundled ESM; letting Vite pre-optimize it breaks the
  // worker's own module resolution.
  optimizeDeps: {
    exclude: ['pdfjs-dist'],
  },
  worker: {
    format: 'es',
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2500,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.js'],
    include: ['test/**/*.test.{js,jsx}'],
    restoreMocks: true,
    reporters: ['./test/reporters/summary.mjs'],
  },
});

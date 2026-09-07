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
});

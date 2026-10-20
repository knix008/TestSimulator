// .mjs rather than .js: the package has no "type": "module", so a bare .js
// config would be loaded through Vite's deprecated CJS Node API.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The Tauri app serves dist/ from its own origin (tauri://localhost or
// http://tauri.localhost) and loads the dev server on port 5179 in
// `npm start`; relative asset paths (`base: './'`) work there and in a plain
// web deployment alike.
export default defineConfig({
  base: './',
  plugins: [react()],
  // Tauri prints its own output; keep Vite from clearing it.
  clearScreen: false,
  server: {
    port: 5179,
    strictPort: true,
    // The Rust sources rebuild through cargo, not Vite.
    watch: { ignored: ['**/src-tauri/**'] },
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

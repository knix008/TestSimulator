// .mjs: the package has no "type": "module" (electron/*.js, core/*.js and
// server/server.js are CommonJS), so a bare .js config would be loaded through
// the deprecated CJS Node API of Vite.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Production Electron loads dist/index.html via file:// and the web server
// serves it from any path, so every asset path must be relative.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5185,
    strictPort: true,
    // `npm run dev` + `npm run web:serve` → the browser UI talks to the API server.
    proxy: { '/api': 'http://127.0.0.1:5186' },
    // Build output and smoke screenshots must not trigger dev reloads.
    watch: { ignored: ['**/release/**', '**/dist/**', '**/.smoke/**', '**/build/**'] },
  },
  // The biggest chunk is libheif-js/wasm-bundle (~1.95 MB): the HEIC / HEIF decoder with its
  // WebAssembly inlined as base64. It is already a lazy import (src/lib/images.js, fetched only
  // when a HEIC file is previewed) and cannot be split further — the separate .wasm variant
  // needs fetch(), which the desktop build's file:// origin does not allow. The DICOM codecs
  // (cornerstone, ≤ 0.6 MB each) are lazy chunks of their own too.
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 2100 },
});

// .mjs rather than .js: the package has no "type": "module", so a bare .js
// config would be loaded through Vite's deprecated CJS Node API.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The Tauri app serves dist/ from its own origin (tauri://localhost or
// http://tauri.localhost) and loads the dev server on port 5195 in
// `npm start`; relative asset paths (`base: './'`) work there and in a plain
// web deployment alike.
export default defineConfig({
  base: './',
  plugins: [react()],
  // Tauri prints its own output; keep Vite from clearing it.
  clearScreen: false,
  server: {
    port: 5195,
    strictPort: true,
    // The Rust sources rebuild through cargo and the engine is Python; neither
    // is part of the page.
    watch: { ignored: ['**/src-tauri/**', '**/engine/**'] },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // three.js and its loaders are one big chunk; the loaders and exporters
    // are split out and loaded when a file of that kind is opened.
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.js'],
    include: ['test/**/*.test.{js,jsx}'],
    restoreMocks: true,
    reporters: ['./test/reporters/summary.mjs'],
    testTimeout: 20000,
  },
});

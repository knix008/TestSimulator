// .mjs: the package has no "type": "module" (core/*.js, host/host.js and
// server/*.js are CommonJS), so a bare .js config would be loaded through
// the deprecated CJS Node API of Vite.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The Tauri program embeds dist/ and the web server serves it from any path,
// so every asset path must be relative. The port comes from scripts/dev.mjs
// and scripts/start.mjs (5189 or the next free one).
export default defineConfig({
  base: './',
  plugins: [react()],
  clearScreen: false,
  server: {
    // `npm run dev` + `npm run web:serve` → the browser UI talks to the API server.
    proxy: { '/api': 'http://127.0.0.1:5190' },
    watch: { ignored: ['**/src-tauri/**', '**/dist/**', '**/.smoke/**', '**/test/**', '**/host/**', '**/core/**', '**/server/**'] },
  },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});

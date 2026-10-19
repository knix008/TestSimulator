// .mjs: the package has no "type": "module" (core/*.js, host/*.js and
// server/server.js are CommonJS), so a bare .js config would be loaded through
// the deprecated CJS Node API of Vite.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The Tauri shell and the web server both load dist/index.html from their own
// origin, so every asset path must be relative.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5189,
    strictPort: true,
    // `npm run dev` + `npm run web:serve` → the browser UI talks to the API server.
    proxy: { '/api': 'http://127.0.0.1:5190' },
    // Build output and smoke screenshots must not trigger dev reloads.
    watch: { ignored: ['**/release/**', '**/dist/**', '**/.smoke/**', '**/build/**', '**/src-tauri/**'] },
  },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});

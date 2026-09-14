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
    port: 5189,
    strictPort: true,
    // `npm run dev` + `npm run web:serve` → the browser UI talks to the API server.
    proxy: { '/api': 'http://127.0.0.1:5190' },
    watch: { ignored: ['**/release/**', '**/dist/**', '**/.smoke/**', '**/build/**', '**/.tmp/**'] },
  },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});

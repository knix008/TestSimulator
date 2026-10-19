// .mjs: the package has no "type": "module" (core/*.js, host/*.js and
// server/server.js are CommonJS), so a bare .js config would be loaded through
// the deprecated CJS Node API of Vite.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The Tauri shell and the web server both load dist/index.html from their own
// origin, so every asset path must be relative.
//
// `npm start` (tauri dev) sets TAURI_ENV_PLATFORM and the window talks to the
// sidecar, not to port 5190. Proxying /api there only prints
// "connect ECONNREFUSED 127.0.0.1:5190" whenever a page reloads. The proxy
// stays for `npm run dev` together with `npm run web:serve`.
const webProxy = process.env.TAURI_ENV_PLATFORM ? undefined : { '/api': 'http://127.0.0.1:5190' };

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5189,
    strictPort: true,
    proxy: webProxy,
    // Build output and smoke screenshots must not trigger dev reloads.
    watch: { ignored: ['**/release/**', '**/dist/**', '**/.smoke/**', '**/build/**', '**/src-tauri/**'] },
  },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});

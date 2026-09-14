// .mjs rather than .js: the package has no "type": "module" — electron/*.js and
// scripts/copy-installer.js are CommonJS — so a bare .js config would be loaded
// through the deprecated CJS Node API of Vite.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Production Electron loads dist/index.html via file:// (with `#dialog=<name>`
// hashes selecting the dialog windows), so every asset path must be relative.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5184, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 2500 },
});

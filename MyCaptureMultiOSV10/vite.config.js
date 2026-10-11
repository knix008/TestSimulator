import { defineConfig } from 'vite';

// Tauri expects a fixed dev server port (tauri.conf.json → build.devUrl).
export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } },
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true },
});

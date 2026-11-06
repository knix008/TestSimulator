import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// One page, two builds. The web build carries the WebAssembly engine; the desktop build has the
// same engine natively, so `__WEB_BUILD__` lets the bundler drop the worker and the .wasm from it.
export default defineConfig(({ mode, command }) => ({
  base: './',
  plugins: [react()],
  define: {
    __WEB_BUILD__: command === 'serve' || mode === 'web',
  },
  server: { strictPort: true },
  // Imported dynamically, so Vite would only find them while the page runs, then reload the page.
  optimizeDeps: {
    include: [
      'react-dom/client', 'i18next', 'react-i18next', 'marked',
      '@tauri-apps/api/core', '@tauri-apps/api/event', '@tauri-apps/api/webview', '@tauri-apps/api/webviewWindow', '@tauri-apps/api/window',
      '@tauri-apps/plugin-dialog',
    ],
  },
  worker: { format: 'es' },
  build: {
    outDir: mode === 'web' ? 'dist-web' : 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    target: 'es2021',
  },
}));

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Electron loads dist/index.html via a file:// URL in production,
// so assets must be referenced with relative paths (base: './').
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5178,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
});

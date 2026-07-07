import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(projectRoot, 'renderer'),
  plugins: [react()],
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5175,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3847',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: path.resolve(projectRoot, 'dist-renderer'),
    emptyOutDir: true,
  },
});

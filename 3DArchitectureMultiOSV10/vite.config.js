import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          dxfparser: ['dxf-parser'],
        },
      },
    },
  },
  optimizeDeps: {
    include: ['three', 'dxf-parser'],
    exclude: ['onnxruntime-web'],
  },
});

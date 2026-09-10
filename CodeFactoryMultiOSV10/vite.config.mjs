import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base: './'` keeps the built bundle relocatable: the same dist/ is served by
// a plain static web host and loaded by Electron over file://.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
        },
      },
    },
  },
  worker: {
    format: 'es',
  },
  server: {
    port: 5183,
    strictPort: true,
  },
});

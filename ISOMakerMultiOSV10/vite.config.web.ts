import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: '.',
  publicDir: 'public',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  plugins: [react()],
  build: {
    outDir: 'dist-web',
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'web.html'),
    },
  },
  server: {
    port: 5174,
    open: '/web.html',
  },
})

import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The desktop pages. `tauri dev` loads them from this server; `tauri build`
// embeds dist/ in the program (src-tauri/tauri.conf.json).
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5183,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    // The main window and the shared print window
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        print: path.resolve(__dirname, 'print.html'),
        thememenu: path.resolve(__dirname, 'thememenu.html'),
        tool: path.resolve(__dirname, 'tool.html'),
      },
    },
  },
})

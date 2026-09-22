import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    // The packaging output and the icons are not source; on Windows a watched
    // directory cannot be renamed, which breaks electron-builder mid-run.
    watch: { ignored: ['**/release/**', '**/dist/**', '**/build/**'] },
  },
  build: {
    chunkSizeWarningLimit: 2500,
  },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths so the packaged Electron app (loaded via file://) finds its JS/CSS.
  base: './',
  plugins: [react()],
})

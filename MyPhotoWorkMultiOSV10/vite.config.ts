import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    /*
     * The HEIF decoder is a 2 MB WebAssembly build shipped as one file, and the
     * warning's own advice — split it, load it dynamically — is already
     * followed: it is reached through a dynamic `import()`, so it lands in its
     * own chunk and is only fetched when a `.heic` is opened. Nothing else
     * comes near the limit, so this is raised just past that one blob rather
     * than switched off, and our own code still warns if it balloons.
     */
    chunkSizeWarningLimit: 2100,
  },
})

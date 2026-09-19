import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  // ONNX Runtime ships its WebAssembly glue pre-built and self-referencing;
  // Vite's dependency pre-bundling rewrites it into something that throws
  // inside the wasm callbacks, so it is served as it is.
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  server: {
    // The dev server watches the project, and on Windows a watched directory
    // cannot be renamed: electron-builder's `release/win-unpacked.tmp` →
    // `win-unpacked` rename fails with EPERM while `npm run dev` is up. The
    // packaging output, the verification output and the icons are not source,
    // so they are left out of the watch.
    watch: { ignored: ['**/release/**', '**/out/**', '**/dist/**', '**/build/**'] },
  },
  build: {
    /*
     * Two dependencies ship as single large files, and the warning's own
     * advice — split them, load them dynamically — is already followed: the
     * 2 MB HEIF decoder and the 15 MB OpenCV build are each reached through a
     * dynamic `import()`, so each lands in its own chunk and is only fetched
     * when a `.heic` is opened or a vision command runs. The limit is raised
     * just past the larger of the two rather than switched off, so our own
     * code (a few hundred kB per chunk) still warns if it balloons.
     */
    chunkSizeWarningLimit: 16000,
  },
})

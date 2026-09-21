import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * OpenCV ships Emscripten's glue, which reaches for `fs`, `path` and `crypto`
 * on the branches it takes when it thinks it is running under Node. In a
 * browser those branches are dead, but the bundler still has to resolve the
 * imports: it externalises them and warns, and an externalised builtin throws
 * if anything ever does reach it. Resolving them to an empty module — for
 * imports from that package only, so nothing else is affected — removes the
 * warning and the trap together.
 */
export function opencvNodeBuiltins(): Plugin {
  const builtins = new Set(['fs', 'path', 'crypto', 'node:fs', 'node:path', 'node:crypto'])
  const stub = '\0opencv-node-builtin-stub'
  return {
    name: 'opencv-node-builtins',
    enforce: 'pre',
    resolveId(source, importer) {
      if (builtins.has(source) && importer?.includes('@techstark/opencv-js')) return stub
      return null
    },
    load(id) {
      return id === stub ? 'export default {}' : null
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), opencvNodeBuiltins()],
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

import { cpSync, createReadStream, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

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

const docTypes: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' }

/**
 * The illustrated user guide lives in doc/ as plain files, because it is a document
 * as well as a window of the app. The dev server serves that folder at /doc/; the
 * build copies it to dist/doc/, leaving out the Markdown it is generated from.
 */
export function userGuide(): Plugin {
  const docDir = path.join(projectRoot, 'doc')
  return {
    name: 'user-guide',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = decodeURIComponent((req.url ?? '').split('?')[0])
        if (pathname !== '/doc' && !pathname.startsWith('/doc/')) return next()
        const relative = pathname === '/doc' || pathname === '/doc/' ? 'index.html' : pathname.slice('/doc/'.length)
        const file = path.normalize(path.join(docDir, relative))
        if (!file.startsWith(docDir) || !existsSync(file) || !statSync(file).isFile()) return next()
        res.setHeader('Content-Type', docTypes[path.extname(file)] ?? 'application/octet-stream')
        createReadStream(file).pipe(res)
      })
    },
    closeBundle() {
      cpSync(docDir, path.join(projectRoot, 'dist', 'doc'), { recursive: true, filter: (source) => !source.endsWith('.md') })
    },
  }
}

// What lets the renderer use SharedArrayBuffer, which ONNX Runtime needs to run a
// model on more than one core. The packaged app gets the same from tauri.conf.json;
// `credentialless` keeps ordinary cross-origin images loadable.
const isolation = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless' }

export default defineConfig({
  base: './',
  plugins: [react(), opencvNodeBuiltins(), userGuide()],
  // ONNX Runtime ships its WebAssembly glue pre-built and self-referencing;
  // Vite's dependency pre-bundling rewrites it into something that throws
  // inside the wasm callbacks, so it is served as it is.
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  server: {
    headers: isolation,
    // The Rust shell, the build output, the verification output, the icons and the
    // guide are not the page's source, so they are left out of the watch.
    watch: { ignored: ['**/src-tauri/**', '**/out/**', '**/dist/**', '**/build/**', '**/doc/**'] },
  },
  preview: { headers: isolation },
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

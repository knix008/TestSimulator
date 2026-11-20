import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { chunkOf } from './scripts/chunks.mjs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const commit = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
})();

/**
 * The OpenCASCADE build (replicad-opencascadejs) imports node:fs, node:path, … only inside
 * `if (ENVIRONMENT_IS_NODE)` branches that never run in a browser or WebView (the unit tests run it under Node).
 * Those imports get an empty module of their own instead of Vite's "externalized for browser compatibility"
 * stand-in and its warning on every build.
 */
function nodeStubs() {
  const FROM = /node_modules[\\/]replicad-opencascadejs[\\/]/;
  return {
    name: 'mymechanics-node-stubs',
    enforce: 'pre',
    resolveId(source, importer) {
      return source.startsWith('node:') && importer && FROM.test(importer) ? `\0node-stub:${source}` : null;
    },
    load(id) {
      return id.startsWith('\0node-stub:') ? 'export default {};\nexport const createRequire = () => () => ({});\n' : null;
    },
  };
}

export default defineConfig({
  base: './',
  clearScreen: false,
  plugins: [nodeStubs()],
  worker: { format: 'es', plugins: () => [nodeStubs()] },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_NAME__: JSON.stringify(pkg.productName),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    __BUILD_COMMIT__: JSON.stringify(commit),
  },
  // MYMECHANICS_NO_HMR: test servers — an edit while tests run must not reload the app under test.
  server: { port: 5494, strictPort: true, hmr: process.env.MYMECHANICS_NO_HMR ? false : undefined, watch: { ignored: ['**/src-tauri/**', '**/test-results/**', '**/doc/**', '**/samples/**', '**/release/**', '**/dist/**'] } },
  // The kernel is a large Emscripten module loaded on demand (src/cad/kernel.js): not pre-bundled.
  optimizeDeps: { entries: ['index.html'], exclude: ['replicad-opencascadejs'] },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2500,
    rollupOptions: { output: { manualChunks: chunkOf } },
  },
});

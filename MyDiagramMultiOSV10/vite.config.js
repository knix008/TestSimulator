import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

/** The JPEG 2000 decoder asks for Node's fs and path only when it runs under Node: in a web view they stay unused. */
function noNodeModulesInDecoders() {
  const EMPTY = '\0empty-node-module';
  return {
    name: 'no-node-modules-in-decoders',
    enforce: 'pre',
    resolveId(id, importer) {
      return (id === 'fs' || id === 'path') && importer?.includes('codec-openjpeg') ? EMPTY : null;
    },
    load(id) {
      return id === EMPTY ? 'export default {};' : null;
    },
  };
}

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const commit = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
})();

// Tauri expects a fixed dev server port (tauri.conf.json → build.devUrl).
// The web build is relative (base './') so dist/ can be served from any folder.
export default defineConfig({
  base: './',
  clearScreen: false,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_NAME__: JSON.stringify(pkg.productName),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    __BUILD_COMMIT__: JSON.stringify(commit),
  },
  server: { port: 1450, strictPort: true, watch: { ignored: ['**/src-tauri/**', '**/test-results/**', '**/docs/**', '**/samples/**'] } },
  // Only the app page is an entry (docs/*.html are standalone documents).
  // The JPEG XL decoder finds its .wasm next to its module, which pre-bundling would break.
  optimizeDeps: { entries: ['index.html'], exclude: ['@jsquash/jxl'], include: ['utif', 'libheif-js/wasm-bundle.js', '@cornerstonejs/codec-openjpeg/decode'] },
  plugins: [noNodeModulesInDecoders()],
  // The largest chunks are the picture decoders (HEIC 2 MB, JPEG 2000 0.5 MB), loaded only when such a
  // file arrives. The limit stands just above them; the app's own chunks are well below 500 kB.
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 2100 },
});

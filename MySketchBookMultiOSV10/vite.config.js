import { createReadStream, cpSync, existsSync, readFileSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const commit = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
})();

const MIME = { '.json': 'application/json', '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.hdr': 'application/octet-stream', '.md': 'text/markdown' };

/**
 * The asset library (library/, ~300 MB, `npm run assets`) is not in public/: Tauri would compile it into
 * the exe. Vite serves it at ./library/ while developing; a web build copies it next to the page;
 * the desktop build ships it as installer resources (tauri.conf.json) read through the asset protocol.
 */
function assetLibrary() {
  const dir = path.join(root, 'library');
  return {
    name: 'mysketchbook-library',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url ?? '').split('?')[0]);
        const at = url.indexOf('/library/');
        if (at < 0) return next();
        const file = path.join(dir, url.slice(at + '/library/'.length));
        if (!file.startsWith(dir) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream');
        res.setHeader('Content-Length', statSync(file).size);
        res.setHeader('Cache-Control', 'max-age=3600');
        createReadStream(file).pipe(res);
        return undefined;
      });
    },
    closeBundle() {
      // Tauri's beforeBuildCommand runs with TAURI_ENV_* set: the installer carries the library as resources instead.
      if (process.env.TAURI_ENV_PLATFORM || !existsSync(dir)) return;
      cpSync(dir, path.join(root, 'dist', 'library'), { recursive: true });
    },
  };
}

export default defineConfig({
  base: './',
  clearScreen: false,
  plugins: [assetLibrary()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_NAME__: JSON.stringify(pkg.productName),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    __BUILD_COMMIT__: JSON.stringify(commit),
  },
  // MYSKETCHBOOK_NO_HMR: test servers — an edit while tests run must not reload the app under test.
  server: { port: 5480, strictPort: true, hmr: process.env.MYSKETCHBOOK_NO_HMR ? false : undefined, watch: { ignored: ['**/src-tauri/**', '**/test-results/**', '**/doc/**', '**/docs/**', '**/samples/**', '**/library/**', '**/release/**', '**/dist/**'] } },
  // Only the app page is an entry (docs/*.html are standalone documents, tools/ are dev pages).
  optimizeDeps: { entries: ['index.html'], exclude: ['manifold-3d', '@jsquash/avif'] },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: { output: { manualChunks: chunkOf } },
  },
});

/** The chunk a source module goes into (null: the chunk Rollup picks, e.g. the app shell). */
function chunkOf(id) {
  const file = id.replace(/\\/g, '/');
  if (file.includes('/node_modules/three-gpu-pathtracer/')) return 'pathtracer';
  if (file.includes('/node_modules/manifold-3d/')) return 'manifold';
  // The AVIF encoder (loaded only when a picture is saved as AVIF and the canvas cannot write it).
  if (file.includes('/node_modules/@jsquash/')) return 'avif';
  if (file.includes('/node_modules/three/examples/jsm/loaders/') || file.includes('/node_modules/three/examples/jsm/exporters/')) return 'io';
  if (file.includes('/node_modules/three')) return 'three';
  if (file.includes('/node_modules/')) return 'vendor';
  const area = [
    ['/src/i18n/', 'i18n'],
    ['/src/icons', 'icons'],
    ['/src/library/parametric/', 'library'],
    ['/src/modeling/', 'modeling'],
    ['/src/io/', 'io'],
    ['/src/engine/', 'engine'],
    ['/src/tools/', 'engine'],
  ].find(([part]) => file.includes(part));
  return area ? area[1] : null;
}

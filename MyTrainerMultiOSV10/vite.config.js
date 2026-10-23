import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const commit = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
})();

// npm start hands Tauri a free port (scripts/port.mjs); 1470 is only the default.
// The web build is relative (base './') so dist/ can be served from any folder.
/**
 * The example inputs of data/predict (pictures, recordings, CSV rows, sentences) as examples/… with a list in
 * examples/index.json: served while developing, copied into the build (the Test tab's "Examples").
 */
function examples() {
  const dir = path.resolve('data/predict');
  const list = () => {
    const walk = (at) => readdirSync(path.join(dir, at)).flatMap((name) => {
      const rel = at ? `${at}/${name}` : name;
      return statSync(path.join(dir, rel)).isDirectory() ? walk(rel) : [rel];
    });
    try { return walk('').sort(); } catch { return []; }
  };
  const types = { wav: 'audio/wav', png: 'image/png', csv: 'text/csv', txt: 'text/plain', json: 'application/json' };
  return {
    name: 'mytrainer-examples',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url ?? '').split('?')[0]);
        if (!url.startsWith('/examples/')) return next();
        const rel = url.slice('/examples/'.length);
        if (rel === 'index.json') { res.setHeader('Content-Type', types.json); res.end(JSON.stringify(list())); return; }
        const file = path.join(dir, rel);
        if (!file.startsWith(dir) || !list().includes(rel)) return next();
        res.setHeader('Content-Type', types[path.extname(rel).slice(1)] ?? 'application/octet-stream');
        res.end(readFileSync(file));
      });
    },
    generateBundle() {
      const files = list();
      this.emitFile({ type: 'asset', fileName: 'examples/index.json', source: JSON.stringify(files) });
      for (const rel of files) this.emitFile({ type: 'asset', fileName: `examples/${rel}`, source: readFileSync(path.join(dir, rel)) });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [examples()],
  clearScreen: false,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_NAME__: JSON.stringify(pkg.productName),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    __BUILD_COMMIT__: JSON.stringify(commit),
  },
  // MYTRAINER_NO_HMR: the E2E harness's own server — an edit while the tests run must not reload the app under test.
  server: { port: 1470, strictPort: true, hmr: process.env.MYTRAINER_NO_HMR ? false : undefined, watch: { ignored: ['**/src-tauri/**', '**/test-results/**', '**/docs/**', '**/samples/**', '**/python/**'] } },
  optimizeDeps: { entries: ['index.html'] },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2500,
    rollupOptions: { output: { manualChunks: chunkOf } },
  },
});

/** The chunk a source module goes into (null: the chunk Rollup picks). */
function chunkOf(id) {
  const file = id.replace(/\\/g, '/');
  if (file.includes('/node_modules/@tensorflow/')) return 'tfjs';
  if (file.includes('/node_modules/@codemirror/') || file.includes('/node_modules/@lezer/') || file.includes('/node_modules/codemirror/')) return 'editor';
  if (file.includes('/node_modules/')) return 'vendor';
  const area = [
    ['/src/i18n/', 'i18n'],
    ['/src/icons', 'icons'],
    ['/src/domain/', 'model'],
  ].find(([part]) => file.includes(part));
  return area ? area[1] : null;
}

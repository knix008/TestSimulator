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

/**
 * Emscripten builds (occt-import-js: STEP / IGES, manifold-3d: solid modelling) import Node modules (path, crypto, fs,
 * node:module) inside `if (ENVIRONMENT_IS_NODE)` branches that never run in a browser or WebView. They get an empty
 * module of their own instead of Vite's "externalized for browser compatibility" stand-in (and its warning). Only
 * these two packages: a Node import anywhere else still shows up.
 */
function nodeStubs() {
  const NODE = new Set(['path', 'crypto', 'fs', 'module', 'node:module', 'node:path', 'node:crypto', 'node:fs']);
  const FROM = /node_modules[\\/](occt-import-js|manifold-3d)[\\/]/;
  return {
    name: 'mysketchbook-node-stubs',
    enforce: 'pre',
    resolveId(source, importer) {
      return NODE.has(source) && importer && FROM.test(importer) ? `\0node-stub:${source}` : null;
    },
    load(id) {
      return id.startsWith('\0node-stub:') ? 'export default {};\nexport const createRequire = () => () => ({});\n' : null;
    },
  };
}

export default defineConfig({
  base: './',
  clearScreen: false,
  plugins: [nodeStubs(), assetLibrary()],
  // Workers are built with their own plugins: the STEP / IGES worker is where occt-import-js is imported.
  worker: { plugins: () => [nodeStubs()] },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_NAME__: JSON.stringify(pkg.productName),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    __BUILD_COMMIT__: JSON.stringify(commit),
  },
  // MYSKETCHBOOK_NO_HMR: test servers — an edit while tests run must not reload the app under test.
  server: { port: 5480, strictPort: true, hmr: process.env.MYSKETCHBOOK_NO_HMR ? false : undefined, watch: { ignored: ['**/src-tauri/**', '**/test-results/**', '**/doc/**', '**/docs/**', '**/samples/**', '**/library/**', '**/release/**', '**/dist/**'] } },
  // Only the app page is an entry (docs/*.html are standalone documents, tools/ are dev pages).
  // occt-import-js (CommonJS) is imported only by the STEP/IGES worker, which the scan does not see: pre-bundle it so
  // opening the first CAD file does not make Vite re-optimise and reload the page. The same for the plan import's
  // pdf.js, web-ifc and UTIF (loaded only when a PDF, IFC or TIFF file comes).
  // web-ifc is not bundled (io/plan-libs.js loads its single 5.9 MB module as a file when an IFC file comes).
  optimizeDeps: { entries: ['index.html'], include: ['occt-import-js', 'pdfjs-dist', 'utif'], exclude: ['manifold-3d', '@jsquash/avif', 'web-ifc'] },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: { output: { manualChunks: chunkOf } },
  },
});

/**
 * The chunk a module goes into (undefined: Rollup's choice). The chunks follow the code's layers, so that imports only
 * run downwards and no two chunks import each other:
 *   three, loaders, vendor, pathtracer, manifold, avif — third-party code (never imports the app);
 *   core            — what the furniture models use from the engine (stairs and the document helpers they import);
 *   library-*       — the furniture models (~2.6 MB of source): the base modules with the three shared ones the rest
 *                     build on, then the -more, -plus and -extra modules (each importing only the base and core);
 *   i18n, icons     — the texts and pictures (data the app reads);
 *   shared          — the rest of the app's code (engine, io, modeling, tools, ui, the library index and catalog),
 *                     one chunk because those parts use each other;
 *   app, popup, viewer — each window's own entry module (main.js loads one of them), left to Rollup.
 */
function chunkOf(id) {
  const file = id.replace(/\\/g, '/');
  if (file.includes('/node_modules/three-gpu-pathtracer/')) return 'pathtracer';
  if (file.includes('/node_modules/manifold-3d/')) return 'manifold';
  // The AVIF encoder (loaded only when a picture is saved as AVIF and the canvas cannot write it).
  if (file.includes('/node_modules/@jsquash/')) return 'avif';
  // The plan import's readers (pdf.js, UTIF): reached only through dynamic imports, so Rollup gives them chunks of their
  // own that load when a PDF or a TIFF file is imported. Naming them here (or leaving them to 'vendor') would make the
  // app shell preload them.
  if (['/node_modules/pdfjs-dist/', '/node_modules/utif/', '/node_modules/pako/'].some((dir) => file.includes(dir))) return undefined;
  if (file.includes('/node_modules/three/examples/jsm/loaders/') || file.includes('/node_modules/three/examples/jsm/exporters/')) return 'loaders';
  if (file.includes('/node_modules/three')) return 'three';
  if (file.includes('/node_modules/')) return 'vendor';
  if (!file.includes('/src/')) return undefined;
  // The three windows' own code (main.js loads one of them): chunks of their own, or opening a popup window would run
  // the main window's start-up too.
  if (/\/src\/(app|popup|viewer|main)\.js$/.test(file)) return undefined;
  if (file.endsWith('/src/engine/stairs.js') || file.endsWith('/src/engine/document.js')) return 'core';
  if (file.includes('/src/library/parametric/') && !file.endsWith('/index.js')) {
    const name = file.split('/').pop();
    if (/-extra\.js$/.test(name)) return 'library-extra';
    if (/-plus\d*\.js$/.test(name)) return 'library-plus';
    if (/-more\.js$/.test(name) && !['appliances-more.js', 'doors-more.js', 'structure-more.js'].includes(name)) return 'library-more';
    return 'library-base';
  }
  if (file.includes('/src/i18n')) return 'i18n';
  if (file.includes('/src/icon')) return 'icons';
  return 'shared';
}

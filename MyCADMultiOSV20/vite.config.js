import { cpSync, createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { freeDevPort } from './scripts/port.mjs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const commit = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
})();

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

// doc/ and samples/ are ordinary files the page fetches (the tutorial document,
// the sample list). The dev server hands them out from the project folder;
// a build copies them next to the app in dist/.
function serveProjectDirs(rootDir, dirs) {
  const types = {
    '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
    '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  };
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    let pathname = '';
    try { pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://local').pathname); } catch { return next(); }
    const top = pathname.split('/').filter(Boolean)[0];
    if (!dirs.includes(top)) return next();
    const rel = pathname.replace(/^\/+/, '');
    if (rel.split('/').includes('..')) return next();
    const file = path.resolve(rootDir, rel);
    const base = path.resolve(rootDir, top);
    if (file !== base && !file.startsWith(base + path.sep)) return next();
    let info;
    try { info = statSync(file); } catch { return next(); }
    if (!info.isFile()) return next();
    res.statusCode = 200;
    res.setHeader('Content-Type', types[path.extname(file).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Content-Length', info.size);
    res.setHeader('Cache-Control', 'no-cache');
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(file).pipe(res);
  };
}

function copyContent() {
  return {
    name: 'mycad-content',
    configureServer(server) {
      server.middlewares.use(serveProjectDirs(projectRoot, ['doc', 'samples']));
    },
    closeBundle() {
      const root = projectRoot;
      const out = path.join(root, 'dist');
      const index = path.join(root, 'samples', 'index.json');
      if (existsSync(index)) {
        mkdirSync(path.join(out, 'samples'), { recursive: true });
        cpSync(index, path.join(out, 'samples', 'index.json'));
        for (const { file } of JSON.parse(readFileSync(index, 'utf8'))) {
          const target = path.join(out, 'samples', file);
          mkdirSync(path.dirname(target), { recursive: true });
          cpSync(path.join(root, 'samples', file), target);
        }
      }
      // Python (Pyodide) for the script console: its runtime next to the app.
      mkdirSync(path.join(out, 'pyodide'), { recursive: true });
      for (const file of ['pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json', 'pyodide.mjs']) cpSync(path.join(root, 'node_modules', 'pyodide', file), path.join(out, 'pyodide', file));
      if (existsSync(path.join(root, 'doc'))) cpSync(path.join(root, 'doc'), path.join(out, 'doc'), { recursive: true, filter: (source) => !/\.md$/i.test(source) });
    },
  };
}

// Tauri expects a fixed dev server port (tauri.conf.json → build.devUrl).
// The web build is relative (base './') so dist/ can be served from any folder.
export default defineConfig(async ({ command }) => ({
  base: './',
  clearScreen: false,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_NAME__: JSON.stringify(pkg.productName),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    __BUILD_COMMIT__: JSON.stringify(commit),
  },
  // A port nobody uses (another program's page must never show); --port overrides it.
  server: { port: command === 'serve' ? await freeDevPort() : 1450, strictPort: true, watch: { ignored: ['**/src-tauri/**', '**/test-results/**'] } },
  // three.js (the 3D view) is a lazily loaded chunk of its own.
  // three.js is one 750 kB module that cannot be split; every chunk of our own stays far below this.
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 800 },
  plugins: [copyContent()],
  // Pyodide finds its own files (indexURL): not pre-bundled by the dev server.
  optimizeDeps: { exclude: ['pyodide'] },
}));

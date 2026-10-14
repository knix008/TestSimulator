import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
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

// The start page's samples (those in samples/index.json) and the tutorial
// document (doc/) go next to the app in dist/; the dev server serves them
// from the project folder as they are.
function copyContent() {
  return {
    name: 'mycad-content',
    apply: 'build',
    closeBundle() {
      const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
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
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 700 },
  plugins: [copyContent()],
}));

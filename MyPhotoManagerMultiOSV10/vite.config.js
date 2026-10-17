import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const commit = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
})();

const DEV_PORT = Number(process.env.MYPHOTO_DEV_PORT) || 1440;
// OpenJPEG's Emscripten bundle requires Node's fs and path only after it has
// detected Node. Point those imports at an empty module so Vite does not warn
// that it externalized them.
const nodeBuiltinStub = fileURLToPath(new URL('./scripts/node-builtin-stub.js', import.meta.url));

// Tauri expects the dev server on build.devUrl. `npm start` picks a free port
// and passes it here, so a busy 1440 does not stop the app.
export default defineConfig({
  base: './',
  clearScreen: false,
  resolve: {
    alias: [
      { find: /^node:fs$/, replacement: nodeBuiltinStub },
      { find: /^fs$/, replacement: nodeBuiltinStub },
      { find: /^node:path$/, replacement: nodeBuiltinStub },
      { find: /^path$/, replacement: nodeBuiltinStub },
    ],
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    __BUILD_COMMIT__: JSON.stringify(commit),
  },
  server: { port: DEV_PORT, strictPort: true, watch: { ignored: ['**/src-tauri/**', '**/test-results/**', '**/release/**'] } },
  worker: { format: 'es' },
  // OpenJPEG's decoder is CommonJS: pre-bundled so the browser gets its factory as the default export.
  optimizeDeps: { exclude: ['libheif-js', 'libraw-wasm', '@jsquash/jxl', 'onnxruntime-web'], include: ['@cornerstonejs/codec-openjpeg/decode', '@cornerstonejs/codec-openjpeg'] },
  plugins: [{
    name: 'bg-model-proxy',
    configureServer(server) {
      const files = {
        'u2net.onnx': 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx',
        'isnet-general-use.onnx': 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx',
      };
      server.middlewares.use('/bg-models', async (req, res) => {
        const name = decodeURIComponent((req.url || '').split('?')[0]).replace(/^\/bg-models\//, '').replace(/^\//, '');
        const url = files[name];
        if (!url) { res.statusCode = 404; res.end(); return; }
        try {
          const upstream = await fetch(url);
          res.statusCode = upstream.status;
          const length = upstream.headers.get('content-length');
          if (length) res.setHeader('Content-Length', length);
          res.setHeader('Content-Type', 'application/octet-stream');
          res.setHeader('Cache-Control', 'no-store');
          if (!upstream.ok || !upstream.body) { res.end(await upstream.text()); return; }
          const { Readable } = await import('node:stream');
          const stream = Readable.fromWeb(upstream.body);
          req.on('close', () => stream.destroy());
          stream.pipe(res);
        } catch (error) {
          res.statusCode = 502;
          res.end(String(error?.message || error));
        }
      });
    },
  }],
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 4000 },
});

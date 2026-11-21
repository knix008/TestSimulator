import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import { ISOLATION_HEADERS, voicePlugin } from './scripts/vite-voice.mjs';
import { soundsPlugin } from './scripts/vite-sounds.mjs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const commit = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
})();

export default defineConfig({
  base: './',
  clearScreen: false,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_NAME__: JSON.stringify(pkg.productName),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    __BUILD_COMMIT__: JSON.stringify(commit),
  },
  // MYAUDIOMAKER_NO_HMR: test servers — an edit while tests run must not reload the app under test.
  // Cross-origin isolation (AI voice: onnxruntime WebAssembly threads) — scripts/vite-voice.mjs.
  server: { port: 5494, strictPort: true, headers: ISOLATION_HEADERS, hmr: process.env.MYAUDIOMAKER_NO_HMR ? false : undefined, watch: { ignored: ['**/src-tauri/**', '**/test-results/**', '**/doc/**', '**/samples/**', '**/release/**', '**/dist/**', '**/sounds/**'] } },
  preview: { headers: ISOLATION_HEADERS },
  plugins: [voicePlugin(), soundsPlugin()],
  worker: { format: 'es' },
  optimizeDeps: { entries: ['index.html'], include: ['@anthropic-ai/sdk', 'fflate'], exclude: ['onnxruntime-web'] },
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});

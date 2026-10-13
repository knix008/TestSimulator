import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = dirname(fileURLToPath(import.meta.url));
const host = process.env.TAURI_DEV_HOST;

function packageVersion(relativePath) {
  try {
    return JSON.parse(readFileSync(resolve(root, relativePath), 'utf8')).version || '';
  } catch {
    return '';
  }
}

function tauriVersion() {
  try {
    const lock = readFileSync(resolve(root, 'src-tauri/Cargo.lock'), 'utf8');
    const match = lock.match(/name = "tauri"\r?\nversion = "([^"]+)"/);
    return match?.[1] || '';
  } catch {
    return '';
  }
}

function stampBuildInfo() {
  const config = process.env.TAURI_ENV_DEBUG === 'true'
    ? 'debug'
    : process.env.TAURI_ENV_DEBUG === 'false'
      ? 'release'
      : 'development';
  const target = [process.env.TAURI_ENV_PLATFORM, process.env.TAURI_ENV_ARCH].filter(Boolean).join('-');
  const payload = {
    time: new Date().toISOString(),
    config,
    target,
    vite: packageVersion('node_modules/vite/package.json'),
    tauri: tauriVersion(),
  };
  const file = resolve(root, 'src/generated/build-info.js');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `export const buildInfo = ${JSON.stringify(payload, null, 2)};\n`);
}

function buildInfoPlugin() {
  return {
    name: 'image2text-build-info',
    buildStart: stampBuildInfo,
    configureServer: stampBuildInfo,
  };
}

stampBuildInfo();

export default defineConfig({
  plugins: [buildInfoPlugin()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  optimizeDeps: {
    exclude: ['jxl-oxide-wasm'],
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});

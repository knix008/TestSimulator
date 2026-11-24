import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const versionOf = (name: string) => {
  try {
    return JSON.parse(readFileSync(new URL(`./node_modules/${name}/package.json`, import.meta.url), 'utf8')).version as string;
  } catch {
    return '';
  }
};

export default defineConfig({
  base: './',
  plugins: [react()],
  // Shown in the About window.
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __REACT_VERSION__: JSON.stringify(versionOf('react')),
    __VITE_VERSION__: JSON.stringify(versionOf('vite')),
    __APP_PACKAGE_VERSION__: JSON.stringify(pkg.version),
  },
  // Bind an explicit IPv4 address: left to default, Vite may listen on the IPv6
  // loopback only, and the webview then cannot reach it. The port is only the
  // default; scripts/start.mjs and dev.mjs pick a free one and pass it in.
  // The watcher stays out of the build output and the Rust target folder, which
  // holds thousands of files that change during every cargo build.
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    watch: { ignored: ['**/dist/**', '**/src-tauri/**', '**/doc/**'] },
  },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 4096 },
  // sql.js ships as UMD/CommonJS. It must be pre-bundled so `import initSqlJs
  // from 'sql.js'` has a default export in dev — excluding it works in the
  // production build (Rollup converts CJS) but breaks the dev server.
  // The .wasm is loaded separately via a `?url` import, so it needs no exclude.
  optimizeDeps: { include: ['sql.js'] },
});

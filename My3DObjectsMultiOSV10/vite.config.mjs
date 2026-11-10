// .mjs rather than .js: the package has no "type": "module", so a bare .js
// config would be loaded through Vite's deprecated CJS Node API.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The Tauri app serves dist/ from its own origin (tauri://localhost or
// http://tauri.localhost) and loads the dev server on port 5196 in
// `npm start`; relative asset paths (`base: './'`) work there and in a plain
// web deployment alike.
export default defineConfig({
  base: './',
  plugins: [react()],
  // Tauri prints its own output; keep Vite from clearing it.
  clearScreen: false,
  server: {
    port: 5196,
    strictPort: true,
    // The Rust sources rebuild through cargo and the engine is Python; neither
    // is part of the page.
    watch: { ignored: ['**/src-tauri/**', '**/engine/**'] },
  },
  // The loaders and exporters are imported only when a file of that kind is
  // first opened or saved. Left to discover them then, Vite re-bundles its
  // dependencies mid-session and the page's already-issued import of the old
  // bundle fails ("Failed to fetch dynamically imported module"). Bundle them
  // all up front.
  optimizeDeps: {
    include: [
      'three',
      ...[
        'controls/OrbitControls', 'controls/TransformControls', 'environments/RoomEnvironment',
        'helpers/ViewHelper', 'renderers/CSS2DRenderer',
        'exporters/GLTFExporter', 'exporters/OBJExporter', 'exporters/PLYExporter', 'exporters/STLExporter',
        'exporters/USDZExporter', 'libs/fflate.module',
        'loaders/3MFLoader', 'loaders/AMFLoader', 'loaders/ColladaLoader', 'loaders/FBXLoader',
        'loaders/GLTFLoader', 'loaders/KMZLoader', 'loaders/LWOLoader', 'loaders/MTLLoader', 'loaders/OBJLoader',
        'loaders/PCDLoader', 'loaders/PLYLoader', 'loaders/STLLoader', 'loaders/TDSLoader', 'loaders/USDZLoader',
        'loaders/VRMLLoader', 'loaders/VTKLoader', 'loaders/XYZLoader',
      ].map((m) => `three/examples/jsm/${m}.js`),
    ],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // three.js and its loaders are one big chunk; the loaders and exporters
    // are split out and loaded when a file of that kind is opened.
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.js'],
    include: ['test/**/*.test.{js,jsx}'],
    restoreMocks: true,
    reporters: ['./test/reporters/summary.mjs'],
    testTimeout: 20000,
  },
});

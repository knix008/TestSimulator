const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

// Ensure output dir exists
const outDir = path.join(__dirname, '../public/bundle');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

esbuild.build({
  entryPoints: {
    'viewer.bundle':      path.join(__dirname, '../client/viewer.js'),
    'broadcaster.bundle': path.join(__dirname, '../client/broadcaster.js'),
  },
  bundle: true,
  outdir: outDir,
  format: 'iife',
  platform: 'browser',
  target: ['chrome90', 'firefox90', 'safari14'],
  minify: false,
  sourcemap: true,
}).then(() => {
  console.log('[build] Client bundles written to public/bundle/');
}).catch((err) => {
  console.error('[build] Failed:', err.message);
  process.exit(1);
});

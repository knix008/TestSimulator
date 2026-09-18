/**
 * Web mode: serves src/ (and the DICOM parser / codec packages from node_modules) over HTTP.
 *
 *   npm run web          → http://127.0.0.1:8080
 *   PORT=9000 npm run web
 *   HOST=0.0.0.0 npm run web   (reachable from other machines)
 */
const express = require('express');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, 'src');
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '127.0.0.1';

const VENDOR_PKGS = [
  'dicom-parser',
  '@cornerstonejs/codec-openjpeg',
  '@cornerstonejs/codec-charls',
  '@cornerstonejs/codec-libjpeg-turbo-8bit',
  '@cornerstonejs/codec-libjpeg-turbo-12bit',
  'jpeg-lossless-decoder-js',
];

const app = express();
for (const pkg of VENDOR_PKGS) {
  const dir = path.join(__dirname, 'node_modules', pkg);
  if (!fs.existsSync(dir)) { console.warn(`[web] missing package ${pkg} — run npm install`); continue; }
  app.use('/node_modules/' + pkg, express.static(dir, {
    maxAge: '7d',
    setHeaders(res, filePath) {
      if (/\.(cjs|mjs)$/.test(filePath)) res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
    },
  }));
}
app.use('/samples', express.static(path.join(__dirname, 'samples')));
app.get('/samples.json', (_req, res) => {
  const dir = path.join(__dirname, 'samples');
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /\.(dcm|dicm|dicom)$/i.test(f) || !path.extname(f)); } catch { /* none */ }
  res.json(files.filter((f) => { try { return fs.statSync(path.join(dir, f)).isFile(); } catch { return false; } }));
});
app.use(express.static(ROOT, { setHeaders(res, p) { if (p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); } }));
app.get('*', (_req, res) => res.sendFile(path.join(ROOT, 'index.html')));

function listen(port) {
  const server = app.listen(port, HOST, () => console.log(`DCM Viewer (web) running at http://${HOST}:${port}`));
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') { console.warn(`Port ${port} in use, trying ${port + 1}…`); listen(port + 1); }
    else { console.error(err); process.exit(1); }
  });
}
listen(PORT);

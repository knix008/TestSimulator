/**
 * Minimal static server for browser (web) mode.
 * Serves src/ at http://127.0.0.1:PORT
 */
const express = require('express');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, 'src');
const PORT = Number(process.env.PORT) || 8080;

const app = express();

// Vendor scripts the renderer loads on demand (DICOM parser + codecs). The page references
// them as ../node_modules/<pkg>/…, which resolves to /node_modules/<pkg>/… here.
const VENDOR_PKGS = [
  'dicom-parser',
  '@cornerstonejs/codec-openjpeg',
  '@cornerstonejs/codec-charls',
  '@cornerstonejs/codec-libjpeg-turbo-8bit',
  '@cornerstonejs/codec-libjpeg-turbo-12bit',
  'jpeg-lossless-decoder-js',
];
for (const pkg of VENDOR_PKGS) {
  const dir = path.join(__dirname, 'node_modules', pkg);
  if (fs.existsSync(dir)) {
    app.use('/node_modules/' + pkg, express.static(dir, {
      maxAge: '7d',
      setHeaders(res, filePath) {
        if (filePath.endsWith('.cjs') || filePath.endsWith('.mjs')) res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
      },
    }));
  }
}

app.use(express.static(ROOT, {
  extensions: ['html'],
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

app.get('*', (req, res) => {
  res.sendFile(path.join(ROOT, 'index.html'));
});

function listen(port) {
  const server = app.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}`;
    console.log(`Image Viewer (web) running at ${url}`);
    console.log('Open the URL in your browser.');
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`Port ${port} in use, trying ${port + 1}...`);
      listen(port + 1);
    } else {
      console.error(err);
      process.exit(1);
    }
  });
}

if (!fs.existsSync(ROOT)) {
  console.error('src/ folder not found');
  process.exit(1);
}

listen(PORT);

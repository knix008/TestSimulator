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

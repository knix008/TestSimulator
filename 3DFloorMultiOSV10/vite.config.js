import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const samplesDir = path.resolve(__dirname, 'samples');

/** Serve / copy root-level `samples/` as `/samples` (dev + dist). */
function rootSamplesPlugin() {
  const mime = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.json': 'application/json',
    '.md': 'text/markdown; charset=utf-8',
    '.svg': 'image/svg+xml',
  };

  return {
    name: 'root-samples',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next();
        const urlPath = req.url.split('?')[0];
        if (!urlPath.startsWith('/samples/') && urlPath !== '/samples') return next();

        let rel = decodeURIComponent(urlPath.slice('/samples'.length));
        if (rel.startsWith('/')) rel = rel.slice(1);
        if (!rel || rel.includes('..')) return next();

        const filePath = path.resolve(samplesDir, rel);
        if (!filePath.startsWith(samplesDir) || !fs.existsSync(filePath)) return next();
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) return next();

        res.setHeader('Content-Type', mime[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Content-Length', String(stat.size));
        fs.createReadStream(filePath).pipe(res);
      });
    },
    closeBundle() {
      if (!fs.existsSync(samplesDir)) return;
      const out = path.resolve(__dirname, 'dist', 'samples');
      fs.cpSync(samplesDir, out, { recursive: true });
    },
  };
}

export default defineConfig({
  // Relative paths so Electron can load dist/index.html via file://
  base: './',
  server: {
    port: 5173,
    strictPort: true,
  },
  plugins: [rootSamplesPlugin()],
});

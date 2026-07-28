import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getDreamspaceStatus,
  ensureDreamspaceInstalled,
} from './scripts/lib/dreamspaceInstall.mjs';
import {
  getFloorplanApiStatus,
  ensureFloorplanApiReady,
} from './scripts/lib/floorplanApiInstall.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const samplesDir = path.resolve(__dirname, 'samples');
const projectRoot = __dirname;

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

/** Dev-only API to install DreamSpaceAI with SSE progress. */
function dreamspaceInstallPlugin() {
  return {
    name: 'dreamspace-install-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url) return next();
        const urlPath = req.url.split('?')[0];

        if (urlPath === '/__fp3d/dreamspace/status') {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(getDreamspaceStatus(projectRoot)));
          return;
        }

        if (urlPath === '/__fp3d/dreamspace/ensure') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
          });
          const ac = new AbortController();
          req.on('close', () => ac.abort());
          const send = (payload) => {
            res.write(`data: ${JSON.stringify(payload)}\n\n`);
          };
          try {
            const result = await ensureDreamspaceInstalled(projectRoot, {
              signal: ac.signal,
              onProgress: send,
            });
            send({ done: true, ...result });
          } catch (err) {
            if (err?.code === 'CANCELED' || ac.signal.aborted) {
              send({ done: true, ok: false, canceled: true });
            } else {
              send({
                done: true,
                ok: false,
                error: err?.message || String(err),
              });
            }
          }
          res.end();
          return;
        }

        return next();
      });
    },
  };
}

/** Dev-only API to install/start FloorPlanTo3D-API with SSE progress. */
function floorplanApiInstallPlugin() {
  return {
    name: 'floorplan-api-install',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url) return next();
        const urlPath = req.url.split('?')[0];

        if (urlPath === '/__fp3d/floorplan-api/status') {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(await getFloorplanApiStatus(projectRoot)));
          return;
        }

        if (urlPath === '/__fp3d/floorplan-api/ensure') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
          });
          const ac = new AbortController();
          req.on('close', () => ac.abort());
          const send = (payload) => {
            res.write(`data: ${JSON.stringify(payload)}\n\n`);
          };
          const runtime = new URL(req.url, 'http://127.0.0.1').searchParams.get('runtime');
          try {
            const result = await ensureFloorplanApiReady(projectRoot, {
              signal: ac.signal,
              onProgress: send,
              runtime: runtime === 'docker' ? 'docker' : 'venv',
            });
            send({ done: true, ...result });
          } catch (err) {
            if (err?.code === 'CANCELED' || ac.signal.aborted) {
              send({ done: true, ok: false, canceled: true });
            } else {
              send({
                done: true,
                ok: false,
                error: err?.message || String(err),
              });
            }
          }
          res.end();
          return;
        }

        return next();
      });
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
  plugins: [rootSamplesPlugin(), dreamspaceInstallPlugin(), floorplanApiInstallPlugin()],
});

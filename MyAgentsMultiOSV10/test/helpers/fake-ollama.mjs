// A stand-in for the `ollama` program in tests: `serve` answers /api/version, /api/tags, /api/chat and
// streams /api/pull progress on OLLAMA_HOST. `install <path>` (used as the installer) writes this file to <path>.
import http from 'node:http';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const [cmd, target] = process.argv.slice(2);
if (cmd === 'install') {
  for (const p of [10, 50, 100]) console.log(`Downloading  ${p}%`);
  fs.copyFileSync(fileURLToPath(import.meta.url), target);
  console.log('Successfully installed');
  process.exit(0);
}
if (cmd === 'serve') {
  const [host, port] = String(process.env.OLLAMA_HOST || '127.0.0.1:11434').split(':');
  const models = new Set(['llama3.3:latest']);
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      const json = (v) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(v)); };
      if (req.url === '/api/version') return json({ version: '0.99.0-test' });
      if (req.url === '/api/tags') return json({ models: [...models].map((name) => ({ name })) });
      if (req.url === '/api/pull') {
        const { model } = JSON.parse(body || '{}');
        if (model === 'no-such-model') { res.writeHead(200); res.end(`${JSON.stringify({ error: 'pull model manifest: file does not exist' })}\n`); return undefined; }
        res.writeHead(200, { 'content-type': 'application/x-ndjson' });
        for (const [status, completed] of [['pulling manifest', 0], ['downloading', 400], ['downloading', 1000], ['success', 1000]]) {
          res.write(`${JSON.stringify({ status, total: 1000, completed })}\n`);
          await new Promise((r) => setTimeout(r, 30));
        }
        models.add(model.includes(':') ? model : `${model}:latest`);
        return res.end();
      }
      if (req.url === '/api/shutdown') { json({ ok: true }); server.close(); setTimeout(() => process.exit(0), 50); return undefined; }
      res.writeHead(404); return res.end();
    });
  });
  server.listen(Number(port), host);
}

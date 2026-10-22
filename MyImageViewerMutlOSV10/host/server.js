/**
 * Desktop host for the Tauri shell.
 * Serves the renderer and the same IPC channels the Electron main process used.
 */
process.env.MYIMAGEVIEWER_RUNTIME = 'tauri';

const path = require('path');
const express = require('express');
const shim = require('./electron-shim');

require('./service');
shim.flushReady();

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.MYIMAGEVIEWER_HOST_PORT) || 17810;
const app = express();

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

app.use(express.json({ limit: '512mb' }));

function decodeArg(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)
      && typeof value.__bytes === 'string' && Object.keys(value).length === 1) {
    return Buffer.from(value.__bytes, 'base64');
  }
  return value;
}

function encodeVal(value) {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return { __bytes: Buffer.from(value).toString('base64') };
  }
  return value;
}

app.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(': ok\n\n');
  shim.addClient(res);
  req.on('close', () => shim.removeClient(res));
});

app.post('/ipc', async (req, res) => {
  const channel = req.body && req.body.channel;
  const args = Array.isArray(req.body && req.body.args) ? req.body.args.map(decodeArg) : [];
  if (!channel || typeof channel !== 'string') {
    res.status(400).json({ error: 'missing channel' });
    return;
  }
  try {
    const result = await shim.invoke(channel, args);
    res.json({ result: encodeVal(result) });
  } catch (err) {
    res.json({ result: { error: err.message || String(err) } });
  }
});

app.use('/doc', express.static(path.join(ROOT, 'doc')));
app.use(express.static(path.join(ROOT, 'src')));

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`[host] MyImageViewer listening at http://127.0.0.1:${PORT}`);
});

server.on('error', (err) => {
  console.error(`[host] ${err.message}`);
  process.exit(1);
});

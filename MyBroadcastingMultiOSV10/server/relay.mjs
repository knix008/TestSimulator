// npm run relay — the web build's stream relay. A browser cannot open RTMP / SRT / RIST connections, so the
// web app sends its stream (Matroska bytes over a WebSocket) here and FFmpeg forwards it, exactly as the
// desktop app does with its own FFmpeg (src-tauri/src/broadcast.rs). No dependencies: the WebSocket
// framing is done here.
//
//   node server/relay.mjs [--port 8765] [--host 127.0.0.1] [--ffmpeg path]
//   ws://127.0.0.1:8765/ingest?url=<rtmp://…>&audio=<aac|opus>
//
// Only localhost connects by default (--host 0.0.0.0 opens it to the network: anyone there could stream
// through it). FFmpeg's messages go back to the page as text frames.
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { streamArgs } from './ffargs.mjs';

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };

/** The first FFmpeg that answers -version (the --ffmpeg option, FFMPEG env, PATH). */
export function findFfmpeg(custom = '') {
  for (const candidate of [custom, process.env.FFMPEG, 'ffmpeg'].filter(Boolean)) {
    const r = spawnSync(candidate, ['-hide_banner', '-version'], { encoding: 'utf8' });
    if (r.status === 0) return { path: candidate, version: (r.stdout.split('\n')[0] ?? '').replace('ffmpeg version ', '').split(' ')[0] };
  }
  return null;
}

/** A WebSocket frame (server → client: never masked). */
export function frame(data, opcode) {
  const body = Buffer.isBuffer(data) ? data : Buffer.from(String(data));
  const len = body.length;
  const head = len < 126 ? Buffer.from([0x80 | opcode, len]) : len < 65536 ? Buffer.from([0x80 | opcode, 126, len >> 8, len & 255]) : Buffer.concat([Buffer.from([0x80 | opcode, 127, 0, 0, 0, 0]), (() => { const b = Buffer.alloc(4); b.writeUInt32BE(len); return b; })()]);
  return Buffer.concat([head, body]);
}

/** Parses client frames out of `buffer`; returns { frames: [{ opcode, data }], rest }. */
export function parseFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (buffer.length - offset >= 2) {
    const b0 = buffer[offset]; const b1 = buffer[offset + 1];
    let len = b1 & 127; let p = offset + 2;
    if (len === 126) { if (buffer.length < p + 2) break; len = buffer.readUInt16BE(p); p += 2; }
    else if (len === 127) { if (buffer.length < p + 8) break; len = Number(buffer.readBigUInt64BE(p)); p += 8; }
    const masked = Boolean(b1 & 128);
    if (buffer.length < p + (masked ? 4 : 0) + len) break;
    let data = buffer.subarray(p + (masked ? 4 : 0), p + (masked ? 4 : 0) + len);
    if (masked) { const mask = buffer.subarray(p, p + 4); data = Buffer.from(data.map((x, i) => x ^ mask[i % 4])); }
    frames.push({ fin: Boolean(b0 & 128), opcode: b0 & 15, data });
    offset = p + (masked ? 4 : 0) + len;
  }
  return { frames, rest: buffer.subarray(offset) };
}

export function startRelay({ port = 8765, host = '127.0.0.1', ffmpeg = '', log = console.log } = {}) {
  const ff = findFfmpeg(ffmpeg);
  const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/plain', 'access-control-allow-origin': '*' }); res.end(`MyBroadcasting relay · FFmpeg ${ff ? ff.version : 'not found'}\n`); });
  server.on('upgrade', (req, socket) => {
    const url = new URL(req.url, 'http://x');
    const key = req.headers['sec-websocket-key'];
    if (url.pathname !== '/ingest' || !key) { socket.destroy(); return; }
    const accept = crypto.createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const target = url.searchParams.get('url') ?? '';
    if (!ff) { socket.write(frame('FFmpeg not found', 1)); socket.end(frame(Buffer.from([0x03, 0xf3]), 8)); return; }
    const child = spawn(ff.path, streamArgs(target, url.searchParams.get('audio') ?? 'aac'), { stdio: ['pipe', 'ignore', 'pipe'] });
    log(`stream → ${target.replace(/\/[^/]{6,}$/, '/••••')}`);
    let buffer = Buffer.alloc(0);
    let closed = false;
    const close = (code = 1000, reason = '') => {
      if (closed) return; closed = true;
      try { child.stdin.end(); } catch { /* gone */ }
      setTimeout(() => { try { child.kill(); } catch { /* gone */ } }, 3000);
      const r = Buffer.from(reason.slice(0, 120));
      try { socket.end(frame(Buffer.concat([Buffer.from([code >> 8, code & 255]), r]), 8)); } catch { /* gone */ }
    };
    child.stderr.on('data', (d) => { for (const line of String(d).split(/\r?\n/).filter(Boolean)) { try { socket.write(frame(line, 1)); } catch { /* gone */ } child.lastLine = line; } });
    child.on('exit', (code) => { log(`FFmpeg ended (${code})`); close(code ? 1011 : 1000, code ? child.lastLine ?? `FFmpeg exit ${code}` : ''); });
    child.stdin.on('error', () => {});
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const { frames, rest } = parseFrames(buffer);
      buffer = rest;
      for (const f of frames) {
        if (f.opcode === 2 || f.opcode === 0) child.stdin.write(f.data);
        else if (f.opcode === 8) close();
        else if (f.opcode === 9) socket.write(frame(f.data, 10));
      }
    });
    socket.on('close', () => close());
    socket.on('error', () => close());
  });
  return new Promise((resolve) => server.listen(port, host, () => { log(`MyBroadcasting relay on ws://${host}:${server.address().port}/ingest (FFmpeg ${ff ? ff.version : 'NOT FOUND'})`); resolve({ server, port: server.address().port, ffmpeg: ff }); }));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  startRelay({ port: Number(arg('port', 8765)), host: arg('host', '127.0.0.1'), ffmpeg: arg('ffmpeg', '') });
}

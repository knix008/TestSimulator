// Records real TLS sessions (Node's OpenSSL over an in-memory connection) with their key log, for the
// "TLS decryption with a key log" sample capture: TLS 1.3 with AES-128-GCM, AES-256-GCM and ChaCha20-Poly1305,
// TLS 1.2 with ECDHE-ECDSA AES-GCM, ChaCha20-Poly1305 and CBC (SHA-1 and SHA-384 MACs, encrypt-then-MAC as
// OpenSSL negotiates it), each carrying an HTTP/1.1 request and response.
//
// Writes src/domain/capture/build/tls-keylog-data.js (the bytes each side wrote, in order, and the key log);
// the sample builder (build/tls-keylog.js) turns them into TCP frames. Needs openssl for the test certificate.
//
//   node scripts/make-tls-keylog-data.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Duplex } from 'node:stream';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'src', 'domain', 'capture', 'build', 'tls-keylog-data.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mnm-tls-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '3650',
  '-keyout', path.join(tmp, 'key.pem'), '-out', path.join(tmp, 'cert.pem'), '-subj', '/CN=intranet.example'], { stdio: 'ignore' });
const key = fs.readFileSync(path.join(tmp, 'key.pem'));
const cert = fs.readFileSync(path.join(tmp, 'cert.pem'));
fs.rmSync(tmp, { recursive: true, force: true });

const SESSIONS = [
  { label: 'TLS 1.3 AES-128-GCM', min: 'TLSv1.3', max: 'TLSv1.3', suites: 'TLS_AES_128_GCM_SHA256', path: '/index.html', big: false },
  { label: 'TLS 1.3 AES-256-GCM', min: 'TLSv1.3', max: 'TLSv1.3', suites: 'TLS_AES_256_GCM_SHA384', path: '/report.csv', big: true },
  { label: 'TLS 1.3 ChaCha20-Poly1305', min: 'TLSv1.3', max: 'TLSv1.3', suites: 'TLS_CHACHA20_POLY1305_SHA256', path: '/api/status', big: false },
  { label: 'TLS 1.2 ECDHE-ECDSA-AES128-GCM-SHA256', min: 'TLSv1.2', max: 'TLSv1.2', ciphers: 'ECDHE-ECDSA-AES128-GCM-SHA256', path: '/login', big: false },
  { label: 'TLS 1.2 ECDHE-ECDSA-CHACHA20-POLY1305', min: 'TLSv1.2', max: 'TLSv1.2', ciphers: 'ECDHE-ECDSA-CHACHA20-POLY1305', path: '/images/logo.txt', big: false },
  { label: 'TLS 1.2 ECDHE-ECDSA-AES256-SHA384 (CBC)', min: 'TLSv1.2', max: 'TLSv1.2', ciphers: 'ECDHE-ECDSA-AES256-SHA384', path: '/download/notes.txt', big: true },
  { label: 'TLS 1.2 ECDHE-ECDSA-AES128-SHA (CBC)', min: 'TLSv1.2', max: 'TLSv1.2', ciphers: 'ECDHE-ECDSA-AES128-SHA', path: '/old/page.html', big: false },
];

function body(s) {
  if (!s.big) return `<html><body><h1>${s.label}</h1><p>Decrypted with the key log.</p></body></html>\n`;
  let text = 'id,name,value\n';
  for (let i = 1; text.length < 20000; i++) text += `${i},item-${i},${(i * 37) % 1000}\n`;
  return text;
}

function relay(log) {
  let a = null, b = null;
  a = new Duplex({ read() {}, write(chunk, _e, cb) { log.push(['c', Buffer.from(chunk)]); b.push(chunk); cb(); }, final(cb) { b.push(null); cb(); } });
  b = new Duplex({ read() {}, write(chunk, _e, cb) { log.push(['s', Buffer.from(chunk)]); a.push(chunk); cb(); }, final(cb) { a.push(null); cb(); } });
  return [a, b];
}

async function record(s) {
  const log = [];
  const keylog = [];
  const [ca, sb] = relay(log);
  const server = new tls.TLSSocket(sb, {
    isServer: true, key, cert, minVersion: s.min, maxVersion: s.max, ALPNProtocols: ['http/1.1'],
    ciphers: s.ciphers ?? s.suites,
    sessionTimeout: 0,
  });
  const content = body(s);
  server.on('data', (req) => {
    if (!String(req).includes('\r\n\r\n')) return;
    server.write(`HTTP/1.1 200 OK\r\nContent-Type: ${s.big ? 'text/csv' : 'text/html'}\r\nContent-Length: ${Buffer.byteLength(content)}\r\nServer: example-tls\r\n\r\n${content}`);
  });
  server.on('error', () => {});
  const client = tls.connect({
    socket: ca, servername: 'intranet.example', rejectUnauthorized: false, minVersion: s.min, maxVersion: s.max, ALPNProtocols: ['http/1.1'],
    ciphers: s.ciphers ?? s.suites,
  });
  client.on('keylog', (line) => keylog.push(String(line).trim()));
  await new Promise((resolve, reject) => {
    client.once('secureConnect', resolve);
    client.once('error', reject);
  });
  const cipher = client.getCipher();
  client.write(`GET ${s.path} HTTP/1.1\r\nHost: intranet.example\r\nUser-Agent: MyNetManager-sample\r\nAccept: */*\r\n\r\n`);
  let got = 0;
  await new Promise((resolve) => {
    client.on('data', (chunk) => { got += chunk.length; if (got >= Buffer.byteLength(content)) resolve(); });
  });
  client.end();
  await new Promise((resolve) => setTimeout(resolve, 50));
  server.end();
  await new Promise((resolve) => setTimeout(resolve, 50));
  return { label: s.label, cipher: cipher.standardName ?? cipher.name, version: s.max, path: s.path, writes: log.map(([dir, bytes]) => [dir, bytes.toString('base64')]), keylog };
}

const sessions = [];
for (const s of SESSIONS) {
  const r = await record(s);
  sessions.push(r);
  console.log(`${r.label}: ${r.version} ${r.cipher}, ${r.writes.length} writes, ${r.keylog.length} key log lines`);
}
const keylog = sessions.flatMap((s) => s.keylog).join('\n') + '\n';
const text = `// Generated by scripts/make-tls-keylog-data.mjs — real TLS sessions recorded with their key log (do not edit).
// writes: [direction ('c' client / 's' server), base64 bytes] in the order the two sides wrote them.
export const TLS_SESSIONS = ${JSON.stringify(sessions.map(({ keylog: _k, ...rest }) => rest), null, 1)};

/** NSS key log (SSLKEYLOGFILE format) for every session above. */
export const TLS_KEYLOG = ${JSON.stringify(keylog)};
`;
fs.writeFileSync(out, text);
console.log(`wrote ${path.relative(root, out)} (${(text.length / 1024).toFixed(1)} KB)`);

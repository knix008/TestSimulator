// mockDevice.mjs — HTTPS mock of an Intellivix reader device.
// Lets you run/test the whole app end-to-end with no real hardware.
//   npm run mock            -> listens on https://0.0.0.0:8443/at
//   PORT=9000 npm run mock  -> custom port
// Responds to AT commands posted as the request body with plain text
// ("OK", "FAIL" or a data string), matching the original device protocol.
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '8443', 10);
const HOST = process.env.HOST || '0.0.0.0';

const options = {
  key: fs.readFileSync(path.join(__dirname, 'certs', 'device-key.pem')),
  cert: fs.readFileSync(path.join(__dirname, 'certs', 'device-cert.pem'))
};

// Simple in-memory device state.
const state = {
  serial: 'VIX-0001-DEMO',
  mac: '00:1A:2B:3C:4D:5E',
  version: 'FW 2.4.1 (mock)',
  failRate: parseFloat(process.env.FAIL_RATE || '0') // 0..1 to simulate failures
};

function respond(command) {
  const cmd = command.trim();
  const up = cmd.toUpperCase();

  if (up === 'AT') return 'OK';
  if (up === 'AT+TEST=BEGIN') return 'OK';
  if (up === 'AT+SERIAL?') return state.serial;
  if (up.startsWith('AT+SERIAL=')) { state.serial = cmd.slice('AT+SERIAL='.length); return 'OK'; }
  if (up === 'AT+MAC?') return state.mac;
  if (up === 'AT+VER?') return state.version;
  if (up === 'AT+REBOOT') return 'OK';
  if (up === 'AT+CLEAR') return 'OK';

  // Any test command: AT+TEST=... (incl. LED_RED, BIST, NFC, ...)
  if (up.startsWith('AT+TEST=')) {
    if (state.failRate > 0 && Math.random() < state.failRate) return 'FAIL';
    return 'OK';
  }
  return 'FAIL';
}

const server = https.createServer(options, (req, res) => {
  // CORS so the Web build (fetch from a browser) can talk to the mock.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const reply = respond(body);
    const stamp = new Date().toTimeString().slice(0, 8);
    console.log(`[${stamp}] ${req.method} ${req.url}  "${body.trim()}" -> ${reply}`);
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(reply + '\r\n');
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Mock Intellivix device listening on https://${HOST}:${PORT}/  (self-signed)`);
  console.log(`  serial=${state.serial}  mac=${state.mac}  ver=${state.version}  failRate=${state.failRate}`);
});

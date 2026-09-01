// smoke.mjs — end-to-end check with no hardware and no Electron.
// Boots the mock device in-process, fires the same AT commands the UI sends
// over HTTPS (self-signed accepted), and asserts the parsed verdicts.
// Run: npm run smoke
import https from 'node:https';
import { interpretResponse } from '../src/core/deviceClient.js';

process.env.PORT = process.env.PORT || '8443';
process.env.HOST = '127.0.0.1';
await import('../server/mockDevice.mjs'); // starts listening
await new Promise((r) => setTimeout(r, 300));

const PORT = parseInt(process.env.PORT, 10);

function send(command) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(command, 'utf8');
    const req = https.request(
      { host: '127.0.0.1', port: PORT, path: '/at', method: 'POST',
        rejectUnauthorized: false,
        headers: { 'Content-Type': 'text/plain', 'Content-Length': data.length } },
      (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve(b.trim())); }
    );
    req.on('error', reject);
    req.write(data); req.end();
  });
}

const cases = [
  { cmd: 'AT', kind: 'test', want: 'pass' },
  { cmd: 'AT+TEST=BEGIN', kind: 'test', want: 'pass' },
  { cmd: 'AT+SERIAL?', kind: 'read', want: 'data' },
  { cmd: 'AT+SERIAL=VIX-9999', kind: 'write', want: 'pass' },
  { cmd: 'AT+MAC?', kind: 'read', want: 'data' },
  { cmd: 'AT+VER?', kind: 'read', want: 'data' },
  { cmd: 'AT+TEST=NFC', kind: 'test', want: 'pass' },
  { cmd: 'AT+TEST=LED_RED', kind: 'test', want: 'pass' },
  { cmd: 'BOGUS', kind: 'test', want: 'fail' }
];

let pass = 0, fail = 0;
for (const c of cases) {
  const resp = await send(c.cmd);
  const r = interpretResponse(c.kind, resp);
  const ok = r.verdict === c.want;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.cmd.padEnd(18)} -> "${resp}" (${r.verdict})`);
  ok ? pass++ : fail++;
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

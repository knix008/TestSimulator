// A tiny PACS for trying the PACS window and for the GUI smoke test: Query/Retrieve + Storage SCP
// (src/js/dicomNet.js MemoryArchive) over Node sockets, filled with the DICOM files of samples/.
//   node scripts/mini-pacs.cjs [--port 11113] [--ae MINIPACS] [--dest MYDCMVIEWER=127.0.0.1:11112] [--dir samples]
// Compressed files are decompressed for peers that only accept uncompressed data (as real PACS transcode).
// C-MOVE destinations come from --dest (repeatable). Files sent to it with C-STORE are kept in memory
// and can be searched / retrieved again. Prints "READY <port>" once listening; Ctrl+C stops it.
'use strict';
const fs = require('fs');
const net = require('net');
const path = require('path');
const N = require('../src/js/dicomNet.js');
const W = require('../src/js/dicomWriter.js');

const args = process.argv.slice(2);
const arg = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const port = +arg('--port', 11113);
const ae = arg('--ae', 'MINIPACS');
const root = path.resolve(arg('--dir', path.join(__dirname, '..', 'samples')));
const dests = {};
args.forEach((a, i) => {
  if (a !== '--dest') return;
  const m = /^([^=]+)=([^:]+):(\d+)$/.exec(args[i + 1] || '');
  if (m) dests[m[1].toUpperCase()] = { host: m[2], port: +m[3] };
});

function transport(socket) {
  let onData = null, closed = false;
  const queue = [], closeCbs = [];
  socket.on('data', (d) => { const u = new Uint8Array(d.buffer, d.byteOffset, d.length); if (onData) onData(u); else queue.push(u); });
  socket.on('close', () => { closed = true; closeCbs.splice(0).forEach((cb) => cb()); });
  socket.on('error', () => {});
  return {
    write: (b) => new Promise((res, rej) => socket.write(b, (e) => (e ? rej(e) : res()))),
    onData(cb) { onData = cb; queue.splice(0).forEach(cb); },
    onClose(cb) { if (closed) cb(); else closeCbs.push(cb); },
    close: () => new Promise((res) => { if (closed) return res(); socket.once('close', res); socket.end(); setTimeout(() => socket.destroy(), 300).unref(); }),
  };
}
const connect = (host, p) => new Promise((res, rej) => { const s = net.connect({ host, port: p }, () => res(transport(s))); s.once('error', rej); });

// every Part-10 file under the folder (DICOMDIR itself and non-DICOM files are skipped)
const archive = new N.MemoryArchive();
let added = 0;
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (e.name === 'DICOMDIR') continue;
    const b = fs.readFileSync(p);
    if (b.length < 132 || b.toString('latin1', 128, 132) !== 'DICM') continue;
    try { archive.add(new Uint8Array(b.buffer, b.byteOffset, b.length)); added++; } catch { /* not indexable */ }
  }
})(root);

const handlers = archive.handlers({
  moveDestination: (dest) => { const d = dests[String(dest).toUpperCase()]; return d ? { connect: () => connect(d.host, d.port) } : null; },
});
const server = net.createServer((sock) => {
  N.serve(transport(sock), Object.assign({ aeTitle: ae, anyCalledAE: true, acceptAll: true, transcode: (b) => W.decompress(b), onEcho: () => console.log('C-ECHO from', sock.remoteAddress) }, handlers));
});
server.listen(port, () => {
  console.log(`${ae}: ${added} files from ${root}; C-MOVE destinations: ${Object.keys(dests).join(', ') || '(none)'}`);
  console.log(`READY ${server.address().port}`);
});
process.on('SIGINT', () => server.close(() => process.exit(0)));

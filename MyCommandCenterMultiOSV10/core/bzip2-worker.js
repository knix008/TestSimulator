// bzip2 (de)compression on a worker thread.
//
// Node's zlib has no bzip2, so the pure-JS `compressjs` implementation is used.
// It is synchronous and byte-oriented, which would freeze the Electron main
// process (and stall every IPC call) for the duration of a large archive —
// hence a worker. Both directions stream through buffered file reads/writes,
// so memory stays flat regardless of the archive size, and the parent reports
// progress from the byte counters posted here. Cancellation is simply
// `worker.terminate()` followed by deleting the partial output.
'use strict';

const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');

const { mode, input, output } = workerData;

const CHUNK = 1 << 20;

// compressjs streams: readByte()/eof() on input, writeByte() on output. The
// `read`/`write` bulk variants are used where compressjs supports them.
function fileInputStream(fd, size) {
  const buf = Buffer.alloc(CHUNK);
  let bufPos = 0, bufLen = 0, filePos = 0, done = false;
  let reported = 0;
  const fill = () => {
    bufLen = fs.readSync(fd, buf, 0, CHUNK, filePos);
    bufPos = 0;
    filePos += bufLen;
    if (bufLen === 0) done = true;
    if (filePos - reported >= 4 * CHUNK || done) { reported = filePos; parentPort.postMessage({ type: 'progress', bytes: filePos, total: size }); }
  };
  return {
    size,
    readByte() {
      if (bufPos >= bufLen) { if (done) return -1; fill(); if (bufLen === 0) return -1; }
      return buf[bufPos++];
    },
    read(dst, off, len) {
      let n = 0;
      while (n < len) {
        if (bufPos >= bufLen) { if (done) break; fill(); if (bufLen === 0) break; }
        const take = Math.min(len - n, bufLen - bufPos);
        for (let i = 0; i < take; i++) dst[off + n + i] = buf[bufPos + i];
        bufPos += take;
        n += take;
      }
      return n;
    },
    eof() { return done || (bufPos >= bufLen && filePos >= size); },
  };
}

function fileOutputStream(fd) {
  const buf = Buffer.alloc(CHUNK);
  let pos = 0;
  const flush = () => { if (pos) { fs.writeSync(fd, buf, 0, pos); pos = 0; } };
  return {
    writeByte(b) { buf[pos++] = b; if (pos >= CHUNK) flush(); },
    write(src, off, len) { for (let i = 0; i < len; i++) { buf[pos++] = src[off + i]; if (pos >= CHUNK) flush(); } return len; },
    flush,
  };
}

function main() {
  const { Bzip2 } = require('compressjs');
  const inFd = fs.openSync(input, 'r');
  const outFd = fs.openSync(output, 'w');
  try {
    const size = fs.fstatSync(inFd).size;
    const inStream = fileInputStream(inFd, size);
    const outStream = fileOutputStream(outFd);
    if (mode === 'compress') Bzip2.compressFile(inStream, outStream, 9);
    else Bzip2.decompressFile(inStream, outStream, true);
    outStream.flush();
  } finally {
    fs.closeSync(inFd);
    fs.closeSync(outFd);
  }
  parentPort.postMessage({ type: 'done' });
}

try {
  main();
} catch (err) {
  parentPort.postMessage({ type: 'error', message: err && err.message ? err.message : String(err) });
}

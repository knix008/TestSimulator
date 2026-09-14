// Minimal streaming tar (ustar + pax long names) writer and reader.
//
// Written here rather than pulled from npm so that the archive code has no
// native dependency and behaves identically inside Electron and the web
// server. The output is read by GNU tar, bsdtar and libarchive (so the GTK
// version of Command Center can open what this one makes, and vice versa).
'use strict';

const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

const BLOCK = 512;

function pad(n) { return (BLOCK - (n % BLOCK)) % BLOCK; }

function octal(value, len) {
  // len includes the trailing NUL; numbers are written as ASCII octal.
  return value.toString(8).padStart(len - 1, '0') + '\0';
}

function writeStr(buf, off, len, str) {
  const b = Buffer.from(str, 'utf8');
  b.copy(buf, off, 0, Math.min(len, b.length));
}

function checksum(header) {
  let sum = 0;
  for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 32 : header[i];
  return sum;
}

// Builds a 512-byte ustar header. `name` must already fit in 100 bytes (pax
// headers carry longer names — see paxHeader()).
function header({ name, mode, uid = 0, gid = 0, size, mtime, type, linkname = '', uname = '', gname = '' }) {
  const h = Buffer.alloc(BLOCK, 0);
  writeStr(h, 0, 100, name);
  writeStr(h, 100, 8, octal(mode & 0o7777, 8));
  writeStr(h, 108, 8, octal(uid, 8));
  writeStr(h, 116, 8, octal(gid, 8));
  writeStr(h, 124, 12, octal(size, 12));
  writeStr(h, 136, 12, octal(Math.max(0, Math.floor(mtime)), 12));
  h[156] = type.charCodeAt(0);
  writeStr(h, 157, 100, linkname);
  writeStr(h, 257, 6, 'ustar\0');
  writeStr(h, 263, 2, '00');
  writeStr(h, 265, 32, uname);
  writeStr(h, 297, 32, gname);
  writeStr(h, 148, 8, checksum(h).toString(8).padStart(6, '0') + '\0 ');
  return h;
}

// pax extended header ('x') carrying key=value records that do not fit ustar.
function paxHeader(records, mtime) {
  let body = '';
  for (const [k, v] of Object.entries(records)) {
    const rec = ` ${k}=${v}\n`;
    let len = Buffer.byteLength(rec, 'utf8');
    // The length prefix counts itself; grow until it is self-consistent.
    let digits = String(len).length;
    while (String(len + digits).length !== digits) digits++;
    len += digits;
    body += `${len}${rec}`;
  }
  const data = Buffer.from(body, 'utf8');
  const h = header({ name: 'PaxHeader', mode: 0o644, size: data.length, mtime, type: 'x' });
  return Buffer.concat([h, data, Buffer.alloc(pad(data.length))]);
}

// Names that are short and pure ASCII go straight into the ustar field;
// anything else (long, or non-ASCII such as Korean) also gets a pax `path`
// record so every reader agrees on the encoding.
function fitsUstar(name) {
  return Buffer.byteLength(name, 'utf8') <= 100 && !/[^\x20-\x7e]/.test(name);
}

function toPosix(p) { return p.split(path.sep).join('/'); }

// Entries: { name (archive path, posix), realPath, isDir, isSymlink, target,
// size, mtime (seconds), mode }. `isCancelled()` is polled between entries.
// `onEntry(name)` fires as each entry starts.
async function* tarStream(entries, { isCancelled, onEntry } = {}) {
  for (const e of entries) {
    if (isCancelled && isCancelled()) throw cancelledError();
    if (onEntry) onEntry(e.name);

    let name = e.name;
    if (e.isDir && !name.endsWith('/')) name += '/';
    const records = {};
    if (!fitsUstar(name)) records.path = name;
    if (e.isSymlink && Buffer.byteLength(e.target || '', 'utf8') > 100) records.linkpath = e.target;
    if (e.mtime && !Number.isInteger(e.mtime)) records.mtime = e.mtime.toFixed(6);
    if (Object.keys(records).length) yield paxHeader(records, e.mtime || 0);

    const shortName = records.path ? truncateName(name) : name;
    const size = e.isDir || e.isSymlink ? 0 : e.size;
    yield header({
      name: shortName,
      mode: e.mode || (e.isDir ? 0o755 : 0o644),
      size,
      mtime: e.mtime || 0,
      type: e.isDir ? '5' : e.isSymlink ? '2' : '0',
      linkname: e.isSymlink ? truncateName(e.target || '') : '',
    });

    if (size > 0) {
      const rs = fs.createReadStream(e.realPath, { highWaterMark: 1 << 16 });
      let written = 0;
      for await (const chunk of rs) {
        if (isCancelled && isCancelled()) { rs.destroy(); throw cancelledError(); }
        // A file that grows while being archived must not corrupt the stream:
        // never emit more than the size recorded in the header.
        const slice = written + chunk.length > size ? chunk.subarray(0, size - written) : chunk;
        written += slice.length;
        if (slice.length) yield slice;
        if (written >= size) { rs.destroy(); break; }
      }
      if (written < size) yield Buffer.alloc(size - written); // shrunk meanwhile
      const p = pad(size);
      if (p) yield Buffer.alloc(p);
    }
  }
  yield Buffer.alloc(BLOCK * 2);
}

function truncateName(name) {
  const b = Buffer.from(name, 'utf8').subarray(0, 100);
  return b.toString('utf8').replace(/�+$/, '');
}

function cancelledError() {
  const err = new Error('cancelled');
  err.code = 'CANCELLED';
  return err;
}

// Walks `sources` and produces tar entries whose archive names are relative
// to each source's parent directory (what `tar -C parent name` does).
async function collectEntries(sources, { isCancelled } = {}) {
  const entries = [];
  async function walk(realPath, archName) {
    if (isCancelled && isCancelled()) throw cancelledError();
    const st = await fs.promises.lstat(realPath);
    if (st.isSymbolicLink()) {
      let target = '';
      try { target = await fs.promises.readlink(realPath); } catch { /* dangling */ }
      entries.push({ name: archName, realPath, isSymlink: true, target, size: 0, mtime: st.mtimeMs / 1000, mode: 0o777 });
      return;
    }
    if (st.isDirectory()) {
      entries.push({ name: archName, realPath, isDir: true, size: 0, mtime: st.mtimeMs / 1000, mode: st.mode });
      const names = (await fs.promises.readdir(realPath)).sort();
      for (const n of names) await walk(path.join(realPath, n), `${archName}/${n}`);
      return;
    }
    if (st.isFile()) {
      entries.push({ name: archName, realPath, size: st.size, mtime: st.mtimeMs / 1000, mode: st.mode });
    }
  }
  for (const src of sources) await walk(src, toPosix(path.basename(src)));
  return entries;
}

function readableFromEntries(entries, opts) {
  return Readable.from(tarStream(entries, opts));
}

// ── Reader ────────────────────────────────────────────────

function parseOctal(buf) {
  const s = buf.toString('ascii').replace(/\0.*$/s, '').trim();
  if (!s) return 0;
  if (buf[0] & 0x80) { // base-256 (GNU) for huge sizes
    let v = 0;
    for (let i = 1; i < buf.length; i++) v = v * 256 + buf[i];
    return v;
  }
  return parseInt(s, 8) || 0;
}

function cstr(buf) {
  const i = buf.indexOf(0);
  return (i >= 0 ? buf.subarray(0, i) : buf).toString('utf8');
}

function parseHeader(h) {
  if (h.every((b) => b === 0)) return null;
  const name = cstr(h.subarray(0, 100));
  const mode = parseOctal(h.subarray(100, 108));
  const size = parseOctal(h.subarray(124, 136));
  const mtime = parseOctal(h.subarray(136, 148));
  const type = String.fromCharCode(h[156] || 48);
  const linkname = cstr(h.subarray(157, 257));
  const magic = h.subarray(257, 263).toString('ascii');
  let prefix = '';
  if (magic.startsWith('ustar')) prefix = cstr(h.subarray(345, 500));
  return { name: prefix ? `${prefix}/${name}` : name, mode, size, mtime, type, linkname };
}

function parsePax(data) {
  const out = {};
  let pos = 0;
  const s = data.toString('utf8');
  while (pos < s.length) {
    const sp = s.indexOf(' ', pos);
    if (sp < 0) break;
    const len = parseInt(s.slice(pos, sp), 10);
    if (!len) break;
    // `len` counts bytes; the string is decoded, so re-derive via Buffer.
    const recBytes = Buffer.from(s.slice(pos), 'utf8').subarray(0, len).toString('utf8');
    const eq = recBytes.indexOf('=');
    if (eq > 0) out[recBytes.slice(recBytes.indexOf(' ') + 1, eq)] = recBytes.slice(eq + 1).replace(/\n$/, '');
    pos += recBytes.length;
  }
  return out;
}

// Reads tar entries from an async iterable of Buffers. Calls
// `onEntry({name, type, size, mode, mtime, linkname}, body)` where body is an
// async iterable of the entry's content chunks that MUST be fully consumed
// before the next entry is delivered.
async function readTar(source, onEntry, { isCancelled } = {}) {
  let pending = Buffer.alloc(0);
  let ended = false;
  const it = source[Symbol.asyncIterator]();

  async function ensure(n) {
    while (pending.length < n && !ended) {
      const { value, done } = await it.next();
      if (done) { ended = true; break; }
      pending = pending.length ? Buffer.concat([pending, value]) : value;
    }
    return pending.length >= n;
  }
  function take(n) { const b = pending.subarray(0, n); pending = pending.subarray(n); return b; }

  let paxNext = null;
  let gnuLongName = null;
  let gnuLongLink = null;
  let zeroBlocks = 0;

  for (;;) {
    if (isCancelled && isCancelled()) throw cancelledError();
    if (!(await ensure(BLOCK))) break;
    const hdr = parseHeader(take(BLOCK));
    if (!hdr) { if (++zeroBlocks >= 2) break; continue; }
    zeroBlocks = 0;

    const total = hdr.size + pad(hdr.size);
    if (hdr.type === 'x' || hdr.type === 'g' || hdr.type === 'L' || hdr.type === 'K') {
      await ensure(total);
      const data = take(total).subarray(0, hdr.size);
      if (hdr.type === 'x') paxNext = { ...(paxNext || {}), ...parsePax(data) };
      else if (hdr.type === 'L') gnuLongName = cstr(data);
      else if (hdr.type === 'K') gnuLongLink = cstr(data);
      continue;
    }

    const entry = { ...hdr };
    if (paxNext) {
      if (paxNext.path) entry.name = paxNext.path;
      if (paxNext.linkpath) entry.linkname = paxNext.linkpath;
      if (paxNext.size) entry.size = parseInt(paxNext.size, 10);
      if (paxNext.mtime) entry.mtime = parseFloat(paxNext.mtime);
      paxNext = null;
    }
    if (gnuLongName) { entry.name = gnuLongName; gnuLongName = null; }
    if (gnuLongLink) { entry.linkname = gnuLongLink; gnuLongLink = null; }
    if (entry.type === '\0' || entry.type === '7') entry.type = '0';
    if (entry.name.endsWith('/') && entry.type === '0') entry.type = '5';

    let remaining = entry.size;
    const padding = pad(entry.size);
    const body = (async function* () {
      while (remaining > 0) {
        if (isCancelled && isCancelled()) throw cancelledError();
        if (!pending.length && !(await ensure(1))) throw new Error('Unexpected end of archive');
        const chunk = take(Math.min(remaining, pending.length));
        remaining -= chunk.length;
        yield chunk;
      }
    })();
    await onEntry(entry, body);
    // Drain whatever the consumer did not read, then the padding.
    for await (const _ of body) { void _; }
    if (padding) { await ensure(padding); take(padding); }
  }
}

module.exports = { collectEntries, readableFromEntries, tarStream, readTar, cancelledError, toPosix };

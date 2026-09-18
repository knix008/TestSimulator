// File system access for the editor: read / write documents (with encoding
// and line-ending handling from ./encoding.js), directory listings for the
// sidebar tree and the in-app file dialog of the web version, drives.
'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const enc = require('./encoding');
const heic = require('./heic');
const dicom = require('./dicom');

const MAX_FILE = 64 * 1024 * 1024;   // refuse to open anything bigger than 64 MB

function err(code, message, extra) {
  const e = new Error(message);
  e.code = code;
  Object.assign(e, extra || {});
  return e;
}

async function stat(p) {
  const st = await fsp.stat(p);
  return { path: p, name: path.basename(p), isDir: st.isDirectory(), size: st.size, mtime: st.mtimeMs, readonly: !(await writable(p)) };
}

async function writable(p) {
  try { await fsp.access(p, fs.constants.W_OK); return true; } catch { return false; }
}

// { text, encoding, eol, size, mtime, readonly }
async function read(p, { encoding = null, defaultEol = 'lf' } = {}) {
  const st = await fsp.stat(p);
  if (st.isDirectory()) throw err('EISDIR', `Not a file: ${p}`, { path: p });
  if (st.size > MAX_FILE) throw err('ETOOBIG', `File is larger than ${MAX_FILE / 1024 / 1024} MB: ${p}`, { path: p, size: st.size });
  const buf = await fsp.readFile(p);
  const d = enc.decode(buf, { encoding, defaultEol });
  if (d.binary) throw err('EBINARY', `Binary file: ${p}`, { path: p, size: st.size });
  return { text: d.text, encoding: d.encoding, eol: d.eol, size: st.size, mtime: st.mtimeMs, readonly: !(await writable(p)) };
}

// The hex view reads a file in pieces, so its size does not matter (no
// MAX_FILE here): readRange gives `length` bytes from `offset` as base64,
// sniff says whether the file looks binary from its first 64 KB (for a file
// too big to open as text: binary → hex view, text → refused as before).
const MAX_RANGE = 4 * 1024 * 1024;
async function readRange(p, offset = 0, length = 65536) {
  const st = await fsp.stat(p);
  if (st.isDirectory()) throw err('EISDIR', `Not a file: ${p}`, { path: p });
  const start = Math.max(0, Math.min(Number(offset) || 0, st.size));
  const len = Math.max(0, Math.min(Number(length) || 0, MAX_RANGE, st.size - start));
  const buf = Buffer.alloc(len);
  let read = 0;
  if (len) {
    const fh = await fsp.open(p, 'r');
    try { read = (await fh.read(buf, 0, len, start)).bytesRead; } finally { await fh.close(); }
  }
  return { base64: buf.subarray(0, read).toString('base64'), offset: start, size: st.size, mtime: st.mtimeMs, readonly: !(await writable(p)) };
}
async function sniff(p) {
  const r = await readRange(p, 0, 65536);
  const d = enc.decode(Buffer.from(r.base64, 'base64'));
  return { binary: !!d.binary, size: r.size, mtime: r.mtime, readonly: r.readonly };
}

// Writes atomically (temp file + rename) so a crash never leaves a half file.
// Returns the new stat so the caller can track external modifications.
async function write(p, text, { encoding = 'utf8', eol = 'lf' } = {}) {
  const buf = enc.encode(text, encoding, eol);
  const dir = path.dirname(p);
  await fsp.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(p)}.${process.pid}.tmp`);
  try {
    await fsp.writeFile(tmp, buf);
    await fsp.rename(tmp, p);
  } catch (e) {
    try { await fsp.unlink(tmp); } catch { /* nothing to clean */ }
    // rename fails across some network shares / when the target is locked → plain write
    if (e.code === 'EPERM' || e.code === 'EXDEV' || e.code === 'EBUSY') await fsp.writeFile(p, buf);
    else throw e;
  }
  const st = await fsp.stat(p);
  return { size: st.size, mtime: st.mtimeMs, bytes: buf.length };
}

// Directory listing: folders first, natural order, dot-files last.
async function list(dir, { showHidden = false } = {}) {
  const resolved = path.resolve(dir);
  const names = await fsp.readdir(resolved, { withFileTypes: true });
  const entries = [];
  for (const d of names) {
    const hidden = d.name.startsWith('.');
    if (hidden && !showHidden) continue;
    const full = path.join(resolved, d.name);
    let isDir = d.isDirectory();
    let size = 0, mtime = 0;
    if (d.isSymbolicLink()) {
      try { const st = await fsp.stat(full); isDir = st.isDirectory(); size = st.size; mtime = st.mtimeMs; } catch { continue; }
    } else if (!isDir) {
      try { const st = await fsp.stat(full); size = st.size; mtime = st.mtimeMs; } catch { /* unreadable */ }
    }
    entries.push({ name: d.name, path: full, isDir, size, mtime, hidden });
  }
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  entries.sort((a, b) => (a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : (a.hidden !== b.hidden ? (a.hidden ? 1 : -1) : collator.compare(a.name, b.name))));
  return { path: resolved, parent: path.dirname(resolved) === resolved ? null : path.dirname(resolved), entries };
}

// Drive letters (Windows) / root + home + mounted volumes (Unix) for the
// in-app file dialog.
function drives() {
  return new Promise((resolve) => {
    const home = os.homedir();
    if (process.platform !== 'win32') {
      const roots = [{ name: '/', path: '/' }, { name: '~', path: home }];
      for (const base of ['/mnt', '/media', '/Volumes']) {
        try { for (const n of fs.readdirSync(base)) roots.push({ name: n, path: path.join(base, n) }); } catch { /* none */ }
      }
      return resolve(roots);
    }
    // `wmic` is gone on recent Windows; probe the letters instead (fast: stat only).
    const out = [];
    for (let c = 65; c <= 90; c++) {
      const root = `${String.fromCharCode(c)}:\\`;
      try { fs.statSync(root); out.push({ name: root.slice(0, 2), path: root }); } catch { /* absent */ }
    }
    out.push({ name: '~', path: home });
    resolve(out);
  });
}

async function mkdir(p) {
  await fsp.mkdir(p, { recursive: true });
  return stat(p);
}

async function rename(from, to) {
  await fsp.rename(from, to);
  return stat(to);
}

async function remove(p) {
  await fsp.rm(p, { recursive: true, force: true });
  return true;
}

async function exists(p) {
  try { await fsp.access(p); return true; } catch { return false; }
}

// Opens `p` with the OS default application / reveals it in the file manager
// when the host gives us no better way (the web server).
function openExternal(p) {
  return new Promise((resolve) => {
    const done = () => resolve(true);
    if (process.platform === 'win32') execFile('cmd', ['/c', 'start', '', p], { windowsHide: true }, done);
    else if (process.platform === 'darwin') execFile('open', [p], done);
    else execFile('xdg-open', [p], done);
  });
}

// An image file as a data URL, for the Markdown WYSIWYG view / preview (the
// renderer cannot load local files itself). A Windows .ico often stores PNG
// frames that <img> cannot draw from image/x-icon, so those are unwrapped.
// HEIC / HEIF / DICOM are decoded here to PNG — Chromium cannot draw them.
const IMAGE_MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.bmp': 'image/bmp', '.ico': 'image/x-icon',
  '.avif': 'image/avif', '.heic': 'image/heic', '.heif': 'image/heif',
  '.dcm': 'application/dicom', '.dicom': 'application/dicom',
};
const MAX_IMAGE = 32 * 1024 * 1024;
const MAX_MEDIA = 128 * 1024 * 1024;

function icoLargestPng(buf) {
  if (buf.length < 6 || buf[0] !== 0 || buf[1] !== 0 || buf[2] !== 1 || buf[3] !== 0) return null;
  const n = buf.readUInt16LE(4);
  let best = null, bestBytes = -1;
  for (let i = 0; i < n; i++) {
    const o = 6 + i * 16;
    if (o + 16 > buf.length) break;
    const size = buf.readUInt32LE(o + 8);
    const off = buf.readUInt32LE(o + 12);
    if (off + size > buf.length || size < 8) continue;
    if (buf[off] === 0x89 && buf[off + 1] === 0x50 && buf[off + 2] === 0x4e && buf[off + 3] === 0x47) {
      if (size >= bestBytes) { bestBytes = size; best = buf.subarray(off, off + size); }
    }
  }
  return best;
}

async function dataUrl(p) {
  const ext = path.extname(p).toLowerCase();
  let mime = IMAGE_MIME[ext];
  if (!mime) throw Object.assign(new Error('Not an image: ' + p), { code: 'ENOTIMAGE' });
  const st = await fsp.stat(p);
  const cap = (ext === '.heic' || ext === '.heif' || ext === '.dcm' || ext === '.dicom') ? MAX_MEDIA : MAX_IMAGE;
  if (st.size > cap) throw Object.assign(new Error('Image too large: ' + p), { code: 'ETOOLARGE' });
  if (ext === '.heic' || ext === '.heif') {
    return { dataUrl: await heic.firstPng(p), size: st.size, mtime: st.mtimeMs };
  }
  if (ext === '.dcm' || ext === '.dicom') {
    const r = await dicom.preview(p, { index: 0 });
    return { dataUrl: r.src, size: st.size, mtime: st.mtimeMs };
  }
  let buf = await fsp.readFile(p);
  if (ext === '.ico') {
    const png = icoLargestPng(buf);
    if (png) { mime = 'image/png'; buf = png; }
    else mime = 'image/vnd.microsoft.icon';
  }
  return { dataUrl: `data:${mime};base64,${buf.toString('base64')}`, size: st.size, mtime: st.mtimeMs };
}

// One frame of a picture that needs a decoder (HEIC / HEIF / DICOM) — the
// renderer uses this for the slider, window/level, and metadata panel.
async function imagePreview(p, { index = null } = {}) {
  const ext = path.extname(p).toLowerCase();
  const st = await fsp.stat(p);
  const cap = (ext === '.heic' || ext === '.heif' || ext === '.dcm' || ext === '.dicom') ? MAX_MEDIA : MAX_IMAGE;
  if (st.size > cap) throw Object.assign(new Error('Image too large: ' + p), { code: 'ETOOLARGE' });
  if (ext === '.heic' || ext === '.heif') return heic.preview(p, { index: index == null ? 0 : index });
  if (ext === '.dcm' || ext === '.dicom') return dicom.preview(p, { index });
  const r = await dataUrl(p);
  return { kind: 'raster', mode: 'frames', index: 0, count: 1, src: r.dataUrl, path: p };
}

// Writes the bytes of a data URL (an exported image).
async function writeDataUrl(p, url) {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(String(url || ''));
  if (!m) throw new Error('not a data URL');
  const buf = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]), 'utf8');
  await fsp.mkdir(path.dirname(path.resolve(p)), { recursive: true });
  await fsp.writeFile(p, buf);
  return { path: path.resolve(p), size: buf.length };
}

module.exports = { stat, read, readRange, sniff, write, list, drives, mkdir, rename, remove, exists, openExternal, dataUrl, writeDataUrl, imagePreview, MAX_FILE, homedir: () => os.homedir() };

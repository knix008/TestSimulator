// File system access: maps and exported files (text and binary, written
// atomically), pictures as data URLs (topic images), directory listings and
// drives for the in-app file dialog of the web version.
'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const MAX_FILE = 128 * 1024 * 1024;   // refuse to open anything bigger than 128 MB

function err(code, message, extra) {
  const e = new Error(message);
  e.code = code;
  Object.assign(e, extra || {});
  return e;
}

async function writable(p) {
  try { await fsp.access(p, fs.constants.W_OK); return true; } catch { return false; }
}

async function stat(p) {
  const st = await fsp.stat(p);
  return { path: p, name: path.basename(p), isDir: st.isDirectory(), size: st.size, mtime: st.mtimeMs, readonly: !(await writable(p)) };
}

async function readBuffer(p) {
  const st = await fsp.stat(p);
  if (st.isDirectory()) throw err('EISDIR', `Not a file: ${p}`, { path: p });
  if (st.size > MAX_FILE) throw err('ETOOBIG', `File is larger than ${MAX_FILE / 1024 / 1024} MB: ${p}`, { path: p, size: st.size });
  const buf = await fsp.readFile(p);
  return { buf, size: st.size, mtime: st.mtimeMs, readonly: !(await writable(p)) };
}

// Text: UTF-8 (a UTF-8 / UTF-16 BOM is honoured), line endings as they are.
function decodeText(buf) {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString('utf8');
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.from(buf.subarray(2));
    swapped.swap16();
    return swapped.toString('utf16le');
  }
  return buf.toString('utf8');
}

async function readText(p) {
  const r = await readBuffer(p);
  return { text: decodeText(r.buf), size: r.size, mtime: r.mtime, readonly: r.readonly };
}

async function readBase64(p) {
  const r = await readBuffer(p);
  return { base64: r.buf.toString('base64'), size: r.size, mtime: r.mtime, readonly: r.readonly };
}

// Writes atomically (temp file + rename) so a crash never leaves half a map.
// Returns the new stat so the caller can track external modifications.
async function writeBuffer(p, buf) {
  const dir = path.dirname(path.resolve(p));
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
  return { path: path.resolve(p), name: path.basename(p), size: st.size, mtime: st.mtimeMs };
}

const writeText = (p, text, { bom = false } = {}) => writeBuffer(p, Buffer.concat([bom ? Buffer.from([0xef, 0xbb, 0xbf]) : Buffer.alloc(0), Buffer.from(String(text ?? ''), 'utf8')]));
const writeBase64 = (p, base64) => writeBuffer(p, Buffer.from(String(base64 || ''), 'base64'));

// Writes the bytes of a data URL (an exported picture).
async function writeDataUrl(p, url) {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(String(url || ''));
  if (!m) throw new Error('not a data URL');
  const buf = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]), 'utf8');
  return writeBuffer(p, buf);
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
  const home = os.homedir();
  if (process.platform !== 'win32') {
    const roots = [{ name: '/', path: '/' }, { name: '~', path: home }];
    for (const base of ['/mnt', '/media', '/Volumes']) {
      try { for (const n of fs.readdirSync(base)) roots.push({ name: n, path: path.join(base, n) }); } catch { /* none */ }
    }
    return roots;
  }
  // `wmic` is gone on recent Windows; probe the letters instead (fast: stat only).
  const out = [];
  for (let c = 65; c <= 90; c++) {
    const root = `${String.fromCharCode(c)}:\\`;
    try { fs.statSync(root); out.push({ name: root.slice(0, 2), path: root }); } catch { /* absent */ }
  }
  out.push({ name: '~', path: home });
  return out;
}

async function mkdir(p) {
  await fsp.mkdir(p, { recursive: true });
  return stat(p);
}

async function exists(p) {
  try { await fsp.access(p); return true; } catch { return false; }
}

// Opens `p` (a file or a URL) with the OS default application.
function openExternal(p) {
  return new Promise((resolve) => {
    const done = () => resolve(true);
    if (process.platform === 'win32') execFile('cmd', ['/c', 'start', '', String(p).replace(/&/g, '^&')], { windowsHide: true }, done);
    else if (process.platform === 'darwin') execFile('open', [p], done);
    else execFile('xdg-open', [p], done);
  });
}

// A picture file as a data URL, for a topic image (the renderer cannot load
// local files itself). A Windows .ico often stores PNG frames that <img>
// cannot draw from image/x-icon, so those are unwrapped.
const IMAGE_MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.bmp': 'image/bmp', '.ico': 'image/x-icon', '.avif': 'image/avif',
};
const MAX_IMAGE = 32 * 1024 * 1024;

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
  if (!mime) throw err('ENOTIMAGE', `Not an image: ${p}`, { path: p });
  const st = await fsp.stat(p);
  if (st.size > MAX_IMAGE) throw err('ETOOBIG', `Image too large: ${p}`, { path: p, size: st.size });
  let buf = await fsp.readFile(p);
  if (ext === '.ico') {
    const png = icoLargestPng(buf);
    if (png) { mime = 'image/png'; buf = png; }
    else mime = 'image/vnd.microsoft.icon';
  }
  return { dataUrl: `data:${mime};base64,${buf.toString('base64')}`, name: path.basename(p), size: st.size, mtime: st.mtimeMs };
}

module.exports = {
  stat, readText, readBase64, readBuffer, decodeText, writeBuffer, writeText, writeBase64, writeDataUrl,
  list, drives, mkdir, exists, openExternal, dataUrl, MAX_FILE, homedir: () => os.homedir(),
};

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
// renderer cannot load local files itself).
const IMAGE_MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.bmp': 'image/bmp', '.ico': 'image/x-icon', '.avif': 'image/avif' };
const MAX_IMAGE = 32 * 1024 * 1024;
async function dataUrl(p) {
  const mime = IMAGE_MIME[path.extname(p).toLowerCase()];
  if (!mime) throw Object.assign(new Error('Not an image: ' + p), { code: 'ENOTIMAGE' });
  const st = await fsp.stat(p);
  if (st.size > MAX_IMAGE) throw Object.assign(new Error('Image too large: ' + p), { code: 'ETOOLARGE' });
  const buf = await fsp.readFile(p);
  return { dataUrl: `data:${mime};base64,${buf.toString('base64')}`, size: st.size, mtime: st.mtimeMs };
}

module.exports = { stat, read, write, list, drives, mkdir, rename, remove, exists, openExternal, dataUrl, MAX_FILE, homedir: () => os.homedir() };

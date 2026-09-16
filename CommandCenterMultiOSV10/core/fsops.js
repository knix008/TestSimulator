// File-system operations — the platform-neutral heart of Command Center.
//
// Everything here is plain Node (no Electron), so the same code serves the
// desktop app (via electron/ipc.js) and the web version (via server/server.js).
// Long operations take a Job (core/jobs.js) for progress, cancellation and
// conflict questions.
'use strict';

const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const { cancelledError } = require('./tar');

const isWin = process.platform === 'win32';

// ── Helpers ───────────────────────────────────────────────

// rwxr-xr-x as in `ls -l`. Windows has no mode bits, but Node derives 0o666 /
// 0o444 (read-only attribute) / 0o777 (folders, .exe) so the column still
// carries information there.
function permString(mode, isDir) {
  void isDir;
  const bits = ['r', 'w', 'x'];
  let s = '';
  for (let i = 8; i >= 0; i--) s += (mode >> i) & 1 ? bits[(8 - i) % 3] : '-';
  return s;
}

function formatDate(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function parentOf(p) {
  const parent = path.dirname(p);
  return parent === p ? null : parent;
}

function normalizePath(p) {
  if (!p) return p;
  let n = path.resolve(p);
  // Keep a trailing separator only for drive roots ("C:\").
  if (isWin && /^[a-zA-Z]:$/.test(n)) n += path.sep;
  return n;
}

async function isDirectory(p) {
  try { return (await fsp.stat(p)).isDirectory(); } catch { return false; }
}

async function exists(p) {
  try { await fsp.lstat(p); return true; } catch { return false; }
}

function homeDir() { return os.homedir(); }

function samePath(a, b) {
  const na = path.resolve(a), nb = path.resolve(b);
  return isWin ? na.toLowerCase() === nb.toLowerCase() : na === nb;
}

function isAncestorOf(ancestor, p) {
  const rel = path.relative(path.resolve(ancestor), path.resolve(p));
  if (rel === '') return true;
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

async function realOrSelf(p) {
  try { return await fsp.realpath(p); } catch { return path.resolve(p); }
}

// ── Listing ───────────────────────────────────────────────

async function listDirectory(dir, { showHidden = false } = {}) {
  dir = normalizePath(dir);
  const names = await fsp.readdir(dir);
  const entries = [];
  for (const name of names) {
    if (!showHidden && name.startsWith('.')) continue;
    const full = path.join(dir, name);
    let st;
    let isSymlink = false;
    try {
      const lst = await fsp.lstat(full);
      isSymlink = lst.isSymbolicLink();
      st = isSymlink ? await fsp.stat(full).catch(() => lst) : lst;
    } catch {
      continue;
    }
    const isDir = st.isDirectory();
    const ext = isDir ? '' : path.extname(name);
    entries.push({
      name,
      path: full,
      isDir,
      isSymlink,
      size: isDir ? 0 : st.size,
      mtime: st.mtimeMs,
      date: formatDate(st.mtimeMs),
      perm: permString(st.mode, isDir),
      ext,
      hidden: name.startsWith('.'),
    });
  }
  return { path: dir, parent: parentOf(dir), entries };
}

async function listSubdirectories(dir) {
  dir = normalizePath(dir);
  const names = await fsp.readdir(dir);
  const out = [];
  for (const name of names) {
    if (name.startsWith('.')) continue;
    const full = path.join(dir, name);
    if (await isDirectory(full)) out.push({ name, path: full });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return out;
}

// Every drive / volume of the system, for the drive menu in the path bar.
// Windows: A:–Z: that respond, with label / type / free space from
// Win32_LogicalDisk (PowerShell, cached a minute — it takes ~0.5 s).
// Elsewhere: "/", the mount folders' children and macOS /Volumes.
let driveCache = { at: 0, list: null };

function windowsDiskInfo() {
  return new Promise((resolve) => {
    const { execFile } = require('child_process');
    const cmd = 'Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID,VolumeName,DriveType,Size,FreeSpace | ConvertTo-Json -Compress';
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], { timeout: 8000, windowsHide: true }, (err, stdout) => {
      if (err || !stdout) return resolve([]);
      try {
        const parsed = JSON.parse(stdout);
        resolve(Array.isArray(parsed) ? parsed : [parsed]);
      } catch { resolve([]); }
    });
  });
}

const WIN_DRIVE_TYPES = { 2: 'removable', 3: 'fixed', 4: 'network', 5: 'cdrom', 6: 'ramdisk' };

async function listDrives() {
  if (driveCache.list && Date.now() - driveCache.at < 60_000) return driveCache.list;
  const drives = [];
  if (isWin) {
    const info = await windowsDiskInfo();
    const byId = new Map(info.map((d) => [String(d.DeviceID || '').toUpperCase(), d]));
    for (let c = 65; c <= 90; c++) {
      const letter = String.fromCharCode(c);
      const p = `${letter}:\\`;
      const meta = byId.get(`${letter}:`);
      let ok = !!meta;
      if (!ok) { try { await fsp.readdir(p); ok = true; } catch { ok = false; } }
      if (!ok) continue;
      drives.push({
        path: p,
        label: meta && meta.VolumeName ? meta.VolumeName : '',
        type: meta ? (WIN_DRIVE_TYPES[meta.DriveType] || 'fixed') : 'fixed',
        size: meta && meta.Size ? Number(meta.Size) : 0,
        free: meta && meta.FreeSpace ? Number(meta.FreeSpace) : 0,
        ready: !meta || meta.Size != null,
      });
    }
  } else {
    drives.push({ path: '/', label: '/', type: 'fixed', size: 0, free: 0, ready: true });
    const mountDirs = process.platform === 'darwin' ? ['/Volumes'] : ['/media', `/media/${os.userInfo().username}`, '/mnt', `/run/media/${os.userInfo().username}`];
    for (const md of mountDirs) {
      if (!(await isDirectory(md))) continue;
      let names = [];
      try { names = await fsp.readdir(md); } catch { continue; }
      for (const n of names) {
        const p = path.join(md, n);
        if (await isDirectory(p) && !drives.some((d) => samePath(d.path, p))) drives.push({ path: p, label: n, type: 'mount', size: 0, free: 0, ready: true });
      }
    }
    try {
      const st = await fsp.statfs('/');
      drives[0].size = st.blocks * st.bsize; drives[0].free = st.bavail * st.bsize;
    } catch { /* statfs unavailable */ }
  }
  driveCache = { at: Date.now(), list: drives };
  return drives;
}

// Quick locations for the folder tree: home, root(s), tmp, mounted volumes.
async function listRoots() {
  const roots = [];
  const push = async (label, p, kind) => {
    if (await isDirectory(p) && !roots.some((r) => samePath(r.path, p))) roots.push({ label, path: normalizePath(p), kind });
  };
  await push('home', homeDir(), 'home');
  if (isWin) {
    for (let c = 65; c <= 90; c++) {
      const drive = `${String.fromCharCode(c)}:\\`;
      try { await fsp.readdir(drive); await push(drive, drive, 'drive'); } catch { /* not present */ }
    }
    await push('tmp', os.tmpdir(), 'tmp');
  } else {
    await push('/', '/', 'root');
    await push('/tmp', '/tmp', 'tmp');
    const mountDirs = process.platform === 'darwin' ? ['/Volumes'] : ['/media', `/media/${os.userInfo().username}`, '/mnt', `/run/media/${os.userInfo().username}`];
    for (const md of mountDirs) {
      if (!(await isDirectory(md))) continue;
      let names = [];
      try { names = await fsp.readdir(md); } catch { continue; }
      for (const n of names) {
        const p = path.join(md, n);
        if (await isDirectory(p)) await push(p, p, 'mount');
      }
    }
  }
  return roots;
}

async function statPath(p) {
  const st = await fsp.lstat(p);
  const isSymlink = st.isSymbolicLink();
  const real = isSymlink ? await fsp.stat(p).catch(() => st) : st;
  const isDir = real.isDirectory();
  let size = real.size;
  let files = 0, dirs = 0;
  if (isDir) {
    // Directory size = sum of its files (bounded so a huge tree stays snappy).
    const acc = await sumTree(p, 20000);
    size = acc.size; files = acc.files; dirs = acc.dirs;
  }
  return {
    name: path.basename(p) || p,
    path: p,
    isDir,
    isSymlink,
    target: isSymlink ? await fsp.readlink(p).catch(() => '') : '',
    size,
    files,
    dirs,
    mtime: real.mtimeMs,
    date: formatDate(real.mtimeMs),
    ctime: real.birthtimeMs || real.ctimeMs,
    perm: permString(real.mode, isDir),
    mode: real.mode & 0o777,
  };
}

async function sumTree(root, limit) {
  const acc = { size: 0, files: 0, dirs: 0, visited: 0 };
  const stack = [root];
  while (stack.length && acc.visited < limit) {
    const dir = stack.pop();
    let names = [];
    try { names = await fsp.readdir(dir, { withFileTypes: true }); } catch { continue; }
    for (const d of names) {
      acc.visited++;
      const full = path.join(dir, d.name);
      if (d.isDirectory()) { acc.dirs++; stack.push(full); }
      else if (d.isFile()) { acc.files++; try { acc.size += (await fsp.stat(full)).size; } catch { /* vanished */ } }
    }
  }
  return acc;
}

async function directoryMtime(p) {
  try { return (await fsp.stat(p)).mtimeMs; } catch { return 0; }
}

// ── Simple mutations ──────────────────────────────────────

function validName(name) {
  if (!name || name === '.' || name === '..') return false;
  if (/[/\\]/.test(name)) return false;
  if (isWin && /[<>:"|?*\x00-\x1f]/.test(name)) return false;
  return true;
}

async function makeDirectory(dir, name) {
  if (!validName(name)) throw new Error(`Invalid name: ${name}`);
  const full = path.join(dir, name);
  if (await exists(full)) throw Object.assign(new Error('EXISTS'), { code: 'EEXIST', path: full });
  // Not recursive: the parent is the panel's folder and must already exist.
  await fsp.mkdir(full);
  return full;
}

async function createFile(dir, name) {
  if (!validName(name)) throw new Error(`Invalid name: ${name}`);
  const full = path.join(dir, name);
  if (await exists(full)) throw Object.assign(new Error('EXISTS'), { code: 'EEXIST', path: full });
  await fsp.writeFile(full, '', { flag: 'wx' });
  return full;
}

async function renamePath(oldPath, newName) {
  if (!validName(newName)) throw new Error(`Invalid name: ${newName}`);
  const newPath = path.join(path.dirname(oldPath), newName);
  if (samePath(oldPath, newPath)) return newPath;
  if (await exists(newPath) && !(isWin && oldPath.toLowerCase() === newPath.toLowerCase())) {
    throw Object.assign(new Error('EXISTS'), { code: 'EEXIST', path: newPath });
  }
  await fsp.rename(oldPath, newPath);
  return newPath;
}

// Renames several entries at once (the multi-rename tool). Two phases —
// everything to a temporary name first, then to its final name — so a set
// that swaps or shifts names (a→b, b→a; 1→2, 2→3) works. Returns the
// [{ from, to }] pairs actually applied (the undo of the tool).
async function renameMany(items) {
  for (const it of items) if (!validName(it.newName)) throw new Error(`Invalid name: ${it.newName}`);
  const finals = items.map((it) => path.join(path.dirname(it.path), it.newName));
  const seen = new Set();
  for (const f of finals) {
    const key = isWin ? f.toLowerCase() : f;
    if (seen.has(key)) throw Object.assign(new Error(`Duplicate target: ${path.basename(f)}`), { code: 'EDUP', path: f });
    seen.add(key);
  }
  const sources = new Set(items.map((it) => (isWin ? it.path.toLowerCase() : it.path)));
  for (const f of finals) {
    if (!sources.has(isWin ? f.toLowerCase() : f) && await exists(f)) throw Object.assign(new Error('EXISTS'), { code: 'EEXIST', path: f });
  }
  const stamp = `${process.pid.toString(36)}${Date.now().toString(36)}`;
  const temps = items.map((it, i) => path.join(path.dirname(it.path), `.mrn-${stamp}-${i}`));
  const done = [];
  try {
    for (let i = 0; i < items.length; i++) {
      if (samePath(items[i].path, finals[i])) continue;
      await fsp.rename(items[i].path, temps[i]);
      done.push(i);
    }
    for (const i of done) await fsp.rename(temps[i], finals[i]);
  } catch (err) {
    // Put back whatever already moved so nothing is left under a temp name.
    for (const i of done) {
      if (await exists(temps[i])) await fsp.rename(temps[i], items[i].path).catch(() => {});
      else if (await exists(finals[i]) && !samePath(finals[i], items[i].path)) await fsp.rename(finals[i], items[i].path).catch(() => {});
    }
    throw err;
  }
  return done.map((i) => ({ from: items[i].path, to: finals[i] }));
}

// ── Reading / writing files (the built-in viewer and editor) ──

const IMAGE_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.avif': 'image/avif' };
const TEXT_LIMIT = 8 * 1024 * 1024;
const IMAGE_LIMIT = 24 * 1024 * 1024;
const HEX_LIMIT = 256 * 1024;

function looksBinary(buf) {
  const n = Math.min(buf.length, 8192);
  let odd = 0;
  for (let i = 0; i < n; i++) {
    const c = buf[i];
    if (c === 0) return true;
    if (c < 7 || (c > 13 && c < 32 && c !== 27)) odd++;
  }
  return n > 0 && odd / n > 0.1;
}

function decodeText(buf) {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return { text: buf.slice(2).toString('utf16le'), encoding: 'UTF-16 LE' };
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.from(buf.slice(2));
    for (let i = 0; i + 1 < swapped.length; i += 2) { const t = swapped[i]; swapped[i] = swapped[i + 1]; swapped[i + 1] = t; }
    return { text: swapped.toString('utf16le'), encoding: 'UTF-16 BE' };
  }
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return { text: buf.slice(3).toString('utf8'), encoding: 'UTF-8 BOM' };
  const text = buf.toString('utf8');
  // Invalid UTF-8 shows up as U+FFFD; fall back to latin1 so nothing is lost.
  if (text.includes('\ufffd') && !buf.includes(Buffer.from('\ufffd'))) return { text: buf.toString('latin1'), encoding: 'Latin-1' };
  return { text, encoding: 'UTF-8' };
}

// { kind: 'text' | 'image' | 'binary', size, truncated, text?, encoding?, mime?, base64? }
async function readFile(p) {
  const st = await fsp.stat(p);
  if (st.isDirectory()) throw Object.assign(new Error('EISDIR'), { code: 'EISDIR', path: p });
  const ext = path.extname(p).toLowerCase();
  if (IMAGE_TYPES[ext]) {
    if (st.size > IMAGE_LIMIT) return { kind: 'image', size: st.size, truncated: true, mime: IMAGE_TYPES[ext] };
    const buf = await fsp.readFile(p);
    return { kind: 'image', size: st.size, truncated: false, mime: IMAGE_TYPES[ext], base64: buf.toString('base64') };
  }
  const limit = Math.min(st.size, TEXT_LIMIT);
  const fh = await fsp.open(p, 'r');
  let buf;
  try {
    buf = Buffer.alloc(limit);
    const { bytesRead } = await fh.read(buf, 0, limit, 0);
    buf = buf.slice(0, bytesRead);
  } finally { await fh.close(); }
  const utf16 = buf.length >= 2 && ((buf[0] === 0xff && buf[1] === 0xfe) || (buf[0] === 0xfe && buf[1] === 0xff));
  if (!utf16 && looksBinary(buf)) {
    return { kind: 'binary', size: st.size, truncated: st.size > HEX_LIMIT, base64: buf.slice(0, HEX_LIMIT).toString('base64') };
  }
  const { text, encoding } = decodeText(buf);
  return { kind: 'text', size: st.size, truncated: st.size > TEXT_LIMIT, text, encoding };
}

async function writeText(p, text) {
  await fsp.writeFile(p, text, 'utf8');
  const st = await fsp.stat(p);
  return { size: st.size, mtime: st.mtimeMs };
}

// ── Counting (for progress totals) ────────────────────────

async function countItems(paths, job) {
  let total = 0;
  async function count(p) {
    if (job && job.isCancelled()) return;
    let st;
    try { st = await fsp.lstat(p); } catch { return; }
    total++;
    if (st.isDirectory()) {
      let names = [];
      try { names = await fsp.readdir(p); } catch { return; }
      for (const n of names) await count(path.join(p, n));
    }
  }
  for (const p of paths) await count(p);
  return Math.max(total, 1);
}

// ── Copy / move ───────────────────────────────────────────

async function removeRecursive(p, job) {
  if (job && job.isCancelled()) throw cancelledError();
  const st = await fsp.lstat(p);
  if (st.isDirectory()) {
    const names = await fsp.readdir(p);
    for (const n of names) await removeRecursive(path.join(p, n), job);
    await fsp.rmdir(p);
  } else {
    await fsp.unlink(p);
  }
}

async function copyFileWithProgress(src, dest, job) {
  // fs.promises.copyFile is fast (copy_file_range / CopyFileEx) and the job
  // granularity is one entry, so no per-byte progress is needed here.
  if (job && job.isCancelled()) throw cancelledError();
  await fsp.copyFile(src, dest);
  try {
    const st = await fsp.stat(src);
    await fsp.utimes(dest, st.atime, st.mtime);
    if (!isWin) await fsp.chmod(dest, st.mode & 0o7777);
  } catch { /* best effort */ }
}

// Copies (or moves) one entry into destDir, asking the job about conflicts.
// Returns 'copied' | 'skipped'.
async function transferEntry(src, destDir, { move, job, stats }) {
  if (job.isCancelled()) throw cancelledError();
  const name = path.basename(src);
  const dest = path.join(destDir, name);
  const srcSt = await fsp.lstat(src);
  const srcIsDir = srcSt.isDirectory();

  if (samePath(src, dest)) {
    // Same folder: nothing to do (GTK: silently skipped).
    stats.skipped++;
    job.progress(src);
    return 'skipped';
  }
  if (srcIsDir && isAncestorOf(await realOrSelf(src), await realOrSelf(destDir))) {
    throw new Error(`Cannot ${move ? 'move' : 'copy'} a folder into itself: ${name}`);
  }

  const existed = await exists(dest);
  if (existed) {
    const destIsDir = await isDirectory(dest);
    const answer = await job.askConflict({ name, destPath: dest, destIsDir, isMove: !!move });
    if (answer === 'cancel') throw cancelledError();
    if (answer === 'skip') {
      stats.skipped++;
      job.progress(src);
      return 'skipped';
    }
    // overwrite: a directory over a directory merges; anything else replaces.
    if (!(srcIsDir && destIsDir)) await removeRecursive(dest, job);
  }

  // Every entry that ends up at `dest` is listed so the UI can undo the
  // transfer; `existed` marks a merge / overwrite, which cannot be undone.
  stats.items.push({ src, dest, existed });
  if (move) {
    try {
      await fsp.rename(src, dest);
      stats.copied++;
      job.progress(src);
      return 'copied';
    } catch (err) {
      if (err.code !== 'EXDEV' && err.code !== 'EPERM' && err.code !== 'EEXIST' && err.code !== 'ENOTEMPTY') throw err;
      // Different device (or a merge): copy then delete.
    }
  }

  await copyTree(src, dest, job, srcSt);
  if (move) await removeRecursive(src, job);
  stats.copied++;
  return 'copied';
}

async function copyTree(src, dest, job, st) {
  if (job.isCancelled()) throw cancelledError();
  st = st || await fsp.lstat(src);
  if (st.isSymbolicLink()) {
    const target = await fsp.readlink(src);
    try { await fsp.unlink(dest); } catch { /* absent */ }
    await fsp.symlink(target, dest);
    job.progress(src);
    return;
  }
  if (st.isDirectory()) {
    await fsp.mkdir(dest, { recursive: true });
    job.progress(src);
    const names = await fsp.readdir(src);
    for (const n of names) {
      const childSrc = path.join(src, n);
      const childDest = path.join(dest, n);
      const childSt = await fsp.lstat(childSrc);
      if (!childSt.isDirectory() && await exists(childDest)) {
        // Inside a merged directory every clash is still the user's call.
        const answer = await job.askConflict({ name: path.relative(path.dirname(src), childSrc), destPath: childDest, destIsDir: false, isMove: false });
        if (answer === 'cancel') throw cancelledError();
        if (answer === 'skip') { job.progress(childSrc); continue; }
      }
      await copyTree(childSrc, childDest, job, childSt);
    }
    return;
  }
  await copyFileWithProgress(src, dest, job);
  job.progress(src);
}

async function transfer(sources, destDir, { move = false, job }) {
  const stats = { copied: 0, skipped: 0, failed: 0, items: [] };
  if (!(await isDirectory(destDir))) throw new Error(`Destination is not a folder: ${destDir}`);
  job.setTotal(await countItems(sources, job));
  for (const src of sources) {
    if (job.isCancelled()) throw cancelledError();
    if (!(await exists(src))) { stats.failed++; continue; }
    await transferEntry(src, destDir, { move, job, stats });
  }
  return stats;
}

// ── Delete / trash ────────────────────────────────────────

async function deletePaths(paths, job) {
  job.setTotal(await countItems(paths, job));
  let removed = 0;
  async function rm(p) {
    if (job.isCancelled()) throw cancelledError();
    const st = await fsp.lstat(p);
    if (st.isDirectory()) {
      const names = await fsp.readdir(p);
      for (const n of names) await rm(path.join(p, n));
      await fsp.rmdir(p);
    } else {
      await fsp.unlink(p);
    }
    job.progress(p);
  }
  for (const p of paths) {
    if (!(await exists(p))) continue;
    await rm(p);
    removed++;
  }
  return { removed };
}

// Opens a file (or folder) with the application the OS has registered for
// it — the double-click / Enter action of the file list. The Electron host
// uses shell.openPath instead; this is the plain-Node fallback for the web
// version. Resolves to '' on success or an error message (same contract as
// shell.openPath) so core/api.js can treat both hosts alike.
function openWithDefaultApp(p) {
  const { execFile } = require('child_process');
  let cmd, args;
  if (isWin) {
    // Invoke-Item is PowerShell's double-click: it resolves the association
    // through the shell and fails loudly when there is none. (-LiteralPath so
    // [ ] and other glob characters in names are taken literally.)
    const q = String(p).replace(/'/g, "''");
    cmd = 'powershell.exe';
    args = ['-NoProfile', '-NonInteractive', '-Command',
      '[Console]::OutputEncoding = [Text.Encoding]::UTF8; '
      + `try { Invoke-Item -LiteralPath '${q}' -ErrorAction Stop } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }`];
  } else if (process.platform === 'darwin') {
    cmd = 'open'; args = [p];
  } else {
    cmd = 'xdg-open'; args = [p];
  }
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 15000, windowsHide: true }, (err, _stdout, stderr) => {
      if (!err) return resolve('');
      const msg = String(stderr || '').trim() || err.message || 'open failed';
      resolve(err.code === 'ENOENT' && !isWin ? `${cmd} not found (${msg})` : msg);
    });
  });
}

// Opens a file with a specific program (settings › text files › application).
// The program is started detached, so the app never waits for it.
function openWithApp(appPath, file) {
  const { spawn } = require('child_process');
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(appPath, [file], { detached: true, stdio: 'ignore', windowsHide: false });
    } catch (err) { reject(err); return; }
    child.once('error', (err) => reject(Object.assign(new Error(`Cannot start ${appPath}: ${err.message}`), { code: err.code, path: appPath })));
    child.once('spawn', () => { child.unref(); resolve(''); });
  });
}

// Moves paths to the OS trash. `trashFn(path)` is supplied by the host
// (Electron's shell.trashItem); without one the freedesktop / macOS trash
// folders are used directly, and Windows reports "unsupported".
async function trashPaths(paths, job, trashFn) {
  job.setTotal(paths.length);
  let trashed = 0;
  for (const p of paths) {
    if (job.isCancelled()) throw cancelledError();
    if (!(await exists(p))) continue;
    if (trashFn) await trashFn(p);
    else await fallbackTrash(p);
    trashed++;
    job.progress(p);
  }
  return { trashed };
}

async function fallbackTrash(p) {
  if (process.platform === 'darwin') {
    const dir = path.join(homeDir(), '.Trash');
    await fsp.mkdir(dir, { recursive: true });
    await fsp.rename(p, await uniqueName(path.join(dir, path.basename(p))));
    return;
  }
  if (process.platform === 'linux') {
    const base = process.env.XDG_DATA_HOME || path.join(homeDir(), '.local', 'share');
    const files = path.join(base, 'Trash', 'files');
    const info = path.join(base, 'Trash', 'info');
    await fsp.mkdir(files, { recursive: true });
    await fsp.mkdir(info, { recursive: true });
    const dest = await uniqueName(path.join(files, path.basename(p)));
    const stamp = new Date().toISOString().replace(/\.\d+Z$/, '');
    await fsp.writeFile(`${path.join(info, path.basename(dest))}.trashinfo`,
      `[Trash Info]\nPath=${encodeURI(path.resolve(p))}\nDeletionDate=${stamp}\n`);
    try {
      await fsp.rename(p, dest);
    } catch (err) {
      if (err.code !== 'EXDEV') throw err;
      const job = { isCancelled: () => false, progress() {}, askConflict: async () => 'overwrite' };
      await copyTree(p, dest, job);
      await removeRecursive(p, job);
    }
    return;
  }
  throw new Error('TRASH_UNSUPPORTED');
}

async function uniqueName(p) {
  if (!(await exists(p))) return p;
  const ext = path.extname(p);
  const stem = p.slice(0, p.length - ext.length);
  for (let i = 2; ; i++) {
    const cand = `${stem} (${i})${ext}`;
    if (!(await exists(cand))) return cand;
  }
}

// ── Search ────────────────────────────────────────────────

function globToRegExp(pattern) {
  let re = '^';
  for (const ch of pattern) {
    if (ch === '*') re += '.*';
    else if (ch === '?') re += '.';
    else re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(re + '$', 'i');
}

const CONTENT_LIMIT = 64 * 1024 * 1024;

async function fileContains(p, needle) {
  let fh;
  try {
    const st = await fsp.stat(p);
    if (st.size > CONTENT_LIMIT) return false;
    fh = await fsp.open(p, 'r');
    const buf = Buffer.alloc(Math.min(st.size, 1 << 20));
    let tail = '';
    let pos = 0;
    const lower = needle.toLowerCase();
    while (pos < st.size) {
      const { bytesRead } = await fh.read(buf, 0, buf.length, pos);
      if (!bytesRead) break;
      pos += bytesRead;
      const text = tail + buf.subarray(0, bytesRead).toString('utf8').toLowerCase();
      if (text.includes(lower)) return true;
      tail = text.slice(-lower.length);
    }
    return false;
  } catch {
    return false;
  } finally {
    if (fh) await fh.close().catch(() => {});
  }
}

// Finds folders and files whose name matches the glob below `root`; with
// `matchContent` only files containing `content`. Hits: { path, isDir, size }.
async function search(root, { pattern = '*', content = '', matchContent = false }, job) {
  const re = globToRegExp(pattern && pattern.trim() ? pattern.trim() : '*');
  const found = [];
  job.partial = { count: 0 };
  const hit = (full, isDir, size) => { found.push({ path: full, isDir, size }); job.partial = { count: found.length }; job.progress(full); };
  async function walk(dir) {
    if (job.isCancelled()) throw cancelledError();
    let dirents = [];
    try { dirents = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
    dirents.sort((a, b) => a.name.localeCompare(b.name));
    for (const d of dirents) {
      if (job.isCancelled()) throw cancelledError();
      const full = path.join(dir, d.name);
      if (d.isDirectory()) {
        if (re.test(d.name) && !(matchContent && content)) hit(full, true, 0);
        await walk(full);
        continue;
      }
      if (!re.test(d.name)) continue;
      if (matchContent && content) {
        if (!(await fileContains(full, content))) continue;
      }
      let size = 0;
      try { size = (await fsp.stat(full)).size; } catch { /* unreadable: listed without a size */ }
      hit(full, false, size);
    }
  }
  await walk(root);
  return { found };
}

module.exports = {
  isWin,
  homeDir,
  normalizePath,
  parentOf,
  exists,
  isDirectory,
  listDirectory,
  listSubdirectories,
  listRoots,
  listDrives,
  statPath,
  directoryMtime,
  makeDirectory,
  createFile,
  renamePath,
  renameMany,
  readFile,
  writeText,
  countItems,
  transfer,
  deletePaths,
  trashPaths,
  openWithDefaultApp,
  openWithApp,
  search,
  formatDate,
  samePath,
};

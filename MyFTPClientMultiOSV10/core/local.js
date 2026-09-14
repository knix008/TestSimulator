// Local file system for the "로컬 (Local)" tree.
//
// Plain Node (no Electron), so the same code serves the desktop app and the
// web version — in the browser the "local" side is the machine the server
// runs on.
'use strict';

const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');

const isWin = process.platform === 'win32';

function homeDir() { return os.homedir(); }

async function isDirectory(p) {
  try { return (await fsp.stat(p)).isDirectory(); } catch { return false; }
}

function samePath(a, b) {
  const na = path.resolve(a).replace(/[\\/]+$/, '');
  const nb = path.resolve(b).replace(/[\\/]+$/, '');
  return isWin ? na.toLowerCase() === nb.toLowerCase() : na === nb;
}

// ── Roots (drives) ────────────────────────────────────────

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
let rootCache = { at: 0, list: null };

// The top level of the local tree: every ready drive on Windows (with its
// volume label, like the WinForms original), "/" plus the home folder and
// mounted volumes elsewhere.
async function listRoots() {
  // Cached briefly: the PowerShell query takes ~0.5 s and the tree asks often.
  if (rootCache.list && Date.now() - rootCache.at < 10_000) return rootCache.list;
  const roots = [];
  if (isWin) {
    const info = await windowsDiskInfo();
    const byId = new Map(info.map((d) => [String(d.DeviceID || '').toUpperCase(), d]));
    for (let c = 65; c <= 90; c++) {
      const letter = String.fromCharCode(c);
      const p = `${letter}:\\`;
      const meta = byId.get(`${letter}:`);
      let ok = !!meta && meta.Size != null;
      if (!ok) { try { await fsp.readdir(p); ok = true; } catch { ok = false; } }
      if (!ok) continue;
      const label = meta && meta.VolumeName ? meta.VolumeName : '';
      roots.push({
        path: p,
        name: label ? `${label} (${letter}:)` : `${letter}:`,
        kind: meta ? (WIN_DRIVE_TYPES[meta.DriveType] || 'fixed') : 'fixed',
        isDir: true,
      });
    }
  } else {
    roots.push({ path: '/', name: '/', kind: 'fixed', isDir: true });
    roots.push({ path: homeDir(), name: `~ (${homeDir()})`, kind: 'home', isDir: true });
    const mountDirs = process.platform === 'darwin' ? ['/Volumes'] : ['/media', `/media/${os.userInfo().username}`, '/mnt', `/run/media/${os.userInfo().username}`];
    for (const md of mountDirs) {
      if (!(await isDirectory(md))) continue;
      let names = [];
      try { names = await fsp.readdir(md); } catch { continue; }
      for (const n of names) {
        const p = path.join(md, n);
        if (await isDirectory(p) && !roots.some((r) => samePath(r.path, p))) roots.push({ path: p, name: n, kind: 'mount', isDir: true });
      }
    }
  }
  rootCache = { at: Date.now(), list: roots };
  return roots;
}

// ── Listing ───────────────────────────────────────────────

function byDirThenName(a, b) {
  if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
}

// One folder: folders first, then files, both alphabetical (case-insensitive).
async function listDirectory(dir) {
  let names;
  try {
    names = await fsp.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'EACCES' || err.code === 'EPERM') {
      const e = new Error('Access denied'); e.code = 'EACCES'; e.path = dir; throw e;
    }
    throw err;
  }
  const entries = [];
  for (const d of names) {
    const p = path.join(dir, d.name);
    let isDir = d.isDirectory();
    let size = 0, mtime = 0;
    try {
      const st = d.isSymbolicLink() ? await fsp.stat(p) : await fsp.lstat(p);
      isDir = st.isDirectory();
      size = st.size;
      mtime = st.mtimeMs;
    } catch { /* broken link / no access: keep what readdir told us */ }
    entries.push({ name: d.name, path: p, isDir, size: isDir ? 0 : size, mtime: Math.floor(mtime) });
  }
  entries.sort(byDirThenName);
  return { path: dir, entries };
}

async function statPath(p) {
  const st = await fsp.stat(p);
  return { path: p, name: path.basename(p), isDir: st.isDirectory(), size: st.size, mtime: Math.floor(st.mtimeMs) };
}

async function exists(p) {
  try {
    const st = await fsp.stat(p);
    return { exists: true, isDir: st.isDirectory(), size: st.size };
  } catch {
    return { exists: false, isDir: false, size: 0 };
  }
}

// ── Mutations ─────────────────────────────────────────────

function checkName(name) {
  if (!name || /[\\/]/.test(name) || name === '.' || name === '..' || (isWin && /[<>:"|?*]/.test(name))) {
    const e = new Error(`Invalid name: ${name}`); e.code = 'EINVAL'; throw e;
  }
}

async function makeDirectory(dir, name) {
  checkName(name);
  const p = path.join(dir, name);
  if ((await exists(p)).exists) { const e = new Error(`'${name}' already exists`); e.code = 'EEXIST'; e.path = p; throw e; }
  await fsp.mkdir(p);
  return p;
}

async function renamePath(p, newName) {
  checkName(newName);
  const dest = path.join(path.dirname(p), newName);
  if (!samePath(p, dest) && (await exists(dest)).exists) { const e = new Error(`'${newName}' already exists`); e.code = 'EEXIST'; e.path = dest; throw e; }
  await fsp.rename(p, dest);
  return dest;
}

async function deletePaths(paths) {
  let count = 0;
  for (const p of paths) {
    await fsp.rm(p, { recursive: true, force: false });
    count++;
  }
  return { count };
}

// Every file under `dir` (recursively) with its size — the upload plan.
async function walk(dir, relBase = '') {
  const files = [];
  const dirs = [];
  const { entries } = await listDirectory(dir);
  for (const e of entries) {
    const rel = relBase ? `${relBase}/${e.name}` : e.name;
    if (e.isDir) {
      dirs.push({ path: e.path, rel });
      const sub = await walk(e.path, rel);
      dirs.push(...sub.dirs);
      files.push(...sub.files);
    } else {
      files.push({ path: e.path, rel, size: e.size });
    }
  }
  return { files, dirs };
}

module.exports = {
  isWin,
  homeDir,
  isDirectory,
  samePath,
  listRoots,
  listDirectory,
  statPath,
  exists,
  makeDirectory,
  renamePath,
  deletePaths,
  walk,
};

// The file system of the machine the server runs on — for the folder /
// file picker of the web version (the desktop app uses the OS dialogs), and
// for the "실제 경로" checks. Plain Node, no Electron.
'use strict';

const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');

const isWin = process.platform === 'win32';

async function isDirectory(p) {
  try { return (await fsp.stat(p)).isDirectory(); } catch { return false; }
}

function windowsDiskInfo() {
  return new Promise((resolve) => {
    const { execFile } = require('child_process');
    const cmd = 'Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID,VolumeName,DriveType,Size | ConvertTo-Json -Compress';
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], { timeout: 8000, windowsHide: true }, (err, stdout) => {
      if (err || !stdout) return resolve([]);
      try { const parsed = JSON.parse(stdout); resolve(Array.isArray(parsed) ? parsed : [parsed]); } catch { resolve([]); }
    });
  });
}

const WIN_DRIVE_TYPES = { 2: 'removable', 3: 'fixed', 4: 'network', 5: 'cdrom', 6: 'ramdisk' };
let rootCache = { at: 0, list: null };

// Drives on Windows (with volume labels), "/" + home + mounted volumes elsewhere.
async function listRoots() {
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
      roots.push({ path: p, name: label ? `${label} (${letter}:)` : `${letter}:`, kind: meta ? (WIN_DRIVE_TYPES[meta.DriveType] || 'fixed') : 'fixed', isDir: true });
    }
  } else {
    roots.push({ path: '/', name: '/', kind: 'fixed', isDir: true });
    roots.push({ path: os.homedir(), name: `~ (${os.homedir()})`, kind: 'home', isDir: true });
    const user = os.userInfo().username;
    const mountDirs = process.platform === 'darwin' ? ['/Volumes'] : ['/media', `/media/${user}`, '/mnt', `/run/media/${user}`];
    for (const md of mountDirs) {
      if (!(await isDirectory(md))) continue;
      let names = [];
      try { names = await fsp.readdir(md); } catch { continue; }
      for (const n of names) {
        const p = path.join(md, n);
        if (await isDirectory(p) && !roots.some((r) => r.path === p)) roots.push({ path: p, name: n, kind: 'mount', isDir: true });
      }
    }
  }
  rootCache = { at: Date.now(), list: roots };
  return roots;
}

// One folder, folders first. `filesToo` adds files (for the certificate picker).
async function listDirectory(dir, { filesToo = false, extensions = null } = {}) {
  let names;
  try { names = await fsp.readdir(dir, { withFileTypes: true }); }
  catch (err) {
    if (err.code === 'EACCES' || err.code === 'EPERM') { const e = new Error('Access denied'); e.code = 'EACCES'; e.path = dir; throw e; }
    throw err;
  }
  const entries = [];
  for (const d of names) {
    const p = path.join(dir, d.name);
    let isDir = d.isDirectory();
    let size = 0;
    if (d.isSymbolicLink()) { try { const st = await fsp.stat(p); isDir = st.isDirectory(); size = st.size; } catch { continue; } }
    else if (!isDir) { try { size = (await fsp.stat(p)).size; } catch { /* keep 0 */ } }
    if (!isDir && !filesToo) continue;
    if (!isDir && extensions && !extensions.includes(path.extname(d.name).toLowerCase())) continue;
    if (isWin && /^\$|^System Volume Information$/i.test(d.name)) continue;
    entries.push({ name: d.name, path: p, isDir, size });
  }
  entries.sort((a, b) => (a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })));
  const parent = path.dirname(dir);
  return { path: dir, parent: parent === dir ? null : parent, entries };
}

async function makeDirectory(dir, name) {
  const p = path.join(dir, name);
  await fsp.mkdir(p);
  return p;
}

function statPath(p) {
  try { const st = fs.statSync(p); return { exists: true, isDir: st.isDirectory(), size: st.size }; }
  catch { return { exists: false, isDir: false, size: 0 }; }
}

module.exports = { listRoots, listDirectory, makeDirectory, statPath, isDirectory };

// Virtual file system: maps the paths clients see ("/name/sub/file") onto the
// shared folders on disk. FTP, FTPS and SFTP all go through the same object,
// so a client sees the same tree whichever protocol it uses.
//
//   /                → the list of virtual names (never a physical folder)
//   /name            → the physical root of the share "name"
//   /name/a/b        → <physical root>/a/b   (never outside the root)
//
// With a single share the bare form "/a/b" is accepted as well, so a client
// that skips the share name still works (the WinForms original did this).
'use strict';

const fs = require('fs');
const path = require('path');

// Collapses "." / ".." and duplicate slashes into an absolute POSIX path.
function normalizePath(p) {
  if (!p) return '/';
  const parts = String(p).replace(/\\/g, '/').split('/');
  const stack = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') { stack.pop(); continue; }
    stack.push(part);
  }
  return '/' + stack.join('/');
}

function posixJoin(dir, name) {
  if (!dir || dir === '/') return `/${name}`;
  return `${dir.replace(/\/+$/, '')}/${name}`;
}

function posixParent(p) {
  const n = normalizePath(p);
  if (n === '/') return '/';
  const i = n.lastIndexOf('/');
  return i <= 0 ? '/' : n.slice(0, i);
}

function posixBase(p) {
  const n = normalizePath(p);
  return n === '/' ? '' : n.slice(n.lastIndexOf('/') + 1);
}

class VirtualFileSystem {
  // shares: [{ virtualName, physicalPath }] — entries whose folder is missing are skipped.
  constructor(shares = []) {
    this.mounts = new Map();     // lower-cased virtual name → { name, root }
    this.skipped = [];
    for (const s of shares) {
      const name = String(s.virtualName || '').replace(/^[\/\s]+|[\/\s]+$/g, '');
      const root = String(s.physicalPath || '').trim();
      if (!name || name.includes('/')) { this.skipped.push({ ...s, reason: 'name' }); continue; }
      if (!isDir(root)) { this.skipped.push({ ...s, reason: 'missing' }); continue; }
      this.mounts.set(name.toLowerCase(), { name, root: normalizeRoot(root) });
    }
  }

  get virtualNames() { return Array.from(this.mounts.values()).map((m) => m.name); }
  get hasMounts() { return this.mounts.size > 0; }
  get isSingleMount() { return this.mounts.size === 1; }

  // The share a virtual path belongs to, or null for "/" and unknown names.
  mountOf(vpath) {
    const n = normalizePath(vpath);
    if (n === '/') return null;
    const first = n.slice(1).split('/')[0];
    const m = this.mounts.get(first.toLowerCase());
    if (m) return { mount: m, rest: n.slice(1 + first.length) };
    // Single share: "/a/b" means "/<share>/a/b".
    if (this.isSingleMount) return { mount: this.mounts.values().next().value, rest: n };
    return null;
  }

  // Physical path for a virtual path; null for "/" (multi-mount root) and for
  // paths that escape their share.
  resolve(vpath) {
    const hit = this.mountOf(vpath);
    if (!hit) return null;
    const { mount, rest } = hit;
    if (!rest || rest === '/') return mount.root;
    const sub = rest.replace(/^\/+/, '').split('/').join(path.sep);
    const full = path.resolve(mount.root, sub);
    return isUnderRoot(full, mount.root) ? full : null;
  }

  // True for "/", a share name, or an existing physical folder.
  directoryExists(vpath) {
    const n = normalizePath(vpath);
    if (n === '/') return true;
    const physical = this.resolve(n);
    return !!physical && isDir(physical);
  }

  // True when the path is the virtual root ("/") — the listing of share names.
  isRoot(vpath) { return normalizePath(vpath) === '/'; }

  // Entries of a virtual directory: the share names at "/", else the folder on disk.
  // Every entry: { name, isDir, size, mtime (ms), atime (ms), mode }.
  list(vpath) {
    const n = normalizePath(vpath);
    if (n === '/') {
      const now = Date.now();
      return this.virtualNames.map((name) => ({ name, isDir: true, size: 0, mtime: now, atime: now, mode: 0o40755 }));
    }
    const physical = this.resolve(n);
    if (!physical) { const e = new Error(`No such directory: ${n}`); e.code = 'ENOENT'; throw e; }
    const st = fs.statSync(physical);
    if (!st.isDirectory()) return [entryOf(path.basename(physical), st)];
    const out = [];
    for (const name of fs.readdirSync(physical)) {
      try { out.push(entryOf(name, fs.statSync(path.join(physical, name)))); } catch { /* unreadable → skip */ }
    }
    out.sort((a, b) => (a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })));
    return out;
  }

  // stat of a virtual path (root and share names are synthetic folders).
  stat(vpath) {
    const n = normalizePath(vpath);
    if (n === '/') { const now = Date.now(); return { name: '', isDir: true, size: 0, mtime: now, atime: now, mode: 0o40755 }; }
    const physical = this.resolve(n);
    if (!physical) return null;
    try { return entryOf(path.basename(physical), fs.statSync(physical)); } catch { return null; }
  }
}

function entryOf(name, st) {
  const isDir = st.isDirectory();
  return { name, isDir, size: isDir ? 0 : st.size, mtime: st.mtimeMs, atime: st.atimeMs, mode: isDir ? 0o40755 : 0o100644 };
}

function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

function normalizeRoot(p) {
  const full = path.resolve(p);
  // Keep the root of a drive ("C:\") intact; strip trailing separators elsewhere.
  return full.length > 3 ? full.replace(/[\\/]+$/, '') : full;
}

function isUnderRoot(full, root) {
  const a = process.platform === 'win32' ? full.toLowerCase() : full;
  const b = process.platform === 'win32' ? root.toLowerCase() : root;
  if (a === b) return true;
  const prefix = b.endsWith(path.sep) ? b : b + path.sep;
  return a.startsWith(prefix);
}

module.exports = { VirtualFileSystem, normalizePath, posixJoin, posixParent, posixBase };

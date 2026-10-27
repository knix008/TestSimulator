// Node implementation of the synchronous file system (core/CONTRACT.md §6),
// used by the terminal runner (scripts/msm.mjs) and by tests. Paths use "/"
// separators (Windows: C:/x/y); relative paths resolve against cwd().
//
//   import { createNodeFs } from './core/fs-node.js';
//   const fs = createNodeFs({ cwd: process.cwd(), allowSystem: true });
import nfs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const slash = (p) => String(p).replace(/\\/g, '/');

function fsErr(code, message) {
  return Object.assign(new Error(message), { code });
}

// Node's error text names the call ("ENOENT: no such file or directory, open 'x'");
// the engine shows a plain sentence with the path instead.
function wrap(fn, p) {
  try { return fn(); } catch (e) {
    const code = (e && e.code) || 'EIO';
    const what = code === 'ENOENT' ? 'No such file or folder' : code === 'EEXIST' ? 'Already exists'
      : code === 'ENOTEMPTY' ? 'Folder is not empty' : code === 'EACCES' || code === 'EPERM' ? 'Permission denied'
        : code === 'EISDIR' ? 'Is a folder' : code === 'ENOTDIR' ? 'Not a folder' : (e && e.message) || 'I/O error';
    throw fsErr(code, p ? `${what}: ${p}` : what);
  }
}

export function createNodeFs({ cwd = process.cwd(), allowSystem = true, systemTimeoutMs = 120000 } = {}) {
  let current = slash(path.resolve(cwd));
  const abs = (p) => {
    const s = String(p == null ? '' : p);
    if (!s) throw fsErr('EINVAL', 'Empty path.');
    return slash(path.resolve(current, s));
  };
  const statOf = (real) => {
    const st = nfs.statSync(real);
    return { isDir: st.isDirectory(), size: st.isDirectory() ? 0 : st.size, mtimeMs: Math.round(st.mtimeMs) };
  };
  const ensureParent = (a) => nfs.mkdirSync(path.dirname(a), { recursive: true });

  const fs = {
    kind: 'node',
    abs,
    readText: (p) => wrap(() => nfs.readFileSync(abs(p), 'utf8'), p),
    writeText: (p, text) => wrap(() => { const a = abs(p); ensureParent(a); nfs.writeFileSync(a, String(text == null ? '' : text), 'utf8'); }, p),
    appendText: (p, text) => wrap(() => { const a = abs(p); ensureParent(a); nfs.appendFileSync(a, String(text == null ? '' : text), 'utf8'); }, p),
    readBytes: (p) => wrap(() => new Uint8Array(nfs.readFileSync(abs(p))), p),
    writeBytes: (p, bytes) => wrap(() => { const a = abs(p); ensureParent(a); nfs.writeFileSync(a, Buffer.from(bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes || []))); }, p),
    exists: (p) => { try { return nfs.existsSync(abs(p)); } catch { return false; } },
    stat: (p) => wrap(() => statOf(abs(p)), p),
    list: (d) => wrap(() => {
      const dir = abs(d);
      const out = [];
      for (const ent of nfs.readdirSync(dir, { withFileTypes: true })) {
        try { out.push({ name: ent.name, ...statOf(path.join(dir, ent.name)) }); } catch { /* broken link: skipped */ }
      }
      return out.sort((a, b) => a.name.localeCompare(b.name));
    }, d),
    mkdir: (p) => wrap(() => { nfs.mkdirSync(abs(p), { recursive: true }); }, p),
    remove: (p, opts = {}) => wrap(() => {
      const a = abs(p);
      const st = nfs.statSync(a);
      if (st.isDirectory()) { if (opts && opts.recursive) nfs.rmSync(a, { recursive: true, force: false }); else nfs.rmdirSync(a); }
      else nfs.unlinkSync(a);
    }, p),
    rename: (from, to) => wrap(() => { const b = abs(to); ensureParent(b); nfs.renameSync(abs(from), b); }, from),
    copy: (from, to) => wrap(() => { const b = abs(to); ensureParent(b); nfs.cpSync(abs(from), b, { recursive: true }); }, from),
    cwd: () => current,
    chdir: (p) => {
      const a = abs(p);
      let st;
      try { st = nfs.statSync(a); } catch { throw fsErr('ENOENT', `Folder not found: ${p}`); }
      if (!st.isDirectory()) throw fsErr('ENOTDIR', `Not a folder: ${p}`);
      current = a;
    },
    tempDir: () => slash(os.tmpdir()),
    homeDir: () => slash(os.homedir()),
    system: (command) => {
      if (!allowSystem) throw fsErr('ENOSYS', 'system() is not available here.');
      const isWin = process.platform === 'win32';
      const r = spawnSync(isWin ? (process.env.ComSpec || 'cmd.exe') : '/bin/sh', isWin ? ['/d', '/s', '/c', String(command)] : ['-c', String(command)], {
        cwd: current, encoding: 'utf8', timeout: systemTimeoutMs, windowsHide: true, windowsVerbatimArguments: isWin, maxBuffer: 64 * 1024 * 1024,
      });
      return { status: r.status == null ? -1 : r.status, output: `${r.stdout || ''}${r.stderr || ''}` };
    },
  };
  return fs;
}

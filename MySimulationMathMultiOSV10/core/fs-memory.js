// In-memory synchronous file system (ctx.fs contract, core/CONTRACT.md §6).
// Used by tests and by the web build when no host API is available.

const norm = (p) => {
  const parts = [];
  for (const s of String(p).replace(/\\/g, '/').split('/')) {
    if (s === '' || s === '.') continue;
    if (s === '..') parts.pop(); else parts.push(s);
  }
  return '/' + parts.join('/');
};
const parent = (p) => { const i = p.lastIndexOf('/'); return i <= 0 ? '/' : p.slice(0, i); };
const fsErr = (code, msg) => Object.assign(new Error(msg), { code });

export function createMemoryFs(initial = {}) {
  const files = new Map(); // path -> { data: Uint8Array, mtimeMs }
  const dirs = new Set(['/', '/tmp', '/home']);
  let cwd = '/home';
  const enc = new TextEncoder(), dec = new TextDecoder();
  const abs = (p) => (String(p).replace(/\\/g, '/').startsWith('/') ? norm(p) : norm(cwd + '/' + p));
  const ensureDir = (d) => { if (!dirs.has(d)) { ensureDir(parent(d)); dirs.add(d); } };
  const put = (p, data) => { const a = abs(p); ensureDir(parent(a)); files.set(a, { data, mtimeMs: Date.now() }); };
  for (const [p, text] of Object.entries(initial)) put(p, typeof text === 'string' ? enc.encode(text) : text);

  const fs = {
    kind: 'memory',
    abs,
    readBytes(p) { const f = files.get(abs(p)); if (!f) throw fsErr('ENOENT', `File not found: ${p}`); return f.data.slice(); },
    readText(p) { return dec.decode(fs.readBytes(p)); },
    writeBytes(p, bytes) { put(p, Uint8Array.from(bytes)); },
    writeText(p, text) { put(p, enc.encode(text)); },
    appendText(p, text) { const a = abs(p); const old = files.get(a); const add = enc.encode(text); const d = new Uint8Array((old ? old.data.length : 0) + add.length); if (old) d.set(old.data); d.set(add, d.length - add.length); put(a, d); },
    exists(p) { const a = abs(p); return files.has(a) || dirs.has(a); },
    stat(p) {
      const a = abs(p);
      if (dirs.has(a)) return { isDir: true, size: 0, mtimeMs: 0 };
      const f = files.get(a); if (!f) throw fsErr('ENOENT', `Not found: ${p}`);
      return { isDir: false, size: f.data.length, mtimeMs: f.mtimeMs };
    },
    list(d) {
      const a = abs(d);
      if (!dirs.has(a)) throw fsErr('ENOENT', `Folder not found: ${d}`);
      const out = [];
      const pre = a === '/' ? '/' : a + '/';
      for (const x of dirs) if (x !== a && x.startsWith(pre) && !x.slice(pre.length).includes('/')) out.push({ name: x.slice(pre.length), isDir: true, size: 0, mtimeMs: 0 });
      for (const [x, f] of files) if (x.startsWith(pre) && !x.slice(pre.length).includes('/')) out.push({ name: x.slice(pre.length), isDir: false, size: f.data.length, mtimeMs: f.mtimeMs });
      return out.sort((p, q) => p.name.localeCompare(q.name));
    },
    mkdir(p) { ensureDir(abs(p)); },
    remove(p, opts = {}) {
      const a = abs(p);
      if (files.delete(a)) return;
      if (!dirs.has(a)) throw fsErr('ENOENT', `Not found: ${p}`);
      const pre = a + '/';
      const inside = [...files.keys(), ...dirs].some((x) => x.startsWith(pre));
      if (inside && !opts.recursive) throw fsErr('ENOTEMPTY', `Folder not empty: ${p}`);
      for (const x of [...files.keys()]) if (x.startsWith(pre)) files.delete(x);
      for (const x of [...dirs]) if (x.startsWith(pre)) dirs.delete(x);
      dirs.delete(a);
    },
    rename(from, to) { const a = abs(from), b = abs(to); const f = files.get(a); if (!f) throw fsErr('ENOENT', `Not found: ${from}`); files.delete(a); put(b, f.data); },
    copy(from, to) { put(to, fs.readBytes(from)); },
    cwd() { return cwd; },
    chdir(p) { const a = abs(p); if (!dirs.has(a)) throw fsErr('ENOENT', `Folder not found: ${p}`); cwd = a; },
    tempDir() { return '/tmp'; },
    homeDir() { return '/home'; },
    system() { throw fsErr('ENOSYS', 'system() is not available here.'); },
  };
  return fs;
}

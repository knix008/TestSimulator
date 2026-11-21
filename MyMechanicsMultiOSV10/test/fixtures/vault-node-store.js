// A vault store on a real folder for the unit tests — the same rules as the desktop backend
// (src-tauri/src/vault.rs): relative paths only, exclusive create for locks, only lock files removed,
// renames only inside files/, exports never overwrite. Tests point it at a folder under os.tmpdir().
import fs from 'node:fs';
import path from 'node:path';

export function nodeVaultStore(root) {
  const resolve = (rel) => {
    const parts = String(rel).split(/[\\/]/);
    if (!rel || parts.some((p) => !p || p === '.' || p === '..' || p.includes(':'))) throw new Error(`unsafe path: ${rel}`);
    return path.join(root, ...parts);
  };
  return {
    root,
    async read(rel) { const p = resolve(rel); return fs.existsSync(p) && fs.statSync(p).isFile() ? fs.readFileSync(p, 'utf8') : null; },
    async write(rel, text) {
      const p = resolve(rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      const tmp = `${p}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
      fs.writeFileSync(tmp, text);
      fs.renameSync(tmp, p);
    },
    async createExclusive(rel, text) {
      const p = resolve(rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      try { fs.writeFileSync(p, text, { flag: 'wx' }); return true; } catch (e) { if (e.code === 'EEXIST') return false; throw e; }
    },
    async removeLock(rel) {
      if (!/^\.locks\/[^/]+\.lock$/.test(String(rel).replace(/\\/g, '/'))) throw new Error(`not a lock: ${rel}`);
      const p = resolve(rel);
      if (!fs.existsSync(p)) return false;
      fs.unlinkSync(p);
      return true;
    },
    async rename(from, to) {
      const inside = (r) => /^files\/[^/]+$/.test(String(r).replace(/\\/g, '/'));
      if (!inside(from) || !inside(to)) throw new Error('rename outside files/');
      const a = resolve(from); const b = resolve(to);
      if (fs.existsSync(b) && from.toLowerCase() !== to.toLowerCase()) throw new Error('exists');
      fs.renameSync(a, b);
    },
    async list(rel) { const p = rel ? resolve(rel) : root; return fs.existsSync(p) ? fs.readdirSync(p, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name).sort() : []; },
    async exportFiles(dir, entries) {
      for (const e of entries) if (/[\\/:]/.test(e.name) || fs.existsSync(path.join(dir, e.name))) throw new Error(`refused: ${e.name}`);
      fs.mkdirSync(dir, { recursive: true });
      return entries.map((e) => { const p = path.join(dir, e.name); fs.writeFileSync(p, e.content, { flag: 'wx' }); return p; });
    },
  };
}

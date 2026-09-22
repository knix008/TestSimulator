'use strict';

// One-level directory listing for the sidebar folder tree. Uses stat() so
// Windows Dirent entries with unknown type still classify PDFs as files.

function isPdfName(name) {
  const n = String(name || '').trim();
  const i = n.lastIndexOf('.');
  if (i <= 0 || i === n.length - 1) return false;
  return n.slice(i + 1).toLowerCase() === 'pdf';
}

function sortEntries(entries) {
  return [...entries].sort((a, b) => (
    a.kind === b.kind
      ? String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' })
      : (a.kind === 'dir' ? -1 : 1)
  ));
}

function isDirStat(st) {
  return !!(st && (typeof st.isDirectory === 'function' ? st.isDirectory() : st.isDirectory));
}

function isFileStat(st) {
  return !!(st && (typeof st.isFile === 'function' ? st.isFile() : st.isFile));
}

function readLevel(fs, pathMod, dirPath) {
  try {
    if (!dirPath || typeof dirPath !== 'string') return [];
    const resolved = pathMod.resolve(dirPath);
    if (!fs.existsSync(resolved)) return [];
    let rootStat;
    try { rootStat = fs.statSync(resolved); } catch { return []; }
    if (!isDirStat(rootStat)) return [];

    const names = fs.readdirSync(resolved);
    const out = [];
    for (const raw of names) {
      const name = String(raw || '').trim();
      if (!name || name.startsWith('.')) continue;
      const full = pathMod.join(resolved, name);
      let st;
      try { st = fs.statSync(full); } catch { continue; }
      const dir = isDirStat(st);
      if (isPdfName(name) && !dir) {
        out.push({ path: full, name, kind: 'pdf', size: Number(st.size) || 0 });
      } else if (dir) {
        out.push({ path: full, name, kind: 'dir' });
      } else if (isFileStat(st) && isPdfName(name)) {
        out.push({ path: full, name, kind: 'pdf', size: Number(st.size) || 0 });
      }
    }
    return sortEntries(out);
  } catch {
    return [];
  }
}

module.exports = { isPdfName, readLevel, sortEntries };

'use strict';

// One-level directory listing for the library panel's folder tree, and the set
// of extensions the app will open when the shell hands it a file.
//
// stat() rather than Dirent.type: on Windows a Dirent can come back with an
// unknown type, which would hide perfectly good books.

const OPENABLE_EXTENSIONS = new Set([
  'epub', 'pdf', 'mobi', 'prc', 'azw', 'azw3', 'fb2', 'cbz', 'cbr',
  'md', 'markdown', 'mdown', 'html', 'htm', 'xhtml', 'txt', 'text', 'log',
  'ebkr',
  // Pictures, shown one per page: what the reader can also display.
  'jpg', 'jpeg', 'jpe', 'png', 'gif', 'webp', 'bmp', 'avif', 'svg',
  'tif', 'tiff', 'heic', 'heif', 'dcm', 'dicom', 'ico',
]);

function extensionOf(name) {
  const clean = String(name || '').trim();
  const at = clean.lastIndexOf('.');
  if (at <= 0 || at === clean.length - 1) return '';
  return clean.slice(at + 1).toLowerCase();
}

function isBookName(name) {
  const ext = extensionOf(name);
  return !!ext && OPENABLE_EXTENSIONS.has(ext);
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
      if (isDirStat(st)) {
        out.push({ path: full, name, kind: 'dir' });
      } else if (isFileStat(st) && isBookName(name)) {
        out.push({ path: full, name, kind: 'book', size: Number(st.size) || 0, format: extensionOf(name) });
      }
    }
    return sortEntries(out);
  } catch {
    return [];
  }
}

module.exports = { OPENABLE_EXTENSIONS, extensionOf, isBookName, readLevel, sortEntries };

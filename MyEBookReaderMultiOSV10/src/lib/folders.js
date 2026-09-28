// Library folder tree: keep only directories and files this reader can open,
// folders first, then a stable name sort. The classification is shared with the
// main process (electron/folder-list.js calls the same predicate shape) so the
// panel and the disk listing can never disagree about what is a book.
import { BOOK_EXTENSIONS, LIBRARY_EXT, extensionOf } from './book.js';

const OPENABLE = new Set([...BOOK_EXTENSIONS, LIBRARY_EXT]);

export function isBookFileName(name) {
  const ext = extensionOf(name);
  return !!ext && OPENABLE.has(ext);
}

export function isHiddenName(name) {
  return String(name || '').startsWith('.');
}

export function folderLabel(filePath) {
  const clean = String(filePath || '').replace(/[\\/]+$/, '');
  const parts = clean.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || clean;
}

export function sortFolderEntries(entries) {
  return [...(entries || [])].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
    return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
  });
}

export function classifyEntry(name, hints = {}) {
  const clean = String(name || '').trim();
  if (!clean || isHiddenName(clean)) return null;
  if (hints.kind === 'dir' || hints.isDirectory === true) return 'dir';
  if (isBookFileName(clean)) return 'book';
  return null;
}

export function toFolderEntries(raw) {
  const out = [];
  for (const entry of raw || []) {
    const name = String(entry?.name || '').trim();
    const kind = classifyEntry(name, entry);
    if (!kind) continue;
    const path = entry.path || name;
    if (kind === 'dir') out.push({ name, path, kind: 'dir' });
    else {
      out.push({
        name,
        path,
        kind: 'book',
        size: Number(entry.size) || 0,
        format: extensionOf(name),
      });
    }
  }
  return sortFolderEntries(out);
}

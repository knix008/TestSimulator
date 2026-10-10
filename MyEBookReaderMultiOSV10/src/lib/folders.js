// Library folder tree: keep only directories and files this reader can open,
// folders first, then a stable name sort. The classification is shared with the
// main process (electron/folder-list.js calls the same predicate shape) so the
// panel and the disk listing can never disagree about what is a book.
import { BOOK_EXTENSIONS, LIBRARY_EXT, extensionOf } from './book.js';

const OPENABLE = new Set([...BOOK_EXTENSIONS, LIBRARY_EXT]);

// Compressed files the library can open in place. Kept in step with
// electron/folder-list.js, which cannot import this module.
export const ARCHIVE_EXTENSIONS = ['zip', 'tar', 'gz', 'gzip', 'tgz'];

export function isBookFileName(name) {
  const ext = extensionOf(name);
  return !!ext && OPENABLE.has(ext);
}

/** A ZIP, tar or gzip the reader lists instead of opening as one book. */
export function isArchiveFileName(name) {
  const lower = String(name || '').trim().toLowerCase();
  if (lower.endsWith('.tar.gz')) return true;
  const ext = extensionOf(name);
  return !!ext && ARCHIVE_EXTENSIONS.includes(ext);
}

export function isHiddenName(name) {
  return String(name || '').startsWith('.');
}

export function folderLabel(filePath) {
  const clean = String(filePath || '').replace(/[\\/]+$/, '');
  const parts = clean.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || clean;
}

function groupedFirst(kind) {
  return kind === 'dir' || kind === 'archive';
}

export function sortFolderEntries(entries) {
  return [...(entries || [])].sort((a, b) => {
    if (groupedFirst(a.kind) !== groupedFirst(b.kind)) return groupedFirst(a.kind) ? -1 : 1;
    return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
  });
}

export function classifyEntry(name, hints = {}) {
  const clean = String(name || '').trim();
  if (!clean || isHiddenName(clean)) return null;
  if (hints.kind === 'dir' || hints.isDirectory === true) return 'dir';
  if (hints.kind === 'archive' || isArchiveFileName(clean)) return 'archive';
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
        kind,
        size: Number(entry.size) || 0,
        format: entry.format || extensionOf(name),
      });
    }
  }
  return sortFolderEntries(out);
}

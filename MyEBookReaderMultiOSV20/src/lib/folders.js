// Folder tree helpers: keep only directories and e-book files,
// folders first, then a stable name sort. The last extension must be
// exactly one of the book formats (any case). .ebkvw workspaces and names
// that merely contain "pdf" or "epub" stay out. A true book name still wins
// over a mistaken "directory" flag.
//
// Plain text, HTML and Markdown open too (dialog, drag and drop), but a
// folder of them is not a shelf of books, so the tree leaves them out.
// Pictures and ZIP archives are listed: a folder of page pictures, or an
// archive of them, is how comics and scanned books come — both open as one
// book. Keep in step with TREE_BOOK_EXTENSIONS in src-tauri/src/files.rs.
import { BOOK_EXTENSIONS } from './ebook/book.js';
import { isImageName } from './ebook/imagebook.js';

/** "comic.zip" — an archive the reader extracts and opens as a book. */
export function isZipName(name) {
  return /\.zip$/i.test(String(name || '').trim());
}

export const TREE_BOOK_EXTENSIONS = [
  'pdf', 'epub', 'mobi', 'azw', 'azw3', 'kf8', 'prc', 'djvu', 'djv', 'fb2', 'cbz', 'cbr',
];

export function isBookFileName(name) {
  const n = String(name || '').trim();
  const i = n.lastIndexOf('.');
  if (i <= 0 || i === n.length - 1) return false;
  return TREE_BOOK_EXTENSIONS.includes(n.slice(i + 1).toLowerCase());
}

/** "Moby Dick.epub" → "Moby Dick": the name a shelf shows for a book. */
export function bookTitleOf(name) {
  const n = String(name || '');
  const i = n.lastIndexOf('.');
  if (i <= 0) return n;
  return BOOK_EXTENSIONS.includes(n.slice(i + 1).toLowerCase()) ? n.slice(0, i) : n;
}

export function isPdfName(name) {
  const n = String(name || '').trim();
  const i = n.lastIndexOf('.');
  if (i <= 0 || i === n.length - 1) return false;
  return n.slice(i + 1).toLowerCase() === 'pdf';
}

// Where the folder panel starts, best first: the last folder a file was
// opened from (or picked in the panel), then the folder it showed last time.
// The caller checks each still exists and falls back to the home folder.
export function startFolderCandidates(settings) {
  const out = [];
  for (const v of [settings?.lastDir, settings?.folderRoot]) {
    const dir = typeof v === 'string' ? v.trim() : '';
    if (dir && !out.includes(dir)) out.push(dir);
  }
  return out;
}

export function isHiddenName(name) {
  return String(name || '').startsWith('.');
}

export function driveRootOf(filePath) {
  const raw = String(filePath || '').trim();
  if (!raw) return '';
  const win = raw.replace(/\//g, '\\');
  const m = win.match(/^([A-Za-z]:)(?:\\|$)/);
  if (m) return `${m[1].toUpperCase()}\\`;
  const posix = raw.replace(/\\/g, '/');
  const vol = posix.match(/^\/Volumes\/[^/]+/);
  if (vol) return vol[0];
  if (posix.startsWith('/')) return '/';
  return '';
}

export function isSameDrive(drivePath, folderRoot) {
  const a = driveRootOf(drivePath).replace(/\\/g, '/').toLowerCase();
  const b = driveRootOf(folderRoot).replace(/\\/g, '/').toLowerCase();
  return !!a && a === b;
}

export function folderLabel(filePath) {
  const s = String(filePath || '').replace(/[\\/]+$/, '');
  const parts = s.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || s;
}

// Folders first, then files; numbers in names compare as numbers, so page
// pictures list as 1, 2 … 10 rather than 1, 10, 2.
export function sortFolderEntries(entries) {
  return [...(entries || [])].sort((a, b) => {
    const ad = a.kind === 'dir';
    const bd = b.kind === 'dir';
    if (ad !== bd) return ad ? -1 : 1;
    return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base', numeric: true });
  });
}

/**
 * Whether a path can be a book on the library shelf: a book file, a ZIP
 * archive or a folder of pictures. Text, Markdown, HTML, single pictures and
 * workspaces cannot (a picture's folder goes on the shelf instead). A folder
 * is recognised by not being any of those, so "Vol.01" still counts.
 */
export function isShelfPath(p) {
  const name = String(p || '').split(/[\\/]/).pop();
  if (!name) return false;
  if (isBookFileName(name) || isZipName(name)) return true;
  return !(isImageName(name) || /\.(txt|text|md|markdown|mdown|html?|xhtml|log|ebkvw|pdfvw)$/i.test(name));
}

// The entry kind for a book is still 'pdf': it is the name the folder tree,
// the Rust side and saved settings have always used for "a file to open".
// A ZIP archive is 'zip' and a picture 'image'; both are files, never folders.
export function classifyEntry(name, hints = {}) {
  const n = String(name || '').trim();
  if (!n || isHiddenName(n)) return null;
  if (isBookFileName(n)) return 'pdf';
  if (hints.kind === 'dir' || hints.isDirectory === true) return 'dir';
  if (isZipName(n)) return 'zip';
  if (isImageName(n)) return 'image';
  return null;
}

export function toFolderEntries(raw) {
  const out = [];
  for (const e of raw || []) {
    const name = String(e?.name || '').trim();
    const kind = classifyEntry(name, e);
    if (!kind) continue;
    const filePath = e.path || name;
    if (kind === 'dir') out.push({ name, path: filePath, kind: 'dir' });
    else out.push({ name, path: filePath, kind, size: Number(e.size) || 0 });
  }
  return sortFolderEntries(out);
}

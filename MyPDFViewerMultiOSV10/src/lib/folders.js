// Folder tree helpers: keep only directories and PDF files,
// folders first, then a stable name sort. The last extension must be
// exactly "pdf" (any case). .pdfvw and names that merely contain "pdf"
// stay out. A true .pdf name still wins over a mistaken "directory" flag.

export function isPdfName(name) {
  const n = String(name || '').trim();
  const i = n.lastIndexOf('.');
  if (i <= 0 || i === n.length - 1) return false;
  return n.slice(i + 1).toLowerCase() === 'pdf';
}

export function isHiddenName(name) {
  return String(name || '').startsWith('.');
}

export function folderLabel(filePath) {
  const s = String(filePath || '').replace(/[\\/]+$/, '');
  const parts = s.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || s;
}

export function sortFolderEntries(entries) {
  return [...(entries || [])].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
    return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
  });
}

export function classifyEntry(name, hints = {}) {
  const n = String(name || '').trim();
  if (!n || isHiddenName(n)) return null;
  if (isPdfName(n)) return 'pdf';
  if (hints.kind === 'dir' || hints.isDirectory === true) return 'dir';
  if (hints.kind === 'pdf' || hints.isFile === true) return isPdfName(n) ? 'pdf' : null;
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
    else out.push({ name, path: filePath, kind: 'pdf', size: Number(e.size) || 0 });
  }
  return sortFolderEntries(out);
}

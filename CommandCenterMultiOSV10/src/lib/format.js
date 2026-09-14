// Display helpers shared by the panels and dialogs.
import { t } from './i18n';

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function sizeDisplay(entry) {
  if (entry.isDir) return t('dir_marker');
  return formatSize(entry.size);
}

export function typeDisplay(entry) {
  if (entry.isDir) return t('folder');
  if (entry.ext && entry.ext.length > 1) return t('file_of', { ext: entry.ext.slice(1).toUpperCase() });
  return t('file');
}

// Windows paths use "\", everything else "/". The backend tells us which.
let sep = '/';
export function setSeparator(s) { sep = s || '/'; }
export function getSeparator() { return sep; }

export function joinPath(dir, name) {
  if (!dir) return name;
  return dir.endsWith(sep) ? dir + name : dir + sep + name;
}

export function baseName(p) {
  const trimmed = p.replace(/[\\/]+$/, '');
  const i = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return i >= 0 ? trimmed.slice(i + 1) : trimmed;
}

export function dirName(p) {
  const trimmed = p.replace(/[\\/]+$/, '');
  const i = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  if (i < 0) return p;
  const d = trimmed.slice(0, i);
  if (!d) return sep;                 // "/x" → "/"
  if (/^[a-zA-Z]:$/.test(d)) return d + '\\';   // "C:\x" → "C:\"
  return d;
}

// Splits a path into breadcrumb components: [{label, path}].
export function breadcrumbs(p) {
  if (!p) return [];
  const isWinDrive = /^[a-zA-Z]:[\\/]/.test(p);
  const parts = p.split(/[\\/]+/).filter(Boolean);
  const crumbs = [];
  if (isWinDrive) {
    const drive = parts.shift();
    crumbs.push({ label: drive + '\\', path: drive + '\\' });
    let acc = drive + '\\';
    for (const part of parts) {
      acc = acc.endsWith('\\') ? acc + part : acc + '\\' + part;
      crumbs.push({ label: part, path: acc });
    }
    return crumbs;
  }
  if (p.startsWith('/')) {
    crumbs.push({ label: '/', path: '/' });
    let acc = '';
    for (const part of parts) {
      acc += '/' + part;
      crumbs.push({ label: part, path: acc });
    }
    return crumbs;
  }
  let acc = '';
  for (const part of parts) {
    acc = acc ? joinPath(acc, part) : part;
    crumbs.push({ label: part, path: acc });
  }
  return crumbs;
}

// "C:\" for Windows paths, "/" otherwise (the drive button label).
export function driveOf(p) {
  const m = /^([a-zA-Z]:)[\\/]?/.exec(p || '');
  return m ? `${m[1].toUpperCase()}\\` : '/';
}

export function truncateMiddle(s, max = 48) {
  if (!s || s.length <= max) return s || '';
  const base = baseName(s);
  const short = `…${sep}${base}`;
  return short.length <= max ? short : `${short.slice(0, max - 1)}…`;
}

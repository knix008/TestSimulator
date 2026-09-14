// Display helpers shared by the panels, status bar and dialogs.

export function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function timeStamp(ms = Date.now()) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function fileStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function formatUptime(sinceMs) {
  if (!sinceMs) return '';
  let s = Math.max(0, Math.floor((Date.now() - sinceMs) / 1000));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  const p = (n) => String(n).padStart(2, '0');
  return `${d ? `${d}d ` : ''}${p(h)}:${p(m)}:${p(s)}`;
}

export function permSummary(u, tr) {
  if (u.canRead && u.canWrite) return tr('perm_rw');
  if (u.canRead) return tr('perm_r');
  if (u.canWrite) return tr('perm_w');
  return tr('perm_none');
}

export function baseName(p) {
  const trimmed = String(p || '').replace(/[\\/]+$/, '');
  const i = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return i >= 0 ? trimmed.slice(i + 1) : trimmed;
}

export function dirName(p) {
  const trimmed = String(p || '').replace(/[\\/]+$/, '');
  const i = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  if (i < 0) return '';
  const d = trimmed.slice(0, i);
  if (!d) return '/';
  if (/^[a-zA-Z]:$/.test(d)) return d + '\\';
  return d;
}

export function joinPath(dir, name, sep) {
  if (!dir) return name;
  return dir.endsWith(sep) || dir.endsWith('/') ? dir + name : dir + sep + name;
}

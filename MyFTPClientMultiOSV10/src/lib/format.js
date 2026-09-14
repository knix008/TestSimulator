// Display helpers shared by the panels, status bar and dialogs.

export function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// The WinForms original: "1.2 MB/s" / "340 KB/s" / "12 B/s".
export function formatSpeed(bytesPerSec) {
  if (!bytesPerSec || bytesPerSec <= 0) return '';
  if (bytesPerSec >= 1024 * 1024) return `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`;
  if (bytesPerSec >= 1024) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
  return `${bytesPerSec.toFixed(0)} B/s`;
}

export function formatDate(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function timeStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// Windows paths use "\", everything else "/". The backend tells us which.
let sep = '/';
export function setSeparator(s) { sep = s || '/'; }
export function getSeparator() { return sep; }

export function joinLocal(dir, name) {
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
  if (!d) return sep;                            // "/x" → "/"
  if (/^[a-zA-Z]:$/.test(d)) return d + '\\';    // "C:\x" → "C:\"
  return d;
}

export function posixJoin(dir, name) {
  if (!dir || dir === '/') return `/${name}`;
  return `${dir.replace(/\/+$/, '')}/${name}`;
}

export function posixParent(p) {
  const t = p.replace(/\/+$/, '');
  const i = t.lastIndexOf('/');
  return i <= 0 ? '/' : t.slice(0, i);
}

// Case-insensitive path comparison on Windows.
export function samePath(a, b) {
  const na = (a || '').replace(/[\\/]+$/, '');
  const nb = (b || '').replace(/[\\/]+$/, '');
  return sep === '\\' ? na.toLowerCase() === nb.toLowerCase() : na === nb;
}

export function isUnder(child, parent) {
  const c = (child || '').replace(/[\\/]+$/, '');
  const p = (parent || '').replace(/[\\/]+$/, '');
  if (samePath(c, p)) return true;
  const prefix = p + (p.endsWith(sep) ? '' : sep);
  return sep === '\\' ? c.toLowerCase().startsWith(prefix.toLowerCase()) : c.startsWith(prefix);
}

export function truncateMiddle(s, max = 48) {
  if (!s || s.length <= max) return s || '';
  const base = baseName(s);
  const short = `…${sep}${base}`;
  return short.length <= max ? short : `${short.slice(0, max - 1)}…`;
}

// Accepts what people paste into the Host box — "ftp.example.com",
// "ftp://ftp.example.com/pub", "sftp://user:pw@host:2222", "host:21" — and
// returns the pieces: { host, protocol?, port?, user?, password? }. Only the
// fields that were actually present are returned, so the caller can keep
// what the form already has.
export function parseHostInput(text) {
  let s = String(text || '').trim();
  const out = {};
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/(.*)$/.exec(s);
  if (m) {
    const scheme = m[1].toUpperCase();
    if (scheme === 'FTP' || scheme === 'FTPS' || scheme === 'SFTP') out.protocol = scheme;
    s = m[2];
  }
  // Drop the path (and anything after it).
  const slash = s.indexOf('/');
  if (slash >= 0) s = s.slice(0, slash);
  // user[:password]@
  const at = s.lastIndexOf('@');
  if (at >= 0) {
    const cred = s.slice(0, at);
    s = s.slice(at + 1);
    const colon = cred.indexOf(':');
    const dec = (v) => { try { return decodeURIComponent(v); } catch { return v; } };
    if (colon >= 0) { out.user = dec(cred.slice(0, colon)); out.password = dec(cred.slice(colon + 1)); }
    else if (cred) out.user = dec(cred);
  }
  // host[:port]  ("[::1]:21" keeps the brackets' address)
  const v6 = /^\[([^\]]+)\](?::(\d+))?$/.exec(s);
  if (v6) { s = v6[1]; if (v6[2]) out.port = v6[2]; }
  else {
    const colon = s.lastIndexOf(':');
    if (colon >= 0 && /^\d+$/.test(s.slice(colon + 1))) { out.port = s.slice(colon + 1); s = s.slice(0, colon); }
  }
  out.host = s.trim();
  return out;
}

// File-type icon key from a file name (the original mapped extensions to a
// handful of shell icons; here they are drawn SVG icons).
export function iconFor(name, isDir) {
  if (isDir) return 'folder';
  const ext = (name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : '').toLowerCase();
  if (['txt', 'log', 'md', 'rtf', 'ini', 'cfg', 'conf'].includes(ext)) return 'fileText';
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'ico', 'svg', 'webp', 'tif', 'tiff', 'heic'].includes(ext)) return 'fileImage';
  if (['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'z01', 'cab'].includes(ext)) return 'fileArchive';
  if (['exe', 'dll', 'msi', 'bat', 'cmd', 'sh', 'app', 'deb', 'rpm', 'appimage', 'dmg'].includes(ext)) return 'fileExe';
  if (['cs', 'py', 'js', 'jsx', 'ts', 'tsx', 'c', 'cpp', 'h', 'hpp', 'java', 'go', 'rs', 'rb', 'php', 'swift', 'kt', 'mjs', 'cjs', 'css', 'scss'].includes(ext)) return 'fileCode';
  if (['xml', 'json', 'yaml', 'yml', 'html', 'htm', 'toml', 'csv'].includes(ext)) return 'fileMarkup';
  if (ext === 'pdf') return 'filePdf';
  if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma'].includes(ext)) return 'fileAudio';
  if (['mp4', 'avi', 'mkv', 'mov', 'wmv', 'webm', 'm4v'].includes(ext)) return 'fileVideo';
  return 'file';
}

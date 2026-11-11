// Saving what a view exports (CSV, SVG, PNG) and copying text: the desktop asks for a path (native
// save dialog), the web downloads the file. Every save is also kept in `savedFiles` (the last 20) so the
// E2E suites can check the content without a file dialog.
import * as native from '../../platform/native.js';

export const savedFiles = [];

const remember = (entry) => { savedFiles.unshift({ ...entry, at: Date.now() }); savedFiles.length = Math.min(savedFiles.length, 20); };

const toBase64 = async (blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
};

/** Saves `content` (string or Blob) as `name`; `type` is a native SAVE_TYPES key (csv, svg, png). → the saved name or null. */
export async function saveFile(name, content, { mime = 'text/plain', type = 'csv' } = {}) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  remember({ name, mime, size: blob.size, text: typeof content === 'string' ? content : null, blob });
  if (native.isDesktop()) {
    const path = await native.chooseSavePath(name, [type]);
    if (!path) return null;
    if (typeof content === 'string') await native.writeTextFile(path, content, '');
    else await native.writeBase64File(path, await toBase64(blob), '');
    return path.split(/[\\/]/).pop();
  }
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return name;
}

/** Copies text to the clipboard (desktop: the shell; web: the Clipboard API). */
export async function copyText(text) {
  remember({ name: 'clipboard', mime: 'text/plain', size: text.length, text });
  try { await native.clipboardWrite(text); return true; } catch { /* fall back */ }
  try { await navigator.clipboard?.writeText(text); return true; } catch { return false; }
}

/** One CSV line per row (RFC 4180 quoting). */
export function toCsv(rows) {
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((row) => row.map(cell).join(',')).join('\r\n');
}

/** A file name safe on every system. */
export const safeName = (text) => String(text ?? 'export').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) || 'export';

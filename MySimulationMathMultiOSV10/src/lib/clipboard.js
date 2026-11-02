// The system clipboard as text, for every copy / paste in the app.
// Desktop: the host's clipboard (tauri-plugin-clipboard-manager), since WebView2 refuses
// navigator.clipboard.readText without a permission prompt. Web: navigator.clipboard, then
// execCommand('copy'). Whatever was copied last in this window is kept too, so a paste works
// even when the browser denies reading the clipboard.
import { isDesktop } from './backend.js';

let last = '';

async function host(cmd, args) {
  const m = await import('@tauri-apps/api/core');
  return m.invoke(cmd, args);
}

/** The clipboard's text, or null when there is none to read. */
export async function readText() {
  if (isDesktop) {
    try { const s = await host('plugin:clipboard-manager|read_text'); if (typeof s === 'string') return s; } catch { /* no text on the clipboard, or no plugin */ }
  }
  try { if (navigator.clipboard && navigator.clipboard.readText) return await navigator.clipboard.readText(); } catch { /* denied */ }
  return last || null;
}

/** Puts text on the clipboard; true when the system clipboard took it. */
export async function writeText(text) {
  const s = String(text ?? '');
  last = s;
  if (isDesktop) {
    try { await host('plugin:clipboard-manager|write_text', { text: s }); return true; } catch { /* fall back */ }
  }
  try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(s); return true; } } catch { /* fall back */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = s;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    const prev = document.activeElement;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (prev && prev.focus) prev.focus();
    return ok;
  } catch { return false; }
}

/** Structured data (blocks, flow nodes) as JSON text with a format tag; parseTagged reads it back. */
export const tagged = (format, data) => JSON.stringify({ format, ...data });
export function parseTagged(text, format) {
  if (!text || text[0] !== '{') return null;
  try { const o = JSON.parse(text); return o && o.format === format ? o : null; } catch { return null; }
}

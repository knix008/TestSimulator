// Enumerates system-installed fonts via the Local Font Access API
// (window.queryLocalFonts). Available in Chromium/Electron secure contexts.
// Falls back to a curated cross-platform list when the API is unavailable
// or permission is denied.

export const FALLBACK_FONTS = [
  'Arial', 'Calibri', 'Cambria', 'Candara', 'Consolas', 'Constantia',
  'Courier New', 'Georgia', 'Helvetica', 'Lucida Console', 'Malgun Gothic',
  'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana',
  'Batang', 'Dotum', 'Gulim', 'Gungsuh', 'Nanum Gothic', 'Nanum Myeongjo',
  'Noto Sans KR', 'Noto Serif KR', 'D2Coding',
  'Apple SD Gothic Neo', 'AppleGothic', 'DejaVu Sans', 'Liberation Serif',
];

let cache = null;

// The last successfully enumerated list, shared across windows. A secondary
// window (settings) can be denied the Local Font Access API even when the main
// window was allowed it; reusing the remembered list keeps every font picker
// showing the same fonts instead of quietly dropping to the built-in handful.
const SHARED_KEY = 'mtg-fonts';

function readShared() {
  try {
    const raw = localStorage.getItem(SHARED_KEY);
    const list = raw ? JSON.parse(raw) : null;
    return Array.isArray(list) && list.length ? list : null;
  } catch { return null; }
}

function writeShared(list) {
  try { localStorage.setItem(SHARED_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

// Returns a sorted, de-duplicated list of installed font family names.
// Falls back to the last list this app managed to enumerate, then to a curated
// cross-platform list.
export async function getSystemFonts() {
  if (cache) return cache;
  try {
    if (typeof window !== 'undefined' && typeof window.queryLocalFonts === 'function') {
      const fonts = await window.queryLocalFonts();
      const families = new Set();
      for (const f of fonts) families.add(f.family);
      if (families.size) {
        cache = [...families].sort((a, b) => a.localeCompare(b));
        writeShared(cache);
        return cache;
      }
    }
  } catch {
    /* permission denied / unsupported — fall through */
  }
  cache = readShared() || [...FALLBACK_FONTS].sort((a, b) => a.localeCompare(b));
  return cache;
}

// The list plus `current`, so a font picker always shows the font actually in
// effect — even one that is no longer installed or could not be enumerated.
// Without this the <select> silently falls back to "system default" and one
// stray click would replace the user's choice.
export function fontsWith(list, current) {
  const base = list || [];
  const name = String(current || '').trim();
  if (!name || base.includes(name)) return base;
  return [name, ...base];
}

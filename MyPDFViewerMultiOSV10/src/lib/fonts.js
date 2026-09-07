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

// Returns a sorted, de-duplicated list of installed font family names.
// `interactive` should be true when called from a user gesture (required by
// the API on the web); Electron grants it without a gesture.
export async function getSystemFonts() {
  if (cache) return cache;
  try {
    if (typeof window !== 'undefined' && typeof window.queryLocalFonts === 'function') {
      const fonts = await window.queryLocalFonts();
      const families = new Set();
      for (const f of fonts) families.add(f.family);
      if (families.size) {
        cache = [...families].sort((a, b) => a.localeCompare(b));
        return cache;
      }
    }
  } catch {
    /* permission denied / unsupported — fall through */
  }
  cache = [...FALLBACK_FONTS].sort((a, b) => a.localeCompare(b));
  return cache;
}

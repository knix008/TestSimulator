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

/**
 * A sorted, de-duplicated list of installed font family names.
 *
 * A full list from the system is remembered. A shorter stand-in is not, so a
 * later call — one made while the reader is choosing a font — can still ask
 * the system again and receive every installed family.
 */
export async function getSystemFonts() {
  if (cache) return cache;
  try {
    if (typeof window !== 'undefined' && typeof window.queryLocalFonts === 'function') {
      const fonts = await window.queryLocalFonts();
      const families = new Set();
      for (const font of fonts) if (font.family) families.add(font.family);
      if (families.size) {
        cache = [...families].sort((a, b) => a.localeCompare(b));
        return cache;
      }
    }
  } catch {
    /* permission denied or unsupported — the stand-in list is used this once */
  }
  return [...FALLBACK_FONTS].sort((a, b) => a.localeCompare(b));
}

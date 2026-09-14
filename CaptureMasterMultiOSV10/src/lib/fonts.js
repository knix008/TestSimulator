// Installed fonts for the Settings dialog.
//
// queryLocalFonts() lists every font on the system (Electron grants the
// `local-fonts` permission in main.js). Where it is unavailable or denied a
// curated list of common families keeps the picker useful.

export const FALLBACK_FONTS = [
  'Arial', 'Arial Black', 'Calibri', 'Cambria', 'Comic Sans MS', 'Consolas', 'Courier New', 'Georgia', 'Impact',
  'Malgun Gothic', 'Gulim', 'Dotum', 'Batang', 'Nanum Gothic', 'Nanum Myeongjo', 'Noto Sans KR', 'Noto Sans', 'Noto Serif',
  'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Helvetica', 'Helvetica Neue', 'Apple SD Gothic Neo',
  'San Francisco', 'Menlo', 'Monaco', 'DejaVu Sans', 'DejaVu Serif', 'DejaVu Sans Mono', 'Ubuntu', 'Ubuntu Mono', 'Liberation Sans',
  'Liberation Serif', 'Roboto', 'Open Sans', 'Fira Code', 'JetBrains Mono', 'Source Code Pro',
];

let cache = null;

/** @returns {Promise<{families: string[], source: 'system'|'fallback'}>} */
export async function listFonts() {
  if (cache) return cache;
  if (typeof window !== 'undefined' && typeof window.queryLocalFonts === 'function') {
    try {
      const fonts = await window.queryLocalFonts();
      const families = Array.from(new Set(fonts.map((f) => f.family))).sort((a, b) => a.localeCompare(b));
      if (families.length) {
        cache = { families, source: 'system' };
        return cache;
      }
    } catch {
      /* permission denied or unsupported — use the fallback below */
    }
  }
  cache = { families: [...FALLBACK_FONTS].sort((a, b) => a.localeCompare(b)), source: 'fallback' };
  return cache;
}

// Font families available for the editor: every font installed on the
// system (Chromium's Local Font Access API — `queryLocalFonts`, available in
// Electron and Chromium browsers; it needs a user gesture, so the list is
// loaded when the font box is first clicked) merged with a few well-known
// monospace fonts as a fallback for other browsers.
import { FONT_SUGGESTIONS } from './settings';

let cached = null;
let loading = null;

export function fontList() { return cached || FONT_SUGGESTIONS; }

export async function loadSystemFonts() {
  if (cached) return cached;
  if (loading) return loading;
  loading = (async () => {
    const families = new Set(FONT_SUGGESTIONS);
    try {
      if (typeof window.queryLocalFonts === 'function') {
        const fonts = await window.queryLocalFonts();
        for (const f of fonts) if (f.family) families.add(f.family);
      }
    } catch { /* denied or unsupported → suggestions only */ }
    const collator = new Intl.Collator(undefined, { sensitivity: 'base' });
    cached = [...families].sort(collator.compare);
    return cached;
  })();
  return loading;
}

// Text width in the browser: one shared 2D canvas (the layout caches the
// results per font and text, src/lib/layout.js).
let ctx = null;

export function measureText(text, font) {
  if (!ctx) {
    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(8, 8) : document.createElement('canvas');
    ctx = canvas.getContext('2d');
  }
  ctx.font = font;
  return ctx.measureText(String(text)).width;
}

// The theme tokens the 'auto' map style reads (src/lib/mapstyles.js).
const TOKEN_KEYS = ['--bg', '--bg-panel', '--bg-elev', '--fg', '--fg-muted', '--border', '--border-strong', '--accent', '--accent-strong', '--accent-text', '--danger'];
export function themeTokens() {
  const cs = getComputedStyle(document.documentElement);
  const out = {};
  for (const k of TOKEN_KEYS) out[k] = cs.getPropertyValue(k).trim();
  return out;
}

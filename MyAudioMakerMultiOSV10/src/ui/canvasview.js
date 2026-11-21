// Shared parts of the canvas views (arrangement, piano roll): a scroll area whose canvas is only as
// big as what is visible (songs of any length, any zoom), crisp drawing on high-DPI screens, the
// theme's colours for canvas drawing, and the play-head overlay.

/** Theme colours read from the CSS variables (canvas cannot use var()). */
export function themeColors(element = document.documentElement) {
  const css = getComputedStyle(element);
  const get = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  return {
    bg: get('--bg', '#ffffff'), panel: get('--panel', '#f4f5f7'), surface: get('--surface', '#ffffff'), text: get('--text', '#111827'),
    muted: get('--muted', '#6b7280'), border: get('--border', '#d1d5db'), hairline: get('--hairline', '#e5e7eb'), accent: get('--accent', '#2563eb'),
    accentText: get('--accent-text', '#ffffff'), hover: get('--hover', '#eef2ff'), danger: '#e5484d',
    dark: document.documentElement.dataset.themeDark === 'true' || isDark(get('--bg', '#ffffff')),
  };
}

function isDark(color) {
  const m = /^#?([0-9a-f]{6})$/i.exec(color);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  return ((n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) < 128;
}

/** `rgba()` of a '#rrggbb' colour. */
export function alpha(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Mixes two '#rrggbb' colours (0 = a, 1 = b). */
export function mixColor(a, b, k) {
  const pa = /^#?([0-9a-f]{6})$/i.exec(a); const pb = /^#?([0-9a-f]{6})$/i.exec(b);
  if (!pa || !pb) return a;
  const x = parseInt(pa[1], 16); const y = parseInt(pb[1], 16);
  const c = (s) => Math.round(((x >> s) & 255) * (1 - k) + ((y >> s) & 255) * k);
  return `#${[16, 8, 0].map((s) => c(s).toString(16).padStart(2, '0')).join('')}`;
}

/** Sizes a canvas to its CSS box at the screen's pixel ratio; returns the 2D context set to CSS pixels. */
export function fitCanvas(canvas, width, height) {
  const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  if (canvas.width !== Math.floor(w * ratio) || canvas.height !== Math.floor(h * ratio)) {
    canvas.width = Math.floor(w * ratio);
    canvas.height = Math.floor(h * ratio);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return ctx;
}

/** A rounded rectangle path. */
export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Text cut to `max` px with "…". */
export function fitText(ctx, text, max) {
  const s = String(text ?? '');
  if (ctx.measureText(s).width <= max) return s;
  let lo = 0; let hi = s.length;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ctx.measureText(`${s.slice(0, mid)}…`).width <= max) lo = mid; else hi = mid - 1; }
  return lo ? `${s.slice(0, lo)}…` : '';
}

/** Zoom steps (pixels per beat) of the time axis. */
export const ZOOMS = [4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128, 160, 200];
export const zoomStep = (value, dir) => (dir > 0 ? ZOOMS.find((z) => z > value + 1e-6) ?? ZOOMS[ZOOMS.length - 1] : [...ZOOMS].reverse().find((z) => z < value - 1e-6) ?? ZOOMS[0]);

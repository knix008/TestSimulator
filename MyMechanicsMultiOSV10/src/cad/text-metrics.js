// Text measured with the font the drawing sheet is drawn in: Roboto (SIL OFL), the font the kernel loads for
// sketch text (kernel.js reads it from node_modules under Node, the bundled file in the app) and the one the
// sheet's SVG names first (DRAWING_FONT). Advance widths come from the font's glyphs and kerning (opentype.js
// inside the kernel library). A character the font has no glyph for (Hangul, some symbols) is measured as the
// fallback font draws it: a full em for wide (CJK) characters, 0.6 em otherwise. Before the font is loaded the
// same per-character rule stands in for every character. No DOM.
import { rep } from './kernel.js';

/** The font family of every text of the drawing sheet (SVG and print), its fallback after it. */
export const DRAWING_FONT = 'Roboto, sans-serif';
export const FONT_FAMILY = 'roboto';

let cached = null;
/** The loaded opentype font (null until the kernel has loaded it). */
export function measureFont() {
  if (cached) return cached;
  try { const f = rep()?.getFont?.(FONT_FAMILY); if (f && typeof f.charToGlyph === 'function') cached = f; } catch { cached = null; }
  return cached;
}

const wide = (cp) => (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6);
/** Width (em) of a character the font does not have. */
const fallbackEm = (ch) => (wide(ch.codePointAt(0)) ? 1 : 0.6);

/**
 * Width of one line of text at font `size` (mm, the em): the font's advance widths and kerning pairs; bold text
 * is 4.5 % wider (Roboto Bold against Regular over the Latin letters and figures).
 */
export function textWidth(text, size, { bold = false } = {}) {
  const s = String(text ?? '');
  if (!s) return 0;
  const em = Number(size) || 0;
  const font = measureFont();
  let units = 0;
  if (!font) { for (const ch of s) units += fallbackEm(ch); return units * em * (bold ? 1.045 : 1); }
  const upm = font.unitsPerEm || 1000;
  let prev = null;
  for (const ch of s) {
    const g = font.charToGlyph(ch);
    if (!g || g.index === 0) { units += fallbackEm(ch); prev = null; continue; }
    if (prev) { try { units += (font.getKerningValue(prev, g) || 0) / upm; } catch { /* no kerning */ } }
    units += (g.advanceWidth ?? 0) / upm;
    prev = g;
  }
  return units * em * (bold ? 1.045 : 1);
}

/** Ascent and descent (positive, mm) of the font at `size`: how far glyphs reach above and below the baseline. */
export function textExtent(size) {
  const em = Number(size) || 0;
  const font = measureFont();
  if (!font) return { ascent: em * 0.93, descent: em * 0.25 };
  const upm = font.unitsPerEm || 1000;
  const asc = font.tables?.hhea?.ascender ?? font.ascender ?? upm * 0.93;
  const desc = Math.abs(font.tables?.hhea?.descender ?? font.descender ?? -upm * 0.25);
  return { ascent: (asc / upm) * em, descent: (desc / upm) * em };
}

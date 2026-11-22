// Text measured with the fonts the drawing sheet is drawn in. The sheet names DRAWING_FONT: Roboto (SIL OFL 1.1,
// @fontsource) for Latin text, regular and bold, then the Korean fonts the app's own text uses (Malgun Gothic,
// Apple SD Gothic Neo, Noto Sans KR) for what Roboto has no glyph for.
//   Roboto — advance widths and kerning from the font files (opentype.js inside the kernel library): regular is
//     the font kernel.js loads for sketch text, bold is loaded next to it (loadDrawingFonts()).
//   Korean and other characters Roboto lacks — under Node the system's Korean font file when there is one
//     (Malgun Gothic, Noto Sans KR …), in the browser the canvas measuring the same font list the sheet names;
//     with neither, the metrics of those fonts as a table: Hangul syllables, Jamo and CJK ideographs are one em
//     wide in all of them (Malgun Gothic: 2048 of 2048 units for all 11 172 syllables and 94 compatibility Jamo),
//     anything else 0.6 em.
// Exported SVG embeds the Roboto files (fontFaceCss()), so the sheet looks the same where Roboto is not installed
// (the OFL allows embedding; the Korean system fonts are not embedded — their licences do not allow it).
import { rep } from './kernel.js';

/** The font list of every text of the drawing sheet (SVG and print). */
export const DRAWING_FONT = 'Roboto,"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif';
/** The Korean part of it (what the canvas measures characters Roboto lacks with). */
const CJK_FONT = '"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif';
export const FONT_FAMILY = 'roboto';
const BOLD_FAMILY = 'roboto-bold';
const CJK_FAMILY = 'drawing-cjk';
const CJK_BOLD_FAMILY = 'drawing-cjk-bold';

const fonts = new Map();
const fontOf = (family) => {
  if (fonts.get(family)) return fonts.get(family);
  try { const f = rep()?.getFont?.(family); if (f && typeof f.charToGlyph === 'function') { fonts.set(family, f); return f; } } catch { /* not loaded */ }
  return null;
};
/** The loaded Roboto (regular, or bold) — null until loaded. */
export const measureFont = (bold = false) => (bold ? fonts.get(BOLD_FAMILY) ?? null : fontOf(FONT_FAMILY));
/** The Korean font measured from its file (Node), null when there is none. */
export const cjkFont = (bold = false) => fonts.get(bold ? CJK_BOLD_FAMILY : CJK_FAMILY) ?? fonts.get(CJK_FAMILY) ?? null;

const bytesOfFile = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const embedded = { regular: null, bold: null };
const toBase64 = (buf) => {
  const u8 = new Uint8Array(buf);
  if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('base64');
  let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
};

/** Korean font files of the systems the app runs on (opentype.js reads TTF / OTF, not collections). */
const CJK_FILES = [
  ['C:/Windows/Fonts/malgun.ttf', 'C:/Windows/Fonts/malgunbd.ttf'],
  ['/usr/share/fonts/truetype/noto/NotoSansKR-Regular.ttf', '/usr/share/fonts/truetype/noto/NotoSansKR-Bold.ttf'],
  ['/usr/share/fonts/opentype/noto/NotoSansKR-Regular.otf', '/usr/share/fonts/opentype/noto/NotoSansKR-Bold.otf'],
  ['C:/Windows/Fonts/NotoSansKR-VF.ttf', null],
];

/**
 * Loads the other fonts the sheet measures with, after the kernel loaded Roboto Regular (`regularBytes`, kept to
 * embed in exported SVG): Roboto Bold, and under Node the system's Korean font. Called by kernel.js.
 */
export async function loadDrawingFonts(regularBytes = null) {
  const R = rep();
  if (regularBytes) embedded.regular = regularBytes;
  const isNode = typeof process !== 'undefined' && Boolean(process.versions?.node) && typeof window === 'undefined';
  try {
    let bold;
    if (isNode) {
      const fs = await import(/* @vite-ignore */ 'node:fs'); const { fileURLToPath } = await import(/* @vite-ignore */ 'node:url');
      bold = bytesOfFile(fs.readFileSync(fileURLToPath(new URL('../../node_modules/@fontsource/roboto/files/roboto-latin-700-normal.woff', import.meta.url))));
    } else {
      const url = (await import('@fontsource/roboto/files/roboto-latin-700-normal.woff?url')).default;
      bold = await (await fetch(url)).arrayBuffer();
    }
    embedded.bold = bold;
    fonts.set(BOLD_FAMILY, await R.loadFont(bold.slice(0), BOLD_FAMILY, true));
  } catch (error) { console.warn('drawing bold font', error); }
  if (isNode && !cjkFont()) {
    try {
      const fs = await import(/* @vite-ignore */ 'node:fs');
      for (const [regular, boldFile] of CJK_FILES) {
        if (!fs.existsSync(regular)) continue;
        fonts.set(CJK_FAMILY, await R.loadFont(bytesOfFile(fs.readFileSync(regular)), CJK_FAMILY, true));
        if (boldFile && fs.existsSync(boldFile)) fonts.set(CJK_BOLD_FAMILY, await R.loadFont(bytesOfFile(fs.readFileSync(boldFile)), CJK_BOLD_FAMILY, true));
        break;
      }
    } catch { /* the table below */ }
  }
}

const wide = (cp) => (cp >= 0x1100 && cp <= 0x11ff) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xa960 && cp <= 0xa97f) || (cp >= 0xac00 && cp <= 0xd7ff) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6);
/** The table: width (em) of a character in the Korean fonts. */
export const tableEm = (ch) => (wide(ch.codePointAt(0)) ? 1 : 0.6);

let canvasCtx;
const canvas = () => {
  if (canvasCtx !== undefined) return canvasCtx;
  canvasCtx = null;
  try {
    if (typeof OffscreenCanvas !== 'undefined') canvasCtx = new OffscreenCanvas(4, 4).getContext('2d');
    else if (typeof document !== 'undefined') canvasCtx = document.createElement('canvas').getContext('2d');
  } catch { canvasCtx = null; }
  return canvasCtx;
};
const canvasCache = new Map();
/** Width (em) of a character Roboto lacks, in the sheet's Korean fonts. */
function fallbackEm(ch, bold) {
  const f = cjkFont(bold);
  if (f) { const g = f.charToGlyph(ch); if (g && g.index) return (g.advanceWidth ?? 0) / (f.unitsPerEm || 1000); }
  const ctx = canvas();
  if (ctx) {
    const k = `${bold ? 'b' : 'r'}${ch}`;
    if (!canvasCache.has(k)) { ctx.font = `${bold ? 'bold ' : ''}100px ${CJK_FONT}`; canvasCache.set(k, ctx.measureText(ch).width / 100); }
    const w = canvasCache.get(k);
    if (w > 0) return w;
  }
  return tableEm(ch);
}

/** Width of one line of text at font `size` (mm, the em): advance widths and kerning of the fonts it is drawn in. */
export function textWidth(text, size, { bold = false } = {}) {
  const s = String(text ?? '');
  if (!s) return 0;
  const em = Number(size) || 0;
  const font = measureFont(bold) ?? measureFont(false);
  // Bold before Roboto Bold has loaded: Roboto Bold is 4.5 % wider than Regular over the Latin letters and figures.
  const stretch = bold && font && font === measureFont(false) ? 1.045 : 1;
  let units = 0;
  if (!font) { for (const ch of s) units += fallbackEm(ch, bold); return units * em; }
  const upm = font.unitsPerEm || 1000;
  let prev = null;
  for (const ch of s) {
    const g = font.charToGlyph(ch);
    if (!g || g.index === 0) { units += fallbackEm(ch, bold); prev = null; continue; }
    if (prev) { try { units += ((font.getKerningValue(prev, g) || 0) / upm) * stretch; } catch { /* no kerning */ } }
    units += ((g.advanceWidth ?? 0) / upm) * stretch;
    prev = g;
  }
  return units * em;
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

/** @font-face rules embedding Roboto Regular and Bold (WOFF data URIs); '' until the fonts are loaded. */
export function fontFaceCss() {
  const rule = (bytes, weight) => (bytes ? `@font-face{font-family:'Roboto';font-style:normal;font-weight:${weight};src:url(data:font/woff;base64,${toBase64(bytes)}) format('woff')}` : '');
  return `${rule(embedded.regular, 400)}${rule(embedded.bold, 700)}`;
}

/** An SVG sheet with the fonts embedded (a <style> with fontFaceCss() right after the opening <svg> tag). */
export function embedFonts(svg) {
  const css = fontFaceCss();
  if (!css) return svg;
  return String(svg).replace(/<svg\b[^>]*>/, (m) => `${m}\n  <style>${css}</style>`);
}

// Turns a reflowable chapter into fixed pages.
//
// The chapter's sanitized HTML is laid out off screen by the browser itself,
// in CSS columns exactly one page box wide and one page box tall, so every
// column is one page. Each word, picture, rule and link is then measured where
// the browser put it, and kept as a small display list per page. That list is
// what a page paints from (canvas text and images), what its text layer and
// search read, and where its links point — so to the viewer an EPUB page is a
// page like any PDF's, and the page-turn effects play on it unchanged.
//
// Units are CSS pixels at zoom 1, the same as a PDF's points at scale 1.

export const PAGE_WIDTH = 600;
export const PAGE_HEIGHT = 800;
export const MARGIN = { top: 64, right: 60, bottom: 64, left: 60 };
export const BOX_WIDTH = PAGE_WIDTH - MARGIN.left - MARGIN.right;
export const BOX_HEIGHT = PAGE_HEIGHT - MARGIN.top - MARGIN.bottom;
const COLUMN_GAP = 80;

// The reader's font size for reflowable books, in CSS px at zoom 1.
export const DEFAULT_FONT_SIZE = 18;
export const MIN_FONT_SIZE = 10;
export const MAX_FONT_SIZE = 40;
export const FONT_SIZE_STEP = 2;

export function clampFontSize(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return DEFAULT_FONT_SIZE;
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, v));
}

/** One step smaller (dir < 0) or larger (dir > 0), clamped. */
export function stepFontSize(current, dir) {
  return clampFontSize(clampFontSize(current) + (dir < 0 ? -FONT_SIZE_STEP : FONT_SIZE_STEP));
}
const STEP = BOX_WIDTH + COLUMN_GAP;

export const BOOK_FONT = "Georgia, 'Noto Serif KR', 'Nanum Myeongjo', Batang, 'AppleMyungjo', 'Noto Serif CJK JP', serif";
export const MONO_FONT = "Consolas, 'D2Coding', 'Noto Sans Mono CJK KR', Menlo, monospace";
export const TEXT_COLOR = '#1d1b18';
export const LINK_COLOR = '#1a55a8';

const STYLE_ID = 'ebk-flow-style';

// The reader owns typography: the book's own CSS was dropped by the sanitizer
// (see html.js), and these rules are what every book is set in.
const FLOW_CSS = `
.ebk-flow {
  position: fixed; left: -200000px; top: 0; z-index: -1; pointer-events: none;
  width: ${BOX_WIDTH}px; height: ${BOX_HEIGHT}px; overflow: hidden;
  column-width: ${BOX_WIDTH}px; column-gap: ${COLUMN_GAP}px; column-fill: auto;
  font-family: ${BOOK_FONT}; font-size: 18px; line-height: 1.62; color: ${TEXT_COLOR};
  text-align: justify; overflow-wrap: break-word; word-break: normal;
  orphans: 2; widows: 2; font-kerning: none; font-variant-ligatures: none;
  text-rendering: geometricPrecision; -webkit-font-smoothing: antialiased;
}
.ebk-flow * { max-width: 100%; box-sizing: border-box; }
.ebk-flow p, .ebk-flow div { margin: 0; }
.ebk-flow p { margin: 0 0 0.55em; }
.ebk-flow h1, .ebk-flow h2, .ebk-flow h3, .ebk-flow h4, .ebk-flow h5, .ebk-flow h6 {
  text-align: left; line-height: 1.3; margin: 0.9em 0 0.55em; break-after: avoid; break-inside: avoid;
}
.ebk-flow h1 { font-size: 1.62em; margin-top: 0.4em; }
.ebk-flow h2 { font-size: 1.36em; }
.ebk-flow h3 { font-size: 1.18em; }
.ebk-flow h4, .ebk-flow h5, .ebk-flow h6 { font-size: 1em; }
.ebk-flow img { height: auto; max-height: ${BOX_HEIGHT - 8}px; vertical-align: middle; break-inside: avoid; object-fit: contain; }
.ebk-flow p:has(> img:only-child), .ebk-flow div:has(> img:only-child) { text-align: center; text-indent: 0; }
.ebk-flow figure { margin: 0.8em 0; text-align: center; break-inside: avoid; }
.ebk-flow figcaption { font-size: 0.86em; color: #555; margin-top: 0.3em; }
.ebk-flow blockquote { margin: 0.7em 0 0.7em 0.4em; padding-left: 0.9em; border-left: 3px solid #c9c4ba; color: #3b3832; }
.ebk-flow pre { white-space: pre-wrap; font-family: ${MONO_FONT}; font-size: 0.8em; line-height: 1.45;
  background: #f3f1ec; padding: 0.55em 0.7em; margin: 0.6em 0; text-align: left; }
.ebk-flow code, .ebk-flow kbd, .ebk-flow samp, .ebk-flow tt { font-family: ${MONO_FONT}; font-size: 0.86em; }
.ebk-flow pre code { font-size: 1em; }
.ebk-flow ul, .ebk-flow ol { margin: 0.4em 0 0.7em; padding-left: 1.7em; list-style: none; }
.ebk-flow li { position: relative; margin: 0.15em 0; }
.ebk-flow .ebk-marker { position: absolute; left: -1.7em; width: 1.35em; text-align: right; text-indent: 0; }
.ebk-flow table { border-collapse: collapse; margin: 0.7em 0; font-size: 0.88em; text-align: left; }
.ebk-flow td, .ebk-flow th { border: 1px solid #b9b4aa; padding: 0.2em 0.45em; vertical-align: top; }
.ebk-flow th { background: #f0ede6; }
.ebk-flow hr { border: 0; border-top: 1px solid #a8a296; margin: 1.1em 15%; }
.ebk-flow a[data-section], .ebk-flow a[data-external] { color: ${LINK_COLOR}; }
.ebk-flow sup, .ebk-flow sub { font-size: 0.7em; line-height: 0; }
.ebk-flow dt { font-weight: 700; }
.ebk-flow dd { margin: 0 0 0.4em 1.4em; }
.ebk-flow .fb2-title { font-size: 1.3em; font-weight: 700; margin: 1.1em 0 0.6em; text-align: left; break-after: avoid; }
.ebk-flow .fb2-title p { margin: 0 0 0.2em; }
.ebk-flow .fb2-epigraph { font-style: italic; margin-left: 30%; border-left: 0; }
.ebk-flow .fb2-poem { margin: 0.7em 0 0.7em 1.5em; }
.ebk-flow .fb2-stanza { margin-bottom: 0.7em; }
.ebk-flow .fb2-verse { margin: 0; text-indent: 0; text-align: left; }
.ebk-flow .fb2-author { text-align: right; font-style: italic; }
.ebk-flow .comic-page { text-align: center; }
`;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = FLOW_CSS;
  document.head.append(style);
}

// List markers are drawn by the browser, not written in the text, so they would
// be neither painted nor selectable. They are written in as real text first.
function writeListMarkers(host) {
  for (const li of host.querySelectorAll('li')) {
    const list = li.parentElement;
    const ordered = list?.tagName === 'OL';
    const span = document.createElement('span');
    span.className = 'ebk-marker';
    if (ordered) {
      const items = [...list.children].filter((c) => c.tagName === 'LI');
      const start = Number.parseInt(list.getAttribute('start') || '1', 10);
      const value = Number.parseInt(li.getAttribute('value') || '', 10);
      span.textContent = `${Number.isFinite(value) ? value : (Number.isFinite(start) ? start : 1) + items.indexOf(li)}.`;
    } else {
      const depth = li.parentElement.closest('li') ? 1 : 0;
      span.textContent = depth ? '◦' : '•';
    }
    li.insertBefore(span, li.firstChild);
  }
}

// A picture that is still loading has no size, and the text around it would
// be measured where it is about to move from. Every picture is waited for (or
// dropped, if it cannot be read) before anything is measured.
async function settleImages(host) {
  const waits = [];
  for (const img of host.querySelectorAll('img')) {
    img.decoding = 'sync';
    img.loading = 'eager';
    const ready = img.complete && img.naturalWidth > 0
      ? Promise.resolve()
      : (img.decode ? img.decode() : new Promise((res, rej) => { img.onload = res; img.onerror = rej; }));
    waits.push(Promise.race([
      ready.then(() => true, () => false),
      new Promise((res) => setTimeout(() => res(img.naturalWidth > 0), 4000)),
    ]).then((ok) => { if (!ok) img.remove(); }));
  }
  await Promise.all(waits);
}

const measureCanvas = (() => {
  let ctx = null;
  return () => {
    if (!ctx) ctx = document.createElement('canvas').getContext('2d');
    return ctx;
  };
})();

const fontMetrics = new Map();
function ascentOf(font, size) {
  const key = font;
  if (fontMetrics.has(key)) return fontMetrics.get(key);
  const ctx = measureCanvas();
  ctx.font = font;
  const m = ctx.measureText('Hg가');
  const ascent = Number.isFinite(m.fontBoundingBoxAscent) ? m.fontBoundingBoxAscent : size * 0.88;
  const descent = Number.isFinite(m.fontBoundingBoxDescent) ? m.fontBoundingBoxDescent : size * 0.24;
  const value = { ascent, descent };
  fontMetrics.set(key, value);
  return value;
}

function underlined(el) {
  return !!el.closest('a[data-section], a[data-external], u, ins');
}

function struck(el) {
  return !!el.closest('s, del, strike');
}

function makeStyleReader() {
  const cache = new Map();
  const families = new Map();
  return (el) => {
    if (cache.has(el)) return cache.get(el);
    const cs = getComputedStyle(el);
    const size = Number.parseFloat(cs.fontSize) || 18;
    const family = cs.fontFamily || 'serif';
    const font = `${cs.fontStyle} ${cs.fontWeight} ${size}px ${family}`;
    if (!families.has(family)) families.set(family, `ebk_f${families.size}`);
    const metrics = ascentOf(font, size);
    const style = {
      font,
      size,
      family,
      fontName: families.get(family),
      color: cs.color || TEXT_COLOR,
      ascent: metrics.ascent,
      descent: metrics.descent,
      underline: underlined(el),
      strike: struck(el),
      hidden: cs.visibility === 'hidden' || cs.display === 'none',
    };
    cache.set(el, style);
    return style;
  };
}

/** Splits a string into code points, so a surrogate pair is never cut. */
function codePoints(text) {
  return Array.from(text);
}

/**
 * Lays one chapter out and measures it into pages.
 *
 * @param {string} html  sanitized chapter markup
 * @returns {Promise<{ pages: Array, anchors: Map<string, {page:number, y:number}> }>}
 *   `pages[i]` is { words, images, boxes, links }, in page coordinates
 *   (top-left origin, MARGIN included); `anchors` maps an element id to the
 *   page (index within this chapter) and y it sits at.
 */
export async function layoutChapter(html, { fontSize = DEFAULT_FONT_SIZE } = {}) {
  ensureStyle();
  const host = document.createElement('div');
  host.className = 'ebk-flow';
  host.setAttribute('aria-hidden', 'true');
  // Everything else in the book is sized in em, so this one number scales
  // headings, code and captions with it.
  host.style.fontSize = `${clampFontSize(fontSize)}px`;
  host.innerHTML = html || '';
  writeListMarkers(host);
  document.body.append(host);
  try {
    await settleImages(host);
    try { await document.fonts?.ready; } catch { /* the fallback fonts measure fine */ }
    return measure(host);
  } finally {
    host.remove();
  }
}

function measure(host) {
  const origin = host.getBoundingClientRect();
  const pageCount = Math.max(1, Math.round((host.scrollWidth + COLUMN_GAP) / STEP));
  const pages = Array.from({ length: pageCount }, () => ({ words: [], images: [], boxes: [], links: [] }));
  const anchors = new Map();
  const styleOf = makeStyleReader();

  const place = (r) => {
    const x = r.left - origin.left;
    const p = Math.min(pageCount - 1, Math.max(0, Math.floor((x + COLUMN_GAP / 2) / STEP)));
    return {
      p,
      x: x - p * STEP + MARGIN.left,
      y: r.top - origin.top + MARGIN.top,
      w: r.width,
      h: r.height,
    };
  };

  // ── Words ──
  const range = document.createRange();
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  const pushWord = (str, rect, style) => {
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const at = place(rect);
    pages[at.p].words.push({
      str,
      x: at.x,
      y: at.y,
      w: at.w,
      h: at.h,
      baseline: at.y + style.ascent,
      style,
    });
  };

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.data;
    if (!/\S/.test(text)) continue;
    const el = node.parentElement;
    if (!el) continue;
    const style = styleOf(el);
    if (style.hidden) continue;
    const re = /\S+/g;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      const rects = range.getClientRects();
      if (rects.length === 1) {
        pushWord(m[0], rects[0], style);
        continue;
      }
      if (!rects.length) continue;
      // The word was broken over a line or a page (long CJK runs have no
      // spaces at all): measure it a character at a time and join the
      // characters that share a line.
      let piece = null;
      let at = m.index;
      for (const ch of codePoints(m[0])) {
        range.setStart(node, at);
        range.setEnd(node, at + ch.length);
        at += ch.length;
        const r = range.getClientRects()[0];
        if (!r || r.width <= 0) continue;
        if (piece && Math.abs(r.top - piece.top) < 1 && r.left >= piece.right - 1 && r.left - piece.right < 2) {
          piece.str += ch;
          piece.right = r.right;
          piece.bottom = Math.max(piece.bottom, r.bottom);
        } else {
          if (piece) pushWord(piece.str, toRect(piece), style);
          piece = { str: ch, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        }
      }
      if (piece) pushWord(piece.str, toRect(piece), style);
    }
  }

  // ── Pictures ──
  for (const img of host.querySelectorAll('img')) {
    const r = img.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const at = place(r);
    pages[at.p].images.push({ img, src: img.currentSrc || img.src, x: at.x, y: at.y, w: at.w, h: at.h });
  }

  // ── Rules, cell borders and shaded blocks (the only ones the CSS above draws) ──
  for (const el of host.querySelectorAll('hr, td, th, blockquote, pre')) {
    const cs = getComputedStyle(el);
    const sides = ['Top', 'Right', 'Bottom', 'Left'].map((side) => ({
      side,
      width: cs[`border${side}Style`] === 'none' ? 0 : Number.parseFloat(cs[`border${side}Width`]) || 0,
      color: cs[`border${side}Color`],
    }));
    const fill = cs.backgroundColor && !/rgba\(.*,\s*0\)$|transparent/.test(cs.backgroundColor) ? cs.backgroundColor : null;
    if (!fill && !sides.some((s) => s.width > 0)) continue;
    for (const r of el.getClientRects()) {
      if (r.width <= 0 && r.height <= 0) continue;
      const at = place(r);
      pages[at.p].boxes.push({ x: at.x, y: at.y, w: at.w, h: at.h, fill, sides });
    }
  }

  // ── Links ──
  for (const a of host.querySelectorAll('a[data-section], a[data-external]')) {
    const target = a.hasAttribute('data-external')
      ? { url: a.getAttribute('data-external') }
      : { section: Number(a.getAttribute('data-section')), anchor: a.getAttribute('data-anchor') || '' };
    for (const r of a.getClientRects()) {
      if (r.width <= 0 || r.height <= 0) continue;
      const at = place(r);
      pages[at.p].links.push({ x: at.x, y: at.y, w: at.w, h: at.h, ...target });
    }
  }

  // ── Anchors (link and contents targets) ──
  for (const el of host.querySelectorAll('[id]')) {
    const r = el.getClientRects()[0] || el.getBoundingClientRect();
    const at = place(r);
    if (!anchors.has(el.id)) anchors.set(el.id, { page: at.p, y: Math.max(0, at.y) });
  }

  return { pages, anchors };
}

function toRect(piece) {
  return {
    left: piece.left,
    top: piece.top,
    width: piece.right - piece.left,
    height: piece.bottom - piece.top,
  };
}

/** True when a laid-out page shows nothing at all. */
export function isBlankPage(page) {
  return !page.words.length && !page.images.length && !page.boxes.length;
}

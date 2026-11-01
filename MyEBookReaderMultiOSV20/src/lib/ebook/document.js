// An e-book, dressed as a pdf.js document.
//
// The viewer was written against pdf.js: it asks a document for `numPages`
// and `getPage(n)`, and a page for its viewport, a render into a canvas, its
// text and its links. This module answers those same questions for EPUB,
// MOBI / AZW / AZW3, FB2, DjVu, CBZ, pictures, Markdown, HTML and plain text,
// so every part of the viewer — the page-turn effects, spreads, thumbnails,
// the text layer, search, highlights, printing — works on them unchanged.
//
// Reflowable books are paginated once when they open (layout.js); fixed-layout
// ones (DjVu, comics, pictures) are a page per picture at its own proportions.
import { openBook, detectFormat, flattenToc } from './book.js';
import { EbookViewport } from './viewport.js';
import {
  layoutChapter, isBlankPage, clampFontSize, PAGE_WIDTH, PAGE_HEIGHT, LINK_COLOR, DEFAULT_FONT_SIZE,
} from './layout.js';

/** Formats this module opens (everything the reader reads except PDF). */
export function isEbookData(data, name = '') {
  const format = detectFormat(data, name);
  return format !== 'pdf';
}

function cancelledError() {
  const err = new Error('Rendering cancelled');
  err.name = 'RenderingCancelledException';
  return err;
}

const yieldToUi = () => new Promise((resolve) => setTimeout(resolve, 0));

// ── Picture sizes, read from the file header without decoding ──

/** Pixel size of a JPEG / PNG / GIF / WebP / BMP, or null. */
export function imageSizeOf(bytes) {
  const b = bytes;
  if (!b || b.length < 24) return null;
  const u16be = (i) => (b[i] << 8) | b[i + 1];
  const u16le = (i) => b[i] | (b[i + 1] << 8);
  const u32be = (i) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
  const u32le = (i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16)) + ((b[i + 3] << 24) >>> 0);
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { width: u32be(16), height: u32be(20) };
  }
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { width: u16le(6), height: u16le(8) };
  if (b[0] === 0x42 && b[1] === 0x4d) return { width: u32le(18), height: Math.abs(u32le(22) | 0) };
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    const kind = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (kind === 'VP8 ' && b.length >= 30) return { width: u16le(26) & 0x3fff, height: u16le(28) & 0x3fff };
    if (kind === 'VP8L' && b.length >= 25) {
      const bits = u32le(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (kind === 'VP8X' && b.length >= 30) {
      return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    }
    return null;
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i += 1; continue; }
      const marker = b[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = u16be(i + 2);
      if ((marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: u16be(i + 7), height: u16be(i + 5) };
      }
      i += 2 + len;
    }
  }
  return null;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The picture on this page could not be read.'));
    img.src = src;
  });
}

// ── Pagination ──

/** A page whose size follows a picture of `w`×`h` pixels. */
function fixedPageSize(w, h) {
  if (!(w > 0 && h > 0)) return { width: PAGE_WIDTH, height: PAGE_HEIGHT };
  // Fit the picture in a page box of the usual area, keeping its shape.
  const area = PAGE_WIDTH * PAGE_HEIGHT;
  const k = Math.sqrt(area / (w * h));
  return { width: Math.max(50, Math.round(w * k)), height: Math.max(50, Math.round(h * k)) };
}

async function paginateReflowable(book, { onProgress, signal, fontSize } = {}) {
  const pages = [];
  const sectionStart = [];
  const anchors = new Map();          // `${section}#${id}` → { page, y }
  const total = book.sectionCount;

  for (let s = 0; s < total; s += 1) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    onProgress?.({ done: s, total });
    sectionStart[s] = pages.length;
    let chapter;
    try {
      chapter = book.loadSection(s);
    } catch {
      continue;                        // a missing chapter file: skip it, keep the book
    }
    const html = chapter.kind === 'image' && chapter.src && !chapter.html
      ? `<div class="comic-page"><img src="${chapter.src}" alt=""></div>`
      : chapter.html;
    // eslint-disable-next-line no-await-in-loop
    const laid = await layoutChapter(html, { fontSize });
    // Blank pages at the end of a chapter (an empty div, trailing breaks) are
    // dropped; a chapter that shows nothing at all (an empty cover wrapper)
    // adds no page, and its contents entry points at the next chapter.
    let keep = laid.pages.length;
    while (keep > 0 && isBlankPage(laid.pages[keep - 1])) keep -= 1;
    for (let i = 0; i < keep; i += 1) {
      pages.push({ kind: 'flow', width: PAGE_WIDTH, height: PAGE_HEIGHT, section: s, ...laid.pages[i] });
    }
    for (const [id, at] of laid.anchors) {
      anchors.set(`${s}#${id}`, { page: sectionStart[s] + Math.min(at.page, Math.max(0, keep - 1)), y: at.y });
    }
    // eslint-disable-next-line no-await-in-loop
    if (s % 2 === 1) await yieldToUi();
  }
  onProgress?.({ done: total, total });

  if (!pages.length) {
    pages.push({ kind: 'flow', width: PAGE_WIDTH, height: PAGE_HEIGHT, section: 0, words: [], images: [], boxes: [], links: [] });
  }
  return { pages, sectionStart, anchors };
}

async function paginatePictures(book, { onProgress, signal } = {}) {
  const pages = [];
  const sectionStart = [];
  const total = book.sectionCount;
  for (let s = 0; s < total; s += 1) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (s % 16 === 0) onProgress?.({ done: s, total });
    sectionStart[s] = pages.length;
    const chapter = book.loadSection(s);
    const href = chapter.href || book.sections[s]?.href;
    const path = book.format === 'image' ? 'image:0' : href;
    let size = null;
    try { size = imageSizeOf(book.source.resource(path)?.bytes); } catch { size = null; }
    if (!size) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const img = await loadImage(book.resourceUrl(path));
        size = { width: img.naturalWidth, height: img.naturalHeight };
      } catch { size = null; }
    }
    const { width, height } = fixedPageSize(size?.width, size?.height);
    pages.push({ kind: 'picture', width, height, section: s, path, pixels: size });
  }
  onProgress?.({ done: total, total });
  return { pages, sectionStart, anchors: new Map() };
}

async function paginateDjvu(book, { onProgress } = {}) {
  const { djvuPageSize } = await import('./djvu.js');
  const pages = [];
  const total = book.sectionCount;
  for (let s = 0; s < total; s += 1) {
    if (s % 32 === 0) onProgress?.({ done: s, total });
    const size = djvuPageSize(book.djvu, s);
    pages.push({ kind: 'djvu', width: size.width, height: size.height, section: s, index: s, dpi: size.dpi });
  }
  onProgress?.({ done: total, total });
  return { pages, sectionStart: pages.map((_, i) => i), anchors: new Map() };
}

// ── Painting ──

function paintFlow(ctx, page) {
  for (const box of page.boxes) {
    if (box.fill) {
      ctx.fillStyle = box.fill;
      ctx.fillRect(box.x, box.y, box.w, box.h);
    }
    for (const s of box.sides) {
      if (!(s.width > 0)) continue;
      ctx.fillStyle = s.color || '#999';
      if (s.side === 'Top') ctx.fillRect(box.x, box.y, box.w, s.width);
      else if (s.side === 'Bottom') ctx.fillRect(box.x, box.y + box.h - s.width, box.w, s.width);
      else if (s.side === 'Left') ctx.fillRect(box.x, box.y, s.width, box.h);
      else ctx.fillRect(box.x + box.w - s.width, box.y, s.width, box.h);
    }
  }
  for (const im of page.images) {
    try { ctx.drawImage(im.img, im.x, im.y, im.w, im.h); } catch { /* a picture that went away paints nothing */ }
  }
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  let font = '';
  let color = '';
  for (const w of page.words) {
    if (w.style.font !== font) { font = w.style.font; ctx.font = font; }
    if (w.style.color !== color) { color = w.style.color; ctx.fillStyle = color; }
    const measured = ctx.measureText(w.str).width;
    // The browser set the word this wide; a canvas font that comes out wider
    // is squeezed to fit, so neighbours never overlap.
    if (measured > w.w * 1.03 + 0.5) {
      ctx.save();
      ctx.translate(w.x, w.baseline);
      ctx.scale(w.w / measured, 1);
      ctx.fillText(w.str, 0, 0);
      ctx.restore();
    } else {
      ctx.fillText(w.str, w.x, w.baseline);
    }
    if (w.style.underline || w.style.strike) {
      const thick = Math.max(0.6, w.style.size / 16);
      if (w.style.underline) ctx.fillRect(w.x, w.baseline + thick * 1.6, w.w, thick);
      if (w.style.strike) ctx.fillRect(w.x, w.baseline - w.style.size * 0.3, w.w, thick);
    }
  }
}

// ── The document ──

/**
 * Opens an e-book as a pdf.js-shaped document.
 *
 * @param {object} options `data`, `name`, `onProgress({done,total})`, `signal`
 * @returns {Promise<object>} an object with pdf.js's PDFDocumentProxy surface
 */
export async function openEbookDocument({
  data, name = '', path = '', onProgress, signal, fontSize = DEFAULT_FONT_SIZE,
} = {}) {
  const book = await openBook({ data, name, path, size: data?.length || 0 });
  const size = clampFontSize(fontSize);
  let layout;
  try {
    if (book.format === 'djvu') layout = await paginateDjvu(book, { onProgress });
    else if (!book.reflowable) layout = await paginatePictures(book, { onProgress, signal });
    else layout = await paginateReflowable(book, { onProgress, signal, fontSize: size });
  } catch (err) {
    book.destroy();
    throw err;
  }
  return makeDocument(book, layout, { fontSize: book.reflowable ? size : null });
}

/**
 * The same place in the book after it was laid out again (a new font size):
 * the chapter, and how far through it, carry over; the page number does not.
 */
export function pageAfterRelayout(oldDoc, newDoc, pageNumber) {
  if (!oldDoc?.locate || !newDoc?.pageForLocation) return pageNumber;
  return newDoc.pageForLocation(oldDoc.locate(pageNumber));
}

function makeDocument(book, { pages, sectionStart, anchors }, { fontSize = null } = {}) {
  const pictureCache = new Map();     // path → Promise<HTMLImageElement>
  const djvuCache = new Map();        // `${index}@${dpi}` → canvas
  const textCache = new Map();
  let destroyed = false;

  const pageOfSection = (section) => {
    if (section == null || !Number.isFinite(section)) return null;
    const at = sectionStart[section];
    return Number.isFinite(at) ? Math.min(at, pages.length - 1) : null;
  };

  // An explicit destination, the form pdf.js resolves without a lookup:
  // [pageIndex, { name: 'XYZ' }, left, top] with `top` from the page bottom.
  const destFor = (section, anchor) => {
    if (anchor) {
      const hit = anchors.get(`${section}#${anchor}`);
      if (hit) {
        const h = pages[hit.page]?.height || PAGE_HEIGHT;
        return [hit.page, { name: 'XYZ' }, 0, Math.max(0, h - Math.max(0, hit.y - 16)), null];
      }
    }
    const index = pageOfSection(section);
    return index == null ? null : [index, { name: 'Fit' }];
  };

  const getPicture = (path) => {
    if (!pictureCache.has(path)) {
      pictureCache.set(path, loadImage(book.resourceUrl(path)).catch((err) => {
        pictureCache.delete(path);
        throw err;
      }));
      // Comics run to hundreds of pages; only the pictures near the reader stay.
      if (pictureCache.size > 24) pictureCache.delete(pictureCache.keys().next().value);
    }
    return pictureCache.get(path);
  };

  const djvuBitmap = async (page, deviceScale) => {
    const { djvuPagePixels, DJVU_UNIT_DPI } = await import('./djvu.js');
    // Decoded at twice the screen's resolution and drawn down with smoothing:
    // a scan decoded at screen resolution is bilevel and its text comes out
    // jagged. Bucketed, so a zoom by a few percent reuses the last decode.
    const dpi = Math.max(24, Math.round((DJVU_UNIT_DPI * deviceScale * 2) / 12) * 12);
    const key = `${page.index}@${dpi}`;
    if (djvuCache.has(key)) return djvuCache.get(key);
    const px = djvuPagePixels(book.djvu, page.index, dpi);
    const canvas = document.createElement('canvas');
    canvas.width = px.width;
    canvas.height = px.height;
    canvas.getContext('2d').putImageData(new ImageData(px.data, px.width, px.height), 0, 0);
    djvuCache.set(key, canvas);
    if (djvuCache.size > 6) djvuCache.delete(djvuCache.keys().next().value);
    return canvas;
  };

  const djvuWords = async (page) => {
    if (!page.words) {
      const { djvuPageWords } = await import('./djvu.js');
      page.words = djvuPageWords(book.djvu, page.index);
    }
    return page.words;
  };

  function textContentOf(page) {
    const items = [];
    const styles = {};
    const H = page.height;

    const pushRun = (list) => {
      for (let i = 0; i < list.length; i += 1) {
        const w = list[i];
        const next = list[i + 1];
        styles[w.fontName] = styles[w.fontName] || { fontFamily: w.family, ascent: w.ascentRatio, descent: -w.descentRatio, vertical: false };
        const sameLine = next && Math.abs(next.baseline - w.baseline) < w.size * 0.5 && next.x >= w.x + w.w - 1;
        items.push({
          str: w.str,
          dir: 'ltr',
          width: w.w,
          height: w.size,
          transform: [w.size, 0, 0, w.size, w.x, H - w.baseline],
          fontName: w.fontName,
          hasEOL: !sameLine,
        });
        // A space where the browser left one, so selected and searched text
        // reads as words, not one run-on string.
        if (sameLine && next.x - (w.x + w.w) > w.size * 0.12) {
          items.push({
            str: ' ',
            dir: 'ltr',
            width: next.x - (w.x + w.w),
            height: w.size,
            transform: [w.size, 0, 0, w.size, w.x + w.w, H - w.baseline],
            fontName: w.fontName,
            hasEOL: false,
          });
        }
      }
    };

    if (page.kind === 'flow') {
      pushRun(page.words.map((w) => ({
        str: w.str,
        x: w.x,
        w: w.w,
        baseline: w.baseline,
        size: w.style.size,
        family: w.style.family,
        fontName: w.style.fontName,
        ascentRatio: w.style.ascent / w.style.size,
        descentRatio: w.style.descent / w.style.size,
      })));
    } else if (page.kind === 'djvu' && page.words) {
      pushRun(page.words.map((z) => ({
        str: z.t,
        x: z.x,
        w: z.w,
        baseline: z.y + z.h * 0.8,
        size: Math.max(4, z.h),
        family: 'sans-serif',
        fontName: 'ebk_ocr',
        ascentRatio: 0.8,
        descentRatio: 0.2,
      })));
    }
    return { items, styles, lang: book.meta?.language || null };
  }

  function makePage(index) {
    const page = pages[index];
    const viewBox = [0, 0, page.width, page.height];
    return {
      isEbook: true,
      pageNumber: index + 1,
      _pageIndex: index,
      rotate: 0,
      view: viewBox,
      userUnit: 1,
      ref: { num: index, gen: 0 },
      getViewport({ scale = 1, rotation = 0, offsetX = 0, offsetY = 0, dontFlip = false } = {}) {
        return new EbookViewport({ viewBox, scale, rotation, offsetX, offsetY, dontFlip });
      },
      /** Decodes what the page paints from, before its canvas is cleared. */
      async prepare({ scale = 1, dpr = 1 } = {}) {
        if (page.kind === 'picture') await getPicture(page.path).catch(() => null);
        if (page.kind === 'djvu') await djvuBitmap(page, (scale || 1) * (dpr || 1));
      },
      render({ canvasContext: ctx, viewport, transform = null, background = '#ffffff' }) {
        let cancelled = false;
        const promise = (async () => {
          // Fetched before the canvas is touched, so a page in the middle of
          // a turn is never left half-cleared while a picture loads.
          let picture = null;
          if (page.kind === 'picture') picture = await getPicture(page.path);
          if (page.kind === 'djvu') {
            const device = (viewport.scale || 1) * (transform ? Math.hypot(transform[0], transform[1]) : 1);
            picture = await djvuBitmap(page, device);
          }
          if (cancelled) throw cancelledError();
          ctx.save();
          try {
            if (transform) ctx.transform(...transform);
            ctx.transform(...viewport.transform);
            // Back to the top-left origin the display lists are measured in.
            ctx.transform(1, 0, 0, -1, 0, page.height);
            ctx.fillStyle = background || '#ffffff';
            ctx.fillRect(0, 0, page.width, page.height);
            if (picture) {
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = 'high';
              ctx.drawImage(picture, 0, 0, page.width, page.height);
            } else if (page.kind === 'flow') {
              paintFlow(ctx, page);
            }
          } finally {
            ctx.restore();
          }
        })();
        return {
          promise,
          cancel() { cancelled = true; },
        };
      },
      async getTextContent() {
        if (page.kind === 'djvu') await djvuWords(page);
        if (!textCache.has(index)) textCache.set(index, textContentOf(page));
        return textCache.get(index);
      },
      async getAnnotations() {
        if (page.kind !== 'flow') return [];
        const H = page.height;
        return page.links.map((l, i) => {
          const dest = l.url ? null : destFor(l.section, l.anchor);
          if (!l.url && !dest) return null;
          return {
            id: `ebk-link-${index}-${i}`,
            annotationType: 2,
            subtype: 'Link',
            rect: [l.x, H - (l.y + l.h), l.x + l.w, H - l.y],
            dest,
            url: l.url || null,
          };
        }).filter(Boolean);
      },
      async getOperatorList() {
        return { fnArray: [], argsArray: [], lastChunk: true };
      },
      /** Pictures on the page, in page units from the top-left corner. */
      ebookImages() {
        if (page.kind === 'picture' || page.kind === 'djvu') {
          return [{ id: `page-${index + 1}`, x: 0, y: 0, w: page.width, h: page.height, whole: true }];
        }
        return page.images.map((im, i) => ({ id: `img-${index + 1}-${i}`, x: im.x, y: im.y, w: im.w, h: im.h, img: im.img }));
      },
      /** One picture at its full resolution, as a PNG data URL. */
      async ebookImageDataUrl(id) {
        let source = null;
        let width = 0;
        let height = 0;
        if (page.kind === 'picture') {
          source = await getPicture(page.path);
          width = source.naturalWidth; height = source.naturalHeight;
        } else if (page.kind === 'djvu') {
          source = await djvuBitmap(page, 300 / 72);
          width = source.width; height = source.height;
        } else {
          const im = page.images.find((_, i) => `img-${index + 1}-${i}` === id);
          if (!im) return null;
          source = im.img;
          width = im.img.naturalWidth || Math.round(im.w);
          height = im.img.naturalHeight || Math.round(im.h);
        }
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
        return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
      },
      cleanup() { /* the display list is kept for the life of the document */ },
    };
  }

  const outline = () => {
    const walk = (entries) => (entries || []).map((e) => ({
      title: e.label || '',
      dest: destFor(e.section, e.anchor),
      url: null,
      items: walk(e.children),
      bold: false,
      italic: false,
      color: null,
      count: 0,
    }));
    return walk(book.toc);
  };

  const meta = book.meta || {};
  // Pages of each chapter: [first index, one past the last].
  const sectionSpan = (section) => {
    const from = sectionStart[section] ?? 0;
    let to = pages.length;
    for (let s = section + 1; s < sectionStart.length; s += 1) {
      if (Number.isFinite(sectionStart[s])) { to = sectionStart[s]; break; }
    }
    return [from, Math.max(from + 1, to)];
  };

  return {
    isEbook: true,
    format: book.format,
    formatLabel: book.formatLabel,
    /** True for a book the reader lays out itself, where the font size applies. */
    reflowable: !!book.reflowable && book.format !== 'djvu',
    /** The font size the pages were laid out at; null for fixed-layout books. */
    fontSize,
    numPages: pages.length,
    /** Where a page is in the book: its chapter, and the fraction of the way through it. */
    locate(pageNumber) {
      const i = Math.min(pages.length - 1, Math.max(0, (pageNumber || 1) - 1));
      const section = pages[i]?.section ?? 0;
      const [from, to] = sectionSpan(section);
      return { section, frac: (i - from) / Math.max(1, to - from) };
    },
    /** The page that shows a location from locate(). */
    pageForLocation(loc) {
      if (!loc || !Number.isFinite(loc.section)) return 1;
      const [from, to] = sectionSpan(Math.min(loc.section, sectionStart.length - 1));
      const i = from + Math.floor((Number(loc.frac) || 0) * (to - from) + 1e-6);
      return Math.min(pages.length, Math.max(1, Math.min(i, to - 1) + 1));
    },
    fingerprints: [`ebook-${book.format}-${book.fileSize}-${pages.length}`],
    book,
    async getPage(n) {
      if (destroyed) throw new Error('The document has been closed.');
      const i = Math.trunc(Number(n)) - 1;
      if (!(i >= 0 && i < pages.length)) throw new Error(`Invalid page request: ${n}`);
      return makePage(i);
    },
    async getOutline() {
      const list = outline();
      return list.length ? list : null;
    },
    async getDestination() { return null; },
    async getPageIndex(ref) { return Number(ref?.num) || 0; },
    async getPageLabels() { return null; },
    async getMetadata() {
      return {
        info: {
          Title: meta.title || '',
          Author: meta.author || '',
          Subject: meta.subject || meta.description || '',
          Keywords: '',
          Creator: '',
          Producer: '',
          Publisher: meta.publisher || '',
          CreationDate: meta.date || '',
          ModDate: '',
          PDFFormatVersion: '',
          IsEncrypted: false,
          Language: meta.language || '',
          EbookFormat: book.formatLabel || '',
        },
        metadata: null,
      };
    },
    /** Chapters as the book lists them, flattened, for anything that wants them. */
    tocRows() { return flattenToc(book.toc); },
    /** Raw bytes are never asked of an e-book: it is not saved back as a PDF. */
    async getData() { throw new Error('An e-book is not a PDF and cannot be saved as one.'); },
    async cleanup() { /* nothing cached that matters */ },
    async destroy() {
      if (destroyed) return;
      destroyed = true;
      pictureCache.clear();
      djvuCache.clear();
      textCache.clear();
      book.destroy();
    },
    _linkColor: LINK_COLOR,
  };
}

/**
 * A small picture of an e-book's first page, without paginating the whole
 * book: the cover when the book names one, otherwise its first chapter.
 */
export async function renderEbookThumb(data, name, { width = 320, quality = 0.75 } = {}) {
  const book = await openBook({ data, name });
  try {
    const cover = book.format === 'djvu' ? '' : book.cover();
    if (cover) {
      const img = await loadImage(cover);
      const h = Math.round((width * img.naturalHeight) / Math.max(1, img.naturalWidth));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = Math.max(1, h);
      const ctx = canvas.getContext('2d', { alpha: false });
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', quality);
    }
    // One chapter is enough for page 1; a fake book of just that chapter is
    // paginated rather than the whole thing.
    const first = {
      ...book,
      sectionCount: Math.min(book.sectionCount, book.reflowable ? 3 : 1),
      destroy() {},
    };
    let layout;
    if (book.format === 'djvu') layout = await paginateDjvu({ ...first, sectionCount: 1 });
    else if (!book.reflowable) layout = await paginatePictures(first);
    else layout = await paginateReflowable(first);
    const doc = makeDocument(first, layout);
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const view = page.getViewport({ scale: width / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(view.width));
    canvas.height = Math.max(1, Math.floor(view.height));
    const ctx = canvas.getContext('2d', { alpha: false });
    await page.render({ canvasContext: ctx, viewport: view, background: '#ffffff' }).promise;
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    book.destroy();
  }
}

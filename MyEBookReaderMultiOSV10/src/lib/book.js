// One book interface over every format the reader opens.
//
// Each format module (epub.js, mobi.js, fb2.js, cbz.js, plaintext.js, pdf.js)
// knows only about its own file layout. This is what the rest of the app talks
// to: a book has metadata, a list of sections, a table of contents, and a
// `loadSection(i)` that hands back something renderable. Whether that is
// reflowable HTML, a comic page or a PDF page is the only difference the
// reading view has to care about.
import { openEpub, looksLikeEpub } from './epub.js';
import { openMobi, looksLikeMobi } from './mobi.js';
import { openFb2, looksLikeFb2 } from './fb2.js';
import { openCbz, looksLikeCbz, isCbr } from './cbz.js';
import { openTextBook } from './plaintext.js';
import { openImageBook, IMAGE_EXTENSIONS, looksLikeImage, isImageName } from './imagebook.js';
import { looksLikeDjvu } from './djvumagic.js';
import { looksLikeZip } from './zip.js';

export const FORMATS = [
  { id: 'epub', label: 'EPUB', ext: ['epub'], reflowable: true },
  { id: 'pdf', label: 'PDF', ext: ['pdf'], reflowable: false },
  { id: 'djvu', label: 'DjVu', ext: ['djvu', 'djv'], reflowable: false },
  { id: 'mobi', label: 'MOBI', ext: ['mobi', 'prc', 'azw', 'azw3'], reflowable: true },
  { id: 'fb2', label: 'FictionBook', ext: ['fb2'], reflowable: true },
  { id: 'cbz', label: 'Comic book', ext: ['cbz', 'cbr'], reflowable: false },
  { id: 'md', label: 'Markdown', ext: ['md', 'markdown', 'mdown'], reflowable: true },
  { id: 'html', label: 'HTML', ext: ['html', 'htm', 'xhtml'], reflowable: true },
  { id: 'txt', label: 'Text', ext: ['txt', 'text', 'log'], reflowable: true },
  { id: 'image', label: 'Image', ext: IMAGE_EXTENSIONS, reflowable: false },
];

/** Every extension the open dialog offers, in one list. */
export const BOOK_EXTENSIONS = FORMATS.flatMap((f) => f.ext);

export const LIBRARY_EXT = 'ebkr';

export function formatById(id) {
  return FORMATS.find((f) => f.id === id) || null;
}

export function extensionOf(name) {
  const match = /\.([A-Za-z0-9]+)$/.exec(String(name || ''));
  return match ? match[1].toLowerCase() : '';
}

export function isBookName(name) {
  const ext = extensionOf(name);
  return !!ext && BOOK_EXTENSIONS.includes(ext);
}

export function isLibraryName(name) {
  return extensionOf(name) === LIBRARY_EXT;
}

/**
 * Works out which reader a file needs.
 *
 * The name is only a hint: a mislabelled file is common enough (a .epub that is
 * really a PDF, a .txt that is really HTML) that the bytes decide wherever they
 * can, and the extension only breaks ties — ZIP, for instance, is both EPUB and
 * CBZ, and plain text is both Markdown and TXT.
 */
export function detectFormat(data, name = '') {
  const ext = extensionOf(name);

  if (data && data.length > 4) {
    const head = new TextDecoder('latin1').decode(data.subarray(0, Math.min(2048, data.length)));
    if (head.includes('%PDF-')) return 'pdf';
    if (looksLikeDjvu(data)) return 'djvu';
    if (looksLikeMobi(data, '')) return 'mobi';
    // A picture is recognised from its own magic, so a photo named .txt still
    // opens as a photo — except for SVG, which is XML and is named, not sniffed.
    if (ext !== 'svg' && looksLikeImage(data, '')) return 'image';
    if (looksLikeZip(data)) {
      if (looksLikeEpub(data, '')) return 'epub';
      if (ext === 'cbz' || ext === 'cbr' || ext === 'zip') return 'cbz';
      if (ext === 'epub') return 'epub';
      // A zip that is neither: let the EPUB reader try, it reports clearly.
      return 'epub';
    }
    if (looksLikeFb2(data, '')) return 'fb2';
  }

  if (isImageName(name)) return 'image';

  if (ext && FORMATS.some((f) => f.ext.includes(ext))) {
    return FORMATS.find((f) => f.ext.includes(ext)).id;
  }

  if (data && data.length) {
    const head = new TextDecoder('latin1').decode(data.subarray(0, Math.min(2048, data.length))).toLowerCase();
    if (head.includes('<html') || head.includes('<!doctype html')) return 'html';
  }
  return 'txt';
}

// Object URLs are how a book's own images reach the DOM. They are cached per
// book and revoked together when the book closes, so opening and closing a
// comic a hundred times does not leak a hundred page bitmaps.
function makeResourceUrls(source) {
  const urls = new Map();

  const create = (bytes, mime) => {
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && typeof Blob !== 'undefined') {
      return URL.createObjectURL(new Blob([bytes], { type: mime }));
    }
    // No Blob support (a headless test run): a data URL is slower but works.
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const base64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64');
    return `data:${mime};base64,${base64}`;
  };

  return {
    url(path) {
      if (!path) return '';
      if (urls.has(path)) return urls.get(path);
      let value = '';
      try {
        const resource = source.resource(path);
        if (resource?.bytes) value = create(resource.bytes, resource.mime || 'application/octet-stream');
      } catch { value = ''; }
      urls.set(path, value);
      return value;
    },
    release() {
      if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        for (const value of urls.values()) {
          if (value && value.startsWith('blob:')) URL.revokeObjectURL(value);
        }
      }
      urls.clear();
    },
  };
}

function wrap(source, { name, path, size }) {
  const resources = makeResourceUrls(source);
  const format = formatById(source.format) || { id: source.format, label: source.format, reflowable: true };

  return {
    format: source.format,
    // A reader that knows more about the file than its extension does can say
    // so — a KF8 book is not the same thing as the MOBI its extension implies.
    formatLabel: source.formatLabel || format.label,
    reflowable: format.reflowable !== false,
    fileName: name || '',
    filePath: path || '',
    fileSize: size || 0,
    meta: { ...source.meta, title: source.meta?.title || String(name || '').replace(/\.[^.]+$/, '') },
    sections: source.sections,
    sectionCount: source.sections.length,
    toc: source.toc || [],
    loadSection(index) {
      return source.loadSection(index, { resolveSrc: (p) => resources.url(p) });
    },
    sectionText(index) {
      return source.sectionText ? source.sectionText(index) : '';
    },
    /** Text of a section, reading it first when the format needs that (PDF). */
    async readSectionText(index) {
      if (source.readSectionText) return source.readSectionText(index);
      return source.sectionText ? source.sectionText(index) : '';
    },
    /** The pdf.js document, for the fixed-layout renderer. Null otherwise. */
    pdf: source.pdf || null,
    /** The DjVu document, for the fixed-layout renderer. Null otherwise. */
    djvu: source.djvu || null,
    /** Pixel size of a picture, for the properties panel. Null otherwise. */
    imageInfo() { return source.imageInfo ? source.imageInfo() : null; },
    resourceUrl(p) {
      return resources.url(p);
    },
    cover() {
      return source.coverPath ? resources.url(source.coverPath) : '';
    },
    destroy() {
      resources.release();
      source.destroy?.();
    },
    source,
  };
}

/**
 * Opens a book from raw bytes.
 *
 * @param {object} options
 *   - `data`       the file bytes
 *   - `name`       file name (used for format hints and the title fallback)
 *   - `path`       absolute path, when there is one
 *   - `onProgress` ({done,total}) while a PDF is parsed
 *   - `onPassword` (retry, reason) for an encrypted PDF
 * @returns {Promise<object>} the book
 */
export async function openBook({ data, name = '', path = '', size = 0, onProgress, onPassword } = {}) {
  if (!data || !data.length) throw new Error('There is nothing to open — the file is empty.');
  const format = detectFormat(data, name);

  if (format === 'cbz' && isCbr(data, name)) {
    throw new Error('This comic is a RAR archive (.cbr). Re-save it as .cbz (a ZIP archive) and open that instead.');
  }

  let source;
  switch (format) {
    case 'epub':
      source = openEpub(data);
      break;
    case 'mobi':
      source = openMobi(data);
      break;
    case 'fb2':
      source = openFb2(data);
      break;
    case 'cbz':
      source = openCbz(data, { name });
      break;
    case 'pdf': {
      // Loaded on demand: pdf.js and its worker are by far the heaviest part of
      // the bundle, and a reader that only opens EPUBs should never pay for it.
      const { openPdfBook } = await import('./pdfbook.js');
      source = await openPdfBook(data, { name, onProgress, onPassword });
      break;
    }
    case 'djvu': {
      // The decoder is WebAssembly and is only fetched when a DjVu is opened.
      const { openDjvuBook } = await import('./djvubook.js');
      source = await openDjvuBook(data, { name });
      break;
    }
    case 'image':
      source = openImageBook(data, { name });
      break;
    case 'md':
    case 'html':
    case 'txt':
      source = openTextBook(data, { kind: format, name });
      break;
    default:
      throw new Error(`"${name}" is in a format this reader does not know how to open.`);
  }

  return wrap(source, { name, path, size: size || data.length });
}

/** Human-readable position: "Chapter 4 of 31". */
export function positionLabel(book, index) {
  if (!book) return '';
  return `${index + 1} / ${book.sectionCount}`;
}

/** Flattens a table of contents tree into rows with a depth, for the panel. */
export function flattenToc(toc, depth = 0, out = []) {
  for (const entry of toc || []) {
    out.push({ ...entry, depth });
    if (entry.children?.length) flattenToc(entry.children, depth + 1, out);
  }
  return out;
}

/** The contents entry that covers a section — what to highlight in the panel. */
export function tocEntryForSection(toc, index) {
  const rows = flattenToc(toc);
  let best = null;
  for (const row of rows) {
    if (row.section == null) continue;
    if (row.section <= index && (!best || row.section >= best.section)) best = row;
  }
  return best;
}

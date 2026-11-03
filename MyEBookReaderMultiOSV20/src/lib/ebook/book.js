// One book interface over every e-book format the reader opens besides PDF.
//
// Each format module (epub.js, mobi.js, fb2.js, cbz.js, plaintext.js,
// imagebook.js, djvu.js) knows only about its own file layout. This is what
// document.js talks to: a book has metadata, a list of sections, a table of
// contents, and a `loadSection(i)` that hands back something to lay out —
// reflowable HTML, one picture, or one DjVu page.
//
// PDF is not here: pdf.js opens it directly, and everything else is turned
// into pages that look to the viewer exactly like a PDF's.
import { openEpub, looksLikeEpub } from './epub.js';
import { openMobi, looksLikeMobi } from './mobi.js';
import { openFb2, looksLikeFb2 } from './fb2.js';
import { openCbz, isCbr } from './cbz.js';
import { openTextBook } from './plaintext.js';
import { openImageBook, IMAGE_EXTENSIONS, looksLikeImage, isImageName } from './imagebook.js';
import { looksLikeDjvu } from './djvumagic.js';
import { looksLikeZip, readZip, readEntry } from './zip.js';
import { openPictureFolder } from './picturefolder.js';

// Amazon's own formats (.azw, .azw3, .kf8, .prc) are all the MOBI container:
// a Palm database holding a MOBI 6 book, a KF8 book, or both. .kfx is a
// different, DRM-only container and is refused with a clear message.
export const FORMATS = [
  { id: 'epub', label: 'EPUB', ext: ['epub'], reflowable: true },
  { id: 'mobi', label: 'MOBI', ext: ['mobi', 'prc', 'pdb', 'azw', 'azw3', 'kf8'], reflowable: true },
  { id: 'djvu', label: 'DjVu', ext: ['djvu', 'djv'], reflowable: false },
  { id: 'fb2', label: 'FictionBook', ext: ['fb2'], reflowable: true },
  { id: 'cbz', label: 'Comic book', ext: ['cbz', 'cbr'], reflowable: false },
  { id: 'md', label: 'Markdown', ext: ['md', 'markdown', 'mdown'], reflowable: true },
  { id: 'html', label: 'HTML', ext: ['html', 'htm', 'xhtml'], reflowable: true },
  { id: 'txt', label: 'Text', ext: ['txt', 'text'], reflowable: true },
  { id: 'image', label: 'Image', ext: IMAGE_EXTENSIONS, reflowable: false },
];

/** Every extension opened as an e-book (PDF is listed separately). */
export const EBOOK_EXTENSIONS = FORMATS.flatMap((f) => f.ext);

/** Everything the open dialog and the folder tree offer. */
export const BOOK_EXTENSIONS = ['pdf', ...EBOOK_EXTENSIONS];

/** What the reader can actually read, for the About window: PDF first, then
 * the e-book formats. .cbr is left out — a RAR comic is refused with a hint. */
export const SUPPORTED_FORMATS = [
  { id: 'pdf', ext: ['pdf'], reflowable: false },
  ...FORMATS.map((f) => ({ id: f.id, ext: f.ext.filter((e) => e !== 'cbr'), reflowable: f.reflowable })),
];

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

/** NUL bytes near the start: a binary file, not text in any encoding but UTF-16. */
function looksBinary(data) {
  const n = Math.min(4096, data.length);
  if (n >= 2 && ((data[0] === 0xff && data[1] === 0xfe) || (data[0] === 0xfe && data[1] === 0xff))) return false;
  let zeros = 0;
  for (let i = 0; i < n; i += 1) if (data[i] === 0) zeros += 1;
  return zeros > 0;
}

function looksLikeFb2Zip(data, name) {
  return /\.fb2\.zip$/i.test(name) && looksLikeZip(data);
}

/**
 * Works out which reader a file needs.
 *
 * The name is only a hint: a mislabelled file is common enough (a .epub that is
 * really a MOBI, a .txt that is really HTML) that the bytes decide wherever they
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
    if (ext === 'kfx' || head.startsWith('CONT') || head.startsWith('\xeaDRMION')) return 'kfx';
    // A picture is recognised from its own magic, so a photo named .txt still
    // opens as a photo — except for SVG, which is XML and is named, not sniffed.
    if (ext !== 'svg' && looksLikeImage(data, '')) return 'image';
    if (looksLikeZip(data)) {
      if (looksLikeEpub(data, '')) return 'epub';
      if (looksLikeFb2Zip(data, name)) return 'fb2';
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
    // A source not tied to an extension (a folder of pictures) says itself.
    reflowable: typeof source.reflowable === 'boolean' ? source.reflowable : format.reflowable !== false,
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
    /** The DjVu document, for the page painter. Null otherwise. */
    djvu: source.djvu || null,
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
 *   - `data`  the file bytes
 *   - `name`  file name (used for format hints and the title fallback)
 *   - `path`  absolute path, when there is one
 * @returns {Promise<object>} the book
 */
export async function openBook({ data, name = '', path = '', size = 0 } = {}) {
  if (!data || !data.length) throw new Error('There is nothing to open — the file is empty.');
  const format = detectFormat(data, name);

  // Anything unrecognised falls through to plain text; a file that is plainly
  // not text (a program, an archive, a video) is refused rather than shown as
  // a page of noise.
  if (format === 'txt' && !EBOOK_EXTENSIONS.includes(extensionOf(name)) && looksBinary(data)) {
    throw new Error(`"${name}" is not a book or document this reader can open. Supported formats: PDF, EPUB, MOBI, AZW, AZW3, DjVu, FB2, CBZ, TXT, Markdown, HTML and pictures.`);
  }

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
      source = openFb2(looksLikeFb2Zip(data, name) ? await unzipFb2(data) : data);
      break;
    case 'cbz':
      source = openCbz(data, { name });
      break;
    case 'djvu': {
      // The decoder is WebAssembly and is only fetched when a DjVu is opened.
      const { openDjvuBook } = await import('./djvu.js');
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
    case 'kfx':
      throw new Error('This is a KFX book (Amazon\'s newer Kindle format). KFX files are DRM-protected and cannot be read outside a Kindle app. Download the book as AZW3 or MOBI, or convert it to EPUB, and open that instead.');
    case 'pdf':
      throw new Error('PDF files are opened by the PDF reader, not the e-book reader.');
    default:
      throw new Error(`"${name}" is in a format this reader does not know how to open.`);
  }

  return wrap(source, { name, path, size: size || data.length });
}

/**
 * Opens a folder of pictures (or an extracted archive of them) as a book.
 *
 * @param {object} options
 *   - `name`  the folder or archive name (the title)
 *   - `path`  what the book is known by: the folder, or the archive it came from
 *   - `pages` [{ name, bytes }] — see pictureFilesOf in ./picturefolder.js
 */
export function openPictureFolderBook({ name = '', path = '', pages = [] } = {}) {
  const source = openPictureFolder({ name, pages });
  const size = pages.reduce((n, p) => n + (p.bytes?.length || 0), 0);
  return wrap(source, { name, path, size });
}

// "book.fb2.zip" is how most FictionBook libraries ship their files: the one
// .fb2 inside is the book.
async function unzipFb2(data) {
  const zip = readZip(data);
  const entry = zip.entries.find((e) => !e.directory && /\.fb2$/i.test(e.name));
  if (!entry) throw new Error('This archive has no .fb2 file inside it.');
  return readEntry(zip, entry);
}

/** Flattens a table of contents tree into rows with a depth. */
export function flattenToc(toc, depth = 0, out = []) {
  for (const entry of toc || []) {
    out.push({ ...entry, depth });
    if (entry.children?.length) flattenToc(entry.children, depth + 1, out);
  }
  return out;
}

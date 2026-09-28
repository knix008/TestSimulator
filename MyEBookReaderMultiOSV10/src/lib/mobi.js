// MOBI / PRC / AZW reader (Palm database container).
//
// Layout: a Palm database holds numbered records. Record 0 carries the PalmDOC
// header (how the text is compressed and how long it is) followed by the MOBI
// header (encoding, metadata, where the images start) and the EXTH block (the
// catalogue metadata: author, publisher, description, cover). The records that
// follow hold the book text — one compressed chunk each — and after those come
// the images, stored as plain JPEG/PNG/GIF.
//
// Compression 1 (none) and 2 (PalmDOC LZ77) are read here. Compression 17480
// (HUFF/CDIC) is reported as unsupported rather than guessed at, so a book
// never opens as garbage.
import { sanitizeChapter, htmlToText } from './html.js';

const PALMDOC_NONE = 1;
const PALMDOC_LZ77 = 2;
const PALMDOC_HUFF = 17480;

function ascii(data, at, len) {
  return new TextDecoder('latin1').decode(data.subarray(at, at + len));
}

/** Palm database record table: [{ offset, length }] in file order. */
export function readPalmRecords(data) {
  if (!data || data.length < 78) throw new Error('This file is too small to be a MOBI/PRC database.');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const count = view.getUint16(76);
  if (!count) throw new Error('The Palm database contains no records.');
  if (78 + count * 8 > data.length) throw new Error('The Palm record table runs past the end of the file.');

  const offsets = [];
  for (let i = 0; i < count; i++) offsets.push(view.getUint32(78 + i * 8));
  const records = [];
  for (let i = 0; i < count; i++) {
    const start = offsets[i];
    const end = i + 1 < count ? offsets[i + 1] : data.length;
    records.push({ offset: start, length: Math.max(0, end - start), bytes: data.subarray(start, Math.max(start, end)) });
  }
  return records;
}

/** PalmDOC LZ77: literals, 2-byte back-references, and packed "space + char". */
export function palmDocDecompress(input) {
  const out = [];
  let i = 0;
  while (i < input.length) {
    const b = input[i++];
    if (b === 0) {
      out.push(0);
    } else if (b <= 8) {
      for (let n = 0; n < b && i < input.length; n++) out.push(input[i++]);
    } else if (b <= 0x7f) {
      out.push(b);
    } else if (b <= 0xbf) {
      if (i >= input.length) break;
      const b2 = input[i++];
      const pair = (b << 8) | b2;
      const distance = (pair >> 3) & 0x07ff;
      const length = (pair & 7) + 3;
      if (distance === 0 || distance > out.length) break;
      let from = out.length - distance;
      for (let n = 0; n < length; n++) out.push(out[from++]);
    } else {
      out.push(0x20, b ^ 0x80);
    }
  }
  return Uint8Array.from(out);
}

// Records may carry trailing multibyte / index data that is not part of the
// text. The flags in the MOBI header say how many such blocks to strip.
function trailingSize(bytes, flags) {
  let end = bytes.length;
  for (let bit = 1; bit < 16; bit++) {
    if (!(flags & (1 << bit))) continue;
    // A backwards-encoded variable-width integer gives the block's size.
    let value = 0;
    let shift = 0;
    let at = end - 1;
    for (let n = 0; n < 4 && at >= 0; n++, at--) {
      const byte = bytes[at];
      value |= (byte & 0x7f) << shift;
      shift += 7;
      if (byte & 0x80) break;
    }
    end -= Math.max(1, Math.min(value, end));
  }
  if (flags & 1) {
    if (end > 0) end -= (bytes[end - 1] & 3) + 1;
  }
  return Math.max(0, end);
}

function parseExth(data, at) {
  const out = new Map();
  if (at + 12 > data.length || ascii(data, at, 4) !== 'EXTH') return out;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const count = view.getUint32(at + 8);
  let p = at + 12;
  for (let i = 0; i < count && p + 8 <= data.length; i++) {
    const type = view.getUint32(p);
    const length = view.getUint32(p + 4);
    if (length < 8 || p + length > data.length) break;
    out.set(type, data.subarray(p + 8, p + length));
    p += length;
  }
  return out;
}

function decodeText(bytes, encoding) {
  try {
    return new TextDecoder(encoding === 1252 ? 'windows-1252' : 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

const IMAGE_MAGIC = [
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 },
  { mime: 'image/png', test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: 'image/gif', test: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 },
  { mime: 'image/bmp', test: (b) => b[0] === 0x42 && b[1] === 0x4d },
];

function imageMime(bytes) {
  if (!bytes || bytes.length < 8) return null;
  return IMAGE_MAGIC.find((m) => m.test(bytes))?.mime || null;
}

/**
 * Opens MOBI / PRC / AZW / AZW3 bytes.
 * @returns a book object with the same shape the EPUB reader produces.
 */
export function openMobi(data) {
  const records = readPalmRecords(data);
  const head = records[0].bytes;
  if (head.length < 16) throw new Error('The MOBI header record is too short.');
  const headView = new DataView(head.buffer, head.byteOffset, head.byteLength);

  const compression = headView.getUint16(0);
  const textLength = headView.getUint32(4);
  const textRecordCount = headView.getUint16(8);
  const encryption = headView.getUint16(12);

  if (encryption !== 0) {
    throw new Error('This book is DRM-protected (encryption type ' + encryption + '), so its text cannot be read.');
  }
  if (compression === PALMDOC_HUFF) {
    throw new Error('This MOBI uses HUFF/CDIC compression, which this reader does not decode. Convert the book to EPUB and open that instead.');
  }
  if (compression !== PALMDOC_NONE && compression !== PALMDOC_LZ77) {
    throw new Error(`Unknown MOBI compression type ${compression}.`);
  }

  let encoding = 65001;
  let firstImage = 0;
  let extraFlags = 0;
  let fullName = '';
  let exth = new Map();

  const hasMobiHeader = head.length > 20 && ascii(head, 16, 4) === 'MOBI';
  if (hasMobiHeader) {
    const headerLength = headView.getUint32(20);
    encoding = headView.getUint32(28);
    firstImage = head.length >= 112 ? headView.getUint32(108) : 0;
    const exthFlags = head.length >= 132 ? headView.getUint32(128) : 0;
    // "Extra record data flags" sits at offset 242 of record 0 and only exists
    // in headers at least 228 bytes long. Every offset in the MOBI header is
    // counted from the start of record 0, PalmDOC header included.
    if (headerLength >= 228 && head.length >= 244) extraFlags = headView.getUint16(242);
    if (exthFlags & 0x40) exth = parseExth(head, 16 + headerLength);
    if (head.length >= 92) {
      const nameOffset = headView.getUint32(84);
      const nameLength = headView.getUint32(88);
      if (nameOffset + nameLength <= head.length) {
        fullName = decodeText(head.subarray(nameOffset, nameOffset + nameLength), encoding).trim();
      }
    }
  }

  // ── Text ────────────────────────────────────────────────
  const chunks = [];
  let have = 0;
  for (let i = 1; i <= textRecordCount && i < records.length; i++) {
    let bytes = records[i].bytes;
    if (extraFlags) bytes = bytes.subarray(0, trailingSize(bytes, extraFlags));
    const piece = compression === PALMDOC_LZ77 ? palmDocDecompress(bytes) : bytes;
    chunks.push(piece);
    have += piece.length;
    if (textLength && have >= textLength) break;
  }
  const merged = new Uint8Array(have);
  let at = 0;
  for (const chunk of chunks) { merged.set(chunk, at); at += chunk.length; }
  const markup = decodeText(textLength ? merged.subarray(0, Math.min(textLength, merged.length)) : merged, encoding);

  // ── Images, addressed by recindex ───────────────────────
  const images = new Map();     // recindex (1-based) → { bytes, mime }
  if (firstImage > 0) {
    for (let i = firstImage; i < records.length; i++) {
      const mime = imageMime(records[i].bytes);
      if (mime) images.set(i - firstImage + 1, { bytes: records[i].bytes, mime });
    }
  }

  const exthText = (type) => {
    const bytes = exth.get(type);
    return bytes ? decodeText(bytes, encoding).trim() : '';
  };

  const meta = {
    title: exthText(503) || fullName || '',
    author: exthText(100),
    publisher: exthText(101),
    description: exthText(103),
    identifier: exthText(104),
    subject: exthText(105),
    date: exthText(106),
    language: exthText(524),
    rights: exthText(109),
  };

  // ── Chapters ────────────────────────────────────────────
  // MOBI is one long HTML stream. Page breaks mark the chapter boundaries;
  // where a book has none, the stream is cut into readable blocks instead so
  // the reader never has to lay out a megabyte of text at once.
  const parts = splitMobiText(markup);

  const sections = parts.map((part, index) => ({
    index,
    id: `mobi-${index}`,
    href: `#part-${index}`,
    kind: 'html',
    label: `${index + 1}`,
  }));

  return {
    format: 'mobi',
    meta,
    sections,
    toc: buildMobiToc(parts),
    coverPath: '',
    resource(path) {
      const m = /^recindex:(\d+)$/.exec(String(path || ''));
      if (!m) return null;
      return images.get(Number(m[1])) || null;
    },
    loadSection(index, { resolveSrc } = {}) {
      const source = parts[index];
      if (source == null) throw new Error(`This book has no section ${index + 1}.`);
      const cleaned = sanitizeChapter(source.html, {
        mime: 'text/html',
        resolveSrc: (href) => {
          const rec = /recindex=["']?(\d+)/i.exec(href) || /^(\d+)$/.exec(href);
          const key = rec ? `recindex:${Number(rec[1])}` : href;
          return resolveSrc ? resolveSrc(key) : key;
        },
        linkTarget: (href) => {
          const m = /filepos=(\d+)/i.exec(href) || /^#?(\d+)$/.exec(href);
          if (!m) return null;
          const target = sectionForFilepos(parts, Number(m[1]));
          return target == null ? null : { section: target, anchor: '' };
        },
      });
      return { kind: 'html', ...cleaned, index, href: sections[index].href };
    },
    sectionText(index) {
      return parts[index] ? htmlToText(parts[index].html) : '';
    },
  };
}

// MOBI images are referenced as <img recindex="00042">; the sanitizer is given
// the whole attribute string so both spellings resolve.
const PAGE_BREAK_SOURCE = '<mbp:pagebreak[^>]*>|<\\s*hr[^>]*class=["\'][^"\']*(?:page|chapter)[^"\']*["\'][^>]*>';
const MAX_PART_CHARS = 120000;

/** Cuts the single MOBI text stream into chapters at its page breaks. */
export function splitMobiText(markup) {
  const source = String(markup ?? '');
  const finder = new RegExp(PAGE_BREAK_SOURCE, 'gi');
  const bounds = [0];
  for (let match = finder.exec(source); match; match = finder.exec(source)) {
    // A break marker starts the chapter that follows it, and a zero-width match
    // would otherwise spin here forever.
    if (match.index > bounds[bounds.length - 1]) bounds.push(match.index);
    if (finder.lastIndex === match.index) finder.lastIndex++;
  }
  bounds.push(source.length);

  const pieces = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const html = source.slice(bounds[i], bounds[i + 1]);
    if (html.trim()) pieces.push({ start: bounds[i], html });
  }

  // No page breaks at all (or one enormous chapter): split on size instead,
  // preferring a paragraph boundary near the cut.
  const out = [];
  for (const piece of pieces) {
    if (piece.html.length <= MAX_PART_CHARS) {
      if (piece.html.trim()) out.push(piece);
      continue;
    }
    let offset = 0;
    while (offset < piece.html.length) {
      let end = Math.min(offset + MAX_PART_CHARS, piece.html.length);
      if (end < piece.html.length) {
        const boundary = piece.html.lastIndexOf('</p>', end);
        if (boundary > offset + MAX_PART_CHARS / 2) end = boundary + 4;
      }
      out.push({ start: piece.start + offset, html: piece.html.slice(offset, end) });
      offset = end;
    }
  }
  return out.length ? out : [{ start: 0, html: source }];
}

/** Which section holds a given byte position in the original stream. */
export function sectionForFilepos(parts, filepos) {
  if (!parts?.length) return null;
  let found = 0;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].start <= filepos) found = i;
    else break;
  }
  return found;
}

/** MOBI has no formal contents list, so the chapter headings become one. */
function buildMobiToc(parts) {
  return parts.map((part, index) => {
    const heading = /<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i.exec(part.html);
    const label = heading
      ? heading[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
      : '';
    return { label: label || `${index + 1}`, section: index, anchor: '', children: [] };
  });
}

/** Palm databases identify themselves in bytes 60..68. */
export function looksLikeMobi(data, name = '') {
  if (/\.(mobi|prc|azw|azw3)$/i.test(name)) return true;
  if (!data || data.length < 68) return false;
  const type = ascii(data, 60, 8);
  return type === 'BOOKMOBI' || type === 'TEXtREAd';
}

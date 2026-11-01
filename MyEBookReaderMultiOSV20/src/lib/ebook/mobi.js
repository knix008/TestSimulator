// MOBI / PRC / AZW / AZW3 reader (Palm database container).
//
// Layout: a Palm database holds numbered records. Record 0 carries the PalmDOC
// header (how the text is compressed and how long it is) followed by the MOBI
// header (encoding, metadata, where the images start) and the EXTH block (the
// catalogue metadata: author, publisher, description, cover). The records that
// follow hold the book text — one compressed chunk each — and after those come
// the images, stored as plain JPEG/PNG/GIF.
//
// All three ways of compressing the text are read: none, PalmDOC LZ77, and
// HUFF/CDIC — a Huffman code over a phrase dictionary, which lives in
// huffcdic.js.
//
// A file in this family can hold *two* books. Amazon's .azw3, and some .azw,
// carry an old MOBI 6 one and a newer KF8 one side by side, each with its own
// record 0 and its own tables; EXTH 121 says where the second begins. KF8 is a
// different format rather than a newer dialect of the same one — see kf8.js —
// and is preferred wherever it is found, because the MOBI 6 half of the same
// book is a flattened copy of it.
import { sanitizeChapter, htmlToText } from './html.js';
import { openHuffCdic } from './huffcdic.js';
import { openKf8 } from './kf8.js';

const PALMDOC_NONE = 1;
const PALMDOC_LZ77 = 2;
const PALMDOC_HUFF = 17480;
/** EXTH field 121: the record where the KF8 half of a combined file starts. */
const EXTH_KF8_BOUNDARY = 121;
/** What an index field reads when the part has no such table. */
const NO_INDEX = 0xffffffff;

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
 * The header of one MOBI part.
 *
 * A file in this family can hold two books: an old MOBI 6 one and a newer KF8
 * one, each with its own record 0 and its own everything. So the header is read
 * per *part* rather than per file, and every record number in it is counted from
 * that part's own start.
 *
 * Every offset below is from the start of record 0, the PalmDOC header included
 * — which is why the MOBI magic is at 16 and not at 0.
 */
export function readPartHeader(head) {
  if (!head || head.length < 16) throw new Error('The MOBI header record is too short.');
  const v = new DataView(head.buffer, head.byteOffset, head.byteLength);
  const u32 = (at) => (head.length >= at + 4 ? v.getUint32(at) : 0);

  const out = {
    compression: v.getUint16(0),
    textLength: u32(4),
    textRecords: v.getUint16(8),
    encryption: v.getUint16(12),
    hasMobi: head.length > 20 && ascii(head, 16, 4) === 'MOBI',
    headerLength: 0,
    version: 0,
    encoding: 65001,
    firstResource: 0,
    huffIndex: 0,
    huffCount: 0,
    extraFlags: 0,
    fullName: '',
    exth: new Map(),
    fdstIndex: NO_INDEX,
    skeletonIndex: NO_INDEX,
    fragmentIndex: NO_INDEX,
  };
  if (!out.hasMobi) return out;

  out.headerLength = u32(20);
  out.version = u32(36);
  out.encoding = u32(28) || 65001;
  out.firstResource = u32(108);
  out.huffIndex = u32(112);
  out.huffCount = u32(116);
  // "Extra record data flags" sits at offset 242 and only exists in headers at
  // least 228 bytes long.
  if (out.headerLength >= 228 && head.length >= 244) out.extraFlags = v.getUint16(242);
  if (u32(128) & 0x40) out.exth = parseExth(head, 16 + out.headerLength);
  // The KF8 tables. A MOBI 6 header is too short to carry them, and the fields
  // read 0xffffffff when the part has none.
  if (out.headerLength >= 248) {
    out.fdstIndex = u32(192);
    out.fragmentIndex = u32(248);
    out.skeletonIndex = u32(252);
  }
  const nameAt = u32(84);
  const nameLength = u32(88);
  if (nameAt && nameAt + nameLength <= head.length) {
    out.fullName = decodeText(head.subarray(nameAt, nameAt + nameLength), out.encoding).trim();
  }
  return out;
}

/** An EXTH field read as a 32-bit number, or NaN when it is not there. */
function exthNumber(exth, type) {
  const bytes = exth.get(type);
  if (!bytes || bytes.length < 4) return NaN;
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
}

/**
 * The text of one part, decompressed and with the trailing data stripped.
 *
 * Three ways of compressing: none, PalmDOC LZ77, and HUFF/CDIC — the last of
 * which needs tables of its own out of the part's own records.
 */
function readPartText(records, start, header) {
  const { compression, textLength, textRecords, extraFlags } = header;
  if (header.encryption !== 0) {
    throw new Error(`This book is DRM-protected (encryption type ${header.encryption}), so its text cannot be read.`);
  }

  let huff = null;
  if (compression === PALMDOC_HUFF) {
    const tables = [];
    for (let i = 0; i < header.huffCount; i += 1) {
      const record = records[start + header.huffIndex + i];
      if (record) tables.push(record.bytes);
    }
    huff = openHuffCdic(tables);
  } else if (compression !== PALMDOC_NONE && compression !== PALMDOC_LZ77) {
    throw new Error(`Unknown MOBI compression type ${compression}.`);
  }

  const chunks = [];
  let have = 0;
  for (let i = 1; i <= textRecords && start + i < records.length; i += 1) {
    let bytes = records[start + i].bytes;
    if (extraFlags) bytes = bytes.subarray(0, trailingSize(bytes, extraFlags));
    let piece = bytes;
    if (compression === PALMDOC_LZ77) piece = palmDocDecompress(bytes);
    else if (huff) piece = huff.decompress(bytes);
    chunks.push(piece);
    have += piece.length;
    if (textLength && have >= textLength) break;
  }
  const merged = new Uint8Array(have);
  let at = 0;
  for (const chunk of chunks) { merged.set(chunk, at); at += chunk.length; }
  return textLength ? merged.subarray(0, Math.min(textLength, merged.length)) : merged;
}

/** The catalogue metadata of a part, from its EXTH block. */
function readMeta(header) {
  const text = (type) => {
    const bytes = header.exth.get(type);
    return bytes ? decodeText(bytes, header.encoding).trim() : '';
  };
  return {
    title: text(503) || header.fullName || '',
    author: text(100),
    publisher: text(101),
    description: text(103),
    identifier: text(104),
    subject: text(105),
    date: text(106),
    language: text(524),
    rights: text(109),
  };
}

/**
 * Opens MOBI / PRC / AZW / AZW3 bytes.
 *
 * A file may hold a MOBI 6 book, a KF8 book, or both. KF8 is the better of the
 * two — real XHTML parts, proper styling, the pictures where the markup says
 * they are — so it is preferred wherever it is found, and the old half is the
 * fall-back if its tables turn out to be unreadable.
 *
 * @returns a book object with the same shape the EPUB reader produces.
 */
export function openMobi(data) {
  const records = readPalmRecords(data);
  const first = readPartHeader(records[0].bytes);
  if (first.encryption !== 0) {
    throw new Error(`This book is DRM-protected (encryption type ${first.encryption}), so its text cannot be read.`);
  }

  // EXTH 121 is where the KF8 half of a combined file begins. A file that is
  // KF8 and nothing else says so with its file version instead.
  const boundary = exthNumber(first.exth, EXTH_KF8_BOUNDARY);
  const hasSecondPart = Number.isFinite(boundary) && boundary > 0 && boundary < records.length;
  const kf8At = hasSecondPart ? boundary : (first.version >= 8 ? 0 : -1);

  if (kf8At >= 0) {
    try {
      return openKf8Part(records, kf8At);
    } catch (err) {
      // A KF8 half that cannot be read is not the end of it when there is an
      // older half in the same file to fall back on.
      if (!hasSecondPart) throw err;
    }
  }
  return openMobi6Part(records, 0, first);
}

/** The KF8 half: its own header, its own text, its own tables. */
function openKf8Part(records, start) {
  const header = readPartHeader(records[start].bytes);
  return openKf8({
    sectionAt: (i) => records[start + i]?.bytes || null,
    // Bytes, not text: every offset in a KF8 file counts bytes of UTF-8, and the
    // parts are cut apart with those offsets before anything is decoded.
    raw: readPartText(records, start, header),
    decode: (bytes) => decodeText(bytes, header.encoding),
    header,
    meta: readMeta(header),
    recordCount: records.length - start,
  });
}

/** The MOBI 6 half: one stream of HTML, cut up at its page breaks. */
function openMobi6Part(records, start, header) {
  const markup = decodeText(readPartText(records, start, header), header.encoding);
  const meta = readMeta(header);

  // ── Images, addressed by recindex ───────────────────────
  const images = new Map();     // recindex (1-based) → { bytes, mime }
  const firstImage = header.firstResource;
  if (firstImage > 0) {
    for (let i = start + firstImage; i < records.length; i += 1) {
      const mime = imageMime(records[i].bytes);
      if (mime) images.set(i - (start + firstImage) + 1, { bytes: records[i].bytes, mime });
    }
  }

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

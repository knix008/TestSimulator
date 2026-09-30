// KF8 — the format inside an .azw3, and the newer half of some .azw files.
//
// A MOBI 6 book is one long stream of HTML with page breaks in it, which is why
// mobi.js can simply cut it up. KF8 is not that. It holds:
//
//   • one byte stream, split by an **FDST** table into *flows*: flow 0 is the
//     text, and the rest are the stylesheets, SVG and so on;
//   • a **skeleton** index — for each XHTML part of the book, the frame of it
//     (`<html>…<body>` with nothing in the body) and where that frame lives in
//     flow 0;
//   • a **fragment** index — the pieces that go inside those frames, which
//     position of which skeleton each one belongs at, and where it lives.
//
// So a part is rebuilt by taking its skeleton and threading its fragments back
// into it. Nothing else reassembles them: a KF8 file read as though it were
// MOBI 6 gives a wall of markup with the frames and the pieces interleaved in
// the wrong order, which is how an .azw3 opened "successfully" and was
// unreadable.
//
// Pictures and fonts are the records after the text, and the markup refers to
// them as `kindle:embed:0009?mime=image/jpeg` — the number in base 32. Links
// inside the book are `kindle:pos:fid:0003:off:0000000000`, where the fid is a
// fragment and the offset is into the part that fragment belongs to. Both are
// rewritten here into something the reading pane understands.
import { sanitizeChapter, htmlToText } from './html.js';
import { readIndex } from './indx.js';

const NO_INDEX = 0xffffffff;

function ascii(data, at, len) {
  return new TextDecoder('latin1').decode(data.subarray(at, at + len));
}

/** Kindle writes resource and position numbers in base 32, upper case. */
export function fromBase32(text) {
  const value = parseInt(String(text || '').trim(), 32);
  return Number.isFinite(value) ? value : -1;
}

/**
 * The flow boundaries, from the FDST record.
 *
 * Returns the start of every flow plus the end of the last, so flow i is
 * `[bounds[i], bounds[i + 1])`.
 */
export function readFdst(record, rawLength) {
  if (!record || record.length < 12 || ascii(record, 0, 4) !== 'FDST') return [0, rawLength];
  const v = new DataView(record.buffer, record.byteOffset, record.byteLength);
  const count = v.getUint32(0x08);
  const bounds = [];
  for (let i = 0; i < count; i += 1) {
    const at = 12 + i * 8;
    if (at + 4 > record.length) break;
    bounds.push(v.getUint32(at));
  }
  if (!bounds.length) return [0, rawLength];
  if (bounds[0] !== 0) bounds.unshift(0);
  bounds.push(rawLength);
  return bounds;
}

/** The skeleton table: the frame of each part of the book. */
function readSkeletons(sectionAt, at) {
  const { entries } = readIndex(sectionAt, at);
  return entries.map((entry, index) => {
    const chunks = entry.tags.get(1) || [];
    const place = entry.tags.get(6) || [];
    return {
      index,
      name: entry.name,
      fragments: chunks[0] || 0,
      start: place[0] || 0,
      length: place[1] || 0,
    };
  });
}

/** The fragment table: the pieces, and where each one goes. */
function readFragments(sectionAt, at) {
  const { entries, cncx } = readIndex(sectionAt, at);
  return entries.map((entry) => {
    const place = entry.tags.get(6) || [];
    const idOffset = (entry.tags.get(2) || [])[0];
    return {
      // The entry's own name is the position in the skeleton it goes at.
      insertAt: Number(entry.name) || 0,
      id: idOffset != null ? (cncx.get(idOffset) || '') : '',
      file: (entry.tags.get(3) || [])[0] ?? 0,
      sequence: (entry.tags.get(4) || [])[0] ?? 0,
      start: place[0] || 0,
      length: place[1] || 0,
    };
  });
}

/** Joins byte runs, which is what threading a part back together comes to. */
function join(...runs) {
  let total = 0;
  for (const run of runs) total += run.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const run of runs) { out.set(run, at); at += run.length; }
  return out;
}

/**
 * Threads the fragments back into their skeletons.
 *
 * Everything here counts in **bytes**, not characters. Every offset the format
 * carries is a byte offset into the UTF-8 stream, and a book with any Korean,
 * Japanese or accented text in it has three bytes to a character — so slicing
 * the decoded string by those numbers drifts further out of step with every
 * chapter, which is how the parts came out starting half way through a sentence.
 *
 * The positions a fragment carries are relative to the skeleton as it grows,
 * which is how the format writes them: each insertion happens at a position
 * measured in the part being built, not in the finished one.
 */
export function buildParts({ bytes, skeletons, fragments, decode }) {
  const parts = [];
  let at = 0;
  for (const skeleton of skeletons) {
    let after = skeleton.start + skeleton.length;
    let body = bytes.subarray(skeleton.start, after);
    const mine = [];
    for (let i = 0; i < skeleton.fragments; i += 1) {
      const fragment = fragments[at];
      at += 1;
      if (!fragment) break;
      const piece = bytes.subarray(after, after + fragment.length);
      const insert = Math.max(0, Math.min(body.length, fragment.insertAt - skeleton.start));
      body = join(body.subarray(0, insert), piece, body.subarray(insert));
      after += fragment.length;
      mine.push(fragment);
    }
    parts.push({ index: parts.length, html: decode(body), fragments: mine, name: skeleton.name });
  }
  // A file with no skeleton table at all is still worth showing: the flow is the
  // book, in one piece, rather than nothing.
  if (!parts.length && bytes.length) {
    parts.push({ index: 0, html: decode(bytes), fragments: [], name: 'part0' });
  }
  return parts;
}

/** Which part a `kindle:pos:fid:` link lands in. */
export function partForFragment(parts, fid) {
  if (!(fid >= 0)) return null;
  for (const part of parts) {
    if (part.fragments.some((f) => f.sequence === fid)) return part.index;
  }
  // Failing that, the fid is an index into the fragment table, and the fragment
  // says which file it belongs to — which is the part.
  const flat = parts.flatMap((p) => p.fragments);
  const fragment = flat[fid];
  if (!fragment) return null;
  const found = parts.findIndex((p) => p.fragments.includes(fragment));
  return found >= 0 ? found : null;
}

const RESOURCE_MAGIC = [
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 },
  { mime: 'image/png', test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: 'image/gif', test: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 },
  { mime: 'image/bmp', test: (b) => b[0] === 0x42 && b[1] === 0x4d },
  { mime: 'image/svg+xml', test: (b) => ascii(b, 0, 4) === '<svg' },
  { mime: 'font/ttf', test: (b) => b[0] === 0x00 && b[1] === 0x01 && b[2] === 0x00 && b[3] === 0x00 },
  { mime: 'font/otf', test: (b) => ascii(b, 0, 4) === 'OTTO' },
];

/** The pictures and fonts, numbered the way `kindle:embed:` refers to them. */
function readResources(sectionAt, first, last) {
  const out = new Map();
  if (!(first > 0)) return out;
  for (let i = first; i <= last; i += 1) {
    const bytes = sectionAt(i);
    if (!bytes || bytes.length < 4) continue;
    // The records between the text and the pictures carry their own markers and
    // are not resources; they still take a number, so they are counted in.
    const tag = ascii(bytes, 0, 4);
    const number = i - first + 1;
    if (tag === 'BOUNDARY') break;
    const mime = RESOURCE_MAGIC.find((m) => m.test(bytes))?.mime || null;
    if (mime) out.set(number, { bytes, mime });
  }
  return out;
}

/**
 * Opens the KF8 half of a MOBI-family file.
 *
 * `sectionAt(i)` hands back record i **of this part** — for a file that carries
 * both a MOBI 6 and a KF8 book, counted from the KF8 boundary. `raw` is the
 * decompressed **bytes** of the part, already stripped of their trailing data,
 * and `decode` turns a run of them into text in the book's own encoding.
 */
export function openKf8({ sectionAt, raw, header, meta, recordCount, decode }) {
  const bounds = readFdst(
    header.fdstIndex !== NO_INDEX ? sectionAt(header.fdstIndex) : null,
    raw.length,
  );
  // Flow 0 is the text of the book; the rest are its stylesheets and the like,
  // which the sanitiser would throw away in any case.
  const textBytes = raw.subarray(bounds[0], bounds[1] ?? raw.length);

  let skeletons = [];
  let fragments = [];
  try {
    if (header.skeletonIndex !== NO_INDEX) skeletons = readSkeletons(sectionAt, header.skeletonIndex);
    if (header.fragmentIndex !== NO_INDEX) fragments = readFragments(sectionAt, header.fragmentIndex);
  } catch {
    // A damaged table is no reason to refuse the book: without it the flow is
    // shown whole, which is readable even if the chapters run together.
    skeletons = [];
    fragments = [];
  }

  const parts = buildParts({ bytes: textBytes, skeletons, fragments, decode });
  const resources = readResources(sectionAt, header.firstResource, recordCount - 1);

  const sections = parts.map((part, index) => ({
    index,
    id: `kf8-${index}`,
    href: `#part-${index}`,
    kind: 'html',
    label: `${index + 1}`,
  }));

  return {
    format: 'mobi',
    // The same family, a different format. Worth saying, because what a reader
    // can expect of it — real XHTML parts, styling, the pictures where the
    // markup puts them — is not what MOBI 6 offers.
    formatLabel: 'AZW3 (KF8)',
    meta,
    sections,
    toc: parts.map((part, index) => ({
      label: headingOf(part.html) || `${index + 1}`,
      section: index,
      anchor: '',
      children: [],
    })),
    coverPath: '',
    resource(path) {
      const m = /^embed:(\d+)$/.exec(String(path || ''));
      if (!m) return null;
      return resources.get(Number(m[1])) || null;
    },
    loadSection(index, { resolveSrc } = {}) {
      const part = parts[index];
      if (!part) throw new Error(`This book has no section ${index + 1}.`);
      const cleaned = sanitizeChapter(part.html, {
        mime: 'application/xhtml+xml',
        resolveSrc: (href) => {
          const key = embedKey(href);
          if (!key) return href;
          return resolveSrc ? resolveSrc(key) : key;
        },
        linkTarget: (href) => {
          const fid = positionFid(href);
          if (fid == null) return null;
          const target = partForFragment(parts, fid);
          return target == null ? null : { section: target, anchor: '' };
        },
      });
      return { kind: 'html', ...cleaned, index, href: sections[index].href };
    },
    sectionText(index) {
      return parts[index] ? htmlToText(parts[index].html) : '';
    },
    /** What the properties panel shows about the book's own shape. */
    kf8: { flows: Math.max(1, bounds.length - 1), parts: parts.length, resources: resources.size },
  };
}

/** `kindle:embed:0009?mime=image/jpeg` → the resource key for it. */
export function embedKey(href) {
  const m = /kindle:embed:([0-9A-Za-z]+)/i.exec(String(href || ''));
  if (!m) return '';
  const number = fromBase32(m[1]);
  return number > 0 ? `embed:${number}` : '';
}

/** `kindle:pos:fid:0003:off:...` → the fragment number it points at. */
export function positionFid(href) {
  const m = /kindle:pos:fid:([0-9A-Za-z]+)/i.exec(String(href || ''));
  if (!m) return null;
  const fid = fromBase32(m[1]);
  return fid >= 0 ? fid : null;
}

function headingOf(html) {
  const m = /<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i.exec(String(html || ''));
  if (!m) return '';
  return m[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

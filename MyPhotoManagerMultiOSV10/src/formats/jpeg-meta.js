// JPEG metadata without re-encoding the picture:
//  - list the segments before the image data
//  - carry EXIF / XMP / IPTC / ICC over to a re-encoded JPEG (editor saves)
//  - read and change the EXIF orientation (lossless rotate / flip)
//  - shift the EXIF date/time stamps in place
import { ASCII, buildExifTiff, exifDate, findEntry, parseExifDate, readIfd, readValue, SHORT, tiffHeader, TAG } from './tiffstruct.js';

const EXIF_ID = [0x45, 0x78, 0x69, 0x66, 0, 0]; // "Exif\0\0"
const XMP_ID = 'http://ns.adobe.com/xap/1.0/\0';

export const isJpeg = (bytes) => bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

/** Segments up to the start of scan: [{ marker, start, end, dataStart }] (end exclusive). */
export function segments(bytes) {
  const out = [];
  if (!isJpeg(bytes)) return out;
  let p = 2;
  while (p + 4 <= bytes.length) {
    if (bytes[p] !== 0xff) break;
    const marker = bytes[p + 1];
    if (marker === 0xff) { p += 1; continue; }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { p += 2; continue; }
    const length = (bytes[p + 2] << 8) | bytes[p + 3];
    const end = p + 2 + length;
    if (length < 2 || end > bytes.length) break;
    out.push({ marker, start: p, end, dataStart: p + 4 });
    if (marker === 0xda) break; // start of scan: image data follows
    p = end;
  }
  return out;
}

const startsWith = (bytes, at, prefix) => prefix.every((value, i) => bytes[at + i] === value);
const startsWithText = (bytes, at, text) => [...text].every((ch, i) => bytes[at + i] === ch.charCodeAt(0));

export const isExifSegment = (bytes, segment) => segment.marker === 0xe1 && startsWith(bytes, segment.dataStart, EXIF_ID);
export const isXmpSegment = (bytes, segment) => segment.marker === 0xe1 && startsWithText(bytes, segment.dataStart, XMP_ID);

/** Metadata segments worth keeping when the picture is re-encoded: EXIF, XMP, ICC (APP2), IPTC (APP13). */
export function metadataSegments(bytes) {
  return segments(bytes)
    .filter((segment) => segment.marker === 0xe1 || segment.marker === 0xe2 || segment.marker === 0xed)
    .map((segment) => bytes.slice(segment.start, segment.end));
}

/**
 * New JPEG = SOI + `extra` segments + `jpeg` without its own EXIF/XMP/ICC/IPTC.
 * The JFIF APP0 of the encoder stays first when present.
 */
export function insertSegments(jpeg, extra) {
  if (!isJpeg(jpeg)) throw new Error('not a JPEG');
  const own = segments(jpeg);
  const keep = [];
  let cursor = 2;
  let app0 = null;
  for (const segment of own) {
    if (segment.marker === 0xda) break;
    const drop = segment.marker === 0xe1 || segment.marker === 0xe2 || segment.marker === 0xed;
    if (segment.marker === 0xe0 && !app0) app0 = jpeg.slice(segment.start, segment.end);
    else if (!drop) keep.push(jpeg.slice(segment.start, segment.end));
    cursor = segment.end;
  }
  const rest = jpeg.slice(cursor);
  const parts = [Uint8Array.of(0xff, 0xd8), ...(app0 ? [app0] : []), ...extra, ...keep, rest];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const part of parts) { out.set(part, p); p += part.length; }
  return out;
}

/** The APP1 Exif segment around a TIFF block. */
export function exifSegment(tiff) {
  const length = 2 + EXIF_ID.length + tiff.length;
  if (length > 0xffff) throw new Error('EXIF block too large');
  const out = new Uint8Array(2 + length);
  out[0] = 0xff; out[1] = 0xe1; out[2] = length >> 8; out[3] = length & 0xff;
  out.set(EXIF_ID, 4);
  out.set(tiff, 4 + EXIF_ID.length);
  return out;
}

function exifTiff(bytes) {
  const segment = segments(bytes).find((s) => isExifSegment(bytes, s));
  if (!segment) return null;
  const start = segment.dataStart + EXIF_ID.length;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const header = tiffHeader(view, start);
  if (!header) return null;
  return { segment, start, view, ...header };
}

/** EXIF orientation 1–8, or 1 when the file has none. */
export function readOrientation(bytes) {
  const tiff = exifTiff(bytes);
  if (!tiff) return 1;
  const ifd = readIfd(tiff.view, tiff.start, tiff.ifd0, tiff.little);
  const entry = findEntry(ifd, TAG.Orientation);
  const value = entry ? readValue(tiff.view, entry, tiff.little) : 1;
  return value >= 1 && value <= 8 ? value : 1;
}

/**
 * Copy of the JPEG with EXIF orientation `value`. Patches the tag in place; adds
 * it to IFD0 when missing (IFD0 is rebuilt at the end of the EXIF block, the
 * rest stays where it was); adds a small EXIF block to a JPEG without one.
 */
export function writeOrientation(bytes, value) {
  const tiff = exifTiff(bytes);
  if (!tiff) {
    const app1 = exifSegment(buildExifTiff({ orientation: value }));
    return insertSegments(bytes, [app1, ...metadataSegments(bytes)]);
  }
  const ifd = readIfd(tiff.view, tiff.start, tiff.ifd0, tiff.little);
  const entry = findEntry(ifd, TAG.Orientation);
  const out = bytes.slice();
  const view = new DataView(out.buffer);
  if (entry && entry.type === SHORT) {
    view.setUint16(entry.at, value, tiff.little);
    return out;
  }
  return withRebuiltIfd0(bytes, tiff, ifd, { tag: TAG.Orientation, type: SHORT, count: 1, value });
}

function withRebuiltIfd0(bytes, tiff, ifd, added) {
  const { segment, start, little } = tiff;
  const entries = ifd.entries.filter((e) => e.tag !== added.tag);
  const all = [...entries.map((e) => ({ raw: bytes.slice(e.entry, e.entry + 12), tag: e.tag })), { added, tag: added.tag }].sort((a, b) => a.tag - b.tag);
  const block = new Uint8Array(2 + all.length * 12 + 4);
  const blockView = new DataView(block.buffer);
  blockView.setUint16(0, all.length, little);
  all.forEach((item, i) => {
    const p = 2 + i * 12;
    if (item.raw) block.set(item.raw, p);
    else {
      blockView.setUint16(p, item.added.tag, little);
      blockView.setUint16(p + 2, item.added.type, little);
      blockView.setUint32(p + 4, 1, little);
      blockView.setUint16(p + 8, item.added.value, little);
    }
  });
  blockView.setUint32(2 + all.length * 12, ifd.next, little);
  // Inline values copied from the old entries stay valid; out-of-line offsets point into the unchanged TIFF data.
  const tiffLength = segment.end - start;
  const pad = tiffLength % 2;
  const newOffset = tiffLength + pad;
  const newSegmentLength = segment.end - segment.start - 2 + pad + block.length;
  if (newSegmentLength > 0xffff) throw new Error('EXIF block too large');
  const out = new Uint8Array(bytes.length + pad + block.length);
  out.set(bytes.subarray(0, segment.end), 0);
  out.set(block, segment.end + pad);
  out.set(bytes.subarray(segment.end), segment.end + pad + block.length);
  out[segment.start + 2] = newSegmentLength >> 8;
  out[segment.start + 3] = newSegmentLength & 0xff;
  new DataView(out.buffer).setUint32(start + 4, newOffset, little);
  return out;
}

/**
 * After re-encoding an edited picture with the original's EXIF: drops the old
 * embedded thumbnail (IFD1 would still show the unedited photo) and writes the
 * new pixel size. Patched in place (a copy is returned).
 */
export function patchExifAfterEdit(bytes, width, height) {
  const tiff = exifTiff(bytes);
  if (!tiff) return bytes;
  const out = bytes.slice();
  const view = new DataView(out.buffer);
  const ifd0 = readIfd(tiff.view, tiff.start, tiff.ifd0, tiff.little);
  if (ifd0.entries.length) view.setUint32(ifd0.position + 2 + ifd0.entries.length * 12, 0, tiff.little);
  const pointer = findEntry(ifd0, 0x8769);
  if (pointer) {
    const exif = readIfd(tiff.view, tiff.start, readValue(tiff.view, pointer, tiff.little), tiff.little);
    for (const [tag, value] of [[0xa002, width], [0xa003, height]]) {
      const entry = findEntry(exif, tag);
      if (entry?.type === 3) view.setUint16(entry.at, Math.min(65535, value), tiff.little);
      if (entry?.type === 4) view.setUint32(entry.at, value, tiff.little);
    }
  }
  return out;
}

/** EXIF date/time stamps (DateTime, DateTimeOriginal, DateTimeDigitized) as Dates. */
export function readExifDates(bytes) {
  const tiff = exifTiff(bytes);
  const out = {};
  if (!tiff) return out;
  for (const { entry, name } of dateEntries(tiff)) {
    const value = parseExifDate(readValue(tiff.view, entry, tiff.little));
    if (value) out[name] = value;
  }
  return out;
}

function dateEntries(tiff) {
  const found = [];
  const ifd0 = readIfd(tiff.view, tiff.start, tiff.ifd0, tiff.little);
  const dateTime = findEntry(ifd0, TAG.DateTime);
  if (dateTime) found.push({ entry: dateTime, name: 'modified' });
  const pointer = findEntry(ifd0, 0x8769);
  if (pointer) {
    const exif = readIfd(tiff.view, tiff.start, readValue(tiff.view, pointer, tiff.little), tiff.little);
    const original = findEntry(exif, TAG.DateTimeOriginal);
    const digitized = findEntry(exif, TAG.DateTimeDigitized);
    if (original) found.push({ entry: original, name: 'taken' });
    if (digitized) found.push({ entry: digitized, name: 'digitized' });
  }
  return found.filter(({ entry }) => entry.type === ASCII && entry.count >= 20);
}

/**
 * Copy of the JPEG with every EXIF date moved: `change(date) → date`.
 * The stamps have a fixed width, so the bytes are patched in place.
 * Returns null when the file has no EXIF dates.
 */
export function rewriteExifDates(bytes, change) {
  const tiff = exifTiff(bytes);
  if (!tiff) return null;
  const entries = dateEntries(tiff);
  if (!entries.length) return null;
  const out = bytes.slice();
  let changed = false;
  for (const { entry } of entries) {
    const current = parseExifDate(readValue(tiff.view, entry, tiff.little));
    if (!current) continue;
    const text = exifDate(change(current));
    for (let i = 0; i < 19; i++) out[entry.at + i] = text.charCodeAt(i);
    changed = true;
  }
  return changed ? out : null;
}

/** Embedded XMP packet text of a JPEG, or ''. */
export function readXmpPacket(bytes) {
  const segment = segments(bytes).find((s) => isXmpSegment(bytes, s));
  if (!segment) return '';
  return new TextDecoder().decode(bytes.subarray(segment.dataStart + XMP_ID.length, segment.end));
}

/** Copy of the JPEG without the APP1 EXIF segment (decoders then ignore its orientation). */
export function stripExif(bytes) {
  const exif = segments(bytes).find((s) => isExifSegment(bytes, s));
  if (!exif) return bytes;
  const out = new Uint8Array(bytes.length - (exif.end - exif.start));
  out.set(bytes.subarray(0, exif.start), 0);
  out.set(bytes.subarray(exif.end), exif.start);
  return out;
}

/** Width/height from the SOF marker (as stored, before orientation). */
export function jpegSize(bytes) {
  for (const segment of segments(bytes)) {
    if (segment.marker >= 0xc0 && segment.marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(segment.marker)) {
      const d = segment.dataStart;
      return { width: (bytes[d + 3] << 8) | bytes[d + 4], height: (bytes[d + 1] << 8) | bytes[d + 2] };
    }
  }
  return null;
}

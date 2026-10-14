// Camera RAW files: every camera stores a JPEG preview next to the sensor data.
// The largest one the browser can decode is used for thumbnails and viewing
// (the same way most photo managers show RAW files without a RAW converter).
//
//  - TIFF-based RAW (DNG, CR2, NEF, ARW, PEF, SRW, ORF, RW2, 3FR, ERF, KDC, …):
//    JPEG previews referenced from IFD0, its next IFDs and SubIFDs
//    (JPEGInterchangeFormat, or a single JPEG strip), and Panasonic's JpgFromRaw.
//  - Fujifilm RAF: the JPEG offset sits in the file header.
//  - Anything else (CR3, X3F, …): the largest complete JPEG stream in the file.
import { jpegSize, segments } from './jpeg-meta.js';
import { findEntry, readIfd, readValue, tiffHeader } from './tiffstruct.js';

const DECODABLE_SOF = new Set([0xc0, 0xc1, 0xc2]);

/** Is there a browser-decodable JPEG at `offset` (baseline/progressive, not lossless)? */
function jpegAt(bytes, offset, length) {
  if (offset <= 0 || length < 100 || offset + length > bytes.length) return null;
  if (bytes[offset] !== 0xff || bytes[offset + 1] !== 0xd8) return null;
  const slice = bytes.subarray(offset, offset + length);
  const sof = segments(slice).find((segment) => segment.marker >= 0xc0 && segment.marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(segment.marker));
  if (!sof || !DECODABLE_SOF.has(sof.marker)) return null;
  const size = jpegSize(slice);
  if (!size || !size.width || !size.height) return null;
  return { offset, length, ...size };
}

function collectTiff(bytes, view, start, header, found) {
  const seen = new Set();
  let orientation = 1;
  const visit = (offset, depth) => {
    if (!offset || seen.has(offset) || depth > 4 || seen.size > 64) return;
    seen.add(offset);
    const ifd = readIfd(view, start, offset, header.little);
    if (!ifd.entries.length) return;
    const value = (tag) => { const entry = findEntry(ifd, tag); return entry ? readValue(view, entry, header.little) : null; };
    if (depth === 0 && offset === header.ifd0) {
      const o = value(0x0112);
      if (o >= 1 && o <= 8) orientation = o;
    }
    const jpegOffset = value(0x0201);
    const jpegLength = value(0x0202);
    if (jpegOffset && jpegLength) {
      const hit = jpegAt(bytes, start + jpegOffset, jpegLength);
      if (hit) found.push(hit);
    }
    const compression = value(0x0103);
    const strips = value(0x0111);
    const counts = value(0x0117);
    if ((compression === 6 || compression === 7 || compression === 99) && strips != null && counts != null) {
      const offsets = [].concat(strips);
      const lengths = [].concat(counts);
      if (offsets.length === 1) {
        const hit = jpegAt(bytes, start + offsets[0], lengths[0]);
        if (hit) found.push(hit);
      }
    }
    // Panasonic RW2: JpgFromRaw holds a complete JPEG.
    const jpgFromRaw = findEntry(ifd, 0x002e);
    if (jpgFromRaw) {
      const hit = jpegAt(bytes, jpgFromRaw.at, jpgFromRaw.count);
      if (hit) found.push(hit);
    }
    const subIfds = value(0x014a);
    for (const sub of [].concat(subIfds ?? [])) visit(sub, depth + 1);
    const exif = value(0x8769);
    if (exif) visit(exif, depth + 1);
    if (ifd.next) visit(ifd.next, depth);
  };
  visit(header.ifd0, 0);
  return orientation;
}

/** Every complete, decodable JPEG stream in the file (fallback for non-TIFF RAW). */
function scanJpegs(bytes, found) {
  const limit = bytes.length - 4;
  for (let i = 0; i < limit && found.length < 8; i++) {
    if (bytes[i] !== 0xff || bytes[i + 1] !== 0xd8 || bytes[i + 2] !== 0xff) continue;
    const head = segments(bytes.subarray(i, Math.min(bytes.length, i + 2_000_000)));
    const sos = head.find((segment) => segment.marker === 0xda);
    if (!sos) continue;
    let end = -1;
    for (let p = i + sos.end; p < bytes.length - 1; p++) {
      if (bytes[p] === 0xff && bytes[p + 1] === 0xd9) { end = p + 2; break; }
    }
    if (end < 0) break;
    const hit = jpegAt(bytes, i, end - i);
    if (hit) found.push(hit);
    i = end - 1;
  }
}

/**
 * The best JPEG preview of a RAW file: { jpeg: Uint8Array, width, height,
 * orientation, applyOrientation } or null. `applyOrientation` is true when the
 * orientation comes from the RAW container (the preview's own EXIF must then be ignored).
 */
export function extractRawPreview(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const found = [];
  let orientation = 1;
  let fromContainer = false;

  const header = tiffHeader(view, 0);
  if (header) {
    orientation = collectTiff(bytes, view, 0, header, found);
    fromContainer = true;
  } else if (String.fromCharCode(...bytes.subarray(0, 15)) === 'FUJIFILMCCD-RAW') {
    const offset = view.getUint32(84);
    const length = view.getUint32(88);
    const hit = jpegAt(bytes, offset, length);
    if (hit) found.push(hit);
  }
  if (!found.length) {
    scanJpegs(bytes, found);
    fromContainer = false;
  }
  if (!found.length) return null;
  const best = found.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a));
  return {
    jpeg: bytes.slice(best.offset, best.offset + best.length),
    width: best.width,
    height: best.height,
    orientation,
    applyOrientation: fromContainer,
  };
}

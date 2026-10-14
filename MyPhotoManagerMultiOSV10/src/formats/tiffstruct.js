// Reading and writing TIFF structures (IFDs). Used for EXIF inside JPEG (APP1),
// for the previews inside camera RAW files, and to build EXIF blocks.

export const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 13: 4 };
export const BYTE = 1;
export const ASCII = 2;
export const SHORT = 3;
export const LONG = 4;
export const RATIONAL = 5;
export const UNDEFINED = 7;
export const SRATIONAL = 10;

/** `{ little, ifd0 }` for a TIFF header at `start`, or null. */
export function tiffHeader(view, start = 0) {
  if (start + 8 > view.byteLength) return null;
  const order = view.getUint16(start);
  let little;
  if (order === 0x4949) little = true;
  else if (order === 0x4d4d) little = false;
  else return null;
  const magic = view.getUint16(start + 2, little);
  // 42 = TIFF, 0x4f52 / 0x5352 = Olympus ORF, 0x55 = Panasonic RW2.
  if (![42, 0x4f52, 0x5352, 0x55].includes(magic)) return null;
  return { little, ifd0: view.getUint32(start + 4, little), magic };
}

/** Entries of the IFD at `start + offset`: [{ tag, type, count, at }], `at` = absolute value position. */
export function readIfd(view, start, offset, little) {
  const position = start + offset;
  if (offset <= 0 || position + 2 > view.byteLength) return { entries: [], next: 0, position };
  const count = view.getUint16(position, little);
  if (count > 4000 || position + 2 + count * 12 > view.byteLength) return { entries: [], next: 0, position };
  const entries = [];
  for (let i = 0; i < count; i++) {
    const entry = position + 2 + i * 12;
    const tag = view.getUint16(entry, little);
    const type = view.getUint16(entry + 2, little);
    const n = view.getUint32(entry + 4, little);
    const size = (TYPE_SIZE[type] ?? 1) * n;
    const at = size <= 4 ? entry + 8 : start + view.getUint32(entry + 8, little);
    entries.push({ tag, type, count: n, at, entry });
  }
  const nextAt = position + 2 + count * 12;
  const next = nextAt + 4 <= view.byteLength ? view.getUint32(nextAt, little) : 0;
  return { entries, next, position };
}

/** Value of an entry: a number (count 1), an array, or a string (ASCII). */
export function readValue(view, entry, little) {
  const { type, count, at } = entry;
  const size = TYPE_SIZE[type] ?? 1;
  if (at + size * count > view.byteLength) return null;
  if (type === ASCII) {
    let text = '';
    for (let i = 0; i < count; i++) {
      const code = view.getUint8(at + i);
      if (!code) break;
      text += String.fromCharCode(code);
    }
    return text;
  }
  const values = [];
  for (let i = 0; i < Math.min(count, 4096); i++) {
    const p = at + i * size;
    switch (type) {
      case 3: values.push(view.getUint16(p, little)); break;
      case 8: values.push(view.getInt16(p, little)); break;
      case 4: case 13: values.push(view.getUint32(p, little)); break;
      case 9: values.push(view.getInt32(p, little)); break;
      case 5: values.push(view.getUint32(p, little) / (view.getUint32(p + 4, little) || 1)); break;
      case 10: values.push(view.getInt32(p, little) / (view.getInt32(p + 4, little) || 1)); break;
      case 11: values.push(view.getFloat32(p, little)); break;
      case 12: values.push(view.getFloat64(p, little)); break;
      case 6: values.push(view.getInt8(p)); break;
      default: values.push(view.getUint8(p));
    }
  }
  return count === 1 ? values[0] : values;
}

export const findEntry = (ifd, tag) => ifd.entries.find((entry) => entry.tag === tag) ?? null;

// ───────────────────────── writing

/** Rational approximation of a positive number: [numerator, denominator]. */
export function rational(value) {
  if (!Number.isFinite(value) || value <= 0) return [0, 1];
  if (Number.isInteger(value)) return [value, 1];
  if (value < 1) {
    const inverse = 1 / value;
    if (Math.abs(inverse - Math.round(inverse)) < 1e-6) return [1, Math.round(inverse)];
  }
  const denominator = 10000;
  return [Math.round(value * denominator), denominator];
}

function valueBytes({ type, value }, little) {
  if (type === ASCII) {
    const text = `${value}\0`;
    return Uint8Array.from(text, (ch) => ch.charCodeAt(0) & 0xff);
  }
  const values = Array.isArray(value) ? value : [value];
  const size = TYPE_SIZE[type];
  const out = new Uint8Array(values.length * size);
  const view = new DataView(out.buffer);
  values.forEach((v, i) => {
    const p = i * size;
    switch (type) {
      case SHORT: view.setUint16(p, v, little); break;
      case LONG: view.setUint32(p, v, little); break;
      case RATIONAL: case SRATIONAL: {
        const [n, d] = Array.isArray(v) ? v : rational(Math.abs(v));
        if (type === SRATIONAL) { view.setInt32(p, v < 0 && !Array.isArray(v) ? -n : n, little); view.setInt32(p + 4, d, little); } else { view.setUint32(p, n, little); view.setUint32(p + 4, d, little); }
        break;
      }
      default: view.setUint8(p, v);
    }
  });
  return out;
}

/**
 * Builds a TIFF block (little-endian) with IFD0 and optional Exif and GPS
 * sub-IFDs. Entries are { tag, type, value }. Returns Uint8Array.
 */
export function buildTiff({ ifd0 = [], exif = [], gps = [] }, little = true) {
  const groups = [{ name: 'ifd0', entries: [...ifd0] }];
  if (exif.length) groups.push({ name: 'exif', entries: [...exif] });
  if (gps.length) groups.push({ name: 'gps', entries: [...gps] });
  // Pointers to the sub-IFDs live in IFD0 (filled in once offsets are known).
  if (exif.length) groups[0].entries.push({ tag: 0x8769, type: LONG, value: 0 });
  if (gps.length) groups[0].entries.push({ tag: 0x8825, type: LONG, value: 0 });
  for (const group of groups) group.entries.sort((a, b) => a.tag - b.tag);

  // Layout: header, then per group: IFD (2 + 12n + 4) followed by its out-of-line values.
  let offset = 8;
  for (const group of groups) {
    group.offset = offset;
    offset += 2 + group.entries.length * 12 + 4;
    for (const entry of group.entries) {
      entry.bytes = valueBytes(entry, little);
      if (entry.bytes.length > 4) {
        entry.dataOffset = offset;
        offset += entry.bytes.length + (entry.bytes.length % 2);
      }
    }
  }
  const pointer = (name) => groups.find((group) => group.name === name)?.offset ?? 0;
  for (const entry of groups[0].entries) {
    if (entry.tag === 0x8769) entry.bytes = valueBytes({ type: LONG, value: pointer('exif') }, little);
    if (entry.tag === 0x8825) entry.bytes = valueBytes({ type: LONG, value: pointer('gps') }, little);
  }
  const out = new Uint8Array(offset);
  const view = new DataView(out.buffer);
  view.setUint16(0, little ? 0x4949 : 0x4d4d);
  view.setUint16(2, 42, little);
  view.setUint32(4, 8, little);
  for (const group of groups) {
    let p = group.offset;
    view.setUint16(p, group.entries.length, little);
    p += 2;
    for (const entry of group.entries) {
      const count = entry.type === ASCII ? entry.bytes.length : entry.bytes.length / TYPE_SIZE[entry.type];
      view.setUint16(p, entry.tag, little);
      view.setUint16(p + 2, entry.type, little);
      view.setUint32(p + 4, count, little);
      if (entry.bytes.length > 4) {
        view.setUint32(p + 8, entry.dataOffset, little);
        out.set(entry.bytes, entry.dataOffset);
      } else {
        out.set(entry.bytes, p + 8);
      }
      p += 12;
    }
    view.setUint32(p, 0, little);
  }
  return out;
}

/** "2024:05:01 13:45:10" for a Date (local time, as cameras write it). */
export function exifDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}:${pad(date.getMonth() + 1)}:${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** Parses "YYYY:MM:DD HH:MM:SS" (local time) → Date, or null. */
export function parseExifDate(text) {
  const match = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(text ?? '').trim());
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match.map(Number);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return new Date(y, mo - 1, d, h, mi, s);
}

/** EXIF tags the app writes (and the fixtures use). */
export const TAG = {
  Make: 0x010f, Model: 0x0110, Orientation: 0x0112, Software: 0x0131, DateTime: 0x0132, Artist: 0x013b, ImageDescription: 0x010e, Copyright: 0x8298,
  ExposureTime: 0x829a, FNumber: 0x829d, ISO: 0x8827, DateTimeOriginal: 0x9003, DateTimeDigitized: 0x9004, FocalLength: 0x920a, Flash: 0x9209,
  PixelXDimension: 0xa002, PixelYDimension: 0xa003, LensModel: 0xa434, ExposureBias: 0x9204,
  GPSLatitudeRef: 0x0001, GPSLatitude: 0x0002, GPSLongitudeRef: 0x0003, GPSLongitude: 0x0004, GPSAltitudeRef: 0x0005, GPSAltitude: 0x0006,
};

const dms = (value) => {
  const abs = Math.abs(value);
  const degrees = Math.floor(abs);
  const minutesFull = (abs - degrees) * 60;
  const minutes = Math.floor(minutesFull);
  const seconds = (minutesFull - minutes) * 60;
  return [[degrees, 1], [minutes, 1], [Math.round(seconds * 1000), 1000]];
};

/**
 * TIFF block with common camera tags. `info`: { make, model, orientation,
 * date (Date), iso, fNumber, exposureTime, focalLength, lens, artist,
 * description, copyright, software, width, height, gps: { lat, lon, alt } }.
 */
export function buildExifTiff(info) {
  const ifd0 = [];
  const exif = [];
  const gps = [];
  if (info.description) ifd0.push({ tag: TAG.ImageDescription, type: ASCII, value: info.description });
  if (info.make) ifd0.push({ tag: TAG.Make, type: ASCII, value: info.make });
  if (info.model) ifd0.push({ tag: TAG.Model, type: ASCII, value: info.model });
  ifd0.push({ tag: TAG.Orientation, type: SHORT, value: info.orientation ?? 1 });
  if (info.software) ifd0.push({ tag: TAG.Software, type: ASCII, value: info.software });
  if (info.date) ifd0.push({ tag: TAG.DateTime, type: ASCII, value: exifDate(info.date) });
  if (info.artist) ifd0.push({ tag: TAG.Artist, type: ASCII, value: info.artist });
  if (info.copyright) ifd0.push({ tag: TAG.Copyright, type: ASCII, value: info.copyright });
  if (info.exposureTime) exif.push({ tag: TAG.ExposureTime, type: RATIONAL, value: info.exposureTime });
  if (info.fNumber) exif.push({ tag: TAG.FNumber, type: RATIONAL, value: info.fNumber });
  if (info.iso) exif.push({ tag: TAG.ISO, type: SHORT, value: info.iso });
  if (info.date) {
    exif.push({ tag: TAG.DateTimeOriginal, type: ASCII, value: exifDate(info.date) });
    exif.push({ tag: TAG.DateTimeDigitized, type: ASCII, value: exifDate(info.date) });
  }
  if (info.focalLength) exif.push({ tag: TAG.FocalLength, type: RATIONAL, value: info.focalLength });
  if (info.flash != null) exif.push({ tag: TAG.Flash, type: SHORT, value: info.flash });
  if (info.width) exif.push({ tag: TAG.PixelXDimension, type: LONG, value: info.width });
  if (info.height) exif.push({ tag: TAG.PixelYDimension, type: LONG, value: info.height });
  if (info.lens) exif.push({ tag: TAG.LensModel, type: ASCII, value: info.lens });
  if (info.gps) {
    gps.push({ tag: 0x0000, type: BYTE, value: [2, 3, 0, 0] });
    gps.push({ tag: TAG.GPSLatitudeRef, type: ASCII, value: info.gps.lat >= 0 ? 'N' : 'S' });
    gps.push({ tag: TAG.GPSLatitude, type: RATIONAL, value: dms(info.gps.lat) });
    gps.push({ tag: TAG.GPSLongitudeRef, type: ASCII, value: info.gps.lon >= 0 ? 'E' : 'W' });
    gps.push({ tag: TAG.GPSLongitude, type: RATIONAL, value: dms(info.gps.lon) });
    if (info.gps.alt != null) {
      gps.push({ tag: TAG.GPSAltitudeRef, type: BYTE, value: info.gps.alt < 0 ? 1 : 0 });
      gps.push({ tag: TAG.GPSAltitude, type: RATIONAL, value: Math.abs(info.gps.alt) });
    }
  }
  return buildTiff({ ifd0, exif, gps });
}

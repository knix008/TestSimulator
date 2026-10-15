// Editing metadata inside JPEG files:
//  - EXIF: the whole EXIF block is parsed into its IFDs (image, Exif, GPS,
//    Interop, thumbnail), the requested tags are changed, and the block is
//    written again with fresh offsets. Tags we do not touch keep their raw
//    bytes. (Like other tools, maker notes that store absolute offsets may
//    lose those inner references when the block moves.)
//  - XMP: the embedded XMP packet (APP1 "http://ns.adobe.com/xap/1.0/") is
//    replaced or added — that is how ratings, labels, keywords and IPTC Core
//    fields are "written to the file".
import { exifSegment, insertSegments, isExifSegment, isXmpSegment, metadataSegments, segments } from './jpeg-meta.js';
import { ASCII, BYTE, exifDate, LONG, parseExifDate, RATIONAL, readIfd, SHORT, SRATIONAL, tiffHeader, TYPE_SIZE, UNDEFINED } from './tiffstruct.js';

const POINTERS = { exif: 0x8769, gps: 0x8825, interop: 0xa005 };
const EXIF_ID = [0x45, 0x78, 0x69, 0x66, 0, 0];
const XMP_ID = 'http://ns.adobe.com/xap/1.0/\0';

/** IFD entries with their raw value bytes: [{ tag, type, count, bytes }]. */
function rawEntries(view, start, offset, little) {
  if (!offset) return [];
  return readIfd(view, start, offset, little).entries.map((e) => {
    const size = (TYPE_SIZE[e.type] ?? 1) * e.count;
    const at = Math.min(e.at, view.byteLength);
    const end = Math.min(at + size, view.byteLength);
    return { tag: e.tag, type: e.type, count: e.count, bytes: new Uint8Array(view.buffer, view.byteOffset + at, end - at).slice() };
  });
}

const number = (entry, little) => {
  if (!entry || entry.bytes.length < 2) return 0;
  const view = new DataView(entry.bytes.buffer);
  return entry.type === SHORT ? view.getUint16(0, little) : entry.bytes.length >= 4 ? view.getUint32(0, little) : 0;
};

/** Parses a TIFF/EXIF block (the bytes after "Exif\0\0"). */
export function parseExifBlock(tiff) {
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const header = tiffHeader(view, 0);
  if (!header) throw new Error('not an EXIF block');
  const { little } = header;
  const ifd0 = rawEntries(view, 0, header.ifd0, little);
  const find = (list, tag) => list.find((e) => e.tag === tag);
  const exif = rawEntries(view, 0, number(find(ifd0, POINTERS.exif), little), little);
  const gps = rawEntries(view, 0, number(find(ifd0, POINTERS.gps), little), little);
  const interop = rawEntries(view, 0, number(find(exif, POINTERS.interop), little), little);
  const next = readIfd(view, 0, header.ifd0, little).next;
  const ifd1 = next ? rawEntries(view, 0, next, little) : [];
  let thumbnail = null;
  const thumbOffset = number(find(ifd1, 0x0201), little);
  const thumbLength = number(find(ifd1, 0x0202), little);
  if (thumbOffset && thumbLength && thumbOffset + thumbLength <= tiff.length) thumbnail = tiff.slice(thumbOffset, thumbOffset + thumbLength);
  const strip = (list, tags) => list.filter((e) => !tags.includes(e.tag));
  return {
    little,
    ifd0: strip(ifd0, [POINTERS.exif, POINTERS.gps]),
    exif: strip(exif, [POINTERS.interop]),
    gps,
    interop,
    ifd1: strip(ifd1, [0x0201, 0x0202]),
    thumbnail,
  };
}

function u16(value, little) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, value, little); return b; }
function u32(value, little) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, value, little); return b; }

/** Writes the parsed model back as a TIFF block (fresh offsets). */
export function serializeExifBlock(model) {
  const { little } = model;
  const groups = [];
  const add = (name, entries) => { const g = { name, entries: entries.map((e) => ({ ...e })) }; groups.push(g); return g; };
  const g0 = add('ifd0', model.ifd0);
  const gExif = model.exif.length || model.interop.length ? add('exif', model.exif) : null;
  const gInterop = model.interop.length && gExif ? add('interop', model.interop) : null;
  const gGps = model.gps.length ? add('gps', model.gps) : null;
  const g1 = model.ifd1.length || model.thumbnail ? add('ifd1', model.ifd1) : null;
  const pointer = (group, tag) => ({ tag, type: LONG, count: 1, bytes: new Uint8Array(4), pointer: true });
  if (gExif) g0.entries.push(pointer(gExif, POINTERS.exif));
  if (gGps) g0.entries.push(pointer(gGps, POINTERS.gps));
  if (gInterop) gExif.entries.push(pointer(gInterop, POINTERS.interop));
  if (g1 && model.thumbnail) {
    g1.entries.push({ tag: 0x0201, type: LONG, count: 1, bytes: new Uint8Array(4), thumbOffset: true });
    g1.entries.push({ tag: 0x0202, type: LONG, count: 1, bytes: u32(model.thumbnail.length, little) });
  }
  for (const g of groups) g.entries.sort((a, b) => a.tag - b.tag);

  let offset = 8;
  for (const g of groups) {
    g.offset = offset;
    offset += 2 + g.entries.length * 12 + 4;
    for (const e of g.entries) {
      if (e.bytes.length > 4) {
        e.dataOffset = offset;
        offset += e.bytes.length + (e.bytes.length % 2);
      }
    }
  }
  const thumbAt = model.thumbnail && g1 ? offset : 0;
  if (thumbAt) offset += model.thumbnail.length;

  const out = new Uint8Array(offset);
  const view = new DataView(out.buffer);
  view.setUint16(0, little ? 0x4949 : 0x4d4d);
  view.setUint16(2, 42, little);
  view.setUint32(4, 8, little);
  const offsetOf = (name) => groups.find((g) => g.name === name)?.offset ?? 0;
  for (const g of groups) {
    let p = g.offset;
    view.setUint16(p, g.entries.length, little);
    p += 2;
    for (const e of g.entries) {
      let bytes = e.bytes;
      if (e.pointer) bytes = u32(offsetOf(e.tag === POINTERS.exif ? 'exif' : e.tag === POINTERS.gps ? 'gps' : 'interop'), little);
      if (e.thumbOffset) bytes = u32(thumbAt, little);
      view.setUint16(p, e.tag, little);
      view.setUint16(p + 2, e.type, little);
      view.setUint32(p + 4, e.count, little);
      if (bytes.length > 4) {
        view.setUint32(p + 8, e.dataOffset, little);
        out.set(bytes, e.dataOffset);
      } else {
        out.set(bytes, p + 8);
      }
      p += 12;
    }
    view.setUint32(p, g.name === 'ifd0' && g1 ? g1.offset : 0, little);
  }
  if (thumbAt) out.set(model.thumbnail, thumbAt);
  return out;
}

// ───────────────────────── values

function ascii(text) {
  const bytes = new TextEncoder().encode(`${text}\0`);
  return { type: ASCII, count: bytes.length, bytes };
}

function rationals(values, little, signed = false) {
  const out = new Uint8Array(values.length * 8);
  const view = new DataView(out.buffer);
  values.forEach(([n, d], i) => {
    if (signed) { view.setInt32(i * 8, n, little); view.setInt32(i * 8 + 4, d, little); } else { view.setUint32(i * 8, n, little); view.setUint32(i * 8 + 4, d, little); }
  });
  return { type: signed ? SRATIONAL : RATIONAL, count: values.length, bytes: out };
}

const dms = (value) => {
  const abs = Math.abs(value);
  const d = Math.floor(abs);
  const mFull = (abs - d) * 60;
  const m = Math.floor(mFull);
  return [[d, 1], [m, 1], [Math.round((mFull - m) * 60 * 10000), 10000]];
};

function setTag(list, tag, value) {
  const index = list.findIndex((e) => e.tag === tag);
  if (value == null) { if (index >= 0) list.splice(index, 1); return; }
  const entry = { tag, ...value };
  if (index >= 0) list[index] = entry; else list.push(entry);
}

/**
 * Applies `changes` to a parsed model. Keys (undefined = leave, null/'' = remove):
 * description, make, model, software, artist, copyright, userComment, dateTaken (Date),
 * dateModified (Date), orientation (1–8), gps ({ lat, lon, alt } or null).
 */
export function applyExifChanges(model, changes) {
  const { little } = model;
  const text = (list, tag, key) => {
    if (!(key in changes)) return;
    const value = changes[key];
    setTag(list, tag, value == null || value === '' ? null : ascii(value));
  };
  text(model.ifd0, 0x010e, 'description');
  text(model.ifd0, 0x010f, 'make');
  text(model.ifd0, 0x0110, 'model');
  text(model.ifd0, 0x0131, 'software');
  text(model.ifd0, 0x013b, 'artist');
  text(model.ifd0, 0x8298, 'copyright');
  if ('userComment' in changes) {
    const value = changes.userComment;
    if (!value) setTag(model.exif, 0x9286, null);
    else {
      const body = new TextEncoder().encode(value);
      const bytes = new Uint8Array(8 + body.length);
      bytes.set([0x41, 0x53, 0x43, 0x49, 0x49, 0, 0, 0]); // "ASCII\0\0\0" (UTF-8 text is read fine by exifr and others)
      bytes.set(body, 8);
      setTag(model.exif, 0x9286, { type: UNDEFINED, count: bytes.length, bytes });
    }
  }
  if ('dateTaken' in changes) {
    const value = changes.dateTaken ? ascii(exifDate(changes.dateTaken)) : null;
    setTag(model.exif, 0x9003, value);
    setTag(model.exif, 0x9004, value);
  }
  if ('dateModified' in changes) setTag(model.ifd0, 0x0132, changes.dateModified ? ascii(exifDate(changes.dateModified)) : null);
  if ('orientation' in changes && changes.orientation) setTag(model.ifd0, 0x0112, { type: SHORT, count: 1, bytes: u16(changes.orientation, little) });
  if ('gps' in changes) {
    if (!changes.gps) model.gps = [];
    else {
      const { lat, lon, alt } = changes.gps;
      model.gps = [];
      setTag(model.gps, 0x0000, { type: BYTE, count: 4, bytes: Uint8Array.of(2, 3, 0, 0) });
      setTag(model.gps, 0x0001, ascii(lat >= 0 ? 'N' : 'S'));
      setTag(model.gps, 0x0002, rationals(dms(lat), little));
      setTag(model.gps, 0x0003, ascii(lon >= 0 ? 'E' : 'W'));
      setTag(model.gps, 0x0004, rationals(dms(lon), little));
      if (alt != null && Number.isFinite(alt)) {
        setTag(model.gps, 0x0005, { type: BYTE, count: 1, bytes: Uint8Array.of(alt < 0 ? 1 : 0) });
        setTag(model.gps, 0x0006, rationals([[Math.round(Math.abs(alt) * 100), 100]], little));
      }
    }
  }
  return model;
}

function exifTiffOf(jpeg) {
  const segment = segments(jpeg).find((s) => isExifSegment(jpeg, s));
  return segment ? jpeg.slice(segment.dataStart + EXIF_ID.length, segment.end) : null;
}

function modelOf(jpeg) {
  const tiff = exifTiffOf(jpeg);
  return tiff ? parseExifBlock(tiff) : { little: true, ifd0: [], exif: [], gps: [], interop: [], ifd1: [], thumbnail: null };
}

/** Copy of the JPEG with this EXIF model written back (an EXIF block is created when there is none). */
function writeModel(jpeg, model) {
  if (!model.ifd0.some((e) => e.tag === 0x0112)) setTag(model.ifd0, 0x0112, { type: SHORT, count: 1, bytes: u16(1, model.little) });
  let block = serializeExifBlock(model);
  if (block.length + 8 > 0xffff && model.thumbnail) {
    // Too big for one segment: drop the embedded thumbnail first.
    model.thumbnail = null;
    model.ifd1 = [];
    block = serializeExifBlock(model);
  }
  const others = metadataSegments(jpeg).filter((seg) => !(seg[1] === 0xe1 && seg[4] === 0x45 && seg[5] === 0x78 && seg[6] === 0x69 && seg[7] === 0x66));
  return insertSegments(jpeg, [exifSegment(block), ...others]);
}

/** Copy of the JPEG with the EXIF changes (an EXIF block is created when there is none). */
export function editJpegExif(jpeg, changes) {
  const model = modelOf(jpeg);
  applyExifChanges(model, changes);
  return writeModel(jpeg, model);
}

// Tag names exifr shows, and how to write a new value back into the same IFD.
const FIELD = {
  image: {
    ImageDescription: { ifd: 'ifd0', tag: 0x010e, kind: 'ascii' },
    Make: { ifd: 'ifd0', tag: 0x010f, kind: 'ascii' },
    Model: { ifd: 'ifd0', tag: 0x0110, kind: 'ascii' },
    Orientation: { ifd: 'ifd0', tag: 0x0112, kind: 'short' },
    XResolution: { ifd: 'ifd0', tag: 0x011a, kind: 'rational' },
    YResolution: { ifd: 'ifd0', tag: 0x011b, kind: 'rational' },
    ResolutionUnit: { ifd: 'ifd0', tag: 0x0128, kind: 'short' },
    Software: { ifd: 'ifd0', tag: 0x0131, kind: 'ascii' },
    ModifyDate: { ifd: 'ifd0', tag: 0x0132, kind: 'date' },
    Artist: { ifd: 'ifd0', tag: 0x013b, kind: 'ascii' },
    Copyright: { ifd: 'ifd0', tag: 0x8298, kind: 'ascii' },
  },
  exif: {
    ExposureTime: { ifd: 'exif', tag: 0x829a, kind: 'rational' },
    FNumber: { ifd: 'exif', tag: 0x829d, kind: 'rational' },
    ISO: { ifd: 'exif', tag: 0x8827, kind: 'short' },
    DateTimeOriginal: { ifd: 'exif', tag: 0x9003, kind: 'date' },
    CreateDate: { ifd: 'exif', tag: 0x9004, kind: 'date' },
    ExposureCompensation: { ifd: 'exif', tag: 0x9204, kind: 'srational' },
    Flash: { ifd: 'exif', tag: 0x9209, kind: 'short' },
    FocalLength: { ifd: 'exif', tag: 0x920a, kind: 'rational' },
    UserComment: { ifd: 'exif', tag: 0x9286, kind: 'comment' },
    ExifImageWidth: { ifd: 'exif', tag: 0xa002, kind: 'long' },
    ExifImageHeight: { ifd: 'exif', tag: 0xa003, kind: 'long' },
    LensMake: { ifd: 'exif', tag: 0xa433, kind: 'ascii' },
    LensModel: { ifd: 'exif', tag: 0xa434, kind: 'ascii' },
    FocalLengthIn35mmFormat: { ifd: 'exif', tag: 0xa405, kind: 'short' },
  },
  gps: {
    GPSVersionID: { ifd: 'gps', tag: 0x0000, kind: 'bytes' },
    GPSLatitudeRef: { kind: 'gps' },
    GPSLatitude: { kind: 'gps' },
    GPSLongitudeRef: { kind: 'gps' },
    GPSLongitude: { kind: 'gps' },
    GPSAltitudeRef: { kind: 'gps' },
    GPSAltitude: { kind: 'gps' },
    latitude: { kind: 'gps' },
    longitude: { kind: 'gps' },
  },
};

/** True when this grouped tag can be written back into a JPEG. */
export function metadataFieldEditable(group, name) {
  if (group === 'thumbnail') return Boolean(FIELD.image[name]);
  return Boolean(FIELD[group]?.[name]);
}

function fieldSpec(group, name) {
  if (group === 'thumbnail') {
    const spec = FIELD.image[name];
    return spec ? { ...spec, ifd: 'ifd1' } : null;
  }
  return FIELD[group]?.[name] ?? null;
}

function num(text) {
  const n = Number(String(text).trim());
  if (!Number.isFinite(n)) throw new Error('number');
  return n;
}

function oneRational(text) {
  const slash = /^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/.exec(String(text).trim());
  if (slash) return [Math.round(Number(slash[1])), Math.round(Number(slash[2])) || 1];
  const n = num(text);
  if (n !== 0 && Math.abs(n) < 1) return [1, Math.round(1 / n)];
  return [Math.round(n * 1000), 1000];
}

function encodeField(spec, text, existing, little) {
  const value = text.trim();
  if (spec.kind === 'comment') return null;
  if (!value) return null;
  if (spec.kind === 'date') {
    const normalized = value.replace('T', ' ');
    const date = parseExifDate(/ \d{2}:\d{2}:\d{2}$/.test(normalized) ? normalized : `${normalized}:00`);
    if (!date) throw new Error('date');
    return ascii(exifDate(date));
  }
  if (spec.kind === 'ascii') return ascii(value);
  if (spec.kind === 'short') return { type: SHORT, count: 1, bytes: u16(num(value), little) };
  if (spec.kind === 'long') return { type: LONG, count: 1, bytes: u32(num(value), little) };
  if (spec.kind === 'bytes') {
    const parts = value.split(/[.,\s]+/).filter(Boolean).map((part) => num(part));
    return { type: BYTE, count: parts.length, bytes: Uint8Array.from(parts.map((n) => n & 255)) };
  }
  if (spec.kind === 'rational' || spec.kind === 'srational') {
    const parts = value.split(/[,;]/).map((part) => part.trim()).filter(Boolean);
    return rationals(parts.map(oneRational), little, spec.kind === 'srational' || existing?.type === SRATIONAL);
  }
  return null;
}

function asciiOf(entry) {
  return entry ? new TextDecoder().decode(entry.bytes).replace(/\0+$/, '') : '';
}

function rationalParts(entry, little) {
  if (!entry || entry.bytes.length < 8) return [];
  const view = new DataView(entry.bytes.buffer, entry.bytes.byteOffset, entry.bytes.byteLength);
  const signed = entry.type === SRATIONAL;
  const out = [];
  for (let i = 0; i + 8 <= entry.bytes.length; i += 8) {
    const n = signed ? view.getInt32(i, little) : view.getUint32(i, little);
    const d = signed ? view.getInt32(i + 4, little) : view.getUint32(i + 4, little);
    out.push(d ? n / d : 0);
  }
  return out;
}

function dmsDecimal(parts) {
  if (!parts.length) return null;
  if (parts.length === 1) return parts[0];
  return parts[0] + (parts[1] || 0) / 60 + (parts[2] || 0) / 3600;
}

function gpsNow(model) {
  const find = (tag) => model.gps.find((entry) => entry.tag === tag);
  const lat = dmsDecimal(rationalParts(find(0x0002), model.little));
  const lon = dmsDecimal(rationalParts(find(0x0004), model.little));
  const alt = rationalParts(find(0x0006), model.little)[0];
  const below = find(0x0005)?.bytes[0] === 1;
  return {
    lat: lat == null ? null : Math.abs(lat) * (asciiOf(find(0x0001)) === 'S' ? -1 : 1),
    lon: lon == null ? null : Math.abs(lon) * (asciiOf(find(0x0003)) === 'W' ? -1 : 1),
    alt: alt == null ? null : Math.abs(alt) * (below ? -1 : 1),
  };
}

function parseDegrees(text) {
  const parts = String(text).trim().split(/[, ]+/).filter(Boolean).map(Number);
  if (!parts.length || parts.some((n) => !Number.isFinite(n))) return null;
  return dmsDecimal(parts);
}

/** Copy of the JPEG with one metadata field changed. `group` is image, exif, gps, or thumbnail. */
export function editMetadataField(jpeg, group, name, text) {
  const spec = fieldSpec(group, name);
  if (!spec) throw new Error('readonly');
  const model = modelOf(jpeg);
  if (spec.kind === 'gps') {
    const gps = gpsNow(model);
    const value = String(text ?? '').trim();
    if ((name === 'latitude' || name === 'GPSLatitude') && !value) return editJpegExif(jpeg, { gps: null });
    if (name === 'latitude' || name === 'longitude') {
      const n = num(value);
      gps[name === 'latitude' ? 'lat' : 'lon'] = n;
    } else if (name === 'GPSLatitude' || name === 'GPSLongitude') {
      const n = parseDegrees(value);
      if (n == null) throw new Error('number');
      const key = name === 'GPSLatitude' ? 'lat' : 'lon';
      gps[key] = (gps[key] < 0 ? -1 : 1) * Math.abs(n);
    } else if (name === 'GPSAltitude') {
      gps.alt = value ? num(value) : null;
    } else if (name === 'GPSLatitudeRef') {
      if (gps.lat == null) throw new Error('gps');
      gps.lat = Math.abs(gps.lat) * (/^s/i.test(value) ? -1 : 1);
    } else if (name === 'GPSLongitudeRef') {
      if (gps.lon == null) throw new Error('gps');
      gps.lon = Math.abs(gps.lon) * (/^w/i.test(value) ? -1 : 1);
    } else if (name === 'GPSAltitudeRef') {
      gps.alt = Math.abs(gps.alt ?? 0) * (value === '1' || /^b/i.test(value) ? -1 : 1);
    }
    if (gps.lat == null || gps.lon == null) throw new Error('gps');
    return editJpegExif(jpeg, { gps: { lat: gps.lat, lon: gps.lon, alt: gps.alt } });
  }
  if (spec.kind === 'comment') return editJpegExif(jpeg, { userComment: String(text ?? '').trim() });
  const list = model[spec.ifd];
  const existing = list.find((entry) => entry.tag === spec.tag);
  const encoded = encodeField(spec, String(text ?? ''), existing, model.little);
  setTag(list, spec.tag, encoded);
  return writeModel(jpeg, model);
}

/** Copy of the JPEG with `xmp` (packet text) as its embedded XMP (replacing any). */
export function embedJpegXmp(jpeg, xmp) {
  const id = new TextEncoder().encode(XMP_ID);
  const body = new TextEncoder().encode(xmp);
  const length = 2 + id.length + body.length;
  if (length > 0xffff) throw new Error('XMP packet too large for one JPEG segment');
  const segment = new Uint8Array(2 + length);
  segment[0] = 0xff; segment[1] = 0xe1; segment[2] = length >> 8; segment[3] = length & 0xff;
  segment.set(id, 4);
  segment.set(body, 4 + id.length);
  const kept = [];
  for (const s of segments(jpeg)) {
    if (s.marker === 0xda) break;
    if (s.marker === 0xe1 && isXmpSegment(jpeg, s)) continue;
    if (s.marker === 0xe1 || s.marker === 0xe2 || s.marker === 0xed) kept.push(jpeg.slice(s.start, s.end));
  }
  // EXIF first, then XMP, then ICC / IPTC.
  const exif = kept.filter((seg) => seg[4] === 0x45 && seg[5] === 0x78);
  const rest = kept.filter((seg) => !(seg[4] === 0x45 && seg[5] === 0x78));
  return insertSegments(jpeg, [...exif, segment, ...rest]);
}

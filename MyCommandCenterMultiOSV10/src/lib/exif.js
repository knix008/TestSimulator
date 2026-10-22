// A small EXIF reader for JPEG files (the APP1 segment): camera, lens,
// exposure, the date the picture was taken, orientation and GPS position —
// what the file-info window lists under "Image". Anything it does not know
// is simply left out; a broken segment yields no rows, never an error.

const TAGS = {
  0x010f: 'make', 0x0110: 'model', 0x0112: 'orientation', 0x0131: 'software', 0x0132: 'dateTime', 0x013b: 'artist', 0x8298: 'copyright',
  0x829a: 'exposureTime', 0x829d: 'fNumber', 0x8827: 'iso', 0x9003: 'dateTimeOriginal', 0x920a: 'focalLength', 0xa405: 'focalLength35',
  0xa002: 'width', 0xa003: 'height', 0xa434: 'lensModel', 0x9209: 'flash', 0x8822: 'exposureProgram', 0xa402: 'exposureMode', 0xa403: 'whiteBalance',
};
const GPS = { 0x0001: 'latRef', 0x0002: 'lat', 0x0003: 'lngRef', 0x0004: 'lng', 0x0005: 'altRef', 0x0006: 'alt' };
const SIZES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

export function readExif(bytes) {
  try {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
    let off = 2;
    while (off + 4 < bytes.length) {
      if (bytes[off] !== 0xff) return null;
      const marker = bytes[off + 1];
      const len = (bytes[off + 2] << 8) | bytes[off + 3];
      if (marker === 0xe1 && bytes[off + 4] === 0x45 && bytes[off + 5] === 0x78 && bytes[off + 6] === 0x69 && bytes[off + 7] === 0x66) {
        return parseTiff(bytes.subarray(off + 10, off + 2 + len));
      }
      if (marker === 0xda) return null;   // start of scan: no EXIF before the image data
      off += 2 + len;
    }
  } catch { /* malformed */ }
  return null;
}

function parseTiff(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const le = b[0] === 0x49;
  const u16 = (o) => dv.getUint16(o, le), u32 = (o) => dv.getUint32(o, le), s32 = (o) => dv.getInt32(o, le);
  if (u16(2) !== 42) return null;
  const out = {};
  const readIfd = (start, names, into) => {
    if (start + 2 > b.length) return;
    const n = u16(start);
    for (let i = 0; i < n; i++) {
      const e = start + 2 + i * 12;
      if (e + 12 > b.length) break;
      const tag = u16(e), type = u16(e + 2), count = u32(e + 4);
      const size = (SIZES[type] || 1) * count;
      const at = size > 4 ? u32(e + 8) : e + 8;
      if (at + size > b.length) continue;
      const val = () => {
        if (type === 2) { let s = ''; for (let k = 0; k < count && b[at + k]; k++) s += String.fromCharCode(b[at + k]); return s.trim(); }
        if (type === 3) return count === 1 ? u16(at) : Array.from({ length: count }, (_, k) => u16(at + k * 2));
        if (type === 4) return count === 1 ? u32(at) : Array.from({ length: count }, (_, k) => u32(at + k * 4));
        if (type === 5 || type === 10) { const r = (k) => { const a = type === 5 ? u32(at + k * 8) : s32(at + k * 8), d = type === 5 ? u32(at + k * 8 + 4) : s32(at + k * 8 + 4); return d ? a / d : 0; }; return count === 1 ? r(0) : Array.from({ length: count }, (_, k) => r(k)); }
        return null;
      };
      if (tag === 0x8769) readIfd(u32(e + 8), TAGS, into);
      else if (tag === 0x8825) readIfd(u32(e + 8), GPS, into.gps || (into.gps = {}));
      else if (names[tag]) { const v = val(); if (v !== null && v !== '') into[names[tag]] = v; }
    }
  };
  readIfd(u32(4), TAGS, out);
  return Object.keys(out).length ? out : null;
}

const dms = (v, ref) => { if (!Array.isArray(v) || v.length < 3) return null; const d = v[0] + v[1] / 60 + v[2] / 3600; return (ref === 'S' || ref === 'W' ? -d : d); };

// EXIF → [label key, value] rows for the info window (the keys are i18n ids).
export function exifRows(x) {
  if (!x) return [];
  const rows = [];
  const camera = x.model && x.make && x.model.toLowerCase().startsWith(x.make.toLowerCase()) ? x.model : [x.make, x.model].filter(Boolean).join(' ');
  if (camera) rows.push(['info_camera', camera]);
  if (x.lensModel) rows.push(['info_lens', x.lensModel]);
  if (x.dateTimeOriginal || x.dateTime) rows.push(['info_taken', x.dateTimeOriginal || x.dateTime]);
  const exp = [];
  if (x.exposureTime) exp.push(x.exposureTime >= 1 ? `${x.exposureTime} s` : `1/${Math.round(1 / x.exposureTime)} s`);
  if (x.fNumber) exp.push(`f/${Number(x.fNumber.toFixed(1))}`);
  if (x.iso) exp.push(`ISO ${Array.isArray(x.iso) ? x.iso[0] : x.iso}`);
  if (x.focalLength) exp.push(`${Number(x.focalLength.toFixed(1))} mm${x.focalLength35 ? ` (${x.focalLength35} mm)` : ''}`);
  if (exp.length) rows.push(['info_exposure', exp.join('  ·  ')]);
  if (x.orientation && x.orientation !== 1) rows.push(['info_orientation', String(x.orientation)]);
  if (x.software) rows.push(['info_software', x.software]);
  if (x.artist) rows.push(['info_artist', x.artist]);
  if (x.copyright) rows.push(['info_copyright', x.copyright]);
  if (x.gps && x.gps.lat && x.gps.lng) {
    const lat = dms(x.gps.lat, x.gps.latRef), lng = dms(x.gps.lng, x.gps.lngRef);
    if (lat !== null && lng !== null) rows.push(['info_gps', `${lat.toFixed(6)}, ${lng.toFixed(6)}${typeof x.gps.alt === 'number' ? `  ·  ${Math.round(x.gps.alt)} m` : ''}`]);
  }
  return rows;
}

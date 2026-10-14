// Photo metadata (EXIF, GPS, IPTC, XMP) through exifr.
//  - summarize(): the fields the catalog keeps for every photo (date taken,
//    camera, lens, exposure, GPS, embedded rating / label / keywords …)
//  - readMetadata(): that summary, plus every tag grouped for the Properties pane
import exifr from 'exifr';

const OPTIONS = {
  tiff: true, exif: true, gps: true, iptc: true, xmp: true, icc: false, jfif: false, ihdr: true, interop: false,
  makerNote: false, userComment: true, translateKeys: true, translateValues: false, reviveValues: true, sanitize: true, mergeOutput: true,
  silentErrors: true,
};

const text = (value) => {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(', ');
  if (typeof value === 'object') return text(value.value ?? value['x-default'] ?? Object.values(value)[0]);
  return String(value).replace(/\0+$/, '').trim();
};
const list = (value) => {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap(list);
  if (typeof value === 'object') return list(value.value ?? Object.values(value));
  return String(value).split(/[;,]/).map((part) => part.trim()).filter(Boolean);
};
const number = (value) => {
  const n = typeof value === 'number' ? value : Array.isArray(value) ? Number(value[0]) : Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
};
const time = (value) => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value === 'string') {
    const match = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(value);
    if (match) return new Date(+match[1], +match[2] - 1, +match[3], +match[4], +match[5], +(match[6] ?? 0)).getTime();
  }
  return null;
};

/** "Canon" + "Canon EOS R5" → "Canon EOS R5"; "NIKON CORPORATION" + "NIKON D850" → "Nikon D850". */
export function cameraName(make, model) {
  const m = text(make).replace(/\s+(CORPORATION|Corporation|CORP\.?|Co\.,? ?Ltd\.?|COMPANY|IMAGING CORP\.?|OPTICAL CO\.?,?LTD|Camera AG)$/i, '').trim();
  const mo = text(model).trim();
  const pretty = (s) => (s === s.toUpperCase() && s.length > 3 ? s.charAt(0) + s.slice(1).toLowerCase() : s);
  if (!m) return mo;
  if (!mo) return pretty(m);
  if (mo.toLowerCase().startsWith(m.toLowerCase().split(' ')[0])) return `${pretty(m)}${mo.slice(m.split(' ')[0].length)}`.replace(/\s+/g, ' ').trim();
  return `${pretty(m)} ${mo}`;
}

/** Catalog summary from exifr's merged output (pure: unit-tested). */
export function summarize(tags) {
  if (!tags) return {};
  const t = tags;
  const out = {};
  const taken = time(t.DateTimeOriginal) ?? time(t.CreateDate) ?? time(t.DateCreated) ?? time(t.DateTimeDigitized) ?? time(t.ModifyDate) ?? time(t.DateTime);
  if (taken) out.taken = taken;
  const camera = cameraName(t.Make, t.Model);
  if (camera) out.camera = camera;
  if (t.Make) out.make = text(t.Make);
  if (t.Model) out.model = text(t.Model);
  const lens = text(t.LensModel ?? t.Lens ?? t.LensInfo ?? t.LensID);
  if (lens && !/^[\d.\s,]+$/.test(lens)) out.lens = lens;
  const iso = number(t.ISO ?? t.ISOSpeedRatings ?? t.PhotographicSensitivity);
  if (iso) out.iso = iso;
  const fNumber = number(t.FNumber ?? t.ApertureValue);
  if (fNumber) out.fNumber = Math.round(fNumber * 10) / 10;
  const exposure = number(t.ExposureTime);
  if (exposure) out.exposure = exposure;
  const focal = number(t.FocalLength);
  if (focal) out.focal = Math.round(focal * 10) / 10;
  const focal35 = number(t.FocalLengthIn35mmFormat);
  if (focal35) out.focal35 = focal35;
  if (t.Flash != null) out.flash = typeof t.Flash === 'number' ? Boolean(t.Flash & 1) : /fired|on/i.test(String(t.Flash)) && !/not|off|no flash/i.test(String(t.Flash));
  const bias = number(t.ExposureCompensation ?? t.ExposureBiasValue);
  if (bias != null && bias !== 0) out.bias = Math.round(bias * 100) / 100;
  const width = number(t.ExifImageWidth ?? t.PixelXDimension ?? t.ImageWidth);
  const height = number(t.ExifImageHeight ?? t.PixelYDimension ?? t.ImageHeight);
  if (width && height) { out.exifWidth = width; out.exifHeight = height; }
  const orientation = number(t.Orientation);
  if (orientation >= 1 && orientation <= 8) out.orientation = orientation;
  const lat = number(t.latitude);
  const lon = number(t.longitude);
  if (lat != null && lon != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0)) {
    out.lat = Math.round(lat * 1e6) / 1e6;
    out.lon = Math.round(lon * 1e6) / 1e6;
    const alt = number(t.GPSAltitude);
    if (alt != null) out.alt = Math.round((t.GPSAltitudeRef === 1 ? -alt : alt) * 10) / 10;
  }
  for (const [key, source] of [['software', t.Software ?? t.CreatorTool], ['artist', t.Artist ?? t.creator ?? t['By-line']], ['copyright', t.Copyright ?? t.rights ?? t.CopyrightNotice],
    ['caption', t.ImageDescription ?? t.description ?? t['Caption-Abstract'] ?? t.UserComment], ['title', t.title ?? t.ObjectName ?? t.Headline],
    ['city', t.City ?? t.city], ['country', t.Country ?? t['Country-PrimaryLocationName'] ?? t.country]]) {
    const value = text(source);
    if (value && !/^(ascii|unicode|default)?\s*$/i.test(value)) out[key] = value.slice(0, 2000);
  }
  const rating = number(t.Rating);
  if (rating != null && rating >= 0 && rating <= 5) out.xmpRating = Math.round(rating);
  if (rating === -1) out.xmpRating = -1;
  const label = text(t.Label);
  if (label) out.xmpLabel = label;
  const keywords = [...new Set([...list(t.subject), ...list(t.Keywords)])];
  if (keywords.length) out.keywords = keywords.slice(0, 200);
  const hierarchical = list(t.hierarchicalSubject);
  if (hierarchical.length) out.hierarchical = hierarchical.slice(0, 200);
  return out;
}

const GROUPS = {
  ifd0: 'image', ifd1: 'thumbnail', exif: 'exif', gps: 'gps', iptc: 'iptc', xmp: 'xmp', ihdr: 'png',
};

/**
 * Summary and grouped tags: { summary, groups: [{ id, tags: [[name, value]] }] }.
 * Returns empty results for files without metadata (never throws).
 */
export async function readMetadata(bytes, { groups = false } = {}) {
  try {
    const merged = await exifr.parse(bytes, OPTIONS);
    const summary = summarize(merged);
    if (!groups) return { summary };
    const split = await exifr.parse(bytes, { ...OPTIONS, mergeOutput: false, translateValues: true, reviveValues: true });
    const out = [];
    for (const [key, value] of Object.entries(split ?? {})) {
      if (!value || typeof value !== 'object') continue;
      const tags = Object.entries(value)
        .filter(([, v]) => v != null && !(v instanceof Uint8Array) && !(ArrayBuffer.isView(v) && v.length > 16))
        .map(([name, v]) => [name, display(v)])
        .filter(([, v]) => v !== '' && v.length < 400);
      if (tags.length) out.push({ id: GROUPS[key] ?? key, tags });
    }
    return { summary, groups: out };
  } catch {
    return { summary: {}, groups: [] };
  }
}

function display(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toLocaleString();
  if (Array.isArray(value)) return value.map(display).join(', ');
  if (ArrayBuffer.isView(value)) return Array.from(value).join(' ');
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Math.round(value * 10000) / 10000);
  if (typeof value === 'object') return text(value);
  return String(value).replace(/\0+$/, '');
}

/** "1/250 s", "2.5 s". */
export function formatExposure(seconds) {
  if (!seconds) return '';
  if (seconds >= 1) return `${Math.round(seconds * 10) / 10} s`;
  return `1/${Math.round(1 / seconds)} s`;
}

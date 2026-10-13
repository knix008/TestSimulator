// Opening 2D CAD drawings from bytes: picks the format by extension and
// content, decodes the text (UTF-8, or the DXF's code page), and turns
// binary DXF into the same group pairs as text DXF.
//   DXF (text R12–2018 and binary) · SVG · HP-GL/2 · IGES · Gerber · Excellon
import { importDxf, looksLikeDxf } from './dxf.js';
import { importHpgl, importSvg, looksLikeHpgl } from './formats2d.js';
import { importExcellon, importGerber, looksLikeExcellon, looksLikeGerber } from './gerber.js';
import { importIges, looksLikeIges } from './iges.js';
import { normalizeEntity } from './entities.js';

/** Extensions of each 2D drawing format MyCAD opens. */
export const DRAWING_FORMATS = {
  dxf: ['dxf'],
  svg: ['svg'],
  hpgl: ['plt', 'hpgl', 'hgl', 'hp2', 'pen'],
  iges: ['igs', 'iges'],
  gerber: ['gbr', 'ger', 'gtl', 'gbl', 'gto', 'gbo', 'gts', 'gbs', 'gtp', 'gbp', 'gko', 'gm1', 'gml', 'art', 'pho'],
  excellon: ['drl', 'xln', 'exc', 'drd'],
};
export const DRAWING_EXTENSIONS = Object.values(DRAWING_FORMATS).flat();
const extensionOf = (name) => (/\.([^.\\/]+)$/.exec(String(name ?? ''))?.[1] ?? '').toLowerCase();
export const isCadDrawingFileName = (name) => DRAWING_EXTENSIONS.includes(extensionOf(name));
export const formatOfName = (name) => Object.entries(DRAWING_FORMATS).find(([, list]) => list.includes(extensionOf(name)))?.[0] ?? null;

// ───────────────────────── text

/** DXF $DWGCODEPAGE → TextDecoder label. */
const CODE_PAGES = {
  ANSI_874: 'windows-874', ANSI_932: 'shift_jis', ANSI_936: 'gbk', ANSI_949: 'euc-kr', ANSI_950: 'big5', ANSI_1250: 'windows-1250', ANSI_1251: 'windows-1251',
  ANSI_1252: 'windows-1252', ANSI_1253: 'windows-1253', ANSI_1254: 'windows-1254', ANSI_1255: 'windows-1255', ANSI_1256: 'windows-1256', ANSI_1257: 'windows-1257', ANSI_1258: 'windows-1258',
  DOS932: 'shift_jis', DOS949: 'euc-kr', DOS936: 'gbk', DOS950: 'big5',
};

/**
 * Bytes → text: UTF-8 (with or without BOM), UTF-16 with BOM, else the DXF's
 * code page, else EUC-KR for Korean users and Windows-1252 otherwise.
 */
export function decodeText(bytes, { language = 'ko' } = {}) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2));
  const body = b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? b.subarray(3) : b;
  try { return new TextDecoder('utf-8', { fatal: true }).decode(body); } catch { /* not UTF-8 */ }
  const latin = new TextDecoder('windows-1252').decode(body.subarray(0, Math.min(body.length, 200000)));
  const page = /\$DWGCODEPAGE\s*\r?\n\s*3\s*\r?\n\s*(\S+)/i.exec(latin)?.[1]?.toUpperCase();
  const label = CODE_PAGES[page] ?? (language === 'ko' ? 'euc-kr' : 'windows-1252');
  try { return new TextDecoder(label).decode(body); } catch { return new TextDecoder('windows-1252').decode(body); }
}

// ───────────────────────── binary DXF

const SENTINEL = 'AutoCAD Binary DXF\r\n\x1a\0';
export const isBinaryDxf = (bytes) => bytes.length > 22 && String.fromCharCode(...bytes.subarray(0, 22)) === SENTINEL;

/** Value type of a group code (DXF reference, "Group Code Value Types"). */
function typeOf(code) {
  if ((code >= 0 && code <= 9) || code === 100 || code === 101 || code === 102 || code === 105 || (code >= 300 && code <= 309) || (code >= 320 && code <= 369) || (code >= 390 && code <= 399) || (code >= 410 && code <= 419) || (code >= 430 && code <= 439) || (code >= 470 && code <= 481) || code === 999 || (code >= 1000 && code <= 1003) || (code >= 1005 && code <= 1009)) return 'string';
  if ((code >= 10 && code <= 59) || (code >= 110 && code <= 149) || (code >= 210 && code <= 239) || (code >= 460 && code <= 469) || (code >= 1010 && code <= 1059)) return 'double';
  if ((code >= 60 && code <= 79) || (code >= 170 && code <= 179) || (code >= 270 && code <= 289) || (code >= 370 && code <= 389) || (code >= 400 && code <= 409) || (code >= 1060 && code <= 1070)) return 'int16';
  if ((code >= 90 && code <= 99) || (code >= 420 && code <= 429) || (code >= 440 && code <= 449) || code === 1071) return 'int32';
  if (code >= 160 && code <= 169) return 'int64';
  if (code >= 290 && code <= 299) return 'bool';
  if ((code >= 310 && code <= 319) || code === 1004) return 'binary';
  return 'string';
}

/**
 * Binary DXF → group pairs { code, value: string } like the text tokenizer.
 * R12 files use one-byte group codes (255 = an int16 code follows), R13 and
 * later two-byte codes; the format is told apart by the first pairs.
 */
export function binaryDxfPairs(bytes, { language = 'ko' } = {}) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // "0 SECTION": with two-byte codes the first bytes are 00 00 'S'.
  const wide = bytes[22] === 0 && bytes[23] === 0 && bytes[24] === 0x53;
  let i = 22;
  const pairs = [];
  const strings = [];
  const readString = () => {
    let end = i;
    while (end < bytes.length && bytes[end] !== 0) end++;
    const raw = bytes.subarray(i, end);
    i = end + 1;
    strings.push(raw);
    return raw;
  };
  while (i < bytes.length) {
    let code;
    if (wide) { code = view.getUint16(i, true); i += 2; } else { code = bytes[i]; i += 1; if (code === 255) { code = view.getUint16(i, true); i += 2; } }
    const type = typeOf(code);
    let value;
    switch (type) {
      case 'double': value = String(view.getFloat64(i, true)); i += 8; break;
      case 'int16': value = String(view.getInt16(i, true)); i += 2; break;
      case 'int32': value = String(view.getInt32(i, true)); i += 4; break;
      case 'int64': value = String(view.getBigInt64(i, true)); i += 8; break;
      case 'bool': value = String(bytes[i]); i += 1; break;
      case 'binary': { const n = bytes[i]; value = [...bytes.subarray(i + 1, i + 1 + n)].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase(); i += 1 + n; break; }
      default: value = readString();
    }
    pairs.push({ code, value });
    if (code === 0 && value instanceof Uint8Array && value.length === 3 && value[0] === 69 && value[1] === 79 && value[2] === 70) break; // EOF
  }
  // Strings: UTF-8 (R2007+) or the drawing's code page.
  const all = new Uint8Array(strings.reduce((n, s) => n + s.length + 1, 0));
  let at = 0;
  for (const s of strings) { all.set(s, at); at += s.length; all[at++] = 10; }
  const decoded = decodeText(all, { language }).split('\n');
  let k = 0;
  for (const pair of pairs) if (typeof pair.value !== 'string') pair.value = decoded[k++] ?? '';
  return pairs;
}

// ───────────────────────── dispatch

/**
 * A drawing from file bytes. Returns { drawing, format, imported, skipped, units }.
 * The format comes from the content when it is recognisable, else from the extension.
 */
export function importDrawingBytes(name, bytes, { language = 'ko', title = null } = {}) {
  const base = title ?? (String(name ?? '').split(/[\\/]/).pop().replace(/\.[^.]+$/, '') || 'Drawing');
  const options = { title: base, language };
  if (isBinaryDxf(bytes)) return { ...importDxf(binaryDxfPairs(bytes, { language }), options), format: 'dxf' };
  const text = decodeText(bytes, { language });
  const byName = formatOfName(name);
  const format = looksLikeDxf(text) ? 'dxf'
    : /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(text.slice(0, 4000)) ? 'svg'
      : looksLikeIges(text) ? 'iges'
        : looksLikeExcellon(text) ? 'excellon'
          : looksLikeGerber(text) ? 'gerber'
            : looksLikeHpgl(text) ? 'hpgl'
              : byName;
  if (format === 'dxf') return { ...importDxf(text, options), format };
  const reader = { svg: importSvg, iges: importIges, gerber: importGerber, excellon: importExcellon, hpgl: importHpgl }[format];
  if (!reader) throw new Error(`${name}: not a drawing format MyCAD reads`);
  const result = reader(text, options);
  // The readers build plain records: repaired into entities like a file read from disk.
  result.drawing.entities = result.drawing.entities.map(normalizeEntity).filter(Boolean);
  return { ...result, imported: result.drawing.entities.length, format };
}

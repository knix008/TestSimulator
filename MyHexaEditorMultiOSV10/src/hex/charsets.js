// The text column: what character each byte shows in a character set, and the bytes a typed character
// becomes. Single-byte sets are tables (the same as crates/hexcore/src/codec.rs); multi-byte sets (UTF-8,
// UTF-16, EUC-KR, Shift_JIS) show the character on its first byte and a continuation mark on the others.

export const CHARSETS = ['ascii', 'latin1', 'cp1252', 'cp437', 'ebcdic', 'utf8', 'utf16le', 'utf16be', 'euc-kr', 'shift_jis'];
export const CHARSET_NAMES = {
  ascii: 'ASCII', latin1: 'ISO-8859-1 (Latin-1)', cp1252: 'Windows-1252 (ANSI)', cp437: 'CP437 (DOS, OEM)', ebcdic: 'EBCDIC (CP037)',
  utf8: 'UTF-8', utf16le: 'UTF-16 LE', utf16be: 'UTF-16 BE', 'euc-kr': 'EUC-KR (CP949)', shift_jis: 'Shift_JIS',
};

const CP437_HIGH = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';
const CP1252_80 = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ';
const EBCDIC = [
  0x00, 0x01, 0x02, 0x03, 0x9C, 0x09, 0x86, 0x7F, 0x97, 0x8D, 0x8E, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x10, 0x11, 0x12, 0x13, 0x9D, 0x85, 0x08, 0x87, 0x18, 0x19, 0x92, 0x8F, 0x1C, 0x1D, 0x1E, 0x1F,
  0x80, 0x81, 0x82, 0x83, 0x84, 0x0A, 0x17, 0x1B, 0x88, 0x89, 0x8A, 0x8B, 0x8C, 0x05, 0x06, 0x07, 0x90, 0x91, 0x16, 0x93, 0x94, 0x95, 0x96, 0x04, 0x98, 0x99, 0x9A, 0x9B, 0x14, 0x15, 0x9E, 0x1A,
  0x20, 0xA0, 0xE2, 0xE4, 0xE0, 0xE1, 0xE3, 0xE5, 0xE7, 0xF1, 0xA2, 0x2E, 0x3C, 0x28, 0x2B, 0x7C, 0x26, 0xE9, 0xEA, 0xEB, 0xE8, 0xED, 0xEE, 0xEF, 0xEC, 0xDF, 0x21, 0x24, 0x2A, 0x29, 0x3B, 0xAC,
  0x2D, 0x2F, 0xC2, 0xC4, 0xC0, 0xC1, 0xC3, 0xC5, 0xC7, 0xD1, 0xA6, 0x2C, 0x25, 0x5F, 0x3E, 0x3F, 0xF8, 0xC9, 0xCA, 0xCB, 0xC8, 0xCD, 0xCE, 0xCF, 0xCC, 0x60, 0x3A, 0x23, 0x40, 0x27, 0x3D, 0x22,
  0xD8, 0x61, 0x62, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0xAB, 0xBB, 0xF0, 0xFD, 0xFE, 0xB1, 0xB0, 0x6A, 0x6B, 0x6C, 0x6D, 0x6E, 0x6F, 0x70, 0x71, 0x72, 0xAA, 0xBA, 0xE6, 0xB8, 0xC6, 0xA4,
  0xB5, 0x7E, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7A, 0xA1, 0xBF, 0xD0, 0xDD, 0xDE, 0xAE, 0x5E, 0xA3, 0xA5, 0xB7, 0xA9, 0xA7, 0xB6, 0xBC, 0xBD, 0xBE, 0x5B, 0x5D, 0xAF, 0xA8, 0xB4, 0xD7,
  0x7B, 0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0xAD, 0xF4, 0xF6, 0xF2, 0xF3, 0xF5, 0x7D, 0x4A, 0x4B, 0x4C, 0x4D, 0x4E, 0x4F, 0x50, 0x51, 0x52, 0xB9, 0xFB, 0xFC, 0xF9, 0xFA, 0xFF,
  0x5C, 0xF7, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5A, 0xB2, 0xD4, 0xD6, 0xD2, 0xD3, 0xD5, 0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0xB3, 0xDB, 0xDC, 0xD9, 0xDA, 0x9F,
];

/** A code point that has a visible glyph (not a control or format character). */
const visible = (cp) => cp >= 0x20 && cp !== 0x7F && !(cp >= 0x80 && cp < 0xA0) && cp !== 0xAD && cp !== 0xFFFD;

/** byte → code point, for the single-byte sets. */
const TABLES = {
  ascii: Array.from({ length: 256 }, (_, b) => (b < 128 ? b : -1)),
  latin1: Array.from({ length: 256 }, (_, b) => b),
  cp1252: Array.from({ length: 256 }, (_, b) => (b >= 0x80 && b < 0xA0 ? CP1252_80.codePointAt(b - 0x80) : b)),
  cp437: Array.from({ length: 256 }, (_, b) => (b < 128 ? b : CP437_HIGH.codePointAt(b - 128))),
  ebcdic: EBCDIC,
};

/** The display string of each single-byte value ('' = not shown). */
const GLYPHS = Object.fromEntries(Object.entries(TABLES).map(([id, table]) => [id, table.map((cp) => (cp >= 0 && visible(cp) ? String.fromCodePoint(cp) : ''))]));

export const isMultiByte = (charset) => !GLYPHS[charset];
export const unitOf = (charset) => (charset === 'utf16le' || charset === 'utf16be' ? 2 : 1);

const decoders = {};
const decoderFor = (label) => (decoders[label] ??= (() => { try { return new TextDecoder(label, { fatal: true }); } catch { return null; } })());

/**
 * The cells of the text column for `bytes` starting at the absolute offset `base`:
 * [{ text, cont }] per byte (`text` '' for an unprintable byte; `cont` true on a continuation byte).
 * `prev` holds the bytes just before (a multi-byte character started on the row above).
 */
export function textCells(bytes, base, charset, prev = null) {
  const out = new Array(bytes.length);
  const glyphs = GLYPHS[charset];
  if (glyphs) {
    for (let i = 0; i < bytes.length; i += 1) out[i] = { text: glyphs[bytes[i]], cont: false };
    return out;
  }
  if (charset === 'utf16le' || charset === 'utf16be') {
    const le = charset === 'utf16le';
    const at = (i) => (i < 0 ? (prev ? prev[prev.length + i] : undefined) : bytes[i]);
    let i = base % 2 === 0 ? 0 : -1;
    for (; i < bytes.length; i += 2) {
      const a = at(i);
      const b = at(i + 1);
      if (a === undefined || b === undefined) { if (i >= 0) out[i] = { text: '', cont: false }; if (i + 1 >= 0 && i + 1 < bytes.length) out[i + 1] = { text: '', cont: true }; continue; }
      const unit = le ? a | (b << 8) : (a << 8) | b;
      let text = '';
      if (unit >= 0xD800 && unit <= 0xDBFF) {
        const c = at(i + 2); const d = at(i + 3);
        if (c !== undefined && d !== undefined) {
          const low = le ? c | (d << 8) : (c << 8) | d;
          if (low >= 0xDC00 && low <= 0xDFFF) text = String.fromCodePoint(0x10000 + ((unit - 0xD800) << 10) + (low - 0xDC00));
        }
      } else if (!(unit >= 0xDC00 && unit <= 0xDFFF) && visible(unit)) text = String.fromCharCode(unit);
      if (i >= 0) out[i] = { text, cont: false };
      if (i + 1 >= 0 && i + 1 < bytes.length) out[i + 1] = { text: '', cont: true };
    }
    for (let k = 0; k < bytes.length; k += 1) out[k] ??= { text: '', cont: false };
    return out;
  }
  // UTF-8, EUC-KR, Shift_JIS: walk the characters from a few bytes before the row (`prev`), so one that
  // started on the row above marks its tail here; only this row's cells are returned.
  const ctx = prev?.length ? Math.min(3, prev.length) : 0;
  const all = new Uint8Array(ctx + bytes.length);
  if (ctx) all.set(prev.subarray(prev.length - ctx), 0);
  all.set(bytes, ctx);
  const cells = new Array(all.length);
  let i = 0;
  while (i < all.length) {
    const lead = all[i];
    const len = seqLength(lead, all[i + 1], charset);
    if (len <= 1) { cells[i] = { text: lead < 0x80 && visible(lead) ? String.fromCharCode(lead) : charset === 'shift_jis' && lead >= 0xA1 && lead <= 0xDF ? String.fromCharCode(0xFF61 + lead - 0xA1) : '', cont: false }; i += 1; continue; }
    const seq = all.subarray(i, i + len);
    let text = '';
    if (seq.length === len) {
      try { const decoded = decoderFor(charset === 'utf8' ? 'utf-8' : charset)?.decode(seq) ?? ''; if (decoded && visible(decoded.codePointAt(0))) text = decoded; } catch { text = ''; }
    } else text = '…';
    if (!text) { cells[i] = { text: '', cont: false }; i += 1; continue; }
    cells[i] = { text, cont: false };
    for (let k = 1; k < len && i + k < all.length; k += 1) cells[i + k] = { text: '', cont: true };
    i += len;
  }
  for (let k = 0; k < bytes.length; k += 1) out[k] = cells[ctx + k];
  return out;
}

/** How many bytes the character starting with `lead` takes (0: not a lead byte). */
function seqLength(lead, next, charset) {
  if (lead === undefined) return 0;
  if (charset === 'utf8') {
    if (lead < 0x80) return 1;
    if (lead >= 0xC2 && lead <= 0xDF) return 2;
    if (lead >= 0xE0 && lead <= 0xEF) return 3;
    if (lead >= 0xF0 && lead <= 0xF4) return 4;
    return 0;
  }
  if (charset === 'euc-kr') {
    // CP949 (Unified Hangul Code): lead 0x81–0xFE, trail 0x41–0xFE.
    if (lead >= 0x81 && lead <= 0xFE && next !== undefined && next >= 0x41 && next <= 0xFE) return 2;
    return lead < 0x80 ? 1 : 0;
  }
  if (charset === 'shift_jis') {
    if ((lead >= 0x81 && lead <= 0x9F) || (lead >= 0xE0 && lead <= 0xFC)) return next !== undefined && next >= 0x40 && next <= 0xFC && next !== 0x7F ? 2 : 0;
    return 1;
  }
  return 1;
}

/** The bytes a typed character becomes in `charset` (null: it cannot be written there). */
export function encodeChar(ch, charset) {
  const cp = ch.codePointAt(0);
  const table = TABLES[charset];
  if (table) {
    const b = table.indexOf(cp);
    return b >= 0 ? Uint8Array.of(b) : null;
  }
  if (charset === 'utf8') return new TextEncoder().encode(ch);
  if (charset === 'utf16le' || charset === 'utf16be') {
    const out = [];
    for (let k = 0; k < ch.length; k += 1) { const unit = ch.charCodeAt(k); out.push(...(charset === 'utf16le' ? [unit & 255, unit >> 8] : [unit >> 8, unit & 255])); }
    return Uint8Array.from(out);
  }
  return null;
}

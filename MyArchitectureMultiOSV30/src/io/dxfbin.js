// Binary DXF reader: the same group code / value pairs as an ASCII DXF, but
// stored as typed little-endian values after a 22-byte sentinel
// ("AutoCAD Binary DXF\r\n\x1a\0").
//
// Group codes are 2 bytes (R13 and newer) or 1 byte (R12 and older, where
// 255 escapes a following 2-byte code for the extended data range 1000+).
// The value type follows from the code range, as in the DXF reference:
// strings are NUL-terminated, reals are 8-byte doubles, integers 2, 4 or 8
// bytes, booleans 1 byte, and binary chunks (310–319, 1004) a length byte
// followed by the data. Values are handed back as strings so the ASCII
// importer can read them unchanged: numbers via String(), binary chunks as
// hex, texts decoded per $DWGCODEPAGE (UTF-8 from AutoCAD 2007 on).

export const BINARY_DXF_SENTINEL = "AutoCAD Binary DXF\r\n\x1a\0";

const DECODERS = { 874: "windows-874", 932: "shift_jis", 936: "gbk", 949: "euc-kr", 950: "big5", 1250: "windows-1250", 1251: "windows-1251", 1252: "windows-1252", 1253: "windows-1253", 1254: "windows-1254", 1255: "windows-1255", 1256: "windows-1256", 1257: "windows-1257", 1258: "windows-1258" };

export function isBinaryDxf(bytes) {
  if (!bytes || bytes.length < 22) return false;
  for (let i = 0; i < 18; i++) if (bytes[i] !== BINARY_DXF_SENTINEL.charCodeAt(i)) return false;
  return true;
}

// Value kind of a group code.
function kindOf(code) {
  if (code < 10) return "s";
  if (code < 60) return "d";
  if (code < 80) return "i16";
  if (code < 90) return "i16"; // unused range, as AutoCAD reads it
  if (code < 100) return "i32";
  if (code < 110) return "s";
  if (code < 150) return "d";
  if (code < 160) return "d";
  if (code < 170) return "i64";
  if (code < 180) return "i16";
  if (code < 210) return "d";
  if (code < 240) return "d";
  if (code < 270) return "i16";
  if (code < 290) return "i16";
  if (code < 300) return "b";
  if (code < 310) return "s";
  if (code < 320) return "bin";
  if (code < 370) return "s";
  if (code < 390) return "i16";
  if (code < 400) return "s";
  if (code < 410) return "i16";
  if (code < 420) return "s";
  if (code < 430) return "i32";
  if (code < 440) return "s";
  if (code < 460) return "i32";
  if (code < 470) return "d";
  if (code < 1000) return "s"; // 470–481 strings and handles, 999 comments
  if (code === 1004) return "bin";
  if (code < 1010) return "s";
  if (code < 1060) return "d";
  if (code < 1071) return "i16";
  if (code === 1071) return "i32";
  return "s";
}

const hex = (bytes) => { let s = ""; for (const b of bytes) s += b.toString(16).padStart(2, "0").toUpperCase(); return s; };

/**
 * Binary DXF bytes → [[code, value]] pairs (values as strings, like the
 * ASCII tokenizer's lines). Throws on a truncated or malformed file.
 */
export function readBinaryDxf(input) {
  const bytes = input instanceof Uint8Array ? input : ArrayBuffer.isView(input) ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength) : new Uint8Array(input);
  if (!isBinaryDxf(bytes)) throw new Error("Not a binary DXF file");
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = bytes.length;
  let i = 22;
  // R12 files start "0 SECTION" with a single code byte: 00 'S'; R13+ 00 00 'S'.
  const wide = !(bytes[22] === 0 && bytes[23] === 0x53);
  const need = (k) => { if (i + k > n) throw new Error(`Binary DXF is truncated at byte ${i}`); };
  const pairs = [];
  const strings = []; // [pairIndex, startByte, endByte] — decoded once the code page is known
  while (i < n) {
    let code;
    if (wide) { need(2); code = dv.getUint16(i, true); i += 2; } else {
      need(1); code = bytes[i++];
      if (code === 255) { need(2); code = dv.getUint16(i, true); i += 2; }
    }
    const kind = kindOf(code);
    let v;
    switch (kind) {
      case "s": {
        let j = i;
        while (j < n && bytes[j] !== 0) j++;
        if (j >= n) throw new Error(`Binary DXF is truncated: unterminated string at byte ${i}`);
        strings.push([pairs.length, i, j]);
        v = "";
        i = j + 1;
        break;
      }
      case "d": need(8); v = String(dv.getFloat64(i, true)); i += 8; break;
      case "i16": need(2); v = String(dv.getInt16(i, true)); i += 2; break;
      case "i32": need(4); v = String(dv.getInt32(i, true)); i += 4; break;
      case "i64": need(8); v = String(dv.getBigInt64(i, true)); i += 8; break;
      case "b": need(1); v = String(bytes[i]); i += 1; break;
      case "bin": { need(1); const len = bytes[i++]; need(len); v = hex(bytes.subarray(i, i + len)); i += len; break; }
    }
    pairs.push([code, v]);
    if (code === 0 && kind === "s") {
      const [, a, b] = strings[strings.length - 1];
      if (b - a === 3 && bytes[a] === 0x45 && bytes[a + 1] === 0x4f && bytes[a + 2] === 0x46) break; // "EOF"
    }
  }
  // Code page: AutoCAD 2007 (AC1021) and newer store UTF-8.
  const latin = new TextDecoder("latin1");
  const str = ([, a, b]) => latin.decode(bytes.subarray(a, b));
  let acadver = "", codepage = "";
  for (let k = 0; k < strings.length - 1; k++) {
    const s = str(strings[k]);
    if (s === "$ACADVER") acadver = str(strings[k + 1]);
    else if (s === "$DWGCODEPAGE") codepage = str(strings[k + 1]);
    else if (s === "ENDSEC") break;
  }
  let dec;
  if (acadver >= "AC1021") dec = new TextDecoder("utf-8");
  else {
    const m = /ANSI_(\d+)/i.exec(codepage);
    try { dec = new TextDecoder((m && DECODERS[m[1]]) || "euc-kr"); } catch { dec = new TextDecoder("windows-1252"); } // no code page: Korean, as for ASCII DXF
  }
  for (const [k, a, b] of strings) pairs[k][1] = dec.decode(bytes.subarray(a, b));
  return pairs;
}

// ---------------------------------------------------------------- writer
// Used by the tests (and handy for round trips): pairs → binary DXF bytes.
export function writeBinaryDxf(pairs, { wide = true } = {}) {
  const chunks = [];
  let size = 0;
  const push = (u8) => { chunks.push(u8); size += u8.length; };
  const enc = new TextEncoder();
  push(Uint8Array.from(BINARY_DXF_SENTINEL, (c) => c.charCodeAt(0)));
  for (const [code, value] of pairs) {
    if (wide) { const c = new Uint8Array(2); new DataView(c.buffer).setUint16(0, code, true); push(c); } else if (code < 255) push(Uint8Array.of(code));
    else { const c = new Uint8Array(3); c[0] = 255; new DataView(c.buffer).setUint16(1, code, true); push(c); }
    const kind = kindOf(code);
    const b = new Uint8Array(8);
    const dv = new DataView(b.buffer);
    switch (kind) {
      case "s": { const s = enc.encode(String(value)); const o = new Uint8Array(s.length + 1); o.set(s); push(o); break; }
      case "d": dv.setFloat64(0, parseFloat(value) || 0, true); push(b); break;
      case "i16": dv.setInt16(0, parseInt(value, 10) || 0, true); push(b.subarray(0, 2)); break;
      case "i32": dv.setInt32(0, parseInt(value, 10) || 0, true); push(b.subarray(0, 4)); break;
      case "i64": { let v = 0n; try { v = BigInt(String(value).trim()); } catch { v = BigInt(Math.trunc(+value || 0)); } dv.setBigInt64(0, v, true); push(b); break; }
      case "b": push(Uint8Array.of(parseInt(value, 10) ? 1 : 0)); break;
      case "bin": { const h = String(value).replace(/\s+/g, ""); const o = new Uint8Array(1 + h.length / 2); o[0] = h.length / 2; for (let k = 0; k < h.length; k += 2) o[1 + k / 2] = parseInt(h.slice(k, k + 2), 16); push(o); break; }
    }
  }
  const out = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

// ASCII DXF text → [[code, value]] (for the writer above).
export function asciiPairs(text) {
  const lines = String(text).split(/\r\n|\r|\n/);
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const c = lines[i].trim();
    if (c === "") break;
    pairs.push([Number(c), lines[i + 1]]);
  }
  return pairs;
}

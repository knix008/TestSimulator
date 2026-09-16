// Text encodings and line endings — shared by the desktop app and the web
// server, so the renderer only ever sees JavaScript strings with "\n".
//
//   decode(buffer)          → { text, encoding, eol, binary }  (auto-detects)
//   encode(text, enc, eol)  → Buffer
//
// Detection order: BOM → strict UTF-8 → the machine's legacy code page
// (CP949 on a Korean Windows, else Windows-1252). UTF-16 without a BOM is
// recognised by its NUL pattern.
'use strict';

const iconv = require('iconv-lite');

// id → { label, iconv name, bom }. The id is what the session and the UI use.
const ENCODINGS = [
  { id: 'utf8', label: 'UTF-8', iconv: 'utf8' },
  { id: 'utf8bom', label: 'UTF-8 (BOM)', iconv: 'utf8', bom: Buffer.from([0xef, 0xbb, 0xbf]) },
  { id: 'utf16le', label: 'UTF-16 LE', iconv: 'utf16le', bom: Buffer.from([0xff, 0xfe]) },
  { id: 'utf16be', label: 'UTF-16 BE', iconv: 'utf16be', bom: Buffer.from([0xfe, 0xff]) },
  { id: 'cp949', label: '한국어 (EUC-KR / CP949)', iconv: 'cp949' },
  { id: 'shiftjis', label: '日本語 (Shift_JIS)', iconv: 'shiftjis' },
  { id: 'gb18030', label: '中文 (GB18030)', iconv: 'gb18030' },
  { id: 'big5', label: '中文 (Big5)', iconv: 'big5' },
  { id: 'windows1252', label: 'Western (Windows-1252)', iconv: 'windows1252' },
  { id: 'iso88591', label: 'Latin-1 (ISO-8859-1)', iconv: 'latin1' },
  { id: 'koi8r', label: 'Русский (KOI8-R)', iconv: 'koi8r' },
];

const byId = new Map(ENCODINGS.map((e) => [e.id, e]));

function encodingInfo(id) {
  return byId.get(id) || byId.get('utf8');
}

// The legacy single/multi-byte code page a non-UTF-8 file most likely uses on
// this machine. Korean Windows → CP949; anything else → Windows-1252.
function legacyEncoding() {
  const env = `${process.env.LANG || ''}${process.env.LC_ALL || ''}${process.env.LC_CTYPE || ''}`.toLowerCase();
  if (/ko/.test(env)) return 'cp949';
  if (/ja/.test(env)) return 'shiftjis';
  if (/zh_cn|zh-cn|zh_sg/.test(env)) return 'gb18030';
  if (/zh_tw|zh-tw|zh_hk/.test(env)) return 'big5';
  if (process.platform === 'win32' && !env) {
    // Without LANG (the usual case on Windows) fall back to the OS UI language
    // exposed by Intl — "ko-KR" on a Korean install.
    try {
      const loc = Intl.DateTimeFormat().resolvedOptions().locale || '';
      if (/^ko/i.test(loc)) return 'cp949';
      if (/^ja/i.test(loc)) return 'shiftjis';
      if (/^zh-(cn|sg|hans)/i.test(loc)) return 'gb18030';
      if (/^zh-(tw|hk|hant)/i.test(loc)) return 'big5';
    } catch { /* default */ }
  }
  return 'windows1252';
}

function isValidUtf8(buf) {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return true;
  } catch {
    return false;
  }
}

// Binary data: control bytes text never uses (NUL, and C0 controls other
// than tab / newline / form feed / escape …) make up more than 1% of the first
// 8 KB — and there are more than a couple of them, so a tiny file is not
// judged by one byte. Not "any NUL": a source file may carry a literal NUL (a
// "\0" placeholder in a regex replace — core/search.js has one) and is still
// text; a real binary (compressed data, an executable, an image) has hundreds
// of them in its first kilobytes. UTF-16 without a BOM is sniffed before this.
function looksBinary(buf) {
  const n = Math.min(buf.length, 8192);
  let odd = 0;
  for (let i = 0; i < n; i++) {
    const c = buf[i];
    if (c === 0 || c < 7 || (c > 13 && c < 32 && c !== 27)) odd++;
  }
  return odd > 2 && odd / n > 0.01;
}

// UTF-16 without a BOM: ASCII text shows up as "x\0y\0" (LE) or "\0x\0y" (BE).
function sniffUtf16(buf) {
  const n = Math.min(buf.length, 4096) & ~1;
  if (n < 4) return null;
  let evenNul = 0, oddNul = 0;
  for (let i = 0; i < n; i += 2) {
    if (buf[i] === 0) evenNul++;
    if (buf[i + 1] === 0) oddNul++;
  }
  const pairs = n / 2;
  if (oddNul > pairs * 0.3 && evenNul < pairs * 0.05) return 'utf16le';
  if (evenNul > pairs * 0.3 && oddNul < pairs * 0.05) return 'utf16be';
  return null;
}

// "\r\n" / "\n" / "\r" — whichever the text uses most; `fallback` for a text
// without any line break.
function detectEol(text, fallback = 'lf') {
  let crlf = 0, lf = 0, cr = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 13) {
      if (text.charCodeAt(i + 1) === 10) { crlf++; i++; } else cr++;
    } else if (c === 10) lf++;
  }
  if (!crlf && !lf && !cr) return fallback;
  if (crlf >= lf && crlf >= cr) return 'crlf';
  if (lf >= cr) return 'lf';
  return 'cr';
}

const EOL_CHARS = { crlf: '\r\n', lf: '\n', cr: '\r' };

function normalizeEol(text) {
  return text.replace(/\r\n?/g, '\n');
}

function applyEol(text, eol) {
  const ch = EOL_CHARS[eol] || '\n';
  return ch === '\n' ? text : text.replace(/\n/g, ch);
}

function decode(buf, { encoding = null, defaultEol = 'lf' } = {}) {
  let id = encoding;
  let body = buf;
  if (!id) {
    if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) { id = 'utf8bom'; body = buf.subarray(3); }
    else if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) { id = 'utf16le'; body = buf.subarray(2); }
    else if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) { id = 'utf16be'; body = buf.subarray(2); }
    else {
      const u16 = sniffUtf16(buf);
      if (u16) id = u16;
      else if (looksBinary(buf)) return { text: '', encoding: 'utf8', eol: defaultEol, binary: true };
      else id = isValidUtf8(buf) ? 'utf8' : legacyEncoding();
    }
  } else {
    // A forced encoding still drops its own BOM.
    const info = encodingInfo(id);
    if (info.bom && buf.length >= info.bom.length && buf.subarray(0, info.bom.length).equals(info.bom)) body = buf.subarray(info.bom.length);
    else if (id === 'utf8' && buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) { id = 'utf8bom'; body = buf.subarray(3); }
  }
  const info = encodingInfo(id);
  const raw = iconv.decode(Buffer.from(body), info.iconv);
  return { text: normalizeEol(raw), encoding: info.id, eol: detectEol(raw, defaultEol), binary: false };
}

function encode(text, encoding = 'utf8', eol = 'lf') {
  const info = encodingInfo(encoding);
  const body = iconv.encode(applyEol(text, eol), info.iconv);
  // iconv-lite prepends a BOM to UTF-16 by default; we add BOMs ourselves.
  const stripped = (info.iconv === 'utf16le' || info.iconv === 'utf16be') && body.length >= 2 && ((body[0] === 0xff && body[1] === 0xfe) || (body[0] === 0xfe && body[1] === 0xff))
    ? body.subarray(2) : body;
  return info.bom ? Buffer.concat([info.bom, stripped]) : stripped;
}

// True when `text` survives a round trip through `encoding` unchanged — used
// to warn before saving Korean text as Windows-1252, for example.
function canEncode(text, encoding) {
  const info = encodingInfo(encoding);
  if (/^utf/.test(info.iconv)) return true;
  const back = iconv.decode(iconv.encode(text, info.iconv), info.iconv);
  return back === text;
}

module.exports = { ENCODINGS, encodingInfo, decode, encode, canEncode, detectEol, normalizeEol, applyEol, legacyEncoding, EOL_CHARS };

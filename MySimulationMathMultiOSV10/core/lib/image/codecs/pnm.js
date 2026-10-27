// Netpbm codec: PBM / PGM / PPM in plain (P1-P3) and raw (P4-P6) forms,
// maxval up to 65535.
import { cerr, makeRaster, Out } from './common.js';

export const isPnm = (b) => b.length >= 2 && b[0] === 0x50 && b[1] >= 0x31 && b[1] <= 0x36;

function tokenizer(b, start) {
  let p = start;
  const skip = () => {
    for (;;) {
      while (p < b.length && (b[p] === 32 || b[p] === 9 || b[p] === 10 || b[p] === 13)) p++;
      if (b[p] === 35) { while (p < b.length && b[p] !== 10 && b[p] !== 13) p++; continue; }
      break;
    }
  };
  return {
    int() {
      skip();
      let v = 0, any = false;
      while (p < b.length && b[p] >= 48 && b[p] <= 57) { v = v * 10 + (b[p++] - 48); any = true; }
      if (!any) throw cerr('pnm', 'expected a number');
      return v;
    },
    bit() { skip(); if (b[p] !== 48 && b[p] !== 49) throw cerr('pnm', 'expected 0 or 1'); return b[p++] - 48; },
    get pos() { return p; },
    set pos(v) { p = v; },
  };
}

export function pnmHeader(b) {
  if (!isPnm(b)) throw cerr('pnm', 'missing P1-P6 signature');
  const kind = b[1] - 48;
  const t = tokenizer(b, 2);
  const width = t.int(), height = t.int();
  const maxval = kind === 1 || kind === 4 ? 1 : t.int();
  const dataStart = t.pos + 1; // exactly one whitespace after the header
  const channels = kind === 3 || kind === 6 ? 3 : 1;
  const format = kind === 1 || kind === 4 ? 'pbm' : kind === 2 || kind === 5 ? 'pgm' : 'ppm';
  return { kind, width, height, maxval, channels, format, encoding: kind <= 3 ? 'ASCII' : 'rawbits', dataStart, tok: t };
}

/** Decodes; PBM gives bitDepth 1 with 1 = black (raw file sense). */
export function decodePnm(b) {
  const h = pnmHeader(b);
  const { kind, width, height, maxval, channels } = h;
  const bd = kind === 1 || kind === 4 ? 1 : maxval > 255 ? 16 : 8;
  const r = makeRaster(width, height, channels, bd === 16 ? 16 : 8);
  r.bitDepth = bd;
  r.maxval = maxval;
  r.format = h.format;
  const n = width * height * channels;
  if (kind === 1) { for (let i = 0; i < n; i++) r.data[i] = h.tok.bit(); return r; }
  if (kind === 2 || kind === 3) { for (let i = 0; i < n; i++) r.data[i] = h.tok.int(); return r; }
  let p = h.dataStart;
  if (kind === 4) {
    const rb = Math.ceil(width / 8);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) r.data[y * width + x] = (b[p + y * rb + (x >> 3)] >> (7 - (x & 7))) & 1;
    return r;
  }
  if (maxval > 255) { for (let i = 0; i < n; i++) { r.data[i] = (b[p] << 8) | b[p + 1]; p += 2; } } else for (let i = 0; i < n; i++) r.data[i] = b[p++];
  if (p > b.length) throw cerr('pnm', 'file is truncated');
  return r;
}

/**
 * Encodes. img: { width, height, channels (1|3), bitDepth (1, 8, 16), data }.
 * For bitDepth 1 the data hold 1 = black (PBM sense). opts: { encoding: 'rawbits'|'ASCII', maxval }
 */
export function encodePnm(img, opts = {}) {
  const { width, height, channels, bitDepth, data } = img;
  const ascii = String(opts.encoding || 'rawbits').toLowerCase() === 'ascii';
  const pbm = bitDepth === 1;
  const kind = pbm ? (ascii ? 1 : 4) : channels === 1 ? (ascii ? 2 : 5) : (ascii ? 3 : 6);
  const maxval = pbm ? 1 : opts.maxval || (bitDepth === 16 ? 65535 : 255);
  let head = `P${kind}\n${width} ${height}\n`;
  if (!pbm) head += `${maxval}\n`;
  const o = new Out(head.length + width * height * channels * 2 + 16);
  o.ascii(head);
  const n = width * height * channels;
  if (ascii) {
    let line = '';
    const per = pbm ? 35 : 12;
    for (let i = 0; i < n; i++) {
      line += (pbm ? '' : (i % per ? ' ' : '')) + data[i];
      if ((i + 1) % per === 0 || i === n - 1) { o.ascii(line + '\n'); line = ''; }
    }
  } else if (pbm) {
    const rb = Math.ceil(width / 8);
    for (let y = 0; y < height; y++) { const row = new Uint8Array(rb); for (let x = 0; x < width; x++) if (data[y * width + x]) row[x >> 3] |= 0x80 >> (x & 7); o.bytes(row); }
  } else if (maxval > 255) for (let i = 0; i < n; i++) o.be16(data[i]);
  else for (let i = 0; i < n; i++) o.u8(data[i]);
  return o.result();
}

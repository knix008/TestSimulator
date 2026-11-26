// Writing the R2004 (AC1018) container (Open Design Specification chapter 4; read back by r2004.js): the file
// header with its 0x6C bytes XORed by the fixed sequence (and CRC-32), data sections cut into pages of at most
// 0x7400 bytes — each page a 32-byte header masked with 0x4164536b ^ its address, then its compressed payload,
// padded to 32 bytes — the section map and the section page map (system pages), and the header copy at the end.
// Compression is LZ77 (4.7) written as literal runs only: valid for every reader, a little larger than
// AutoCAD's own output.
import { crc32, dwgError } from './bits.js';
import { MAGIC, pageChecksum } from './r2004.js';

const PAGE = 0x7400;

const le32 = (b, at, v) => { b[at] = v & 255; b[at + 1] = (v >>> 8) & 255; b[at + 2] = (v >>> 16) & 255; b[at + 3] = (v >>> 24) & 255; };
const le64 = (b, at, v) => { le32(b, at, v >>> 0); le32(b, at + 4, Math.floor(v / 2 ** 32)); };
const le16 = (b, at, v) => { b[at] = v & 255; b[at + 1] = (v >> 8) & 255; };

/** LZ77 stream of 4.7 holding `data` as one literal run (at least 4 bytes; shorter data is zero-padded). */
export function compressLiteral(data) {
  const src = data.length >= 4 ? data : Uint8Array.from([...data, 0, 0, 0, 0].slice(0, 4));
  const n = src.length; const head = [];
  if (n <= 0x12) head.push(n - 3);
  else {
    // 0, then 0xFF per zero byte, then the remainder: n − 3 = 0x0F + 0xFF·k + x (1 ≤ x ≤ 0xFF).
    const rest = n - 3 - 0x0f; const k = Math.floor((rest - 1) / 0xff); const x = rest - 0xff * k;
    head.push(0); for (let i = 0; i < k; i++) head.push(0); head.push(x);
  }
  const out = new Uint8Array(head.length + n + 3);
  out.set(head, 0); out.set(src, head.length); out.set([0x11, 0, 0], head.length + n);
  return out;
}

/**
 * The file bytes from the sections' contents: { header, classes, handles, objects, objFreeSpace, template, handseed,
 * jd (Julian date of the drawing), objectCount }.
 */
export function r2004File({ header, classes, handles, objects, objFreeSpace, template, handseed, jd, objectCount, extra = [] }) {
  const auxHeader = auxHeaderSection(handseed, jd);
  // Sections in the order AutoCAD writes them (number 0 is never used).
  const sections = [
    ['AcDb:AuxHeader', auxHeader], ['AcDb:Header', header], ['AcDb:Classes', classes], ['AcDb:Handles', handles],
    ['AcDb:Template', template], ['AcDb:ObjFreeSpace', objFreeSpace], ['AcDb:AcDbObjects', objects], ...extra,
  ].map(([name, data], i) => ({ name, data, id: i + 1, pages: [] }));
  void objectCount;

  const chunks = []; // file bytes after 0x100, in order
  let address = 0x100; let pageNo = 0;
  const pageMap = []; // [number, size]
  const addPage = (bytes) => { pageNo += 1; pageMap.push([pageNo, bytes.length]); chunks.push(bytes); const at = address; address += bytes.length; return { number: pageNo, address: at }; };

  // Data pages.
  for (const s of sections) {
    for (let start = 0; start < Math.max(1, s.data.length); start += PAGE) {
      const raw = s.data.subarray(start, Math.min(s.data.length, start + PAGE));
      const comp = compressLiteral(raw);
      const size = (32 + comp.length + 31) & ~31;
      const page = new Uint8Array(size);
      page.set(comp, 32);
      for (let i = 32 + comp.length; i < size; i++) page[i] = MAGIC[(i - 32 - comp.length) % MAGIC.length];
      const hdr = new Uint8Array(32);
      // Type, section, compressed size, decompressed size, start offset, 0, header checksum (over the header with
      // its own field 0, seeded with the data checksum), data checksum — as AutoCAD writes them.
      le32(hdr, 0, 0x4163043b); le32(hdr, 4, s.id); le32(hdr, 8, comp.length); le32(hdr, 12, raw.length); le32(hdr, 16, start);
      const dataSum = pageChecksum(0, comp);
      le32(hdr, 28, dataSum);
      le32(hdr, 24, pageChecksum(dataSum, hdr));
      const { number, address: at } = addPage(page);
      // The header is masked with its address.
      const mask = (0x4164536b ^ at) >>> 0;
      for (let k = 0; k < 32; k += 4) {
        const v = ((hdr[k] | hdr[k + 1] << 8 | hdr[k + 2] << 16 | hdr[k + 3] << 24) ^ mask) >>> 0;
        le32(page, k, v);
      }
      s.pages.push({ number, dataSize: comp.length, start });
    }
  }

  // Section map (4.4): a description per section, then its pages.
  const sm = [];
  const smHead = new Uint8Array(20); le32(smHead, 0, sections.length); le32(smHead, 4, 2); le32(smHead, 8, PAGE); le32(smHead, 12, 0); le32(smHead, 16, sections.length);
  sm.push(smHead);
  for (const s of sections) {
    const d = new Uint8Array(0x60 + 16 * s.pages.length);
    le64(d, 0, s.data.length); le32(d, 8, s.pages.length); le32(d, 12, PAGE); le32(d, 16, 1); le32(d, 20, 2); le32(d, 24, s.id); le32(d, 28, 0);
    for (let k = 0; k < s.name.length; k++) d[32 + k] = s.name.charCodeAt(k);
    s.pages.forEach((p, i) => { le32(d, 0x60 + 16 * i, p.number); le32(d, 0x64 + 16 * i, p.dataSize); le64(d, 0x68 + 16 * i, p.start); });
    sm.push(d);
  }
  const sectionMap = systemPage(0x4163003b, concat(sm));
  const sectionMapPage = addPage(sectionMap);

  // Section page map (4.3): every page's number and size, itself included (its size is known before it is written).
  const pmNumber = pageNo + 1;
  const pmEntries = pageMap.length + 1;
  const pmSize = alignPage(0x14 + compressLiteral(new Uint8Array(pmEntries * 8)).length);
  const pmData = new Uint8Array(pmEntries * 8);
  [...pageMap, [pmNumber, pmSize]].forEach(([n, size], i) => { le32(pmData, 8 * i, n); le32(pmData, 8 * i + 4, size); });
  const pageMapBytes = systemPage(0x41630e3b, pmData);
  if (pageMapBytes.length !== pmSize) throw dwgError('DWG page map size mismatch', 'dwg-write');
  const pageMapPage = addPage(pageMapBytes);
  const end = address;

  // File header (4.1).
  const fh = new Uint8Array(0x100);
  fh.set([0x41, 0x43, 0x31, 0x30, 0x31, 0x38], 0); // AC1018
  fh[0x0b] = 0; fh[0x0c] = 3; le32(fh, 0x0d, 0); fh[0x11] = 0x19; fh[0x12] = 0; le16(fh, 0x13, 30);
  le32(fh, 0x18, 0); le32(fh, 0x1c, 0); le32(fh, 0x20, 0); le32(fh, 0x24, 0); le32(fh, 0x28, 0x80);
  const h = new Uint8Array(0x6c);
  h.set([...'AcFssFcAJMB'].map((c) => c.charCodeAt(0)), 0);
  le32(h, 0x0c, 0); le32(h, 0x10, 0x6c); le32(h, 0x14, 4);
  le32(h, 0x18, 0); le32(h, 0x1c, 0); le32(h, 0x20, 0); le32(h, 0x24, 1);
  le32(h, 0x28, pageMapPage.number); le64(h, 0x2c, end - 0x100); le64(h, 0x34, end);
  le32(h, 0x3c, 0); le32(h, 0x40, pageMapPage.number);
  le32(h, 0x44, 0x20); le32(h, 0x48, 0x80); le32(h, 0x4c, 0x40);
  le32(h, 0x50, pageMapPage.number); le64(h, 0x54, pageMapPage.address - 0x100); le32(h, 0x5c, sectionMapPage.number);
  le32(h, 0x60, pmEntries); le32(h, 0x64, 0); le32(h, 0x68, 0);
  le32(h, 0x68, crc32(h, 0, 0x6c, 0));
  const enc = new Uint8Array(0x6c); for (let i = 0; i < 0x6c; i++) enc[i] = h[i] ^ MAGIC[i];
  fh.set(enc, 0x80);
  for (let i = 0x80 + 0x6c; i < 0x100; i++) fh[i] = MAGIC[i - 0x80 - 0x6c];
  // The copy of the encrypted header after the last page (the "second header").
  return concat([fh, ...chunks, enc]);
}

const alignPage = (n) => (n + 31) & ~31;

/** A system page: type, sizes, compression 2, checksum, then the compressed data, padded to 32 bytes. */
function systemPage(type, data) {
  const comp = compressLiteral(data);
  const out = new Uint8Array(alignPage(0x14 + comp.length));
  le32(out, 0, type); le32(out, 4, data.length); le32(out, 8, comp.length); le32(out, 12, 2);
  out.set(comp, 0x14);
  // The checksum: over the 0x14-byte header (checksum 0), continued over the compressed data.
  le32(out, 16, pageChecksum(pageChecksum(0, out.subarray(0, 0x14)), comp));
  for (let i = 0x14 + comp.length; i < out.length; i++) out[i] = MAGIC[(i - 0x14 - comp.length) % MAGIC.length];
  return out;
}

/**
 * The auxiliary header (chapter 27), 123 bytes as AutoCAD 2004 writes it: release numbers (written thrice), save
 * counts, six shorts and five longs of fixed values, the creation and update dates, the handle seed, the rest zero.
 */
function auxHeaderSection(handseed, jd) {
  const b = new Uint8Array(123); let at = 0;
  const RC = (v) => { b[at++] = v & 255; }; const RS = (v) => { le16(b, at, v); at += 2; }; const RL = (v) => { le32(b, at, v); at += 4; };
  const TD = (d) => { RL(Math.floor(d)); RL(Math.round((d % 1) * 86400000)); };
  RC(0xff); RC(0x77); RC(0x01);
  RS(0x19); RS(0); RL(1); RL(0xffffffff); RS(1); RS(0); RL(0); // release, maintenance, saves, −1, saves (split), 0
  RS(0x19); RS(0); RS(0x19); RS(0);
  for (const v of [0x0005, 0x0893, 0x0005, 0x0893, 0, 1]) RS(v);
  for (let i = 0; i < 5; i++) RL(0);
  TD(jd); TD(jd);
  RL(handseed < 0x7fffffff ? handseed : 0xffffffff); RL(0); // handle seed, plot stamp
  RS(0); RS(1); RL(0); RL(0); RL(0); RL(1); // 0, saves, 0, 0, 0, saves
  for (let i = 0; i < 4; i++) RL(0);
  if (at !== b.length) throw dwgError('DWG auxiliary header size', 'dwg-write');
  return b;
}

function concat(parts) {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0)); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// Sample files for the start page, made here (no binary files ship with the program): each one shows something —
// a PNG / BMP / GIF / WAVE / ZIP / ELF / PE that the built-in templates take apart, a disk image with a partition
// table, a "firmware" blob with strings, compressed and random parts and files hidden inside (strings, entropy,
// recovery), and a text file in UTF-8 with Korean.

export const SAMPLES = [
  { id: 'png', file: 'sample.png', icon: 'image' },
  { id: 'bmp', file: 'sample.bmp', icon: 'image' },
  { id: 'gif', file: 'sample.gif', icon: 'image' },
  { id: 'wav', file: 'sample.wav', icon: 'audioFile' },
  { id: 'zip', file: 'sample.zip', icon: 'archive' },
  { id: 'elf', file: 'hello.elf', icon: 'cpu' },
  { id: 'pe', file: 'hello.exe', icon: 'cpu' },
  { id: 'disk', file: 'disk.img', icon: 'disk' },
  { id: 'mixed', file: 'firmware.bin', icon: 'chip' },
  { id: 'text', file: 'readme-utf8.txt', icon: 'editorText' },
];

// ───────── little writers

class Out {
  constructor() { this.parts = []; this.length = 0; }
  bytes(b) { const a = b instanceof Uint8Array ? b : Uint8Array.from(b); this.parts.push(a); this.length += a.length; return this; }
  u8(v) { return this.bytes([v & 255]); }
  u16(v, be = false) { return this.bytes(be ? [(v >> 8) & 255, v & 255] : [v & 255, (v >> 8) & 255]); }
  u32(v, be = false) { const b = [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; return this.bytes(be ? b.reverse() : b); }
  u64(v) { return this.u32(v % 4294967296).u32(Math.floor(v / 4294967296)); }
  ascii(s) { return this.bytes([...s].map((c) => c.charCodeAt(0) & 255)); }
  zeros(n) { return this.bytes(new Uint8Array(n)); }
  pad(to) { return this.length < to ? this.zeros(to - this.length) : this; }
  done() { const out = new Uint8Array(this.length); let pos = 0; for (const p of this.parts) { out.set(p, pos); pos += p.length; } return out; }
}

const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(bytes) { let c = 0xFFFFFFFF; for (const b of bytes) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function adler32(bytes) { let a = 1; let b = 0; for (const x of bytes) { a = (a + x) % 65521; b = (b + a) % 65521; } return ((b << 16) | a) >>> 0; }
/** zlib with stored (uncompressed) deflate blocks: valid and simple. */
function zlibStored(data) {
  const o = new Out().bytes([0x78, 0x01]);
  for (let i = 0; i < data.length || i === 0; i += 65535) {
    const part = data.subarray(i, i + 65535);
    const last = i + 65535 >= data.length;
    o.u8(last ? 1 : 0).u16(part.length).u16(~part.length & 0xFFFF).bytes(part);
    if (last) break;
  }
  return o.u32(adler32(data), true).done();
}
const enc = (s) => new TextEncoder().encode(s);
function utf16le(s) { const o = new Out(); for (let i = 0; i < s.length; i++) o.u16(s.charCodeAt(i)); return o.done(); }
function noise(n, seed) { const out = new Uint8Array(n); let x = seed | 1; for (let i = 0; i < n; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; out[i] = x & 255; } return out; }

// ───────── the samples

function png(w = 48, h = 32) {
  const chunk = (type, data) => { const body = new Out().ascii(type).bytes(data).done(); return new Out().u32(data.length, true).bytes(body).u32(crc32(body), true).done(); };
  const raw = new Out();
  for (let y = 0; y < h; y++) { raw.u8(0); for (let x = 0; x < w; x++) raw.bytes([Math.round((x / w) * 255), Math.round((y / h) * 255), 160, 255]); }
  const ihdr = new Out().u32(w, true).u32(h, true).bytes([8, 6, 0, 0, 0]).done();
  return new Out().bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]).bytes(chunk('IHDR', ihdr)).bytes(chunk('tEXt', enc('Software\0MyHexaMaster sample'))).bytes(chunk('IDAT', zlibStored(raw.done()))).bytes(chunk('IEND', new Uint8Array())).done();
}

function bmp(w = 32, h = 24) {
  const row = Math.ceil((w * 3) / 4) * 4;
  const size = 54 + row * h;
  const o = new Out().ascii('BM').u32(size).u32(0).u32(54).u32(40).u32(w).u32(h).u16(1).u16(24).u32(0).u32(row * h).u32(2835).u32(2835).u32(0).u32(0);
  for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) o.bytes([Math.round((y / h) * 255), 90, Math.round((x / w) * 255)]); o.zeros(row - w * 3); }
  return o.done();
}

function gif() {
  // 4×4 image, 4-colour palette, LZW data for a fixed pattern (code size 2).
  return new Out().ascii('GIF89a').u16(4).u16(4).bytes([0x91, 0, 0])
    .bytes([0xFF, 0xFF, 0xFF, 0xFF, 0, 0, 0, 0, 0xFF, 0, 0, 0])
    .bytes([0x21, 0xF9, 4, 0, 0, 0, 0, 0])
    .bytes([0x2C]).u16(0).u16(0).u16(4).u16(4).u8(0)
    .bytes([2, 0x16, 0x8C, 0x2D, 0x99, 0x87, 0x2A, 0x1C, 0xDC, 0x33, 0xA0, 0x02, 0x75, 0xEC, 0x95, 0xFA, 0xA8, 0xDE, 0x60, 0x8C, 0x04, 0x91, 0x4C, 0x01, 0x00])
    .u8(0x3B).done();
}

function wav() {
  const rate = 8000; const n = 2000;
  const data = new Out();
  for (let i = 0; i < n; i++) data.u16(Math.round(Math.sin((i / rate) * 2 * Math.PI * 440) * 12000) & 0xFFFF);
  const d = data.done();
  return new Out().ascii('RIFF').u32(36 + d.length).ascii('WAVE').ascii('fmt ').u32(16).u16(1).u16(1).u32(rate).u32(rate * 2).u16(2).u16(16).ascii('data').u32(d.length).bytes(d).done();
}

function zip() {
  const files = [['hello.txt', enc('Hello from MyHexaMaster!\r\n')], ['docs/안내.txt', enc('ZIP 안의 한글 파일 이름 (UTF-8 플래그).\n')]];
  const o = new Out();
  const central = new Out();
  for (const [name, data] of files) {
    const nameBytes = enc(name);
    const offset = o.length;
    const crc = crc32(data);
    o.u32(0x04034B50).u16(20).u16(0x0800).u16(0).u16(0x6000).u16(0x5A21).u32(crc).u32(data.length).u32(data.length).u16(nameBytes.length).u16(0).bytes(nameBytes).bytes(data);
    central.u32(0x02014B50).u16(20).u16(20).u16(0x0800).u16(0).u16(0x6000).u16(0x5A21).u32(crc).u32(data.length).u32(data.length).u16(nameBytes.length).u16(0).u16(0).u16(0).u16(0).u32(0).u32(offset).bytes(nameBytes);
  }
  const cd = central.done();
  const cdOffset = o.length;
  return o.bytes(cd).u32(0x06054B50).u16(0).u16(0).u16(files.length).u16(files.length).u32(cd.length).u32(cdOffset).u16(0).done();
}

/** x86-64 code: write(1, msg, 14); exit(0). */
const X64_HELLO = (msgAddr) => {
  const o = new Out();
  o.bytes([0x48, 0xC7, 0xC0, 1, 0, 0, 0]); // mov rax, 1
  o.bytes([0x48, 0xC7, 0xC7, 1, 0, 0, 0]); // mov rdi, 1
  o.bytes([0x48, 0xBE]).u64(msgAddr); // movabs rsi, msg
  o.bytes([0x48, 0xC7, 0xC2, 14, 0, 0, 0]); // mov rdx, 14
  o.bytes([0x0F, 0x05]); // syscall
  o.bytes([0x48, 0xC7, 0xC0, 60, 0, 0, 0]); // mov rax, 60
  o.bytes([0x48, 0x31, 0xFF]); // xor rdi, rdi
  o.bytes([0x0F, 0x05]); // syscall
  return o.done();
};

function elf() {
  const base = 0x400000;
  const codeOff = 0x78;
  const code = X64_HELLO(base + codeOff + 48);
  const msg = enc('Hello, world!\n');
  const body = new Out().bytes(code).pad(48).bytes(msg).done();
  const total = codeOff + body.length;
  const o = new Out();
  o.bytes([0x7F, 0x45, 0x4C, 0x46, 2, 1, 1, 0]).zeros(8).u16(2).u16(0x3E).u32(1).u64(base + codeOff).u64(64).u64(0).u32(0).u16(64).u16(56).u16(1).u16(0).u16(0).u16(0);
  o.u32(1).u32(5).u64(0).u64(base).u64(base).u64(total).u64(total).u64(0x1000);
  return o.pad(codeOff).bytes(body).done();
}

function pe() {
  const imageBase = 0x140000000;
  const o = new Out();
  // DOS header and stub
  o.ascii('MZ').u16(0x90).u16(3).u16(0).u16(4).u16(0).u16(0xFFFF).u16(0).u16(0xB8).u16(0).u16(0).u16(0).u16(0x40).u16(0).zeros(8).u16(0).u16(0).zeros(20).u32(0x80);
  o.bytes([0x0E, 0x1F, 0xBA, 0x0E, 0x00, 0xB4, 0x09, 0xCD, 0x21, 0xB8, 0x01, 0x4C, 0xCD, 0x21]).ascii('This program cannot be run in DOS mode.\r\r\n$').pad(0x80);
  // PE signature, COFF header (x86-64, 1 section), optional header PE32+
  o.ascii('PE\0\0').u16(0x8664).u16(1).u32(0x65000000).u32(0).u32(0).u16(240).u16(0x22);
  o.u16(0x20B).u8(14).u8(0).u32(0x200).u32(0).u32(0).u32(0x1000).u32(0x1000).u64(imageBase).u32(0x1000).u32(0x200).u16(6).u16(0).u16(0).u16(0).u16(6).u16(0).u32(0).u32(0x2000).u32(0x200).u32(0).u16(3).u16(0x8160)
    .u64(0x100000).u64(0x1000).u64(0x100000).u64(0x1000).u32(0).u32(16).zeros(16 * 8);
  // section table: .text
  o.ascii('.text\0\0\0').u32(0x100).u32(0x1000).u32(0x200).u32(0x200).u32(0).u32(0).u16(0).u16(0).u32(0x60000020);
  o.pad(0x200);
  // code: sub rsp,40 / xor ecx,ecx / call [rip+0] / add rsp,40 / ret, and strings
  o.bytes([0x48, 0x83, 0xEC, 0x28, 0x31, 0xC9, 0xB8, 0x2A, 0x00, 0x00, 0x00, 0x48, 0x83, 0xC4, 0x28, 0xC3, 0xCC, 0xCC, 0xCC, 0xCC]);
  o.ascii('Hello from a tiny PE32+ file\0').bytes(utf16le('UTF-16 string in a PE\0'));
  return o.pad(0x400).done();
}

/**
 * A FAT12 / FAT16 volume (512-byte sectors, one sector per cluster) holding `tree`:
 * [{ name, data } | { name, dir: [...] } | { name, data, deleted: true }]. Long names get LFN entries;
 * a deleted file keeps its data and directory entry (first byte E5h) but its clusters are free in the FAT.
 */
function fatVolume({ sectors, bits, label, hidden, serial, tree }) {
  const bps = 512, reserved = 1, nfats = 2, rootEntries = 512, rootSecs = (rootEntries * 32) / bps;
  let fatSecs = 1;
  for (;;) { const clusters = sectors - reserved - rootSecs - nfats * fatSecs; const need = Math.ceil((((clusters + 2) * bits) / 8) / bps); if (need <= fatSecs) break; fatSecs = need; }
  const v = new Uint8Array(sectors * bps);
  const dv = new DataView(v.buffer);
  const ascii = (at, text, len) => { for (let i = 0; i < len; i++) v[at + i] = i < text.length ? text.charCodeAt(i) : 0x20; };
  v.set([0xEB, 0x3C, 0x90]); ascii(3, 'MSDOS5.0', 8);
  dv.setUint16(11, bps, true); v[13] = 1; dv.setUint16(14, reserved, true); v[16] = nfats; dv.setUint16(17, rootEntries, true);
  dv.setUint16(19, sectors < 65536 ? sectors : 0, true); v[21] = 0xF8; dv.setUint16(22, fatSecs, true); dv.setUint16(24, 63, true); dv.setUint16(26, 255, true);
  dv.setUint32(28, hidden, true); dv.setUint32(32, sectors < 65536 ? 0 : sectors, true); v[36] = 0x80; v[38] = 0x29; dv.setUint32(39, serial, true);
  ascii(43, label, 11); ascii(54, bits === 12 ? 'FAT12' : 'FAT16', 8); v[510] = 0x55; v[511] = 0xAA;
  const fatAt = reserved * bps, rootAt = (reserved + nfats * fatSecs) * bps, dataAt = rootAt + rootSecs * bps;
  const eoc = bits === 12 ? 0xFFF : 0xFFFF;
  const setFat = (i, val) => {
    for (let f = 0; f < nfats; f++) {
      const base = fatAt + f * fatSecs * bps;
      if (bits === 16) { dv.setUint16(base + i * 2, val, true); continue; }
      const o = base + Math.floor(i * 1.5);
      if (i % 2 === 0) { v[o] = val & 255; v[o + 1] = (v[o + 1] & 0xF0) | ((val >> 8) & 0x0F); } else { v[o] = (v[o] & 0x0F) | ((val & 0x0F) << 4); v[o + 1] = (val >> 4) & 255; }
    }
  };
  setFat(0, bits === 12 ? 0xFF8 : 0xFFF8); setFat(1, eoc);
  let next = 2;
  const clusterAt = (c) => dataAt + (c - 2) * bps;
  /** Contiguous clusters for n bytes; the chain is left out of the FAT when `free` (a deleted file). */
  const alloc = (n, free = false) => { const count = Math.max(1, Math.ceil(n / bps)); const first = next; next += count; if (!free) for (let i = 0; i < count; i++) setFat(first + i, i === count - 1 ? eoc : first + i + 1); return first; };
  const stamp = { date: ((2026 - 1980) << 9) | (11 << 5) | 27, time: (10 << 11) | (30 << 5) };
  const shortName = (name, taken) => {
    const dot = name.lastIndexOf('.');
    const clean = (x) => x.toUpperCase().replace(/[^A-Z0-9_~!#$%&'()-]/g, '');
    let base = clean(dot > 0 ? name.slice(0, dot) : name), ext = clean(dot > 0 ? name.slice(dot + 1) : '').slice(0, 3);
    const exact = `${base}.${ext}` === name.toUpperCase() || (!ext && base === name.toUpperCase());
    if (base.length > 8 || !exact || name !== name.toUpperCase()) { let k = 1; while (taken.has(`${base.slice(0, 6)}~${k}${ext}`)) k += 1; base = `${base.slice(0, 6)}~${k}`; }
    taken.add(`${base}${ext}`);
    return { text: base.padEnd(8).slice(0, 8) + ext.padEnd(3), long: !exact || name !== name.toUpperCase() || base.includes('~') };
  };
  const checksum = (short) => { let sum = 0; for (let i = 0; i < 11; i++) sum = ((((sum & 1) << 7) | (sum >> 1)) + short.charCodeAt(i)) & 255; return sum; };
  const entry = (at, short, attr, cluster, size) => {
    ascii(at, short, 11); v[at + 11] = attr; dv.setUint16(at + 14, stamp.time, true); dv.setUint16(at + 16, stamp.date, true); dv.setUint16(at + 18, stamp.date, true);
    dv.setUint16(at + 22, stamp.time, true); dv.setUint16(at + 24, stamp.date, true); dv.setUint16(at + 26, cluster, true); dv.setUint32(at + 28, size, true);
  };
  const lfn = (at, name, short) => {
    const units = [...name].map((ch) => ch.charCodeAt(0));
    const parts = Math.ceil((units.length + 1) / 13);
    const padded = [...units, 0, ...Array(parts * 13).fill(0xFFFF)].slice(0, parts * 13);
    const sum = checksum(short);
    for (let k = parts; k >= 1; k--) {
      const chars = padded.slice((k - 1) * 13, k * 13);
      v[at] = k | (k === parts ? 0x40 : 0); v[at + 11] = 0x0F; v[at + 13] = sum;
      [1, 3, 5, 7, 9, 14, 16, 18, 20, 22, 24, 28, 30].forEach((off, i) => dv.setUint16(at + off, chars[i], true));
      at += 32;
    }
    return at;
  };
  /** Writes the entries of one directory at byte `at`; sub-directories get a cluster each. */
  const writeDir = (at, items, self = 0, parent = 0, isRoot = true) => {
    const taken = new Set();
    if (isRoot) { entry(at, label.padEnd(11), 0x08, 0, 0); at += 32; }
    else { entry(at, '.          ', 0x10, self, 0); entry(at + 32, '..         ', 0x10, parent, 0); at += 64; }
    for (const item of items) {
      const sn = shortName(item.name, taken);
      const first = at;
      if (sn.long) at = lfn(at, item.name, sn.text);
      if (item.dir) {
        const c = alloc(bps);
        entry(at, sn.text, 0x10, c, 0);
        writeDir(clusterAt(c), item.dir, c, self, false);
      } else {
        const c = alloc(item.data.length, item.deleted);
        v.set(item.data, clusterAt(c));
        entry(at, sn.text, 0x20, c, item.data.length);
        if (item.deleted) for (let x = first; x <= at; x += 32) v[x] = 0xE5;
      }
      at += 32;
    }
  };
  writeDir(rootAt, tree);
  return v;
}

function disk() {
  const sector = 512;
  const o = new Out();
  // MBR: boot code (a jump and a message), 2 partitions, signature
  o.bytes([0xEB, 0x3C, 0x90]).ascii('MYHEXA  ').zeros(51).bytes([0xFA, 0x31, 0xC0, 0x8E, 0xD8, 0xBE, 0x7C, 0x7C, 0xB4, 0x0E, 0xAC, 0x08, 0xC0, 0x74, 0x04, 0xCD, 0x10, 0xEB, 0xF7, 0xF4]).ascii('Sample disk image — MyHexaMaster\0');
  o.pad(446);
  const part = (boot, type, lba, count) => o.u8(boot).bytes([0xFE, 0xFF, 0xFF]).u8(type).bytes([0xFE, 0xFF, 0xFF]).u32(lba).u32(count);
  part(0x80, 0x06, 2048, 8192);
  part(0x00, 0x01, 10240, 2048);
  o.zeros(32).bytes([0x55, 0xAA]);
  o.pad(2048 * sector);
  // partition 1: FAT16 with files, a folder, a long name and a deleted file (WinHex-style recovery shows it)
  o.bytes(fatVolume({ sectors: 8192, bits: 16, label: 'MYHEXA', hidden: 2048, serial: 0x1234ABCD, tree: [
    { name: 'README.TXT', data: enc('MyHexaMaster sample disk.\r\nOpen Tools > File systems to browse it.\r\n') },
    { name: 'PICTURE.PNG', data: png(24, 16) },
    { name: 'Long file name example.txt', data: enc('FAT keeps long names in extra (LFN) directory entries.\r\n') },
    { name: 'DOCS', dir: [
      { name: 'NOTE.TXT', data: enc('A file inside a folder.\r\n') },
      { name: 'DATA.BIN', data: Uint8Array.from({ length: 256 }, (_, i) => i) },
    ] },
    { name: 'DELETED.TXT', deleted: true, data: enc('deleted.txt — 이 글은 지워진 파일의 내용입니다. Recovery (carving) finds the picture above.\n') },
  ] }));
  // partition 2: a small FAT12 volume
  o.bytes(fatVolume({ sectors: 2048, bits: 12, label: 'DATA', hidden: 10240, serial: 0x0BADF00D, tree: [
    { name: 'HELLO.TXT', data: enc('Hello from the second partition (FAT12).\r\n') },
    { name: 'SAMPLE.ELF', data: elf() },
  ] }));
  return o.pad(12288 * sector).done();
}

function mixed() {
  const o = new Out();
  o.ascii('MYFW').u16(0x0102).u16(4).u32(0).u32(0x20000).ascii('Firmware v1.2.3 build 2026-11-27').zeros(8);
  o.pad(0x100).ascii('Copyright (c) Example Corp.\0Device: HX-2000 controller\0Serial: 0042-1337-BEEF\0');
  o.bytes(utf16le('Unicode label: 설정 메뉴\0')).bytes(enc('UTF-8 문자열: 펌웨어 업데이트 완료\0'));
  o.pad(0x400);
  for (let i = 0; i < 256; i++) o.u8(i);
  o.pad(0x800).bytes(noise(0x2000, 0x12345)).ascii('KEY:').bytes(noise(32, 99));
  o.pad(0x3000).bytes(png(32, 20)).pad(0x3800).bytes(gif());
  o.pad(0x4000).bytes(zip());
  o.pad(0x5000).bytes(X64_HELLO(0x405010)).pad(0x5040).bytes(zlibStored(enc('compressed '.repeat(40))));
  o.pad(0x6000).zeros(0x800).ascii('END OF IMAGE').u32(0xDEADBEEF, true);
  const body = o.done();
  // the header's checksum field: CRC-32 of everything after the first 16 bytes
  const crc = crc32(body.subarray(16));
  body.set([crc & 255, (crc >>> 8) & 255, (crc >>> 16) & 255, (crc >>> 24) & 255], 8);
  return body;
}

function text() {
  return enc(`MyHexaMaster 예제 텍스트 (UTF-8)\r\n\r\n이 파일은 글자가 바이트로 어떻게 저장되는지 보여 줍니다.\r\n- 한글 한 글자는 UTF-8에서 3바이트입니다: 가 = EA B0 80\r\n- English letters take one byte each: A = 41\r\n- 줄 끝 CR LF = 0D 0A\r\n\r\n오른쪽 글자 열의 문자 집합을 EUC-KR, UTF-16으로 바꾸어 보세요.\r\n`);
}

const MAKERS = { png: () => png(), bmp: () => bmp(), gif, wav, zip, elf, pe, disk, mixed, text };

export async function sampleBytes(id) {
  const make = MAKERS[id];
  if (!make) throw new Error(`no sample ${id}`);
  return make();
}

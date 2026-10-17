// File helpers for exports: a ZIP writer (stored entries, CRC-32), base64 for
// binary files, and a PDF made of JPEG pages (no fonts need embedding, so
// Korean text prints as drawn). Pure.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const utf8 = (text) => new TextEncoder().encode(text);
/** A ZIP archive (entries stored, UTF-8 names) of [{ name, data: string | Uint8Array }]. */
export function zip(entries, date = new Date()) {
  const time = ((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)) & 0xffff;
  const day = (((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff;
  const files = entries.map((entry) => {
    const data = typeof entry.data === 'string' ? utf8(entry.data) : entry.data;
    return { name: utf8(entry.name), data, crc: crc32(data) };
  });
  const size = files.reduce((sum, f) => sum + 30 + f.name.length + f.data.length + 46 + f.name.length, 0) + 22;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let at = 0;
  const u16 = (v) => { view.setUint16(at, v, true); at += 2; };
  const u32 = (v) => { view.setUint32(at, v >>> 0, true); at += 4; };
  const bytes = (b) => { out.set(b, at); at += b.length; };
  for (const f of files) {
    f.offset = at;
    u32(0x04034b50); u16(20); u16(0x0800); u16(0); u16(time); u16(day); u32(f.crc); u32(f.data.length); u32(f.data.length); u16(f.name.length); u16(0);
    bytes(f.name); bytes(f.data);
  }
  const central = at;
  for (const f of files) {
    u32(0x02014b50); u16(20); u16(20); u16(0x0800); u16(0); u16(time); u16(day); u32(f.crc); u32(f.data.length); u32(f.data.length);
    u16(f.name.length); u16(0); u16(0); u16(0); u16(0); u32(0); u32(f.offset);
    bytes(f.name);
  }
  const centralSize = at - central;
  u32(0x06054b50); u16(0); u16(0); u16(files.length); u16(files.length); u32(centralSize); u32(central); u16(0);
  return out;
}

export function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

const ascii = (text) => Uint8Array.from(text, (ch) => ch.charCodeAt(0) & 0xff);
const pdfTextString = (text) => `<FEFF${[...String(text)].map((ch) => {
  const code = ch.codePointAt(0);
  if (code < 0x10000) return code.toString(16).padStart(4, '0');
  const v = code - 0x10000;
  return ((0xd800 | (v >> 10)).toString(16) + (0xdc00 | (v & 0x3ff)).toString(16)).toUpperCase();
}).join('').toUpperCase()}>`;
export function pdfFromJpegs(pages, { title = '', pageWidth = 595.28, pageHeight = 841.89 } = {}) {
  const chunks = [];
  let length = 0;
  const offsets = [];
  const push = (part) => {
    const bytes = typeof part === 'string' ? ascii(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (n, ...parts) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
    for (const part of parts) push(part);
    push('\nendobj\n');
  };
  push('%PDF-1.4\n');
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // binary marker
  const W = pageWidth.toFixed(2);
  const H = pageHeight.toFixed(2);
  const pageIds = pages.map((_, i) => 4 + i * 3);
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`);
  object(3, `<< /Title ${pdfTextString(title)} /Producer (MyUMLMaker) /Creator (MyUMLMaker) >>`);
  pages.forEach((page, i) => {
    const id = pageIds[i];
    const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
    object(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`);
    object(id + 1, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    object(id + 2, `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`, page.jpeg, '\nendstream');
  });
  const count = 4 + pages.length * 3;
  const xref = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let n = 1; n < count; n++) push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
  return out;
}

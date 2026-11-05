// Hand-made PDFs for the tests: the app's own createPdf only writes JPEG pages,
// real documents have fonts, vector drawing, odd page sizes, passwords and damage.
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const latin = (text) => Buffer.from(text, 'latin1');

/** objects: body strings (or Buffers) of objects 1…n; the catalog is object 1. */
export function assemble(objects, { trailer = '' } = {}) {
  const parts = [latin('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n')];
  let length = parts[0].length;
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(length);
    const chunk = Buffer.concat([latin(`${i + 1} 0 obj\n`), Buffer.isBuffer(body) ? body : latin(body), latin('\nendobj\n')]);
    parts.push(chunk);
    length += chunk.length;
  });
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
  parts.push(latin(`${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R ${trailer} >>\nstartxref\n${length}\n%%EOF\n`));
  return Uint8Array.from(Buffer.concat(parts));
}

const stream = (content, dict = '') => `<< /Length ${Buffer.byteLength(content, 'latin1')} ${dict} >>\nstream\n${content}\nendstream`;

/** Pages of { width, height, content } sharing `fontObjects` (body strings; F1 is the first). */
function document(pages, fontObjects = ['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']) {
  const firstFont = 3 + pages.length * 2;
  const fonts = fontObjects.map((_, i) => `/F${i + 1} ${firstFont + i} 0 R`).join(' ');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${3 + i * 2} 0 R`).join(' ')}] >>`,
  ];
  pages.forEach((page, i) => {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Contents ${4 + i * 2} 0 R /Resources << /Font << ${fonts} >> >> >>`);
    objects.push(stream(page.content));
  });
  objects.push(...fontObjects);
  return objects;
}

const redBox = (x, y, w, h) => `1 0 0 rg ${x} ${y} ${w} ${h} re f`;

/** Three pages of text in a built-in font and vector shapes, like an ordinary document. */
export function textPdf(pages = 3) {
  return assemble(document(Array.from({ length: pages }, (_, i) => ({
    width: 595,
    height: 842,
    content: `${redBox(60, 600, 200, 120)} 0 0 1 rg 300 600 200 120 re f 0 0 0 rg BT /F1 28 Tf 60 760 Td (Page ${i + 1} of the text document) Tj ET`,
  }))));
}

/** Korean text in a font that is not embedded (needs the CMaps pdf.js ships). */
export function koreanPdf() {
  const descendant = '<< /Type /Font /Subtype /CIDFontType0 /BaseFont /HYGoThic-Medium /CIDSystemInfo << /Registry (Adobe) /Ordering (Korea1) /Supplement 1 >> >>';
  const objects = document([{ width: 595, height: 842, content: `${redBox(60, 600, 200, 120)} 0 0 0 rg BT /F1 40 Tf 60 760 Td <D55CAE00> Tj ET` }], ['']);
  const fontIndex = objects.length;
  objects[fontIndex - 1] = `<< /Type /Font /Subtype /Type0 /BaseFont /HYGoThic-Medium /Encoding /UniKS-UTF16-H /DescendantFonts [${fontIndex + 1} 0 R] >>`;
  objects.push(descendant);
  return assemble(objects);
}

/** One page with the given size in points, half red and half white. */
export function sizedPdf(width, height) {
  return assemble(document([{ width, height, content: redBox(0, 0, width / 2, height) }]));
}

/** No pages at all. */
export function emptyPdf() {
  return assemble(['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Count 0 /Kids [] >>']);
}

/** A page whose content stream makes no sense: the page itself must still come out. */
export function badContentPdf() {
  return assemble(document([{ width: 300, height: 300, content: `${redBox(0, 0, 150, 300)} q q q Q Q Q Q Q Q (unterminated /Nope gs /Missing Do 1 2 3 nonsense BT /F9 12 Tf ET` }]));
}

/** A page tree that points back at itself. */
export function loopPdf() {
  return assemble(['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Count 1 /Kids [2 0 R] /Parent 2 0 R >>']);
}

/** Starts like a PDF, then garbage. */
export function garbagePdf() {
  return Uint8Array.from(Buffer.concat([latin('%PDF-1.7\n'), Buffer.alloc(4096, 0x5a)]));
}

/** A valid document cut off before its objects end (a broken download). */
export function truncatedPdf() {
  const whole = textPdf(3);
  return whole.slice(0, Math.floor(whole.length * 0.35));
}

// ───────── Standard security handler, revision 2 (40-bit RC4), enough for pdf.js to ask for a password.

function rc4(key, data) {
  const s = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 0, j = 0; i < 256; i++) { j = (j + s[i] + key[i % key.length]) & 255; [s[i], s[j]] = [s[j], s[i]]; }
  const out = Buffer.alloc(data.length);
  for (let n = 0, i = 0, j = 0; n < data.length; n++) {
    i = (i + 1) & 255;
    j = (j + s[i]) & 255;
    [s[i], s[j]] = [s[j], s[i]];
    out[n] = data[n] ^ s[(s[i] + s[j]) & 255];
  }
  return out;
}

const md5 = (...chunks) => { const hash = createHash('md5'); for (const chunk of chunks) hash.update(chunk); return hash.digest(); };
const PAD = Buffer.from('28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A', 'hex');
const pad = (password) => Buffer.concat([Buffer.from(password, 'latin1'), PAD]).subarray(0, 32);
const hex = (buffer) => `<${buffer.toString('hex').toUpperCase()}>`;

/** Needs a user password to open. */
export function encryptedPdf(password = 'secret') {
  const id = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
  const permissions = Buffer.alloc(4);
  permissions.writeInt32LE(-44);
  const O = rc4(md5(pad('owner')).subarray(0, 5), pad(password));
  const key = md5(pad(password), O, permissions, id).subarray(0, 5);
  const U = rc4(key, PAD);
  const objects = document([{ width: 300, height: 300, content: 'q Q' }]);
  const contentIndex = 3; // object 4 is the page's content stream
  const content = rc4(md5(key, Buffer.from([4, 0, 0, 0, 0])).subarray(0, 10), latin('q Q'));
  objects[contentIndex] = Buffer.concat([latin(`<< /Length ${content.length} >>\nstream\n`), content, latin('\nendstream')]);
  objects.push(`<< /Filter /Standard /V 1 /R 2 /O ${hex(O)} /U ${hex(U)} /P -44 >>`);
  return assemble(objects, { trailer: `/Encrypt ${objects.length} 0 R /ID [${hex(id)} ${hex(id)}]` });
}

/** A valid three-page document stretched to `mb` megabytes by unused space (written straight to disk). */
export function writeBigPdf(file, mb) {
  const head = Buffer.from(textPdf(3));
  const tail = Buffer.from(`\nstartxref\n${head.lastIndexOf('xref\n0 ')}\n%%EOF\n`);
  const size = mb * 1048576;
  fs.writeFileSync(file, head);
  fs.truncateSync(file, size);
  const handle = fs.openSync(file, 'r+');
  fs.writeSync(handle, tail, 0, tail.length, size);
  fs.closeSync(handle);
}

/** Everything the PDF tests open: name → bytes. `ok` documents show a page, `bad` ones must report an error. */
export function pdfCases() {
  return {
    ok: {
      'text.pdf': textPdf(3),
      'korean.pdf': koreanPdf(),
      'tiny-page.pdf': sizedPdf(10, 10),
      'huge-page.pdf': sizedPdf(14400, 14400),
      'wide-strip.pdf': sizedPdf(14400, 2),
      'tall-strip.pdf': sizedPdf(2, 14400),
      'bad-content.pdf': badContentPdf(),
    },
    bad: {
      'zero-bytes.pdf': new Uint8Array(0),
      'garbage.pdf': garbagePdf(),
      'not-a-pdf.pdf': Uint8Array.from(Buffer.from('This is a text file with the wrong extension.\n')),
      'truncated.pdf': truncatedPdf(),
      'no-pages.pdf': emptyPdf(),
      'page-loop.pdf': loopPdf(),
      'password.pdf': encryptedPdf(),
    },
  };
}

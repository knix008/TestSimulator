// A minimal PDF writer: one JPEG picture per page, scaled to fit the page
// inside the margins and centred. That is all a map export needs, and the
// file opens in every viewer (the picture keeps every script and font as the
// map showed them).
//
// pages: [{ jpeg: Uint8Array, width, height }] (pixels)
// paper: { w, h } in PDF points (1/72 in), margin in points
export const PAPER_MM = { a4: [210, 297], a3: [297, 420], a5: [148, 210], letter: [215.9, 279.4], legal: [215.9, 355.6] };
export const mmToPt = (mm) => (mm / 25.4) * 72;

export function paperPoints(paper = 'a4', landscape = false) {
  const [w, h] = PAPER_MM[paper] || PAPER_MM.a4;
  const pw = mmToPt(w), ph = mmToPt(h);
  return landscape ? { w: ph, h: pw } : { w: pw, h: ph };
}

function enc(s) { return new TextEncoder().encode(s); }

export function buildPdf(pages, { paper = null, margin = 28, title = '' } = {}) {
  const chunks = [];
  const offsets = [];
  let size = 0;
  const push = (data) => { const b = typeof data === 'string' ? enc(data) : data; chunks.push(b); size += b.length; };
  const obj = (n, body) => { offsets[n] = size; push(`${n} 0 obj\n`); for (const part of [].concat(body)) push(part); push('\nendobj\n'); };

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const n = pages.length;
  // objects: 1 catalog, 2 pages, 3 info, then per page: page, content, image
  const pageObj = (i) => 4 + i * 3;
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Count ${n} /Kids [${pages.map((_, i) => `${pageObj(i)} 0 R`).join(' ')}] >>`);
  const titleHex = Array.from(title || 'Map').map((ch) => ch.codePointAt(0)).flatMap((c) => (c > 0xffff ? [0xd800 + ((c - 0x10000) >> 10), 0xdc00 + ((c - 0x10000) & 0x3ff)] : [c])).map((c) => c.toString(16).padStart(4, '0')).join('');
  obj(3, `<< /Title <FEFF${titleHex}> /Producer (My BrainMap) /Creator (My BrainMap) >>`);
  pages.forEach((pg, i) => {
    const pw = paper ? paper.w : pg.width * 0.75 + margin * 2;
    const ph = paper ? paper.h : pg.height * 0.75 + margin * 2;
    const k = Math.min((pw - margin * 2) / pg.width, (ph - margin * 2) / pg.height);
    const iw = pg.width * k, ih = pg.height * k;
    const x = (pw - iw) / 2, y = (ph - ih) / 2;
    const content = `q\n${iw.toFixed(2)} 0 0 ${ih.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm\n/Im0 Do\nQ\n`;
    obj(pageObj(i), `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw.toFixed(2)} ${ph.toFixed(2)}] /Resources << /XObject << /Im0 ${pageObj(i) + 2} 0 R >> >> /Contents ${pageObj(i) + 1} 0 R >>`);
    obj(pageObj(i) + 1, [`<< /Length ${enc(content).length} >>\nstream\n`, content, '\nendstream']);
    obj(pageObj(i) + 2, [`<< /Type /XObject /Subtype /Image /Width ${pg.width} /Height ${pg.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.jpeg.length} >>\nstream\n`, pg.jpeg, '\nendstream']);
  });
  const xref = size;
  const count = 4 + n * 3;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let i = 1; i < count; i++) push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

export function bytesToBase64(bytes) {
  let s = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) s += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
  return btoa(s);
}

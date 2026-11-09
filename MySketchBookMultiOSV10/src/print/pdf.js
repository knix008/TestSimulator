// A PDF of printed sheets, one JPEG picture per page (pure). The web build saves
// its "Save as PDF" with this; the desktop app asks WebView2 for a vector PDF and
// falls back to this when that is not available.

const MM_PT = 72 / 25.4;

/**
 * pages: [{ jpeg: Uint8Array, width, height (pixels), widthMm, heightMm }] → the PDF's bytes.
 * Each picture fills its page (the page size is the paper size).
 */
export function pdfFromJpegPages(pages, { title = '' } = {}) {
  const enc = new TextEncoder();
  const parts = [];
  const offsets = [];
  let length = 0;
  const push = (chunk) => { const b = typeof chunk === 'string' ? enc.encode(chunk) : chunk; parts.push(b); length += b.length; };
  const obj = (num, body) => { offsets[num] = length; push(`${num} 0 obj\n`); for (const b of [].concat(body)) push(b); push('\nendobj\n'); };
  const count = pages.length;
  // 1 catalog, 2 pages, 3 info, then 3 objects per page: page, image, contents.
  const pageObj = (i) => 4 + i * 3;
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${pageObj(i)} 0 R`).join(' ')}] /Count ${count} >>`);
  const safe = String(title).replace(/[^\x20-\x7e]/g, '').replace(/[()\\]/g, '');
  obj(3, `<< /Title (${safe}) /Producer (MySketchBook) >>`);
  pages.forEach((page, i) => {
    const w = +(page.widthMm * MM_PT).toFixed(2);
    const h = +(page.heightMm * MM_PT).toFixed(2);
    const p = pageObj(i);
    obj(p, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im${i} ${p + 1} 0 R >> >> /Contents ${p + 2} 0 R >>`);
    obj(p + 1, [`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`, page.jpeg, '\nendstream']);
    const content = `q ${w} 0 0 ${h} 0 0 cm /Im${i} Do Q`;
    obj(p + 2, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  const size = 4 + count * 3;
  const xref = length;
  let table = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let k = 1; k < size; k++) table += `${String(offsets[k]).padStart(10, '0')} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size ${size} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(length);
  let o = 0;
  for (const b of parts) { out.set(b, o); o += b.length; }
  return out;
}

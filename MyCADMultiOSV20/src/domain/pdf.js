// A small PDF writer for Std_PrintPdf: one page per printed sheet, each an
// image (the page rendered at print resolution) on a page of its paper size.
// Images are JPEG (DCTDecode) or raw RGB (FlateDecode-compressed by the caller).

const enc = new TextEncoder();
const MM = 72 / 25.4;

/**
 * pages: [{ widthMm, heightMm, image: { width, height, data: Uint8Array, filter: 'DCTDecode' | 'FlateDecode' } }]
 * info: { title, author, creator }. Returns the PDF bytes.
 */
export function buildPdf(pages, info = {}) {
  const parts = [];
  const offsets = [];
  let length = 0;
  const push = (chunk) => { const bytes = typeof chunk === 'string' ? enc.encode(chunk) : chunk; parts.push(bytes); length += bytes.length; };
  const object = (id, body) => { offsets[id] = length; push(`${id} 0 obj\n`); for (const piece of [].concat(body)) push(piece); push('\nendobj\n'); };
  const text = (value) => `(${String(value ?? '').replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, '?')})`;

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const n = pages.length;
  // 1 catalog, 2 pages, 3 info; per page: page, contents, image.
  const pageId = (i) => 4 + i * 3;
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Count ${n} /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(' ')}] >>`);
  object(3, `<< /Title ${text(info.title)} /Author ${text(info.author)} /Creator ${text(info.creator ?? 'MyCAD')} /Producer (MyCAD) >>`);
  pages.forEach((page, i) => {
    const w = +(page.widthMm * MM).toFixed(3);
    const h = +(page.heightMm * MM).toFixed(3);
    const id = pageId(i);
    const content = `q\n${w} 0 0 ${h} 0 0 cm\n/Im0 Do\nQ\n`;
    object(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`);
    object(id + 1, [`<< /Length ${content.length} >>\nstream\n`, content, '\nendstream']);
    const image = page.image;
    object(id + 2, [`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /${image.filter} /Length ${image.data.length} >>\nstream\n`, image.data, '\nendstream']);
  });
  const count = 4 + n * 3;
  const xref = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let i = 1; i < count; i++) push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(length);
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
}

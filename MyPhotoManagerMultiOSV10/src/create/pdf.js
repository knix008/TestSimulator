// Minimal PDF writer for photo books / contact prints: one JPEG per page,
// embedded untouched as a /DCTDecode image XObject (no re-encoding).
// The JPEG's SOF marker tells the colour space (1 = gray, 3 = RGB, 4 = CMYK);
// Adobe CMYK JPEGs (APP14 "Adobe") store inverted ink values and get /Decode.
// Output is PDF 1.4 with a classic cross-reference table and an Info dictionary.

const encoder = new TextEncoder();

/**
 * Read width, height, bits and component count from a JPEG's SOF marker.
 * Also reports whether an Adobe APP14 segment is present (inverted CMYK).
 */
export function jpegInfo(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('Not a JPEG');
  let p = 2;
  let adobe = false;
  while (p + 4 <= bytes.length) {
    if (bytes[p] !== 0xff) { p += 1; continue; }
    const marker = bytes[p + 1];
    if (marker === 0xff) { p += 1; continue; }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { p += 2; continue; }
    if (marker === 0xd9 || marker === 0xda) break;
    const length = (bytes[p + 2] << 8) | bytes[p + 3];
    const body = p + 4;
    if (marker === 0xee && length >= 12 && String.fromCharCode(...bytes.subarray(body, body + 5)) === 'Adobe') adobe = true;
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      return {
        bits: bytes[body],
        height: (bytes[body + 1] << 8) | bytes[body + 2],
        width: (bytes[body + 3] << 8) | bytes[body + 4],
        components: bytes[body + 5],
        adobe: adobe || hasAdobeAfter(bytes, p + 2 + length),
        progressive: marker === 0xc2,
      };
    }
    p += 2 + length;
  }
  throw new Error('JPEG has no SOF marker');
}

// APP14 normally precedes SOF, but scan the remaining header segments anyway.
function hasAdobeAfter(bytes, p) {
  while (p + 4 <= bytes.length && bytes[p] === 0xff) {
    const marker = bytes[p + 1];
    if (marker === 0xda || marker === 0xd9) return false;
    const length = (bytes[p + 2] << 8) | bytes[p + 3];
    if (marker === 0xee && String.fromCharCode(...bytes.subarray(p + 4, p + 9)) === 'Adobe') return true;
    p += 2 + length;
  }
  return false;
}

/** PDF text string: literal for ASCII, UTF-16BE hex with BOM otherwise. */
function pdfString(text) {
  const s = String(text);
  if (/^[\x20-\x7e]*$/.test(s)) return `(${s.replace(/[\\()]/g, (c) => `\\${c}`)})`;
  let hex = 'FEFF';
  for (let i = 0; i < s.length; i++) hex += s.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
  return `<${hex}>`;
}

const pdfDate = (date) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `D:${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
};

const num = (v) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};

/**
 * Placement of a w×h image on a page: 'contain' fits inside the margins
 * (centred, letterboxed); 'fill' covers the whole area inside the margins
 * (centred, overflow clipped). Returns { x, y, w, h, clip } in points.
 */
export function placeImage(width, height, pageWidth, pageHeight, fit = 'contain', margin = 0) {
  const boxW = Math.max(1, pageWidth - 2 * margin);
  const boxH = Math.max(1, pageHeight - 2 * margin);
  const scale = fit === 'fill' ? Math.max(boxW / width, boxH / height) : Math.min(boxW / width, boxH / height);
  const w = width * scale;
  const h = height * scale;
  return { x: margin + (boxW - w) / 2, y: margin + (boxH - h) / 2, w, h, clip: { x: margin, y: margin, w: boxW, h: boxH } };
}

/**
 * Build a PDF with one JPEG per page.
 *   pages: [{ jpeg: Uint8Array, width?, height? (pixels; read from the JPEG when missing),
 *             pageWidth?, pageHeight? (points; default = pixel size + margins),
 *             fit: 'contain' | 'fill', margin (points, default 0) }]
 *   options: { title, author, subject, creator, date }
 * Returns a Uint8Array.
 */
export function buildPdf(pages, { title, author, subject, creator = 'MyPhotoManager', date = new Date() } = {}) {
  if (!pages?.length) throw new Error('buildPdf: no pages');
  const chunks = [];
  let length = 0;
  const offsets = [];
  const push = (data) => {
    const bytes = typeof data === 'string' ? encoder.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id, body, stream) => {
    offsets[id] = length;
    push(`${id} 0 obj\n${body}\n`);
    if (stream) { push('stream\n'); push(stream); push('\nendstream\n'); }
    push('endobj\n');
  };

  // Header with a binary comment so transfer tools treat the file as binary.
  push('%PDF-1.4\n');
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  const catalogId = 1;
  const pagesId = 2;
  const infoId = 3;
  const pageIds = pages.map((_, i) => 4 + i * 3);

  object(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  object(pagesId, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  const info = [`/Producer ${pdfString(creator)}`, `/Creator ${pdfString(creator)}`, `/CreationDate ${pdfString(pdfDate(date))}`];
  if (title) info.push(`/Title ${pdfString(title)}`);
  if (author) info.push(`/Author ${pdfString(author)}`);
  if (subject) info.push(`/Subject ${pdfString(subject)}`);
  object(infoId, `<< ${info.join(' ')} >>`);

  pages.forEach((page, i) => {
    const pageId = pageIds[i];
    const contentId = pageId + 1;
    const imageId = pageId + 2;
    const jpeg = page.jpeg;
    const meta = jpegInfo(jpeg);
    const width = page.width || meta.width;
    const height = page.height || meta.height;
    const margin = page.margin ?? 0;
    const pageWidth = page.pageWidth || width + 2 * margin;
    const pageHeight = page.pageHeight || height + 2 * margin;
    const place = placeImage(width, height, pageWidth, pageHeight, page.fit ?? 'contain', margin);

    let content = 'q\n';
    if (page.fit === 'fill') content += `${num(place.clip.x)} ${num(place.clip.y)} ${num(place.clip.w)} ${num(place.clip.h)} re W n\n`;
    content += `${num(place.w)} 0 0 ${num(place.h)} ${num(place.x)} ${num(place.y)} cm\n/Im0 Do\nQ\n`;
    const contentBytes = encoder.encode(content);

    object(pageId, `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${num(pageWidth)} ${num(pageHeight)}] /Resources << /XObject << /Im0 ${imageId} 0 R >> /ProcSet [/PDF /ImageB /ImageC] >> /Contents ${contentId} 0 R >>`);
    object(contentId, `<< /Length ${contentBytes.length} >>`, contentBytes);

    const colorSpace = meta.components === 1 ? '/DeviceGray' : meta.components === 4 ? '/DeviceCMYK' : '/DeviceRGB';
    const decode = meta.components === 4 && meta.adobe ? ' /Decode [1 0 1 0 1 0 1 0]' : '';
    object(imageId, `<< /Type /XObject /Subtype /Image /Width ${meta.width} /Height ${meta.height} /ColorSpace ${colorSpace} /BitsPerComponent 8${decode} /Filter /DCTDecode /Length ${jpeg.length} >>`, jpeg);
  });

  const count = 4 + pages.length * 3;
  const xrefOffset = length;
  let xref = `xref\n0 ${count}\n0000000000 65535 f\r\n`;
  for (let id = 1; id < count; id++) xref += `${String(offsets[id]).padStart(10, '0')} 00000 n\r\n`;
  push(xref);
  push(`trailer\n<< /Size ${count} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let p = 0;
  for (const chunk of chunks) { out.set(chunk, p); p += chunk.length; }
  return out;
}

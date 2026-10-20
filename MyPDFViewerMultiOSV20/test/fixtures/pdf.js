// Builds a minimal but valid PDF-1.4 with xref, so pdf.js can open it.
// Object numbers are assigned as we go so the font / info / outline refs stay aligned.

function ascii(s) {
  return new TextEncoder().encode(s);
}

function pad10(n) {
  return String(n).padStart(10, '0');
}

function escapePdfString(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

export function buildPdf({
  pages = [{ text: 'Hello World' }],
  title = 'Test Document',
  author = 'MyPDFViewer Tests',
  subject = '',
  keywords = '',
  withOutline = false,
  withImage = false,
  withLinks = false,
} = {}) {
  const objects = [null];
  const alloc = (body = '') => {
    objects.push(body);
    return objects.length - 1;
  };

  const catalogId = alloc();
  const pagesId = alloc();
  const pageIds = pages.map(() => alloc());
  const contentIds = pages.map(() => alloc());
  const fontId = alloc('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const infoId = alloc(
    `<< /Title (${escapePdfString(title)}) /Author (${escapePdfString(author)})`
    + (subject ? ` /Subject (${escapePdfString(subject)})` : '')
    + (keywords ? ` /Keywords (${escapePdfString(keywords)})` : '')
    + ' /Creator (MyPDFViewer Tests) /Producer (test/fixtures/pdf.js) >>',
  );

  let outlinesId = null;
  let firstOutlineId = null;
  if (withOutline) {
    outlinesId = alloc();
    firstOutlineId = alloc();
  }

  const destLinkId = withLinks ? alloc() : null;
  const uriLinkId = withLinks ? alloc() : null;

  let imageId = null;
  if (withImage) {
    const pixels = Uint8Array.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]);
    const raw = Array.from(pixels, (b) => String.fromCharCode(b)).join('');
    imageId = alloc(
      `<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ${pixels.length} >>\nstream\n${raw}\nendstream`,
    );
  }

  objects[catalogId] = withOutline
    ? `<< /Type /Catalog /Pages ${pagesId} 0 R /Outlines ${outlinesId} 0 R >>`
    : `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;

  objects[pagesId] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;

  pages.forEach((page, i) => {
    const imageRes = imageId && i === 0 ? ` /XObject << /Im1 ${imageId} 0 R >>` : '';
    const annots = [];
    if (destLinkId && i === 0) annots.push(destLinkId);
    if (uriLinkId && i === 0) annots.push(uriLinkId);
    const annotsPart = annots.length
      ? ` /Annots [${annots.map((id) => `${id} 0 R`).join(' ')}]`
      : '';
    objects[pageIds[i]] = (
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] `
      + `/Contents ${contentIds[i]} 0 R `
      + `/Resources << /Font << /F1 ${fontId} 0 R >>${imageRes} >>`
      + `${annotsPart} >>`
    );

    const text = escapePdfString(page.text || '');
    const x = page.x ?? 72;
    const y = page.y ?? 720;
    const size = page.size ?? 18;
    let stream = `BT /F1 ${size} Tf ${x} ${y} Td (${text}) Tj ET`;
    if (imageId && i === 0) stream += '\nq 80 0 0 60 72 600 cm /Im1 Do Q';
    objects[contentIds[i]] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });

  if (withLinks && destLinkId) {
    const target = pageIds[Math.min(pageIds.length - 1, 1)];
    objects[destLinkId] = (
      `<< /Type /Annot /Subtype /Link /Rect [72 690 500 750] /Border [0 0 0] `
      + `/Dest [ ${target} 0 R /XYZ 0 720 0 ] >>`
    );
  }
  if (withLinks && uriLinkId) {
    objects[uriLinkId] = (
      `<< /Type /Annot /Subtype /Link /Rect [72 640 300 680] /Border [0 0 0] `
      + `/A << /S /URI /URI (https://example.com/doc) >> >>`
    );
  }

  if (withOutline) {
    const dest = `[ ${pageIds[0]} 0 R /XYZ 0 792 0 ]`;
    objects[outlinesId] = `<< /Type /Outlines /Count 1 /First ${firstOutlineId} 0 R /Last ${firstOutlineId} 0 R >>`;
    objects[firstOutlineId] = (
      `<< /Title (${escapePdfString(pages[0]?.text || 'Page 1')}) /Parent ${outlinesId} 0 R /Dest ${dest} >>`
    );
  }

  return assemble(objects, catalogId, infoId);
}

function assemble(objects, rootId, infoId) {
  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = body.length;
    body += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = body.length;
  body += `xref\n0 ${objects.length}\n`;
  body += '0000000000 65535 f \n';
  for (let i = 1; i < objects.length; i++) {
    body += `${pad10(offsets[i])} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length} /Root ${rootId} 0 R /Info ${infoId} 0 R >>\n`;
  body += `startxref\n${xref}\n%%EOF\n`;
  return ascii(body);
}

export function pdfWithJunkPrefix(bytes) {
  const junk = ascii('not a header yet ');
  const out = new Uint8Array(junk.length + bytes.length);
  out.set(junk, 0);
  out.set(bytes, junk.length);
  return out;
}

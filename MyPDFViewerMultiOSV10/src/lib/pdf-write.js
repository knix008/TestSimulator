// Write workspace markup into a PDF: highlights, sticky-note comments,
// outline bookmarks, and file attachments. Existing page content and
// PDF-native annotations are left in place; only new objects are added.
import {
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFString,
} from 'pdf-lib';

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export function rgbFromCss(color, fallback = [1, 0.84, 0]) {
  const s = String(color || '');
  const rgba = s.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (rgba) {
    const to1 = (v) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return 0;
      return n > 1 ? n / 255 : n;
    };
    return [to1(rgba[1]), to1(rgba[2]), to1(rgba[3])];
  }
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  }
  return fallback;
}

// Workspace rects are 0..1 from the top-left. PDF rects are points from the
// bottom-left.
export function fracRectToPdf(rect, pageW, pageH) {
  const x = (Number(rect?.x) || 0) * pageW;
  const w = (Number(rect?.w ?? rect?.width) || 0) * pageW;
  const h = (Number(rect?.h ?? rect?.height) || 0) * pageH;
  const top = (Number(rect?.y) || 0) * pageH;
  const y = pageH - top - h;
  return { x, y, w, h, x2: x + w, y2: y + h };
}

export function bytesToBase64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('base64');
  const parts = [];
  const step = 0x8000;
  for (let i = 0; i < u8.length; i += step) {
    parts.push(String.fromCharCode(...u8.subarray(i, i + step)));
  }
  return btoa(parts.join(''));
}

export function base64ToBytes(b64) {
  const raw = String(b64 || '');
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(raw, 'base64'));
  const bin = atob(raw);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function suggestedPdfCopyName(name) {
  const raw = String(name || 'document.pdf').trim() || 'document.pdf';
  const base = raw.replace(/\.pdf$/i, '') || 'document';
  if (/-annotated$/i.test(base)) return `${base}.pdf`;
  return `${base}-annotated.pdf`;
}

export function asciiFileName(name) {
  const base = String(name || 'attachment').replace(/[/\\]/g, '_');
  return base.replace(/[^\x20-\x7E]/g, '_') || 'attachment';
}

function annotName(id) {
  return PDFString.of(`mypdfv:${String(id || '').slice(0, 40)}`);
}

function addAnnot(page, dict) {
  const ref = page.doc.context.register(page.doc.context.obj(dict));
  page.node.addAnnot(ref);
  return ref;
}

function highlightQuads(rects, pageW, pageH) {
  const quads = [];
  const pdfRects = [];
  for (const r of rects || []) {
    const p = fracRectToPdf(r, pageW, pageH);
    if (p.w <= 0 && p.h <= 0) continue;
    quads.push(p.x, p.y + p.h, p.x + p.w, p.y + p.h, p.x, p.y, p.x + p.w, p.y);
    pdfRects.push(p);
  }
  return { quads, pdfRects };
}

function unionRect(pdfRects, fallback) {
  if (!pdfRects.length) return fallback;
  const x1 = Math.min(...pdfRects.map((r) => r.x));
  const y1 = Math.min(...pdfRects.map((r) => r.y));
  const x2 = Math.max(...pdfRects.map((r) => r.x2));
  const y2 = Math.max(...pdfRects.map((r) => r.y2));
  return [x1, y1, x2, y2];
}

export function addHighlightAnnotation(page, { id, rects, text, color }) {
  const { width, height } = page.getSize();
  const { quads, pdfRects } = highlightQuads(rects, width, height);
  if (!quads.length) return null;
  const rgb = rgbFromCss(color);
  return addAnnot(page, {
    Type: 'Annot',
    Subtype: 'Highlight',
    Rect: unionRect(pdfRects, [0, 0, 18, 18]),
    QuadPoints: quads,
    C: rgb,
    CA: 0.4,
    Contents: PDFHexString.fromText(String(text || '')),
    NM: annotName(id),
    T: PDFHexString.fromText('MyPDFViewer'),
  });
}

export function addTextAnnotation(page, { id, rects, text, color }) {
  const { width, height } = page.getSize();
  const src = (rects || []).filter(Boolean);
  const first = src[0] ? fracRectToPdf(src[0], width, height) : { x: 18, y: height - 36, w: 18, h: 18 };
  const rgb = rgbFromCss(color, [1, 0.78, 0]);
  if (src.length) addHighlightAnnotation(page, { id: `${id}-hl`, rects: src, text, color });
  return addAnnot(page, {
    Type: 'Annot',
    Subtype: 'Text',
    Rect: [first.x, first.y + first.h - 18, first.x + 18, first.y + first.h],
    Contents: PDFHexString.fromText(String(text || '')),
    Name: 'Comment',
    Open: false,
    C: rgb,
    NM: annotName(id),
    T: PDFHexString.fromText('MyPDFViewer'),
  });
}

function ensureNamesDict(pdfDoc) {
  const context = pdfDoc.context;
  let names = pdfDoc.catalog.lookup(PDFName.of('Names'));
  if (!names) {
    const ref = context.register(context.obj({}));
    pdfDoc.catalog.set(PDFName.of('Names'), ref);
    names = pdfDoc.catalog.lookup(PDFName.of('Names'));
  }
  return names;
}

function registerEmbeddedFile(pdfDoc, { name, bytes, mime }) {
  const context = pdfDoc.context;
  const stream = context.flateStream(bytes, {
    Type: 'EmbeddedFile',
    Params: { Size: bytes.length },
  });
  const efRef = context.register(stream);
  const fileSpec = context.obj({
    Type: 'Filespec',
    F: PDFString.of(asciiFileName(name)),
    UF: PDFHexString.fromText(String(name || 'attachment')),
    EF: { F: efRef },
    Desc: PDFHexString.fromText(String(name || '')),
  });
  const fsRef = context.register(fileSpec);

  const names = ensureNamesDict(pdfDoc);
  let ef = names.lookup(PDFName.of('EmbeddedFiles'));
  if (!ef) {
    const treeRef = context.register(context.obj({ Names: [] }));
    names.set(PDFName.of('EmbeddedFiles'), treeRef);
    ef = names.lookup(PDFName.of('EmbeddedFiles'));
  }
  let arr = ef.lookup(PDFName.of('Names'));
  if (!arr) {
    ef.set(PDFName.of('Names'), []);
    arr = ef.lookup(PDFName.of('Names'));
  }
  arr.push(PDFHexString.fromText(String(name || 'attachment')));
  arr.push(fsRef);
  return fsRef;
}

export function addFileAttachmentAnnotation(page, { id, name, bytes, mime, y, rect }) {
  const { width, height } = page.getSize();
  const spot = rect
    ? fracRectToPdf(rect, width, height)
    : { x: 16, y: height * (1 - Math.min(1, Math.max(0, Number(y) || 0))) - 18, w: 18, h: 18 };
  const fsRef = registerEmbeddedFile(page.doc, { name, bytes, mime });
  return addAnnot(page, {
    Type: 'Annot',
    Subtype: 'FileAttachment',
    Rect: [spot.x, spot.y, spot.x + Math.max(18, spot.w), spot.y + Math.max(18, spot.h)],
    FS: fsRef,
    Contents: PDFHexString.fromText(String(name || 'attachment')),
    Name: 'Paperclip',
    C: [0.25, 0.45, 0.85],
    NM: annotName(id),
    T: PDFHexString.fromText('MyPDFViewer'),
  });
}

export function appendOutlineEntries(pdfDoc, entries) {
  const valid = (entries || []).filter((e) => e && e.page >= 1 && e.page <= pdfDoc.getPageCount());
  if (!valid.length) return 0;
  const context = pdfDoc.context;
  const pages = pdfDoc.getPages();
  const refs = valid.map(() => context.nextRef());

  let outlinesRef = pdfDoc.catalog.get(PDFName.of('Outlines'));
  let existingLast = null;
  let existingFirst = null;
  let existingCount = 0;
  let outlines;

  if (outlinesRef) {
    outlines = pdfDoc.catalog.lookup(PDFName.of('Outlines'));
    existingFirst = outlines.get(PDFName.of('First'));
    existingLast = outlines.get(PDFName.of('Last'));
    const count = outlines.get(PDFName.of('Count'));
    existingCount = typeof count?.asNumber === 'function' ? Math.abs(count.asNumber()) : 0;
  } else {
    outlinesRef = context.nextRef();
  }

  for (let i = 0; i < valid.length; i++) {
    const e = valid[i];
    const page = pages[e.page - 1];
    const top = Number.isFinite(e.top) ? e.top : page.getSize().height;
    const dict = {
      Title: PDFHexString.fromText(String(e.title || `Page ${e.page}`)),
      Parent: outlinesRef,
      Dest: [page.ref, 'XYZ', null, top, null],
    };
    if (i > 0) dict.Prev = refs[i - 1];
    else if (existingLast) dict.Prev = existingLast;
    if (i < valid.length - 1) dict.Next = refs[i + 1];
    context.assign(refs[i], context.obj(dict));
  }

  if (existingLast) {
    const last = context.lookup(existingLast);
    last?.set?.(PDFName.of('Next'), refs[0]);
  }

  if (outlines) {
    if (!existingFirst) outlines.set(PDFName.of('First'), refs[0]);
    outlines.set(PDFName.of('Last'), refs[refs.length - 1]);
    outlines.set(PDFName.of('Count'), existingCount + valid.length);
  } else {
    context.assign(outlinesRef, context.obj({
      Type: 'Outlines',
      First: refs[0],
      Last: refs[refs.length - 1],
      Count: valid.length,
    }));
    pdfDoc.catalog.set(PDFName.of('Outlines'), outlinesRef);
  }
  return valid.length;
}

export function attachmentRecord({ page, name, mime, bytes, y, rect } = {}) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  return {
    page: Number(page) || 1,
    kind: 'fileattachment',
    name: String(name || 'attachment'),
    mime: String(mime || 'application/octet-stream'),
    size: data.length,
    data: bytesToBase64(data),
    y: Number.isFinite(Number(y)) ? Math.min(1, Math.max(0, Number(y))) : 0.08,
    ...(rect ? { rect } : {}),
  };
}

export function workspaceHasPdfMarkup(workspace) {
  const notes = (workspace?.annotations || []).length;
  const marks = (workspace?.bookmarks || []).length;
  const files = (workspace?.attachments || []).length;
  return notes + marks + files > 0;
}

export async function writeWorkspaceIntoPdf(pdfBytes, workspace = {}) {
  const src = pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes || []);
  const pdfDoc = await PDFDocument.load(src, { updateMetadata: false });
  const pages = pdfDoc.getPages();

  for (const annot of workspace.annotations || []) {
    const page = pages[(Number(annot.page) || 1) - 1];
    if (!page) continue;
    const rects = annot.rects?.length ? annot.rects : (annot.rect ? [annot.rect] : []);
    if (annot.kind === 'note' || annot.kind === 'comment') {
      addTextAnnotation(page, { id: annot.id, rects, text: annot.text, color: annot.color });
    } else if (annot.kind === 'highlight') {
      addHighlightAnnotation(page, { id: annot.id, rects, text: annot.text, color: annot.color });
    }
  }

  for (const att of workspace.attachments || []) {
    const page = pages[(Number(att.page) || 1) - 1];
    if (!page) continue;
    const bytes = att.bytes instanceof Uint8Array ? att.bytes : base64ToBytes(att.data);
    if (!bytes.length) continue;
    if (bytes.length > MAX_ATTACHMENT_BYTES) {
      throw new Error(`Attachment "${att.name}" is larger than ${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB.`);
    }
    addFileAttachmentAnnotation(page, {
      id: att.id,
      name: att.name,
      bytes,
      mime: att.mime,
      y: att.y,
      rect: att.rect,
    });
  }

  appendOutlineEntries(pdfDoc, (workspace.bookmarks || []).map((b) => {
    const page = pages[(Number(b.page) || 1) - 1];
    const h = page ? page.getSize().height : 0;
    const y = Number(b.y);
    const top = Number.isFinite(y) ? h * (1 - Math.min(1, Math.max(0, y))) : h;
    return { page: Number(b.page) || 1, title: b.label || b.text || `Page ${b.page}`, top };
  }));

  const saved = await pdfDoc.save({ useObjectStreams: false });
  return saved instanceof Uint8Array ? saved : new Uint8Array(saved);
}

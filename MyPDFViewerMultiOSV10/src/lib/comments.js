// PDF markup / sticky-note comments, plus workspace notes. The viewer does
// not paint pdf.js's AnnotationLayer, so these helpers turn the raw
// annotation objects into regions + text that the page can draw itself.

const KIND_BY_TYPE = {
  1: 'text',
  3: 'freetext',
  9: 'highlight',
  10: 'underline',
  11: 'squiggly',
  12: 'strikeout',
  13: 'stamp',
  14: 'caret',
  17: 'fileattachment',
};

const KIND_BY_SUBTYPE = {
  text: 'text',
  freetext: 'freetext',
  highlight: 'highlight',
  underline: 'underline',
  squiggly: 'squiggly',
  strikeout: 'strikeout',
  caret: 'caret',
  stamp: 'stamp',
  fileattachment: 'fileattachment',
};

const SKIP_SUBTYPE = new Set(['link', 'popup', 'widget', 'screen']);

export function commentKind(annot) {
  const sub = String(annot?.subtype || '').toLowerCase();
  if (KIND_BY_SUBTYPE[sub]) return KIND_BY_SUBTYPE[sub];
  return KIND_BY_TYPE[annot?.annotationType] || '';
}

export function isCommentAnnotation(annot) {
  if (!annot) return false;
  const sub = String(annot.subtype || '').toLowerCase();
  if (SKIP_SUBTYPE.has(sub)) return false;
  if (annot.annotationType === 2 || annot.annotationType === 16 || annot.annotationType === 20) {
    return false;
  }
  return !!commentKind(annot);
}

export function annotText(annot) {
  const raw = annot?.contentsObj?.str ?? annot?.contents ?? annot?.richText?.str ?? '';
  return String(raw).replace(/\s+/g, ' ').trim();
}

export function annotAuthor(annot) {
  return String(annot?.titleObj?.str ?? annot?.title ?? annot?.author ?? '').trim();
}

export function annotColor(color, fallback = 'rgba(255, 214, 0, 0.42)') {
  if (!color || !color.length) return fallback;
  const to255 = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return n <= 1 ? Math.round(n * 255) : Math.round(n);
  };
  return `rgba(${to255(color[0])}, ${to255(color[1])}, ${to255(color[2])}, 0.42)`;
}

export function viewportRect(raw, convert) {
  const src = raw && raw.length >= 4 ? raw : [0, 0, 0, 0];
  let vr = src;
  if (typeof convert === 'function') {
    try { vr = convert(src) || src; } catch { vr = src; }
  }
  const x1 = Number(vr[0]) || 0;
  const y1 = Number(vr[1]) || 0;
  const x2 = Number(vr[2]) || 0;
  const y2 = Number(vr[3]) || 0;
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

export function normalizeQuadGroups(quads) {
  if (!quads) return [];
  const arr = Array.from(quads);
  if (!arr.length) return [];
  if (typeof arr[0] === 'number') {
    const groups = [];
    for (let i = 0; i + 7 < arr.length; i += 8) groups.push(arr.slice(i, i + 8));
    return groups;
  }
  if (arr[0] && typeof arr[0][0] === 'number') {
    return arr.map((g) => Array.from(g).slice(0, 8)).filter((g) => g.length >= 8);
  }
  if (arr[0] && arr[0].x != null) {
    const groups = [];
    for (let i = 0; i + 3 < arr.length; i += 4) {
      const pts = arr.slice(i, i + 4);
      groups.push(pts.flatMap((p) => [p.x, p.y]));
    }
    return groups;
  }
  return [];
}

export function quadsToRects(quads, convert) {
  return normalizeQuadGroups(quads).map((pts) => {
    const xs = [pts[0], pts[2], pts[4], pts[6]];
    const ys = [pts[1], pts[3], pts[5], pts[7]];
    return viewportRect([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], convert);
  }).filter((r) => r.width > 0.5 || r.height > 0.5);
}

export function commentCardPos(anchor, pageW = 400, pageH = 600) {
  const gap = 8;
  const cardW = Math.min(220, Math.max(120, pageW * 0.4));
  const r = anchor || { x: 0, y: 0, width: 0, height: 0 };
  let left = r.x + r.width + gap;
  let top = r.y;
  if (left + cardW > pageW - 4) left = Math.max(4, r.x - cardW - gap);
  if (left < 4) left = 4;
  if (top < 4) top = 4;
  if (top > pageH - 28) top = Math.max(4, pageH - 28);
  return { left, top };
}

export function normalizeComment(annot, { convertRect, id } = {}) {
  if (!isCommentAnnotation(annot)) return null;
  const kind = commentKind(annot);
  const text = annotText(annot);
  const author = annotAuthor(annot);
  let rects = quadsToRects(annot.quadPoints, convertRect);
  if (!rects.length && annot.rect) rects = [viewportRect(annot.rect, convertRect)];
  rects = rects.filter((r) => r.width > 0 || r.height > 0);
  if (!rects.length) return null;
  const markup = kind === 'highlight' || kind === 'underline' || kind === 'squiggly' || kind === 'strikeout';
  const filename = String(annot.file?.filename || annot.file?.name || '').trim();
  if (!text && !author && !markup && kind !== 'text' && kind !== 'freetext' && kind !== 'fileattachment') {
    return null;
  }
  if (kind === 'fileattachment' && !text && !filename && !rects.length) return null;
  return {
    id: annot.id || id || `c-${kind}`,
    kind,
    author,
    text: text || filename,
    filename,
    fileData: annot.file?.content || null,
    color: annotColor(annot.color, kind === 'fileattachment' ? 'rgba(64, 120, 210, 0.4)' : undefined),
    rects,
  };
}

export function workspaceNoteToComment(note, pageW, pageH) {
  if (!note) return null;
  const src = note.rects?.length ? note.rects : (note.rect ? [note.rect] : []);
  const w = Math.max(1, Number(pageW) || 1);
  const h = Math.max(1, Number(pageH) || 1);
  const rects = src.map((r) => ({
    x: (r.x ?? 0) * w,
    y: (r.y ?? 0) * h,
    width: (r.w ?? r.width ?? 0) * w,
    height: (r.h ?? r.height ?? 0) * h,
  })).filter((r) => r.width > 0 || r.height > 0);
  if (!rects.length && !note.text) return null;
  return {
    id: note.id,
    kind: 'note',
    author: note.author || '',
    text: note.text || '',
    color: note.color || 'rgba(255, 196, 0, 0.42)',
    rects,
  };
}

export function workspaceAttachmentToComment(att, pageW, pageH) {
  if (!att) return null;
  const w = Math.max(1, Number(pageW) || 1);
  const h = Math.max(1, Number(pageH) || 1);
  const src = att.rect ? [att.rect] : [];
  let rects = src.map((r) => ({
    x: (r.x ?? 0) * w,
    y: (r.y ?? 0) * h,
    width: (r.w ?? r.width ?? 0.04) * w,
    height: (r.h ?? r.height ?? 0.03) * h,
  })).filter((r) => r.width > 0 || r.height > 0);
  if (!rects.length) {
    const y = Math.min(1, Math.max(0, Number(att.y) || 0.08));
    rects = [{ x: 10, y: y * h, width: 16, height: 16 }];
  }
  return {
    id: att.id,
    kind: 'fileattachment',
    author: '',
    text: att.name || '',
    filename: att.name || '',
    fileData: att.data || null,
    color: 'rgba(64, 120, 210, 0.4)',
    rects,
    page: att.page,
  };
}

export function isWorkspaceComment(item) {
  return !!item && (item.kind === 'note' || item.kind === 'comment' || item.kind === 'fileattachment');
}

export function commentAnchorY(note) {
  const frac = Number(note?.fracY);
  if (Number.isFinite(frac)) return Math.min(1, Math.max(0, frac));
  const r = note?.rects?.[0] || note?.rect;
  const y = Number(r?.y);
  if (!Number.isFinite(y) || y > 1) return 0;
  return Math.min(1, Math.max(0, y));
}

export function listWorkspaceComments(annotations) {
  return (annotations || [])
    .filter(isWorkspaceComment)
    .slice()
    .sort((a, b) => {
      const page = (Number(a.page) || 0) - (Number(b.page) || 0);
      if (page) return page;
      return commentAnchorY(a) - commentAnchorY(b);
    });
}

export function commentPreview(note, max = 80) {
  const text = String(note?.text || note?.filename || '').replace(/\s+/g, ' ').trim();
  const author = String(note?.author || '').trim();
  const raw = text || author;
  if (!raw) return '';
  const limit = Number(max) > 0 ? Number(max) : 80;
  return raw.length > limit ? `${raw.slice(0, limit - 1)}…` : raw;
}

export function mergeCommentList(pdfComments, workspaceNotes, attachments) {
  const notes = listWorkspaceComments(workspaceNotes).map((n) => ({
    ...n,
    source: 'workspace',
    removable: true,
    fracY: commentAnchorY(n),
  }));
  const files = (attachments || []).map((a) => ({
    ...workspaceAttachmentToComment(a, 1, 1),
    ...a,
    kind: 'fileattachment',
    source: 'workspace',
    removable: true,
    fracY: commentAnchorY(a),
    text: a.name || a.text || '',
    filename: a.name || a.filename || '',
  }));
  const pdf = (pdfComments || []).map((c) => ({
    ...c,
    source: 'pdf',
    removable: false,
    fracY: c.fracY ?? commentAnchorY(c),
  }));
  return [...pdf, ...notes, ...files].sort((a, b) => {
    const page = (Number(a.page) || 0) - (Number(b.page) || 0);
    if (page) return page;
    return commentAnchorY(a) - commentAnchorY(b);
  });
}

// The Highlights panel: every highlight in the open document, whether it was
// made in this session (workspace) or is already saved inside the PDF.
import { commentAnchorY, commentPreview } from './comments.js';

// pdf.js names an annotation after its object: "12R", or "12R3" for generation 3.
export function pdfRefFromId(id) {
  const m = /^(\d+)R(\d*)$/.exec(String(id || ''));
  if (!m) return null;
  return { num: Number(m[1]), gen: m[2] ? Number(m[2]) : 0 };
}

// Lines closer than this (share of the page height) belong to one passage.
const SAME_PASSAGE_GAP = 0.06;

// Highlights made before one selection became one highlight were stored a
// line at a time: same page, same text, lines right under each other. They
// are shown — and deleted — as the single passage they were.
export function groupPassages(items) {
  const out = [];
  for (const it of items) {
    const prev = out[out.length - 1];
    if (
      prev && it.text && prev.source === it.source && prev.page === it.page && prev.text === it.text
      && Math.abs((it.fracY || 0) - (prev.lastY ?? prev.fracY ?? 0)) <= SAME_PASSAGE_GAP
    ) {
      prev.ids.push(it.id);
      prev.lastY = it.fracY || 0;
      continue;
    }
    out.push({ ...it, ids: [it.id], lastY: it.fracY || 0 });
  }
  return out.map(({ lastY, ...rest }) => rest);
}

export function listHighlights(workspaceAnnotations, pdfComments) {
  const mine = (workspaceAnnotations || [])
    .filter((a) => a && a.kind === 'highlight')
    .map((a) => ({
      id: a.id,
      source: 'workspace',
      page: Number(a.page) || 1,
      fracY: commentAnchorY(a),
      text: commentPreview(a, 120),
      color: a.color,
      rects: a.rects,
    }));
  const saved = (pdfComments || [])
    .filter((c) => c && c.kind === 'highlight' && pdfRefFromId(c.id))
    .map((c) => ({
      id: c.id,
      source: 'pdf',
      page: Number(c.page) || 1,
      fracY: c.fracY ?? commentAnchorY(c),
      text: commentPreview(c, 120),
      color: c.color,
      rects: c.rects,
    }));
  const sorted = [...saved, ...mine].sort((a, b) => (a.page - b.page)
    || (a.source === b.source ? 0 : (a.source === 'pdf' ? -1 : 1))
    || ((a.fracY || 0) - (b.fracY || 0)));
  return groupPassages(sorted);
}

// What deleting `items` means: workspace ids to drop, and saved annotations
// to strip from the PDF bytes.
export function splitHighlightDeletes(items) {
  const workspaceIds = new Set();
  const pdfRefs = [];
  for (const it of items || []) {
    if (!it) continue;
    const ids = it.ids?.length ? it.ids : [it.id];
    for (const id of ids) {
      if (it.source === 'workspace') workspaceIds.add(id);
      else if (it.source === 'pdf') {
        const ref = pdfRefFromId(id);
        if (ref) pdfRefs.push({ page: Number(it.page) || 1, ...ref });
      }
    }
  }
  return { workspaceIds, pdfRefs };
}

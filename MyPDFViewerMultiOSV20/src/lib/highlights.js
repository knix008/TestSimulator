// The Highlights panel: every highlight in the open document, whether it was
// made in this session (workspace) or is already saved inside the PDF.
import { commentAnchorY, commentPreview } from './comments.js';

// pdf.js names an annotation after its object: "12R", or "12R3" for generation 3.
export function pdfRefFromId(id) {
  const m = /^(\d+)R(\d*)$/.exec(String(id || ''));
  if (!m) return null;
  return { num: Number(m[1]), gen: m[2] ? Number(m[2]) : 0 };
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
  return [...saved, ...mine].sort((a, b) => (a.page - b.page) || ((a.fracY || 0) - (b.fracY || 0)));
}

// What deleting `items` means: workspace ids to drop, and saved annotations
// to strip from the PDF bytes.
export function splitHighlightDeletes(items) {
  const workspaceIds = new Set();
  const pdfRefs = [];
  for (const it of items || []) {
    if (!it) continue;
    if (it.source === 'workspace') workspaceIds.add(it.id);
    else if (it.source === 'pdf') {
      const ref = pdfRefFromId(it.id);
      if (ref) pdfRefs.push({ page: Number(it.page) || 1, ...ref });
    }
  }
  return { workspaceIds, pdfRefs };
}

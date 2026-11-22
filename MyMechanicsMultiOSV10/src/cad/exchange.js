// Exchange formats that go through the full OpenCASCADE build (occt-full.js): IGES. The modelling kernel's shapes
// cross as BREP text. Works in a worker (the app: src/workers/formats-worker.js) and under Node (the tests).
import { rep } from './kernel.js';
import { igesToBrep, brepToIges } from './occt-full.js';

/** The solids of a shape (a compound's children; the shape itself when it is one). */
function solidsOf(shape) {
  const R = rep(); const oc = R.getOC();
  const out = [];
  const ex = new oc.TopExp_Explorer(shape.wrapped, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  try { for (; ex.More(); ex.Next()) out.push(R.cast(ex.Current())); } finally { ex.delete(); }
  return out;
}

/**
 * The shape to keep from an imported file: its one solid when it holds exactly one and nothing else, else the whole.
 * Returns { shape, solid (everything is closed solids), solids }.
 */
export function pickSolid(all) {
  const solids = solidsOf(all);
  const faces = all.faces?.length ?? 0;
  const inSolids = solids.reduce((n, s) => n + (s.faces?.length ?? 0), 0);
  return { shape: solids.length === 1 && inSolids === faces ? solids[0] : all, solid: solids.length > 0 && inSolids === faces, solids: solids.length };
}

/**
 * An IGES file (text or bytes) as a modelling-kernel shape: { shape (one solid when the file holds one, else the
 * compound), solid (true when everything came in as closed solids), solids (their count) }.
 */
export async function importIges(data) {
  return pickSolid(rep().deserializeShape(await igesToBrep(data)));
}

/** A modelling-kernel shape as IGES text (options: unit 'MM' | 'IN', mode 'brep' (solids) | 'faces' (trimmed surfaces)). */
export function exportIges(shape, options = {}) {
  return brepToIges(shape.serialize(), options);
}

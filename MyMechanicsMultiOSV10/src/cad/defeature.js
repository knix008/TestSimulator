// Defeature: a simplified version of a part for assemblies, simulation and sharing — the small details left out.
//   candidates()     the features that count as details by the criteria: fillets and rounds up to a radius, chamfers up
//                    to a distance, holes up to a diameter, threads, wraps (embossed / engraved text and logos), domes;
//                    a pattern goes too when all its seeds do
//   defeature()      a configuration "Simplified" with those features suppressed (the part itself unchanged); features
//                    that then fail to rebuild (built on a removed one) are suppressed as well, by the caller's check
// No DOM, no kernel.
import { addConfiguration, activeConfiguration } from './params.js';

export const DEFAULT_CRITERIA = { fillets: true, filletRadius: 3, chamfers: true, chamferDistance: 2, holes: true, holeDiameter: 6, threads: true, wraps: true, domes: true };

const PATTERNS = new Set(['linearPattern', 'circularPattern', 'mirror', 'curvePattern', 'sketchPattern', 'tablePattern', 'fillPattern', 'variablePattern']);

/** Why a feature counts as a detail (and its size), or null. */
function detailOf(f, c) {
  if (f.suppressed) return null;
  switch (f.type) {
    case 'fillet': case 'faceFillet': { const r = Number(f.radius); return c.fillets && r <= c.filletRadius ? { reason: 'fillet', size: r } : null; }
    case 'variableFillet': { const r = Math.max(Number(f.r1), Number(f.r2)); return c.fillets && r <= c.filletRadius ? { reason: 'fillet', size: r } : null; }
    case 'fullRoundFillet': return c.fillets ? { reason: 'fillet', size: null } : null;
    case 'chamfer': { const d = Number(f.distance); return c.chamfers && d <= c.chamferDistance ? { reason: 'chamfer', size: d } : null; }
    case 'hole': { const d = Number(f.kind === 'counterbore' ? f.cbDiameter : f.kind === 'countersink' ? f.csDiameter : f.diameter); return c.holes && d <= c.holeDiameter ? { reason: 'hole', size: d } : null; }
    case 'thread': return c.threads ? { reason: 'thread', size: Number(f.pitch) || null } : null;
    case 'wrap': return c.wraps ? { reason: 'wrap', size: Number(f.depth) || null } : null;
    case 'dome': return c.domes ? { reason: 'dome', size: Number(f.height) || null } : null;
    default: return null;
  }
}

/** The detail features of a part by the criteria: [{ id, name, type, reason, size }] in tree order. */
export function candidates(part, criteria = {}) {
  const c = { ...DEFAULT_CRITERIA, ...criteria };
  const out = [], gone = new Set();
  for (const f of part.features ?? []) {
    const d = detailOf(f, c);
    if (d) { out.push({ id: f.id, name: f.name, type: f.type, ...d }); gone.add(f.id); continue; }
    // A pattern / mirror of details only is a detail too.
    if (PATTERNS.has(f.type) && !f.suppressed && (f.seeds ?? []).length && f.seeds.every((s) => gone.has(typeof s === 'object' ? s.id : s))) { out.push({ id: f.id, name: f.name, type: f.type, reason: 'pattern', size: null }); gone.add(f.id); }
  }
  return out;
}

/**
 * Makes (or refreshes) the simplified configuration of `part` with `ids` suppressed, starting from the active
 * configuration's settings; it becomes the active one. Returns the configuration.
 */
export function defeature(part, ids, { name = 'Simplified' } = {}) {
  const from = activeConfiguration(part);
  let c = (part.configurations ?? []).find((x) => x.defeatured);
  if (!c) { c = addConfiguration(part, name); c.defeatured = true; }
  c.name = name;
  c.variables = { ...(from && from !== c ? from.variables : c.variables) };
  c.values = { ...(from && from !== c ? from.values : c.values) };
  c.suppress = { ...(from && from !== c ? from.suppress : {}) };
  for (const id of ids) c.suppress[id] = true;
  part.config = c.id;
  return c;
}

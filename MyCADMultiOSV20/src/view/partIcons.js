// Icons of the machine parts, drawn from each part's own geometry (default
// sizes, centre lines and thread lines left out) and fitted into the 24 × 24
// icon box. Importing this module registers them as "part-<kind>".
import { arcPoints } from '../domain/geometry.js';
import { defaultParams, generatePart, PART_KINDS, PARTS } from '../domain/parts.js';
import { registerIcon } from '../icons.js';

const n = (value) => Math.round(value * 10) / 10;

export function partIconInner(kind) {
  const prims = generatePart(kind, defaultParams(kind)).filter((prim) => !prim.lineType && !prim.thin);
  const points = prims.flatMap((prim) => (prim.kind === 'line' ? [prim.a, prim.b] : prim.kind === 'poly' ? prim.points
    : prim.kind === 'circle' ? [{ x: prim.c.x - prim.r, y: prim.c.y - prim.r }, { x: prim.c.x + prim.r, y: prim.c.y + prim.r }]
      : arcPoints(prim.c.x, prim.c.y, prim.r, prim.start, prim.end, 10)));
  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));
  const k = 20 / Math.max(maxX - minX, maxY - minY, 1e-6);
  const ox = 12 - ((minX + maxX) / 2) * k;
  const oy = 12 + ((minY + maxY) / 2) * k;
  const map = (p) => `${n(ox + p.x * k)} ${n(oy - p.y * k)}`;
  return prims.map((prim) => {
    if (prim.kind === 'line') return `<path d="M${map(prim.a)}L${map(prim.b)}"/>`;
    if (prim.kind === 'poly') {
      // Long outlines (gear teeth) are thinned out; the icon is tiny.
      const step = Math.max(1, Math.floor(prim.points.length / 160));
      const pts = prim.points.filter((_, i) => i % step === 0);
      return `<path d="M${pts.map(map).join('L')}${prim.closed ? 'Z' : ''}"/>`;
    }
    if (prim.kind === 'circle') return `<circle cx="${n(ox + prim.c.x * k)}" cy="${n(oy - prim.c.y * k)}" r="${n(Math.max(0.4, prim.r * k))}"/>`;
    return `<path d="M${arcPoints(prim.c.x, prim.c.y, prim.r, prim.start, prim.end, 12).map(map).join('L')}"/>`;
  }).join('');
}

for (const kind of PART_KINDS) {
  registerIcon(`part-${kind}`, partIconInner(kind));
  PARTS[kind].icon = `part-${kind}`;
}

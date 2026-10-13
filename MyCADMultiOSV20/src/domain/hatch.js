// Hatching: a solid fill or line patterns clipped to closed boundaries
// (outer loops and holes by the even-odd rule), like AutoCAD/DXF HATCH.
// Pattern lines: [angle°, spacing, offsetAlongLine (stagger), dash] in mm at scale 1.

export const HATCH_PATTERNS = {
  solid: [],
  ansi31: [[45, 3.175]],
  ansi32: [[45, 9.525], [45, 9.525, 0, 0, 3.175]],
  ansi37: [[45, 3.175], [135, 3.175]],
  net: [[0, 3.175], [90, 3.175]],
  line: [[0, 3.175]],
  dash: [[0, 3.175, 0, 3.175]],
  dots: [[0, 1.5875, 0, 0.3]],
};
export const HATCH_PATTERN_NAMES = Object.keys(HATCH_PATTERNS);

/** Where the line p + t·d crosses the loops: sorted t values (even-odd pairs are inside). */
function crossings(loops, p, d) {
  const out = [];
  for (const loop of loops) {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i];
      const b = loop[(i + 1) % loop.length];
      const e = { x: b.x - a.x, y: b.y - a.y };
      const den = d.x * e.y - d.y * e.x;
      if (Math.abs(den) < 1e-12) continue;
      const w = { x: a.x - p.x, y: a.y - p.y };
      const t = (w.x * e.y - w.y * e.x) / den;
      const s = (w.x * d.y - w.y * d.x) / den;
      // Half-open on the edge so a line through a vertex is counted once.
      if (s >= 0 && s < 1) out.push(t);
    }
  }
  return out.sort((m, n) => m - n);
}

/**
 * Primitives of a hatch: { kind: 'fill', points, holes } for solid, else thin
 * 'line' primitives. angle and scale turn and stretch the pattern.
 */
export function hatchPrimitives(loops, pattern = 'ansi31', angle = 0, scale = 1) {
  const valid = loops.filter((loop) => loop.length >= 3);
  if (!valid.length) return [];
  if (pattern === 'solid') {
    const [outer, ...holes] = valid.slice().sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));
    return [{ kind: 'fill', points: outer, holes }];
  }
  const all = valid.flat();
  const minX = Math.min(...all.map((p) => p.x)); const maxX = Math.max(...all.map((p) => p.x));
  const minY = Math.min(...all.map((p) => p.y)); const maxY = Math.max(...all.map((p) => p.y));
  const centre = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  const radius = Math.hypot(maxX - minX, maxY - minY) / 2 + 1e-6;
  const prims = [];
  for (const [lineAngle, spacing, offset = 0, dash = 0, shift = 0] of HATCH_PATTERNS[pattern] ?? HATCH_PATTERNS.ansi31) {
    const a = ((lineAngle + angle) * Math.PI) / 180;
    const d = { x: Math.cos(a), y: Math.sin(a) };
    const n = { x: -d.y, y: d.x };
    const gap = Math.max(spacing * scale, 1e-3);
    const count = Math.ceil(radius / gap);
    if (count > 4000) continue;
    for (let k = -count; k <= count; k++) {
      const along = k * gap + shift * scale;
      const p = { x: centre.x + n.x * along + d.x * (k * offset * scale), y: centre.y + n.y * along + d.y * (k * offset * scale) };
      const ts = crossings(valid, p, d);
      for (let i = 0; i + 1 < ts.length; i += 2) {
        const [t0, t1] = [ts[i], ts[i + 1]];
        if (t1 - t0 < 1e-9) continue;
        if (dash > 0) {
          // Short dashes (dots) every 2·dash along the line.
          const unit = dash * scale;
          for (let t = Math.ceil(t0 / (unit * 2)) * unit * 2; t < t1; t += unit * 2) {
            const e = Math.min(t1, t + unit);
            prims.push({ kind: 'line', a: { x: p.x + d.x * t, y: p.y + d.y * t }, b: { x: p.x + d.x * e, y: p.y + d.y * e }, thin: true });
          }
        } else prims.push({ kind: 'line', a: { x: p.x + d.x * t0, y: p.y + d.y * t0 }, b: { x: p.x + d.x * t1, y: p.y + d.y * t1 }, thin: true });
      }
    }
  }
  return prims;
}

function area(loop) {
  let s = 0;
  for (let i = 0; i < loop.length; i++) { const p = loop[i]; const q = loop[(i + 1) % loop.length]; s += p.x * q.y - q.x * p.y; }
  return s / 2;
}

/** Area hatched (outer minus holes), for the properties panel. */
export function hatchArea(loops) {
  const valid = loops.filter((loop) => loop.length >= 3);
  if (!valid.length) return 0;
  const sorted = valid.map((loop) => Math.abs(area(loop))).sort((a, b) => b - a);
  return sorted[0] - sorted.slice(1).reduce((sum, v) => sum + v, 0);
}

// Roof geometry shared by the plan (outline, ridge and hip lines) and the 3D
// model (faces). A roof covers a polygon on its level; flat roofs follow the
// polygon, pitched roofs (gable, hip, shed) use its oriented bounding
// rectangle. The roof surface passes through the top of the walls (`base`)
// at the wall line, so the eaves of the overhang hang a little lower.
//
// Output points are [x, y, z] with x, y in plan millimetres and z up.

import { orientedRect, offsetPolygon, rotPt, polygonArea } from "./geom.js";
import { levelById } from "./project.js";

export function roofBase(p, roof) {
  const lv = levelById(p, roof.level);
  return (lv ? lv.elevation + lv.height : 2800) + (roof.offset || 0);
}

export function roofModel(roof, base = 0) {
  const o = roof.overhang || 0;
  const tan = Math.tan(((roof.pitch || 0) * Math.PI) / 180);
  if (roof.kind === "flat" || !(tan > 0)) {
    let outline = offsetPolygon(roof.pts, -o);
    if (polygonArea(outline) * polygonArea(roof.pts) < 0) outline = roof.pts.slice();
    // A flat roof slab sits on top of the walls (its faces are the top).
    const top = base + (roof.thickness || 200);
    return { outline, lines: [], faces: [{ pts: outline.map(([x, y]) => [x, y, top]) }], gables: [], peak: top, flat: true };
  }
  const r = orientedRect(roof.pts);
  if (roof.rot) { r.angle += roof.rot; if (Math.round(roof.rot / 90) % 2) [r.len, r.wid] = [r.wid, r.len]; }
  const L = r.len / 2 + o; // half length incl. overhang
  const W = r.wid / 2 + o; // half width incl. overhang
  const wl = r.wid / 2; // half width at the wall line
  const P = (u, v, z) => { const [x, y] = rotPt(u, v, r.angle); return [r.cx + x, r.cy + y, z]; };
  const eave = base - o * tan;
  const lines = [];
  const faces = [];
  const gables = [];
  const outline = [P(-L, -W, 0), P(L, -W, 0), P(L, W, 0), P(-L, W, 0)].map(([x, y]) => [x, y]);
  let peak = base;
  if (roof.kind === "shed") {
    const high = base + (2 * wl) * tan;
    faces.push({ pts: [P(-L, -W, eave), P(L, -W, eave), P(L, W, high + o * tan), P(-L, W, high + o * tan)] });
    peak = high + o * tan;
    // Triangular end walls under the single slope.
    for (const s of [-1, 1]) {
      const u = s * (L - o);
      gables.push({ pts: [P(u, -wl, base), P(u, wl, base), P(u, wl, high)] });
    }
    lines.push([P(-L, W, 0), P(L, W, 0)]);
  } else if (roof.kind === "hip") {
    const ridgeZ = base + wl * tan;
    peak = ridgeZ;
    const rh = Math.max(0, L - W); // half ridge length
    const R1 = P(-rh, 0, ridgeZ), R2 = P(rh, 0, ridgeZ);
    const c1 = P(-L, -W, eave), c2 = P(L, -W, eave), c3 = P(L, W, eave), c4 = P(-L, W, eave);
    faces.push({ pts: [c1, c2, R2, R1] }, { pts: [c3, c4, R1, R2] }, { pts: [c2, c3, R2] }, { pts: [c4, c1, R1] });
    lines.push([R1, R2], [c1, R1], [c4, R1], [c2, R2], [c3, R2]);
  } else {
    // gable: ridge along the long side, triangular wall ends at the wall line.
    const ridgeZ = base + wl * tan;
    peak = ridgeZ;
    const R1 = P(-L, 0, ridgeZ), R2 = P(L, 0, ridgeZ);
    faces.push({ pts: [P(-L, -W, eave), P(L, -W, eave), R2, R1] }, { pts: [P(L, W, eave), P(-L, W, eave), R1, R2] });
    lines.push([R1, R2]);
    for (const s of [-1, 1]) {
      const u = s * (L - o);
      gables.push({ pts: [P(u, -wl, base), P(u, wl, base), P(u, 0, ridgeZ)] });
    }
  }
  return { outline, lines: lines.map(([a, b]) => [a[0], a[1], b[0], b[1]]), faces, gables, peak, rect: r };
}

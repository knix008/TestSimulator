// DXF export of the BIM elements (exportDxf in dxf.js calls it with its
// writer): each kind on its own AIA-style layer.

import { wallPoint } from "../core/walls.js";
import { memberFootprints } from "../core/members.js";
import { wallLength } from "../core/project.js";
import { labelPoint } from "../core/geom.js";
import { beamOutline, rampModel, stairLayout, stairRise, stairRails, curtainGrid, isCurtainWall, shaftsAt, ceilingHeight } from "../core/elements/geometry.js";

export const ELEMENT_DXF_LAYERS = [
  { name: "A-FLOR-SLAB", color: 8, linetype: "CONTINUOUS", description: "Floor slab and foundation edges, slab openings" },
  { name: "A-CLNG", color: 9, linetype: "DASHED", description: "Ceilings (outline above, with the height)" },
  { name: "S-BEAM", color: 5, linetype: "HIDDEN", description: "Beams and braces above (outline and axis)" },
  { name: "S-MEMB", color: 4, linetype: "CONTINUOUS", description: "Structural members: towers, bridges, frames (plan footprint and axis)" },
  { name: "A-FLOR-HRAL", color: 6, linetype: "CONTINUOUS", description: "Railings and handrails" },
  { name: "A-FLOR-RAMP", color: 6, linetype: "CONTINUOUS", description: "Ramps: outline, centre line and slope" },
  { name: "A-SHFT", color: 7, linetype: "CONTINUOUS", description: "Shafts: outline and diagonals" },
  { name: "A-GLAZ-CWMG", color: 4, linetype: "CONTINUOUS", description: "Curtain walls: faces, glass line and mullions" },
];

export function exportElementsDxf(W, p, L) {
  const on = (list) => (list || []).filter((it) => it.level === L);
  for (const s of on(p.slabs)) {
    W.poly("A-FLOR-SLAB", s.pts);
    for (const h of s.holes || []) { W.poly("A-FLOR-SLAB", h); if (h.length === 4) { W.line("A-FLOR-SLAB", h[0], h[2]); W.line("A-FLOR-SLAB", h[1], h[3]); } }
  }
  for (const c of on(p.ceilings)) {
    W.poly("A-CLNG", c.pts);
    const [x, y] = labelPoint(c.pts);
    W.text("A-CLNG", `CLG +${(ceilingHeight(p, c) / 1000).toFixed(2)}`, x, y + 400, 150, { align: "center", valign: "middle" });
  }
  for (const b of on(p.beams)) { W.poly("S-BEAM", beamOutline(b)); W.line("S-BEAM", [b.x1, b.y1], [b.x2, b.y2]); }
  // Structural members: the plan footprint of every segment and the axis.
  for (const m of on(p.members)) {
    for (const f of memberFootprints(m)) W.poly("S-MEMB", f);
    W.poly("S-MEMB", m.pts.map((q) => [q[0], q[1]]), false);
  }
  for (const r of on(p.railings)) W.poly("A-FLOR-HRAL", r.pts, false);
  for (const s of on(p.stairs)) for (const rail of stairRails(p, s)) W.poly("A-FLOR-HRAL", rail.map((q) => [q[0], q[1]]), false);
  for (const r of on(p.ramps)) {
    const m = rampModel(p, r);
    W.poly("A-FLOR-RAMP", m.outline);
    W.poly("A-FLOR-RAMP", r.pts, false);
    W.text("A-FLOR-RAMP", `${(m.slope * 100).toFixed(1)}%`, r.pts[0][0], r.pts[0][1], 160, { align: "center", valign: "middle" });
  }
  for (const s of shaftsAt(p, L)) {
    W.poly("A-SHFT", s.pts);
    if (s.pts.length === 4) { W.line("A-SHFT", s.pts[0], s.pts[2]); W.line("A-SHFT", s.pts[1], s.pts[3]); }
  }
  // Stairs by type (straight stairs: exportStair in dxf.js).
  for (const s of on(p.stairs).filter((x) => x.shape)) {
    const lay = stairLayout(s, stairRise(p, s));
    W.poly("A-FLOR-STRS", lay.outline);
    for (const tr of lay.treads) W.poly("A-FLOR-STRS", tr.pts);
    for (const ld of lay.landings) W.poly("A-FLOR-STRS", ld.pts);
    W.poly("A-FLOR-STRS", lay.walk, false);
  }
  for (const w of on(p.walls)) {
    if (!isCurtainWall(p, w)) continue;
    const t = w.thickness / 2, Lw = wallLength(w);
    W.line("A-GLAZ-CWMG", wallPoint(w, 0, -t), wallPoint(w, Lw, -t));
    W.line("A-GLAZ-CWMG", wallPoint(w, 0, t), wallPoint(w, Lw, t));
    W.line("A-GLAZ", wallPoint(w, 0, 0), wallPoint(w, Lw, 0));
    const { us, c } = curtainGrid(p, w, 3000);
    const m = c.mullion;
    for (const u of us) { const uu = Math.min(Lw - m / 2, Math.max(m / 2, u)); W.poly("A-GLAZ-CWMG", [wallPoint(w, uu - m / 2, -t), wallPoint(w, uu + m / 2, -t), wallPoint(w, uu + m / 2, t), wallPoint(w, uu - m / 2, t)]); }
  }
}

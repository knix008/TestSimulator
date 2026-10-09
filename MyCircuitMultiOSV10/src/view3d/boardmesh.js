// Board body geometry: outline + drills -> extruded slab, plus plated barrels.
//
// 3D world convention (used everywhere in src/view3d):
//   X = board x (mm)
//   Z = board y (mm)   — PCB y grows down on screen, so +Z is "towards the
//                        viewer" when looking at the top face with -Z up
//   Y = up; the board occupies 0 <= Y <= thickness (top copper at Y = thickness,
//       bottom copper at Y = 0)
// Seen from +Y with screen-up = -Z this is exactly the 2D editor's view, and
// it is a proper (non-mirrored) mapping.

import { footprintPads } from "../pcb/board.js";
import { pointInPolygon, polygonArea } from "../core/geom.js";
import { boardUV } from "./texture.js";

// Pure description of the board slab: outline and every drilled hole.
// holes: [{x, y, r, plated, kind: "pad"|"via", ref?}]
export function boardShapeData(project) {
  const pcb = project.pcb || project;
  const outline = (pcb.outline || []).map(([x, y]) => [Number(x), Number(y)]);
  const holes = [];
  const seen = new Set();
  const push = (h) => {
    if (!(h.r > 0) || !Number.isFinite(h.x) || !Number.isFinite(h.y)) return;
    if (outline.length >= 3 && !pointInPolygon(h.x, h.y, outline)) return; // a hole off the board would break triangulation
    const key = `${h.x.toFixed(3)},${h.y.toFixed(3)}`;
    if (seen.has(key)) return; // stacked drills
    seen.add(key);
    holes.push(h);
  };
  for (const fp of pcb.footprints || []) {
    for (const p of footprintPads(fp, pcb)) {
      if (p.drill > 0) push({ x: p.x, y: p.y, r: p.drill / 2, plated: !p.npth, kind: "pad", ref: fp.ref });
    }
  }
  for (const v of pcb.vias || []) push({ x: Number(v.x), y: Number(v.y), r: (v.drill || 0.4) / 2, plated: true, kind: "via" });
  return { outline, holes };
}

// Segments used for a drill of radius r (small vias don't need 32 sides).
export function holeSegments(r) {
  return Math.max(10, Math.min(32, Math.round(r * 24)));
}

// ExtrudeGeometry slab with material groups 0 = top face, 1 = bottom face,
// 2 = edges and hole walls, and UVs on both faces in board coordinates.
export function buildBoardGeometry(THREE, data, thickness, layout) {
  let outline = data.outline.slice();
  // three.js only normalises hole winding when it flips the outline, so hand
  // it a clockwise outline (in shape space, y = -board y) and CCW holes.
  const shapePts = outline.map(([x, y]) => [x, -y]);
  if (polygonArea(shapePts) > 0) shapePts.reverse();
  const shape = new THREE.Shape(shapePts.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of data.holes) {
    const n = holeSegments(h.r);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push(new THREE.Vector2(h.x + h.r * Math.cos(a), -h.y + h.r * Math.sin(a)));
    }
    shape.holes.push(new THREE.Path(pts));
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 1 });
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  // Split the lid group (bottom faces then top faces) by z.
  const lid = g.groups.find((gr) => gr.materialIndex === 0);
  const side = g.groups.find((gr) => gr.materialIndex === 1);
  const groups = [];
  if (lid) {
    let runStart = lid.start;
    let runMat = -1;
    for (let i = lid.start; i < lid.start + lid.count; i += 3) {
      const z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
      const mat = z > thickness / 2 ? 0 : 1;
      if (mat !== runMat) {
        if (runMat >= 0) groups.push([runStart, i - runStart, runMat]);
        runStart = i;
        runMat = mat;
      }
    }
    if (runMat >= 0) groups.push([runStart, lid.start + lid.count - runStart, runMat]);
    for (let i = lid.start; i < lid.start + lid.count; i++) {
      const [u, v] = layout ? boardUV(layout, pos.getX(i), -pos.getY(i)) : [0, 0];
      uv.setXY(i, u, v);
    }
  }
  if (side) {
    for (let i = side.start; i < side.start + side.count; i++) uv.setXY(i, 0, 0);
    groups.push([side.start, side.count, 2]);
  }
  g.clearGroups();
  for (const [s, c, m] of groups) g.addGroup(s, c, m);
  // (sx, sy, z) -> (sx, z, -sy): z (depth) becomes height, -sy = board y becomes Z.
  g.rotateX(-Math.PI / 2);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

// One merged open-cylinder mesh for every plated hole wall.
export function buildBarrelGeometry(THREE, holes, thickness) {
  const plated = holes.filter((h) => h.plated);
  if (!plated.length) return null;
  const P = [];
  const N = [];
  for (const h of plated) {
    const n = holeSegments(h.r);
    const r = h.r * 0.995;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      const x0 = h.x + r * Math.cos(a0), z0 = h.y + r * Math.sin(a0);
      const x1 = h.x + r * Math.cos(a1), z1 = h.y + r * Math.sin(a1);
      const lo = -0.01, hi = thickness + 0.01;
      // Normals face the hole axis: the wall is seen from inside the hole.
      const n0 = [-Math.cos(a0), 0, -Math.sin(a0)];
      const n1 = [-Math.cos(a1), 0, -Math.sin(a1)];
      P.push(x0, lo, z0, x1, hi, z1, x1, lo, z1, x0, lo, z0, x0, hi, z0, x1, hi, z1);
      N.push(...n0, ...n1, ...n1, ...n0, ...n0, ...n1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
  g.computeBoundingSphere();
  return g;
}

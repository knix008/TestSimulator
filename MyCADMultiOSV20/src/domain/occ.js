// The OpenCASCADE kernel (the B-rep kernel FreeCAD is built on), as WebAssembly
// (replicad-opencascadejs): exact solids for the primitives and features,
// booleans and dress-ups on curved faces, exact volumes, STEP and BREP files
// with their real surfaces. Loaded once (loadOcc); until then — or for kinds
// it does not model — the mesh kernel answers. No DOM.
import { holeProfile } from './features.js';
import { localMesh, placement, THICKNESS_OPEN } from './solids.js';
import { DRESSUP_EDGES } from './dressup.js';
import { polygonArea } from './geometry.js';
import { MIRROR_PLANES, patternCopies } from './partops.js';

let oc = null;
let loading = null;

/** Loads the kernel (options go to the Emscripten module, e.g. locateFile for the .wasm). */
export function loadOcc(options = {}) {
  loading ??= import('replicad-opencascadejs').then(({ default: init }) => init(options)).then((module) => { oc = module; return module; });
  return loading;
}

export const occReady = () => Boolean(oc);
export const occModule = () => oc;

/** Objects made during one operation, deleted together at the end (the wasm heap is not garbage collected). */
function scope() {
  const made = [];
  const keep = (object) => { if (object && typeof object.delete === 'function') made.push(object); return object; };
  keep.free = () => { for (const object of made.reverse()) { try { object.delete(); } catch { /* already gone */ } } made.length = 0; };
  return keep;
}

const rad = (d) => (d * Math.PI) / 180;

// ───────────────────────── building shapes

function pnt(k, [x, y, z]) { return k(new oc.gp_Pnt(x, y, z)); }

/** A closed polygon wire through 3D points. */
function polygonWire(k, points) {
  const wire = k(new oc.BRepBuilderAPI_MakeWire());
  for (let i = 0; i < points.length; i++) {
    const a = points[i]; const b = points[(i + 1) % points.length];
    if (Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) < 1e-9) continue;
    wire.Add(k(new oc.BRepBuilderAPI_MakeEdge(pnt(k, a), pnt(k, b))).Edge());
  }
  return wire.Wire();
}

/** A planar face from an outer loop and holes (2D points at height z). */
function planarFace(k, outer, holes = [], z = 0) {
  const ccw = polygonArea(outer) > 0 ? outer : [...outer].reverse();
  const face = k(new oc.BRepBuilderAPI_MakeFace(polygonWire(k, ccw.map((p) => [p.x, p.y, z])), true));
  for (const hole of holes) {
    const cw = polygonArea(hole) < 0 ? hole : [...hole].reverse();
    face.Add(polygonWire(k, cw.map((p) => [p.x, p.y, z])));
  }
  return face.Face();
}

const prism = (k, face, height) => k(new oc.BRepPrimAPI_MakePrism(face, k(new oc.gp_Vec(0, 0, height)), false, true)).Shape();

/** A face in the x–z plane from [r, z] points, turned about the z axis by `angle` degrees. */
function revolveProfile(k, profile, angle = 360) {
  const pts = profile.map(([r, z]) => ({ x: r, y: z }));
  const ccw = polygonArea(pts) > 0 ? pts : [...pts].reverse();
  const face = k(new oc.BRepBuilderAPI_MakeFace(polygonWire(k, ccw.map((p) => [p.x, 0, p.y])), true)).Face();
  const axis = k(new oc.gp_Ax1(pnt(k, [0, 0, 0]), k(new oc.gp_Dir(0, 0, 1))));
  return angle >= 359.999 ? k(new oc.BRepPrimAPI_MakeRevol(face, axis, false)).Shape() : k(new oc.BRepPrimAPI_MakeRevol(face, axis, rad(angle), false)).Shape();
}

/** A closed polyhedron (a mesh) as a sewn solid — so meshes can take part in exact booleans. */
function polyhedral(k, tris) {
  const sewing = k(new oc.BRepBuilderAPI_Sewing(1e-6, true, true, true, false));
  for (const [a, b, c] of tris) {
    if (Math.hypot(...[0, 1, 2].map((i) => (b[(i + 1) % 3] - a[(i + 1) % 3]) * (c[(i + 2) % 3] - a[(i + 2) % 3]) - (b[(i + 2) % 3] - a[(i + 2) % 3]) * (c[(i + 1) % 3] - a[(i + 1) % 3]))) < 1e-12) continue;
    sewing.Add(k(new oc.BRepBuilderAPI_MakeFace(polygonWire(k, [a, b, c]), true)).Face());
  }
  sewing.Perform(k(new oc.Message_ProgressRange()));
  const sewn = sewing.SewedShape();
  try {
    const shell = oc.TopoDS.Shell(sewn);
    return k(new oc.BRepBuilderAPI_MakeSolid(shell)).Solid();
  } catch {
    return sewn;
  }
}

/** A rigid move (+ uniform scale, + mirror in y) of the solid's placement, as an OCC transform. */
function placeShape(k, shape, entity) {
  const s = entity.scale ?? 1;
  const flip = entity.flip ? -1 : 1;
  const map = placement({ ...entity, scale: 1, flip: false });
  const o = map([0, 0, 0]);
  const ex = map([1, 0, 0]).map((v, i) => v - o[i]); const ey = map([0, 1, 0]).map((v, i) => v - o[i]); const ez = map([0, 0, 1]).map((v, i) => v - o[i]);
  let out = shape;
  if (entity.flip) {
    const mirror = k(new oc.gp_Trsf());
    mirror.SetValues(1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0);
    out = k(new oc.BRepBuilderAPI_Transform(out, mirror, true, false)).Shape();
  }
  if (s !== 1) {
    const scale = k(new oc.gp_Trsf());
    scale.SetScale(pnt(k, [0, 0, 0]), s);
    out = k(new oc.BRepBuilderAPI_Transform(out, scale, true, false)).Shape();
  }
  const t = k(new oc.gp_Trsf());
  t.SetValues(ex[0], ey[0], ez[0], o[0], ex[1], ey[1], ez[1], o[1], ex[2], ey[2], ez[2], o[2]);
  void flip;
  return k(new oc.BRepBuilderAPI_Transform(out, t, true, false)).Shape();
}

const BOOL = { union: 'BRepAlgoAPI_Fuse', cut: 'BRepAlgoAPI_Cut', common: 'BRepAlgoAPI_Common' };

/** Edges of a shape, each once (the explorer meets an edge once for every face it bounds). */
function edgesOf(k, shape) {
  const out = [];
  const ex = k(new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
  for (; ex.More(); ex.Next()) { const edge = oc.TopoDS.Edge(ex.Current()); if (!out.some((e) => e.IsSame(edge))) out.push(edge); }
  return out;
}

/** The two end points of an edge (its vertices). */
function edgeEnds(k, edge) {
  const ends = [];
  const ex = k(new oc.TopExp_Explorer(edge, oc.TopAbs_ShapeEnum.TopAbs_VERTEX, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
  for (; ex.More(); ex.Next()) { const p = oc.BRep_Tool.Pnt(oc.TopoDS.Vertex(ex.Current())); ends.push([p.X(), p.Y(), p.Z()]); p.delete?.(); }
  return ends;
}

function boundsZ(k, shape) {
  const box = k(new oc.Bnd_Box());
  oc.BRepBndLib.Add(shape, box, false);
  const lo = box.CornerMin(); const hi = box.CornerMax();
  const out = [lo.Z(), hi.Z()];
  lo.delete?.(); hi.delete?.();
  return out;
}

/** Seam edges (where a closed face meets itself, e.g. down a cylinder's side) and degenerate ones (a sphere's poles): nothing to round. */
function seamEdges(k, shape) {
  const out = [];
  const faces = k(new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
  for (; faces.More(); faces.Next()) {
    const face = oc.TopoDS.Face(faces.Current());
    const edges = k(new oc.TopExp_Explorer(face, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
    for (; edges.More(); edges.Next()) { const edge = oc.TopoDS.Edge(edges.Current()); if (oc.BRep_Tool.IsClosed(edge, face) || oc.BRep_Tool.Degenerated(edge)) out.push(edge); }
  }
  return out;
}

/** An edge's signature: its midpoint and its (unsigned) direction there, and its points along it. */
function edgeInfo(k, edge, samples = 24) {
  const curve = k(new oc.BRepAdaptor_Curve(edge));
  const t0 = curve.FirstParameter(); const t1 = curve.LastParameter();
  const at = (t) => { const p = curve.Value(t); const out = [p.X(), p.Y(), p.Z()]; p.delete?.(); return out; };
  const points = Array.from({ length: samples + 1 }, (_, i) => at(t0 + ((t1 - t0) * i) / samples));
  const mid = at((t0 + t1) / 2);
  const ahead = at((t0 + t1) / 2 + (t1 - t0) * 1e-3);
  const d = ahead.map((v, i) => v - mid[i]);
  const l = Math.hypot(...d) || 1;
  return { mid, dir: d.map((v) => v / l), points };
}

/** The edges that best match picked signatures (topological naming by geometry: a fillet keeps its edge when the solid changes). */
function matchPicks(k, shape, picks) {
  const edges = edgesOf(k, shape);
  const seams = seamEdges(k, shape);
  const candidates = edges.filter((e) => !seams.some((seam) => seam.IsSame(e))).map((edge) => ({ edge, ...edgeInfo(k, edge, 2) }));
  const box = k(new oc.Bnd_Box());
  oc.BRepBndLib.Add(shape, box, false);
  const lo = box.CornerMin(); const hi = box.CornerMax();
  const size = Math.hypot(hi.X() - lo.X(), hi.Y() - lo.Y(), hi.Z() - lo.Z()) || 1;
  lo.delete?.(); hi.delete?.();
  const out = [];
  for (const pick of picks) {
    let best = null; let score = Infinity;
    for (const c of candidates) {
      const s = Math.hypot(...c.mid.map((v, i) => v - pick.mid[i])) / size + (1 - Math.abs(c.dir[0] * pick.dir[0] + c.dir[1] * pick.dir[1] + c.dir[2] * pick.dir[2]));
      if (s < score) { score = s; best = c.edge; }
    }
    if (best && score < 0.35 && !out.some((e) => e.IsSame(best))) out.push(best);
  }
  return out;
}

/** Edges of a dress-up's group: all, round the top or bottom face, the vertical ones, or top + vertical. */
function pickEdges(k, shape, group, picks = []) {
  if (group === 'picked') return matchPicks(k, shape, picks);
  const [z0, z1] = boundsZ(k, shape);
  const tol = Math.max(1e-6, (z1 - z0) * 1e-6);
  const seams = seamEdges(k, shape);
  const usable = (edge) => !seams.some((seam) => seam.IsSame(edge));
  return edgesOf(k, shape).filter(usable).filter((edge) => {
    if (group === 'all') return true;
    const ends = edgeEnds(k, edge);
    if (ends.length < 2) return false; // a circle closed on one vertex
    const [a, b] = ends;
    const top = Math.abs(a[2] - z1) < tol && Math.abs(b[2] - z1) < tol;
    const bottom = Math.abs(a[2] - z0) < tol && Math.abs(b[2] - z0) < tol;
    const vertical = Math.hypot(a[0] - b[0], a[1] - b[1]) < tol && Math.abs(a[2] - b[2]) > tol;
    if (group === 'top') return top;
    if (group === 'bottom') return bottom;
    if (group === 'vertical') return vertical;
    if (group === 'topVertical') return top || vertical;
    return false;
  }).concat(group === 'all' ? [] : circularEdges(k, shape, group, z0, z1, tol));
}

/** Circles on the top / bottom (closed edges with a single vertex, e.g. a cylinder's rims). */
function circularEdges(k, shape, group, z0, z1, tol) {
  if (group === 'vertical') return [];
  return edgesOf(k, shape).filter((edge) => {
    const ends = edgeEnds(k, edge);
    if (ends.length !== 1) return false;
    const z = ends[0][2];
    return ((group === 'top' || group === 'topVertical') && Math.abs(z - z1) < tol) || (group === 'bottom' && Math.abs(z - z0) < tol);
  });
}

/** The planar face(s) at the top (or bottom) of a shape. */
function capFaces(k, shape, which) {
  const [z0, z1] = boundsZ(k, shape);
  const out = [];
  const ex = k(new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
  for (; ex.More(); ex.Next()) {
    const face = oc.TopoDS.Face(ex.Current());
    const [f0, f1] = boundsZ(k, face);
    const at = which === 'top' ? z1 : z0;
    if (Math.abs(f1 - f0) < 1e-6 && Math.abs(f0 - at) < 1e-6) out.push(face);
  }
  return out;
}

/** The solid as an OCC shape in its own coordinates (before its placement), or null when the kernel cannot model it. */
function localShape(k, entity) {
  const p = entity.params ?? {};
  switch (entity.kind) {
    case 'box': return k(new oc.BRepPrimAPI_MakeBox(p.length, p.width, p.height)).Shape();
    case 'cylinder': return p.angle >= 359.999 ? k(new oc.BRepPrimAPI_MakeCylinder(p.radius, p.height)).Shape() : k(new oc.BRepPrimAPI_MakeCylinder(p.radius, p.height, rad(p.angle))).Shape();
    case 'sphere': return k(new oc.BRepPrimAPI_MakeSphere(p.radius)).Shape();
    case 'cone': return revolveProfile(k, [[0, 0], [p.radius1, 0], [p.radius2, p.height], [0, p.height]].filter((q, i, all) => i === 0 || Math.hypot(q[0] - all[i - 1][0], q[1] - all[i - 1][1]) > 1e-9));
    case 'torus': return k(new oc.BRepPrimAPI_MakeTorus(p.radius1, p.radius2)).Shape();
    case 'tube': return revolveProfile(k, [[p.inner, 0], [p.outer, 0], [p.outer, p.height], [p.inner, p.height]]);
    case 'wedge': {
      const profile = [[0, 0], [p.length, 0], [p.topLength, p.height], [0, p.height]].filter((q, i) => !(i === 2 && p.topLength <= 1e-9));
      const face = k(new oc.BRepBuilderAPI_MakeFace(polygonWire(k, profile.map(([x, z]) => [x, 0, z])), true)).Face();
      return k(new oc.BRepPrimAPI_MakePrism(face, k(new oc.gp_Vec(0, p.width, 0)), false, true)).Shape();
    }
    case 'prism': return prism(k, planarFace(k, Array.from({ length: p.sides }, (_, i) => ({ x: p.radius * Math.cos((2 * Math.PI * i) / p.sides), y: p.radius * Math.sin((2 * Math.PI * i) / p.sides) }))), p.height);
    case 'pad': {
      if (p.taper) return null;
      const shapes = entity.shape?.shapes ?? [];
      if (!shapes.length) return null;
      const solids = shapes.map((s) => prism(k, planarFace(k, s.outer, s.holes ?? []), p.height));
      return solids.slice(1).reduce((a, b) => k(new oc.BRepAlgoAPI_Fuse(a, b, k(new oc.Message_ProgressRange()))).Shape(), solids[0]);
    }
    case 'hole': return revolveProfile(k, holeProfile(p));
    case 'revolution': return (entity.shape?.profile?.length ?? 0) >= 3 ? revolveProfile(k, entity.shape.profile, p.angle) : null;
    case 'boolean': {
      const parts = (entity.shape?.parts ?? []).map((part) => worldShape(k, part)).filter(Boolean);
      if (!parts.length) return null;
      const op = BOOL[entity.shape.op] ?? BOOL.union;
      return parts.slice(1).reduce((a, b) => {
        const run = k(new oc[op](a, b, k(new oc.Message_ProgressRange())));
        if (!run.IsDone()) throw new Error('boolean failed');
        return run.Shape();
      }, parts[0]);
    }
    case 'fillet': case 'chamfer': {
      const base = entity.shape?.base ? worldShape(k, entity.shape.base) : null;
      if (!base) return null;
      const edges = pickEdges(k, base, DRESSUP_EDGES[p.edges] ?? 'all', entity.shape?.picks ?? []);
      if (!edges.length) return base;
      const make = entity.kind === 'fillet' ? k(new oc.BRepFilletAPI_MakeFillet(base, oc.ChFi3d_FilletShape.ChFi3d_Rational)) : k(new oc.BRepFilletAPI_MakeChamfer(base));
      for (const edge of edges) make.Add(p.size ?? 1, edge);
      make.Build(k(new oc.Message_ProgressRange()));
      if (!make.IsDone()) throw new Error(`${entity.kind} failed`);
      return make.Shape();
    }
    case 'thickness': {
      const base = entity.shape?.base ? worldShape(k, entity.shape.base) : null;
      if (!base) return null;
      const open = THICKNESS_OPEN[p.open ?? 0] ?? 'openTop';
      const faces = k(new oc.NCollection_List_TopoDS_Shape());
      if (open === 'openTop' || open === 'openBoth') for (const f of capFaces(k, base, 'top')) faces.Append(f);
      if (open === 'openBottom' || open === 'openBoth') for (const f of capFaces(k, base, 'bottom')) faces.Append(f);
      const thick = k(new oc.BRepOffsetAPI_MakeThickSolid());
      thick.MakeThickSolidByJoin(base, faces, -(p.thickness ?? 1), 1e-4, oc.BRepOffset_Mode.BRepOffset_Skin, false, false, oc.GeomAbs_JoinType.GeomAbs_Arc, false, k(new oc.Message_ProgressRange()));
      if (!thick.IsDone()) throw new Error('thickness failed');
      return thick.Shape();
    }
    case 'draft': {
      // PartDesign Draft: every side face (not the top or bottom) leans by the angle, pulling up, about the bottom plane.
      const base = entity.shape?.base ? worldShape(k, entity.shape.base) : null;
      if (!base) return null;
      const [z0] = boundsZ(k, base);
      const draft = k(new oc.BRepOffsetAPI_DraftAngle(base));
      const up = k(new oc.gp_Dir(0, 0, 1));
      const neutral = k(new oc.gp_Pln(pnt(k, [0, 0, z0]), up));
      const caps = [...capFaces(k, base, 'top'), ...capFaces(k, base, 'bottom')];
      const faces = k(new oc.TopExp_Explorer(base, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
      const done = [];
      for (; faces.More(); faces.Next()) {
        const face = oc.TopoDS.Face(faces.Current());
        if (caps.some((c) => c.IsSame(face)) || done.some((d) => d.IsSame(face))) continue;
        draft.Add(face, up, rad(p.angle ?? 0), neutral, true);
        if (!draft.AddDone()) throw new Error('draft failed');
        done.push(face);
      }
      draft.Build(k(new oc.Message_ProgressRange()));
      if (!draft.IsDone()) throw new Error('draft failed');
      return draft.Shape();
    }
    case 'offset3d': {
      const base = entity.shape?.base ? worldShape(k, entity.shape.base) : null;
      if (!base) return null;
      const offset = k(new oc.BRepOffsetAPI_MakeOffsetShape());
      offset.PerformByJoin(base, p.distance ?? 1, 1e-4, oc.BRepOffset_Mode.BRepOffset_Skin, false, false, oc.GeomAbs_JoinType.GeomAbs_Arc, false, k(new oc.Message_ProgressRange()));
      if (!offset.IsDone()) throw new Error('offset failed');
      return offset.Shape();
    }
    case 'compound': case 'fragments': case 'slice': case 'compoundFilter': case 'mirror3d': case 'scale3d': case 'refine': case 'reverse': case 'pattern':
      return partopShape(k, entity);
    default: {
      // A mesh read from STEP / BREP keeps its exact shape.
      if (typeof entity.shape?.brep === 'string') return k(oc.BRepToolsWrapper.Read(entity.shape.brep));
      // Anything else (meshes, sweeps, lofts, surfaces, arch objects): its mesh as a sewn polyhedron.
      const tris = localMesh(entity);
      return tris.length && tris.length < 40000 ? polyhedral(k, tris) : null;
    }
  }
}

/** The solid's shape in drawing coordinates (null when the kernel cannot make it). */
function worldShape(k, entity) {
  try {
    const local = localShape(k, entity);
    const placed = local ? placeShape(k, local, entity) : null;
    if (!placed || !entity.components) return placed;
    // Arch_Add / Arch_Remove: fused with the additions, the subtractions cut away (no exact part → the mesh).
    const parts = (list) => list.map((p) => worldShape(k, p));
    const add = parts(entity.components.parts.add); const sub = parts(entity.components.parts.sub);
    if ([...add, ...sub].some((x) => !x)) return null;
    let shape = add.length ? fuseAll(k, [placed, ...add]) : placed;
    for (const tool of sub) {
      const run = k(new oc.BRepAlgoAPI_Cut(shape, tool, k(new oc.Message_ProgressRange())));
      if (!run.IsDone()) return null;
      shape = run.Shape();
    }
    return shape;
  } catch {
    return null;
  }
}

// ───────────────────────── edges to pick (fillet / chamfer)

/**
 * The edges of a dress-up's base that can be rounded, for picking in the 3D
 * view: points in drawing coordinates, the signature in the dress-up's own
 * coordinates, and whether it is picked now.
 */
export function occDressEdges(entity) {
  if (!oc || !entity?.shape?.base) return null;
  const k = scope();
  try {
    const base = worldShape(k, entity.shape.base);
    if (!base) return null;
    const seams = seamEdges(k, base);
    const chosen = DRESSUP_EDGES[entity.params?.edges] === 'picked' ? matchPicks(k, base, entity.shape.picks ?? []) : pickEdges(k, base, DRESSUP_EDGES[entity.params?.edges] ?? 'all');
    const map = placement(entity);
    return edgesOf(k, base).filter((e) => !seams.some((seam) => seam.IsSame(e))).map((edge, i) => {
      const info = edgeInfo(k, edge);
      return { key: i, mid: info.mid, dir: info.dir, points: info.points.map(map), picked: chosen.some((c) => c.IsSame(edge)) };
    });
  } catch {
    return null;
  } finally {
    k.free();
  }
}

// ───────────────────────── meshing and measuring

/** Triangles of a shape (outward facing), `deflection` mm from the true surface. */
function triangulate(k, shape, deflection) {
  k(new oc.BRepMesh_IncrementalMesh(shape, deflection, false, 0.3, false));
  const tris = [];
  const ex = k(new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
  for (; ex.More(); ex.Next()) {
    const face = oc.TopoDS.Face(ex.Current());
    const loc = k(new oc.TopLoc_Location());
    const tri = oc.BRep_Tool.Triangulation(face, loc, 0);
    if (!tri) continue;
    const trsf = loc.Transformation();
    const nodes = [];
    for (let i = 1; i <= tri.NbNodes(); i++) {
      const p = tri.Node(i);
      const q = p.Transformed(trsf);
      nodes.push([q.X(), q.Y(), q.Z()]);
      p.delete?.(); q.delete?.();
    }
    const reversed = face.Orientation_1 ? face.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED : face.Orientation() === oc.TopAbs_Orientation.TopAbs_REVERSED;
    for (let i = 1; i <= tri.NbTriangles(); i++) {
      const t = tri.Triangle(i);
      const a = t.Value(1) - 1; const b = t.Value(2) - 1; const c = t.Value(3) - 1;
      tris.push(reversed ? [nodes[a], nodes[c], nodes[b]] : [nodes[a], nodes[b], nodes[c]]);
      t.delete?.();
    }
    trsf.delete?.();
  }
  return tris;
}

// ───────────────────────── Part shape operations (partops.js)

function compoundOf(k, shapes) {
  const builder = k(new oc.TopoDS_Builder());
  const compound = k(new oc.TopoDS_Compound());
  builder.MakeCompound(compound);
  for (const shape of shapes) builder.Add(compound, shape);
  return compound;
}

function shapeList(k, shapes) {
  const list = k(new oc.NCollection_List_TopoDS_Shape());
  for (const shape of shapes) list.Append(shape);
  return list;
}

function solidsOf(k, shape) {
  const out = [];
  const ex = k(new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
  for (; ex.More(); ex.Next()) out.push(oc.TopoDS.Solid(ex.Current()));
  return out;
}

function volumeOf(k, shape) {
  const g = k(new oc.GProp_GProps());
  oc.BRepGProp.VolumeProperties(shape, g, false, false, false);
  return Math.abs(g.Mass());
}

/** A mirror image in a coordinate plane at an offset (x = o, y = o or z = o). */
function mirrored(k, shape, plane, offset = 0) {
  const t = k(new oc.gp_Trsf());
  if (plane === 'yz') t.SetValues(-1, 0, 0, 2 * offset, 0, 1, 0, 0, 0, 0, 1, 0);
  else if (plane === 'xz') t.SetValues(1, 0, 0, 0, 0, -1, 0, 2 * offset, 0, 0, 1, 0);
  else t.SetValues(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 2 * offset);
  return k(new oc.BRepBuilderAPI_Transform(shape, t, true, false)).Shape();
}

function fuseAll(k, shapes) {
  return shapes.slice(1).reduce((a, b) => {
    const run = k(new oc.BRepAlgoAPI_Fuse(a, b, k(new oc.Message_ProgressRange())));
    if (!run.IsDone()) throw new Error('fuse failed');
    return run.Shape();
  }, shapes[0]);
}

/** The exact shape of a Part operation, or null for one the kernel leaves to the mesh (a non-uniform scale). */
function partopShape(k, entity) {
  const p = entity.params ?? {};
  const s = entity.shape ?? {};
  const progress = () => k(new oc.Message_ProgressRange());
  switch (entity.kind) {
    case 'compound': {
      const parts = (s.parts ?? []).map((part) => worldShape(k, part)).filter(Boolean);
      return parts.length ? compoundOf(k, parts) : null;
    }
    case 'fragments': {
      // Part BooleanFragments: every piece the shapes cut each other into (OCC's general fuse).
      const parts = (s.parts ?? []).map((part) => worldShape(k, part)).filter(Boolean);
      if (parts.length < 2) return null;
      const algo = k(new oc.BRepAlgoAPI_BuilderAlgo());
      algo.SetArguments(shapeList(k, parts));
      algo.Build(progress());
      if (!algo.IsDone()) throw new Error('fragments failed');
      return algo.Shape();
    }
    case 'slice': {
      const base = s.base ? worldShape(k, s.base) : null;
      const tools = (s.tools ?? []).map((tool) => worldShape(k, tool)).filter(Boolean);
      if (!base || !tools.length) return null;
      const algo = k(new oc.BRepAlgoAPI_Splitter());
      algo.SetArguments(shapeList(k, [base]));
      algo.SetTools(shapeList(k, tools));
      algo.Build(progress());
      if (!algo.IsDone()) throw new Error('slice failed');
      return algo.Shape();
    }
    case 'compoundFilter': {
      const base = s.base ? worldShape(k, s.base) : null;
      if (!base) return null;
      const kept = solidsOf(k, base).filter((solid, i) => i >= p.from && i <= p.to && volumeOf(k, solid) >= p.minVolume);
      return kept.length ? compoundOf(k, kept) : null;
    }
    case 'mirror3d': {
      const base = s.base ? worldShape(k, s.base) : null;
      return base ? mirrored(k, base, MIRROR_PLANES[p.plane] ?? 'yz', p.offset ?? 0) : null;
    }
    case 'scale3d': {
      const base = s.base ? worldShape(k, s.base) : null;
      if (!base || Math.abs(p.sx - p.sy) > 1e-12 || Math.abs(p.sx - p.sz) > 1e-12) return null;
      const t = k(new oc.gp_Trsf());
      t.SetScale(pnt(k, [0, 0, 0]), p.sx);
      return k(new oc.BRepBuilderAPI_Transform(base, t, true, false)).Shape();
    }
    case 'refine': {
      // Part RefineShape: coplanar faces and collinear edges left by booleans merged.
      const base = s.base ? worldShape(k, s.base) : null;
      if (!base) return null;
      const unify = k(new oc.ShapeUpgrade_UnifySameDomain(base, true, true, false));
      unify.Build();
      return unify.Shape();
    }
    case 'reverse': {
      const base = s.base ? worldShape(k, s.base) : null;
      return base ? base.Reversed() : null;
    }
    case 'pattern': {
      const shapes = patternCopies(entity).map((copy) => (copy.mirrored ? mirrored(k, worldShape(k, { ...copy, mirrored: undefined }), copy.mirrored, 0) : worldShape(k, copy))).filter(Boolean);
      return shapes.length ? fuseAll(k, shapes) : null;
    }
    default: return null;
  }
}

/** The pieces of a solid (a compound, fragments, a slice) as separate BREP texts with their volumes. */
export function occPieces(entity) {
  if (!oc) return null;
  const k = scope();
  try {
    const shape = worldShape(k, entity);
    if (!shape) return null;
    return solidsOf(k, shape).map((solid) => ({ brep: oc.BRepToolsWrapper.Write(solid), volume: volumeOf(k, solid), tris: triangulate(k, solid, Math.max(0.005, sizeOf(k, solid) * 0.0008)) }));
  } catch {
    return null;
  } finally {
    k.free();
  }
}

/** Counts of a solid's exact topology (Part_ShapeInfo), or null. */
export function occShapeInfo(entity) {
  if (!oc) return null;
  const k = scope();
  try {
    const shape = worldShape(k, entity);
    if (!shape) return null;
    const count = (type) => { let n = 0; const seen = []; const ex = k(new oc.TopExp_Explorer(shape, type, oc.TopAbs_ShapeEnum.TopAbs_SHAPE)); for (; ex.More(); ex.Next()) { const c = ex.Current(); if (!seen.some((x) => x.IsSame(c))) { seen.push(c); n++; } } return n; };
    const E = oc.TopAbs_ShapeEnum;
    const valid = k(new oc.BRepCheck_Analyzer(shape, true, false)).IsValid();
    return { solids: count(E.TopAbs_SOLID), shells: count(E.TopAbs_SHELL), faces: count(E.TopAbs_FACE), wires: count(E.TopAbs_WIRE), edges: count(E.TopAbs_EDGE), vertices: count(E.TopAbs_VERTEX), valid };
  } catch {
    return null;
  } finally {
    k.free();
  }
}

/** Part_ShapeFromMesh / Part_MakeSolid: triangles sewn into an exact (faceted) solid, as BREP text, or null. */
export function occShapeFromMesh(tris, tolerance = 1e-3, solid = true) {
  if (!oc || !tris.length) return null;
  const k = scope();
  try {
    const sewing = k(new oc.BRepBuilderAPI_Sewing(tolerance, true, true, true, false));
    for (const [a, b, c] of tris) {
      const wire = polygonWire(k, [a, b, c]);
      const face = k(new oc.BRepBuilderAPI_MakeFace(wire, true));
      if (face.IsDone()) sewing.Add(face.Face());
    }
    sewing.Perform(k(new oc.Message_ProgressRange()));
    let shape = sewing.SewedShape();
    if (solid) {
      const shells = [];
      const ex = k(new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_SHELL, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
      for (; ex.More(); ex.Next()) shells.push(oc.TopoDS.Shell(ex.Current()));
      if (shells.length) {
        const make = k(new oc.BRepBuilderAPI_MakeSolid());
        for (const shell of shells) make.Add(shell);
        if (make.IsDone()) {
          const fix = k(new oc.ShapeFix_Solid(make.Solid()));
          fix.Perform(k(new oc.Message_ProgressRange()));
          shape = fix.Shape();
        }
      }
    }
    return oc.BRepToolsWrapper.Write(shape);
  } catch {
    return null;
  } finally {
    k.free();
  }
}

function sizeOf(k, shape) {
  const box = k(new oc.Bnd_Box());
  oc.BRepBndLib.Add(shape, box, false);
  if (box.IsVoid()) return 0;
  const lo = box.CornerMin(); const hi = box.CornerMax();
  const d = Math.hypot(hi.X() - lo.X(), hi.Y() - lo.Y(), hi.Z() - lo.Z());
  lo.delete?.(); hi.delete?.();
  return d;
}

/** Kinds whose exact result needs the kernel (the others mesh well on their own). */
export const OCC_KINDS = new Set(['boolean', 'fillet', 'chamfer', 'thickness', 'offset3d', 'draft', 'compound', 'fragments', 'slice', 'compoundFilter', 'mirror3d', 'scale3d', 'refine', 'reverse', 'pattern']);

/**
 * The solid's triangles in its own coordinates from the exact shape, or null
 * (no kernel yet, a kind it does not model, or the operation failed).
 */
export function occLocalMesh(entity) {
  if (!oc) return null;
  const k = scope();
  try {
    const shape = localShape(k, entity);
    if (!shape) return null;
    const size = sizeOf(k, shape);
    return triangulate(k, shape, Math.max(0.005, size * 0.0008));
  } catch {
    return null;
  } finally {
    k.free();
  }
}

/** Exact volume and area of a solid (drawing units), or null. */
export function occProperties(entity) {
  if (!oc) return null;
  const k = scope();
  try {
    const shape = worldShape(k, entity);
    if (!shape) return null;
    const v = k(new oc.GProp_GProps()); const a = k(new oc.GProp_GProps());
    oc.BRepGProp.VolumeProperties(shape, v, false, false, false);
    oc.BRepGProp.SurfaceProperties(shape, a, false, false);
    return { volume: Math.abs(v.Mass()), area: a.Mass() };
  } catch {
    return null;
  } finally {
    k.free();
  }
}

// ───────────────────────── files

function readFsText(path) { const text = oc.FS.readFile(path, { encoding: 'utf8' }); oc.FS.unlink(path); return text; }

/** STEP AP214 with the exact surfaces of the solids (names kept as product names). */
export function occStep(entities) {
  if (!oc) return null;
  try {
    const named = occStepNamed(entities);
    if (named) return named;
  } catch { /* the plain writer below */ }
  const k = scope();
  try {
    const writer = k(new oc.STEPControl_Writer());
    let any = false;
    for (const e of entities) {
      const shape = worldShape(k, e);
      if (!shape) continue;
      writer.Transfer(shape, oc.STEPControl_StepModelType.STEPControl_AsIs, true, k(new oc.Message_ProgressRange()));
      any = true;
    }
    if (!any) return null;
    const path = `/mycad-${Date.now()}.step`;
    writer.Write(path);
    return readFsText(path);
  } finally {
    k.free();
  }
}

/** STEP through an XCAF document: one named product per solid. */
function occStepNamed(entities) {
  const k = scope();
  try {
    // (The document is not deleted by hand: OCC owns it through handles.)
    const doc = new oc.TDocStd_Document(k(new oc.TCollection_ExtendedString('XmlOcaf', true)));
    const tool = oc.XCAFDoc_DocumentTool.ShapeTool(doc.Main());
    let any = false;
    entities.forEach((e, i) => {
      const shape = worldShape(k, e);
      if (!shape) return;
      const label = tool.NewShape();
      tool.SetShape(label, shape);
      oc.TDataStd_Name.Set(label, k(new oc.TCollection_ExtendedString(e.name || `Solid${i + 1}`, true)));
      any = true;
    });
    if (!any) return null;
    const writer = k(new oc.STEPCAFControl_Writer());
    writer.SetNameMode(true);
    // Perform = transfer + write as one file (Transfer with a name would write one file per part).
    const path = `/mycad-${Date.now()}.step`;
    if (!writer.Perform(doc, path, k(new oc.Message_ProgressRange()))) return null;
    return readFsText(path);
  } finally {
    k.free();
  }
}

/** Every solid as one BREP compound (a .brep file). */
export function occBrepAll(entities) {
  if (!oc) return null;
  const k = scope();
  try {
    const builder = k(new oc.TopoDS_Builder());
    const compound = k(new oc.TopoDS_Compound());
    builder.MakeCompound(compound);
    let any = false;
    for (const e of entities) { const shape = worldShape(k, e); if (shape) { builder.Add(compound, shape); any = true; } }
    return any ? oc.BRepToolsWrapper.Write(compound) : null;
  } finally {
    k.free();
  }
}

/** A solid as an OCC BREP text (FreeCAD's .brp), or null. */
export function occBrep(entity) {
  if (!oc) return null;
  const k = scope();
  try {
    const shape = worldShape(k, entity);
    if (!shape) return null;
    return oc.BRepToolsWrapper.Write(shape);
  } finally {
    k.free();
  }
}

/** Reads STEP (or BREP) text: the shapes, each as BREP text and its triangles. */
export function occRead(text, format = 'step') {
  if (!oc) return null;
  const k = scope();
  const path = `/mycad-in-${Date.now()}.${format === 'brep' ? 'brep' : 'step'}`;
  oc.FS.writeFile(path, text);
  try {
    let shapes = [];
    if (format === 'brep') {
      shapes = [k(oc.BRepToolsWrapper.Read(text))];
    } else {
      const reader = k(new oc.STEPControl_Reader());
      if (reader.ReadFile(path) !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) return null;
      reader.TransferRoots(k(new oc.Message_ProgressRange()));
      const one = reader.OneShape();
      // One body per solid (a compound of several comes apart).
      const ex = k(new oc.TopExp_Explorer(one, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
      for (; ex.More(); ex.Next()) shapes.push(ex.Current());
      if (!shapes.length) shapes = [one];
    }
    return shapes.map((shape) => {
      return { brep: oc.BRepToolsWrapper.Write(shape), tris: triangulate(k, shape, Math.max(0.005, sizeOf(k, shape) * 0.0008)) };
    });
  } finally {
    try { oc.FS.unlink(path); } catch { /* gone */ }
    k.free();
  }
}

// ───────────────────────── topology for B-rep exchange (IGES MSBO)

const P3 = (p) => { const out = [p.X(), p.Y(), p.Z()]; p.delete?.(); return out; };
const D3 = (d) => [d.X(), d.Y(), d.Z()];

/** A curve as data: line, circle (arc), B-spline (exact), or a polyline through its points. */
function curveData(k, edge) {
  const c = k(new oc.BRepAdaptor_Curve(edge));
  const t0 = c.FirstParameter(); const t1 = c.LastParameter();
  const type = c.GetType();
  const at = (t) => P3(c.EvalD0(t));
  if (type === oc.GeomAbs_CurveType.GeomAbs_Line) return { type: 'line', a: at(t0), b: at(t1) };
  if (type === oc.GeomAbs_CurveType.GeomAbs_Circle) {
    const circ = c.Circle();
    const pos = circ.Position();
    return { type: 'circle', center: P3(circ.Location()), axis: D3(pos.Direction()), xdir: D3(pos.XDirection()), radius: circ.Radius(), t0, t1, a: at(t0), b: at(t1) };
  }
  if (type === oc.GeomAbs_CurveType.GeomAbs_BSplineCurve) {
    const b = c.BSpline().get();
    const knots = [];
    for (let i = 1; i <= b.NbKnots(); i++) for (let m = 0; m < b.Multiplicity(i); m++) knots.push(b.Knot(i));
    const poles = []; const weights = [];
    for (let i = 1; i <= b.NbPoles(); i++) { poles.push(P3(b.Pole(i))); weights.push(b.Weight(i)); }
    return { type: 'bspline', degree: b.Degree(), knots, poles, weights, t0, t1, a: at(t0), b: at(t1) };
  }
  const n = 32;
  return { type: 'poly', points: Array.from({ length: n + 1 }, (_, i) => at(t0 + ((t1 - t0) * i) / n)), a: at(t0), b: at(t1) };
}

/** B-spline basis functions N(i, p) at u (clamped knots; u = the last knot belongs to the last span). */
function basis(knots, p, n, u) {
  const out = new Array(n).fill(0);
  const last = knots[knots.length - 1];
  if (u >= last) { out[n - 1] = 1; return out; }
  let span = p;
  while (span < n - 1 && u >= knots[span + 1]) span++;
  const N = new Array(p + 1).fill(0); N[0] = 1;
  const left = []; const right = [];
  for (let j = 1; j <= p; j++) {
    left[j] = u - knots[span + 1 - j]; right[j] = knots[span + j] - u;
    let saved = 0;
    for (let r = 0; r < j; r++) { const t = N[r] / (right[r + 1] + left[j - r]); N[r] = saved + right[r + 1] * t; saved = left[j - r] * t; }
    N[j] = saved;
  }
  for (let j = 0; j <= p; j++) out[span - p + j] = N[j];
  return out;
}

/** Inverse of a small dense matrix (Gauss–Jordan). */
function inverseOf(A) {
  const n = A.length;
  const M = A.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c];
    for (let k2 = 0; k2 < 2 * n; k2++) M[c][k2] /= d;
    for (let r = 0; r < n; r++) if (r !== c && M[r][c]) { const m = M[r][c]; for (let k2 = 0; k2 < 2 * n; k2++) M[r][k2] -= m * M[c][k2]; }
  }
  return M.map((row) => row.slice(n));
}

/**
 * Cubic global interpolation (The NURBS Book A9.1) of n samples at equal
 * parameters over [a, b]: averaged knots and the matrix that turns samples into poles.
 */
function interpolation(n, a, b, p = 3) {
  const t = Array.from({ length: n }, (_, i) => i / (n - 1));
  const knots = [...Array(p + 1).fill(0)];
  for (let j = 1; j <= n - p - 1; j++) { let sum = 0; for (let i = j; i < j + p; i++) sum += t[i]; knots.push(sum / p); }
  knots.push(...Array(p + 1).fill(1));
  const solve = inverseOf(t.map((u) => basis(knots, p, n, u)));
  return { knots: knots.map((x) => a + (b - a) * x), solve };
}

/** A surface as data: plane, cylinder, sphere, B-spline (exact), or a cubic B-spline through a dense grid of it over the face's (u, v) range. */
function surfaceData(k, face) {
  const s = k(new oc.BRepAdaptor_Surface(face, true));
  const type = s.GetType();
  // The surface's own normal (∂u × ∂v) in the middle of the face: the side the face's orientation refers to.
  const { UMin, UMax, VMin, VMax } = oc.BRepTools.UVBounds(face);
  const d1 = s.EvalD1((UMin + UMax) / 2, (VMin + VMax) / 2);
  const at = P3(d1.Point); const du = D3(d1.D1U); const dv = D3(d1.D1V);
  const normal = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]];
  const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  if (type === oc.GeomAbs_SurfaceType.GeomAbs_Plane) {
    const p = s.Plane(); const ax = p.Position();
    const n = D3(ax.Direction());
    // A plane's IGES normal is the surface normal itself (a recognised plane may point the other way).
    return { type: 'plane', origin: P3(p.Location()), normal: dot(n, normal) < 0 ? n.map((v) => -v) : n, xdir: D3(ax.XDirection()) };
  }
  if (type === oc.GeomAbs_SurfaceType.GeomAbs_Cylinder) {
    const cy = s.Cylinder(); const ax = cy.Position();
    const o = P3(cy.Location()); const axis = D3(ax.Direction());
    const rel = at.map((v, i) => v - o[i]); const h = dot(rel, axis);
    const radial = rel.map((v, i) => v - axis[i] * h);
    return { type: 'cylinder', origin: o, axis, xdir: D3(ax.XDirection()), radius: cy.Radius(), flip: dot(radial, normal) < 0 };
  }
  if (type === oc.GeomAbs_SurfaceType.GeomAbs_Sphere) {
    const sp = s.Sphere(); const ax = sp.Position();
    const c = P3(sp.Location());
    return { type: 'sphere', center: c, axis: D3(ax.Direction()), xdir: D3(ax.XDirection()), radius: sp.Radius(), flip: dot(at.map((v, i) => v - c[i]), normal) < 0 };
  }
  if (type === oc.GeomAbs_SurfaceType.GeomAbs_BSplineSurface) {
    const b = s.BSpline().get();
    const knots = (n, mult, knot) => { const out = []; for (let i = 1; i <= n; i++) for (let m = 0; m < mult(i); m++) out.push(knot(i)); return out; };
    const poles = []; const weights = [];
    for (let j = 1; j <= b.NbVPoles(); j++) for (let i = 1; i <= b.NbUPoles(); i++) { poles.push(P3(b.Pole(i, j))); weights.push(b.Weight(i, j)); }
    return { type: 'bspline', uDegree: b.UDegree(), vDegree: b.VDegree(), nu: b.NbUPoles(), nv: b.NbVPoles(), uKnots: knots(b.NbUKnots(), (i) => b.UMultiplicity(i), (i) => b.UKnot(i)), vKnots: knots(b.NbVKnots(), (i) => b.VMultiplicity(i), (i) => b.VKnot(i)), poles, weights };
  }
  // Any other surface (cone, torus, revolution, extrusion …): a cubic B-spline through a dense grid of the true surface.
  const nu = 48; const nv = 32;
  const grid = [];
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) grid.push(P3(s.EvalD0(UMin + ((UMax - UMin) * i) / (nu - 1), VMin + ((VMax - VMin) * j) / (nv - 1))));
  const U = interpolation(nu, UMin, UMax); const V = interpolation(nv, VMin, VMax);
  // Rows (along u) first, then the columns of those.
  const rows = [];
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) rows.push([0, 1, 2].map((d) => U.solve[i].reduce((sum, w, m) => sum + w * grid[j * nu + m][d], 0)));
  const poles = [];
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) poles.push([0, 1, 2].map((d) => V.solve[j].reduce((sum, w, m) => sum + w * rows[m * nu + i][d], 0)));
  return { type: 'bspline', uDegree: 3, vDegree: 3, nu, nv, uKnots: U.knots, vKnots: V.knots, poles, weights: poles.map(() => 1), fitted: true };
}

/**
 * A solid's B-rep as plain data for exchange: vertices [[x,y,z]], edges
 * [{ curve, v0, v1 }], faces [{ surface, reversed, loops: [[{ edge, forward }]] (outer first) }].
 */
export function occTopology(entity) {
  if (!oc) return null;
  const k = scope();
  try {
    const shape = worldShape(k, entity);
    if (!shape) return null;
    const vertices = []; const vShapes = [];
    const vertexIndex = (v) => {
      let i = vShapes.findIndex((x) => x.IsSame(v));
      if (i < 0) { i = vShapes.length; vShapes.push(v); vertices.push(P3(oc.BRep_Tool.Pnt(v))); }
      return i;
    };
    const edges = []; const eShapes = [];
    const edgeIndex = (e) => {
      let i = eShapes.findIndex((x) => x.IsSame(e));
      if (i >= 0) return i;
      if (oc.BRep_Tool.Degenerated(e)) return -1;
      i = eShapes.length;
      eShapes.push(e);
      const curve = curveData(k, e);
      // The vertices at the curve's start and end (by place).
      const ends = [];
      const ex = k(new oc.TopExp_Explorer(e, oc.TopAbs_ShapeEnum.TopAbs_VERTEX, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
      for (; ex.More(); ex.Next()) ends.push(vertexIndex(oc.TopoDS.Vertex(ex.Current())));
      const nearest = (p) => ends.reduce((best, vi) => (Math.hypot(...vertices[vi].map((c, d) => c - p[d])) < Math.hypot(...vertices[best].map((c, d) => c - p[d])) ? vi : best), ends[0]);
      edges.push({ curve, v0: nearest(curve.a), v1: nearest(curve.b) });
      return i;
    };
    const faces = [];
    const fx = k(new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
    for (; fx.More(); fx.Next()) {
      const face = oc.TopoDS.Face(fx.Current());
      const outer = oc.BRepTools.OuterWire(face);
      const loops = [];
      const wx = k(new oc.TopExp_Explorer(face, oc.TopAbs_ShapeEnum.TopAbs_WIRE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
      for (; wx.More(); wx.Next()) {
        const wire = oc.TopoDS.Wire(wx.Current());
        const loop = [];
        const ex = k(new oc.TopExp_Explorer(wire, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
        for (; ex.More(); ex.Next()) {
          const e = oc.TopoDS.Edge(ex.Current());
          const index = edgeIndex(e);
          if (index >= 0) loop.push({ edge: index, forward: e.Orientation() === oc.TopAbs_Orientation.TopAbs_FORWARD });
        }
        if (!loop.length) continue;
        // In a chain: each edge starts where the one before ends (the explorer need not give them so).
        const from = (u) => (u.forward ? edges[u.edge].v0 : edges[u.edge].v1);
        const to = (u) => (u.forward ? edges[u.edge].v1 : edges[u.edge].v0);
        const chain = [loop[0]];
        const left = loop.slice(1);
        while (left.length) {
          const end = to(chain[chain.length - 1]);
          let i = left.findIndex((u) => from(u) === end && !(u.edge === chain[chain.length - 1].edge));
          if (i < 0) i = left.findIndex((u) => from(u) === end);
          if (i < 0) break;
          chain.push(left.splice(i, 1)[0]);
        }
        const ordered = left.length ? loop : chain;
        if (wire.IsSame(outer)) loops.unshift(ordered); else loops.push(ordered);
      }
      const surface = surfaceData(k, face);
      // (A cylinder or sphere whose own normal points in: the face flag turns over.)
      faces.push({ surface, reversed: (face.Orientation() === oc.TopAbs_Orientation.TopAbs_REVERSED) !== Boolean(surface.flip), loops });
    }
    return { vertices, edges, faces };
  } finally {
    k.free();
  }
}

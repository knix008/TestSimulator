// 3D solids, like FreeCAD's Part / Part Design workbenches:
//   primitives  box, cylinder, sphere, cone, torus, tube, wedge, prism, ellipsoid, helix (coil)
//   from 2D     pad (extrusion), revolution, loft (between two outlines), sweep (pipe along a path)
//   booleans    boolean (Fuse / Cut / Common of other solids, kept as a tree like FreeCAD's)
//   results     mesh (imported STL/OBJ/PLY/OFF/AMF/3MF/STEP)
// A solid entity keeps its kind, parameters, shape data and placement
// (x, y, z, rotations rx → ry → rz in degrees, scale, flip); its mesh is
// generated from them as closed, outward-facing triangles [[x, y, z] × 3].
// In the 2D drawing a solid shows its top-view outline.
import { arcPoints, bboxOf, polygonArea } from './geometry.js';
import { booleanOf } from './csg.js';
import { triangulate } from './triangulate.js';
import { repairMesh } from './meshcheck.js';
import { HOLE_TIPS, HOLE_TYPES, holeProfile, holeVolume, loftSectionsMesh, sweepSectionMesh, taperedExtrude } from './features.js';
import { extrudedCurve, fillSurface, sectionSurface, SURFACE_MODES, thicken } from './surface.js';
import { JOINT_LIMITS, robotMesh } from './robot.js';
import { canDressUp, DRESSUP_EDGES, DRESSUP_KINDS, dressupMesh, dressupOutlines } from './dressup.js';
import { OCC_KINDS, occLocalMesh, occProperties } from './occ.js';
import { hasPartopShape, normalizePartopShape, PARTOP_KINDS, PARTOP_PARAMS, partopLocalMesh } from './partops.js';
import { normalizeBimInfo, normalizeComponents } from './bimtools.js';
import { ARCH_ICONS, ARCH_KINDS, ARCH_SOLIDS, archBlocks, archGroups, archMesh, normalizeMaterial, archPlan, archQuantities, hasArchShape, isArchKind, normalizeArchShape } from './arch.js';

const num = (key, def, min, max, step = 1, unit = 'mm') => ({ key, type: 'number', def, min, max, step, unit });
const int = (key, def, min, max) => ({ key, type: 'int', def, min, max, step: 1, unit: '' });

/** Primitive kinds (made in the solid window). */
export const SOLID_KINDS = ['box', 'cylinder', 'sphere', 'cone', 'torus', 'tube', 'wedge', 'prism', 'ellipsoid', 'helix'];
/** Kinds made from 2D outlines or other solids. */
export const DERIVED_KINDS = ['pad', 'revolution', 'loft', 'sweep', 'boolean', 'mesh', 'points', 'surface', 'hole', 'robot', ...DRESSUP_KINDS, ...PARTOP_KINDS];
export const LOFT_MODES = ['ruled', 'smooth'];
export const THICKNESS_OPEN = ['openTop', 'openBottom', 'openBoth', 'closed'];
export const POCKET_MODES = ['blind', 'throughAll'];
export const BOOLEAN_OPS = ['union', 'cut', 'common'];
export const ALL_SOLID_KINDS = [...SOLID_KINDS, ...DERIVED_KINDS, ...ARCH_KINDS];
export const ROUND_SEGMENTS = 72;

export const SOLIDS = {
  box: { params: [num('length', 10, 0.01, 100000), num('width', 10, 0.01, 100000), num('height', 10, 0.01, 100000)] },
  cylinder: { params: [num('radius', 5, 0.01, 50000), num('height', 10, 0.01, 100000), num('angle', 360, 1, 360, 15, '°')] },
  sphere: { params: [num('radius', 5, 0.01, 50000)] },
  cone: { params: [num('radius1', 5, 0, 50000), num('radius2', 2, 0, 50000), num('height', 10, 0.01, 100000)] },
  torus: { params: [num('radius1', 10, 0.02, 50000), num('radius2', 2, 0.01, 25000)] },
  tube: { params: [num('outer', 5, 0.02, 50000), num('inner', 3, 0.01, 50000), num('height', 10, 0.01, 100000)] },
  wedge: { params: [num('length', 10, 0.01, 100000), num('width', 10, 0.01, 100000), num('height', 10, 0.01, 100000), num('topLength', 4, 0, 100000)] },
  prism: { params: [int('sides', 6, 3, 64), num('radius', 5, 0.01, 50000), num('height', 10, 0.01, 100000)] },
  ellipsoid: { params: [num('radius1', 3, 0.01, 50000), num('radius2', 6, 0.01, 50000), num('radius3', 4, 0.01, 50000)] },
  helix: { params: [num('radius', 10, 0.1, 50000), num('pitch', 5, 0.1, 1000, 0.5), num('turns', 5, 0.25, 200, 0.25, ''), num('wire', 1, 0.05, 500, 0.1)] },
  pad: { params: [num('height', 10, 0.01, 100000), num('taper', 0, -60, 60, 1, '°')] },
  revolution: { params: [num('angle', 360, 1, 360, 15, '°')] },
  loft: { params: [num('height', 20, 0.01, 100000), { key: 'mode', type: 'choice', options: LOFT_MODES, def: 0, min: 0, max: LOFT_MODES.length - 1, step: 1, unit: '' }] },
  sweep: { params: [num('radius', 2, 0.01, 1000, 0.5)] },
  boolean: { params: [] },
  // PartDesign Pocket and Groove (parameters only: the result is a Cut tree).
  pocket: { params: [num('depth', 5, 0.01, 100000), { key: 'through', type: 'choice', options: POCKET_MODES, def: 0, min: 0, max: POCKET_MODES.length - 1, step: 1, unit: '' }] },
  groove: { params: [num('angle', 360, 1, 360, 15, '°')] },
  mesh: { params: [] },
  // A point cloud (FreeCAD Points): shape.pts = [x, y, z, …].
  points: { params: [] },
  // FreeCAD Robot: a 6-axis arm, its joint angles (degrees), size and tool length.
  robot: { params: [...JOINT_LIMITS.map(([lo, hi], i) => num(`a${i + 1}`, [0, -90, 90, 0, 90, 0][i], lo, hi, 5, '°')), num('reach', 1, 0.1, 20, 0.1, ''), num('tool', 100, 0, 5000, 10)] },
  // FreeCAD Surface: open surfaces from curves (shape: curves | outer + holes | paths); a thickness makes a shell solid.
  surface: { params: [{ key: 'mode', type: 'choice', options: SURFACE_MODES, def: 0, min: 0, max: SURFACE_MODES.length - 1, step: 1, unit: '' }, num('height', 50, 0.01, 100000), num('bulge', 0, -100000, 100000), num('thickness', 0, 0, 10000, 0.5), { key: 'smooth', type: 'choice', options: LOFT_MODES, def: 0, min: 0, max: LOFT_MODES.length - 1, step: 1, unit: '' }] },
  surfRuled: { params: [num('height', 50, 0.01, 100000), { key: 'smooth', type: 'choice', options: LOFT_MODES, def: 0, min: 0, max: LOFT_MODES.length - 1, step: 1, unit: '' }, num('thickness', 0, 0, 10000, 0.5)] },
  surfFill: { params: [num('bulge', 20, -100000, 100000), num('thickness', 0, 0, 10000, 0.5)] },
  surfExtrude: { params: [num('height', 50, 0.01, 100000), num('thickness', 0, 0, 10000, 0.5)] },
  // Part Fillet / Chamfer / Thickness / Offset on a prism-shaped base (shape.base).
  fillet: { params: [num('size', 2, 0.01, 100000, 0.5), { key: 'edges', type: 'choice', options: DRESSUP_EDGES, def: 0, min: 0, max: DRESSUP_EDGES.length - 1, step: 1, unit: '' }] },
  chamfer: { params: [num('size', 2, 0.01, 100000, 0.5), { key: 'edges', type: 'choice', options: DRESSUP_EDGES, def: 0, min: 0, max: DRESSUP_EDGES.length - 1, step: 1, unit: '' }] },
  thickness: { params: [num('thickness', 2, 0.01, 100000, 0.5), { key: 'open', type: 'choice', options: THICKNESS_OPEN, def: 0, min: 0, max: THICKNESS_OPEN.length - 1, step: 1, unit: '' }] },
  // PartDesign Hole: mouth at z = 0, drilled down (−z).
  hole: { params: [num('diameter', 6.6, 0.1, 10000, 0.1), num('depth', 10, 0.1, 100000), { key: 'type', type: 'choice', options: HOLE_TYPES, def: 0, min: 0, max: HOLE_TYPES.length - 1, step: 1, unit: '' }, num('cbDiameter', 11, 0.1, 10000, 0.5), num('cbDepth', 6.4, 0.1, 10000, 0.5), num('csDiameter', 12.4, 0.1, 10000, 0.5), { key: 'tip', type: 'choice', options: HOLE_TIPS, def: 1, min: 0, max: HOLE_TIPS.length - 1, step: 1, unit: '' }] },
  offset3d: { params: [num('distance', 2, -100000, 100000, 0.5)] },
  draft: { params: [num('angle', 5, -45, 45, 1, '°')] },
  ...ARCH_SOLIDS,
  // Part / PartDesign shape operations (partops.js).
  ...Object.fromEntries(PARTOP_KINDS.map((kind) => [kind, { params: PARTOP_PARAMS[kind] }])),
};

/** Icon of each solid kind (FreeCAD Part workbench look). */
export const SOLID_ICONS = {
  box: 'solidBox', cylinder: 'solidCylinder', sphere: 'solidSphere', cone: 'solidCone', torus: 'solidTorus', tube: 'solidTube', wedge: 'solidWedge',
  prism: 'solidPrism', ellipsoid: 'solidEllipsoid', helix: 'solidHelix', pad: 'solidExtrude', revolution: 'solidRevolve', loft: 'solidLoft', sweep: 'solidSweep', boolean: 'solidCut', mesh: 'solidImport', points: 'pointCloud', robot: 'robot', surface: 'surfFill', surfRuled: 'surfRuled', surfFill: 'surfFill', surfExtrude: 'surfExtrude', fillet: 'solidFillet', chamfer: 'solidChamfer', hole: 'solidHole', pocket: 'solidPocket', groove: 'solidGroove', thickness: 'solidThickness', offset3d: 'solidOffset', draft: 'solidDraft',
  ...Object.fromEntries(ARCH_KINDS.map((kind) => [kind, ARCH_ICONS[kind]])),
  compound: 'partCompound', fragments: 'partFragments', slice: 'partSlice', compoundFilter: 'partCompoundFilter', mirror3d: 'partMirror', scale3d: 'partScale',
  refine: 'partRefine', reverse: 'partReverse', pattern: 'array', wire3d: 'partWire3d', datum: 'datumPlane',
};

/** Axes a 2D outline can be revolved about. */
export const REVOLVE_AXES = ['yAxis', 'xAxis', 'left', 'bottom'];

/**
 * A solid (raw entity data) made from 2D outlines, like FreeCAD's Extrude,
 * Revolve, Loft and Sweep. source:
 *   pad        { shapes: [{ outer, holes }] }          params { height }
 *   revolution { loop: [{ x, y }] }, axis               params { angle }
 *   loft       { bottom: [{ x, y }], top: [{ x, y }] }   params { height }
 *   sweep      { path: [{ x, y }] }                     params { radius }
 */
export function featureFrom(kind, source, params = {}, { axis = 'yAxis' } = {}) {
  const base = { type: 'solid', kind, params: normalizeSolidParams(kind, params), x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
  if (kind === 'pad') return { ...base, shape: { shapes: source.shapes } };
  // Pocket / Groove / Hole: the tool that is cut away (its height is set where it is used).
  if (kind === 'pocket') return featureFrom('pad', source, { height: base.params.depth });
  // Surfaces: one kind, three ways of making it.
  if (kind === 'surfRuled' || kind === 'surfFill' || kind === 'surfExtrude') {
    const mode = { surfRuled: 0, surfFill: 1, surfExtrude: 2 }[kind];
    const shape = kind === 'surfRuled' ? { curves: source.curves } : kind === 'surfFill' ? { outer: source.outer, holes: source.holes ?? [] } : { paths: source.paths };
    return { ...base, kind: 'surface', params: normalizeSolidParams('surface', { ...params, mode }), shape };
  }
  if (kind === 'groove') return featureFrom('revolution', source, { angle: base.params.angle }, { axis });
  if (kind === 'hole') {
    const c = source.circles?.[0] ?? { x: 0, y: 0 };
    return { ...base, x: c.x, y: c.y };
  }
  if (kind === 'loft') return { ...base, shape: source.sections?.length > 2 || (source.sections && LOFT_MODES[base.params.mode] === 'smooth') ? { sections: source.sections } : { bottom: source.bottom ?? source.sections[0], top: source.top ?? source.sections[1] } };
  if (kind === 'sweep') return { ...base, shape: { path: source.path.map((p) => [p.x, p.y, 0]), ...(source.section ? { section: source.section } : {}) } };
  if (kind === 'revolution') {
    const loop = source.loop;
    const box = bboxOf(loop);
    const vertical = axis === 'yAxis' || axis === 'left';
    if (vertical) {
      // About the vertical line x = a: profile (|x − a|, y); local z turns to drawing +y.
      const a = axis === 'yAxis' ? 0 : box.minX;
      return { ...base, shape: { profile: loop.map((p) => [Math.abs(p.x - a), p.y]) }, x: a, rx: -90 };
    }
    // About the horizontal line y = b: profile (|y − b|, x); local z turns to drawing +x.
    const b = axis === 'xAxis' ? 0 : box.minY;
    return { ...base, shape: { profile: loop.map((p) => [Math.abs(p.y - b), p.x]) }, y: b, rx: 90, rz: 90 };
  }
  throw new Error(`unknown feature ${kind}`);
}

export function defaultSolidParams(kind) {
  return Object.fromEntries(SOLIDS[kind].params.map((param) => [param.key, param.def]));
}

export function normalizeSolidParams(kind, raw = {}) {
  const out = {};
  for (const param of SOLIDS[kind].params) {
    let value = Number(raw?.[param.key]);
    if (!Number.isFinite(value)) value = param.def;
    value = Math.min(param.max, Math.max(param.min, value));
    out[param.key] = param.type === 'number' ? value : Math.round(value);
  }
  if (kind === 'tube') out.inner = Math.min(out.inner, out.outer * 0.98);
  if (kind === 'torus') out.radius2 = Math.min(out.radius2, out.radius1 * 0.98);
  if (kind === 'helix') out.wire = Math.min(out.wire, out.radius * 0.95, out.pitch * 0.49);
  return out;
}

const point2 = (p) => ({ x: Number(p?.x) || 0, y: Number(p?.y) || 0 });
const point3 = (p) => [Number(p?.[0]) || 0, Number(p?.[1]) || 0, Number(p?.[2]) || 0];

/**
 * Repairs the shape data:
 *   pad { shapes: [{ outer, holes }] } · revolution { profile: [[r, z]] } · loft { bottom, top } ([{ x, y }])
 *   sweep { path: [[x, y, z]] } · mesh { tris: [x, y, z, …] (9 numbers per triangle) }
 *   boolean { op: union | cut | common, parts: [solid data] } — parts in the boolean's own coordinates
 */
export function normalizeShapeData(kind, raw) {
  switch (kind) {
    case 'boolean':
      return { op: BOOLEAN_OPS.includes(raw?.op) ? raw.op : 'union', parts: (Array.isArray(raw?.parts) ? raw.parts : []).map(normalizeSolidData).filter(Boolean) };
    case 'pad': {
      const shapes = (Array.isArray(raw?.shapes) ? raw.shapes : []).map((shape) => ({
        outer: (shape?.outer ?? []).map(point2),
        holes: (shape?.holes ?? []).map((hole) => (hole ?? []).map(point2)).filter((hole) => hole.length >= 3),
      })).filter((shape) => shape.outer.length >= 3);
      return { shapes };
    }
    case 'revolution':
      return { profile: (Array.isArray(raw?.profile) ? raw.profile : []).map((p) => [Math.max(0, Number(p?.[0]) || 0), Number(p?.[1]) || 0]) };
    case 'loft': {
      // Several sections (bottom to top), or the older bottom + top.
      const sections = (Array.isArray(raw?.sections) ? raw.sections : []).map((s) => (Array.isArray(s) ? s.map(point2) : [])).filter((s) => s.length >= 3);
      return sections.length >= 2 ? { sections } : { bottom: (raw?.bottom ?? []).map(point2), top: (raw?.top ?? []).map(point2) };
    }
    case 'sweep': {
      const section = (Array.isArray(raw?.section) ? raw.section : []).map(point2);
      return { path: (Array.isArray(raw?.path) ? raw.path : []).map(point3), ...(section.length >= 3 ? { section } : {}) };
    }
    case 'surface': {
      const loop = (l) => (Array.isArray(l) ? l.map(point2) : []);
      return {
        ...(Array.isArray(raw?.curves) ? { curves: raw.curves.map(loop).filter((c) => c.length >= 2) } : {}),
        ...(Array.isArray(raw?.outer) ? { outer: loop(raw.outer), holes: (raw.holes ?? []).map(loop).filter((h) => h.length >= 3) } : {}),
        ...(Array.isArray(raw?.paths) ? { paths: raw.paths.map(loop).filter((c) => c.length >= 2) } : {}),
      };
    }
    case 'points': {
      const pts = Array.isArray(raw?.pts) ? raw.pts.map((v) => Number(v) || 0) : [];
      const kept = pts.slice(0, pts.length - (pts.length % 3));
      return { pts: kept, ...colorsFor(raw?.colors, kept.length / 3), ...inspectOf(raw?.inspect) };
    }
    case 'mesh': {
      const tris = Array.isArray(raw?.tris) ? raw.tris.map((v) => Number(v) || 0) : [];
      const kept = tris.slice(0, tris.length - (tris.length % 9));
      return { tris: kept, ...colorsFor(raw?.colors, kept.length / 9), ...inspectOf(raw?.inspect), ...(typeof raw?.brep === 'string' && raw.brep.startsWith('DBRep_DrawableShape') || typeof raw?.brep === 'string' && raw.brep.includes('CASCADE Topology') ? { brep: raw.brep } : {}) };
    }
    case 'fillet': case 'chamfer': case 'thickness': case 'offset3d': case 'draft': {
      const base = normalizeSolidData(raw?.base);
      // Edges picked one by one: kept by what they look like (midpoint, direction), not by number.
      const vec = (v) => (Array.isArray(v) && v.length === 3 && v.every(Number.isFinite) ? v.map(Number) : null);
      const picks = Array.isArray(raw?.picks) ? raw.picks.map((p) => ({ mid: vec(p?.mid), dir: vec(p?.dir) })).filter((p) => p.mid && p.dir) : [];
      return base ? { base, ...(picks.length ? { picks } : {}) } : {};
    }
    default:
      if (PARTOP_KINDS.includes(kind)) return normalizePartopShape(kind, raw, normalizeSolidData);
      return isArchKind(kind) ? normalizeArchShape(kind, raw) : {};
  }
}

/** Is there enough shape data to build the solid? */
export function hasShape(entity) {
  const s = entity.shape ?? {};
  switch (entity.kind) {
    case 'pad': return (s.shapes?.length ?? 0) > 0;
    case 'revolution': return (s.profile?.length ?? 0) >= 3;
    case 'loft': return (s.sections?.length ?? 0) >= 2 || ((s.bottom?.length ?? 0) >= 3 && (s.top?.length ?? 0) >= 3);
    case 'sweep': return (s.path?.length ?? 0) >= 2;
    case 'mesh': return (s.tris?.length ?? 0) >= 9;
    case 'points': return (s.pts?.length ?? 0) >= 3;
    case 'surface': return (s.curves?.length ?? 0) >= 2 || (s.outer?.length ?? 0) >= 3 || (s.paths?.length ?? 0) >= 1;
    case 'boolean': return (s.parts?.length ?? 0) >= 2;
    case 'fillet': case 'chamfer': case 'thickness': case 'offset3d': case 'draft': return canDressUp(s.base);
    default:
      if (PARTOP_KINDS.includes(entity.kind)) return hasPartopShape(entity.kind, s);
      return isArchKind(entity.kind) ? hasArchShape(entity) : true;
  }
}

const finite = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

/** The solid fields of an entity (kind, name, parameters, shape, placement), repaired; null when unusable. */
/**
 * Mesh_VertexCurvature, Inspection_VisualInspection: a colour (r, g, b in
 * 0…1) for each triangle of a mesh or each point of a cloud — kept only when
 * there is one for every one.
 */
function colorsFor(raw, count) {
  if (!Array.isArray(raw) || raw.length !== count * 3 || !count) return {};
  return { colors: raw.map((v) => Math.max(0, Math.min(1, Number(v) || 0))) };
}

/** Inspection_VisualInspection: what a result was compared with, and the distances found. */
function inspectOf(raw) {
  if (!raw || typeof raw.nominal !== 'string') return {};
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return { inspect: { nominal: raw.nominal, min: n(raw.min), max: n(raw.max), rms: n(raw.rms) } };
}

export function normalizeSolidData(raw) {
  if (!raw || typeof raw !== 'object' || !ALL_SOLID_KINDS.includes(raw.kind)) return null;
  const scale = Number(raw.scale);
  return {
    type: 'solid', kind: raw.kind, name: typeof raw.name === 'string' ? raw.name : '',
    ...(typeof raw.color === 'string' && /^#[0-9a-f]{6}$/i.test(raw.color) ? { color: raw.color.toLowerCase() } : {}),
    x: finite(raw.x), y: finite(raw.y), z: finite(raw.z), rx: finite(raw.rx), ry: finite(raw.ry), rz: finite(raw.rz),
    scale: Number.isFinite(scale) && scale > 0 ? scale : 1, flip: Boolean(raw.flip),
    params: normalizeSolidParams(raw.kind, raw.params), shape: normalizeShapeData(raw.kind, raw.shape),
    // BIM objects: the level they stand on and their material.
    ...(typeof raw.level === 'string' && raw.level ? { level: raw.level.slice(0, 40) } : {}),
    ...(isArchKind(raw.kind) && normalizeMaterial(raw.material) ? { material: normalizeMaterial(raw.material) } : {}),
    // BIM: IFC class, classification, property sets, B-rep flag; a component's additions and subtractions (Arch_Add / Arch_Remove).
    ...(normalizeBimInfo(raw.bim) ? { bim: normalizeBimInfo(raw.bim) } : {}),
    ...(normalizeComponents(raw.components, normalizeSolidData) ? { components: normalizeComponents(raw.components, normalizeSolidData) } : {}),
  };
}

// ───────────────────────── tessellation (local coordinates)

const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-12 && Math.abs(a[1] - b[1]) < 1e-12 && Math.abs(a[2] - b[2]) < 1e-12;
/** Drops triangles with two equal corners (poles of revolved shapes). */
const keep = (tri) => !(same(tri[0], tri[1]) || same(tri[1], tri[2]) || same(tri[0], tri[2]));

/**
 * Revolves a closed profile [[r, z], …] (counter-clockwise in the r–z plane)
 * about the z axis by `angle` degrees. A partial revolution gets flat end faces.
 */
export function revolve(profile, angle = 360, segments = ROUND_SEGMENTS) {
  const full = angle >= 359.999;
  const count = Math.max(3, Math.ceil((segments * angle) / 360));
  const at = ([r, z], k) => {
    const t = ((angle * k) / count) * (Math.PI / 180);
    return [r * Math.cos(t), r * Math.sin(t), z];
  };
  const tris = [];
  const n = profile.length;
  for (let i = 0; i < n; i++) {
    const p = profile[i];
    const q = profile[(i + 1) % n];
    for (let k = 0; k < count; k++) {
      const a = at(p, k);
      const b = at(p, k + 1);
      const c = at(q, k + 1);
      const d = at(q, k);
      tris.push([a, b, c], [a, c, d]);
    }
  }
  if (!full) {
    const faces = triangulate(profile.map(([r, z]) => ({ x: r, y: z })));
    for (const [a, b, c] of faces) {
      tris.push([at([a.x, a.y], 0), at([b.x, b.y], 0), at([c.x, c.y], 0)]);
      tris.push([at([a.x, a.y], count), at([c.x, c.y], count), at([b.x, b.y], count)]);
    }
  }
  return tris.filter(keep);
}

/** Prism of an outline (x–y) with holes, from z0 to z1. */
export function extrudePolygon(points, z0, z1, holes = []) {
  const tris = [];
  const outer = polygonArea(points) > 0 ? points : points.slice().reverse();
  const inner = holes.map((hole) => (polygonArea(hole) < 0 ? hole : hole.slice().reverse()));
  for (const [a, b, c] of triangulate(outer, inner)) {
    tris.push([[a.x, a.y, z1], [b.x, b.y, z1], [c.x, c.y, z1]]);
    tris.push([[a.x, a.y, z0], [c.x, c.y, z0], [b.x, b.y, z0]]);
  }
  for (const loop of [outer, ...inner]) {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i];
      const b = loop[(i + 1) % loop.length];
      tris.push([[a.x, a.y, z0], [b.x, b.y, z0], [b.x, b.y, z1]], [[a.x, a.y, z0], [b.x, b.y, z1], [a.x, a.y, z1]]);
    }
  }
  return tris;
}

/** Resamples a closed outline to `n` points evenly spaced along its perimeter, counter-clockwise, starting nearest to +x. */
export function resampleLoop(points, n) {
  const loop = polygonArea(points) > 0 ? points : points.slice().reverse();
  const lengths = [0];
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    lengths.push(lengths[i] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = lengths[loop.length];
  // Start where the outline crosses the +x ray from its centre, so two outlines line up without a twist.
  const cx = loop.reduce((s, p) => s + p.x, 0) / loop.length;
  const cy = loop.reduce((s, p) => s + p.y, 0) / loop.length;
  let startLength = 0;
  let bestX = Infinity;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    if ((a.y - cy) * (b.y - cy) > 0 || a.y === b.y) continue;
    const t = (cy - a.y) / (b.y - a.y);
    const x = a.x + (b.x - a.x) * t;
    if (x > cx && x - cx < bestX) { bestX = x - cx; startLength = lengths[i] + (lengths[i + 1] - lengths[i]) * t; }
  }
  const out = [];
  for (let k = 0; k < n; k++) {
    let target = startLength + (total * k) / n;
    if (target >= total) target -= total;
    let i = 0;
    while (i < loop.length - 1 && lengths[i + 1] < target) i++;
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    const span = lengths[i + 1] - lengths[i] || 1;
    const t = (target - lengths[i]) / span;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

/** Loft: a ruled solid between a bottom outline (z = 0) and a top outline (z = height). */
export function loftMesh(bottom, top, height) {
  const n = Math.max(bottom.length, top.length, 48);
  const a = resampleLoop(bottom, n);
  const b = resampleLoop(top, n);
  const tris = [];
  for (const [p, q, r] of triangulate(b)) tris.push([[p.x, p.y, height], [q.x, q.y, height], [r.x, r.y, height]]);
  for (const [p, q, r] of triangulate(a)) tris.push([[p.x, p.y, 0], [r.x, r.y, 0], [q.x, q.y, 0]]);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a0 = [a[i].x, a[i].y, 0];
    const a1 = [a[j].x, a[j].y, 0];
    const b0 = [b[i].x, b[i].y, height];
    const b1 = [b[j].x, b[j].y, height];
    tris.push([a0, a1, b1], [a0, b1, b0]);
  }
  return tris;
}

const v3 = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  unit: (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};

/** Sweep: a round pipe of `radius` along a 3D path (parallel-transport frames, flat end caps). */
export function sweepMesh(path, radius, sides = 32) {
  const pts = path.filter((p, i) => i === 0 || Math.hypot(...v3.sub(p, path[i - 1])) > 1e-9);
  if (pts.length < 2) return [];
  const tangents = pts.map((p, i) => v3.unit(v3.sub(pts[Math.min(i + 1, pts.length - 1)], pts[Math.max(i - 1, 0)])));
  // First normal: any vector perpendicular to the first tangent.
  const t0 = tangents[0];
  let normal = v3.unit(v3.cross(t0, Math.abs(t0[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
  // The ring is a polygon: widen it so its area equals the round section's (true volume).
  radius *= Math.sqrt(Math.PI / ((sides / 2) * Math.sin((2 * Math.PI) / sides)));
  const rings = [];
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) {
      // Parallel transport: remove the part of the normal along the new tangent.
      const t = tangents[i];
      normal = v3.unit(v3.sub(normal, v3.mul(t, v3.dot(normal, t))));
    }
    const binormal = v3.cross(tangents[i], normal);
    rings.push(Array.from({ length: sides }, (_, k) => {
      const a = (2 * Math.PI * k) / sides;
      return v3.add(pts[i], v3.add(v3.mul(normal, radius * Math.cos(a)), v3.mul(binormal, radius * Math.sin(a))));
    }));
  }
  const tris = [];
  for (let i = 0; i < rings.length - 1; i++) {
    for (let k = 0; k < sides; k++) {
      const j = (k + 1) % sides;
      tris.push([rings[i][k], rings[i][j], rings[i + 1][j]], [rings[i][k], rings[i + 1][j], rings[i + 1][k]]);
    }
  }
  const first = rings[0];
  const last = rings[rings.length - 1];
  for (let k = 1; k < sides - 1; k++) {
    tris.push([first[0], first[k + 1], first[k]]);
    tris.push([last[0], last[k], last[k + 1]]);
  }
  return tris;
}

/** Path of a helix of `radius`, `pitch`, `turns` from z = 0 upwards. */
export function helixPath(radius, pitch, turns, perTurn = 48) {
  const count = Math.max(8, Math.ceil(turns * perTurn));
  return Array.from({ length: count + 1 }, (_, i) => {
    const t = (turns * 2 * Math.PI * i) / count;
    return [radius * Math.cos(t), radius * Math.sin(t), (pitch * t) / (2 * Math.PI)];
  });
}

const ellipsoidProfile = () => {
  const profile = arcPoints(0, 0, 1, 270, 450, 360 / ROUND_SEGMENTS).map((q) => [Math.max(0, q.x), q.y]);
  return [[0, -1], ...profile.slice(1, -1), [0, 1]];
};

const exactMesh = (entity) => { const tris = OCC_KINDS.has(entity.kind) ? occLocalMesh(entity) : null; return tris?.length ? tris : null; };

/** The solid's triangles in its own coordinates (before placement). */
export function localMesh(entity) {
  const p = entity.params;
  switch (entity.kind) {
    case 'box': return extrudePolygon([{ x: 0, y: 0 }, { x: p.length, y: 0 }, { x: p.length, y: p.width }, { x: 0, y: p.width }], 0, p.height);
    case 'cylinder': return revolve([[0, 0], [p.radius, 0], [p.radius, p.height], [0, p.height]], p.angle);
    case 'sphere': return revolve(ellipsoidProfile()).map((tri) => tri.map((q) => v3.mul(q, p.radius)));
    case 'cone': return revolve([[0, 0], [p.radius1, 0], [p.radius2, p.height], [0, p.height]]);
    case 'torus': return revolve(arcPoints(p.radius1, 0, p.radius2, 0, 360, 10).slice(0, -1).map((q) => [q.x, q.y]));
    case 'tube': return revolve([[p.inner, 0], [p.outer, 0], [p.outer, p.height], [p.inner, p.height]]);
    case 'wedge': {
      // A ramp in x–z (full length at the bottom, `topLength` at the top), `width` deep along y.
      const profile = [{ x: 0, y: 0 }, { x: p.length, y: 0 }, { x: p.topLength, y: p.height }, { x: 0, y: p.height }];
      if (p.topLength <= 1e-9) profile.splice(2, 1);
      return extrudePolygon(profile, 0, p.width).map((tri) => tri.map(([x, z, y]) => [x, y, z]).reverse());
    }
    case 'prism': {
      const points = Array.from({ length: p.sides }, (_, i) => ({ x: p.radius * Math.cos((2 * Math.PI * i) / p.sides), y: p.radius * Math.sin((2 * Math.PI * i) / p.sides) }));
      return extrudePolygon(points, 0, p.height);
    }
    case 'ellipsoid':
      return revolve(ellipsoidProfile()).map((tri) => tri.map(([x, y, z]) => [x * p.radius2, y * p.radius3, z * p.radius1]));
    case 'helix': return sweepMesh(helixPath(p.radius, p.pitch, p.turns, 36), p.wire, 16);
    case 'pad': return (entity.shape?.shapes ?? []).flatMap((shape) => (p.taper ? taperedExtrude(shape, p.height, p.taper) ?? [] : extrudePolygon(shape.outer, 0, p.height, shape.holes)));
    case 'hole': return revolve(holeProfile(p));
    case 'robot': return robotMesh([p.a1, p.a2, p.a3, p.a4, p.a5, p.a6], { reach: p.reach, tool: p.tool });
    case 'surface': {
      if (!hasShape(entity)) return [];
      const s = entity.shape;
      const mode = SURFACE_MODES[p.mode] ?? 'ruled';
      const open = mode === 'fill' ? fillSurface(s.outer ?? [], s.holes ?? [], p.bulge) : mode === 'extrude' ? (s.paths ?? []).flatMap((path) => extrudedCurve(path, p.height)) : sectionSurface(s.curves ?? [], p.height, LOFT_MODES[p.smooth] === 'smooth');
      return p.thickness > 0 ? thicken(open, p.thickness) : open;
    }
    case 'revolution': {
      const profile = entity.shape?.profile ?? [];
      if (profile.length < 3) return [];
      const ccw = polygonArea(profile.map(([r, z]) => ({ x: r, y: z }))) > 0 ? profile : profile.slice().reverse();
      return revolve(ccw, p.angle);
    }
    case 'loft':
      if (!hasShape(entity)) return [];
      return entity.shape.sections ? loftSectionsMesh(entity.shape.sections, p.height, LOFT_MODES[p.mode] === 'smooth') : loftMesh(entity.shape.bottom, entity.shape.top, p.height);
    case 'sweep':
      if (!hasShape(entity)) return [];
      return entity.shape.section ? sweepSectionMesh(entity.shape.path, entity.shape.section) : sweepMesh(entity.shape.path, p.radius);
    case 'mesh': {
      const t = entity.shape?.tris ?? [];
      const out = [];
      for (let i = 0; i + 8 < t.length; i += 9) out.push([[t[i], t[i + 1], t[i + 2]], [t[i + 3], t[i + 4], t[i + 5]], [t[i + 6], t[i + 7], t[i + 8]]]);
      return out;
    }
    // Booleans and dress-ups: exact from the OpenCASCADE kernel when it is loaded, else the mesh kernel.
    case 'boolean': return hasShape(entity) ? exactMesh(entity) ?? booleanMesh(entity.shape) : [];
    case 'fillet': case 'chamfer': case 'thickness': case 'offset3d': case 'draft': return hasShape(entity) ? exactMesh(entity) ?? dressupMesh(entity) : [];
    default:
      if (PARTOP_KINDS.includes(entity.kind)) return hasShape(entity) ? exactMesh(entity) ?? partopLocalMesh(entity, { solidMesh, booleanMesh, meshVolume }) : [];
      return isArchKind(entity.kind) && hasShape(entity) ? archMesh(entity) : [];
  }
}

/**
 * A part of a boolean moved out into the drawing: its placement combined with
 * the boolean's (exact when the boolean is only moved, turned about z and
 * scaled; otherwise the part becomes a mesh in place).
 */
export function partInParent(part, parent) {
  const simple = !((parent.rx ?? 0) % 360) && !((parent.ry ?? 0) % 360) && !parent.flip;
  if (simple) {
    const s = parent.scale ?? 1;
    const a = ((parent.rz ?? 0) * Math.PI) / 180;
    const [x, y, z] = [part.x * s, part.y * s, part.z * s];
    return { ...part, x: x * Math.cos(a) - y * Math.sin(a) + (parent.x ?? 0), y: x * Math.sin(a) + y * Math.cos(a) + (parent.y ?? 0), z: z + (parent.z ?? 0), rz: (part.rz ?? 0) + (parent.rz ?? 0), scale: (part.scale ?? 1) * s };
  }
  const map = placement(parent);
  const tris = solidMesh(part).map((tri) => tri.map(map));
  return { type: 'solid', kind: 'mesh', name: part.name, params: {}, shape: { tris: flattenTriangles(parent.flip ? tris.map(([p, q, r]) => [p, r, q]) : tris) }, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, flip: false };
}

/** Booleans are recomputed only when their tree changes (moving the result keeps the cached mesh). */
const booleanCache = new Map();
function booleanMesh(shape) {
  const key = JSON.stringify(shape);
  if (booleanCache.has(key)) {
    const hit = booleanCache.get(key);
    booleanCache.delete(key);
    booleanCache.set(key, hit);
    return hit;
  }
  // BSP leaves slivers and hair-thin cracks where planes nearly touch: mend them so exports are watertight.
  const tris = repairMesh(booleanOf(shape.op, shape.parts.map((part) => solidMesh(part)))).triangles;
  booleanCache.set(key, tris);
  while (booleanCache.size > 24) booleanCache.delete(booleanCache.keys().next().value);
  return tris;
}

/** Triangles → the flat number list a mesh solid stores. */
export const flattenTriangles = (triangles) => triangles.flatMap((tri) => tri.flat());

// ───────────────────────── placement

const rad = (d) => (d * Math.PI) / 180;

/** Maps local points into the drawing: scale, mirror (flip y), rotate X → Y → Z, then move. */
export function placement(entity) {
  const s = entity.scale ?? 1;
  const [cx, sx] = [Math.cos(rad(entity.rx ?? 0)), Math.sin(rad(entity.rx ?? 0))];
  const [cy, sy] = [Math.cos(rad(entity.ry ?? 0)), Math.sin(rad(entity.ry ?? 0))];
  const [cz, sz] = [Math.cos(rad(entity.rz ?? 0)), Math.sin(rad(entity.rz ?? 0))];
  const flip = entity.flip ? -1 : 1;
  return ([x0, y0, z0]) => {
    let x = x0 * s;
    let y = y0 * s * flip;
    let z = z0 * s;
    [y, z] = [y * cx - z * sx, y * sx + z * cx];
    [x, z] = [x * cy + z * sy, -x * sy + z * cy];
    [x, y] = [x * cz - y * sz, x * sz + y * cz];
    return [x + (entity.x ?? 0), y + (entity.y ?? 0), z + (entity.z ?? 0)];
  };
}

let meshCache = new WeakMap();

/** Forgets every cached mesh (the OpenCASCADE kernel has come: booleans and dress-ups become exact). */
export function resetSolidCaches() { meshCache = new WeakMap(); groupCache = new WeakMap(); }

/** Triangles of a solid entity in drawing coordinates (outward facing). Cached per entity object. */
export function solidMesh(entity) {
  const cached = meshCache.get(entity);
  if (cached) return cached;
  const map = placement(entity);
  let tris = localMesh(entity).map((tri) => tri.map(map));
  // A mirrored solid turns inside out: restore the winding.
  if (entity.flip) tris = tris.map(([a, b, c]) => [a, c, b]);
  if (entity.components) tris = componentMesh(tris, entity.components.parts);
  meshCache.set(entity, tris);
  return tris;
}

/** Arch_Add / Arch_Remove: a component's own shape fused with its additions, its subtractions cut away (drawing coordinates). */
function componentMesh(own, parts) {
  const add = parts.add.map((p) => solidMesh(p)).filter((m) => m.length);
  const sub = parts.sub.map((p) => solidMesh(p)).filter((m) => m.length);
  if (!add.length && !sub.length) return own;
  const key = JSON.stringify(parts) + own.length + JSON.stringify(own[0] ?? null);
  const hit = booleanCache.get(key);
  if (hit) return hit;
  let tris = add.length ? booleanOf('union', [own, ...add]) : own;
  if (sub.length) tris = booleanOf('cut', [tris, ...sub]);
  tris = repairMesh(tris).triangles;
  booleanCache.set(key, tris);
  while (booleanCache.size > 24) booleanCache.delete(booleanCache.keys().next().value);
  return tris;
}

let groupCache = new WeakMap();

/**
 * A solid's triangles in drawing coordinates by material, for the 3D view:
 * [{ material: 'main' | 'glass' | 'wood' | 'metal' | 'space', tris }]. Arch
 * objects have several (glass in windows, wooden frames…), other solids one.
 */
export function solidMeshGroups(entity) {
  if (!isArchKind(entity.kind) || entity.components) return [{ material: 'main', tris: solidMesh(entity) }];
  const cached = groupCache.get(entity);
  if (cached) return cached;
  const map = placement(entity);
  const groups = hasShape(entity) ? Object.entries(archGroups(entity)).filter(([, tris]) => tris.length).map(([material, tris]) => {
    let out = tris.map((tri) => tri.map(map));
    if (entity.flip) out = out.map(([a, b, c]) => [a, c, b]);
    return { material, tris: out };
  }) : [];
  groupCache.set(entity, groups);
  return groups;
}

/** The closed blocks of a solid in drawing coordinates (one for most solids; a BIM object's parts). */
export function solidBlocks(entity) {
  if (!isArchKind(entity.kind) || !hasShape(entity)) return [solidMesh(entity)];
  const map = placement(entity);
  return archBlocks(entity).map((tris) => {
    const out = tris.map((tri) => tri.map(map));
    return entity.flip ? out.map(([a, b, c]) => [a, c, b]) : out;
  });
}

/** Top view (2D) of a solid: its outline as primitives. */
export function solidFootprint(entity) {
  const p = entity.params;
  const level = !((entity.rx ?? 0) % 360) && !((entity.ry ?? 0) % 360);
  const map = placement(entity);
  const flat = (points) => points.map((q) => { const [x, y] = map([q.x, q.y, 0]); return { x, y }; });
  const s = entity.scale ?? 1;
  const c = { x: entity.x ?? 0, y: entity.y ?? 0 };
  const circle = (r, extra = {}) => ({ kind: 'circle', c, r: r * s, ...extra });
  const cross = (r) => [
    { kind: 'line', a: { x: c.x - r * s * 1.15, y: c.y }, b: { x: c.x + r * s * 1.15, y: c.y }, lineType: 'center' },
    { kind: 'line', a: { x: c.x, y: c.y - r * s * 1.15 }, b: { x: c.x, y: c.y + r * s * 1.15 }, lineType: 'center' },
  ];
  const loop = (points) => ({ kind: 'poly', points: flat(points), closed: true });
  const ngon = (r, n) => Array.from({ length: n }, (_, i) => ({ x: r * Math.cos((2 * Math.PI * i) / n), y: r * Math.sin((2 * Math.PI * i) / n) }));
  if (level && isArchKind(entity.kind)) return hasShape(entity) ? placePrimitives(archPlan(entity), entity) : [];
  if (level && DRESSUP_KINDS.includes(entity.kind)) return hasShape(entity) ? placePrimitives(dressupOutlines(entity).map((points) => ({ kind: 'poly', points, closed: true })), entity) : [];
  if (level) {
    switch (entity.kind) {
      case 'box': return [loop([{ x: 0, y: 0 }, { x: p.length, y: 0 }, { x: p.length, y: p.width }, { x: 0, y: p.width }])];
      case 'cylinder': return p.angle >= 359.999 ? [circle(p.radius), ...cross(p.radius)] : [loop([{ x: 0, y: 0 }, ...arcPoints(0, 0, p.radius, 0, p.angle, 5)])];
      case 'sphere': return [circle(p.radius), ...cross(p.radius)];
      case 'cone': {
        const big = Math.max(p.radius1, p.radius2);
        const small = Math.min(p.radius1, p.radius2);
        return [circle(big), ...(small > 0 ? [circle(small)] : []), ...cross(big)];
      }
      case 'torus': return [circle(p.radius1 + p.radius2), circle(p.radius1 - p.radius2), circle(p.radius1, { lineType: 'center' }), ...cross(p.radius1 + p.radius2)];
      case 'tube': return [circle(p.outer), circle(p.inner), ...cross(p.outer)];
      case 'helix': return [circle(p.radius + p.wire), circle(p.radius - p.wire), circle(p.radius, { lineType: 'center' }), ...cross(p.radius + p.wire)];
      case 'prism': return [loop(ngon(p.radius, p.sides)), ...cross(p.radius)];
      case 'ellipsoid': return [loop(ngon(1, 72).map((q) => ({ x: q.x * p.radius2, y: q.y * p.radius3 }))), ...cross(Math.max(p.radius2, p.radius3))];
      case 'wedge': {
        const [a, b] = flat([{ x: p.topLength, y: 0 }, { x: p.topLength, y: p.width }]);
        return [loop([{ x: 0, y: 0 }, { x: p.length, y: 0 }, { x: p.length, y: p.width }, { x: 0, y: p.width }]), { kind: 'line', a, b }];
      }
      case 'pad': return (entity.shape?.shapes ?? []).flatMap((shape) => [shape.outer, ...shape.holes].map(loop));
      case 'loft': return hasShape(entity) ? (entity.shape.sections ?? [entity.shape.bottom, entity.shape.top]).map(loop) : [];
      default: break;
    }
  }
  if (entity.kind === 'points') {
    // Seen from above: the outline round the cloud (dashed) and a dot for every point (at most 3000).
    const pts = solidPoints(entity);
    const hull = convexHull(pts.map(([x, y]) => ({ x, y })));
    const step = Math.max(1, Math.ceil(pts.length / 3000));
    const box = meshBox([pts.map((p) => [...p])]);
    const r = Math.max(box.size[0], box.size[1], 1) / 800;
    const dots = pts.filter((_, i) => i % step === 0).map(([x, y]) => ({ kind: 'circle', c: { x, y }, r }));
    return [...(hull.length >= 3 ? [{ kind: 'poly', points: hull, closed: true, lineType: 'dashed' }] : []), ...dots];
  }
  // Tilted, revolved, swept and mesh solids: the outline of all their corners seen from above.
  const hull = convexHull(solidMesh(entity).flat().map(([x, y]) => ({ x, y })));
  return hull.length >= 3 ? [{ kind: 'poly', points: hull, closed: true }] : [];
}

/** The points of a point cloud in the drawing ([[x, y, z]]). */
export function solidPoints(entity) {
  const pts = entity.shape?.pts ?? [];
  const map = placement(entity);
  const out = [];
  for (let i = 0; i + 2 < pts.length; i += 3) out.push(map([pts[i], pts[i + 1], pts[i + 2]]));
  return out;
}

/** Plan primitives (local) moved into the drawing by a level solid's placement (scale, mirror, turn about z, move). */
export function placePrimitives(prims, entity) {
  const map = placement(entity);
  const at = (p) => { const [x, y] = map([p.x, p.y, 0]); return { x, y }; };
  const s = entity.scale ?? 1;
  const turn = (entity.rz ?? 0);
  return prims.map((prim) => {
    switch (prim.kind) {
      case 'line': return { ...prim, a: at(prim.a), b: at(prim.b) };
      case 'poly': case 'fill': return { ...prim, points: prim.points.map(at), ...(prim.holes ? { holes: prim.holes.map((hole) => hole.map(at)) } : {}) };
      case 'circle': return { ...prim, c: at(prim.c), r: prim.r * s };
      case 'text': return { ...prim, p: at(prim.p), size: prim.size * s, angle: (prim.angle ?? 0) + turn };
      default: return prim;
    }
  });
}

export function convexHull(points) {
  const pts = [...new Map(points.map((p) => [`${p.x.toFixed(6)},${p.y.toFixed(6)}`, p])).values()].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  const upper = [];
  for (const p of pts.slice().reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

// ───────────────────────── measurements

/** Volume (mm³) of a closed mesh. */
export function meshVolume(triangles) {
  let volume = 0;
  for (const [a, b, c] of triangles) volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  return volume;
}

/** Surface area (mm²) of a mesh. */
export function meshArea(triangles) {
  let area = 0;
  for (const [a, b, c] of triangles) area += Math.hypot(...v3.cross(v3.sub(b, a), v3.sub(c, a))) / 2;
  return area;
}

export function meshBox(triangles) {
  if (!triangles.length) return null;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const tri of triangles) for (const p of tri) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
  return { min, max, size: max.map((v, k) => v - min[k]) };
}

/** Exact volume of a primitive (null for meshes, which are measured). */
export function exactVolume(entity) {
  const p = entity.params;
  const PI = Math.PI;
  const s = (entity.scale ?? 1) ** 3;
  const formula = {
    box: () => p.length * p.width * p.height,
    cylinder: () => PI * p.radius ** 2 * p.height * (p.angle / 360),
    sphere: () => (4 / 3) * PI * p.radius ** 3,
    cone: () => (PI * p.height * (p.radius1 ** 2 + p.radius1 * p.radius2 + p.radius2 ** 2)) / 3,
    torus: () => 2 * PI ** 2 * p.radius1 * p.radius2 ** 2,
    tube: () => PI * (p.outer ** 2 - p.inner ** 2) * p.height,
    wedge: () => ((p.length + p.topLength) / 2) * p.height * p.width,
    prism: () => (p.sides / 2) * p.radius ** 2 * Math.sin((2 * PI) / p.sides) * p.height,
    ellipsoid: () => (4 / 3) * PI * p.radius1 * p.radius2 * p.radius3,
    hole: () => holeVolume(p),
    pad: () => (p.taper ? null : (entity.shape?.shapes ?? []).reduce((sum, shape) => sum + Math.abs(polygonArea(shape.outer)) - shape.holes.reduce((h, hole) => h + Math.abs(polygonArea(hole)), 0), 0) * p.height),
  }[entity.kind];
  const v = formula ? formula() : null;
  return v === null || v === undefined ? null : v * s;
}

/** What the properties panel shows about a solid. */
export function solidProperties(entity) {
  const tris = solidMesh(entity);
  const box = meshBox(tris);
  return {
    ...(isArchKind(entity.kind) ? archQuantities(entity) : {}),
    ...(() => { const exact = OCC_KINDS.has(entity.kind) ? occProperties(entity) : null; return { volume: (entity.components ? null : exactVolume(entity)) ?? exact?.volume ?? Math.abs(meshVolume(tris)), area: exact?.area ?? meshArea(tris) }; })(),
    triangles: tris.length,
    ...(box ? { sizeX: box.size[0], sizeY: box.size[1], sizeZ: box.size[2] } : {}),
  };
}

// ───────────────────────── sections and projections (Part Section, TechDraw-like views)

/** Cuts a mesh with the plane z = level: the outline segments as [[a, b]] (2D points). */
export function sectionAt(triangles, level) {
  const segments = [];
  for (const tri of triangles) {
    const d = tri.map((p) => p[2] - level);
    const cut = [];
    for (let i = 0; i < 3; i++) {
      const a = tri[i];
      const b = tri[(i + 1) % 3];
      const da = d[i];
      const db = d[(i + 1) % 3];
      if ((da < 0 && db >= 0) || (da >= 0 && db < 0)) {
        const t = da / (da - db);
        cut.push({ x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t });
      }
    }
    if (cut.length === 2) segments.push(cut);
  }
  return segments;
}

/** Joins segments into chains (closed loops when the ends meet). */
export function joinSegments(segments, tolerance = 1e-6) {
  const key = (p) => `${Math.round(p.x / tolerance)},${Math.round(p.y / tolerance)}`;
  const byEnd = new Map();
  segments.forEach((segment, i) => {
    for (const end of [0, 1]) {
      const k = key(segment[end]);
      if (!byEnd.has(k)) byEnd.set(k, []);
      byEnd.get(k).push([i, end]);
    }
  });
  const used = new Set();
  const chains = [];
  for (let i = 0; i < segments.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    const chain = [segments[i][0], segments[i][1]];
    for (;;) {
      const next = (byEnd.get(key(chain[chain.length - 1])) ?? []).find(([j]) => !used.has(j));
      if (!next) break;
      used.add(next[0]);
      chain.push(segments[next[0]][1 - next[1]]);
    }
    const closed = chain.length > 3 && key(chain[0]) === key(chain[chain.length - 1]);
    if (closed) chain.pop();
    chains.push({ points: chain, closed });
  }
  return chains;
}

/** Directions of the standard views: maps a 3D point to the 2D view plane (isometric from front-right-top, like FreeCAD). */
export const VIEW_AXES = {
  top: ([x, y]) => ({ x, y }),
  front: ([x, , z]) => ({ x, y: z }),
  right: ([, y, z]) => ({ x: y, y: z }),
  iso: ([x, y, z]) => ({ x: (x + y) * Math.cos(Math.PI / 6), y: z + (y - x) * 0.5 }),
};
/** Unit vector from the model towards the viewer, per view. */
export const VIEW_DIRS = { top: [0, 0, 1], front: [0, -1, 0], right: [1, 0, 0], iso: v3.unit([1, -1, 1]) };

/** Welded mesh: shared vertices, face normals and the faces around each vertex. */
function weld(triangles) {
  const keyOf = (p) => `${Math.round(p[0] * 1e5)},${Math.round(p[1] * 1e5)},${Math.round(p[2] * 1e5)}`;
  const index = new Map();
  const points = [];
  const faces = triangles.map((tri) => tri.map((p) => {
    const k = keyOf(p);
    if (!index.has(k)) { index.set(k, points.length); points.push(p); }
    return index.get(k);
  }));
  const normals = triangles.map(([a, b, c]) => v3.cross(v3.sub(b, a), v3.sub(c, a)));
  const around = points.map(() => []);
  faces.forEach((face, f) => face.forEach((v) => around[v].push(f)));
  return { points, faces, normals, around };
}

/**
 * The lines of a TechDraw-like view of a mesh: sharp edges (dihedral angle
 * over `sharpAngle`), open borders and smooth silhouettes (where the surface
 * turns away from the viewer, found from interpolated vertex normals, so
 * curved solids get smooth outlines). With `hidden`, every piece of line is
 * tested against the mesh and marked `.hidden = true` when something is in
 * front of it. Returns [[a, b]] 2D segments.
 */
export function projectEdges(triangles, view = 'front', { sharpAngle = 30, hidden = false } = {}) {
  // A named view, or any direction (TechDraw_ActiveView): { dir (towards the viewer), u, v (the drawing's x and y) }.
  const project = typeof view === 'string' ? VIEW_AXES[view] : (p) => ({ x: v3.dot(p, view.u), y: v3.dot(p, view.v) });
  const dir = typeof view === 'string' ? VIEW_DIRS[view] : view.dir;
  const { points, faces, normals, around } = weld(triangles);
  const unit = normals.map((n) => v3.unit(n));
  const cos = Math.cos(rad(sharpAngle));
  const lines = [];
  // Sharp and border edges.
  const edges = new Map();
  faces.forEach((face, f) => {
    for (let i = 0; i < 3; i++) {
      const a = face[i];
      const b = face[(i + 1) % 3];
      const k = a < b ? `${a},${b}` : `${b},${a}`;
      if (!edges.has(k)) edges.set(k, { a, b, faces: [] });
      edges.get(k).faces.push(f);
    }
  });
  for (const edge of edges.values()) {
    const [f, g] = edge.faces;
    if (g === undefined || edge.faces.length > 2 || v3.dot(unit[f], unit[g]) < cos) lines.push(Object.assign([points[edge.a], points[edge.b]], { faces: edge.faces }));
  }
  // Smooth silhouettes: per-corner normals averaged over the smooth neighbourhood.
  const cornerNormal = (f, v) => {
    let n = [0, 0, 0];
    for (const g of around[v]) if (v3.dot(unit[g], unit[f]) >= cos) n = v3.add(n, normals[g]);
    return v3.unit(n);
  };
  faces.forEach((face, f) => {
    const g = face.map((v) => v3.dot(cornerNormal(f, v), dir));
    if (g.every((x) => x > 0) || g.every((x) => x < 0)) return;
    const cut = [];
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      if ((g[i] > 0) !== (g[j] > 0)) {
        const t = g[i] / (g[i] - g[j]);
        const a = points[face[i]];
        const b = points[face[j]];
        cut.push(v3.add(a, v3.mul(v3.sub(b, a), t)));
      }
    }
    if (cut.length === 2 && Math.hypot(...v3.sub(cut[0], cut[1])) > 1e-9) lines.push(Object.assign(cut, { faces: [f], smooth: true }));
  });
  if (!hidden) return lines.map(([a, b]) => [project(a), project(b)]).filter(([a, b]) => Math.hypot(a.x - b.x, a.y - b.y) > 1e-9);
  // Hidden-line test: triangles in a grid of the view plane, depth along the view direction.
  const tris = faces.map((face) => face.map((v) => points[v]));
  const flat = tris.map((tri) => tri.map(project));
  const depth = (p) => v3.dot(p, dir);
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  for (const tri of flat) for (const p of tri) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  const size = Math.max(maxX - minX, maxY - minY, 1e-9);
  const N = Math.max(8, Math.min(96, Math.ceil(Math.sqrt(tris.length))));
  const cellW = (maxX - minX) / N || 1;
  const cellH = (maxY - minY) / N || 1;
  const grid = Array.from({ length: N * N }, () => []);
  const cellOf = (x, y) => [Math.min(N - 1, Math.max(0, Math.floor((x - minX) / cellW))), Math.min(N - 1, Math.max(0, Math.floor((y - minY) / cellH)))];
  flat.forEach((tri, t) => {
    const [x0, y0] = cellOf(Math.min(tri[0].x, tri[1].x, tri[2].x), Math.min(tri[0].y, tri[1].y, tri[2].y));
    const [x1, y1] = cellOf(Math.max(tri[0].x, tri[1].x, tri[2].x), Math.max(tri[0].y, tri[1].y, tri[2].y));
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) grid[y * N + x].push(t);
  });
  const eps = size * 1e-3;
  // A line is never hidden by its own faces; a smooth silhouette not by the
  // two rings of faces round it either (there the surface is almost edge-on
  // and its own facets would hide it). The rings stay on that smooth surface:
  // a coarse exact mesh's big planar faces touch it too and must still hide.
  const ringOf = (sources, rings) => {
    let set = new Set(sources);
    for (let k = 0; k < rings; k++) set = new Set([...set].flatMap((f) => faces[f].flatMap((v) => around[v].filter((g) => v3.dot(unit[g], unit[f]) >= cos))));
    return set;
  };
  const occluded = (q, skip) => {
    const p = project(q);
    const d = depth(q);
    const [cx, cy] = cellOf(p.x, p.y);
    for (const t of grid[cy * N + cx]) {
      const [a, b, c] = flat[t];
      const det = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
      if (Math.abs(det) < 1e-14) continue;
      const l1 = ((b.y - c.y) * (p.x - c.x) + (c.x - b.x) * (p.y - c.y)) / det;
      const l2 = ((c.y - a.y) * (p.x - c.x) + (a.x - c.x) * (p.y - c.y)) / det;
      const l3 = 1 - l1 - l2;
      if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
      const [A, B, C] = tris[t];
      if (l1 * depth(A) + l2 * depth(B) + l3 * depth(C) > d + eps && !skip.has(t)) return true;
    }
    return false;
  };
  const out = [];
  const step = size / 120;
  for (const line of lines) {
    const [a, b] = line;
    const skip = line.smooth ? ringOf(line.faces, 2) : new Set(line.faces);
    const length = Math.hypot(...v3.sub(b, a));
    const n = Math.max(1, Math.ceil(length / step));
    let start = a;
    let state = null;
    for (let i = 0; i < n; i++) {
      const p0 = v3.add(a, v3.mul(v3.sub(b, a), i / n));
      const p1 = v3.add(a, v3.mul(v3.sub(b, a), (i + 1) / n));
      const now = occluded(v3.mul(v3.add(p0, p1), 0.5), skip);
      if (state === null) { state = now; start = p0; } else if (now !== state) {
        const seg = [project(start), project(p0)];
        seg.hidden = state;
        out.push(seg);
        state = now;
        start = p0;
      }
    }
    const seg = [project(start), project(b)];
    seg.hidden = state;
    out.push(seg);
  }
  // A hidden line lying on a visible one is not drawn (visible lines take priority).
  const visible = out.filter((seg) => !seg.hidden);
  const tol = size * 2e-3;
  const vgrid = new Map();
  const vkey = (x, y) => `${Math.floor(x / (size / 40))},${Math.floor(y / (size / 40))}`;
  visible.forEach((seg, i) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(seg[1].x - seg[0].x, seg[1].y - seg[0].y) / (size / 80)));
    for (let k = 0; k <= steps; k++) {
      const x = seg[0].x + ((seg[1].x - seg[0].x) * k) / steps;
      const y = seg[0].y + ((seg[1].y - seg[0].y) * k) / steps;
      const key = vkey(x, y);
      if (!vgrid.has(key)) vgrid.set(key, new Set());
      vgrid.get(key).add(i);
    }
  });
  const onVisible = (p) => {
    for (const i of vgrid.get(vkey(p.x, p.y)) ?? []) {
      const [a, b] = visible[i];
      const dx = b.x - a.x; const dy = b.y - a.y;
      const l2 = dx * dx + dy * dy || 1e-18;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
      if (Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y) <= tol) return true;
    }
    return false;
  };
  return out.filter((seg) => {
    const [p, q] = seg;
    if (Math.hypot(p.x - q.x, p.y - q.y) <= 1e-9) return false;
    if (!seg.hidden) return true;
    return ![0.25, 0.5, 0.75].every((k) => onVisible({ x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k }));
  });
}

/** Front-facing triangles of a mesh in a view, far to near, with a light value 0…1 (for shaded previews). */
export function shadedView(triangles, view = 'iso', light = [-0.35, -0.55, 0.76]) {
  const project = VIEW_AXES[view];
  const dir = VIEW_DIRS[view];
  const L = v3.unit(light);
  const out = [];
  for (const tri of triangles) {
    const n = v3.unit(v3.cross(v3.sub(tri[1], tri[0]), v3.sub(tri[2], tri[0])));
    if (v3.dot(n, dir) <= 0) continue;
    const centre = v3.mul(v3.add(v3.add(tri[0], tri[1]), tri[2]), 1 / 3);
    out.push({ points: tri.map(project), depth: v3.dot(centre, dir), light: 0.25 + 0.75 * Math.max(0, v3.dot(n, L)) });
  }
  return out.sort((a, b) => a.depth - b.depth);
}

/** Bounding box of the triangles of a list of solids (3D). */
export function boxOfSolids(entities) {
  return meshBox(entities.flatMap((entity) => solidMesh(entity)));
}

export { bboxOf };

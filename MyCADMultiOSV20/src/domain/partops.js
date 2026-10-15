// FreeCAD Part / PartDesign shape operations as solid kinds: Compound,
// Boolean Fragments, Slice, Compound Filter, Mirror, Scale, Refine, Reverse,
// the PartDesign patterns (linear, polar, mirrored, multi-transform), 3D wires
// (curves in space) and datums (planes, lines, points, coordinate systems).
// Children are solid data in the operation's own coordinates (as boolean parts).
// With the OpenCASCADE kernel these are exact (occ.js); the meshes here are
// the fallback and the view of the kinds the kernel does not need.
import { rotationOf, transformPlacement } from './transform3d.js';

const num = (key, def, min, max, step = 1, unit = 'mm') => ({ key, type: 'number', def, min, max, step, unit });
const int = (key, def, min, max) => ({ key, type: 'int', def, min, max, step: 1, unit: '' });
const choice = (key, options, def = 0) => ({ key, type: 'choice', options, def, min: 0, max: options.length - 1, step: 1, unit: '' });

export const MIRROR_PLANES = ['yz', 'xz', 'xy'];
export const PATTERN_MODES = ['linear', 'polar', 'mirror', 'multi'];
export const AXES = ['x', 'y', 'z'];
export const DATUM_TYPES = ['plane', 'line', 'point', 'csys'];

export const PARTOP_KINDS = ['compound', 'fragments', 'slice', 'compoundFilter', 'mirror3d', 'scale3d', 'refine', 'reverse', 'pattern', 'wire3d', 'datum'];

export const PARTOP_PARAMS = {
  compound: [],
  fragments: [],
  slice: [],
  compoundFilter: [int('from', 0, 0, 10000), int('to', 10000, 0, 10000), num('minVolume', 0, 0, 1e15, 1, 'mm³')],
  mirror3d: [choice('plane', MIRROR_PLANES), num('offset', 0, -1e6, 1e6)],
  scale3d: [num('sx', 1, 0.0001, 10000, 0.1, '×'), num('sy', 1, 0.0001, 10000, 0.1, '×'), num('sz', 1, 0.0001, 10000, 0.1, '×')],
  refine: [],
  reverse: [],
  // PartDesign patterns. linear: count copies along (dx, dy, dz) over `length`; polar: count about an axis over `angle`;
  // mirror: the base and its mirror image; multi: linear then polar (FreeCAD MultiTransform).
  pattern: [choice('mode', PATTERN_MODES), int('count', 3, 1, 1000), num('length', 50, -1e6, 1e6), num('dx', 1, -1, 1, 0.1, ''), num('dy', 0, -1, 1, 0.1, ''), num('dz', 0, -1, 1, 0.1, ''),
    int('count2', 4, 1, 1000), num('angle', 360, -360, 360, 15, '°'), choice('axis', AXES, 2), num('cx', 0, -1e6, 1e6), num('cy', 0, -1e6, 1e6), choice('plane', MIRROR_PLANES)],
  wire3d: [],
  datum: [choice('type', DATUM_TYPES), num('size', 50, 0.1, 1e6)],
};

const point3 = (p) => [Number(p?.[0]) || 0, Number(p?.[1]) || 0, Number(p?.[2]) || 0];

/** Repairs the shape data of a part operation. */
export function normalizePartopShape(kind, raw, normalizeSolidData) {
  const list = (value) => (Array.isArray(value) ? value : []).map(normalizeSolidData).filter(Boolean);
  switch (kind) {
    case 'compound': case 'fragments': return { parts: list(raw?.parts) };
    case 'slice': return { base: normalizeSolidData(raw?.base), tools: list(raw?.tools) };
    case 'compoundFilter': case 'mirror3d': case 'scale3d': case 'refine': case 'reverse': case 'pattern': return { base: normalizeSolidData(raw?.base) };
    case 'wire3d': return { paths: (Array.isArray(raw?.paths) ? raw.paths : []).map((path) => (Array.isArray(path) ? path.map(point3) : [])).filter((path) => path.length >= 2) };
    case 'datum': return {};
    default: return {};
  }
}

/** An attachment (FreeCAD Attacher) of any solid: { mode, refs: [{ id, kind, signature }], offset }, or null. */
export function normalizeAttach(raw) {
  const refs = Array.isArray(raw?.refs) ? raw.refs.filter((r) => typeof r?.id === 'string' && ['face', 'edge', 'vertex', 'object'].includes(r.kind)).map((r) => ({ id: r.id, kind: r.kind, ...(r.signature && typeof r.signature === 'object' ? { signature: r.signature } : {}) })) : [];
  return refs.length ? { mode: typeof raw.mode === 'string' ? raw.mode : 'flat', refs, offset: point3(raw.offset) } : null;
}

/** Is there enough to build it? */
export function hasPartopShape(kind, shape) {
  switch (kind) {
    case 'compound': return (shape?.parts?.length ?? 0) >= 1;
    case 'fragments': return (shape?.parts?.length ?? 0) >= 2;
    case 'slice': return Boolean(shape?.base) && (shape?.tools?.length ?? 0) >= 1;
    case 'wire3d': return (shape?.paths?.length ?? 0) >= 1;
    case 'datum': return true;
    default: return Boolean(shape?.base);
  }
}

const flipTri = ([a, b, c]) => [a, c, b];

/** The copies of a pattern (solid data, the base moved and turned), in the pattern's coordinates. */
export function patternCopies(entity) {
  const p = entity.params;
  const base = entity.shape?.base;
  if (!base) return [];
  const mode = PATTERN_MODES[p.mode] ?? 'linear';
  const linear = (copy, i, n) => {
    const d = [p.dx, p.dy, p.dz];
    const l = Math.hypot(...d) || 1;
    const step = n > 1 ? p.length / (n - 1) : 0;
    return { ...copy, x: (copy.x ?? 0) + (d[0] / l) * step * i, y: (copy.y ?? 0) + (d[1] / l) * step * i, z: (copy.z ?? 0) + (d[2] / l) * step * i };
  };
  const polar = (copy, i, n) => {
    const full = Math.abs(Math.abs(p.angle) - 360) < 1e-9;
    const step = n > 1 ? p.angle / (full ? n : n - 1) : 0;
    const axis = AXES[p.axis] ?? 'z';
    const R = rotationOf({ [`r${axis}`]: step * i });
    const c = [p.cx, p.cy, 0];
    const rc = [0, 1, 2].map((r) => R[r][0] * c[0] + R[r][1] * c[1] + R[r][2] * c[2]);
    return { ...copy, ...transformPlacement(copy, R, c.map((v, k) => v - rc[k])) };
  };
  if (mode === 'linear') return Array.from({ length: p.count }, (_, i) => linear(base, i, p.count));
  if (mode === 'polar') return Array.from({ length: p.count2 }, (_, i) => polar(base, i, p.count2));
  if (mode === 'multi') return Array.from({ length: p.count }, (_, i) => linear(base, i, p.count)).flatMap((copy) => Array.from({ length: p.count2 }, (_, j) => polar(copy, j, p.count2)));
  return [base, { ...base, mirrored: MIRROR_PLANES[p.plane] ?? 'yz' }];
}

/** Mirrors triangles in a coordinate plane at an offset (the winding turned back outward). */
export function mirrorTriangles(tris, plane, offset = 0) {
  const axis = plane === 'yz' ? 0 : plane === 'xz' ? 1 : 2;
  return tris.map((tri) => flipTri(tri.map((q) => { const out = [...q]; out[axis] = 2 * offset - q[axis]; return out; })));
}

/** Connected pieces of a mesh (triangles sharing points). */
export function meshPieces(tris) {
  const key = (q) => `${Math.round(q[0] * 1e4)},${Math.round(q[1] * 1e4)},${Math.round(q[2] * 1e4)}`;
  const parent = tris.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const owner = new Map();
  tris.forEach((tri, i) => { for (const q of tri) { const k = key(q); if (owner.has(k)) parent[find(i)] = find(owner.get(k)); else owner.set(k, i); } });
  const groups = new Map();
  tris.forEach((tri, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(tri); });
  return [...groups.values()];
}

/**
 * The triangles of a part operation in its own coordinates (the mesh fallback).
 * helpers: { solidMesh, booleanMesh, meshVolume }.
 */
export function partopLocalMesh(entity, { solidMesh, booleanMesh, meshVolume }) {
  const p = entity.params;
  const s = entity.shape ?? {};
  switch (entity.kind) {
    case 'compound': return (s.parts ?? []).flatMap((part) => solidMesh(part));
    case 'fragments': return (s.parts?.length ?? 0) >= 2 ? booleanMesh({ op: 'union', parts: s.parts }) : [];
    case 'slice': return s.base ? solidMesh(s.base) : [];
    case 'compoundFilter': {
      if (!s.base) return [];
      const pieces = meshPieces(solidMesh(s.base));
      return pieces.filter((piece, i) => i >= p.from && i <= p.to && Math.abs(meshVolume(piece)) >= p.minVolume).flat();
    }
    case 'mirror3d': return s.base ? mirrorTriangles(solidMesh(s.base), MIRROR_PLANES[p.plane] ?? 'yz', p.offset) : [];
    case 'scale3d': {
      if (!s.base) return [];
      const k = [p.sx, p.sy, p.sz];
      const tris = solidMesh(s.base).map((tri) => tri.map((q) => q.map((v, i) => v * k[i])));
      return k[0] * k[1] * k[2] < 0 ? tris.map(flipTri) : tris;
    }
    case 'refine': return s.base ? solidMesh(s.base) : [];
    case 'reverse': return s.base ? solidMesh(s.base).map(flipTri) : [];
    case 'pattern': {
      const copies = patternCopies(entity);
      const meshes = copies.map((copy) => (copy.mirrored ? mirrorTriangles(solidMesh({ ...copy, mirrored: undefined }), copy.mirrored, 0) : solidMesh(copy)));
      if (meshes.length < 2) return meshes[0] ?? [];
      return booleanMesh({ op: 'union', parts: meshes.map((tris) => ({ type: 'solid', kind: 'mesh', params: {}, shape: { tris: tris.flat(2) }, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, flip: false })) });
    }
    default: return [];
  }
}

/** The pieces of a sliced or fragmented solid as separate meshes (Part_SliceApart, exploding a compound). */
export const piecesOf = (tris) => meshPieces(tris);

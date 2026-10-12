// Depth rules against flicker (z-fighting) while the camera moves.
//
// Two surfaces at (nearly) the same depth win pixel by pixel in turn, and the
// pattern changes with every step of an orbit or zoom. A building is full of
// such pairs: a slab edge in the plane of the wall face, a site mass at
// ground level, a floor finish 1 mm over its slab, a line on its own face.
// They are not mended one by one; three rules settle every pair:
//
//   1. Precision. The perspective camera's near plane is kept as far out as
//      the model allows, every frame (viewer.js fitNear): depth precision
//      grows with it, so surfaces millimetres apart are told apart from afar.
//   2. Rank. Surfaces in exactly the same plane cannot be told apart at any
//      precision, so every element kind has a rank: a higher rank is
//      pushed back a few depth steps (polygonOffset, scaled by slope as well;
//      a negative rank is pulled forward instead),
//      and of two coplanar faces the lower rank always wins (DEPTH_CLASS);
//      everything wins over the ground (GROUND_OFFSET).
//   3. Lines. Edges and wires lie on or inside their faces and take no
//      polygonOffset in WebGL: pullForward moves them a hair towards the
//      camera in the vertex shader.

// Every kind the builder tags is classified here (a unit test builds all the
// samples and fails on a kind this table does not name):
//  −1  roofs — they cover the walls whose tops reach up into their plane
//   0  elements that stand in, on or against the others — walls and what is
//      built into them, frames, stairs, furniture … (also the default)
//   1  horizontal plates they stand on or under — slabs, floors, ceilings
//   2  masses and site solids — the bulk everything else sits in or on
// Rank 0 keeps its own materials; the others are drawn with offset copies.
export const DEPTH_CLASS = {
  roofs: -1,
  walls: 0, openings: 0, curtain: 0, columns: 0, beams: 0, members: 0, stairs: 0, ramps: 0, railings: 0, furniture: 0,
  rooms: 1, slabs: 1, ceilings: 1,
  solids: 2,
};
export const rankOf = (kind) => DEPTH_CLASS[kind] || 0;

// polygonOffset per rank step: slope factor and constant units.
const RANK_FACTOR = 1, RANK_UNITS = 2;

// The material drawn with this rank's offset: the same object for rank 0, a
// cached copy otherwise (so meshes that share a material still share one,
// and batch.js still groups them).
const RANKED = new WeakMap(); // material → Map(rank → copy)
export function rankedMaterial(material, rank) {
  if (!rank || !material || Array.isArray(material)) return material;
  let byRank = RANKED.get(material);
  if (!byRank) RANKED.set(material, (byRank = new Map()));
  let m = byRank.get(rank);
  if (!m) {
    m = material.clone();
    m.polygonOffset = true;
    m.polygonOffsetFactor = (material.polygonOffset ? material.polygonOffsetFactor : 0) + RANK_FACTOR * rank;
    m.polygonOffsetUnits = (material.polygonOffset ? material.polygonOffsetUnits : 0) + RANK_UNITS * rank;
    m.userData = { ...material.userData, depthRank: rank, rankedFrom: material };
    byRank.set(rank, m);
  }
  return m;
}

// Behind every ranked surface: site slabs, yards and river beds often sit at
// ground level too.
export const GROUND_OFFSET = { polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 12 };

// Rule 3. The shift is constant in normalised depth, which is how the depth
// buffer's precision runs too: a few dozen steps of it near and far.
export const EDGE_DEPTH_PULL = 4e-6; // about 30 steps of a 24-bit buffer

export function pullForward(material, amount = EDGE_DEPTH_PULL) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", `#include <project_vertex>\n\tgl_Position.z -= ${amount.toExponential()} * gl_Position.w;`);
  };
  material.customProgramCacheKey = () => `pull${amount}`;
  return material;
}

// Rule 1. The nearest the near plane may be, in metres: half the free space
// in front of the camera — the distance to the model's box, or the height
// over the ground when that is less (the grid, the ground and the axes lie
// there) — and never under `min` (walking through rooms) or past `max`.
export function nearPlane({ boxDistance, groundHeight, min = 0.03, max = Infinity }) {
  let free = boxDistance;
  if (groundHeight > 0) free = Math.min(free, groundHeight);
  if (!(free > 0)) return min;
  return Math.max(min, Math.min(max, free * 0.5));
}

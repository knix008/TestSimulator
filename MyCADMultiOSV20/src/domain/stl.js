// 3D printing: the closed outlines of a drawing are extruded into a solid and
// written as STL (binary — the format every slicer reads).
//
// - Closed shapes (rectangles, circles, closed polylines, polygons, ellipses,
//   part outlines) are outlines; lines, arcs and open polylines whose ends meet
//   are joined into outlines too.
// - Outlines inside outlines become holes (and outlines inside holes become
//   islands again), so a flange plate prints with its bolt holes.
// - Centre lines, hidden lines, thread lines, dimensions and texts are ignored.
import { styleOf } from './drawing.js';
import { primitives } from './entities.js';
import { meshBox, solidMesh } from './solids.js';
import { triangulate } from './triangulate.js';
import { arcPoints, bboxOf, dist, pointInPolygon, polygonArea, sweep } from './geometry.js';

/** Line types that never form printable material. */
const SKIP_LINE_TYPES = new Set(['center', 'hidden', 'phantom', 'dotted']);

/** Segments for a full circle of radius r (chord error about 0.01 mm, 48…360 segments). */
export function circleSegments(r) {
  return Math.max(48, Math.min(360, Math.ceil(Math.PI / Math.acos(Math.max(-1, 1 - 0.01 / Math.max(r, 0.01))))));
}

function dedupe(points, tolerance) {
  const out = [];
  for (const p of points) if (!out.length || dist(out[out.length - 1], p) > tolerance) out.push({ x: p.x, y: p.y });
  if (out.length > 2 && dist(out[0], out[out.length - 1]) <= tolerance) out.pop();
  return out;
}

/**
 * Outlines (closed point loops) of entities. `drawing` resolves ByLayer line
 * types. Returns { loops, open } — open = chains that could not be closed.
 */
export function collectLoops(entities, drawing = null, { tolerance = 0.01 } = {}) {
  const loops = [];
  const chains = [];
  for (const entity of entities) {
    if (entity.type === 'dim' || entity.type === 'text' || entity.type === 'solid' || entity.construction) continue;
    const entityType = drawing ? styleOf(drawing, entity).lineType : entity.lineType ?? 'continuous';
    if (SKIP_LINE_TYPES.has(entityType) && entity.type !== 'part') continue;
    for (const prim of primitives(entity)) {
      if (prim.thin || SKIP_LINE_TYPES.has(prim.lineType) || prim.kind === 'text' || prim.kind === 'fill') continue;
      if (prim.kind === 'circle') {
        const n = circleSegments(prim.r);
        loops.push(Array.from({ length: n }, (_, i) => ({ x: prim.c.x + prim.r * Math.cos((2 * Math.PI * i) / n), y: prim.c.y + prim.r * Math.sin((2 * Math.PI * i) / n) })));
      } else if (prim.kind === 'poly' && prim.closed) {
        loops.push(dedupe(prim.points, 1e-9));
      } else if (prim.kind === 'poly') {
        chains.push(prim.points.map((p) => ({ x: p.x, y: p.y })));
      } else if (prim.kind === 'line') {
        chains.push([{ ...prim.a }, { ...prim.b }]);
      } else if (prim.kind === 'arc') {
        const step = 360 / circleSegments(prim.r);
        chains.push(arcPoints(prim.c.x, prim.c.y, prim.r, prim.start, prim.end, Math.min(step, sweep(prim.start, prim.end) / 2)));
      }
    }
  }
  // Join open pieces whose ends meet into closed outlines.
  const open = [];
  const pool = chains.filter((chain) => chain.length >= 2);
  while (pool.length) {
    let chain = pool.shift();
    let grown = true;
    while (grown && dist(chain[0], chain[chain.length - 1]) > tolerance) {
      grown = false;
      for (let i = 0; i < pool.length; i++) {
        const other = pool[i];
        const end = chain[chain.length - 1];
        const start = chain[0];
        if (dist(end, other[0]) <= tolerance) chain = [...chain, ...other.slice(1)];
        else if (dist(end, other[other.length - 1]) <= tolerance) chain = [...chain, ...[...other].reverse().slice(1)];
        else if (dist(start, other[other.length - 1]) <= tolerance) chain = [...other, ...chain.slice(1)];
        else if (dist(start, other[0]) <= tolerance) chain = [...[...other].reverse(), ...chain.slice(1)];
        else continue;
        pool.splice(i, 1);
        grown = true;
        break;
      }
    }
    if (chain.length > 3 && dist(chain[0], chain[chain.length - 1]) <= tolerance) loops.push(dedupe(chain, 1e-9));
    else open.push(chain);
  }
  return { loops: loops.filter((loop) => loop.length >= 3 && Math.abs(polygonArea(loop)) > 1e-9), open };
}

/**
 * Nesting: even depth = material outline, odd depth = hole of its parent.
 * Returns [{ outer, holes }] with outer counter-clockwise and holes clockwise.
 */
export function buildShapes(loops) {
  const items = loops.map((points) => ({ points, area: Math.abs(polygonArea(points)), box: bboxOf(points) }))
    .sort((a, b) => b.area - a.area);
  const inside = (inner, outer) => inner.box.minX >= outer.box.minX - 1e-9 && inner.box.maxX <= outer.box.maxX + 1e-9
    && inner.box.minY >= outer.box.minY - 1e-9 && inner.box.maxY <= outer.box.maxY + 1e-9
    && inner.points.every((p, i) => i % Math.max(1, Math.floor(inner.points.length / 8)) || pointInPolygon(p, outer.points));
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    // Parent: the smallest larger loop that contains this one.
    for (let j = i - 1; j >= 0; j--) {
      if (items[j].area > item.area && inside(item, items[j])) { item.parent = items[j]; break; }
    }
    item.depth = item.parent ? item.parent.depth + 1 : 0;
  }
  const shapes = [];
  for (const item of items) {
    if (item.depth % 2) continue;
    const outer = polygonArea(item.points) > 0 ? item.points : [...item.points].reverse();
    const holes = items.filter((other) => other.parent === item).map((hole) => (polygonArea(hole.points) < 0 ? hole.points : [...hole.points].reverse()));
    shapes.push({ outer, holes, area: item.area - holes.reduce((sum, hole) => sum + Math.abs(polygonArea(hole)), 0) });
  }
  return shapes;
}

export { triangulate } from './triangulate.js';

// ───────────────────────── extrusion and STL

/** Solid triangles (3D, outward normals) of shapes extruded `thickness` mm. */
export function extrude(shapes, thickness) {
  const h = Math.max(1e-3, Number(thickness) || 1);
  const out = [];
  const v = (p, z) => [p.x, p.y, z];
  for (const shape of shapes) {
    for (const [a, b, c] of triangulate(shape.outer, shape.holes)) {
      out.push([v(a, h), v(b, h), v(c, h)]);
      out.push([v(a, 0), v(c, 0), v(b, 0)]);
    }
    for (const loop of [shape.outer, ...shape.holes]) {
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i];
        const b = loop[(i + 1) % loop.length];
        out.push([v(a, 0), v(b, 0), v(b, h)], [v(a, 0), v(b, h), v(a, h)]);
      }
    }
  }
  return out;
}

function normalOf([a, b, c]) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  const length = Math.hypot(...n) || 1;
  return n.map((value) => value / length);
}

/** Binary STL bytes (little endian, 50 bytes per triangle). */
export function toBinaryStl(triangles, name = 'MyCAD') {
  const buffer = new ArrayBuffer(84 + triangles.length * 50);
  const view = new DataView(buffer);
  const header = `MyCAD STL ${name}`.slice(0, 79);
  for (let i = 0; i < header.length; i++) view.setUint8(i, header.charCodeAt(i) & 0x7f);
  view.setUint32(80, triangles.length, true);
  let offset = 84;
  for (const triangle of triangles) {
    for (const value of [...normalOf(triangle), ...triangle.flat()]) { view.setFloat32(offset, value, true); offset += 4; }
    view.setUint16(offset, 0, true);
    offset += 2;
  }
  return new Uint8Array(buffer);
}

/** ASCII STL (readable; larger). */
export function toAsciiStl(triangles, name = 'MyCAD') {
  const f = (value) => value.toExponential(6);
  const solid = String(name).replace(/\s+/g, '_') || 'MyCAD';
  return `solid ${solid}\n${triangles.map((triangle) => `facet normal ${normalOf(triangle).map(f).join(' ')}\n outer loop\n${triangle.map((p) => `  vertex ${p.map(f).join(' ')}`).join('\n')}\n endloop\nendfacet`).join('\n')}\nendsolid ${solid}\n`;
}

/** Volume (mm³) of a closed triangle mesh. */
export function meshVolume(triangles) {
  let volume = 0;
  for (const [a, b, c] of triangles) volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  return volume;
}

/**
 * Everything the STL window shows, and the mesh to write: closed 2D outlines
 * extruded `thickness` mm (unless `outlines` is false) plus every 3D solid.
 */
export function prepareStl(entities, drawing, { thickness = 5, outlines = true } = {}) {
  const { loops, open } = outlines ? collectLoops(entities, drawing) : { loops: [], open: [] };
  const shapes = buildShapes(loops);
  const solids = entities.filter((entity) => entity.type === 'solid');
  const triangles = [...extrude(shapes, thickness), ...solids.flatMap((entity) => solidMesh(entity))];
  const box = meshBox(triangles);
  return {
    shapes,
    solids: solids.length,
    triangles,
    open: open.length,
    holes: shapes.reduce((sum, shape) => sum + shape.holes.length, 0),
    area: shapes.reduce((sum, shape) => sum + shape.area, 0),
    volume: meshVolume(triangles),
    size: box ? { x: box.size[0], y: box.size[1], z: box.size[2] } : null,
  };
}

/** Bytes → base64 (for writing binary files through the backend). */
export function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return globalThis.btoa ? globalThis.btoa(binary) : Buffer.from(bytes).toString('base64');
}

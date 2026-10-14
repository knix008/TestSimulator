// OpenCASCADE BREP (.brep / .brp, "CASCADE Topology V1") — FreeCAD's own
// shape format. Writes each solid as a closed, sewn shell of planar faces (line
// edges shared between neighbours); reads planes, cylinders, cones, spheres and
// tori bounded by line, circle and ellipse edges, with locations. No DOM.

import { polygonArea } from './geometry.js';
import { triangulate } from './triangulate.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const num = (v) => {
  const r = Math.abs(v) < 1e-15 ? 0 : v;
  return Number.isInteger(r) ? String(r) : String(Number(r.toPrecision(15)));
};

// ───────────────────────── writer

/**
 * BREP text of solids: objects [{ name, triangles }] → a compound of solids,
 * each one shell whose triangles are planar faces sharing their edges.
 */
export function toBrep(objects) {
  const curves = [];
  const surfaces = [];
  const shapes = []; // in creation order: children before parents
  const add = (text) => { shapes.push(text); return shapes.length; }; // creation number
  const solids = [];
  for (const object of objects) {
    const vertexOf = new Map();
    const edgeOf = new Map();
    const vertex = (p) => {
      const key = p.map((v) => Math.round(v * 1e6)).join(',');
      let id = vertexOf.get(key);
      if (!id) { id = add(['Ve', '1e-07', `${num(p[0])} ${num(p[1])} ${num(p[2])}`, '0 0', '', '0101101', '*'].join('\n')); vertexOf.set(key, id); }
      return { id, key, p };
    };
    // An edge is stored once from its smaller vertex key; a face uses it forward or reversed.
    const edge = (a, b) => {
      const [lo, hi] = a.key < b.key ? [a, b] : [b, a];
      const key = `${lo.key}|${hi.key}`;
      let rec = edgeOf.get(key);
      if (!rec) {
        const d = sub(hi.p, lo.p);
        const length = Math.hypot(...d);
        curves.push(`1 ${lo.p.map(num).join(' ')} ${unit(d).map(num).join(' ')} `);
        const id = add(['Ed', ' 1e-07 1 1 0', `1  ${curves.length} 0 0 ${num(length)}`, '0', '', '0101000', `-#${hi.id} 0 +#${lo.id} 0 *`].join('\n'));
        rec = { id, lo };
        edgeOf.set(key, rec);
      }
      return `${rec.lo === a || rec.lo.key === a.key ? '+' : '-'}#${rec.id} 0`;
    };
    const faces = [];
    for (const tri of object.triangles) {
      const [A, B, C] = tri.map(vertex);
      if (A.key === B.key || B.key === C.key || A.key === C.key) continue;
      const n = cross(sub(B.p, A.p), sub(C.p, A.p));
      if (Math.hypot(...n) < 1e-12) continue;
      const N = unit(n);
      const X = unit(sub(B.p, A.p));
      const Y = cross(N, X);
      surfaces.push(`1 ${A.p.map(num).join(' ')} ${N.map(num).join(' ')} ${X.map(num).join(' ')} ${Y.map(num).join(' ')} `);
      const wire = add(['Wi', '', '0101100', `${edge(A, B)} ${edge(B, C)} ${edge(C, A)} *`].join('\n'));
      faces.push(add(['Fa', `0  1e-07 ${surfaces.length} 0`, '', '0101000', `+#${wire} 0 *`].join('\n')));
    }
    if (!faces.length) continue;
    const rows = [];
    for (let i = 0; i < faces.length; i += 10) rows.push(faces.slice(i, i + 10).map((f) => `+#${f} 0`).join(' '));
    const shell = add(['Sh', '', '0101100', `${rows.join(' \n')} *`].join('\n'));
    solids.push(add(['So', '', '0100000', `+#${shell} 0 *`].join('\n')));
  }
  const compound = add(['Co', '', '0100000', `${solids.map((s) => `+#${s} 0`).join(' ')} *`].join('\n'));
  // OCCT numbers the written list from its end: written k-th (children first) = number N − k + 1.
  const total = shapes.length;
  // Child references were written as #creation-number.
  const renumber = (text) => text.replace(/#(\d+)/g, (m, id) => String(total - Number(id) + 1));
  return [
    'DBRep_DrawableShape', '',
    'CASCADE Topology V1, (c) Matra-Datavision',
    'Locations 0',
    'Curve2ds 0',
    `Curves ${curves.length}`, ...curves,
    'Polygon3D 0',
    'PolygonOnTriangulations 0',
    `Surfaces ${surfaces.length}`, ...surfaces,
    'Triangulations 0', '',
    `TShapes ${total}`,
    ...shapes.map(renumber),
    '', `+${total - compound + 1} 0`, '',
  ].join('\n');
}

// ───────────────────────── reader

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
const compose = (a, b) => [
  a[0] * b[0] + a[1] * b[4] + a[2] * b[8], a[0] * b[1] + a[1] * b[5] + a[2] * b[9], a[0] * b[2] + a[1] * b[6] + a[2] * b[10], a[0] * b[3] + a[1] * b[7] + a[2] * b[11] + a[3],
  a[4] * b[0] + a[5] * b[4] + a[6] * b[8], a[4] * b[1] + a[5] * b[5] + a[6] * b[9], a[4] * b[2] + a[5] * b[6] + a[6] * b[10], a[4] * b[3] + a[5] * b[7] + a[6] * b[11] + a[7],
  a[8] * b[0] + a[9] * b[4] + a[10] * b[8], a[8] * b[1] + a[9] * b[5] + a[10] * b[9], a[8] * b[2] + a[9] * b[6] + a[10] * b[10], a[8] * b[3] + a[9] * b[7] + a[10] * b[11] + a[11],
];
/** Inverse of a rigid (rotation + translation) transform. */
const invert = (m) => {
  const r = [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]];
  const t = [m[3], m[7], m[11]];
  return [r[0], r[1], r[2], -(r[0] * t[0] + r[1] * t[1] + r[2] * t[2]), r[3], r[4], r[5], -(r[3] * t[0] + r[4] * t[1] + r[5] * t[2]), r[6], r[7], r[8], -(r[6] * t[0] + r[7] * t[1] + r[8] * t[2])];
};
const applyPoint = (m, p) => [m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3], m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7], m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11]];
const applyDir = (m, p) => [m[0] * p[0] + m[1] * p[1] + m[2] * p[2], m[4] * p[0] + m[5] * p[1] + m[6] * p[2], m[8] * p[0] + m[9] * p[1] + m[10] * p[2]];

/**
 * Reads a BREP file. Returns [{ name, triangles }] (one per solid, or one for
 * loose shells / faces), with .warnings for surfaces it skipped.
 * `curvedFace(loops, toParam, fromParam, sameSense, kind)` tessellates revolved surfaces (from the STEP reader).
 */
export function parseBrep(text, { curvedFace } = {}) {
  const src = String(text).replace(/\r/g, '');
  if (!/CASCADE Topology V\d/.test(src)) throw new Error('BREP: not an OpenCASCADE BREP file');
  const lines = src.split('\n');
  let at = lines.findIndex((l) => /^Locations\s+\d+/.test(l));
  const nums = (l) => l.trim().split(/\s+/).filter(Boolean).map(Number);
  // Locations: 1 = a 3×4 matrix, 2 = a product of earlier ones with powers.
  const locations = [null];
  const locCount = Number(lines[at].split(/\s+/)[1]);
  at++;
  for (let k = 0; k < locCount; k++) {
    const type = Number(lines[at].trim());
    if (type === 1) {
      const m = [...nums(lines[at + 1]), ...nums(lines[at + 2]), ...nums(lines[at + 3])];
      locations.push(m);
      at += 4;
    } else {
      const parts = nums(lines[at]).slice(1);
      let m = IDENTITY;
      for (let i = 0; i + 1 < parts.length && parts[i] !== 0; i += 2) {
        let base = locations[parts[i]] ?? IDENTITY;
        const power = parts[i + 1];
        if (power < 0) base = invert(base);
        for (let p = 0; p < Math.abs(power); p++) m = compose(m, base);
      }
      locations.push(m);
      at += 1;
    }
  }
  const loc = (i) => locations[i] ?? IDENTITY;
  // Sections: skip 2D curves; read 3D curves and surfaces.
  const section = (name) => {
    const i = lines.findIndex((l, k) => k >= at && l.startsWith(name));
    return i;
  };
  const readList = (name, parse) => {
    const i = section(name);
    if (i < 0) return [];
    const count = Number(lines[i].split(/\s+/)[1]);
    const out = [null];
    let k = i + 1;
    while (out.length <= count && k < lines.length) {
      const l = lines[k].trim();
      k++;
      if (!l) continue;
      const v = nums(l);
      // Only the first record line of each entity starts with its type; multi-line types (B-splines) are skipped.
      out.push(parse(v) ?? { type: v[0] });
      if (v[0] > 5) {
        // Unsupported types may span several lines: skip until a line that starts a new record cannot be told apart; give up on the rest.
        while (out.length <= count) out.push({ type: -1 });
        break;
      }
    }
    return out;
  };
  const curves = readList('Curves', (v) => {
    if (v[0] === 1) return { type: 1, o: v.slice(1, 4), d: v.slice(4, 7) };
    if (v[0] === 2) return { type: 2, c: v.slice(1, 4), n: v.slice(4, 7), x: v.slice(7, 10), y: v.slice(10, 13), r: v[13] };
    if (v[0] === 3) return { type: 3, c: v.slice(1, 4), n: v.slice(4, 7), x: v.slice(7, 10), y: v.slice(10, 13), r1: v[13], r2: v[14] };
    return null;
  });
  const surfaces = readList('Surfaces', (v) => {
    const frame = { o: v.slice(1, 4), z: v.slice(4, 7), x: v.slice(7, 10), y: v.slice(10, 13) };
    if (v[0] === 1) return { type: 'plane', ...frame };
    if (v[0] === 2) return { type: 'cylinder', ...frame, r: v[13] };
    if (v[0] === 3) return { type: 'cone', ...frame, r: v[13], angle: v[14] };
    if (v[0] === 4) return { type: 'sphere', ...frame, r: v[13] };
    if (v[0] === 5) return { type: 'torus', ...frame, R: v[13], r: v[14] };
    return null;
  });
  // TShapes: numbered from the end of the list.
  const tsAt = lines.findIndex((l) => /^TShapes\s+\d+/.test(l));
  const total = Number(lines[tsAt].split(/\s+/)[1]);
  const shapes = new Map();
  let k = tsAt + 1;
  for (let n = total; n >= 1; n--) {
    while (k < lines.length && !/^(Ve|Ed|Wi|Fa|Sh|So|CS|Co)$/.test(lines[k].trim())) k++;
    const type = lines[k].trim();
    k++;
    const geometry = [];
    while (k < lines.length && lines[k].trim() !== '') { geometry.push(lines[k]); k++; }
    k++; // blank
    k++; // flags
    const children = [];
    let done = false;
    while (!done && k < lines.length) {
      for (const tok of lines[k].trim().split(/\s+/).filter(Boolean)) {
        if (tok === '*') { done = true; break; }
        children.push(tok);
      }
      k++;
    }
    const kids = [];
    for (let i = 0; i + 1 < children.length; i += 2) kids.push({ ori: children[i][0], id: Number(children[i].slice(1)), loc: Number(children[i + 1]) });
    const shape = { type, kids };
    if (type === 'Ve') shape.p = nums(geometry[1]);
    if (type === 'Ed') {
      for (const g of geometry.slice(1)) {
        const v = g.trim().split(/\s+/);
        if (v[0] === '1') { shape.curve = Number(v[1]); shape.curveLoc = Number(v[2]); shape.first = Number(v[3]); shape.last = Number(v[4]); }
      }
    }
    if (type === 'Fa') { const v = nums(geometry[0]); shape.surface = v[2]; shape.surfLoc = v[3]; }
    shapes.set(n, shape);
  }
  const warnings = new Set();
  // Points along an edge (in the edge's frame), first to last vertex.
  const edgePoints = (edge) => {
    const [v1, v2] = [edge.kids.find((c) => c.ori === '+'), edge.kids.find((c) => c.ori === '-')];
    const pv = (c) => (c ? applyPoint(loc(c.loc), shapes.get(c.id).p) : null);
    const a = pv(v1); const b = pv(v2);
    const curve = curves[edge.curve];
    const m = loc(edge.curveLoc);
    if (!curve || curve.type === 1 || curve.type === -1) {
      if (curve?.type === -1) warnings.add('curve');
      return a && b ? [a, b] : [];
    }
    const span = edge.last - edge.first;
    const count = Math.max(2, Math.ceil((Math.abs(span) / (2 * Math.PI)) * 72));
    const pts = Array.from({ length: count + 1 }, (_, i) => {
      const t = edge.first + (span * i) / count;
      const [r1, r2] = curve.type === 2 ? [curve.r, curve.r] : [curve.r1, curve.r2];
      return applyPoint(m, curve.c.map((c, j) => c + r1 * Math.cos(t) * curve.x[j] + r2 * Math.sin(t) * curve.y[j]));
    });
    if (a) pts[0] = a;
    if (b) pts[pts.length - 1] = b;
    return pts;
  };
  const faceTriangles = (face, m, sameSense) => {
    const surf = surfaces[face.surface];
    if (!surf || surf.type === -1) { warnings.add('surface'); return []; }
    const sm = compose(m, loc(face.surfLoc));
    const frame = { o: applyPoint(sm, surf.o), x: unit(applyDir(sm, surf.x)), y: unit(applyDir(sm, surf.y)), z: unit(applyDir(sm, surf.z)) };
    const loops = face.kids.map((wireRef) => {
      const wire = shapes.get(wireRef.id);
      const wm = compose(m, loc(wireRef.loc));
      // The edges, each walked its own way (backwards when reversed in the wire)…
      const segs = wire.kids.map((edgeRef) => {
        const seg = edgePoints(shapes.get(edgeRef.id)).map((p) => applyPoint(compose(wm, loc(edgeRef.loc)), p));
        return edgeRef.ori === '-' ? seg.reverse() : seg;
      }).filter((seg) => seg.length >= 2);
      // …then chained end to start (a file lists a wire's edges in any order).
      const close = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 1e-6 * (1 + Math.hypot(...p));
      const pts = segs.length ? [...segs.shift()] : [];
      while (segs.length) {
        const end = pts[pts.length - 1];
        let i = segs.findIndex((seg) => close(seg[0], end));
        let seg;
        if (i >= 0) seg = segs.splice(i, 1)[0];
        else {
          i = segs.findIndex((g) => close(g[g.length - 1], end));
          seg = i >= 0 ? segs.splice(i, 1)[0].reverse() : segs.shift();
        }
        pts.push(...seg.slice(1));
      }
      if (pts.length > 1 && close(pts[0], pts[pts.length - 1])) pts.pop();
      return wireRef.ori === '-' ? pts.reverse() : pts;
    }).filter((loop) => loop.length >= 2);
    if (!loops.length) return [];
    const local = (p) => { const d = sub(p, frame.o); return [dot(d, frame.x), dot(d, frame.y), dot(d, frame.z)]; };
    const world = ([x, y, z]) => frame.o.map((o, i) => o + x * frame.x[i] + y * frame.y[i] + z * frame.z[i]);
    if (surf.type === 'plane') {
      const normal = sameSense ? frame.z : frame.z.map((v) => -v);
      const U = frame.x; const V = cross(normal, U);
      const rings = loops.map((loop) => loop.map((p) => ({ x: dot(p, U), y: dot(p, V), p }))).filter((r) => r.length >= 3)
        .sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)));
      if (!rings.length) return [];
      const [outer, ...holes] = rings;
      return triangulate(outer, holes).map((tri) => tri.map((q) => q.p));
    }
    if (!curvedFace) { warnings.add(surf.type); return []; }
    let toParam;
    let fromParam;
    if (surf.type === 'cylinder') {
      toParam = (p) => { const [x, y, z] = local(p); return [Math.atan2(y, x), z]; };
      fromParam = ([t, z]) => world([surf.r * Math.cos(t), surf.r * Math.sin(t), z]);
    } else if (surf.type === 'cone') {
      const tan = Math.tan(surf.angle);
      toParam = (p) => { const [x, y, z] = local(p); return [Math.atan2(y, x), z]; };
      fromParam = ([t, z]) => world([(surf.r + z * tan) * Math.cos(t), (surf.r + z * tan) * Math.sin(t), z]);
    } else if (surf.type === 'sphere') {
      toParam = (p) => { const [x, y, z] = local(p); return [Math.atan2(y, x), Math.asin(Math.max(-1, Math.min(1, z / surf.r)))]; };
      fromParam = ([t, v]) => world([surf.r * Math.cos(v) * Math.cos(t), surf.r * Math.cos(v) * Math.sin(t), surf.r * Math.sin(v)]);
    } else {
      toParam = (p) => { const [x, y, z] = local(p); return [Math.atan2(y, x), Math.atan2(z, Math.hypot(x, y) - surf.R)]; };
      fromParam = ([t, v]) => world([(surf.R + surf.r * Math.cos(v)) * Math.cos(t), (surf.R + surf.r * Math.cos(v)) * Math.sin(t), surf.r * Math.sin(v)]);
    }
    return curvedFace(loops, toParam, fromParam, sameSense, surf.type);
  };
  // Walk the tree from the root: faces collected per solid (or per top shell).
  const rootLine = lines.slice(k).find((l) => /^[+\-ie]\d+/.test(l.trim()));
  const root = rootLine ? { ori: rootLine.trim()[0], id: Number(rootLine.trim().slice(1).split(/\s+/)[0]), loc: Number(rootLine.trim().split(/\s+/)[1] ?? 0) } : { ori: '+', id: 1, loc: 0 };
  const objects = [];
  const collect = (ref, m, reversed, bucket) => {
    const shape = shapes.get(ref.id);
    if (!shape) return;
    const here = compose(m, loc(ref.loc));
    const rev = reversed !== (ref.ori === '-');
    if (shape.type === 'Fa') { bucket.push(...faceTriangles(shape, here, !rev)); return; }
    for (const kid of shape.kids) collect(kid, here, rev, bucket);
  };
  const visit = (ref, m, reversed, name) => {
    const shape = shapes.get(ref.id);
    if (!shape) return;
    const here = compose(m, loc(ref.loc));
    const rev = reversed !== (ref.ori === '-');
    if (shape.type === 'So' || shape.type === 'Sh' || shape.type === 'Fa') {
      const bucket = [];
      collect({ ...ref, loc: 0 }, here, reversed, bucket);
      if (bucket.length) objects.push({ name: `${name} ${objects.length + 1}`, triangles: bucket });
      return;
    }
    for (const kid of shape.kids) visit(kid, here, rev, name);
  };
  visit(root, IDENTITY, false, 'BREP');
  if (!objects.length) throw new Error('BREP: no faces it can read');
  objects.warnings = [...warnings];
  return objects;
}

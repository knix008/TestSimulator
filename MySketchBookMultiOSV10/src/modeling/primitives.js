// Ready-made GeoMesh solids (tests and the UI's "insert primitive").
// Anchors: 'bottom' = footprint centred on `at` with the base at at.y (library convention),
// 'corner' = minimum corner at `at`, 'center' = box centre at `at`.
import { GeoMesh } from './mesh.js';
import { toV } from './math.js';

function anchorOffset(w, h, d, anchor, at) {
  const p = toV(at || [0, 0, 0]);
  if (anchor === 'corner') return p;
  if (anchor === 'center') return { x: p.x - w / 2, y: p.y - h / 2, z: p.z - d / 2 };
  return { x: p.x - w / 2, y: p.y, z: p.z - d / 2 };
}

// Axis-aligned box: 6 faces, outward normals.
export function box(width = 1, height = 1, depth = 1, options = {}) {
  const mesh = options.mesh || new GeoMesh();
  const o = anchorOffset(width, height, depth, options.anchor || 'bottom', options.at);
  const x0 = o.x, y0 = o.y, z0 = o.z, x1 = x0 + width, y1 = y0 + height, z1 = z0 + depth;
  const P = (x, y, z) => ({ x, y, z });
  const mat = { material: options.material ?? null };
  const faces = [
    mesh.addFaceFromPoints([P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1)], [], mat), // bottom (−Y)
    mesh.addFaceFromPoints([P(x0, y1, z0), P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0)], [], mat), // top (+Y)
    mesh.addFaceFromPoints([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], [], mat), // front (+Z)
    mesh.addFaceFromPoints([P(x1, y0, z0), P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0)], [], mat), // back (−Z)
    mesh.addFaceFromPoints([P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1)], [], mat), // right (+X)
    mesh.addFaceFromPoints([P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0)], [], mat), // left (−X)
  ];
  return options.mesh ? { mesh, faces } : mesh;
}

// Vertical cylinder built the SketchUp way (circle + push/pull): soft, smooth sides.
export function cylinder(radius = 0.5, height = 1, options = {}) {
  const mesh = options.mesh || new GeoMesh();
  const at = toV(options.at || [0, 0, 0]);
  const c = mesh.addCircle(at, { x: 0, y: 1, z: 0 }, radius, options.segments ?? 24);
  const r = mesh.pushPull(c.faces[0], height);
  if (options.material) mesh.setMaterial([...r.created.faces, c.faces[0]].filter((f) => mesh.faces.has(f)), options.material);
  return options.mesh ? { mesh, faces: r.created.faces } : mesh;
}

// Tube (cylinder with a round hole).
export function tube(outerRadius = 0.5, innerRadius = 0.4, height = 1, options = {}) {
  const mesh = options.mesh || new GeoMesh();
  const at = toV(options.at || [0, 0, 0]);
  const seg = options.segments ?? 24;
  const outer = mesh.addCircle(at, { x: 0, y: 1, z: 0 }, outerRadius, seg);
  const inner = mesh.addCircle(at, { x: 0, y: 1, z: 0 }, innerRadius, seg);
  const ring = outer.faces.concat(inner.faces).find((f) => mesh.faces.has(f) && mesh.faces.get(f).holes.length);
  const disc = inner.faces.find((f) => mesh.faces.has(f) && !mesh.faces.get(f).holes.length);
  if (disc != null) mesh.eraseFaces([disc]);
  mesh.pushPull(ring, height);
  return mesh;
}

// Cone with its apex above the base centre (soft sides).
export function cone(radius = 0.5, height = 1, options = {}) {
  const mesh = new GeoMesh();
  const at = toV(options.at || [0, 0, 0]);
  const seg = options.segments ?? 24;
  const base = [];
  for (let i = 0; i < seg; i++) {
    const t = (i / seg) * Math.PI * 2;
    base.push({ x: at.x + radius * Math.cos(t), y: at.y, z: at.z - radius * Math.sin(t) });
  }
  const apex = { x: at.x, y: at.y + height, z: at.z };
  mesh.addFaceFromPoints(base.slice().reverse(), []); // faces down
  for (let i = 0; i < seg; i++) mesh.addFaceFromPoints([base[i], base[(i + 1) % seg], apex]);
  mesh._orientShell([...mesh.faces.keys()]);
  mesh.softenEdges(null, 360 / seg + 1);
  return mesh;
}

// UV sphere (soft, smooth everywhere), centre at `at` (default: resting on y = 0).
export function sphere(radius = 0.5, options = {}) {
  const mesh = new GeoMesh();
  const seg = options.segments ?? 24, rings = options.rings ?? 12;
  const c = options.at ? toV(options.at) : { x: 0, y: radius, z: 0 };
  const pt = (i, j) => {
    const th = (j / rings) * Math.PI, ph = (i / seg) * Math.PI * 2;
    return { x: c.x + radius * Math.sin(th) * Math.cos(ph), y: c.y + radius * Math.cos(th), z: c.z + radius * Math.sin(th) * Math.sin(ph) };
  };
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < seg; i++) {
      const a = pt(i, j), b = pt(i + 1, j), d = pt(i, j + 1), e = pt(i + 1, j + 1);
      if (j === 0) mesh.addFaceFromPoints([a, e, d]);
      else if (j === rings - 1) mesh.addFaceFromPoints([a, b, d]);
      else mesh.addFaceFromPoints([a, b, e, d]);
    }
  }
  mesh._orientShell([...mesh.faces.keys()]);
  mesh.setEdgeFlags([...mesh.edges.keys()], { soft: true, smooth: true });
  return mesh;
}

// Extrudes a footprint [[x, z], ...] (or points) on the ground up by height.
export function prism(footprint, height = 1, options = {}) {
  const mesh = options.mesh || new GeoMesh();
  const y = options.y ?? 0;
  const pts = footprint.map((p) => (Array.isArray(p) && p.length === 2 ? { x: p[0], y, z: p[1] } : toV(p)));
  const r = mesh.addPolyline(pts, { closed: true, planeNormal: { x: 0, y: 1, z: 0 } });
  const f = r.faces[0];
  if (f != null) mesh.pushPull(f, height);
  return mesh;
}

// A single rectangle face on the ground (w × d, centred).
export function rectangle(width = 1, depth = 1, options = {}) {
  const mesh = new GeoMesh();
  const at = toV(options.at || [0, 0, 0]);
  mesh.addRectangle({ x: at.x - width / 2, y: at.y, z: at.z - depth / 2 }, { x: at.x + width / 2, y: at.y, z: at.z + depth / 2 });
  return mesh;
}

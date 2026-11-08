// 3D meshes of furniture parts (src/lib/furnparts.js).
//
// Plain boxes, cylinders and balls stay the shared unit shapes scaled by their
// mesh (build.js unitGeometry), so the viewer draws repeats as instances.
// Everything else — rounded and soft boxes, cones, turned (lathe) shapes,
// extrusions, bent tubes, rings and any turned part — gets a geometry of its
// own, built once per distinct shape and shared by every item that has the
// same part (a hotel's hundred identical beds share one set).
//
// Geometry is made in the item frame (x, y, z up, metres) and then mapped to
// the world frame of build.js (x, z up → y, y → z). That swap is a mirror, so
// the triangles are turned over to keep their faces pointing out.

import { MATERIAL_CLASSES, CLASS_OF_COLOR } from "../lib/furnparts.js";

const M = 0.001;
const DEG = Math.PI / 180;
const GEOS = new WeakMap(); // THREE → Map(key → BufferGeometry)
const MAX_CACHE = 6000;

const q = (v) => Math.round((+v || 0) * 10) / 10;

// Tessellation: full detail, and a lighter one for big buildings (thousands of items).
const DETAIL = {
  full: { cyl: 16, sph: [14, 9], lathe: 18, torR: 6, torT: 24, tubeR: 6, tubeK: 1, rod: 8, curve: 2 },
  low: { cyl: 8, sph: [8, 5], lathe: 10, torR: 4, torT: 12, tubeR: 4, tubeK: 0.45, rod: 5, curve: 1 },
};

export function partNeedsOwnGeometry(p, textured = false) {
  if (p.tx || p.ty || p.tz) return true;
  if (p.t === "box") return (p.b || 0) > 0.5 || (p.r || 0) > 0.5 || (textured && !!classOf(p).tex);
  if (p.t === "cyl") return (p.top ?? 1) !== 1 || (textured && !!classOf(p).tex);
  if (p.t === "sph") return (p.sx ?? 1) !== 1 || (p.sy ?? 1) !== 1 || (p.sz ?? 1) !== 1 || (textured && !!classOf(p).tex);
  return true; // lathe, ext, tube, tor
}

export function classOf(p) {
  return MATERIAL_CLASSES[p.m] || MATERIAL_CLASSES[CLASS_OF_COLOR[p.c]] || MATERIAL_CLASSES.paint;
}
export const classNameOf = (p) => (MATERIAL_CLASSES[p.m] ? p.m : CLASS_OF_COLOR[p.c] || "paint");

function keyOf(p) {
  const base = [p.t, q(p.tx), q(p.ty), q(p.tz)];
  switch (p.t) {
    case "box": return [...base, q(p.w), q(p.d), q(p.h), q(p.r), q(p.b)].join(",");
    case "cyl": return [...base, q(p.rx), q(p.ry), q(p.h), q(p.top ?? 1), p.seg || 0].join(",");
    case "sph": return [...base, q(p.r), q(p.sx ?? 1), q(p.sy ?? 1), q(p.sz ?? 1)].join(",");
    case "lathe": return [...base, q(p.sy ?? 1), p.seg || 0, p.prof.map((a) => `${q(a[0])}:${q(a[1])}`).join(";")].join(",");
    case "ext": return [...base, p.axis, q(p.depth), q(p.b), p.pts.map((a) => `${q(a[0])}:${q(a[1])}`).join(";")].join(",");
    case "tube": return [...base, q(p.r), p.smooth ? 1 : 0, p.pts.map((a) => `${q(a[0] - p.x)}:${q(a[1] - p.y)}:${q(a[2] - p.z)}`).join(";")].join(",");
    case "tor": return [...base, q(p.R), q(p.r), p.axis, q(p.arc ?? 360)].join(",");
    default: return base.join(",");
  }
}

// A plain box with UVs in metres (top: x, y; sides: along, up), item frame,
// bottom face centred on the origin.
function boxGeometry(THREE, w, d, h) {
  const x = w / 2, y = d / 2;
  const pos = [], uv = [];
  const quad = (a, b, c, e, uvs) => { pos.push(...a, ...b, ...c, ...a, ...c, ...e); uv.push(...uvs[0], ...uvs[1], ...uvs[2], ...uvs[0], ...uvs[2], ...uvs[3]); };
  quad([-x, -y, h], [x, -y, h], [x, y, h], [-x, y, h], [[-x, -y], [x, -y], [x, y], [-x, y]]); // top (+z)
  quad([-x, y, 0], [x, y, 0], [x, -y, 0], [-x, -y, 0], [[-x, y], [x, y], [x, -y], [-x, -y]]); // bottom
  quad([-x, y, 0], [-x, y, h], [x, y, h], [x, y, 0], [[-x, 0], [-x, h], [x, h], [x, 0]].map(([u, v]) => [-u, v])); // front (+y)
  quad([x, -y, 0], [x, -y, h], [-x, -y, h], [-x, -y, 0], [[x, 0], [x, h], [-x, h], [-x, 0]]); // back (−y)
  quad([x, y, 0], [x, y, h], [x, -y, h], [x, -y, 0], [[y, 0], [y, h], [-y, h], [-y, 0]].map(([u, v]) => [-u, v])); // right (+x)
  quad([-x, -y, 0], [-x, -y, h], [-x, y, h], [-x, y, 0], [[-y, 0], [-y, h], [y, h], [y, 0]]); // left (−x)
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function shapeOf(THREE, pts) {
  const s = new THREE.Shape();
  pts.forEach(([u, v], i) => (i ? s.lineTo(u, v) : s.moveTo(u, v)));
  s.closePath();
  return s;
}

function roundRectShape(THREE, w, d, r, seg) {
  const s = new THREE.Shape();
  const x = w / 2, y = d / 2;
  r = Math.max(0, Math.min(r, x - 1e-6, y - 1e-6));
  if (r <= 1e-7) { s.moveTo(-x, -y); s.lineTo(x, -y); s.lineTo(x, y); s.lineTo(-x, y); s.closePath(); return s; }
  s.moveTo(-x + r, -y);
  s.lineTo(x - r, -y); s.absarc(x - r, -y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x, y - r); s.absarc(x - r, y - r, r, 0, Math.PI / 2, false);
  s.lineTo(-x + r, y); s.absarc(-x + r, y - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-x, -y + r); s.absarc(-x + r, -y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

// An extrusion of `shape` along +z from 0 to depth with rounded edges of b
// (the outline stays where it is: the bevel eats inwards).
function extrude(THREE, shape, depth, b, curveSegments = 3) {
  b = Math.max(0, Math.min(b, depth / 2 - 1e-6));
  if (b <= 1e-6) return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments });
  const g = new THREE.ExtrudeGeometry(shape, { depth: depth - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: b > 0.012 ? 2 : 1, curveSegments });
  g.translate(0, 0, b);
  return g;
}

// Rounded corners for a bent tube: arcs of radius `bend` at every inner point.
function filletPath(THREE, pts, bend) {
  if (pts.length < 3) return pts.map((p) => new THREE.Vector3(...p));
  const out = [new THREE.Vector3(...pts[0])];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = new THREE.Vector3(...pts[i - 1]), b = new THREE.Vector3(...pts[i]), c = new THREE.Vector3(...pts[i + 1]);
    const u = a.clone().sub(b), v = c.clone().sub(b);
    const lu = u.length(), lv = v.length();
    const r = Math.min(bend, lu / 2, lv / 2);
    if (r < 1e-6) { out.push(b); continue; }
    const p0 = b.clone().add(u.normalize().multiplyScalar(r)), p2 = b.clone().add(v.normalize().multiplyScalar(r));
    for (let k = 0; k <= 4; k++) {
      const t = k / 4;
      // Quadratic Bézier p0 → b → p2.
      out.push(p0.clone().multiplyScalar((1 - t) * (1 - t)).add(b.clone().multiplyScalar(2 * (1 - t) * t)).add(p2.clone().multiplyScalar(t * t)));
    }
  }
  out.push(new THREE.Vector3(...pts[pts.length - 1]));
  return out;
}

function tubeGeometry(THREE, p, Q) {
  const pts = p.pts.map((a) => [(a[0] - p.x) * M, (a[1] - p.y) * M, (a[2] - p.z) * M]);
  const r = p.r * M;
  if (pts.length === 2) {
    // A straight rod: a cylinder from the first point to the second.
    const a = new THREE.Vector3(...pts[0]), b = new THREE.Vector3(...pts[1]);
    const len = a.distanceTo(b);
    const g = new THREE.CylinderGeometry(r, r, Math.max(len, 1e-5), Q.rod, 1, false);
    g.translate(0, len / 2, 0);
    const dir = b.clone().sub(a).normalize();
    const qn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.lengthSq() ? dir : new THREE.Vector3(0, 1, 0));
    g.applyQuaternion(qn);
    g.translate(a.x, a.y, a.z);
    return g;
  }
  const vs = p.smooth ? pts.map((v) => new THREE.Vector3(...v)) : filletPath(THREE, pts, r * 2.5);
  const curve = new THREE.CatmullRomCurve3(vs, false, "centripetal", 0.5);
  let len = 0;
  for (let i = 1; i < vs.length; i++) len += vs[i].distanceTo(vs[i - 1]);
  const seg = Math.max(4, Math.min(96, Math.round((vs.length * (p.smooth ? 4 : 2) + len / (r * 10)) * Q.tubeK)));
  return new THREE.TubeGeometry(curve, seg, r, Q.tubeR, false);
}

// Mirror the item frame into the world frame of build.js and turn the
// triangles over (the mirror flips them).
function toWorldFrame(THREE, g) {
  g.applyMatrix4(new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1));
  return flipWinding(g);
}

function flipWinding(g) {
  if (g.index) {
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
    g.index.needsUpdate = true;
  } else {
    for (const name of Object.keys(g.attributes)) {
      const a = g.attributes[name], n = a.itemSize, arr = a.array;
      for (let i = 0; i < a.count; i += 3) for (let k = 0; k < n; k++) { const t = arr[(i + 1) * n + k]; arr[(i + 1) * n + k] = arr[(i + 2) * n + k]; arr[(i + 2) * n + k] = t; }
      a.needsUpdate = true;
    }
  }
  return g;
}

// The geometry of a part in the item frame (metres), anchor at the origin, before turning.
function itemFrameGeometry(THREE, p, Q) {
  switch (p.t) {
    case "box": {
      const w = p.w * M, d = p.d * M, h = p.h * M, b = (p.b || 0) * M, r = Math.max(p.r || 0, p.b || 0) * M;
      if (b <= 0 && r <= 0) return boxGeometry(THREE, w, d, h);
      return extrude(THREE, roundRectShape(THREE, w, d, r, 3), h, b, (r > 0.04 ? 3 : 2) - (Q.curve < 2 ? 1 : 0));
    }
    case "cyl": {
      const g = new THREE.CylinderGeometry((p.top ?? 1), 1, 1, Math.min(p.seg || Q.cyl, Q.cyl === 8 ? 10 : 64), 1, false);
      g.translate(0, 0.5, 0);
      g.rotateX(Math.PI / 2); // up the item z
      g.scale(p.rx * M, p.ry * M, p.h * M);
      return g;
    }
    case "sph": {
      const g = new THREE.SphereGeometry(1, Q.sph[0], Q.sph[1]);
      g.rotateX(Math.PI / 2);
      g.scale(p.r * (p.sx ?? 1) * M, p.r * (p.sy ?? 1) * M, p.r * (p.sz ?? 1) * M);
      return g;
    }
    case "lathe": {
      const g = new THREE.LatheGeometry(p.prof.map(([r, z]) => new THREE.Vector2(Math.max(0, r) * M, z * M)), Math.min(p.seg || Q.lathe, Q.lathe === 10 ? 12 : 64));
      g.rotateX(Math.PI / 2);
      if ((p.sy ?? 1) !== 1) g.scale(1, p.sy, 1);
      return g;
    }
    case "ext": {
      const g = extrude(THREE, shapeOf(THREE, p.pts.map(([u, v]) => [u * M, v * M])), p.depth * M, (p.b || 0) * M, Q.curve + 1);
      if (p.axis === "x") {
        // (u, v, w) → (w − depth/2, u, v): a turn, no mirror.
        g.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));
        g.translate((-p.depth * M) / 2, 0, 0);
      } else if (p.axis === "y") {
        // (u, v, w) → (u, w − depth/2, v): a mirror — turned over twice in all (here and toWorldFrame).
        g.applyMatrix4(new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1));
        g.translate(0, (-p.depth * M) / 2, 0);
        flipWinding(g);
      }
      return g;
    }
    case "tube":
      return tubeGeometry(THREE, p, Q);
    case "tor": {
      const g = new THREE.TorusGeometry(p.R * M, p.r * M, Q.torR, Math.max(6, Math.round(Q.torT * ((p.arc ?? 360) / 360))), (p.arc ?? 360) * DEG);
      if (p.axis === "x") g.rotateY(Math.PI / 2);
      else if (p.axis === "y") g.rotateX(Math.PI / 2);
      return g;
    }
    default:
      return boxGeometry(THREE, 0.01, 0.01, 0.01);
  }
}

// The shared geometry of a part (world frame, anchor at the origin).
export function partGeometry(THREE, p, lod = false) {
  let cache = GEOS.get(THREE);
  if (!cache) GEOS.set(THREE, (cache = new Map()));
  const key = (lod ? "L" : "") + keyOf(p);
  let g = cache.get(key);
  if (g) return g;
  g = itemFrameGeometry(THREE, p, lod ? DETAIL.low : DETAIL.full);
  if (p.tx || p.ty || p.tz) {
    const m = new THREE.Matrix4().makeRotationZ((p.tz || 0) * DEG).multiply(new THREE.Matrix4().makeRotationY((p.ty || 0) * DEG)).multiply(new THREE.Matrix4().makeRotationX((p.tx || 0) * DEG));
    g.applyMatrix4(m);
  }
  toWorldFrame(THREE, g);
  g.computeBoundingSphere();
  g.userData.furniturePart = true;
  if (cache.size > MAX_CACHE) cache.clear(); // meshes keep theirs; new ones are made again
  cache.set(key, g);
  return g;
}

export function partGeometryCount(THREE) {
  const c = GEOS.get(THREE);
  return c ? c.size : 0;
}

// ---------------------------------------------------------------- procedural surface textures
// Grey-scale pictures (near white) that the part colour is multiplied with;
// they double as the bump map. Painted once per kind.
function paintTexture(ctx, kind, n) {
  const r = (() => { let s = 12345; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const img = ctx.createImageData(n, n);
  const set = (x, y, v) => { const i = (y * n + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.max(0, Math.min(255, v)); img.data[i + 3] = 255; };
  // Tileable value noise.
  const grid = 16, gv = Array.from({ length: grid * grid }, () => r());
  const noise = (x, y, f) => {
    const gx = (x / n) * f, gy = (y / n) * f;
    const x0 = Math.floor(gx), y0 = Math.floor(gy), tx = gx - x0, ty = gy - y0;
    const at = (a, b) => gv[(((b % f) + f) % f) * grid + (((a % f) + f) % f)];
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    return (at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx) * (1 - sy) + (at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx) * sy;
  };
  let rowShade = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let v = 235;
      if (kind === "wood") {
        const warp = noise(x, y, 2) * 30 + noise(x, y, 8) * 5;
        const g = Math.sin(((y + warp) / n) * Math.PI * 2 * 7) * 0.5 + 0.5;
        v = 244 - Math.pow(g, 6) * 22 - noise(x, y, 16) * 8 - r() * 4;
      } else if (kind === "fabric") {
        const weave = ((x >> 1) + (y >> 1)) % 2 ? 8 : 0;
        v = 238 - weave - noise(x, y, 16) * 14 - r() * 10;
      } else if (kind === "leather") {
        const cell = noise(x, y, 16) * 0.6 + noise(x, y, 8) * 0.4;
        v = 242 - Math.abs(cell - 0.5) * 50 - r() * 6;
      } else if (kind === "marble") {
        // Soft clouds and a few thin, wandering veins.
        const t = Math.sin(((x * 0.6 + y) / n) * Math.PI * 2 + (noise(x, y, 4) * 2 + noise(x, y, 16) * 0.6) * 2.2);
        v = 248 - noise(x, y, 4) * 9 - noise(x, y, 16) * 4 - Math.pow(1 - Math.abs(t), 60) * 55;
      } else if (kind === "speckle") {
        v = 236 - noise(x, y, 8) * 18 - r() * 18;
      } else if (kind === "granite") {
        const k = r();
        v = k < 0.12 ? 150 + r() * 40 : k > 0.93 ? 255 : 215 - noise(x, y, 16) * 25 + r() * 15;
      } else if (kind === "leaf") {
        const vein = Math.abs(((x / n) * 8) % 1 - 0.5) < 0.04 ? 18 : 0;
        v = 240 - vein - noise(x, y, 8) * 26;
      } else if (kind === "brushed") {
        // Fine streaks along x: each row a little lighter or darker.
        if (x === 0) rowShade = (r() - 0.5) * 7;
        v = 238 + rowShade - r() * 3;
      } else if (kind === "perforated") {
        const cx = (x % 8) - 3.5, cy = (y % 8) - 3.5;
        v = cx * cx + cy * cy < 6 ? 120 : 236;
      } else if (kind === "bark") {
        const s = Math.sin(((x + noise(x, y, 4) * 30) / n) * Math.PI * 2 * 10) * 0.5 + 0.5;
        v = 230 - s * 50 - noise(x, y, 16) * 20;
      }
      set(x, y, Math.round(v));
    }
  }
  ctx.putImageData(img, 0, 0);
}

const TEXTURES = new WeakMap();
export function surfaceTexture(THREE, kind, tile) {
  if (typeof document === "undefined") return null;
  let m = TEXTURES.get(THREE);
  if (!m) TEXTURES.set(THREE, (m = new Map()));
  const key = `${kind}:${tile}`;
  if (m.has(key)) return m.get(key);
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  paintTexture(c.getContext("2d"), kind, 256);
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  tx.repeat.set(1000 / tile, 1000 / tile);
  tx.anisotropy = 4;
  m.set(key, tx);
  return tx;
}

// ---------------------------------------------------------------- one mesh per material
// Pieces [{geometry, matrix}] merged into one non-indexed geometry (position,
// normal, uv): an item's parts of the same surface become one mesh.
export function mergePieces(THREE, pieces) {
  let n = 0;
  const flat = pieces.map(({ geometry, matrix }) => { const g = geometry.index ? geometry.toNonIndexed() : geometry; n += g.attributes.position.count; return { g, matrix }; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  const v = new THREE.Vector3(), nm = new THREE.Matrix3();
  let o = 0;
  for (const { g, matrix } of flat) {
    nm.getNormalMatrix(matrix);
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(matrix);
      pos[(o + i) * 3] = v.x; pos[(o + i) * 3 + 1] = v.y; pos[(o + i) * 3 + 2] = v.z;
      if (N) { v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor[(o + i) * 3] = v.x; nor[(o + i) * 3 + 1] = v.y; nor[(o + i) * 3 + 2] = v.z; }
      if (U) { uv[(o + i) * 2] = U.getX(i); uv[(o + i) * 2 + 1] = U.getY(i); }
    }
    o += P.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  out.userData.furniturePart = true;
  return out;
}

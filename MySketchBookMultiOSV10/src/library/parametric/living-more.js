// More living items (designs + preset variants of living.js entries). See ARCHITECTURE.md §12 → Library objects.
// Chairs that are not sofas/armchairs (rocking, egg, bean bag), poufs, coffee/side tables,
// living storage (media wall, vitrine, bar and record cabinets, shelves), screens, mirrors,
// fireside pieces, piano and a game table set.
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  THREE, Kit, item, P, variant, T, rng, boxUV, roundRect, ellipse, superEllipse, frameShape,
  shellGeo, pillowGeo, softBoxGeo, addCabinet, addHandle, addPot, leafGeo, placeLeaf,
} from './helpers.js';
import { addBooks, shelfCase } from './living.js';

/* ------------------------------------------------------------- helpers */

/** Runs fn(k) and moves/rotates only the parts it added (rotation XYZ, then translation). */
function xform(k, fn, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0 } = {}) {
  const before = new Map([...k.parts].map(([key, p]) => [key, p.geos.length]));
  const nl = k.lights.length;
  fn(k);
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
  for (const [key, p] of k.parts) {
    const from = before.get(key) ?? 0;
    for (let i = from; i < p.geos.length; i++) { p.geos[i].applyMatrix4(m); boxUV(p.geos[i]); }
  }
  for (let i = nl; i < k.lights.length; i++) {
    const l = k.lights[i];
    const v = new THREE.Vector3(l.x, l.y, l.z).applyMatrix4(m);
    l.x = v.x; l.y = v.y; l.z = v.z;
  }
}

/** Builds the group and moves its geometry so the bbox sits on y = 0, centred in x and z. */
function centred(k) {
  const g = k.group();
  const b = new THREE.Box3().setFromObject(g);
  const dx = -(b.min.x + b.max.x) / 2, dy = -b.min.y, dz = -(b.min.z + b.max.z) / 2;
  for (const c of g.children) {
    if (c.isMesh) { c.geometry.translate(dx, dy, dz); c.geometry.computeBoundingBox(); c.geometry.computeBoundingSphere(); }
    else c.position.add(new THREE.Vector3(dx, dy, dz));
  }
  return g;
}

/** Rectangular bar from a to b (sx across, sy "up" section), rounded edges. `side` = hint for the bar's x axis. */
function beam(k, role, mat, a, b, sx, sy, o = {}) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const dir = B.clone().sub(A);
  const len = dir.length() + (o.ext ?? 0);
  dir.normalize();
  const hint = o.side ? new THREE.Vector3(...o.side) : Math.abs(dir.x) > 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
  const xA = hint.sub(dir.clone().multiplyScalar(hint.dot(dir))).normalize();
  const yA = new THREE.Vector3().crossVectors(dir, xA);
  const r = Math.min(o.r ?? 0.004, sx / 2.01, sy / 2.01, len / 2.01);
  const geo = k.hi && r > 0.0005 ? new RoundedBoxGeometry(sx, sy, len, o.segs ?? 2, r) : new THREE.BoxGeometry(sx, sy, len);
  const m = new THREE.Matrix4().makeBasis(xA, yA, dir);
  m.setPosition(A.clone().add(B).multiplyScalar(0.5));
  geo.applyMatrix4(m);
  return k.add(role, mat, geo, o);
}

/** Box whose cross-section tapers from wTop (at y0 + h) to wBot (at y0): square furniture legs. */
function taperLeg(k, role, mat, wTop, wBot, h, x, z, y0 = 0, o = {}) {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, 0.5, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const s = p.getY(i) > 0.5 ? wTop : wBot;
    p.setXYZ(i, p.getX(i) * s, y0 + p.getY(i) * h, p.getZ(i) * s);
  }
  g.computeVertexNormals();
  T(g, x, 0, z, 0, o.ry ?? 0, 0);
  return k.add(role, mat, g, o);
}

/** Small decorative vase (lathe), bottom at y. */
function vase(k, role, mat, x, y, z, h, r, style = 0, o = {}) {
  const prof = style === 1
    ? [[0, 0], [r * 0.6, 0], [r, h * 0.3], [r * 0.9, h * 0.65], [r * 0.38, h * 0.88], [r * 0.42, h], [r * 0.34, h], [r * 0.3, h * 0.9], [0, h * 0.86]]
    : style === 2
      ? [[0, 0], [r * 0.5, 0], [r * 0.9, h * 0.2], [r, h * 0.55], [r * 0.85, h * 0.9], [r * 0.92, h], [r * 0.82, h], [0, h * 0.94]]
      : [[0, 0], [r * 0.7, 0], [r * 0.95, h * 0.45], [r * 0.55, h * 0.78], [r * 0.32, h * 0.92], [r * 0.36, h], [r * 0.28, h], [0, h * 0.93]];
  k.lathe(role, mat, prof, x, y, z, { smooth: 14, segs: k.seg(24, 8), ...o });
}

/** Closed rounded-rectangle path (straight sides + quadratic corners) for piping tubes. */
function loopCurve(w, d, r, y) {
  const x = w / 2, z = d / 2;
  r = Math.min(r, x * 0.95, z * 0.95);
  const V = (a, b) => new THREE.Vector3(a, y, b);
  const c = [[[x, z - r], [x, z], [x - r, z]], [[-x + r, z], [-x, z], [-x, z - r]], [[-x, -z + r], [-x, -z], [-x + r, -z]], [[x - r, -z], [x, -z], [x, -z + r]]];
  const path = new THREE.CurvePath();
  for (let i = 0; i < 4; i++) {
    const [a, b, e] = c[i];
    path.add(new THREE.QuadraticBezierCurve3(V(...a), V(...b), V(...e)));
    path.add(new THREE.LineCurve3(V(...e), V(...c[(i + 1) % 4][0])));
  }
  return path;
}

/** Piping loop around a w × d rectangle at height y. */
function piping(k, role, mat, w, d, r, y, tr = 0.006) {
  k.tube(role, mat, null, tr, { curve: loopCurve(w, d, r, y), closed: true, segs: k.seg(Math.round((w + d) * 2 / 0.025) + 24, 24), radial: k.seg(6, 3) });
}

const WOOD_DEFAULT = 'wood-oak';

/* ============================================================== seating */

/** Rocker runner profile drawn as a shape in (−z, y) for a panel turned ry = π/2. */
function rockerShape(R, z0, z1, t, n) {
  const yb = (z) => R - Math.sqrt(R * R - z * z);
  const pts = [];
  for (let i = 0; i <= n; i++) { const z = z0 + ((z1 - z0) * i) / n; pts.push(new THREE.Vector2(-z, yb(z))); }
  for (let i = n; i >= 0; i--) { const z = z0 + ((z1 - z0) * i) / n; pts.push(new THREE.Vector2(-z, yb(z) + t)); }
  return new THREE.Shape(pts);
}

const rockingChair = item({
  id: 'living-rocking-chair', category: 'living', ko: '흔들의자', en: 'Rocking chair', size: [0.56, 1, 0.9],
  params: [
    P.mat('wood', '나무', 'Wood', 'wood-teak', 'wood'),
    P.mat('fabric', '방석 천', 'Pad fabric', 'fabric-linen-beige', 'fabric'),
    P.bool('cushion', '방석', 'Seat pad', true),
  ],
  tags: ['rocking chair', 'rocker', 'windsor', '흔들의자', '흔들 의자', '원목 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.wood;
    const R = 1.1, rt = 0.032, xr = 0.235;
    const top = (z) => R - Math.sqrt(R * R - z * z) + rt;
    for (const s of [-1, 1]) k.panel('frame', W, rockerShape(R, -0.46, 0.44, rt, k.seg(24, 8)), 0.03, s * xr, 0, 0, { ry: Math.PI / 2, bevel: 0.006 });
    const zf = 0.17, zb = -0.17;
    for (const s of [-1, 1]) {
      // front leg rises through the seat into an arm post, back leg rakes back into the back post
      k.rod('frame', W, [s * xr, top(zf) - 0.01, zf], [s * xr, 0.63, zf + 0.02], 0.017, { r2: 0.015 });
      k.sphere('frame', W, 0.021, s * xr, 0.3, zf + 0.007, { scale: [1, 1.5, 1], segs: k.seg(12, 6), rings: k.seg(8, 4) });
      k.rod('frame', W, [s * xr, top(zb) - 0.01, zb], [s * 0.215, 1.0, -0.33], 0.018, { r2: 0.015 });
      beam(k, 'frame', W, [s * 0.245, 0.635, 0.27], [s * 0.235, 0.66, -0.285], 0.065, 0.024, { r: 0.008 });
      k.rod('frame', W, [s * 0.234, 0.2, 0.176], [s * 0.232, 0.2, -0.196], 0.011);
    }
    k.rod('frame', W, [-xr, 0.24, 0.178], [xr, 0.24, 0.178], 0.011);
    // saddle seat, front edge a little higher
    k.box('frame', W, 0.52, 0.035, 0.47, 0, 0.42, 0, { r: 0.012, segs: 2, rx: -0.06 });
    // spindles + curved crest rail, leaning back with the posts
    const n = 7;
    for (let i = 0; i < n; i++) {
      const x = -0.15 + (0.3 * i) / (n - 1);
      k.rod('frame', W, [x, 0.43, -0.2], [x * 1.1, 0.93, -0.316], 0.008, { r2: 0.007 });
    }
    const crest = new THREE.Shape();
    const cw = 0.25;
    crest.moveTo(-cw, 0); crest.lineTo(cw, 0);
    crest.quadraticCurveTo(cw + 0.01, 0.045, cw, 0.075);
    crest.quadraticCurveTo(0, 0.115, -cw, 0.075);
    crest.quadraticCurveTo(-cw - 0.01, 0.045, -cw, 0);
    k.panel('frame', W, crest, 0.03, 0, 0.9, -0.322, { rx: -0.23, bevel: 0.008 });
    if (p.cushion) {
      k.soft('cushion', p.fabric, 0.44, 0.045, 0.42, 0.02, 0, 0.462, 0.005, { puff: 0.012, rx: -0.06 });
      // tie strings to the back spindles
      for (const s of [-1, 1]) k.rod('cushion', p.fabric, [s * 0.15, 0.47, -0.2], [s * 0.15, 0.53, -0.21], 0.004, { segs: 4 });
    }
    return k.group();
  },
});

/**
 * Egg-shaped shell around the y axis with an opening at the front (+z) between heights v0..v1.
 * Inner surface = the parametric surface; the thickness grows outwards.
 */
function eggShell(k, role, mat, { rx, rz, y0, h, open, v0, v1, thick, bulge = 0.12 }) {
  const a0 = (v) => (v <= v0 || v >= v1 ? 0 : open * Math.sin((Math.PI * (v - v0)) / (v1 - v0)) ** 0.55);
  const prof = (v) => { const f = Math.PI * v; return [Math.sin(f) * (1 + bulge * Math.cos(f)), y0 + (h * (1 - Math.cos(f))) / 2]; };
  const fn = (u, v) => {
    const a = a0(v);
    const th = a + u * (2 * Math.PI - 2 * a);
    const [r, y] = prof(v);
    return [rx * r * Math.sin(th), y, rz * r * Math.cos(th)];
  };
  k.add(role, mat, shellGeo(k.seg(56, 18), k.seg(32, 12), fn, thick));
  // rolled rim along the opening
  const rim = [];
  const nn = k.seg(28, 10);
  const at = (v, sgn) => { const a = a0(v) * sgn; const [r, y] = prof(v); return [(rx * r + thick / 2) * Math.sin(a), y, (rz * r + thick / 2) * Math.cos(a)]; };
  for (let i = 0; i <= nn; i++) rim.push(at(v0 + ((Math.min(v1, 1) - v0) * i) / nn, 1));
  for (let i = nn - 1; i > 0; i--) rim.push(at(v0 + ((Math.min(v1, 1) - v0) * i) / nn, -1));
  return { a0, prof, rim };
}

const hangingEgg = item({
  id: 'living-hanging-egg-chair', category: 'living', ko: '행잉 에그 체어', en: 'Hanging egg chair', size: [0.94, 2.06, 1.07],
  params: [
    P.mat('shell', '바구니', 'Basket', 'rattan', 'wood'),
    P.mat('stand', '거치대', 'Stand', 'metal-black', 'metal'),
    P.mat('fabric', '쿠션 천', 'Cushion fabric', 'fabric-linen-white', 'fabric'),
  ],
  tags: ['hanging chair', 'egg chair', 'swing chair', '행잉 체어', '에그 체어', '그네 의자', '라탄'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const rx = 0.44, rz = 0.4, y0 = 0.42, h = 1.12, thick = 0.018;
    const { a0, prof, rim } = eggShell(k, 'basket', p.shell, { rx, rz, y0, h, open: 1.25, v0: 0.2, v1: 0.9, thick });
    k.tube('basket', p.shell, rim, 0.016, { closed: true, radial: k.seg(8, 4) });
    // woven bands around the basket
    const nr = k.hi ? 15 : 6;
    for (let i = 0; i < nr; i++) {
      const v = 0.06 + (0.9 * i) / (nr - 1);
      const a = a0(v), [r, y] = prof(v);
      const pts = [];
      const ns = k.seg(44, 14);
      for (let j = 0; j <= ns; j++) {
        const th = a + 0.03 + (j / ns) * (2 * Math.PI - 2 * a - 0.06);
        pts.push([(rx * r + thick + 0.002) * Math.sin(th), y, (rz * r + thick + 0.002) * Math.cos(th)]);
      }
      k.tube('basket', p.shell, pts, 0.0055, { closed: a === 0, radial: k.seg(5, 3) });
    }
    // seat cushion in the bowl + back pillow
    k.lathe('cushion', p.fabric, [[0, 0], [0.2, 0], [0.26, 0.03], [0.31, 0.08], [0.31, 0.12], [0.27, 0.155], [0.15, 0.165], [0, 0.16]], 0, 0.5, 0, { smooth: 18, segs: k.seg(32, 10), scale: [1, 1, rz / rx] });
    const g = pillowGeo(0.5, 0.44, 0.15, k.seg(14, 5));
    T(g, 0, 0.9, -0.2, -0.3, 0, 0);
    k.add('cushion', p.fabric, g);
    // stand: domed base, arched pole, chain
    k.lathe('stand', p.stand, [[0, 0], [0.4, 0], [0.41, 0.01], [0.39, 0.035], [0.22, 0.065], [0.06, 0.075], [0, 0.075]], 0, 0, 0, { smooth: 12, segs: k.seg(36, 10) });
    k.tube('stand', p.stand, [[0, 0.04, -0.36], [0, 0.5, -0.56], [0, 1.2, -0.62], [0, 1.75, -0.5], [0, 2.0, -0.22], [0, 2.03, -0.01]], 0.028, { caps: true, radial: k.seg(12, 6) });
    const top = y0 + h;
    k.add('stand', p.stand, new THREE.TorusGeometry(0.03, 0.006, k.seg(6, 3), k.seg(16, 6)).translate(0, top + 0.02, 0));
    const links = Math.round((2.0 - top - 0.05) / 0.03);
    for (let i = 0; i < links; i++) {
      const tg = new THREE.TorusGeometry(0.016, 0.0035, k.seg(5, 3), k.seg(12, 5)).scale(1, 1.4, 1);
      if (i % 2) tg.rotateY(Math.PI / 2);
      k.add('stand', p.stand, tg.translate(0, top + 0.06 + i * 0.03, 0));
    }
    return centred(k);
  },
});

const eggChair = item({
  id: 'living-egg-chair', category: 'living', ko: '에그 스윙 체어', en: 'Egg swivel chair', size: [0.93, 1.15, 0.75],
  params: [
    P.mat('fabric', '천', 'Fabric', 'fabric-velvet-blue', 'fabric'),
    P.mat('cushion', '방석 천', 'Cushion fabric', 'fabric-velvet-blue', 'fabric'),
    P.mat('base', '받침', 'Base', 'metal-aluminium', 'metal'),
  ],
  tags: ['egg chair', 'swivel chair', 'pod chair', '에그 체어', '회전 의자', '라운지 체어'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const rx = 0.42, rz = 0.4, y0 = 0.3, h = 0.82, thick = 0.035;
    xform(k, () => {
      const { rim } = eggShell(k, 'shell', p.fabric, { rx, rz, y0, h, open: 1.6, v0: 0.14, v1: 1.08, thick, bulge: 0.15 });
      k.tube('shell', p.fabric, rim, 0.026, { closed: true, radial: k.seg(10, 5) });
      k.lathe('cushion', p.cushion, [[0, 0], [0.2, 0], [0.25, 0.03], [0.3, 0.07], [0.3, 0.1], [0.26, 0.125], [0.12, 0.135], [0, 0.13]], 0, 0.345, 0.0, { smooth: 18, segs: k.seg(32, 10), scale: [1, 1, rz / rx] });
    }, { rx: -0.1, z: 0.03 });
    // 4-star swivel base
    k.cyl('base', p.base, 0.03, 0.035, 0.3, 0, 0.03, 0, { segs: k.seg(18, 8) });
    k.cyl('base', p.base, 0.09, 0.09, 0.02, 0, 0.3, 0, { segs: k.seg(24, 8) });
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      const ex = Math.sin(a) * 0.36, ez = Math.cos(a) * 0.36;
      beam(k, 'base', p.base, [0, 0.045, 0], [ex, 0.022, ez], 0.05, 0.03, { r: 0.008 });
      k.cyl('base', 'rubber-black', 0.018, 0.018, 0.01, ex, 0, ez, { segs: k.seg(12, 6) });
    }
    return centred(k);
  },
});

const beanBag = item({
  id: 'living-bean-bag', category: 'living', ko: '빈백', en: 'Bean bag chair', size: [0.94, 0.77, 0.94],
  params: [
    P.len('width', '폭', 'Width', 0.9, 0.6, 1.2),
    P.len('height', '높이', 'Height', 0.85, 0.55, 1.05),
    P.mat('fabric', '천', 'Fabric', 'fabric-linen-grey', 'fabric'),
  ],
  tags: ['bean bag', 'beanbag', 'lazy chair', '빈백', '빈백 소파', '쿠션 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.width / 2, H = p.height;
    const g = new THREE.SphereGeometry(1, k.seg(44, 16), k.seg(30, 12));
    const pos = g.attributes.position;
    const wr = rng(5);
    const ph = [wr() * 6, wr() * 6];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const t = (y + 1) / 2;
      const rr = R * (1 + 0.1 * (1 - t));
      const xx = x * rr, zz = z * rr;
      let yy = H * t ** 1.35;
      const up = Math.max(0, y);
      const dent = Math.exp(-((xx / (R * 0.6)) ** 2 + ((zz - R * 0.25) / (R * 0.55)) ** 2));
      yy -= H * 0.42 * dent * up;
      yy += H * 0.1 * Math.max(0, -zz / R) * up;
      // filled-fabric wrinkles
      yy += 0.006 * Math.sin(xx * 23 + ph[0]) * Math.sin(zz * 19 + ph[1]) * up;
      pos.setXYZ(i, xx, Math.max(0, yy), zz);
    }
    g.deleteAttribute('uv');
    g.computeVertexNormals();
    k.add('bag', p.fabric, g);
    return centred(k);
  },
});

/* ================================================================ poufs */

const pouf = item({
  id: 'living-pouf-knitted', category: 'living', ko: '니트 푸프', en: 'Chunky knit pouf', size: [0.5, 0.36, 0.5],
  params: [
    P.len('diameter', '지름', 'Diameter', 0.5, 0.4, 0.7),
    P.len('height', '높이', 'Height', 0.36, 0.3, 0.45),
    P.mat('fabric', '실', 'Yarn', 'fabric-boucle', 'fabric'),
  ],
  tags: ['pouf', 'knitted pouf', 'footstool', '푸프', '니트 푸프', '뜨개 쿠션', '발받침'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2 - 0.012, h = p.height;
    const F = p.fabric;
    k.lathe('knit', F, [[0, 0], [R * 0.85, 0], [R * 0.97, 0.02], [R, 0.07], [R, h - 0.07], [R * 0.96, h - 0.025], [R * 0.82, h - 0.004], [0, h]], 0, 0, 0, { smooth: 22, segs: k.seg(40, 12) });
    // V stitches in columns around the side
    const cols = Math.round((2 * Math.PI * R) / 0.07);
    const rows = Math.max(3, Math.round((h - 0.1) / 0.05));
    const y0 = 0.05, dy = (h - 0.1) / (rows - 1);
    const segs = k.seg(8, 5), rings = k.seg(5, 3);
    for (let c = 0; c < cols; c++) {
      const th = (c / cols) * Math.PI * 2;
      const nx = Math.sin(th), nz = Math.cos(th), tx = Math.cos(th), tz = -Math.sin(th);
      for (let r = 0; r < rows; r++) {
        const y = y0 + r * dy;
        const legs = k.hi ? [-1, 1] : [0];
        for (const s of legs) {
          const off = s * 0.0095;
          k.sphere('knit', F, 1, nx * (R + 0.003) + tx * off, y, nz * (R + 0.003) + tz * off, { scale: k.hi ? [0.0135, 0.029, 0.011] : [0.024, 0.028, 0.011], ry: th, rz: s * 0.5, segs, rings });
        }
      }
    }
    // spiral of chunky loops on the top
    for (const [rr, n] of [[R * 0.72, Math.round(cols * 0.72)], [R * 0.42, Math.round(cols * 0.42)]]) {
      k.add('knit', F, new THREE.TorusGeometry(rr, 0.013, k.seg(8, 4), k.seg(n * 2, 12)).rotateX(Math.PI / 2).translate(0, h - 0.008 - (rr / R) * 0.012, 0));
    }
    k.sphere('knit', F, 0.03, 0, h - 0.012, 0, { scale: [1, 0.5, 1], segs: k.seg(12, 6), rings: k.seg(6, 3) });
    return k.group();
  },
});

/** 8-point star outline for embroidered tops. */
function starShape(ro, ri, n = 8) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 ? ri : ro;
    pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  return new THREE.Shape(pts);
}

const leatherPouf = item({
  id: 'living-pouf-leather', category: 'living', ko: '가죽 모로칸 푸프', en: 'Leather Moroccan pouf', size: [0.52, 0.41, 0.52],
  params: [
    P.len('width', '폭', 'Width', 0.5, 0.4, 0.7),
    P.len('height', '높이', 'Height', 0.38, 0.3, 0.46),
    P.mat('leather', '가죽', 'Leather', 'leather-cognac', 'leather'),
    P.mat('stitch', '자수', 'Embroidery', 'leather-white', 'leather'),
  ],
  tags: ['pouf', 'leather pouf', 'moroccan pouf', 'ottoman', '푸프', '가죽 푸프', '모로칸'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, r = 0.06, amt = 0.03;
    const g = softBoxGeo(w, h, w, r, { round: k.hi ? 3 : 1, flat: k.hi ? 6 : 2, puff: amt });
    const pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++) if (pa.getY(i) < -h / 2) pa.setY(i, -h / 2);
    g.computeVertexNormals();
    g.translate(0, h / 2, 0);
    k.add('leather', p.leather, g);
    // piped seams on the rounded edges
    const e = r * (1 - Math.SQRT1_2);
    piping(k, 'piping', p.leather, w - 2 * e, w - 2 * e, r * 0.7, h - e);
    piping(k, 'piping', p.leather, w - 2 * e, w - 2 * e, r * 0.7, e);
    // embroidered star following the domed top
    const star = new THREE.ExtrudeGeometry(starShape(w * 0.26, w * 0.15), { depth: 0.003, bevelEnabled: false, curveSegments: 4 });
    star.rotateX(-Math.PI / 2);
    const sp = star.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      const u = sp.getX(i) / (w / 2), v = sp.getZ(i) / (w / 2);
      sp.setY(i, sp.getY(i) + h + amt * (1 - u * u) * (1 - v * v) - 0.001);
    }
    star.computeVertexNormals();
    k.add('stitch', p.stitch, star);
    return k.group();
  },
});

const footstool = item({
  id: 'living-footstool', category: 'living', ko: '터프팅 풋스툴', en: 'Tufted footstool', size: [0.63, 0.43, 0.46],
  params: [
    P.len('width', '폭', 'Width', 0.62, 0.4, 1.0),
    P.len('depth', '깊이', 'Depth', 0.45, 0.35, 0.7),
    P.mat('fabric', '천', 'Upholstery', 'fabric-velvet-green', 'fabric'),
    P.mat('wood', '다리', 'Legs', 'wood-walnut', 'wood'),
  ],
  tags: ['footstool', 'foot rest', 'tufted stool', '풋스툴', '발받침', '스툴'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = p.depth, legH = 0.17, ph = 0.24;
    // buttoned top: soft box with dimples pulled in at the buttons
    const g = softBoxGeo(w, ph, d, 0.05, { round: k.hi ? 3 : 1, flat: k.hi ? 18 : 6, puff: 0.02 });
    const nx = Math.max(2, Math.round(w / 0.2)), nz = Math.max(1, Math.round(d / 0.22));
    const btn = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) btn.push([-w / 2 + (w / nx) * (i + 0.5) + (j % 2 ? w / nx / 4 : -w / nx / 4) * (nz > 1 ? 1 : 0), -d / 2 + (d / nz) * (j + 0.5)]);
    const pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      if (pa.getY(i) < ph / 2 - 0.03) continue;
      let dip = 0;
      for (const [bx, bz] of btn) dip = Math.max(dip, Math.exp(-((pa.getX(i) - bx) ** 2 + (pa.getZ(i) - bz) ** 2) / 0.0012));
      pa.setY(i, pa.getY(i) - dip * 0.026);
    }
    g.computeVertexNormals();
    g.translate(0, legH + ph / 2, 0);
    k.add('upholstery', p.fabric, g);
    for (const [bx, bz] of btn) {
      const u = bx / (w / 2), v = bz / (d / 2);
      k.sphere('upholstery', p.fabric, 0.012, bx, legH + ph + 0.02 * (1 - u * u) * (1 - v * v) - 0.026, bz, { scale: [1, 0.6, 1], segs: k.seg(10, 5), rings: k.seg(6, 3) });
    }
    // turned legs with brass cups
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * (w / 2 - 0.06), z = sz * (d / 2 - 0.06);
      k.lathe('legs', p.wood, [[0, 0.025], [0.016, 0.025], [0.02, 0.06], [0.024, 0.1], [0.02, 0.14], [0.026, legH], [0, legH + 0.005]], x, 0, z, { smooth: 10, segs: k.seg(14, 6) });
      k.cyl('caps', 'metal-brass', 0.017, 0.015, 0.026, x, 0, z, { segs: k.seg(14, 6) });
    }
    return k.group();
  },
});

/* ============================================================== tables */

const TOP_STONE = 'marble-white';

const nesting = item({
  id: 'living-nesting-tables', category: 'living', ko: '네스팅 테이블 세트', en: 'Nesting tables (set)', size: [0.55, 0.49, 0.74],
  params: [
    P.int('count', '개수', 'Tables', 3, 2, 3),
    P.mat('top', '상판', 'Tops', 'wood-walnut', 'wood'),
    P.mat('frame', '프레임', 'Frame', 'metal-brass', 'metal'),
  ],
  tags: ['nesting tables', 'nest of tables', 'side table set', '네스팅 테이블', '보조 테이블', '세트 테이블'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const sets = [[0.55, 0.48, 0.5], [0.45, 0.4, 0.44], [0.36, 0.33, 0.38]].slice(0, p.count);
    sets.forEach(([w, d, h], i) => {
      const ox = 0, oz = i * 0.17;
      const t = 0.02, r = 0.008;
      k.slab('top', p.top, roundRect(w, d, 0.015), t, h - t, { bevel: 0.004, x: ox, z: oz });
      for (const s of [-1, 1]) {
        const x = ox + s * (w / 2 - 0.022);
        k.bentTube('frame', p.frame, [[x, 0.006, oz - d / 2 + 0.03], [x, h - t - r, oz - d / 2 + 0.03], [x, h - t - r, oz + d / 2 - 0.03], [x, 0.006, oz + d / 2 - 0.03]], r, 0.03, { radial: k.seg(10, 5) });
      }
      k.rod('frame', p.frame, [ox - w / 2 + 0.022, h - t - r, oz - d / 2 + 0.03], [ox + w / 2 - 0.022, h - t - r, oz - d / 2 + 0.03], r * 0.8);
    });
    return centred(k);
  },
});

const consoleTable = item({
  id: 'living-console-table', category: 'living', ko: '콘솔 테이블', en: 'Console table', size: [1.2, 0.78, 0.36],
  params: [
    P.len('width', '폭', 'Width', 1.2, 0.8, 1.8),
    P.len('height', '높이', 'Height', 0.78, 0.7, 0.9),
    P.len('depth', '깊이', 'Depth', 0.36, 0.28, 0.45),
    P.mat('wood', '나무', 'Wood', 'wood-walnut', 'wood'),
    P.mat('handle', '손잡이', 'Knobs', 'metal-brass', 'metal'),
    P.bool('shelf', '하단 선반', 'Lower shelf', true),
  ],
  tags: ['console table', 'hall table', 'entryway table', '콘솔', '콘솔 테이블', '현관 테이블'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, d = p.depth, t = 0.03, ls = 0.042;
    k.box('wood', p.wood, w, t, d, 0, h - t / 2, 0, { r: 0.006, segs: 2 });
    const lx = w / 2 - 0.04, lz = d / 2 - 0.04;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) taperLeg(k, 'wood', p.wood, ls, 0.026, h - t, sx * lx, sz * lz);
    // apron with two drawers
    const ah = 0.12, ay = h - t - ah / 2;
    k.box('wood', p.wood, 2 * lx - ls, ah, 2 * lz - ls, 0, ay, 0, { r: 0.002 });
    const fw = (2 * lx - ls) / 2 - 0.004;
    for (const s of [-1, 1]) {
      const cx = s * (fw / 2 + 0.002);
      k.box('fronts', p.wood, fw, ah - 0.014, 0.018, cx, ay, lz - ls / 2 + 0.009, { r: 0.002 });
      addHandle(k, 'handles', p.handle, 'knob', cx, ay, lz - ls / 2 + 0.018);
    }
    if (p.shelf) k.box('wood', p.wood, 2 * lx + 0.004, 0.02, 2 * lz + 0.004, 0, 0.16, 0, { r: 0.003 });
    return k.group();
  },
});

const sofaTable = item({
  id: 'living-sofa-table', category: 'living', ko: '소파 뒤 테이블', en: 'Sofa table', size: [1.5, 0.76, 0.35],
  params: [
    P.len('width', '폭', 'Width', 1.5, 1.0, 2.2),
    P.len('height', '높이', 'Height', 0.76, 0.6, 0.85),
    P.mat('wood', '선반', 'Shelves', 'wood-oak', 'wood'),
    P.mat('frame', '프레임', 'Frame', 'metal-black', 'metal'),
  ],
  tags: ['sofa table', 'behind sofa table', 'narrow table', '소파 테이블', '소파 뒤 테이블', '거실 선반'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, d = 0.35, t = 0.032, s = 0.025;
    k.box('top', p.wood, w, t, d, 0, h - t / 2, 0, { r: 0.006, segs: 2 });
    k.box('top', p.wood, w - 0.1, 0.025, d - 0.06, 0, 0.2, 0, { r: 0.004 });
    const fx = w / 2 - 0.06, fz = d / 2 - 0.04;
    for (const sx of [-1, 1]) {
      const x = sx * fx;
      // trestle end: two posts, floor bar, top bar and the shelf bearer
      for (const sz of [-1, 1]) beam(k, 'frame', p.frame, [x, 0.012, sz * fz], [x, h - t, sz * fz], s, s, { r: 0.003 });
      beam(k, 'frame', p.frame, [x, 0.0125, -fz - s / 2], [x, 0.0125, fz + s / 2], s, s, { r: 0.003, side: [1, 0, 0] });
      beam(k, 'frame', p.frame, [x, h - t - 0.0125, -fz - s / 2], [x, h - t - 0.0125, fz + s / 2], s, s, { r: 0.003, side: [1, 0, 0] });
      beam(k, 'frame', p.frame, [x, 0.2 - 0.025, -fz], [x, 0.2 - 0.025, fz], s, s * 0.8, { r: 0.003, side: [1, 0, 0] });
      k.cyl('frame', 'rubber-black', 0.01, 0.01, 0.004, x, 0, 0, { segs: 6 });
    }
    beam(k, 'frame', p.frame, [-fx, h - t - 0.03, -fz], [fx, h - t - 0.03, -fz], s * 0.8, s, { r: 0.003, side: [0, 0, 1] });
    return k.group();
  },
});

const marbleTable = item({
  id: 'living-coffee-table-marble', category: 'living', ko: '대리석 원형 커피 테이블', en: 'Round marble coffee table', size: [0.9, 0.38, 0.9],
  params: [
    P.len('diameter', '지름', 'Diameter', 0.9, 0.6, 1.2),
    P.len('height', '높이', 'Height', 0.38, 0.3, 0.46),
    P.mat('top', '상판', 'Top', TOP_STONE, 'stone'),
    P.mat('base', '받침', 'Base', 'marble-white', 'stone'),
    P.bool('fluted', '세로 홈', 'Fluted base', true),
  ],
  tags: ['coffee table', 'marble table', 'round coffee table', '커피 테이블', '대리석 테이블', '원형 테이블'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const D = p.diameter, h = p.height, t = 0.03;
    k.slab('top', p.top, ellipse(D, D), t, h - t, { bevel: 0.008, bevelSegs: 3, curveSegs: 64 });
    const rc = D * 0.22;
    k.cyl('base', p.base, rc + 0.03, rc + 0.035, 0.022, 0, 0, 0, { segs: k.seg(40, 12) });
    k.cyl('base', p.base, rc + 0.025, rc + 0.025, 0.018, 0, h - t - 0.018, 0, { segs: k.seg(40, 12) });
    const ch = h - t - 0.04;
    if (p.fluted) {
      k.cyl('base', p.base, rc * 0.93, rc * 0.93, ch, 0, 0.022, 0, { segs: k.seg(32, 10) });
      const n = k.hi ? 30 : 16, rr = Math.PI * rc / n;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        k.cyl('base', p.base, rr, rr, ch, Math.sin(a) * (rc - rr * 0.6), 0.022, Math.cos(a) * (rc - rr * 0.6), { segs: k.seg(10, 5) });
      }
    } else {
      k.cyl('base', p.base, rc, rc, ch, 0, 0.022, 0, { segs: k.seg(40, 12) });
    }
    return k.group();
  },
});

const ovalTable = item({
  id: 'living-coffee-table-oval', category: 'living', ko: '타원 원목 커피 테이블', en: 'Oval wood coffee table', size: [1.3, 0.36, 0.7],
  params: [
    P.len('width', '폭', 'Width', 1.3, 0.9, 1.8),
    P.len('depth', '깊이', 'Depth', 0.7, 0.5, 0.95),
    P.len('height', '높이', 'Height', 0.36, 0.3, 0.45),
    P.mat('wood', '나무', 'Wood', 'wood-walnut', 'wood'),
  ],
  tags: ['coffee table', 'oval table', 'pebble table', '커피 테이블', '타원 테이블', '원목 테이블'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = p.depth, h = p.height, t = 0.045;
    k.slab('top', p.wood, superEllipse(w, d, 2.5, k.seg(72, 28)), t, h - t, { bevel: 0.016, bevelSegs: 4 });
    // twin pill-shaped pedestals, set in from the ends
    for (const s of [-1, 1]) k.slab('top', p.wood, superEllipse(0.13, d * 0.62, 2.2, k.seg(36, 16)), h - t + 0.002, 0, { bevel: 0.008, x: s * w * 0.3 });
    return k.group();
  },
});

const brassTable = item({
  id: 'living-coffee-table-brass', category: 'living', ko: '브라스 프레임 유리 커피 테이블', en: 'Glass & brass coffee table', size: [1.11, 0.48, 0.61],
  params: [
    P.len('width', '폭', 'Width', 1.1, 0.7, 1.5),
    P.len('depth', '깊이', 'Depth', 0.6, 0.45, 0.9),
    P.len('height', '높이', 'Height', 0.41, 0.32, 0.48),
    P.mat('frame', '프레임', 'Frame', 'metal-brass', 'metal'),
    P.mat('glass', '유리', 'Glass', 'glass-clear', 'glass'),
    P.bool('decor', '소품', 'Styling', true),
  ],
  tags: ['coffee table', 'glass table', 'brass table', '커피 테이블', '유리 테이블', '브라스'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = p.depth, H = p.height - 0.01, s = 0.016, F = p.frame;
    const x = w / 2 - s / 2, z = d / 2 - s / 2, ys = 0.11;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', F, s, H, s, sx * x, H / 2, sz * z, { r: 0.002 });
    for (const y of [H - s / 2, ys]) {
      for (const sz of [-1, 1]) k.box('frame', F, w - 2 * s, s, s, 0, y, sz * z, { r: 0.002 });
      for (const sx of [-1, 1]) k.box('frame', F, s, s, d - 2 * s, sx * x, y, 0, { r: 0.002 });
    }
    k.box('glass', p.glass, w + 0.01, 0.01, d + 0.01, 0, H + 0.005, 0, { r: 0.002 });
    k.box('glass', p.glass, w - 2 * s, 0.008, d - 2 * s, 0, ys + s / 2 + 0.004, 0, { r: 0 });
    if (p.decor) {
      // a book stack on the shelf and a bowl on top
      const by = ys + s / 2 + 0.008;
      [['book-cream', 0.3, 0.22], ['book-blue', 0.27, 0.2], ['book-red', 0.24, 0.18]].forEach(([m, bw, bd], i) => k.box('books', m, bw, 0.03, bd, -w * 0.18 + i * 0.006, by + 0.015 + i * 0.03, 0.02 - i * 0.008, { r: 0.002, ry: i * 0.08 }));
      k.lathe('bowl', 'ceramic-matte', [[0, 0], [0.06, 0], [0.11, 0.03], [0.14, 0.07], [0.135, 0.072], [0.1, 0.04], [0, 0.03]], w * 0.18, H + 0.01, 0, { smooth: 10, segs: k.seg(28, 10) });
    }
    return k.group();
  },
});

const liftTable = item({
  id: 'living-coffee-table-lift', category: 'living', ko: '리프트업 커피 테이블', en: 'Lift-top coffee table', size: [1.1, 0.58, 0.67],
  params: [
    P.len('width', '폭', 'Width', 1.1, 0.9, 1.4),
    P.mat('body', '몸체', 'Body', 'wood-white', 'wood'),
    P.mat('top', '상판', 'Top', 'wood-oak', 'wood'),
    P.bool('raised', '상판 올림', 'Top raised', true),
  ],
  tags: ['lift top coffee table', 'storage coffee table', 'coffee table', '리프트 테이블', '수납 커피 테이블', '커피 테이블'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.6, H = 0.42, legH = 0.07, t = 0.022;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) taperLeg(k, 'legs', p.top, 0.04, 0.03, legH, sx * (w / 2 - 0.05), sz * (d / 2 - 0.05));
    const bh = H - legH - t;
    k.box('body', p.body, w, bh, d, 0, legH + bh / 2, 0, { r: 0.004 });
    // two drawers in the front
    const fw = w / 2 - 0.03;
    for (const s of [-1, 1]) {
      k.box('body', p.body, fw, 0.13, 0.012, s * (fw / 2 + 0.006), legH + 0.11, d / 2 + 0.006, { r: 0.003 });
      k.box('handles', 'metal-black', 0.12, 0.012, 0.018, s * (fw / 2 + 0.006), legH + 0.165, d / 2 + 0.015, { r: 0.003 });
    }
    // fixed back top + lifting front top
    const backD = 0.18, liftD = d - backD - 0.004;
    k.box('top', p.top, w, t, backD, 0, H - t / 2, -d / 2 + backD / 2, { r: 0.004 });
    const ly = p.raised ? 0.16 : 0, lz = p.raised ? 0.07 : 0;
    k.box('top', p.top, w - 0.02, t, liftD, 0, H - t / 2 + ly, d / 2 - liftD / 2 + lz, { r: 0.004 });
    if (p.raised) {
      // storage well under the lid + the two lift mechanisms
      k.box('well', 'wood-black', w - 0.06, 0.004, liftD - 0.03, 0, H - t + 0.002, d / 2 - liftD / 2, { r: 0 });
      for (const s of [-1, 1]) {
        const x = s * (w / 2 - 0.09);
        beam(k, 'mech', 'metal-black', [x, H - t, d / 2 - liftD + 0.03], [x, H - t + ly, d / 2 - liftD + 0.03 + lz + 0.04], 0.012, 0.025, { r: 0.002 });
        beam(k, 'mech', 'metal-black', [x, H - t, d / 2 - 0.08], [x, H - t + ly, d / 2 - 0.08 + lz + 0.04], 0.012, 0.025, { r: 0.002 });
      }
    }
    return centred(k);
  },
});

const travertine = item({
  id: 'living-coffee-table-travertine', category: 'living', ko: '트래버틴 커피 테이블', en: 'Travertine coffee table', size: [1.2, 0.36, 0.65],
  params: [
    P.pick('shape', '모양', 'Shape', 'rect', [['rect', '사각', 'Rectangle'], ['round', '원형', 'Round'], ['oval', '타원', 'Oval']]),
    P.len('width', '폭', 'Width', 1.2, 0.7, 1.6),
    P.len('depth', '깊이', 'Depth', 0.65, 0.5, 0.9),
    P.len('height', '높이', 'Height', 0.36, 0.3, 0.42),
    P.mat('stone', '석재', 'Stone', 'travertine', 'stone'),
  ],
  tags: ['coffee table', 'travertine', 'stone table', '커피 테이블', '트래버틴', '석재 테이블'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = p.shape === 'round' ? p.width : p.depth, h = p.height, t = 0.07, S = p.stone;
    const shape = p.shape === 'round' ? ellipse(w, w) : p.shape === 'oval' ? superEllipse(w, d, 2.4, k.seg(72, 28)) : roundRect(w, d, 0.012);
    k.slab('stone', S, shape, t, h - t, { bevel: 0.006, curveSegs: 56 });
    if (p.shape === 'rect') {
      // two thick block legs across the depth
      for (const s of [-1, 1]) k.box('stone', S, 0.14, h - t + 0.002, d - 0.12, s * (w / 2 - 0.2), (h - t) / 2, 0, { r: 0.006, segs: 2 });
    } else {
      // one chunky drum
      const r = Math.min(w, d) * 0.28;
      k.slab('stone', S, p.shape === 'round' ? ellipse(2 * r, 2 * r) : superEllipse(w * 0.5, 2 * r, 2.4, k.seg(48, 20)), h - t + 0.002, 0, { bevel: 0.006, curveSegs: 40 });
    }
    return k.group();
  },
});

const twoTier = item({
  id: 'living-coffee-table-two-tier', category: 'living', ko: '라탄 선반 2단 커피 테이블', en: 'Two-tier rattan coffee table', size: [1.1, 0.42, 0.6],
  params: [
    P.len('width', '폭', 'Width', 1.1, 0.8, 1.4),
    P.len('depth', '깊이', 'Depth', 0.6, 0.45, 0.8),
    P.mat('wood', '나무', 'Wood', 'wood-oak', 'wood'),
    P.mat('cane', '선반', 'Shelf', 'rattan', 'wood'),
  ],
  tags: ['coffee table', 'two tier', 'rattan table', '커피 테이블', '2단 테이블', '라탄'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = p.depth, h = 0.42, t = 0.028, l = 0.04;
    k.slab('wood', p.wood, roundRect(w, d, 0.06), t, h - t, { bevel: 0.006 });
    const lx = w / 2 - 0.05, lz = d / 2 - 0.05;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('wood', p.wood, l, h - t, l, sx * lx, (h - t) / 2, sz * lz, { r: 0.006, segs: 2 });
    // framed cane shelf between the legs
    const sw = 2 * lx, sd = 2 * lz, ys = 0.1;
    k.slab('wood', p.wood, frameShape(sw, sd, 0.035, 0.035, 0.01), 0.022, ys, { bevel: 0.003 });
    k.box('cane', p.cane, sw - 0.06, 0.006, sd - 0.06, 0, ys + 0.012, 0, { r: 0 });
    // woven strands across the cane
    const n = Math.round((sw - 0.07) / (k.hi ? 0.025 : 0.05));
    for (let i = 0; i <= n; i++) k.box('cane', p.cane, 0.006, 0.004, sd - 0.065, -sw / 2 + 0.035 + ((sw - 0.07) * i) / n, ys + 0.0165, 0, { r: 0 });
    return k.group();
  },
});

const cTable = item({
  id: 'living-side-table-c', category: 'living', ko: 'C형 사이드 테이블', en: 'C-shaped side table', size: [0.42, 0.62, 0.42],
  params: [
    P.len('height', '높이', 'Height', 0.6, 0.5, 0.72),
    P.pick('topType', '상판', 'Top', 'wood', [['wood', '원목', 'Wood'], ['marble', '대리석', 'Marble'], ['glass', '유리', 'Glass']]),
    P.mat('wood', '나무', 'Wood', 'wood-oak', 'wood'),
    P.mat('frame', '프레임', 'Frame', 'metal-black', 'metal'),
  ],
  tags: ['c table', 'sofa side table', 'laptop table', 'C 테이블', '사이드 테이블', '소파 테이블'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const h = p.height, r = 0.011, x = 0.13, zb = -0.19, zf = 0.15;
    for (const s of [-1, 1]) k.bentTube('frame', p.frame, [[s * x, r, zf], [s * x, r, zb], [s * x, h - r, zb], [s * x, h - r, zf - 0.02]], r, 0.05, { radial: k.seg(10, 5) });
    k.rod('frame', p.frame, [-x, r, zf], [x, r, zf], r);
    k.rod('frame', p.frame, [-x, 0.3, zb], [x, 0.3, zb], r);
    k.rod('frame', p.frame, [-x, h - r, zb], [x, h - r, zb], r);
    const tm = p.topType === 'marble' ? TOP_STONE : p.topType === 'glass' ? 'glass-tinted' : p.wood;
    const t = p.topType === 'glass' ? 0.01 : 0.022;
    k.slab('top', tm, ellipse(0.42, 0.42), t, h, { bevel: 0.004, z: 0.0, curveSegs: 48 });
    return centred(k);
  },
});

const tulipTable = item({
  id: 'living-side-table-tulip', category: 'living', ko: '튤립 사이드 테이블', en: 'Tulip side table', size: [0.5, 0.52, 0.5],
  params: [
    P.len('diameter', '지름', 'Diameter', 0.5, 0.4, 0.6),
    P.len('height', '높이', 'Height', 0.52, 0.45, 0.6),
    P.mat('top', '상판', 'Top', TOP_STONE, 'stone'),
    P.mat('base', '받침', 'Base', 'paint-white-gloss', 'paint'),
  ],
  tags: ['tulip table', 'pedestal table', 'side table', '튤립 테이블', '사이드 테이블', '대리석'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const D = p.diameter, h = p.height, t = 0.02, bh = h - t, rb = D * 0.4;
    k.lathe('base', p.base, [[0, 0], [rb, 0], [rb + 0.004, 0.006], [rb * 0.95, 0.02], [rb * 0.6, 0.045], [0.05, bh * 0.25], [0.035, bh * 0.5], [0.042, bh * 0.75], [D * 0.16, bh * 0.94], [D * 0.25, bh], [0, bh]], 0, 0, 0, { smooth: 30, segs: k.seg(40, 12) });
    k.slab('top', p.top, ellipse(D, D), t, h - t, { bevel: 0.005, curveSegs: 64 });
    return k.group();
  },
});

const drumStool = item({
  id: 'living-side-table-drum', category: 'living', ko: '원목 드럼 스툴 테이블', en: 'Wooden drum stool table', size: [0.38, 0.44, 0.38],
  params: [
    P.len('diameter', '지름', 'Diameter', 0.38, 0.3, 0.5),
    P.len('height', '높이', 'Height', 0.44, 0.35, 0.55),
    P.mat('wood', '나무', 'Wood', 'wood-dark', 'wood'),
  ],
  tags: ['drum stool', 'side table', 'stool', '스툴', '드럼 테이블', '사이드 테이블'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const r = p.diameter / 2, h = p.height;
    k.lathe('wood', p.wood, [[0, 0], [r * 0.95, 0], [r, 0.012], [r * 0.96, h * 0.09], [r * 0.62, h * 0.3], [r * 0.45, h * 0.5], [r * 0.62, h * 0.7], [r * 0.96, h * 0.91], [r, h - 0.012], [r * 0.95, h], [0, h]], 0, 0, 0, { smooth: 30, segs: k.seg(40, 12) });
    // carved bands
    for (const y of [h * 0.04, h * 0.96]) k.add('wood', p.wood, new THREE.TorusGeometry(r * 0.985, 0.005, k.seg(6, 3), k.seg(48, 12)).rotateX(Math.PI / 2).translate(0, y, 0));
    for (const y of [h * 0.47, h * 0.53]) k.add('wood', p.wood, new THREE.TorusGeometry(r * 0.455, 0.004, k.seg(6, 3), k.seg(36, 10)).rotateX(Math.PI / 2).translate(0, y, 0));
    return k.group();
  },
});

const trayTable = item({
  id: 'living-side-table-tray', category: 'living', ko: '트레이 테이블', en: 'Butler tray table', size: [0.64, 0.55, 0.44],
  params: [
    P.mat('tray', '트레이', 'Tray', 'wood-black', 'wood'),
    P.mat('stand', '거치대', 'Stand', 'wood-oak', 'wood'),
  ],
  tags: ['tray table', 'butler tray', 'folding table', '트레이 테이블', '접이식 테이블', '사이드 테이블'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = 0.52, tw = 0.64, td = 0.44, th = 0.008, ty = H - 0.05;
    // folding stand: an X on each side, cross bars carry the tray
    const x = 0.22, top = ty - 0.012;
    for (const s of [-1, 1]) {
      beam(k, 'stand', p.stand, [s * x, 0, -0.18], [s * x, top, 0.16], 0.022, 0.032, { r: 0.006, side: [1, 0, 0] });
      beam(k, 'stand', p.stand, [s * (x + 0.024), 0, 0.18], [s * (x + 0.024), top, -0.16], 0.022, 0.032, { r: 0.006, side: [1, 0, 0] });
      k.rod('pins', 'metal-brass', [s * (x - 0.016), top / 2, 0], [s * (x + 0.04), top / 2, 0], 0.007, { segs: k.seg(10, 5) });
    }
    for (const sz of [-1, 1]) k.rod('stand', p.stand, [-(x + 0.035), top - 0.006, sz * 0.16], [x + 0.035, top - 0.006, sz * 0.16], 0.009);
    // tray: base + rim, the short ends higher with hand holes
    k.box('tray', p.tray, tw - 0.02, th, td - 0.02, 0, ty + th / 2, 0, { r: 0.002 });
    for (const sz of [-1, 1]) k.box('tray', p.tray, tw, 0.045, 0.01, 0, ty + 0.0225, sz * (td / 2 - 0.005), { r: 0.003 });
    for (const sx of [-1, 1]) {
      const end = roundRect(td, 0.075, 0.02);
      end.holes.push(new THREE.Path(roundRect(0.12, 0.022, 0.011).getPoints(6).map((q) => new THREE.Vector2(q.x, q.y + 0.012)).reverse()));
      k.panel('tray', p.tray, end, 0.01, sx * (tw / 2 - 0.005), ty + 0.0375, 0, { ry: Math.PI / 2, bevel: 0.002 });
    }
    return centred(k);
  },
});

/* ============================================================= storage */

const mediaWall = item({
  id: 'living-media-wall', category: 'living', ko: 'TV 월 유닛', en: 'Media wall unit', size: [3, 2.2, 0.4],
  params: [
    P.len('width', '폭', 'Width', 3.0, 2.4, 3.8),
    P.len('height', '높이', 'Height', 2.2, 1.9, 2.6),
    P.mat('wood', '몸체', 'Body', 'wood-oak', 'wood'),
    P.mat('slats', '루버 패널', 'Slat panel', 'wood-walnut', 'wood'),
    P.bool('tv', 'TV', 'TV', true),
    P.bool('books', '책', 'Books', true),
  ],
  tags: ['media wall', 'tv wall', 'entertainment center', 'TV 월', '거실장', '수납장', '책장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, H = p.height, D = 0.4, tw = 0.6, iw = W - 2 * tw;
    for (const s of [-1, 1]) xform(k, () => shelfCase(k, tw, H, D, 5, p.wood, p.books, s > 0 ? 3 : 7, { back: true, plinth: 0.06 }), { x: s * (W / 2 - tw / 2) });
    addCabinet(k, { w: iw, h: 0.5, d: D, rows: [{ h: 1, n: 3, type: 'drawer' }], body: p.wood, front: p.wood, handle: 'none', base: 'plinth', plinth: 0.06, roles: { body: 'frame', front: 'fronts' } });
    k.box('frame', p.wood, iw + 0.002, 0.022, D, 0, H - 0.011, 0, { r: 0.002 });
    // slatted back panel between the towers
    const y0 = 0.5, y1 = H - 0.022, ph = y1 - y0;
    k.box('panel', 'wood-black', iw, ph, 0.018, 0, y0 + ph / 2, -D / 2 + 0.009, { r: 0 });
    const n = Math.floor(iw / 0.055);
    for (let i = 0; i < n; i++) k.box('slats', p.slats, 0.03, ph - 0.002, 0.02, -iw / 2 + (iw / n) * (i + 0.5), y0 + ph / 2, -D / 2 + 0.028, { r: 0.003 });
    if (p.tv) {
      const tvW = Math.min(1.45, iw - 0.15), tvH = tvW * 0.575, ty = Math.min(1.2, y1 - tvH / 2 - 0.08);
      const tz = -D / 2 + 0.038 + 0.04;
      k.box('tv', 'plastic-black', tvW, tvH, 0.03, 0, ty, tz, { r: 0.004 });
      k.box('screen', 'screen-black', tvW - 0.016, tvH - 0.016, 0.002, 0, ty, tz + 0.0156, { r: 0 });
      k.box('tv', 'plastic-black', 0.3, 0.2, 0.04, 0, ty, tz - 0.035, { r: 0.004 });
    }
    return k.group();
  },
});

const tvBench = item({
  id: 'living-tv-bench', category: 'living', ko: '로우 TV 벤치', en: 'Low TV bench', size: [1.8, 0.38, 0.42],
  params: [
    P.len('width', '폭', 'Width', 1.8, 1.2, 2.6),
    P.len('height', '높이', 'Height', 0.38, 0.3, 0.48),
    P.mat('wood', '나무', 'Wood', 'wood-ash', 'wood'),
    P.mat('front', '서랍', 'Drawers', 'wood-ash', 'wood'),
  ],
  tags: ['tv bench', 'low tv stand', 'media bench', 'TV 벤치', '낮은 거실장', '원목 벤치'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, d = 0.42, t = 0.03;
    for (const s of [-1, 1]) k.box('wood', p.wood, t, h, d, s * (w / 2 - t / 2), h / 2, 0, { r: 0.004 });
    k.box('wood', p.wood, w - 2 * t + 0.002, t, d, 0, h - t / 2, 0, { r: 0.004 });
    // slatted lower shelf
    const ys = 0.07, n = Math.round(d / 0.045);
    for (let i = 0; i < n; i++) k.box('wood', p.wood, w - 2 * t + 0.002, 0.022, d / n - 0.012, 0, ys, -d / 2 + (d / n) * (i + 0.5), { r: 0.004 });
    k.box('wood', p.wood, w - 2 * t + 0.002, 0.03, 0.04, 0, ys - 0.026, 0, { r: 0.003 });
    // central drawer box under the top
    const bw = Math.min(0.8, w * 0.42), bh = (h - t) - ys - 0.07;
    const by = h - t - bh / 2;
    k.box('wood', p.wood, bw, bh, d - 0.03, 0, by, -0.015, { r: 0.003 });
    for (const s of [-1, 1]) {
      const fw = bw / 2 - 0.004;
      k.box('fronts', p.front, fw, bh - 0.012, 0.018, s * (fw / 2 + 0.002), by, d / 2 - 0.03 + 0.009, { r: 0.003 });
      // finger-pull groove
      k.box('handles', 'wood-dark', fw * 0.4, 0.008, 0.004, s * (fw / 2 + 0.002), by - bh / 2 + 0.018, d / 2 - 0.012, { r: 0 });
    }
    return k.group();
  },
});

const ladderShelf = item({
  id: 'living-ladder-shelf', category: 'living', ko: '사다리 선반', en: 'Ladder shelf', size: [0.66, 1.81, 0.46],
  params: [
    P.len('width', '폭', 'Width', 0.66, 0.45, 1.0),
    P.len('height', '높이', 'Height', 1.8, 1.4, 2.0),
    P.mat('wood', '나무', 'Wood', 'wood-walnut', 'wood'),
    P.bool('decor', '소품', 'Styling', true),
  ],
  tags: ['ladder shelf', 'leaning shelf', 'shelf', '사다리 선반', '선반', '책장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, H = p.height, W = p.wood;
    const zFront = 0.21, zTop = -0.2, zWall = -0.23;
    const zr = (y) => zFront + (zTop - zFront) * (y / H);
    const rx = w / 2 - 0.02;
    for (const s of [-1, 1]) beam(k, 'wood', W, [s * rx, 0, zFront], [s * rx, H, zTop], 0.035, 0.045, { r: 0.008, side: [1, 0, 0] });
    const n = 5, ys = [];
    for (let i = 0; i < n; i++) ys.push(0.22 + (H * 0.83 - 0.22) * (i / (n - 1)));
    for (const y of ys) {
      const front = zr(y) + 0.03, sd = front - zWall;
      k.box('wood', W, w - 0.075, 0.022, sd, 0, y, zWall + sd / 2, { r: 0.004 });
      k.box('wood', W, w - 0.075, 0.04, 0.012, 0, y + 0.03, zWall + 0.006, { r: 0.002 });
    }
    // back legs under the top shelf so it stands on its own
    for (const s of [-1, 1]) beam(k, 'wood', W, [s * rx, 0, zWall + 0.012], [s * rx, ys[n - 1], zWall + 0.012], 0.03, 0.024, { r: 0.006, side: [1, 0, 0] });
    if (p.decor) {
      const sh = (i) => ({ y: ys[i] + 0.011, d: zr(ys[i]) + 0.03 - zWall });
      const s1 = sh(1);
      addBooks(k, -w / 2 + 0.06, w / 2 - 0.06, s1.y, zWall + 0.015, Math.min(0.24, s1.d - 0.03), 11, { hMax: 0.26, fill: 0.7 });
      const s2 = sh(2);
      vase(k, 'decor', 'ceramic-matte', -w * 0.18, s2.y, zWall + s2.d * 0.5, 0.24, 0.07, 1);
      vase(k, 'decor', 'ceramic-terracotta', w * 0.16, s2.y, zWall + s2.d * 0.5, 0.15, 0.06, 2);
      const s0 = sh(0);
      k.rbox('basket', 'rattan', w * 0.55, 0.2, Math.min(0.3, s0.d - 0.04), 0.02, 0, s0.y + 0.1, zWall + s0.d / 2, { segs: 2 });
      const s3 = sh(3);
      for (let i = 0; i < 3; i++) k.box('books', ['book-cream', 'book-green', 'book-red'][i], 0.22 - i * 0.02, 0.028, Math.min(0.16, s3.d - 0.02), 0.02, s3.y + 0.014 + i * 0.028, zWall + Math.min(0.16, s3.d - 0.02) / 2 + 0.012, { r: 0.002, ry: i * 0.1 });
    }
    return centred(k);
  },
});

const wallShelves = item({
  id: 'living-wall-shelves', category: 'living', ko: '벽 선반 세트', en: 'Floating wall shelves', placement: 'wall', elevation: 1.0, size: [0.92, 0.9, 0.2],
  params: [
    P.len('width', '폭', 'Width', 0.8, 0.5, 1.4),
    P.mat('wood', '나무', 'Wood', 'wood-oak', 'wood'),
    P.bool('decor', '소품', 'Styling', true),
  ],
  tags: ['wall shelf', 'floating shelves', 'shelf set', '벽 선반', '무지주 선반', '선반'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.2, t = 0.036;
    const shelves = [[-0.1, 0, w], [0.12, 0.33, w * 0.75], [-0.04, 0.66, w]];
    for (const [x, y, sw] of shelves) k.box('wood', p.wood, sw, t, d, x, y + t / 2, 0, { r: 0.004, segs: 2 });
    if (p.decor) {
      const z0 = -d / 2 + 0.01;
      const [x0, y0, w0] = shelves[0];
      addBooks(k, x0 - w0 / 2 + 0.03, x0 + 0.05, y0 + t, z0, 0.17, 4, { hMax: 0.24, fill: 1, lean: false });
      vase(k, 'decor', 'ceramic-matte', x0 + w0 * 0.3, y0 + t, 0, 0.2, 0.055, 1);
      const [x1, y1, w1] = shelves[1];
      // framed photo leaning on the wall + small pot
      k.box('frame', 'wood-black', 0.2, 0.25, 0.015, x1 - w1 * 0.22, y1 + t + 0.125, -d / 2 + 0.035, { r: 0.002, rx: -0.12 });
      k.box('photo', 'paper', 0.16, 0.21, 0.002, x1 - w1 * 0.22, y1 + t + 0.126, -d / 2 + 0.044, { r: 0, rx: -0.12 });
      addPot(k, { r: 0.055, h: 0.1, style: 'cylinder', mat: 'ceramic-terracotta', x: x1 + w1 * 0.25, y0: y1 + t, z: 0 });
      const [x2, y2, w2] = shelves[2];
      for (let i = 0; i < 3; i++) k.box('books', ['book-blue', 'book-cream', 'book-green'][i], 0.24 - i * 0.02, 0.03, 0.16, x2 + w2 * 0.22, y2 + t + 0.015 + i * 0.03, 0, { r: 0.002, ry: i * 0.08 });
      vase(k, 'decor', 'ceramic-matte', x2 + w2 * 0.22, y2 + t + 0.09, 0, 0.1, 0.045, 2);
      vase(k, 'decor', 'ceramic-terracotta', x2 - w2 * 0.25, y2 + t, 0, 0.2, 0.06, 0);
    }
    return centred(k);
  },
});

const displayCabinet = item({
  id: 'living-display-cabinet', category: 'living', ko: '유리 장식장', en: 'Glass display cabinet', size: [0.92, 1.85, 0.45],
  params: [
    P.len('width', '폭', 'Width', 0.9, 0.6, 1.4),
    P.len('height', '높이', 'Height', 1.85, 1.4, 2.1),
    P.mat('frame', '프레임', 'Frame', 'wood-walnut', 'wood'),
    P.mat('handle', '손잡이', 'Knobs', 'metal-brass', 'metal'),
    P.bool('decor', '소품', 'Display items', true),
  ],
  tags: ['display cabinet', 'vitrine', 'glass cabinet', 'curio', '장식장', '유리 진열장', '그릇장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, H = p.height, d = 0.42, F = p.frame, legH = 0.14, s = 0.035;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) taperLeg(k, 'frame', F, 0.04, 0.028, legH + 0.01, sx * (w / 2 - 0.035), sz * (d / 2 - 0.035));
    const yb = legH, base = 0.06, crown = 0.05;
    k.box('frame', F, w, base, d, 0, yb + base / 2, 0, { r: 0.003 });
    k.box('frame', F, w + 0.02, crown, d + 0.01, 0, H - crown / 2, 0.005, { r: 0.005, segs: 2 });
    const y0 = yb + base, y1 = H - crown, ch = y1 - y0;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', F, s, ch, s, sx * (w / 2 - s / 2), y0 + ch / 2, sz * (d / 2 - s / 2), { r: 0.003 });
    k.box('frame', F, w - 2 * s, ch, 0.012, 0, y0 + ch / 2, -d / 2 + 0.006, { r: 0 });
    for (const sx of [-1, 1]) k.box('glass', 'glass-clear', 0.005, ch, d - 2 * s, sx * (w / 2 - s / 2), y0 + ch / 2, 0, { r: 0 });
    // two glazed doors
    const dw = (w - 2 * s) / 2 - 0.003, zf = d / 2 - 0.01;
    for (const sx of [-1, 1]) {
      const cx = sx * (dw / 2 + 0.0015);
      k.panel('frame', F, frameShape(dw, ch - 0.006, 0.04, 0.05), 0.02, cx, y0 + ch / 2, zf, { bevel: 0.002 });
      k.box('glass', 'glass-clear', dw - 0.07, ch - 0.1, 0.004, cx, y0 + ch / 2, zf - 0.002, { r: 0 });
      addHandle(k, 'handles', p.handle, 'knob', cx - sx * (dw / 2 - 0.025), y0 + ch * 0.5, zf + 0.01);
    }
    // glass shelves + objects
    const ns = 3;
    for (let i = 1; i <= ns; i++) {
      const y = y0 + (ch * i) / (ns + 1);
      k.box('glass', 'glass-clear', w - 2 * s, 0.008, d - s - 0.02, 0, y, 0, { r: 0 });
    }
    if (p.decor) {
      const rnd = rng(9);
      for (let i = 0; i <= ns; i++) {
        const y = y0 + (ch * i) / (ns + 1) + (i ? 0.004 : 0);
        const room = ch / (ns + 1) - 0.05;
        const m = i % 2 ? 'ceramic-terracotta' : 'ceramic-matte';
        vase(k, 'decor', m, -w * 0.22, y, -0.03, Math.min(0.26, room * (0.6 + rnd() * 0.35)), 0.06, i % 3);
        if (i % 2 === 0) k.lathe('decor', 'ceramic-white', [[0, 0], [0.05, 0], [0.09, 0.03], [0.1, 0.055], [0.095, 0.056], [0.08, 0.035], [0, 0.028]], w * 0.18, y, 0.0, { smooth: 8, segs: k.seg(24, 8) });
        else for (let j = 0; j < 3; j++) k.cyl('decor', 'ceramic-white', 0.1, 0.1, 0.012, w * 0.15, y + j * 0.013, 0.01, { segs: k.seg(28, 8) });
      }
    }
    return k.group();
  },
});

const barCabinet = item({
  id: 'living-bar-cabinet', category: 'living', ko: '홈바 캐비닛', en: 'Bar cabinet', size: [1.01, 1.57, 0.49],
  params: [
    P.len('width', '폭', 'Width', 1.0, 0.7, 1.4),
    P.mat('body', '몸체', 'Body', 'wood-walnut', 'wood'),
    P.mat('metal', '금속', 'Metal', 'metal-brass', 'metal'),
    P.bool('fluted', '세로 홈 문', 'Fluted doors', true),
    P.bool('bottles', '병·잔', 'Bottles & glasses', true),
  ],
  tags: ['bar cabinet', 'drinks cabinet', 'liquor cabinet', '홈바', '술장', '바 캐비닛'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.45, legH = 0.22, bh = 1.0, B = p.body, M = p.metal;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('legs', M, 0.016, 0.009, legH + 0.005, sx * (w / 2 - 0.06), 0, sz * (d / 2 - 0.06), { segs: k.seg(14, 6) });
    k.box('body', B, w, bh, d - 0.02, 0, legH + bh / 2, -0.01, { r: 0.004 });
    k.box('body', B, w + 0.012, 0.025, d + 0.006, 0, legH + bh + 0.0125, 0.003, { r: 0.005 });
    const dw = w / 2 - 0.004, zf = d / 2 - 0.01;
    for (const sx of [-1, 1]) {
      const cx = sx * (dw / 2 + 0.002);
      k.box('fronts', B, dw, bh - 0.008, 0.018, cx, legH + bh / 2, zf, { r: 0.003 });
      if (p.fluted) {
        const n = Math.round(dw / 0.028);
        for (let i = 0; i < n; i++) k.cyl('fronts', B, 0.011, 0.011, bh - 0.06, cx - dw / 2 + (dw / n) * (i + 0.5), legH + 0.03, zf + 0.005, { segs: k.seg(10, 6) });
      }
      k.rod('handles', M, [cx - sx * (dw / 2 - 0.05), legH + bh * 0.42, zf + 0.04], [cx - sx * (dw / 2 - 0.05), legH + bh * 0.68, zf + 0.04], 0.007);
      for (const y of [bh * 0.44, bh * 0.66]) k.rod('handles', M, [cx - sx * (dw / 2 - 0.05), legH + y, zf + 0.009], [cx - sx * (dw / 2 - 0.05), legH + y, zf + 0.04], 0.005);
    }
    if (p.bottles) {
      const top = legH + bh + 0.025;
      k.slab('legs', M, roundRect(0.46, 0.28, 0.03), 0.008, top, { bevel: 0.002, x: -w * 0.12 });
      k.slab('legs', M, frameShape(0.46, 0.28, 0.01, 0.01, 0.03), 0.03, top, { bevel: 0.002, x: -w * 0.12 });
      const ty = top + 0.008, tx = -w * 0.12;
      // decanter, wine bottle, two tumblers
      k.lathe('glass', 'glass-clear', [[0, 0], [0.06, 0], [0.07, 0.04], [0.068, 0.15], [0.03, 0.2], [0.018, 0.24], [0.022, 0.25], [0, 0.25]], tx - 0.12, ty, 0, { smooth: 14, segs: k.seg(20, 8) });
      k.sphere('glass', 'glass-clear', 0.028, tx - 0.12, ty + 0.27, 0, { segs: k.seg(12, 6), rings: k.seg(8, 4) });
      k.lathe('bottle', 'glass-tinted', [[0, 0], [0.037, 0], [0.038, 0.2], [0.03, 0.24], [0.013, 0.27], [0.013, 0.32], [0, 0.32]], tx + 0.02, ty, -0.03, { smooth: 12, segs: k.seg(20, 8) });
      for (const [gx, gz] of [[0.12, 0.05], [0.16, -0.04]]) k.lathe('glass', 'glass-clear', [[0, 0], [0.033, 0], [0.037, 0.09], [0.034, 0.09], [0.03, 0.012], [0, 0.012]], tx + gx, ty, gz, { segs: k.seg(20, 8) });
    }
    return k.group();
  },
});

const recordCabinet = item({
  id: 'living-record-cabinet', category: 'living', ko: '레코드 장 & 턴테이블', en: 'Record cabinet with turntable', size: [1.4, 0.7, 0.42],
  params: [
    P.len('width', '폭', 'Width', 1.4, 0.9, 2.0),
    P.mat('wood', '나무', 'Wood', 'wood-teak', 'wood'),
    P.bool('records', '레코드', 'Records', true),
    P.bool('turntable', '턴테이블', 'Turntable', true),
  ],
  tags: ['record cabinet', 'vinyl storage', 'turntable', 'record player', '레코드장', 'LP 수납장', '턴테이블'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.42, legH = 0.16, bh = 0.4, t = 0.02, W = p.wood;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('legs', 'metal-black', 0.014, 0.009, legH + 0.004, sx * (w / 2 - 0.06), 0, sz * (d / 2 - 0.07), { segs: k.seg(12, 6) });
    const y0 = legH;
    k.box('wood', W, w, t, d, 0, y0 + t / 2, 0, { r: 0.002 });
    k.box('wood', W, w + 0.004, t, d + 0.004, 0, y0 + bh - t / 2, 0, { r: 0.003 });
    k.box('back', W, w - 2 * t, bh - 2 * t, 0.008, 0, y0 + bh / 2, -d / 2 + 0.004, { r: 0 });
    const n = Math.max(2, Math.round(w / 0.36));
    const cw = (w - t) / n;
    for (let i = 0; i <= n; i++) k.box('wood', W, t, bh - 2 * t + 0.002, d, -w / 2 + t / 2 + cw * i, y0 + bh / 2, 0, { r: 0.002 });
    if (p.records) {
      const covers = ['book-red', 'book-blue', 'book-green', 'book-cream', 'paint-grey-matte', 'paint-black-matte'];
      const rnd = rng(17);
      for (let c = 0; c < n; c++) {
        const x0 = -w / 2 + t + cw * c, x1 = x0 + cw - t;
        let x = x0 + 0.004;
        const fill = c === n - 1 ? 0.45 : 0.75 + rnd() * 0.2;
        const end = x0 + (x1 - x0) * fill;
        while (x < end) {
          const th = 0.004 + rnd() * 0.002;
          const sz = Math.min(0.315, bh - 2 * t - 0.03);
          k.box('records', covers[Math.floor(rnd() * covers.length)], th, sz, sz, x + th / 2, y0 + t + sz / 2, d / 2 - 0.03 - sz / 2, { r: 0 });
          x += th + 0.0012;
        }
        // last record leaning
        const sz = Math.min(0.315, bh - 2 * t - 0.03), a = 0.22;
        if (x + Math.sin(a) * sz < x1 - 0.01) k.box('records', 'book-cream', 0.004, sz, sz, x + 0.002 + Math.sin(a) * sz / 2, y0 + t + Math.cos(a) * sz / 2, d / 2 - 0.03 - sz / 2, { r: 0, rz: -a });
      }
    }
    if (p.turntable) {
      const ty = y0 + bh, tx = -w * 0.18;
      k.box('wood', W, 0.45, 0.075, 0.35, tx, ty + 0.0375 + 0.008, 0, { r: 0.008, segs: 2 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('tt', 'rubber-black', 0.018, 0.02, 0.008, tx + sx * 0.19, ty, sz * 0.14, { segs: k.seg(12, 6) });
      const py = ty + 0.083;
      k.cyl('tt', 'metal-aluminium', 0.152, 0.152, 0.014, tx - 0.04, py, 0.0, { segs: k.seg(48, 14) });
      k.cyl('vinyl', 'plastic-black', 0.15, 0.15, 0.003, tx - 0.04, py + 0.014, 0, { segs: k.seg(48, 14) });
      k.cyl('label', 'book-red', 0.045, 0.045, 0.0008, tx - 0.04, py + 0.0172, 0, { segs: k.seg(24, 8) });
      k.cyl('tt', 'metal-chrome', 0.003, 0.003, 0.03, tx - 0.04, py + 0.014, 0, { segs: 6 });
      // tone arm
      const ax = tx + 0.17, az = -0.12;
      k.cyl('tt', 'metal-chrome', 0.02, 0.022, 0.03, ax, py, az, { segs: k.seg(16, 6) });
      k.tube('tt', 'metal-chrome', [[ax, py + 0.04, az + 0.05], [ax, py + 0.04, az], [ax - 0.04, py + 0.035, az + 0.12], [ax - 0.1, py + 0.026, az + 0.2]], 0.0035, { radial: k.seg(8, 4) });
      k.cyl('tt', 'metal-chrome', 0.014, 0.014, 0.025, ax, py + 0.04, az + 0.05, { rx: Math.PI / 2, segs: k.seg(14, 6) });
      k.box('tt', 'plastic-black', 0.016, 0.01, 0.03, ax - 0.1, py + 0.022, az + 0.205, { r: 0.002, ry: -0.6 });
    }
    return k.group();
  },
});

const cornerShelf = item({
  id: 'living-corner-shelf', category: 'living', ko: '코너 선반', en: 'Corner shelf', size: [0.5, 1.71, 0.5],
  params: [
    P.len('size', '크기', 'Size', 0.5, 0.35, 0.7),
    P.len('height', '높이', 'Height', 1.6, 0.9, 2.0),
    P.int('shelves', '선반 수', 'Shelves', 5, 3, 7),
    P.mat('wood', '나무', 'Wood', 'wood-white', 'wood'),
    P.bool('decor', '소품', 'Styling', true),
  ],
  tags: ['corner shelf', 'corner unit', 'shelf', '코너 선반', '모서리 선반', '선반'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const s = p.size, H = p.height, t = 0.018, W = p.wood, R = s - t;
    // two back panels meeting in the back-left corner
    k.box('wood', W, s, H, t, 0, H / 2, -s / 2 + t / 2, { r: 0.002 });
    k.box('wood', W, t, H, s - t, -s / 2 + t / 2, H / 2, t / 2, { r: 0.002 });
    const sector = new THREE.Shape();
    sector.moveTo(0, 0); sector.lineTo(R, 0); sector.absarc(0, 0, R, 0, Math.PI / 2, false); sector.lineTo(0, 0);
    const n = p.shelves;
    const ys = [];
    for (let i = 0; i < n; i++) ys.push(0.04 + ((H - 0.06) * i) / (n - 1));
    for (const y of ys) k.slab('wood', W, sector, 0.022, Math.min(y, H - 0.022), { bevel: 0.003, x: -s / 2 + t, z: -s / 2 + t, curveSegs: 32 });
    // a front lip under the bottom shelf
    k.slab('wood', W, sector, 0.04, 0, { bevel: 0.002, x: -s / 2 + t, z: -s / 2 + t, curveSegs: 32 });
    if (p.decor && n >= 3) {
      const cx = -s / 2 + t + R * 0.32, cz = -s / 2 + t + R * 0.32;
      const gap = ys[1] - ys[0];
      vase(k, 'decor', 'ceramic-matte', cx, ys[1] + 0.022, cz, Math.min(0.25, gap - 0.06), 0.06, 1);
      for (let i = 0; i < 3; i++) k.box('books', ['book-cream', 'book-blue', 'book-red'][i], 0.2 - i * 0.02, 0.03, 0.15, cx + 0.02, ys[2] + 0.022 + 0.015 + i * 0.03, cz + 0.02, { r: 0.002, ry: -Math.PI / 4 + i * 0.1 });
      addPot(k, { r: 0.06, h: 0.11, style: 'taper', mat: 'ceramic-terracotta', x: cx, z: cz, y0: ys[n - 1] + 0.022 });
    }
    return k.group();
  },
});

const windowSeat = item({
  id: 'living-window-seat', category: 'living', ko: '창가 수납 벤치', en: 'Window seat bench', size: [1.4, 0.88, 0.48],
  params: [
    P.len('width', '폭', 'Width', 1.4, 0.9, 2.4),
    P.mat('wood', '몸체', 'Body', 'wood-white', 'wood'),
    P.mat('fabric', '방석 천', 'Cushion', 'fabric-linen-beige', 'fabric'),
    P.mat('pillowFabric', '쿠션 천', 'Pillows', 'fabric-mustard', 'fabric'),
    P.bool('baskets', '바구니', 'Baskets', true),
  ],
  tags: ['window seat', 'storage bench', 'bench', '창가 벤치', '수납 벤치', '벤치'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.48, h = 0.4, t = 0.02, W = p.wood;
    k.box('wood', W, w, 0.06, d - 0.03, 0, 0.03, -0.015, { r: 0.002 });
    k.box('wood', W, w, t, d, 0, h - t / 2, 0, { r: 0.004 });
    k.box('wood', W, w - 2 * t, h - 0.06 - t, 0.012, 0, 0.06 + (h - 0.06 - t) / 2, -d / 2 + 0.006, { r: 0 });
    const n = Math.max(2, Math.round(w / 0.45));
    const cw = (w - t) / n;
    for (let i = 0; i <= n; i++) k.box('wood', W, t, h - 0.06 - t + 0.002, d, -w / 2 + t / 2 + cw * i, 0.06 + (h - 0.06 - t) / 2, 0, { r: 0.002 });
    k.box('wood', W, w - 0.002, t, d - 0.002, 0, 0.06 + t / 2, 0, { r: 0.002 });
    if (p.baskets) {
      for (let i = 0; i < n; i++) {
        const bx = -w / 2 + t + cw * (i + 0.5) - t / 2, bw = cw - t - 0.03, bhh = h - 0.06 - 2 * t - 0.035;
        k.rbox('baskets', 'rattan', bw, bhh, d - 0.07, 0.015, bx, 0.06 + t + bhh / 2, 0.01, { segs: 2 });
        k.box('baskets', 'wood-dark', 0.09, 0.025, 0.008, bx, 0.06 + t + bhh - 0.04, 0.01 + (d - 0.07) / 2 + 0.003, { r: 0.004 });
      }
    }
    // seat cushion with piping
    const ch = 0.08;
    k.soft('cushion', p.fabric, w - 0.01, ch, d - 0.01, 0.03, 0, h + ch / 2, 0, { puff: 0.012 });
    piping(k, 'cushion', p.fabric, w - 0.014, d - 0.014, 0.025, h + ch - 0.012);
    // pillows leaning on the window wall
    const np = Math.max(2, Math.round(w / 0.55));
    for (let i = 0; i < np; i++) {
      const g = pillowGeo(0.45, 0.42, 0.15, k.seg(14, 5));
      T(g, 0, 0, 0, -0.3, (i - (np - 1) / 2) * 0.08, 0);
      g.translate(-w / 2 + (w / np) * (i + 0.5), h + ch + 0.2, -d / 2 + 0.1);
      k.add('pillows', i % 2 ? p.fabric : p.pillowFabric, g);
    }
    return k.group();
  },
});

/* ============================================================ screens etc. */

const folding = item({
  id: 'living-folding-screen', category: 'living', ko: '접이식 파티션', en: 'Folding room divider', size: [1.58, 1.75, 0.23],
  params: [
    P.int('panels', '패널 수', 'Panels', 4, 3, 6),
    P.len('height', '높이', 'Height', 1.75, 1.4, 2.0),
    P.pick('style', '스타일', 'Style', 'fabric', [['fabric', '패브릭', 'Fabric'], ['rattan', '라탄', 'Rattan cane'], ['slats', '살대', 'Slatted']]),
    P.mat('frame', '프레임', 'Frame', 'wood-oak', 'wood'),
    P.mat('fabric', '천', 'Fabric', 'fabric-linen-beige', 'fabric'),
  ],
  tags: ['room divider', 'folding screen', 'partition', '파티션', '병풍', '가림막'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const pw = 0.45, H = p.height, a = 0.5, n = p.panels, fw = 0.035, ft = 0.03, foot = 0.025;
    let px = 0, pz = 0;
    for (let i = 0; i < n; i++) {
      const ang = i % 2 ? -a : a;
      const dx = Math.cos(ang) * pw, dz = -Math.sin(ang) * pw;
      const cx = px + dx / 2, cz = pz + dz / 2;
      xform(k, () => {
        const ph = H - foot;
        k.panel('frame', p.frame, frameShape(pw - 0.008, ph, fw, fw), ft, 0, foot + ph / 2, 0, { bevel: 0.004 });
        for (const s of [-1, 1]) k.box('frame', p.frame, 0.04, foot + 0.004, ft, s * (pw / 2 - 0.03), (foot + 0.004) / 2, 0, { r: 0.003 });
        const iw = pw - 0.008 - 2 * fw + 0.004, ih = ph - 2 * fw + 0.004, iy = foot + ph / 2;
        if (p.style === 'fabric') {
          k.box('infill', p.fabric, iw, ih, 0.006, 0, iy, 0, { r: 0 });
          k.box('frame', p.frame, iw, 0.02, ft * 0.8, 0, iy - ih * 0.12, 0, { r: 0.003 });
        } else if (p.style === 'rattan') {
          k.box('infill', 'rattan', iw, ih, 0.004, 0, iy, 0, { r: 0 });
          const step = k.hi ? 0.028 : 0.06;
          const nv = Math.round(iw / step), nh = Math.round(ih / step);
          for (let j = 1; j < nv; j++) for (const s of [-1, 1]) k.box('infill', 'rattan', 0.005, ih, 0.003, -iw / 2 + (iw * j) / nv, iy, s * 0.0035, { r: 0 });
          for (let j = 1; j < nh; j++) for (const s of [-1, 1]) k.box('infill', 'rattan', iw, 0.005, 0.003, 0, iy - ih / 2 + (ih * j) / nh, s * 0.0035, { r: 0 });
        } else {
          const ns = 6;
          for (let j = 0; j < ns; j++) k.box('frame', p.frame, (iw / ns) * 0.55, ih, 0.016, -iw / 2 + (iw / ns) * (j + 0.5), iy, 0, { r: 0.003 });
        }
      }, { x: cx, z: cz, ry: Math.atan2(-dz, dx) });
      px += dx; pz += dz;
      if (i < n - 1) for (const y of [0.25, H - 0.25]) k.cyl('hinges', 'metal-brass', 0.007, 0.007, 0.07, px, y - 0.035, pz, { segs: k.seg(10, 5) });
    }
    return centred(k);
  },
});

const floorMirror = item({
  id: 'living-floor-mirror', category: 'living', ko: '스탠드 전신 거울', en: 'Leaning floor mirror', size: [0.72, 1.79, 0.27],
  params: [
    P.pick('shape', '모양', 'Shape', 'arch', [['arch', '아치', 'Arch'], ['rect', '사각', 'Rectangle'], ['oval', '타원', 'Oval']]),
    P.len('width', '폭', 'Width', 0.72, 0.4, 1.2),
    P.len('height', '높이', 'Height', 1.8, 1.2, 2.1),
    P.mat('frame', '프레임', 'Frame', 'wood-oak', 'wood'),
    P.bool('lean', '벽에 기댐', 'Leaning', true),
  ],
  tags: ['floor mirror', 'full length mirror', 'standing mirror', '전신 거울', '스탠드 거울', '아치 거울'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, b = 0.045;
    const outline = (ww, hh, y0) => {
      if (p.shape === 'rect') return roundRectAt(-ww / 2, y0, ww, hh, 0.01);
      if (p.shape === 'oval') { const s = new THREE.Shape(); s.absellipse(0, y0 + hh / 2, ww / 2, hh / 2, 0, Math.PI * 2, false, 0); return s; }
      const s = new THREE.Shape(), r = ww / 2;
      s.moveTo(-r, y0); s.lineTo(r, y0); s.lineTo(r, y0 + hh - r); s.absarc(0, y0 + hh - r, r, 0, Math.PI, false); s.lineTo(-r, y0);
      return s;
    };
    const ring = outline(w, h, 0);
    ring.holes.push(new THREE.Path(outline(w - 2 * b, h - 2 * b, b).getPoints(48).reverse()));
    const lean = p.lean ? 0.13 : 0;
    xform(k, () => {
      k.panel('frame', p.frame, ring, 0.035, 0, 0, 0, { bevel: 0.008, bevelSegs: 3, curveSegs: 48 });
      k.panel('mirror', 'mirror', outline(w - 2 * b + 0.006, h - 2 * b + 0.006, b - 0.003), 0.006, 0, 0, -0.006, { bevel: 0.001, curveSegs: 48 });
      if (!p.lean) {
        // free-standing: a folding easel leg behind
        k.rod('frame', p.frame, [0, h * 0.62, -0.02], [0, 0.012, -0.42], 0.014);
      }
    }, { rx: -lean });
    return centred(k);
  },
});

function roundRectAt(x0, y0, w, h, r) {
  const s = roundRect(w, h, r);
  return new THREE.Shape(s.getPoints(8).map((q) => new THREE.Vector2(q.x + x0 + w / 2, q.y + y0 + h / 2)));
}

const magazineRack = item({
  id: 'living-magazine-rack', category: 'living', ko: '매거진 랙', en: 'Magazine rack', size: [0.44, 0.45, 0.32],
  params: [
    P.mat('wood', '나무', 'Wood', 'wood-oak', 'wood'),
    P.mat('sling', '슬링', 'Sling', 'leather-cognac', 'leather'),
    P.bool('magazines', '잡지', 'Magazines', true),
  ],
  tags: ['magazine rack', 'magazine holder', 'newspaper rack', '매거진 랙', '잡지꽂이', '신문꽂이'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.42, h = 0.45, d = 0.32, ex = w / 2;
    for (const s of [-1, 1]) {
      const end = roundRect(d, h, 0.03);
      const sh = new THREE.Shape(end.getPoints(8).map((q) => new THREE.Vector2(q.x, q.y + h / 2)));
      sh.holes.push(new THREE.Path(roundRect(0.1, 0.03, 0.015).getPoints(6).map((q) => new THREE.Vector2(q.x, q.y + h - 0.06)).reverse()));
      sh.holes.push(new THREE.Path(roundRect(d - 0.08, h * 0.45, 0.02).getPoints(6).map((q) => new THREE.Vector2(q.x, q.y + 0.04 + h * 0.225)).reverse()));
      k.panel('wood', p.wood, sh, 0.02, s * ex, 0, 0, { ry: Math.PI / 2, bevel: 0.003 });
    }
    const ry = h - 0.11;
    for (const sz of [-1, 1]) k.rod('wood', p.wood, [-ex, ry, sz * (d / 2 - 0.035)], [ex, ry, sz * (d / 2 - 0.035)], 0.012);
    k.rod('wood', p.wood, [-ex, 0.03, 0], [ex, 0.03, 0], 0.011);
    // leather sling hanging between the rails
    const zr = d / 2 - 0.035 - 0.012;
    k.add('sling', p.sling, shellGeo(k.seg(8, 3), k.seg(24, 8), (u, v) => [-ex + 0.012 + u * (w - 0.024), ry + 0.006 - (ry - 0.07) * Math.sin(Math.PI * v) ** 0.7, -zr + 2 * zr * v - 0.012 * Math.sin(2 * Math.PI * v)], 0.004));
    for (const sz of [-1, 1]) k.rod('sling', p.sling, [-ex + 0.012, ry, sz * zr], [ex - 0.012, ry, sz * zr], 0.016, { segs: k.seg(10, 5) });
    if (p.magazines) {
      const mats = ['book-red', 'paper', 'book-blue', 'paper'];
      for (let i = 0; i < 4; i++) {
        const z = -0.07 + i * 0.045;
        k.box('mags', mats[i], 0.3 - (i % 2) * 0.02, 0.27, 0.006, (i % 2 ? 0.015 : -0.01), 0.07 + 0.135 + 0.01 + Math.abs(z) * 0.4, z, { r: 0.001, rx: (i - 1.5) * 0.12 });
      }
    }
    return k.group();
  },
});

/** Grid of thin bars within a panel outline: topAt(x) = top height of the mesh at x. */
function meshPanel(k, role, mat, w, topAt, y0, step, r = 0.0016) {
  const nx = Math.round(w / step);
  for (let i = 0; i <= nx; i++) { const x = -w / 2 + (w * i) / nx; k.rod(role, mat, [x, y0, 0], [x, topAt(x), 0], r, { segs: 3 }); }
  const maxY = Math.max(...Array.from({ length: 9 }, (_, i) => topAt(-w / 2 + (w * i) / 8)));
  for (let y = y0 + step; y < maxY; y += step) {
    // horizontal wire spans the part of the panel that reaches this height
    let xa = null, xb = null;
    for (let i = 0; i <= 40; i++) { const x = -w / 2 + (w * i) / 40; if (topAt(x) >= y) { xa ??= x; xb = x; } }
    if (xa != null && xb - xa > 0.01) k.rod(role, mat, [xa, y, 0], [xb, y, 0], r, { segs: 3 });
  }
}

const fireScreen = item({
  id: 'living-fireplace-screen', category: 'living', ko: '벽난로 가림막', en: 'Fireplace screen', size: [1.17, 0.84, 0.2],
  params: [
    P.mat('metal', '금속', 'Metal', 'metal-black', 'metal'),
    P.mat('accent', '장식', 'Accent', 'metal-brass', 'metal'),
  ],
  tags: ['fireplace screen', 'fire guard', 'spark guard', '벽난로 가림막', '벽난로', '스크린'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const M = p.metal, cw = 0.66, ch = 0.66, arch = 0.12, sw = 0.3, sh = 0.62, r = 0.008;
    const step = k.hi ? 0.03 : 0.06;
    // centre panel with an arched top
    const topC = (x) => ch + arch * Math.cos((x / (cw / 2)) * (Math.PI / 2));
    const outline = [[-cw / 2, 0.03]];
    for (let i = 0; i <= 16; i++) { const x = -cw / 2 + (cw * i) / 16; outline.push([x, topC(x)]); }
    outline.push([cw / 2, 0.03]);
    k.tube('frame', M, [...outline.map(([x, y]) => [x, y, 0]), [-cw / 2, 0.03, 0]], r, { radial: k.seg(8, 4), segs: k.seg(120, 40) });
    meshPanel(k, 'mesh', M, cw - 0.01, (x) => topC(x) - 0.006, 0.035, step);
    k.sphere('accent', p.accent, 0.018, 0, topC(0) + 0.02, 0, { segs: k.seg(12, 6), rings: k.seg(8, 4) });
    for (const s of [-1, 1]) {
      k.sphere('accent', p.accent, 0.016, s * (cw / 2 - 0.01), 0.016, 0, { segs: k.seg(10, 5), rings: k.seg(6, 4) });
      // side wings angled back
      const ang = 0.6;
      const hx = s * cw / 2, cx = hx + s * Math.cos(ang) * sw / 2, cz = -Math.sin(ang) * sw / 2;
      xform(k, () => {
        k.bentTube('frame', M, [[-sw / 2, 0.03, 0], [-sw / 2, sh, 0], [sw / 2, sh, 0], [sw / 2, 0.03, 0], [-sw / 2, 0.03, 0]], r, 0.02, { radial: k.seg(8, 4) });
        meshPanel(k, 'mesh', M, sw - 0.01, () => sh - 0.006, 0.035, step);
        k.sphere('accent', p.accent, 0.016, s * (sw / 2 - 0.01), 0.016, 0, { segs: k.seg(10, 5), rings: k.seg(6, 4) });
      }, { x: cx, z: cz, ry: s * ang });
      for (const y of [0.15, 0.5]) k.cyl('accent', p.accent, 0.009, 0.009, 0.05, hx, y - 0.025, 0, { segs: k.seg(10, 5) });
    }
    return centred(k);
  },
});

const logHolder = item({
  id: 'living-log-holder', category: 'living', ko: '원형 장작 거치대', en: 'Firewood log holder', size: [0.76, 0.8, 0.43],
  params: [
    P.len('diameter', '지름', 'Diameter', 0.76, 0.5, 1.0),
    P.mat('metal', '금속', 'Metal', 'metal-black', 'metal'),
    P.bool('logs', '장작', 'Logs', true),
  ],
  tags: ['log holder', 'firewood rack', 'log storage', '장작 거치대', '장작', '벽난로'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2, M = p.metal, dz = 0.16, band = 0.03, foot = 0.04;
    const cy = R + foot;
    for (const s of [-1, 1]) {
      const ring = ellipse(2 * R, 2 * R);
      ring.holes.push(new THREE.Path(ellipse(2 * R - 2 * band, 2 * R - 2 * band).getPoints(64).reverse()));
      k.panel('frame', M, ring, 0.012, 0, cy, s * dz, { bevel: 0.002, curveSegs: 64 });
    }
    for (const a of [-2.4, -1.9, -1.25, -0.7, 0.7, 1.25, 1.9, 2.4, Math.PI]) {
      const x = Math.sin(a) * (R - band / 2), y = cy - Math.cos(a) * (R - band / 2);
      k.rod('frame', M, [x, y, -dz], [x, y, dz], 0.008);
    }
    // feet: two bars on the floor with stubs up to the ring
    const fx = R * 0.45, yr = cy - Math.sqrt(R * R - fx * fx);
    for (const s of [-1, 1]) {
      beam(k, 'frame', M, [s * fx, 0.01, -dz - 0.03], [s * fx, 0.01, dz + 0.03], 0.03, 0.02, { r: 0.003, side: [1, 0, 0] });
      for (const sz of [-1, 1]) k.rod('frame', M, [s * fx, 0.015, sz * dz], [s * fx, yr + 0.01, sz * dz], 0.008);
    }
    if (p.logs) {
      const rnd = rng(23);
      const Rin = R - band - 0.006, len = 2 * dz + 0.07;
      const base = cy - Rin;
      const lr = 0.052;
      for (let row = 0; row < 12; row++) {
        const y = base + lr + row * lr * 1.72;
        if (y > cy + Rin * 0.25) break;
        const off = row % 2 ? lr : 0;
        for (let x = -Rin + lr + off; x < Rin - lr; x += 2 * lr) {
          const rr = lr * (0.82 + rnd() * 0.18);
          if (Math.hypot(x, y - cy) + rr > Rin) continue;
          const zo = (rnd() - 0.5) * 0.04;
          k.cyl('bark', 'wood-dark', rr, rr, len, x, y, -len / 2 + zo, { rx: Math.PI / 2, open: true, segs: k.seg(12, 6) });
          for (const e of [-1, 1]) k.cyl('logEnd', 'wood-pine', rr * 0.97, rr * 0.97, 0.003, x, y, zo + e * len / 2 - 0.0015, { rx: Math.PI / 2, segs: k.seg(12, 6) });
        }
      }
    }
    return k.group();
  },
});

const plantStand = item({
  id: 'living-plant-stand', category: 'living', ko: '원목 화분 스탠드', en: 'Wooden plant stand', size: [0.49, 1.03, 0.48],
  params: [
    P.mat('wood', '나무', 'Wood', 'wood-walnut', 'wood'),
    P.mat('pot', '화분', 'Pot', 'ceramic-matte', 'ceramic'),
    P.bool('plant', '식물', 'Plant', true),
  ],
  tags: ['plant stand', 'planter stand', 'flower stand', '화분 스탠드', '화분대', '플랜트 스탠드'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.wood, lh = 0.48, rf = 0.27, rt = 0.165;
    const at = (a, y) => { const r = rf + (rt - rf) * (y / lh); return [Math.sin(a) * r, y, Math.cos(a) * r]; };
    const legs = [0, 1, 2].map((i) => Math.PI / 3 + (i * Math.PI * 2) / 3);
    for (const a of legs) {
      k.rod('wood', W, at(a, 0.004), at(a, lh), 0.012, { r2: 0.016, segs: k.seg(12, 6) });
      k.sphere('wood', W, 0.012, ...at(a, 0.012), { segs: k.seg(10, 5), rings: k.seg(6, 3) });
    }
    k.add('wood', W, new THREE.TorusGeometry(rt + 0.004, 0.011, k.seg(8, 4), k.seg(40, 12)).rotateX(Math.PI / 2).translate(0, lh - 0.06, 0));
    const ys = 0.3, rs = rf + (rt - rf) * (ys / lh);
    k.cyl('wood', W, rs, rs, 0.018, 0, ys, 0, { segs: k.seg(36, 10) });
    const sy = addPot(k, { r: 0.15, h: 0.25, style: 'taper', mat: p.pot, y0: ys + 0.018 });
    if (p.plant) {
      // snake plant: upright sword leaves
      const rnd = rng(31);
      const n = k.hi ? 11 : 7;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rnd() * 0.4, rr = 0.02 + rnd() * 0.06;
        const len = 0.32 + rnd() * 0.22;
        const g = leafGeo(len, 0.05 + rnd() * 0.02, { nu: 2, nv: k.seg(8, 4), droop: 0.04, fold: 0.15, twist: (rnd() - 0.5) * 0.8, outline: (t) => Math.min(1, t * 6) * (1 - t ** 3) });
        placeLeaf(g, [Math.sin(a) * rr, sy - 0.005, Math.cos(a) * rr], a, 1.32 - rnd() * 0.18, rnd() * 3);
        k.add('leaves', i % 3 ? 'plant-leaf' : 'plant-leaf-light', g);
      }
    }
    return centred(k);
  },
});

/* =========================================================== piano & game */

const piano = item({
  id: 'living-upright-piano', category: 'living', ko: '업라이트 피아노', en: 'Upright piano', size: [1.53, 1.27, 0.6],
  params: [
    P.len('width', '폭', 'Width', 1.5, 1.4, 1.6),
    P.mat('finish', '마감', 'Finish', 'wood-black', 'wood'),
    P.bool('lidOpen', '건반 뚜껑 열림', 'Fallboard open', true),
    P.bool('music', '악보', 'Sheet music', true),
  ],
  tags: ['piano', 'upright piano', 'keyboard', '피아노', '업라이트 피아노', '악기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, H = 1.25, F = p.finish, ct = 0.04;
    const iw = W - 2 * ct;
    // side cheeks: profile in (z, y), extruded across x
    const cheek = new THREE.Shape([[-0.3, 0], [0.02, 0], [0.02, 0.6], [0.28, 0.62], [0.29, 0.66], [0.28, 0.76], [0.06, 0.79], [0.04, 0.82], [0.04, H], [-0.3, H]].map(([z, y]) => new THREE.Vector2(-z, y)));
    for (const s of [-1, 1]) k.panel('case', F, cheek, ct, s * (W / 2 - ct / 2), 0, 0, { ry: Math.PI / 2, bevel: 0.006 });
    k.box('case', F, iw + 0.002, 0.58, 0.3, 0, 0.02 + 0.29, -0.15, { r: 0.003 });
    k.box('case', F, iw + 0.002, 0.56, 0.02, 0, 0.04 + 0.28, 0.012, { r: 0.003 });
    k.box('case', F, iw + 0.002, H - 0.62, 0.3, 0, 0.62 + (H - 0.62) / 2, -0.15, { r: 0.003 });
    k.box('case', F, iw + 0.002, H - 0.84, 0.03, 0, 0.84 + (H - 0.84) / 2 - 0.015, 0.025, { r: 0.004 });
    k.box('case', F, W + 0.03, 0.025, 0.36, 0, H + 0.0125, -0.13, { r: 0.006, segs: 2 });
    // key bed + keys
    const kbY = 0.66, kw = 0.0235, nW = 52, kbW = nW * kw;
    k.box('case', F, iw + 0.002, 0.04, 0.27, 0, kbY - 0.02, 0.155, { r: 0.003 });
    k.box('case', F, iw + 0.002, 0.03, 0.02, 0, kbY + 0.005, 0.28, { r: 0.004 });
    for (const s of [-1, 1]) k.box('case', F, (iw - kbW) / 2 - 0.002, 0.06, 0.2, s * (kbW / 2 + (iw - kbW) / 4 + 0.001), kbY + 0.03, 0.17, { r: 0.006, segs: 2 });
    const x0 = -kbW / 2, kz0 = 0.065, kl = 0.205;
    for (let i = 0; i < nW; i++) k.box('keys', 'plastic-white', kw - 0.0012, 0.022, kl, x0 + kw * (i + 0.5), kbY + 0.011, kz0 + kl / 2, { r: 0.0015 });
    const letters = 'ABCDEFG';
    for (let i = 0; i < nW - 1; i++) {
      const L = letters[i % 7];
      if ('ACDFG'.includes(L)) k.box('sharps', 'plastic-black', 0.012, 0.014, 0.12, x0 + kw * (i + 1), kbY + 0.022 + 0.007, kz0 + 0.06, { r: 0.002 });
    }
    // fallboard (open: folded up against the front panel), music desk
    if (p.lidOpen) k.box('case', F, kbW + 0.01, 0.13, 0.025, 0, 0.78, 0.045, { r: 0.004, rx: -0.12 });
    else k.box('case', F, kbW + 0.01, 0.025, 0.24, 0, kbY + 0.05, 0.16, { r: 0.004 });
    k.box('case', F, kbW * 0.7, 0.018, 0.06, 0, 0.86, 0.065, { r: 0.004 });
    if (p.music) k.box('paper', 'paper', 0.46, 0.31, 0.003, 0, 0.86 + 0.16, 0.06, { r: 0, rx: -0.18 });
    // pedals + legs
    for (const x of [-0.07, 0, 0.07]) beam(k, 'pedals', 'metal-brass', [x, 0.07, 0.02], [x, 0.065, 0.11], 0.02, 0.008, { r: 0.002 });
    for (const s of [-1, 1]) {
      k.box('case', F, 0.05, 0.6, 0.05, s * (W / 2 - ct - 0.05), 0.3, 0.24, { r: 0.006, segs: 2 });
      k.box('case', F, 0.06, 0.05, 0.3, s * (W / 2 - ct - 0.05), 0.025, 0.12, { r: 0.008, segs: 2 });
    }
    return k.group();
  },
});

const pianoBench = item({
  id: 'living-piano-bench', category: 'living', ko: '피아노 벤치', en: 'Piano bench', size: [0.77, 0.51, 0.37],
  params: [
    P.len('height', '높이', 'Height', 0.5, 0.45, 0.56),
    P.mat('finish', '마감', 'Finish', 'wood-black', 'wood'),
    P.mat('seat', '방석', 'Seat', 'leather-black', 'leather'),
  ],
  tags: ['piano bench', 'piano stool', 'bench', '피아노 의자', '피아노 벤치', '벤치'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.76, d = 0.36, h = p.height, ph = 0.06;
    const legH = h - ph;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) taperLeg(k, 'frame', p.finish, 0.042, 0.032, legH, sx * (w / 2 - 0.04), sz * (d / 2 - 0.04));
    k.box('frame', p.finish, w - 0.06, 0.08, d - 0.06, 0, legH - 0.04, 0, { r: 0.004 });
    for (const sz of [-1, 1]) k.box('frame', p.finish, w - 0.08, 0.025, 0.02, 0, 0.14, sz * (d / 2 - 0.04), { r: 0.003 });
    const g = softBoxGeo(w, ph, d, 0.02, { round: k.hi ? 3 : 1, flat: k.hi ? 8 : 3, puff: 0.012 });
    const pa = g.attributes.position;
    const btn = [];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) btn.push([-w / 2 + (w / 4) * (i + 0.5), -d / 2 + (d / 2) * (j + 0.5)]);
    for (let i = 0; i < pa.count; i++) {
      if (pa.getY(i) < -ph / 2 + 0.002) { pa.setY(i, -ph / 2); continue; }
      if (pa.getY(i) < ph / 2 - 0.015) continue;
      let dip = 0;
      for (const [bx, bz] of btn) dip = Math.max(dip, Math.exp(-((pa.getX(i) - bx) ** 2 + (pa.getZ(i) - bz) ** 2) / 0.0008));
      pa.setY(i, pa.getY(i) - dip * 0.012);
    }
    g.computeVertexNormals();
    g.translate(0, legH + ph / 2, 0);
    k.add('seat', p.seat, g);
    for (const [bx, bz] of btn) k.sphere('seat', p.seat, 0.008, bx, legH + ph + 0.012 - 0.013, bz, { scale: [1, 0.6, 1], segs: k.seg(10, 5), rings: k.seg(6, 3) });
    return k.group();
  },
});

/** Simple dining-style chair facing +z, origin at the seat's footprint centre. */
function gameChair(k, wood, fabric) {
  const sw = 0.44, sd = 0.44, sh = 0.46, l = 0.035;
  for (const sx of [-1, 1]) {
    taperLeg(k, 'chairs', wood, l, 0.028, sh - 0.03, sx * (sw / 2 - 0.03), sd / 2 - 0.03);
    beam(k, 'chairs', wood, [sx * (sw / 2 - 0.03), 0.004, -sd / 2 + 0.03], [sx * (sw / 2 - 0.035), 0.92, -sd / 2 - 0.02], l, l, { r: 0.006, side: [1, 0, 0] });
  }
  k.box('chairs', wood, sw, 0.03, sd, 0, sh - 0.045, 0, { r: 0.006, segs: 2 });
  k.box('chairs', wood, sw - 0.04, 0.09, 0.022, 0, 0.84, -sd / 2 - 0.012, { r: 0.006, segs: 2, rx: -0.06 });
  k.box('chairs', wood, sw - 0.04, 0.04, 0.02, 0, 0.66, -sd / 2 - 0.0, { r: 0.005, rx: -0.06 });
  k.soft('seats', fabric, sw - 0.03, 0.045, sd - 0.03, 0.018, 0, sh - 0.008, 0.005, { puff: 0.01 });
}

const gameTable = item({
  id: 'living-game-table', category: 'living', ko: '게임 테이블 세트', en: 'Game table set', size: [1.65, 0.92, 1.65],
  params: [
    P.int('chairs', '의자 수', 'Chairs', 4, 0, 4),
    P.mat('wood', '나무', 'Wood', 'wood-walnut', 'wood'),
    P.mat('felt', '상판 펠트', 'Felt', 'fabric-velvet-green', 'fabric'),
    P.mat('seat', '의자 방석', 'Seat fabric', 'leather-cognac', 'leather'),
    P.bool('chess', '체스판', 'Chess board', true),
  ],
  tags: ['game table', 'card table', 'poker table', 'chess table', '게임 테이블', '카드 테이블', '체스'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const S = 0.9, H = 0.75, t = 0.03, W = p.wood;
    k.slab('table', W, roundRect(S, S, 0.03), t, H - t, { bevel: 0.006 });
    k.slab('felt', p.felt, roundRect(S - 0.12, S - 0.12, 0.02), 0.004, H - 0.001, { bevel: 0.001 });
    k.box('table', W, S - 0.1, 0.1, S - 0.1, 0, H - t - 0.05, 0, { r: 0.004 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.lathe('table', W, [[0, 0], [0.022, 0], [0.026, 0.03], [0.02, 0.1], [0.026, 0.35], [0.034, 0.5], [0.03, 0.56], [0.036, 0.6], [0.034, H - t], [0, H - t]], sx * (S / 2 - 0.07), 0, sz * (S / 2 - 0.07), { smooth: 14, segs: k.seg(16, 6) });
    }
    if (p.chess) {
      // board of 64 squares + a few pieces
      const bs = 0.36, q = bs / 8, by = H + 0.003;
      k.box('table', W, bs + 0.03, 0.016, bs + 0.03, 0.05, by + 0.008, -0.03, { r: 0.003, ry: 0.12 });
      xform(k, () => {
        for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) k.box((i + j) % 2 ? 'sqDark' : 'sqLight', (i + j) % 2 ? 'wood-dark' : 'wood-ash', q - 0.0005, 0.002, q - 0.0005, -bs / 2 + q * (i + 0.5), 0.001, -bs / 2 + q * (j + 0.5), { r: 0 });
        const pawn = [[0, 0], [0.013, 0], [0.014, 0.006], [0.008, 0.012], [0.006, 0.028], [0.011, 0.034], [0.009, 0.04], [0, 0.044]];
        const king = [[0, 0], [0.015, 0], [0.016, 0.007], [0.009, 0.015], [0.007, 0.05], [0.012, 0.058], [0.008, 0.068], [0.004, 0.075], [0, 0.077]];
        for (const [i, j, prof, m] of [[1, 1, pawn, 'plastic-white'], [3, 1, pawn, 'plastic-white'], [4, 0, king, 'plastic-white'], [2, 6, pawn, 'plastic-black'], [4, 5, pawn, 'plastic-black'], [3, 7, king, 'plastic-black']]) {
          k.lathe('pieces', m, prof, -bs / 2 + q * (i + 0.5), 0.002, -bs / 2 + q * (j + 0.5), { smooth: 10, segs: k.seg(14, 6) });
        }
      }, { x: 0.05, y: by + 0.016, z: -0.03, ry: 0.12 });
    }
    const rr = S / 2 + 0.12;
    for (let i = 0; i < p.chairs; i++) {
      const a = (i * Math.PI) / 2;
      xform(k, () => gameChair(k, W, p.seat), { x: Math.sin(a) * rr, z: Math.cos(a) * rr, ry: a + Math.PI });
    }
    return centred(k);
  },
});

/* =========================================================== chaise longue */

const chaise = item({
  id: 'living-chaise-longue', category: 'living', ko: '셰이즈 롱 체어', en: 'Chaise longue', size: [1.6, 0.92, 0.58],
  params: [
    P.mat('pad', '패드', 'Pad', 'leather-black', 'leather'),
    P.mat('frame', '프레임', 'Frame', 'metal-chrome', 'metal'),
    P.mat('base', '받침', 'Base', 'metal-black', 'metal'),
  ],
  tags: ['chaise longue', 'chaise lounge', 'recliner', '셰이즈 롱', '긴 의자', '라운지 체어'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const pts = [[0.8, 0.5], [0.55, 0.58], [0.2, 0.43], [-0.1, 0.38], [-0.4, 0.49], [-0.64, 0.7], [-0.79, 0.84]];
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, 0)), false, 'centripetal');
    const dense = curve.getSpacedPoints(120);
    const yAt = (x) => { let best = dense[0]; for (const q of dense) if (Math.abs(q.x - x) < Math.abs(best.x - x)) best = q; return best.y; };
    const zr = 0.25, r = 0.012;
    for (const s of [-1, 1]) k.tube('frame', p.frame, null, r, { curve: new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, s * zr)), false, 'centripetal'), segs: k.seg(80, 24), radial: k.seg(10, 5) });
    for (const x of [0.79, 0.2, -0.4, -0.78]) k.rod('frame', p.frame, [x, yAt(x), -zr], [x, yAt(x), zr], r * 0.9);
    // pad: a thick shell lying on the curve, slightly wider than the frame
    const pad = shellGeo(k.seg(10, 4), k.seg(70, 22), (u, v) => {
      const q = curve.getPointAt(1 - v * 0.98 - 0.01);
      return [q.x, q.y + r + 0.04, (u - 0.5) * 0.54];
    }, 0.038);
    k.add('pad', p.pad, pad);
    // head bolster
    const hx = -0.69, hy = yAt(hx) + r + 0.04 + 0.06;
    k.cyl('pad', p.pad, 0.065, 0.065, 0.44, hx, hy, -0.22, { rx: Math.PI / 2, segs: k.seg(20, 8) });
    for (const e of [-1, 1]) k.sphere('pad', p.pad, 0.065, hx, hy, e * 0.22, { scale: [1, 1, 0.3], segs: k.seg(20, 8), rings: k.seg(8, 4) });
    // H base: two cross stands joined by a spine
    for (const x of [0.36, -0.3]) {
      const top = yAt(x) - r;
      beam(k, 'base', p.base, [x, 0.016, -0.29], [x, 0.016, 0.29], 0.05, 0.032, { r: 0.008, side: [1, 0, 0] });
      for (const sz of [-1, 1]) beam(k, 'base', p.base, [x, 0.03, sz * 0.2], [x, top - 0.012, sz * 0.2], 0.03, 0.03, { r: 0.006, side: [1, 0, 0] });
      beam(k, 'base', p.base, [x, top - 0.012, -0.28], [x, top - 0.012, 0.28], 0.04, 0.024, { r: 0.006, side: [1, 0, 0] });
      for (const sz of [-1, 1]) k.cyl('base', 'rubber-black', 0.014, 0.014, 0.006, x, top - 0.006, sz * zr, { segs: 8 });
    }
    beam(k, 'base', p.base, [0.36, 0.06, 0], [-0.3, 0.06, 0], 0.03, 0.05, { r: 0.006, side: [0, 0, 1] });
    return centred(k);
  },
});

/* ============================================================== variants */

const V = [
  variant(pouf, 'charcoal', '차콜 니트 푸프', 'Charcoal knit pouf', { fabric: 'fabric-wool-charcoal', diameter: 0.55, height: 0.32 }, { tags: ['charcoal', '차콜'] }),
  variant(beanBag, 'mustard', '머스터드 빈백', 'Mustard bean bag', { fabric: 'fabric-mustard', width: 1.0, height: 0.75 }, { tags: ['mustard', '머스터드'] }),
  variant(floorMirror, 'black', '블랙 사각 전신 거울', 'Black rectangular floor mirror', { shape: 'rect', frame: 'wood-black', width: 0.6 }, { tags: ['black', '블랙', '사각 거울'] }),
  variant(folding, 'rattan', '라탄 접이식 파티션', 'Rattan folding screen', { style: 'rattan', panels: 3 }, { tags: ['rattan', '라탄'] }),
  variant(travertine, 'round', '원형 트래버틴 커피 테이블', 'Round travertine coffee table', { shape: 'round', width: 0.85 }, { tags: ['round', '원형'] }),
  variant(displayCabinet, 'black', '블랙 유리 장식장', 'Black glass display cabinet', { frame: 'wood-black', handle: 'metal-gold', width: 0.8 }, { tags: ['black', '블랙'] }),
  variant(cTable, 'marble', '대리석 C형 사이드 테이블', 'Marble C-table with brass frame', { topType: 'marble', frame: 'metal-brass' }, { tags: ['marble', 'brass', '대리석', '브라스'] }),
];

export const ITEMS = [
  rockingChair, hangingEgg, eggChair, beanBag, pouf, leatherPouf, footstool,
  nesting, consoleTable, sofaTable, marbleTable, ovalTable, brassTable, liftTable, travertine, twoTier,
  cTable, tulipTable, drumStool, trayTable,
  mediaWall, tvBench, ladderShelf, wallShelves, displayCabinet, barCabinet, recordCabinet, cornerShelf, windowSeat,
  folding, floorMirror, magazineRack, fireScreen, logHolder, plantStand,
  piano, pianoBench, gameTable, chaise,
  ...V,
];

void WOOD_DEFAULT;

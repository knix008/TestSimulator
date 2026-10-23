// Procedural 3D component models, one generator per footprint model3d.kind.
//
// Model frame (shared with viewer.js): footprint-local millimetres, same
// origin as the pads.
//   X = local x
//   Z = local y            (PCB y grows down on screen, so +Z points "down")
//   Y = height above the board surface the part sits on (0 = board face)
// Leads that go through the board reach down to -(boardThickness + 1).
//
// buildModel(model3d, THREE, opts) -> THREE.Group
//   opts.boardThickness  board thickness in mm (default 1.6)
//   opts.courtyard       {x1,y1,x2,y2} for the unknown-kind fallback box
//   opts.pads            [[x,y], ...] through-hole pad centres (legs follow them)
//
// THREE is passed in rather than imported so the module stays usable from
// Node tests and from any three.js build the host page already loaded. Each
// model is merged into one mesh per material, so a part costs a handful of
// draw calls; the viewer caches one model per kind+params and clones it.

const MAT_SPECS = {
  plastic: { color: 0x1d1d20, roughness: 0.5 },
  plasticDim: { color: 0x2e2e33, roughness: 0.85 },
  tin: { color: 0xd2d5da, roughness: 0.3, metalness: 0.9 },
  gold: { color: 0xe2b552, roughness: 0.28, metalness: 1 },
  alumina: { color: 0xece8de, roughness: 0.6 },
  resTop: { color: 0x151515, roughness: 0.45 },
  capTan: { color: 0xb39568, roughness: 0.65 },
  inductor: { color: 0x3b3b3f, roughness: 0.6 },
  fuse: { color: 0xd8d0bb, roughness: 0.6 },
  ledBody: { color: 0xf3f3ee, roughness: 0.4 },
  ledLens: { color: 0xfff4c4, roughness: 0.08, transparent: true, opacity: 0.6 },
  ledMark: { color: 0x2f9e4c, roughness: 0.5 },
  resBeige: { color: 0xd8c295, roughness: 0.6 },
  bandBrown: { color: 0x6b3a1e, roughness: 0.5 },
  bandBlack: { color: 0x121212, roughness: 0.5 },
  bandOrange: { color: 0xe2701c, roughness: 0.5 },
  bandGold: { color: 0xc9a13b, roughness: 0.35, metalness: 0.8 },
  band_black: { color: 0x121212, roughness: 0.5 },
  band_brown: { color: 0x6b3a1e, roughness: 0.5 },
  band_red: { color: 0xc8221e, roughness: 0.5 },
  band_orange: { color: 0xe2701c, roughness: 0.5 },
  band_yellow: { color: 0xe8c81a, roughness: 0.5 },
  band_green: { color: 0x1f8f3a, roughness: 0.5 },
  band_blue: { color: 0x1f4fbf, roughness: 0.5 },
  band_violet: { color: 0x7a3fb8, roughness: 0.5 },
  band_grey: { color: 0x8a8a8a, roughness: 0.5 },
  band_white: { color: 0xf2f2f2, roughness: 0.5 },
  band_gold: { color: 0xc9a13b, roughness: 0.35, metalness: 0.8 },
  band_silver: { color: 0xc0c0c0, roughness: 0.3, metalness: 0.85 },
  diodeBody: { color: 0x161616, roughness: 0.25 },
  diodeBand: { color: 0xc8c8c8, roughness: 0.4 },
  capBlue: { color: 0x1f3f91, roughness: 0.38 },
  capStripe: { color: 0xc4cad6, roughness: 0.42 },
  aluminium: { color: 0xc6cad0, roughness: 0.35, metalness: 0.85 },
  vent: { color: 0x5d6168, roughness: 0.6, metalness: 0.4 },
  disc: { color: 0xc8742a, roughness: 0.55 },
  ledRed: { color: 0xff2a1f, roughness: 0.12, transparent: true, opacity: 0.78, emissive: 0x3a0000 },
  can: { color: 0xe2e5e9, roughness: 0.18, metalness: 0.95 },
  potBlue: { color: 0x2a5db0, roughness: 0.5 },
  brass: { color: 0xcfa64a, roughness: 0.3, metalness: 0.9 },
  shell: { color: 0xcfd3d8, roughness: 0.25, metalness: 0.95 },
  unknown: { color: 0x8b9097, roughness: 0.7 },
};

// Materials are shared by every model built with the same THREE instance.
const materialCaches = new WeakMap();

export function modelMaterial(THREE, name) {
  let cache = materialCaches.get(THREE);
  if (!cache) { cache = new Map(); materialCaches.set(THREE, cache); }
  let m = cache.get(name);
  if (!m) {
    const spec = MAT_SPECS[name] || MAT_SPECS.unknown;
    m = new THREE.MeshStandardMaterial({ metalness: 0, ...spec });
    if (spec.transparent) m.depthWrite = false;
    m.name = name;
    cache.set(name, m);
  }
  return m;
}

export function disposeModelMaterials(THREE) {
  const cache = materialCaches.get(THREE);
  if (!cache) return;
  for (const m of cache.values()) m.dispose();
  cache.clear();
}

export const MODEL_KINDS = ["chip", "axial", "radial", "disc", "dip", "soic", "sot23", "sot223", "to92", "to220", "header", "led", "button", "crystal", "qfp", "hole", "buzzer", "pot", "sod123", "do41", "usb", "testpoint"];

// ---------------------------------------------------------------- builder
// Collects transformed geometry per material and merges it at the end.
function makeBuilder(THREE) {
  const parts = new Map();
  const sources = new Set();
  const m4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  return {
    add(mat, geo, o = {}) {
      sources.add(geo);
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      pos.set(o.x || 0, o.y || 0, o.z || 0);
      scl.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
      if (o.q) quat.copy(o.q);
      else quat.setFromEuler(euler.set(o.rx || 0, o.ry || 0, o.rz || 0));
      g.applyMatrix4(m4.compose(pos, quat, scl));
      if (!parts.has(mat)) parts.set(mat, []);
      parts.get(mat).push(g);
    },
    build(name) {
      const group = new THREE.Group();
      group.name = name;
      for (const [mat, geos] of parts) {
        const merged = mergeGeometries(THREE, geos);
        for (const g of geos) g.dispose();
        const mesh = new THREE.Mesh(merged, modelMaterial(THREE, mat));
        mesh.name = mat;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      }
      for (const g of sources) g.dispose();
      return group;
    },
  };
}

export function mergeGeometries(THREE, geos) {
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const P = new Float32Array(n * 3);
  const N = new Float32Array(n * 3);
  const U = new Float32Array(n * 2);
  let o = 0;
  for (const g of geos) {
    const c = g.attributes.position.count;
    P.set(g.attributes.position.array.subarray(0, c * 3), o * 3);
    if (!g.attributes.normal) g.computeVertexNormals();
    N.set(g.attributes.normal.array.subarray(0, c * 3), o * 3);
    if (g.attributes.uv) U.set(g.attributes.uv.array.subarray(0, c * 2), o * 2);
    o += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(P, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(N, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(U, 2));
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

// ---------------------------------------------------------------- geometry helpers
function kit(THREE, b) {
  const V2 = (x, y) => new THREE.Vector2(x, y);
  const up = new THREE.Vector3(0, 1, 0);

  // Extrude a footprint-plane shape (x, local y) straight up to height h.
  function extrudeUp(shape, h, bevel = 0, curveSegments = 12) {
    const bv = Math.min(bevel, h / 3);
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(1e-3, h - 2 * bv), bevelEnabled: bv > 0, bevelThickness: bv, bevelSize: bv,
      bevelSegments: 2, curveSegments,
    });
    // (sx, sy, sz) -> (sx, -sz, sy): shape y becomes +Z, depth becomes height.
    g.rotateX(Math.PI / 2);
    g.translate(0, h - bv, 0);
    return g;
  }
  function polyShape(pts) {
    const s = new THREE.Shape();
    pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
    s.closePath();
    return s;
  }
  function roundRectPts(w, d, r, seg = 4) {
    const pts = [];
    r = Math.max(0, Math.min(r, w / 2, d / 2));
    const cs = [[w / 2 - r, d / 2 - r, 0], [-w / 2 + r, d / 2 - r, 90], [-w / 2 + r, -d / 2 + r, 180], [w / 2 - r, -d / 2 + r, 270]];
    for (const [cx, cy, a0] of cs) {
      for (let i = 0; i <= seg; i++) {
        const a = ((a0 + (90 * i) / seg) * Math.PI) / 180;
        pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
      }
    }
    return pts;
  }
  // Box with softly rounded edges, footprint size w (x) by d (local y), height h.
  function roundedBox(w, d, h, r = 0.1, bevel = 0.1) {
    const bv = Math.min(bevel, w / 4, d / 4, h / 3);
    return extrudeUp(polyShape(roundRectPts(w - 2 * bv, d - 2 * bv, Math.max(0.01, r - bv))), h, bv);
  }
  // Plain box with its bottom at y0.
  function box(mat, cx, y0, cz, w, h, d, o = {}) {
    b.add(mat, new THREE.BoxGeometry(w, h, d), { x: cx, y: y0 + h / 2, z: cz, ...o });
  }
  function cyl(mat, cx, y0, cz, r, h, seg = 20, o = {}) {
    b.add(mat, new THREE.CylinderGeometry(o.r2 ?? r, r, h, seg), { x: cx, y: y0 + h / 2, z: cz });
  }
  // Cylinder between two points (wire / lead segment).
  function rod(mat, a, c, r, seg = 10) {
    const dir = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const len = dir.length();
    if (len < 1e-6) return;
    const q = new THREE.Quaternion().setFromUnitVectors(up, dir.normalize());
    b.add(mat, new THREE.CylinderGeometry(r, r, len, seg, 1), { x: (a[0] + c[0]) / 2, y: (a[1] + c[1]) / 2, z: (a[2] + c[2]) / 2, q });
  }
  function ball(mat, x, y, z, r, seg = 10) {
    b.add(mat, new THREE.SphereGeometry(r, seg, Math.max(4, seg >> 1)), { x, y, z });
  }
  function lathe(points, seg = 32) {
    return new THREE.LatheGeometry(points.map(([r, y]) => V2(Math.max(0, r), y)), seg);
  }
  // Gull-wing lead pointing +X from a body edge at x=0, foot on y=0.
  function gullWing(reach, h0, t, w) {
    const e1 = reach * 0.3;
    const e2 = reach * 0.55;
    const s = polyShape([
      [-0.3, h0 + t / 2], [e1, h0 + t / 2], [e2, t], [reach, t], [reach, 0],
      [e2 - t * 0.5, 0], [e1 - t * 0.5, h0 - t / 2], [-0.3, h0 - t / 2],
    ]);
    const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
    g.translate(0, 0, -w / 2);
    return g;
  }
  return { V2, extrudeUp, polyShape, roundRectPts, roundedBox, box, cyl, rod, ball, lathe, gullWing };
}

const num = (v, d) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : d);

// ---------------------------------------------------------------- generators
const GEN = {
  chip(THREE, b, k, m, o) {
    const L = num(m.L, 2), W = num(m.W, 1.25), H = num(m.H, 0.5);
    const capL = Math.min(L * 0.22, 0.6);
    const mid = L - 2 * capL + 0.02;
    const body = m.body || "resistor";
    if (body === "resistor") {
      k.box("alumina", 0, 0.02, 0, mid, H * 0.82, W * 0.98);
      k.box("resTop", 0, 0.02 + H * 0.82, 0, mid, H * 0.14, W * 0.96);
    } else if (body === "led") {
      k.box("ledBody", 0, 0.02, 0, mid, H * 0.6, W * 0.98);
      k.box("ledLens", 0, 0.02 + H * 0.6, 0, mid * 0.92, H * 0.38, W * 0.9);
      if (m.polarity) k.box("ledMark", -mid / 2 + mid * 0.08, 0.02 + H * 0.6, 0, mid * 0.1, H * 0.4, W * 0.92);
    } else {
      const mat = body === "capacitor" ? "capTan" : body === "inductor" ? "inductor" : body === "fuse" ? "fuse" : "capTan";
      k.box(mat, 0, 0.02, 0, mid, H * 0.96, W * 0.98);
    }
    for (const s of [-1, 1]) k.b.add("tin", k.roundedBox(capL, W, H, 0.05, 0.04), { x: s * (L / 2 - capL / 2) });
  },

  axial(THREE, b, k, m, o) {
    const pitch = num(m.pitch, 10.16), L = num(m.L, 6.3), D = num(m.D, 2.5);
    const R = D / 2;
    const diode = m.body === "diode" || m.kind === "do41";
    const cx = pitch / 2;
    const yc = R + 0.15;
    const prof = diode
      ? [[0, -L / 2], [R * 0.8, -L / 2], [R * 0.97, -L / 2 + 0.2], [R, -L / 2 + 0.45], [R, L / 2 - 0.45], [R * 0.97, L / 2 - 0.2], [R * 0.8, L / 2], [0, L / 2]]
      : [[0, -L / 2], [R * 0.75, -L / 2], [R * 0.97, -L / 2 + 0.25], [R, -L / 2 + 0.6], [R, -L / 2 + L * 0.22], [R * 0.86, -L / 2 + L * 0.31],
        [R * 0.86, L / 2 - L * 0.31], [R, L / 2 - L * 0.22], [R, L / 2 - 0.6], [R * 0.97, L / 2 - 0.25], [R * 0.75, L / 2], [0, L / 2]];
    // Lathe axis Y turned onto +X (rz = -90deg maps +Y to +X).
    const along = { x: cx, y: yc, rz: -Math.PI / 2 };
    b.add(diode ? "diodeBody" : "resBeige", k.lathe(prof, 28), along);
    const rAt = (y) => {
      for (let i = 1; i < prof.length; i++) {
        const [r0, y0] = prof[i - 1];
        const [r1, y1] = prof[i];
        if (y >= y0 && y <= y1) return y1 === y0 ? Math.max(r0, r1) : r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
      }
      return R;
    };
    const band = (mat, y, w) => {
      const r = rAt(y) * 1.012;
      b.add(mat, new THREE.CylinderGeometry(r, r, w, 28, 1, true), { x: cx + y, y: yc, rz: -Math.PI / 2 });
    };
    if (diode) band("diodeBand", -L / 2 + L * 0.16, L * 0.12);
    else {
      // Colour code of the part value (m.bands, set by the viewer); 10 kOhm 5% otherwise.
      const bands = Array.isArray(m.bands) && m.bands.length === 4 ? m.bands : ["brown", "black", "orange", "gold"];
      band(`band_${bands[0]}`, -L / 2 + L * 0.13, L * 0.08);
      band(`band_${bands[1]}`, -L / 2 + L * 0.37, L * 0.07);
      band(`band_${bands[2]}`, -L / 2 + L * 0.5, L * 0.07);
      band(`band_${bands[3]}`, L / 2 - L * 0.14, L * 0.08);
    }
    const lr = diode ? 0.4 : 0.3;
    const bottom = -(o.T + 1);
    k.rod("tin", [0, yc, 0], [pitch, yc, 0], lr);
    for (const x of [0, pitch]) {
      k.rod("tin", [x, bottom, 0], [x, yc, 0], lr);
      k.ball("tin", x, yc, 0, lr);
    }
  },

  radial(THREE, b, k, m, o) {
    const P = num(m.pitch, 2), D = num(m.D, 5), H = num(m.H, D * 1.4 + 2);
    const R = D / 2, cx = P / 2, y0 = 0.4, top = y0 + H;
    const g = Math.min(1.2, H * 0.12);
    const prof = [[0, y0], [R - 0.35, y0], [R, y0 + 0.3], [R, y0 + g], [R * 0.93, y0 + g + 0.25], [R, y0 + g + 0.5],
      [R, top - 0.3], [R - 0.2, top - 0.05], [R * 0.86, top], [R * 0.86, top - 0.1], [0, top - 0.1]];
    b.add("capBlue", k.lathe(prof, 36), { x: cx });
    // Negative stripe on the pin-2 side (+X), theta measured from +Z towards +X.
    const sh = top - 0.35 - (y0 + g + 0.55);
    b.add("capStripe", new THREE.CylinderGeometry(R * 1.004, R * 1.004, sh, 12, 1, true, Math.PI / 2 - 0.55, 1.1), { x: cx, y: y0 + g + 0.55 + sh / 2 });
    k.cyl("aluminium", cx, top - 0.12, 0, R * 0.86, 0.06, 36);
    k.box("vent", cx, top - 0.07, 0, R * 1.2, 0.04, 0.12);
    k.box("vent", cx, top - 0.07, 0, 0.12, 0.04, R * 1.2);
    for (const x of [0, P]) k.rod("tin", [x, -(o.T + 1), 0], [x, y0 + 0.5, 0], 0.25);
  },

  disc(THREE, b, k, m, o) {
    const P = num(m.pitch, 5), D = num(m.D, 5), T = num(m.T, 2.5);
    const cx = P / 2, cy = 1.6 + D / 2;
    b.add("disc", new THREE.SphereGeometry(1, 28, 18), { x: cx, y: cy, sx: D / 2, sy: D / 2, sz: T / 2 });
    for (const [x, dir] of [[0, 1], [P, -1]]) {
      k.rod("tin", [x, -(o.T + 1), 0], [x, 1.4, 0], 0.25);
      k.rod("tin", [x, 1.4, 0], [cx - dir * D * 0.25, cy - D * 0.2, 0], 0.25);
      k.ball("tin", x, 1.4, 0, 0.25);
    }
  },

  led(THREE, b, k, m, o) {
    const P = num(m.pitch, 2.54), D = num(m.D, 5), H = num(m.H, D * 1.7);
    const R = D / 2, cx = P / 2, y0 = 1.0;
    const prof = [[0, y0], [R + 0.5, y0], [R + 0.5, y0 + 1], [R, y0 + 1], [R, y0 + H - R]];
    for (let i = 1; i <= 10; i++) {
      const a = (i / 10) * (Math.PI / 2);
      prof.push([R * Math.cos(a), y0 + H - R + R * Math.sin(a)]);
    }
    b.add("ledRed", k.lathe(prof, 32), { x: cx });
    const post = y0 + H * 0.45;
    k.box("tin", 0, -(o.T + 1), 0, 0.5, post + o.T + 1, 0.5);
    k.box("tin", P, -(o.T + 1), 0, 0.5, post + o.T + 1, 0.5);
    k.box("tin", 0.25, post, 0, 1.3, 0.8, 0.5); // cathode anvil
    k.box("tin", P - 0.15, post, 0, 0.4, 0.5, 0.4);
  },

  dip(THREE, b, k, m, o) {
    const n = Math.max(2, num(m.n, 8) & ~1), pitch = num(m.pitch, 2.54), row = num(m.row, 7.62);
    const half = n / 2;
    const len = (half - 1) * pitch;
    const w = row - 1.27, l = half * pitch - 0.75, h = 3.3, y0 = 0.5, bv = 0.15;
    const cx = row / 2, cz = len / 2;
    // Body outline with the pin-1 notch at the -Z end, inset for the bevel.
    const iw = w - 2 * bv, il = l - 2 * bv, nr = 0.75 + bv;
    const pts = [[-iw / 2, -il / 2], [-nr, -il / 2]];
    for (let i = 1; i < 10; i++) {
      const a = Math.PI - (i / 10) * Math.PI;
      pts.push([nr * Math.cos(a), -il / 2 + nr * Math.sin(a)]);
    }
    pts.push([nr, -il / 2], [iw / 2, -il / 2], [iw / 2, il / 2], [-iw / 2, il / 2]);
    b.add("plastic", k.extrudeUp(k.polyShape(pts), h, bv), { x: cx, y: y0, z: cz });
    k.cyl("plasticDim", cx - w / 2 + 1.1, y0 + h - 0.01, cz - l / 2 + 1.3, 0.45, 0.03, 20);
    const bottom = -(o.T + 1);
    for (const [px, side] of [[0, -1], [row, 1]]) {
      const edge = cx + side * (w / 2 - 0.2);
      for (let i = 0; i < half; i++) {
        const z = i * pitch;
        const xs = Math.min(edge, px), xe = Math.max(edge, px);
        k.box("tin", (xs + xe) / 2, y0 + 0.9, z, xe - xs + 0.25, 0.25, 1.4);
        k.box("tin", px, 0.7, z, 0.25, y0 + 1.15 - 0.7, 1.4);
        k.box("tin", px, bottom, z, 0.25, 0.7 - bottom, 0.5);
      }
    }
  },

  soic(THREE, b, k, m, o) {
    const n = Math.max(2, num(m.n, 8) & ~1), W = num(m.W, 3.9), pitch = num(m.pitch, 1.27);
    const half = n / 2;
    const L = num(m.L, (half - 1) * pitch + 1.2), H = num(m.H, 1.5), span = num(m.span, W + 2.1);
    b.add("plastic", k.roundedBox(W, L, H - 0.1, 0.15, 0.12), { y: 0.1 });
    k.cyl("plasticDim", -W / 2 + 0.6, H - 0.01, -L / 2 + 0.6, 0.25, 0.03, 16);
    const lead = k.gullWing((span - W) / 2, H * 0.42, 0.2, Math.min(0.45, pitch * 0.4));
    const y0 = -((half - 1) * pitch) / 2;
    for (let i = 0; i < half; i++) {
      b.add("tin", lead, { x: -W / 2, z: y0 + i * pitch, ry: Math.PI });
      b.add("tin", lead, { x: W / 2, z: y0 + i * pitch });
    }
  },

  qfp(THREE, b, k, m, o) {
    const W = num(m.W, 7), H = num(m.H, 1.2), n = Math.max(4, num(m.n, 32)), pitch = num(m.pitch, 0.8), span = num(m.span, W + 2);
    const per = Math.floor(n / 4);
    b.add("plastic", k.roundedBox(W, W, H - 0.1, 0.2, 0.12), { y: 0.1 });
    k.cyl("plasticDim", -W / 2 + 0.9, H - 0.01, -W / 2 + 0.9, 0.35, 0.03, 16);
    const lead = k.gullWing((span - W) / 2, H * 0.45, 0.15, Math.min(0.4, pitch * 0.45));
    for (let i = 0; i < per; i++) {
      const off = -((per - 1) * pitch) / 2 + i * pitch;
      for (let s = 0; s < 4; s++) {
        // Side s: +X, then each quarter turn about Y (rotation maps +X to -Z, -X, +Z).
        const a = (s * Math.PI) / 2;
        const lx = W / 2, lz = off;
        const x = lx * Math.cos(a) + lz * Math.sin(a);
        const z = -lx * Math.sin(a) + lz * Math.cos(a);
        b.add("tin", lead, { x, z, ry: a });
      }
    }
  },

  sot23(THREE, b, k, m, o) {
    const W = num(m.W, 2.9), L = num(m.L, 1.3), H = num(m.H, 1.0);
    b.add("plastic", k.roundedBox(W, L, H - 0.1, 0.08, 0.08), { y: 0.1 });
    const lead = k.gullWing(Math.max(0.3, 1.2 - L / 2), H * 0.4, 0.12, 0.4);
    for (const x of [-0.95, 0.95]) b.add("tin", lead, { x, z: L / 2, ry: -Math.PI / 2 });
    b.add("tin", lead, { x: 0, z: -L / 2, ry: Math.PI / 2 });
  },

  sot223(THREE, b, k, m, o) {
    const W = num(m.W, 3.5), L = num(m.L, 6.5), H = num(m.H, 1.6);
    b.add("plastic", k.roundedBox(W, L, H - 0.1, 0.12, 0.1), { y: 0.1 });
    const reach = Math.max(0.6, 3.5 - W / 2);
    const lead = k.gullWing(reach, H * 0.4, 0.25, 0.7);
    for (const z of [-2.3, 0, 2.3]) b.add("tin", lead, { x: -W / 2, z, ry: Math.PI });
    b.add("tin", k.gullWing(reach, H * 0.4, 0.25, 3.0), { x: W / 2 });
  },

  sod123(THREE, b, k, m, o) {
    const L = num(m.L, 2.7), W = num(m.W, 1.6), H = num(m.H, 1.1);
    b.add("plastic", k.roundedBox(L, W, H - 0.05, 0.1, 0.08), { y: 0.05 });
    k.box("diodeBand", -L / 2 + 0.45, H - 0.01, 0, 0.35, 0.02, W * 0.9);
    const lead = k.gullWing(Math.max(0.3, 1.9 - L / 2), H * 0.35, 0.12, 0.6);
    b.add("tin", lead, { x: L / 2 });
    b.add("tin", lead, { x: -L / 2, ry: Math.PI });
  },

  to92(THREE, b, k, m, o) {
    const cx = num(m.cx, 1.27), D = num(m.D, 4.8), H = num(m.H, 4.8);
    const bv = 0.2, R = D / 2 - bv, f = D / 2 * 0.66 - bv;
    const a0 = Math.asin(Math.min(0.99, f / R));
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const a = Math.PI - a0 + (i / 24) * (Math.PI + 2 * a0);
      pts.push([R * Math.cos(a), R * Math.sin(a)]);
    }
    const y0 = 2.0;
    b.add("plastic", k.extrudeUp(k.polyShape(pts), H, bv), { x: cx, y: y0 });
    for (const x of [cx - 1.27, cx, cx + 1.27]) k.box("tin", x, -(o.T + 1), 0, 0.45, y0 + 0.3 + o.T + 1, 0.4);
  },

  to220(THREE, b, k, m, o) {
    const cx = num(m.cx, 2.54), W = num(m.W, 10), T = num(m.T, 4.5), H = num(m.H, 15);
    const tabT = 1.3, bodyT = Math.max(1, T - tabT), y0 = 3.0, bodyH = Math.min(9.2, H * 0.62);
    const zFront = 1.3, zBack = zFront - bodyT;
    b.add("plastic", k.roundedBox(W, bodyT, bodyH, 0.15, 0.12), { x: cx, y: y0, z: (zFront + zBack) / 2 });
    // Metal tab in the X/height plane with the mounting hole, extruded along Z.
    const tab = new THREE.Shape();
    tab.moveTo(cx - W / 2, y0); tab.lineTo(cx + W / 2, y0); tab.lineTo(cx + W / 2, y0 + H); tab.lineTo(cx - W / 2, y0 + H); tab.closePath();
    const hole = new THREE.Path();
    hole.absarc(cx, y0 + H - 2.8, 1.85, 0, Math.PI * 2, true);
    tab.holes.push(hole);
    const tg = new THREE.ExtrudeGeometry(tab, { depth: tabT, bevelEnabled: false, curveSegments: 16 });
    b.add("tin", tg, { z: zBack - tabT });
    const bottom = -(o.T + 1);
    for (const x of [cx - 2.54, cx, cx + 2.54]) {
      k.box("tin", x, bottom, 0, 0.8, y0 - 1.5 - bottom, 0.5);
      k.box("tin", x, y0 - 1.5, 0, 1.4, 1.7, 0.5);
    }
  },

  header(THREE, b, k, m, o) {
    const rows = Math.max(1, num(m.rows, 1)), n = Math.max(1, num(m.n, 4)), pitch = num(m.pitch, 2.54);
    const block = k.roundedBox(pitch - 0.04, pitch - 0.04, 2.5, 0.06, 0.18);
    const pin = new THREE.BoxGeometry(0.64, 1, 0.64);
    const tip = new THREE.ConeGeometry(0.45, 0.4, 4);
    const lo = -(o.T + 2.5), hi = 8.1;
    for (let i = 0; i < n; i++) {
      for (let r = 0; r < rows; r++) {
        const x = r * pitch, z = i * pitch;
        b.add("plastic", block, { x, z });
        b.add("gold", pin, { x, y: (lo + hi) / 2, z, sy: hi - lo });
        b.add("gold", tip, { x, y: hi + 0.2, z, ry: Math.PI / 4 });
        b.add("gold", tip, { x, y: lo - 0.2, z, rx: Math.PI, ry: Math.PI / 4 });
      }
    }
  },

  button(THREE, b, k, m, o) {
    const cx = num(m.cx, 3.25), cy = num(m.cy, 2.25), W = num(m.W, 6), H = num(m.H, 5);
    const bodyH = Math.min(3.4, H * 0.68);
    b.add("plastic", k.roundedBox(W, W, bodyH, 0.2, 0.15), { x: cx, z: cy });
    k.box("tin", cx, bodyH, cy, W, 0.25, W);
    k.cyl("plasticDim", cx, bodyH + 0.25, cy, 1.75, H - bodyH - 0.25, 28);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.cyl("plastic", cx + dx * (W / 2 - 0.8), bodyH + 0.25, cy + dz * (W / 2 - 0.8), 0.35, 0.3, 12);
    const legs = o.pads.length ? o.pads : [[cx - 3.25, cy - 2.25], [cx + 3.25, cy - 2.25], [cx - 3.25, cy + 2.25], [cx + 3.25, cy + 2.25]];
    for (const [x, z] of legs) {
      k.box("tin", x, -(o.T + 1), z, 0.3, o.T + 2, 0.7);
      const edge = x < cx ? cx - W / 2 : cx + W / 2;
      k.box("tin", (x + edge) / 2, 0.75, z, Math.abs(edge - x) + 0.3, 0.25, 0.7);
    }
  },

  crystal(THREE, b, k, m, o) {
    const P = num(m.pitch, 4.88), L = num(m.L, 10.9), W = num(m.W, 4.6), H = num(m.H, 3.6);
    const cx = P / 2;
    const stadium = (len, wid) => {
      const r = wid / 2, a = Math.max(0, len / 2 - r), pts = [];
      for (let i = 0; i <= 12; i++) { const t = -Math.PI / 2 + (i / 12) * Math.PI; pts.push([a + r * Math.cos(t), r * Math.sin(t)]); }
      for (let i = 0; i <= 12; i++) { const t = Math.PI / 2 + (i / 12) * Math.PI; pts.push([-a + r * Math.cos(t), r * Math.sin(t)]); }
      return k.polyShape(pts);
    };
    b.add("tin", k.extrudeUp(stadium(L - 0.4, W - 0.4), 0.45, 0.1), { x: cx });
    b.add("can", k.extrudeUp(stadium(L - 0.9, W - 0.9), H - 0.45, 0.25), { x: cx, y: 0.45 });
    for (const x of [0, P]) k.rod("tin", [x, -(o.T + 1), 0], [x, 0.2, 0], 0.22);
  },

  pot(THREE, b, k, m, o) {
    const cx = num(m.cx, 2.54), cy = num(m.cy, -2.3), W = num(m.W, 9.5), D = num(m.D, 7.3), H = num(m.H, 4.8);
    b.add("potBlue", k.roundedBox(W, D, H - 0.7, 0.3, 0.15), { x: cx, y: 0.2, z: cy });
    const rx = cx, rz = cy + D * 0.08;
    k.cyl("brass", rx, H - 0.7, rz, Math.min(W, D) * 0.27, 0.7, 28);
    k.box("plasticDim", rx, H - 0.05, rz, Math.min(W, D) * 0.4, 0.08, 0.35);
    k.box("plasticDim", rx, H - 0.05, rz, 0.35, 0.08, Math.min(W, D) * 0.4);
    const legs = o.pads.length ? o.pads : [[cx - 2.54, 0], [cx, -2.54], [cx + 2.54, 0]];
    for (const [x, z] of legs) k.box("tin", x, -(o.T + 1), z, 0.5, o.T + 1.4, 0.3);
  },

  buzzer(THREE, b, k, m, o) {
    const cx = num(m.cx, 3.8), D = num(m.D, 12), H = num(m.H, 9.5);
    const R = D / 2, hr = Math.min(1.2, R * 0.2);
    const prof = [[0, 0.3], [R - 0.3, 0.3], [R, 0.6], [R, H - 0.5], [R - 0.5, H], [hr, H], [hr, H - 1], [0, H - 1]];
    b.add("plastic", k.lathe(prof, 40), { x: cx });
    const legs = o.pads.length ? o.pads : [[0, 0], [cx * 2, 0]];
    for (const [x, z] of legs) k.rod("tin", [x, -(o.T + 1), z], [x, 0.4, z], 0.3);
  },

  usb(THREE, b, k, m, o) {
    const W = num(m.W, 7.5), D = num(m.D, 5), H = num(m.H, 2.5), cy = num(m.cy, -1);
    // Cross-section in the X/height plane, extruded along Z into a hollow shell.
    const outline = (inset) => [
      [-W / 2 + inset, H - inset], [-W / 2 + inset, H * 0.45], [-W / 2 + 0.7 + inset * 0.6, 0.05 + inset],
      [W / 2 - 0.7 - inset * 0.6, 0.05 + inset], [W / 2 - inset, H * 0.45], [W / 2 - inset, H - inset],
    ];
    const shape = k.polyShape(outline(0));
    const inner = new THREE.Path();
    outline(0.2).reverse().forEach(([x, y], i) => (i ? inner.lineTo(x, y) : inner.moveTo(x, y)));
    inner.closePath();
    shape.holes.push(inner);
    const zb = cy - D / 2;
    b.add("shell", new THREE.ExtrudeGeometry(shape, { depth: D, bevelEnabled: false }), { z: zb });
    b.add("shell", new THREE.ExtrudeGeometry(k.polyShape(outline(0.15)), { depth: 0.2, bevelEnabled: false }), { z: zb });
    k.box("plastic", 0, H * 0.42, cy + 0.2, W * 0.62, 0.6, D * 0.75);
    for (const s of [-1, 1]) k.box("shell", s * (W / 2 + 0.25), 0, zb + 0.6, 0.5, 0.15, 1.2);
  },

  testpoint(THREE, b, k, m, o) {
    const r = num(m.D, 1.5) / 2 * 0.75;
    b.add("tin", new THREE.SphereGeometry(r, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), { sy: 0.45 });
  },

  hole(THREE, b, k, m, o) {
    const drill = num(m.drill, o.drill || 3.2);
    const r1 = drill / 2 + 0.08, r2 = drill / 2 + 1.1;
    b.add("tin", k.lathe([[r1, 0.0], [r2, 0.0], [r2, 0.05], [r1, 0.05], [r1, 0.0]], 40));
  },

  unknown(THREE, b, k, m, o) {
    const c = o.courtyard || { x1: -1, y1: -1, x2: 1, y2: 1 };
    const w = Math.max(0.2, c.x2 - c.x1 - 0.5), d = Math.max(0.2, c.y2 - c.y1 - 0.5);
    b.add("unknown", k.roundedBox(w, d, num(m.H, 1), 0.1, 0.08), { x: (c.x1 + c.x2) / 2, z: (c.y1 + c.y2) / 2 });
  },
};
GEN.do41 = (THREE, b, k, m, o) => GEN.axial(THREE, b, k, { pitch: 10.16, L: 5.2, D: 2.7, ...m, body: "diode" }, o);

export function buildModel(model3d, THREE, opts = {}) {
  const m = model3d && typeof model3d === "object" ? model3d : {};
  const kind = GEN[m.kind] ? m.kind : "unknown";
  const o = {
    T: num(opts.boardThickness, 1.6),
    courtyard: opts.courtyard || null,
    pads: Array.isArray(opts.pads) ? opts.pads : [],
    drill: opts.drill,
  };
  const b = makeBuilder(THREE);
  const k = kit(THREE, b);
  k.b = b;
  GEN[kind](THREE, b, k, m, o);
  const g = b.build(`model:${kind}`);
  g.userData.kind = kind;
  return g;
}

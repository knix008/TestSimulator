// Geometry: parametric body templates. Each template turns its parameters (model units, mm)
// into a solid tree the solver understands (crates/sim-core/src/geom.rs): primitives combined by
// union / subtract / intersect. Bodies keep the template and its parameters, so editing a value
// rebuilds the body. Z is up.

const P = (key, def, min = 0.01, step = 1) => ({ key, def, min, step });
const N = (key, def, min = 1, max = 64) => ({ key, def, min, max, step: 1, integer: true });

const at = (node, position = [0, 0, 0], rotation = [0, 0, 0]) => ({ ...node, placement: { position, rotation } });
const box = (w, d, h) => ({ type: 'box', size: [w, d, h] });
const cyl = (r, h) => ({ type: 'cylinder', radius: r, height: h });

function polygonRegular(n, r, phase = 0) {
  return Array.from({ length: n }, (_, i) => { const a = phase + (2 * Math.PI * i) / n; return [r * Math.cos(a), r * Math.sin(a)]; });
}

export const TEMPLATES = {
  box: { icon: 'shapeBox', group: 'primitive', params: [P('width', 100), P('depth', 50), P('height', 20)], make: (p) => box(p.width, p.depth, p.height) },
  cylinder: { icon: 'shapeCylinder', group: 'primitive', params: [P('radius', 20), P('height', 60)], make: (p) => cyl(p.radius, p.height) },
  tube: { icon: 'shapeTube', group: 'primitive', params: [P('outer', 25), P('inner', 20), P('height', 80)], make: (p) => ({ type: 'tube', outer: p.outer, inner: Math.min(p.inner, p.outer * 0.99), height: p.height }) },
  sphere: { icon: 'shapeSphere', group: 'primitive', params: [P('radius', 25)], make: (p) => ({ type: 'sphere', radius: p.radius }) },
  cone: { icon: 'shapeCone', group: 'primitive', params: [P('r1', 25), P('r2', 10, 0), P('height', 50)], make: (p) => ({ type: 'cone', r1: p.r1, r2: p.r2, height: p.height }) },
  torus: { icon: 'shapeTorus', group: 'primitive', params: [P('major', 40), P('minor', 10)], make: (p) => ({ type: 'torus', major: p.major, minor: Math.min(p.minor, p.major * 0.95) }) },
  prism: { icon: 'shapePrism', group: 'primitive', params: [N('sides', 6, 3, 48), P('radius', 25), P('height', 40)], make: (p) => ({ type: 'extrude', points: polygonRegular(p.sides, p.radius, Math.PI / p.sides), height: p.height }) },
  plateHole: {
    icon: 'shapePlateHole', group: 'part', params: [P('width', 200), P('depth', 60), P('thickness', 10), P('holeDiameter', 20)],
    make: (p) => ({ type: 'subtract', children: [box(p.width, p.depth, p.thickness), at(cyl(Math.min(p.holeDiameter, 0.95 * p.depth) / 2, p.thickness * 3))] }),
  },
  lBracket: {
    icon: 'shapeBracket', group: 'part', params: [P('width', 60), P('height', 60), P('thickness', 8), P('depth', 40), P('holeDiameter', 10, 0)],
    make: (p) => {
      const t = Math.min(p.thickness, 0.9 * Math.min(p.width, p.height));
      const profile = [[0, 0], [p.width, 0], [p.width, t], [t, t], [t, p.height], [0, p.height]].map(([x, z]) => [x - p.width / 2, z - p.height / 2]);
      // The profile lies in XZ: extrude along Z and turn the body so the depth runs along Y.
      const body = at({ type: 'extrude', points: profile, height: p.depth }, [0, 0, 0], [90, 0, 0]);
      if (!(p.holeDiameter > 0)) return { type: 'union', children: [body] };
      // Through the horizontal leg, midway along its free part.
      const hole = at(cyl(Math.min(p.holeDiameter, 0.8 * (p.width - t), 0.8 * p.depth) / 2, t * 4), [t / 2, 0, -p.height / 2 + t / 2]);
      return { type: 'subtract', children: [body, hole] };
    },
  },
  iBeam: {
    icon: 'shapeIBeam', group: 'part', params: [P('height', 100), P('flange', 60), P('web', 6), P('flangeThickness', 8), P('length', 600)],
    make: (p) => {
      const [h, b, tw, tf] = [p.height, p.flange, Math.min(p.web, p.flange * 0.8), Math.min(p.flangeThickness, p.height * 0.45)];
      const pts = [[-b / 2, -h / 2], [b / 2, -h / 2], [b / 2, -h / 2 + tf], [tw / 2, -h / 2 + tf], [tw / 2, h / 2 - tf], [b / 2, h / 2 - tf], [b / 2, h / 2], [-b / 2, h / 2], [-b / 2, h / 2 - tf], [-tw / 2, h / 2 - tf], [-tw / 2, -h / 2 + tf], [-b / 2, -h / 2 + tf]];
      // Section in YZ, length along X.
      return { type: 'union', children: [at({ type: 'extrude', points: pts.map(([y, z]) => [z, y]), height: p.length }, [0, 0, 0], [0, 90, 0])] };
    },
  },
  channel: {
    icon: 'shapeChannel', group: 'part', params: [P('height', 80), P('flange', 40), P('thickness', 6), P('length', 500)],
    make: (p) => {
      const [h, b, t] = [p.height, p.flange, Math.min(p.thickness, p.flange * 0.8, p.height * 0.45)];
      const pts = [[0, 0], [b, 0], [b, t], [t, t], [t, h - t], [b, h - t], [b, h], [0, h]].map(([y, z]) => [y - b / 2, z - h / 2]);
      return { type: 'union', children: [at({ type: 'extrude', points: pts.map(([y, z]) => [z, y]), height: p.length }, [0, 0, 0], [0, 90, 0])] };
    },
  },
  flange: {
    icon: 'shapeFlange', group: 'part', params: [P('outer', 160), P('bore', 60), P('thickness', 16), P('hubDiameter', 90), P('hubHeight', 30), P('boltCircle', 125), P('boltDiameter', 14), N('bolts', 6, 0, 24)],
    make: (p) => {
      const plate = at(cyl(p.outer / 2, p.thickness), [0, 0, p.thickness / 2]);
      const hub = at(cyl(Math.min(p.hubDiameter, p.outer) / 2, p.hubHeight), [0, 0, p.hubHeight / 2]);
      const cuts = [at(cyl(Math.min(p.bore, p.hubDiameter * 0.95) / 2, Math.max(p.hubHeight, p.thickness) * 3))];
      for (let i = 0; i < p.bolts; i++) { const a = (2 * Math.PI * i) / p.bolts; cuts.push(at(cyl(p.boltDiameter / 2, p.thickness * 3), [(p.boltCircle / 2) * Math.cos(a), (p.boltCircle / 2) * Math.sin(a), 0])); }
      return { type: 'subtract', children: [{ type: 'union', children: [plate, hub] }, ...cuts] };
    },
  },
  shaft: {
    icon: 'shapeShaft', group: 'part', params: [P('d1', 40), P('l1', 80), P('d2', 30), P('l2', 120), P('d3', 25), P('l3', 60)],
    make: (p) => {
      const parts = [];
      let x = -(p.l1 + p.l2 + p.l3) / 2;
      for (const [d, l] of [[p.d1, p.l1], [p.d2, p.l2], [p.d3, p.l3]]) { if (l > 0 && d > 0) parts.push(at(cyl(d / 2, l), [x + l / 2, 0, 0], [0, 90, 0])); x += l; }
      return { type: 'union', children: parts };
    },
  },
  heatSink: {
    icon: 'shapeHeatSink', group: 'part', params: [P('width', 60), P('depth', 60), P('base', 5), P('finHeight', 25), P('finThickness', 2), N('fins', 7, 2, 40)],
    make: (p) => {
      const parts = [at(box(p.width, p.depth, p.base), [0, 0, p.base / 2])];
      const pitch = (p.width - p.finThickness) / Math.max(1, p.fins - 1);
      for (let i = 0; i < p.fins; i++) parts.push(at(box(Math.min(p.finThickness, pitch * 0.8), p.depth, p.finHeight), [-p.width / 2 + p.finThickness / 2 + i * pitch, 0, p.base + p.finHeight / 2 - 0.001]));
      return { type: 'union', children: parts };
    },
  },
  pipe: { icon: 'shapePipe', group: 'part', params: [P('outer', 40), P('inner', 32), P('length', 300)], make: (p) => ({ type: 'union', children: [at({ type: 'tube', outer: p.outer / 2, inner: Math.min(p.inner, p.outer * 0.98) / 2, height: p.length }, [0, 0, 0], [0, 90, 0])] }) },
  duct: {
    icon: 'shapeDuct', group: 'fluid', params: [P('width', 40), P('height', 40), P('length', 300)],
    make: (p) => box(p.length, p.width, p.height),
  },
  bentChannel: {
    icon: 'shapeElbow', group: 'fluid', params: [P('width', 30), P('legA', 150), P('legB', 150)],
    make: (p) => ({ type: 'union', children: [at(box(p.legA + p.width / 2, p.width, p.width), [(p.legA + p.width / 2) / 2 - p.width / 2, 0, 0]), at(box(p.width, p.width, p.legB + p.width / 2), [0, 0, (p.legB + p.width / 2) / 2 - p.width / 2])] }),
  },
  wing: {
    icon: 'shapeWing', group: 'fluid', params: [P('chord', 100), P('thickness', 12), P('span', 120), P('angle', 5, -30, 1)],
    make: (p) => {
      // Symmetric 4-digit airfoil section in XZ, extruded along Y.
      const n = 28;
      const tt = p.thickness / p.chord;
      const yt = (x) => 5 * tt * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
      const upper = []; const lower = [];
      for (let i = 0; i <= n; i++) { const x = (1 - Math.cos((Math.PI * i) / n)) / 2; upper.push([x * p.chord - p.chord / 2, yt(x) * p.chord]); lower.push([x * p.chord - p.chord / 2, -yt(x) * p.chord]); }
      const pts = [...upper, ...lower.reverse().slice(1, -1)];
      return { type: 'union', children: [at({ type: 'extrude', points: pts, height: p.span }, [0, 0, 0], [90, p.angle, 0])] };
    },
  },
  coil: { icon: 'shapeCoil', group: 'electromagnetic', params: [P('outer', 30), P('inner', 20), P('height', 40)], make: (p) => ({ type: 'tube', outer: p.outer, inner: Math.min(p.inner, p.outer * 0.98), height: p.height }) },
  magnetDisc: { icon: 'shapeMagnet', group: 'electromagnetic', params: [P('radius', 10), P('height', 8)], make: (p) => cyl(p.radius, p.height) },
  ePlates: {
    icon: 'shapeCapacitor', group: 'electromagnetic', params: [P('width', 40), P('thickness', 2), P('gap', 6)],
    make: (p) => box(p.width, p.width, p.thickness),
  },
  // Profiles drawn as a table of points (model units): extruded along Z, or revolved around Z (r, z).
  profileExtrude: {
    icon: 'pushPull', group: 'profile', params: [P('height', 30)], profile: 'xy',
    make: (p, body) => ({ type: 'extrude', points: cleanProfile(body?.profile ?? DEFAULT_PROFILES.xy), height: p.height }),
  },
  profileRevolve: {
    icon: 'profileRevolve', group: 'profile', params: [], profile: 'rz',
    make: (p, body) => ({ type: 'revolve', points: cleanProfile(body?.profile ?? DEFAULT_PROFILES.rz).map(([r, z]) => [Math.max(0, r), z]) }),
  },
  stl: { icon: 'stlFile', group: 'import', params: [P('scale', 1, 0.0001, 0.1)], make: (p, body) => ({ type: 'mesh', positions: (body?.stl ?? []).map((v) => v * (p.scale ?? 1)) }) },
};

export const TEMPLATE_GROUPS = ['primitive', 'profile', 'part', 'fluid', 'electromagnetic', 'import'];

/** Default profiles: a house-shaped outline in XY, a stepped shaft section in (r, z). */
export const DEFAULT_PROFILES = {
  xy: [[-30, -20], [30, -20], [30, 15], [0, 35], [-30, 15]],
  rz: [[0, -30], [25, -30], [25, -15], [15, -10], [15, 20], [8, 30], [0, 30]],
};

/** A usable polygon: finite points, no repeated neighbours, at least three. */
export function cleanProfile(points) {
  const out = [];
  for (const q of points ?? []) {
    const x = Number(q?.[0]); const y = Number(q?.[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const last = out.at(-1);
    if (last && Math.abs(last[0] - x) < 1e-9 && Math.abs(last[1] - y) < 1e-9) continue;
    out.push([x, y]);
  }
  if (out.length > 1 && Math.abs(out[0][0] - out.at(-1)[0]) < 1e-9 && Math.abs(out[0][1] - out.at(-1)[1]) < 1e-9) out.pop();
  return out.length >= 3 ? out : DEFAULT_PROFILES.xy;
}

/** Signed area of a polygon (positive: counter-clockwise). */
export function polygonArea(points) {
  let a = 0;
  for (let i = 0; i < points.length; i++) { const [x1, y1] = points[i]; const [x2, y2] = points[(i + 1) % points.length]; a += x1 * y2 - x2 * y1; }
  return a / 2;
}

/** Whether a polygon's edges cross each other (other than at shared corners). */
export function selfIntersects(points) {
  const n = points.length;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  for (let i = 0; i < n; i++) {
    const a = points[i]; const b = points[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const c = points[j]; const d = points[(j + 1) % n];
      const d1 = cross(c, d, a); const d2 = cross(c, d, b); const d3 = cross(a, b, c); const d4 = cross(a, b, d);
      if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
    }
  }
  return false;
}
export const TEMPLATE_IDS = Object.keys(TEMPLATES);

export function defaultParams(template) {
  const out = {};
  for (const p of TEMPLATES[template]?.params ?? []) out[p.key] = p.def;
  return out;
}

/**
 * The solver node of a body: its template made from its parameters, at its place, then combined with
 * its tool bodies (body.ops: [{ op: 'subtract' | 'union' | 'intersect', tool: bodyId }], in order).
 */
export function bodyNode(body, project = null, depth = 0) {
  const tpl = TEMPLATES[body.template] ?? TEMPLATES.box;
  const node = tpl.make({ ...defaultParams(body.template), ...(body.params ?? {}) }, body);
  let out = { ...node, placement: { position: body.position ?? [0, 0, 0], rotation: body.rotation ?? [0, 0, 0] } };
  if (!project || depth > 16) return out;
  for (const o of body.ops ?? []) {
    const tool = project.bodies.find((b) => b.id === o.tool);
    if (!tool || !['subtract', 'union', 'intersect'].includes(o.op)) continue;
    out = { type: o.op, children: [out, bodyNode(tool, project, depth + 1)], placement: { position: [0, 0, 0], rotation: [0, 0, 0] } };
  }
  return out;
}

/** Bounding box of a body's template (model units), estimated from its node without the solver. */
export function nodeBox(node) {
  const pl = node.placement ?? { position: [0, 0, 0], rotation: [0, 0, 0] };
  let lo; let hi;
  switch (node.type) {
    case 'box': lo = node.size.map((v) => -v / 2); hi = node.size.map((v) => v / 2); break;
    case 'cylinder': lo = [-node.radius, -node.radius, -node.height / 2]; hi = [node.radius, node.radius, node.height / 2]; break;
    case 'tube': lo = [-node.outer, -node.outer, -node.height / 2]; hi = [node.outer, node.outer, node.height / 2]; break;
    case 'sphere': lo = [-node.radius, -node.radius, -node.radius]; hi = [node.radius, node.radius, node.radius]; break;
    case 'cone': { const r = Math.max(node.r1, node.r2); lo = [-r, -r, -node.height / 2]; hi = [r, r, node.height / 2]; break; }
    case 'torus': { const r = node.major + node.minor; lo = [-r, -r, -node.minor]; hi = [r, r, node.minor]; break; }
    case 'extrude': { const xs = node.points.map((q) => q[0]); const ys = node.points.map((q) => q[1]); lo = [Math.min(...xs), Math.min(...ys), -node.height / 2]; hi = [Math.max(...xs), Math.max(...ys), node.height / 2]; break; }
    case 'revolve': { const r = Math.max(...node.points.map((q) => q[0])); const zs = node.points.map((q) => q[1]); lo = [-r, -r, Math.min(...zs)]; hi = [r, r, Math.max(...zs)]; break; }
    case 'mesh': { lo = [Infinity, Infinity, Infinity]; hi = [-Infinity, -Infinity, -Infinity]; for (let i = 0; i < node.positions.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], node.positions[i + k]); hi[k] = Math.max(hi[k], node.positions[i + k]); } break; }
    default: {
      const kids = node.type === 'subtract' ? node.children.slice(0, 1) : node.children;
      lo = [Infinity, Infinity, Infinity]; hi = [-Infinity, -Infinity, -Infinity];
      for (const c of kids) { const b = nodeBox(c); for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], b[0][k]); hi[k] = Math.max(hi[k], b[1][k]); } }
    }
  }
  // Rotate the eight corners (degrees about X, then Y, then Z) and move.
  const [a, b, c] = pl.rotation.map((d) => (d * Math.PI) / 180);
  const rot = (v) => {
    let [x, y, z] = v;
    [y, z] = [y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
    [x, z] = [x * Math.cos(b) + z * Math.sin(b), -x * Math.sin(b) + z * Math.cos(b)];
    [x, y] = [x * Math.cos(c) - y * Math.sin(c), x * Math.sin(c) + y * Math.cos(c)];
    return [x, y, z];
  };
  const out = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
  for (let i = 0; i < 8; i++) {
    const p = rot([i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]]);
    for (let k = 0; k < 3; k++) { out[0][k] = Math.min(out[0][k], p[k] + pl.position[k]); out[1][k] = Math.max(out[1][k], p[k] + pl.position[k]); }
  }
  return out;
}

/** Triangles (flat x y z ×3) of an STL file, binary or text. */
export function parseStl(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const head = new TextDecoder().decode(u8.subarray(0, Math.min(512, u8.length)));
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const binaryCount = u8.length >= 84 ? view.getUint32(80, true) : 0;
  if (u8.length === 84 + binaryCount * 50 && binaryCount > 0) {
    const out = new Array(binaryCount * 9);
    for (let i = 0; i < binaryCount; i++) for (let v = 0; v < 9; v++) out[i * 9 + v] = view.getFloat32(84 + i * 50 + 12 + v * 4, true);
    return out;
  }
  if (!/^\s*solid/i.test(head)) throw new Error('stl.invalid');
  const text = new TextDecoder().decode(u8);
  const out = [];
  for (const m of text.matchAll(/vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/g)) out.push(Number(m[1]), Number(m[2]), Number(m[3]));
  if (out.length < 36 || out.length % 9) throw new Error('stl.invalid');
  return out;
}

/** An STL (binary) of triangles (flat x y z ×3, model units). */
export function writeStl(tris, name = 'My3DMaker') {
  const n = Math.floor(tris.length / 9);
  const buf = new ArrayBuffer(84 + n * 50);
  const view = new DataView(buf);
  const head = new TextEncoder().encode(name.slice(0, 79));
  new Uint8Array(buf).set(head, 0);
  view.setUint32(80, n, true);
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50;
    const p = (k) => [tris[i * 9 + k * 3], tris[i * 9 + k * 3 + 1], tris[i * 9 + k * 3 + 2]];
    const [a, b, c] = [p(0), p(1), p(2)];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const nn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(...nn) || 1;
    for (let k = 0; k < 3; k++) view.setFloat32(o + k * 4, nn[k] / len, true);
    for (let k = 0; k < 9; k++) view.setFloat32(o + 12 + k * 4, tris[i * 9 + k], true);
  }
  return new Uint8Array(buf);
}

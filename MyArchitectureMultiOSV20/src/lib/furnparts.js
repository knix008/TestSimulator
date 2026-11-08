// The part vocabulary of the furniture library. Every catalogue item is a list
// of these parts in its own frame (x across the width, y from the back −d/2 to
// the front +d/2, z up from the floor, millimetres); the plan symbol, the DXF
// outline, the fit test and the 3D model are all made from the same list.
//
// Parts (all take an optional last argument `o` with extra fields):
//   B  box        x, y, z (centre of the bottom face), w, d, h, colour, r
//                 r: radius of the vertical corners; o.b: soft edges all round
//   C  cylinder   x, y, z (centre of the bottom), rx, h, colour, ry
//                 o.top: top radius as a share of the bottom one (a cone, a tapered leg)
//   S  sphere     x, y, z (centre), r, colour; o.sx / o.sy / o.sz stretch it (an ellipsoid)
//   L  lathe      x, y, z, profile [[radius, height], …] turned about the vertical axis
//                 (vases, lamp shades, bowls, basins, bottles); o.sy squashes it front to back
//   E  extrusion  x, y, z, outline [[u, v], …], depth, colour; o.axis:
//                 "z" (default) a plan outline (u = x, v = y) raised `depth` from z,
//                 "x" a side profile (u = y, v = z) `depth` wide across x, centred on x,
//                 "y" a front profile (u = x, v = z) `depth` deep along y, centred on y;
//                 o.b rounds its edges
//   T  tube       [[x, y, z], …] path, radius, colour; o.smooth bends it through the points
//                 (frames of chairs, rails, faucets, lamp arms, hangers)
//   R  torus      x, y, z (centre), ring radius, tube radius, colour; o.axis: the axis the
//                 ring turns about ("z" lying flat, "x" / "y" standing like a wheel); o.arc (degrees)
// Every part may be turned: o.tx, o.ty, o.tz (degrees, about the part's anchor
// point x, y, z; applied x first, then y, then z). o.m picks the surface
// (see MATERIAL_CLASSES); by default it follows the colour key. o.g makes the
// part glow when its lamp is on.

export const B = (x, y, z, w, d, h, c = "main", r = 0, o) => ({ t: "box", x, y, z, w, d, h, c, r, ...o });
export const C = (x, y, z, rx, h, c = "main", ry = rx, o) => ({ t: "cyl", x, y, z, rx, ry, h, c, ...o });
export const S = (x, y, z, r, c = "leaf", o) => ({ t: "sph", x, y, z, r, c, ...o });
export const L = (x, y, z, prof, c = "main", o) => ({ t: "lathe", x, y, z, prof, c, ...o });
export const E = (x, y, z, pts, depth, c = "main", o) => ({ t: "ext", x, y, z, pts, depth, c, axis: "z", ...o });
export const T = (pts, r, c = "metal", o) => ({ t: "tube", x: pts[0][0], y: pts[0][1], z: pts[0][2], pts, r, c, ...o });
export const R = (x, y, z, R0, r, c = "metal", o) => ({ t: "tor", x, y, z, R: R0, r, c, axis: "z", ...o });
// A part that glows when its lamp is on (g: 0…1, how strongly).
export const G = (part, g = 1) => ({ ...part, g });
// A soft box (cushions, mattresses, upholstery): edges rounded by k of its smallest side.
export const SB = (x, y, z, w, d, h, c = "main", k = 0.28, o) => B(x, y, z, w, d, h, c, Math.min(w, d) * k, { b: Math.min(w, d, h) * k, ...o });

export const PART_TYPES = ["box", "cyl", "sph", "lathe", "ext", "tube", "tor"];

// Surfaces a part can have: roughness, metalness, opacity and the procedural
// texture painted on it (textures only in a browser).
export const MATERIAL_CLASSES = {
  paint: { rough: 0.55, metal: 0 },
  wood: { rough: 0.55, metal: 0, tex: "wood", tile: 600, bump: 0.6 },
  fabric: { rough: 0.95, metal: 0, tex: "fabric", tile: 120, bump: 1 },
  velvet: { rough: 1, metal: 0, tex: "fabric", tile: 80, bump: 0.5 },
  leather: { rough: 0.45, metal: 0, tex: "leather", tile: 160, bump: 1 },
  metal: { rough: 0.35, metal: 0.85 },
  brushed: { rough: 0.32, metal: 0.9, tex: "brushed", tile: 250, bump: 0.03 },
  matte: { rough: 0.62, metal: 0 },
  // Black glass of screens and appliance fronts: a soft reflection of the room.
  blackGlass: { rough: 0.06, metal: 0.35 },
  // Small lights (standby LEDs, displays): they glow a little, more so at night.
  led: { rough: 0.4, metal: 0, emissive: 1.4 },
  grille: { rough: 0.8, metal: 0.2, tex: "perforated", tile: 60, bump: 0.6 },
  chrome: { rough: 0.08, metal: 1 },
  brass: { rough: 0.25, metal: 1 },
  blackMetal: { rough: 0.45, metal: 0.6 },
  plastic: { rough: 0.35, metal: 0 },
  gloss: { rough: 0.18, metal: 0 },
  ceramic: { rough: 0.12, metal: 0 },
  stone: { rough: 0.25, metal: 0, tex: "marble", tile: 700, bump: 0 },
  granite: { rough: 0.3, metal: 0, tex: "granite", tile: 220, bump: 0.1 },
  concrete: { rough: 0.9, metal: 0, tex: "speckle", tile: 500, bump: 0.6 },
  glass: { rough: 0.05, metal: 0.1, opacity: 0.3 },
  mirror: { rough: 0.02, metal: 1 },
  screen: { rough: 0.05, metal: 0.3 },
  leaf: { rough: 0.7, metal: 0, tex: "leaf", tile: 250, bump: 0.4 },
  bark: { rough: 0.95, metal: 0, tex: "bark", tile: 300, bump: 1 },
  water: { rough: 0.05, metal: 0.1, opacity: 0.7 },
  rubber: { rough: 0.9, metal: 0 },
  skin: { rough: 0.6, metal: 0 },
  paper: { rough: 0.85, metal: 0 },
  rug: { rough: 1, metal: 0, tex: "fabric", tile: 60, bump: 1.4 },
};

// The surface a colour key gets when the part does not say.
export const CLASS_OF_COLOR = {
  wood: "wood", lightwood: "wood", darkwood: "wood", walnut: "wood", oak: "wood", trunk: "bark", bamboo: "wood", teak: "wood",
  fabric: "fabric", fabric2: "fabric", cushion: "fabric", linen: "fabric", grey: "fabric", charcoal: "fabric", navy: "fabric", sage: "fabric", mustard: "fabric", terracotta: "fabric", blush: "fabric", cream: "fabric", velvet: "velvet", teal: "velvet",
  rug: "rug", leather: "leather", tan: "leather", cognac: "leather",
  metal: "metal", steel: "brushed", chrome: "chrome", brass: "brass", gold: "brass", copper: "brass", black: "blackMetal",
  white: "paint", offwhite: "paint", dark: "paint", red: "gloss", yellow: "gloss", blue: "gloss", orange: "gloss", plastic: "plastic",
  ceramic: "ceramic", porcelain: "ceramic",
  stone: "stone", marble: "stone", granite: "granite", concrete: "concrete", terrazzo: "concrete", soil: "concrete", sand: "concrete",
  glass: "glass", mirror: "mirror", screen: "screen", water: "water",
  green: "leaf", leaf: "leaf", leaf2: "leaf", leaf3: "leaf", flower: "leaf", flower2: "leaf", flower3: "leaf", grass: "leaf",
  rubber: "rubber", tyre: "rubber", skin: "skin", skin2: "skin", hair: "fabric", paper: "paper", bulb: "paint", book1: "paper", book2: "paper", book3: "paper", book4: "paper", book5: "paper",
};

// ---------------------------------------------------------------- geometry of a part (pure maths)
const DEG = Math.PI / 180;

// Turn [x, y, z] (relative to the anchor) by the part's tx, ty, tz.
export function rotatePoint(p, q) {
  let [x, y, z] = q;
  if (p.tx) { const c = Math.cos(p.tx * DEG), s = Math.sin(p.tx * DEG); [y, z] = [y * c - z * s, y * s + z * c]; }
  if (p.ty) { const c = Math.cos(p.ty * DEG), s = Math.sin(p.ty * DEG); [x, z] = [x * c + z * s, -x * s + z * c]; }
  if (p.tz) { const c = Math.cos(p.tz * DEG), s = Math.sin(p.tz * DEG); [x, y] = [x * c - y * s, x * s + y * c]; }
  return [x, y, z];
}
const tilted = (p) => !!(p.tx || p.ty);

const ring = (n, f) => Array.from({ length: n }, (_, i) => f((i / n) * Math.PI * 2));

// Points on the surface of a part relative to its anchor and before turning
// (enough of them for its bounds and its top view).
function localPoints(p) {
  switch (p.t) {
    case "box": {
      const out = [];
      for (const a of [-1, 1]) for (const b of [-1, 1]) for (const z of [0, p.h]) out.push([(a * p.w) / 2, (b * p.d) / 2, z]);
      return out;
    }
    case "cyl": {
      const top = p.top ?? 1;
      return [...ring(16, (a) => [Math.cos(a) * p.rx, Math.sin(a) * p.ry, 0]), ...ring(16, (a) => [Math.cos(a) * p.rx * top, Math.sin(a) * p.ry * top, p.h])];
    }
    case "sph": {
      const rx = p.r * (p.sx ?? 1), ry = p.r * (p.sy ?? 1), rz = p.r * (p.sz ?? 1);
      const out = [[0, 0, rz], [0, 0, -rz]];
      for (const k of [-0.7, 0, 0.7]) { const c = Math.sqrt(1 - k * k); out.push(...ring(12, (a) => [Math.cos(a) * rx * c, Math.sin(a) * ry * c, k * rz])); }
      return out;
    }
    case "lathe": {
      const sy = p.sy ?? 1;
      const out = [];
      for (const [r, z] of p.prof) out.push(...ring(16, (a) => [Math.cos(a) * r, Math.sin(a) * r * sy, z]));
      return out;
    }
    case "ext": {
      const out = [];
      for (const [u, v] of p.pts) {
        if (p.axis === "x") for (const s of [-1, 1]) out.push([(s * p.depth) / 2, u, v]);
        else if (p.axis === "y") for (const s of [-1, 1]) out.push([u, (s * p.depth) / 2, v]);
        else for (const z of [0, p.depth]) out.push([u, v, z]);
      }
      return out;
    }
    case "tube": {
      const out = [];
      for (const q of p.pts) for (const [a, b, c] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) out.push([q[0] - p.x + a * p.r, q[1] - p.y + b * p.r, q[2] - p.z + c * p.r]);
      return out;
    }
    case "tor": {
      const out = [];
      const arc = ((p.arc ?? 360) * DEG);
      for (let i = 0; i <= 24; i++) {
        const a = (arc * i) / 24;
        for (const [dr, dz] of [[p.r, 0], [-p.r, 0], [0, p.r], [0, -p.r]]) {
          const rr = p.R + dr;
          const q = [Math.cos(a) * rr, Math.sin(a) * rr, dz]; // about z
          out.push(p.axis === "x" ? [q[2], q[0], q[1]] : p.axis === "y" ? [q[0], q[2], q[1]] : q);
        }
      }
      return out;
    }
    default:
      return [[0, 0, 0]];
  }
}

// Points of a part in the item frame (turned and placed).
export function partPoints(p) {
  return localPoints(p).map((q) => { const [x, y, z] = rotatePoint(p, q); return [p.x + x, p.y + y, p.z + z]; });
}

// Bounds of a part in the item frame: {x1, x2, y1, y2, z1, z2}.
export function partBounds(p) {
  let x1 = Infinity, x2 = -Infinity, y1 = Infinity, y2 = -Infinity, z1 = Infinity, z2 = -Infinity;
  for (const [x, y, z] of partPoints(p)) {
    if (x < x1) x1 = x; if (x > x2) x2 = x;
    if (y < y1) y1 = y; if (y > y2) y2 = y;
    if (z < z1) z1 = z; if (z > z2) z2 = z;
  }
  return { x1, x2, y1, y2, z1, z2 };
}

// The highest point of a part (draw order of the top view).
export const partTop = (p) => partBounds(p).z2;

// Convex hull of 2D points (monotone chain), counter-clockwise.
export function hull2(points) {
  const pts = points.map((q) => [q[0], q[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (let i = pts.length - 1; i >= 0; i--) { const q = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

// Top view of a part as outlines in the item frame: [{kind: "rect"|"ellipse"|"poly", …}].
// A tube is one rectangle per straight piece; a lying ring is two circles
// (filled even-odd); everything turned out of the horizontal is its hull.
export function partOutline(p) {
  if (p.t === "box" && !tilted(p) && !p.tz) return [{ kind: "rect", x: p.x - p.w / 2, y: p.y - p.d / 2, w: p.w, d: p.d, r: Math.min(p.r || 0, p.w / 2, p.d / 2) }];
  if (p.t === "cyl" && !tilted(p)) return [{ kind: "ellipse", x: p.x, y: p.y, rx: Math.max(p.rx, p.rx * (p.top ?? 1)), ry: Math.max(p.ry, p.ry * (p.top ?? 1)), rot: p.tz || 0 }];
  if (p.t === "sph" && !tilted(p)) return [{ kind: "ellipse", x: p.x, y: p.y, rx: p.r * (p.sx ?? 1), ry: p.r * (p.sy ?? 1), rot: p.tz || 0 }];
  if (p.t === "lathe" && !tilted(p)) { const r = Math.max(...p.prof.map((q) => q[0])); return [{ kind: "ellipse", x: p.x, y: p.y, rx: r, ry: r * (p.sy ?? 1), rot: p.tz || 0 }]; }
  if (p.t === "ext" && p.axis === "z" && !tilted(p)) return [{ kind: "poly", pts: p.pts.map(([u, v]) => { const [x, y] = rotatePoint(p, [u, v, 0]); return [p.x + x, p.y + y]; }) }];
  if (p.t === "tor" && p.axis === "z" && !tilted(p) && (p.arc ?? 360) >= 360) return [{ kind: "ellipse", x: p.x, y: p.y, rx: p.R + p.r, ry: p.R + p.r, rot: 0 }, { kind: "ellipse", x: p.x, y: p.y, rx: Math.max(0.5, p.R - p.r), ry: Math.max(0.5, p.R - p.r), rot: 0 }];
  if (p.t === "tube" && !tilted(p) && !p.tz) {
    const out = [];
    for (let i = 1; i < p.pts.length; i++) {
      const [ax, ay] = p.pts[i - 1], [bx, by] = p.pts[i];
      const len = Math.hypot(bx - ax, by - ay);
      if (len < 1e-6) continue;
      const nx = (-(by - ay) / len) * p.r, ny = ((bx - ax) / len) * p.r;
      out.push({ kind: "poly", pts: [[ax + nx, ay + ny], [bx + nx, by + ny], [bx - nx, by - ny], [ax - nx, ay - ny]] });
    }
    if (!out.length) { const [x, y] = p.pts[0]; out.push({ kind: "ellipse", x, y, rx: p.r, ry: p.r, rot: 0 }); }
    return out;
  }
  return [{ kind: "poly", pts: hull2(partPoints(p)) }];
}

// Trace a part's top view on a canvas path (one beginPath … fill per part).
export function tracePartOutline(ctx, p) {
  for (const o of partOutline(p)) {
    if (o.kind === "rect") {
      if (o.r > 0 && ctx.roundRect) ctx.roundRect(o.x, o.y, o.w, o.d, o.r);
      else ctx.rect(o.x, o.y, o.w, o.d);
    } else if (o.kind === "ellipse") {
      ctx.moveTo(o.x + Math.max(1, o.rx) * Math.cos(o.rot * DEG), o.y + Math.max(1, o.rx) * Math.sin(o.rot * DEG));
      ctx.ellipse(o.x, o.y, Math.max(1, o.rx), Math.max(1, o.ry), o.rot * DEG, 0, Math.PI * 2);
    } else if (o.pts.length) {
      ctx.moveTo(o.pts[0][0], o.pts[0][1]);
      for (let i = 1; i < o.pts.length; i++) ctx.lineTo(o.pts[i][0], o.pts[i][1]);
      ctx.closePath();
    }
  }
}

// ---------------------------------------------------------------- small shape helpers for the catalogue
// Rounded rectangle outline (plan or profile), centred on cx, cy.
export function rrect(cx, cy, w, d, r = 0, seg = 3) {
  r = Math.max(0, Math.min(r, w / 2, d / 2));
  if (r <= 0) return [[cx - w / 2, cy - d / 2], [cx + w / 2, cy - d / 2], [cx + w / 2, cy + d / 2], [cx - w / 2, cy + d / 2]];
  const out = [];
  const corners = [[cx + w / 2 - r, cy - d / 2 + r, -Math.PI / 2], [cx + w / 2 - r, cy + d / 2 - r, 0], [cx - w / 2 + r, cy + d / 2 - r, Math.PI / 2], [cx - w / 2 + r, cy - d / 2 + r, Math.PI]];
  for (const [x, y, a0] of corners) for (let i = 0; i <= seg; i++) { const a = a0 + (i / seg) * (Math.PI / 2); out.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
  return out;
}

// Ellipse outline.
export const ellipsePts = (cx, cy, rx, ry, n = 24) => ring(n, (a) => [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);

// A smooth lathe profile from a few [radius, height] control points (Catmull-Rom).
export function smoothProfile(ctrl, n = 4) {
  const out = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([Math.max(0, f(p0[0], p1[0], p2[0], p3[0])), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(ctrl[ctrl.length - 1]);
  return out;
}

// A deterministic random sequence (books, leaves, products on shelves look
// varied but the same every time).
export function rng(seed = 1) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

// ---------------------------------------------------------------- fitting parts into the item's box
// Bounds of a list of parts.
export function partsBounds(parts) {
  let x1 = Infinity, x2 = -Infinity, y1 = Infinity, y2 = -Infinity, z1 = Infinity, z2 = -Infinity;
  for (const p of parts) {
    const b = partBounds(p);
    if (b.x1 < x1) x1 = b.x1; if (b.x2 > x2) x2 = b.x2;
    if (b.y1 < y1) y1 = b.y1; if (b.y2 > y2) y2 = b.y2;
    if (b.z1 < z1) z1 = b.z1; if (b.z2 > z2) z2 = b.z2;
  }
  return { x1, x2, y1, y2, z1, z2 };
}

// One part moved and stretched: x → mx(x), y → my(y), z → mz(z) with scale factors sx, sy, sz.
function stretchPart(p, sx, sy, sz, mx, my, mz) {
  const k = Math.min(sx, sy), k3 = Math.min(sx, sy, sz);
  const q = { ...p, x: mx(p.x), y: my(p.y), z: mz(p.z) };
  if (p.b) q.b = p.b * k3;
  switch (p.t) {
    case "box": q.w = p.w * sx; q.d = p.d * sy; q.h = p.h * sz; if (p.r) q.r = p.r * k; break;
    case "cyl": q.rx = p.rx * sx; q.ry = p.ry * sy; q.h = p.h * sz; break;
    case "sph": q.sx = (p.sx ?? 1) * sx; q.sy = (p.sy ?? 1) * sy; q.sz = (p.sz ?? 1) * sz; break;
    case "lathe": q.prof = p.prof.map(([r, z]) => [r * sx, z * sz]); q.sy = (p.sy ?? 1) * (sy / sx); break;
    case "ext":
      if (p.axis === "x") { q.pts = p.pts.map(([u, v]) => [u * sy, v * sz]); q.depth = p.depth * sx; }
      else if (p.axis === "y") { q.pts = p.pts.map(([u, v]) => [u * sx, v * sz]); q.depth = p.depth * sy; }
      else { q.pts = p.pts.map(([u, v]) => [u * sx, v * sy]); q.depth = p.depth * sz; }
      break;
    case "tube": q.pts = p.pts.map(([x, y, z]) => [mx(x), my(y), mz(z)]); q.r = p.r * k3; break;
    case "tor": q.R = p.R * k; q.r = p.r * k3; break;
  }
  return q;
}

// Parts squeezed (never enlarged) and shifted so they lie inside the item's
// box: x within ±w/2, y within ±d/2, z from the floor to h (o.over: parts may
// rise above h, things standing on a desk or a TV on its unit). Parts that
// already fit come back as they are.
export function fitParts(parts, w, d, h, o = {}) {
  if (!parts.length) return parts;
  let out = parts;
  for (let pass = 0; pass < 6; pass++) {
    const b = partsBounds(out);
    const tol = (s) => s * 0.004 + 0.5;
    const fx = b.x1 < -w / 2 - tol(w) || b.x2 > w / 2 + tol(w);
    const fy = b.y1 < -d / 2 - tol(d) || b.y2 > d / 2 + tol(d);
    const fz = (!o.over && b.z2 > h + tol(h)) || b.z1 < -0.1 * h;
    if (!fx && !fy && !fz) return out;
    const axis = (lo, hi, half, on) => {
      if (!on) return [1, (v) => v];
      const s = Math.min(1, (2 * half) / (hi - lo));
      const c = (lo + hi) / 2, hw = ((hi - lo) * s) / 2;
      const c2 = Math.max(-half + hw, Math.min(half - hw, c * s));
      return [s, (v) => (v - c) * s + c2];
    };
    const [sx, mx] = axis(b.x1, b.x2, w / 2, fx);
    const [sy, my] = axis(b.y1, b.y2, d / 2, fy);
    let sz = 1, mz = (v) => v;
    if (fz) {
      const lo = Math.max(b.z1, -0.1 * h * 0.9), top = o.over ? Math.max(b.z2, h) : h;
      sz = Math.min(1, (top - lo) / (b.z2 - b.z1));
      const z0 = b.z1 < -0.1 * h ? lo : b.z1;
      mz = (v) => (v - b.z1) * sz + z0;
    }
    out = out.map((p) => stretchPart(p, sx, sy, sz, mx, my, mz));
  }
  return out;
}

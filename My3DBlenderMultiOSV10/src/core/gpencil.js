// Grease pencil: what a layer shows at a frame, its strokes as real surfaces (ribbons and fills) for the viewport and the renderer, and tools that
// change strokes. A stroke is { points, width, frame } with optional per-point pressure (thickness) and strength (opacity); a layer is
// { name, hide, color, strokes } plus fill, fillColor, opacity, thickness and keyed. The data's `modifiers` change what is drawn, not the strokes.
import { createMesh, triangulateFace, v3 } from './mesh.js';

/** What a layer shows: everything, or when it is keyed, only the drawing that was last made at or before this frame. */
export function strokesAt(layer, frame) {
  if (!layer.keyed) return layer.strokes;
  let held = -Infinity;
  for (const s of layer.strokes) if ((s.frame ?? 0) <= frame && (s.frame ?? 0) > held) held = s.frame ?? 0;
  return layer.strokes.filter((s) => (s.frame ?? 0) === held);
}

/** The plane a stroke mostly lies in (Newell's method): its normal, or null when the stroke is a straight line. */
function strokeNormal(points) {
  let n = [0, 0, 0];
  for (let i = 0; i < points.length; i++) {
    const [a, b] = [points[i], points[(i + 1) % points.length]];
    n = v3.add(n, [(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])]);
  }
  const l = v3.len(n);
  return l > 1e-9 ? v3.mul(n, 1 / l) : null;
}

/** A flat ribbon along the stroke, as wide as it was drawn, lying in the stroke's plane. One unit of width is a centimetre. */
function addRibbon(mesh, stroke, thickness) {
  const pts = stroke.points;
  if (pts.length < 2) return;
  const half = ((stroke.width ?? 2) * thickness * 0.01) / 2;
  const normal = strokeNormal(pts) ?? (Math.abs(v3.norm(v3.sub(pts[1], pts[0]))[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]);
  const base = mesh.verts.length;
  pts.forEach((p, i) => {
    const before = pts[Math.max(0, i - 1)];
    const after = pts[Math.min(pts.length - 1, i + 1)];
    const along = v3.norm(v3.sub(after, before));
    const side = v3.norm(v3.cross(normal, along));
    const w = half * (stroke.pressure?.[i] ?? 1);
    mesh.verts.push(v3.add(p, v3.mul(side, w)), v3.sub(p, v3.mul(side, w)));
  });
  for (let i = 0; i + 1 < pts.length; i++) mesh.faces.push([base + i * 2, base + i * 2 + 1, base + i * 2 + 3, base + i * 2 + 2]);
}

/** A stroke's inside: the outline closed and made into triangles, concave shapes included. */
function addFill(mesh, stroke) {
  const pts = stroke.points;
  if (pts.length < 3 || !strokeNormal(pts)) return;
  const base = mesh.verts.length;
  for (const p of pts) mesh.verts.push([...p]);
  const local = createMesh(pts.map((p) => [...p]), []);
  const ring = pts.map((_, i) => i);
  for (const t of triangulateFace(local, ring)) mesh.faces.push([base + ring[t[0]], base + ring[t[1]], base + ring[t[2]]]);
}

/**
 * Each visible layer as { color, fillColor, opacity, lines: mesh, fills: mesh } in the object's space, after the modifiers. Strokes of one layer
 * whose strength differs are drawn as parts of their own, each as opaque as its points on average.
 */
export function gpencilMeshes(data, frame) {
  const out = [];
  for (const layer of data.layers) {
    if (layer.hide) continue;
    const shown = applyGPModifiers(data, layer, strokesAt(layer, frame), frame);
    if (!shown.strokes.length) continue;
    const groups = new Map();
    for (const s of shown.strokes) {
      const strength = s.strength?.length ? Math.round((s.strength.reduce((a, b) => a + b, 0) / s.strength.length) * 20) / 20 : 1;
      if (!groups.has(strength)) groups.set(strength, []);
      groups.get(strength).push(s);
    }
    for (const [strength, strokes] of groups) {
      const [lines, fills] = [createMesh(), createMesh()];
      for (const s of strokes) {
        addRibbon(lines, s, layer.thickness ?? 1);
        if (layer.fill) addFill(fills, s);
      }
      out.push({ layer, color: shown.color, fillColor: shown.fillColor, opacity: shown.opacity * strength, lines, fills });
    }
  }
  return out;
}

// ─────────────── per-point values

const valuesOf = (stroke, key) => stroke[key] ?? stroke.points.map(() => 1);
/** A stroke made of some of another's points, with their pressures and strengths. */
const pick = (stroke, indices) => {
  const out = { ...stroke, points: indices.map((i) => stroke.points[i]) };
  for (const key of ['pressure', 'strength']) if (stroke[key]) out[key] = indices.map((i) => stroke[key][i]);
  return out;
};
const copyStroke = (s) => ({ ...s, points: s.points.map((p) => [...p]), ...(s.pressure ? { pressure: [...s.pressure] } : {}), ...(s.strength ? { strength: [...s.strength] } : {}) });

// ─────────────── modifiers

/** What each grease pencil modifier holds, as Blender's line-art modifiers do. `layer`: a layer's name to limit it to, '' for all. */
export const GP_MODIFIERS = {
  THICKNESS: { en: 'Thickness', ko: '두께', props: { factor: { def: 2, min: 0, step: 0.1 } } },
  OFFSET: { en: 'Offset', ko: '오프셋', props: { location: { def: [0, 0, 0] }, scale: { def: 1, step: 0.1 } } },
  NOISE: { en: 'Noise', ko: '노이즈', props: { factor: { def: 0.05, min: 0, step: 0.01 }, seed: { def: 1, int: true, step: 1 }, stepFrames: { def: 0, min: 0, int: true, step: 1 } } },
  SMOOTH: { en: 'Smooth', ko: '부드럽게', props: { factor: { def: 0.5, min: 0, max: 1, step: 0.05 }, steps: { def: 2, min: 1, int: true, step: 1 } } },
  SIMPLIFY: { en: 'Simplify', ko: '단순화', props: { tolerance: { def: 0.02, min: 0, step: 0.005 } } },
  SUBDIVIDE: { en: 'Subdivide', ko: '세분', props: { levels: { def: 1, min: 1, max: 5, int: true, step: 1 } } },
  ARRAY: { en: 'Array', ko: '배열', props: { count: { def: 3, min: 1, int: true, step: 1 }, offset: { def: [1, 0, 0] } } },
  MIRROR: { en: 'Mirror', ko: '대칭', props: { x: { def: true }, y: { def: false }, z: { def: false } } },
  BUILD: { en: 'Build', ko: '빌드', props: { start: { def: 1, int: true, step: 1 }, length: { def: 24, min: 1, int: true, step: 1 } } },
  TINT: { en: 'Tint', ko: '색조', props: { color: { def: [1, 0, 0], color: true }, factor: { def: 0.5, min: 0, max: 1, step: 0.05 } } },
  OPACITY: { en: 'Opacity', ko: '불투명도', props: { factor: { def: 0.5, min: 0, max: 2, step: 0.05 } } },
};

export function createGPModifier(type) {
  const spec = GP_MODIFIERS[type];
  if (!spec) throw new Error(`Unknown grease pencil modifier: ${type}`);
  const m = { type, name: spec.en, enabled: true, layer: '' };
  for (const [key, p] of Object.entries(spec.props)) m[key] = Array.isArray(p.def) ? [...p.def] : p.def;
  return m;
}

const hashNoise = (a, b, c) => { const x = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; };
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** A layer's strokes and colours as its modifiers leave them, in order; the strokes themselves are left alone. */
export function applyGPModifiers(data, layer, strokes, frame) {
  let list = strokes.map(copyStroke);
  let color = layer.color ?? [0, 0, 0];
  let fillColor = layer.fillColor ?? layer.color ?? [0.5, 0.5, 0.5];
  let opacity = layer.opacity ?? 1;
  for (const m of data.modifiers ?? []) {
    if (m.enabled === false || (m.layer && m.layer !== layer.name)) continue;
    switch (m.type) {
      case 'THICKNESS': for (const s of list) s.pressure = valuesOf(s, 'pressure').map((x) => x * m.factor); break;
      case 'OFFSET': for (const s of list) s.points = s.points.map((p) => v3.add(v3.mul(p, m.scale ?? 1), m.location ?? [0, 0, 0])); break;
      case 'NOISE': {
        const step = m.stepFrames > 0 ? Math.floor(frame / m.stepFrames) : 0;
        list.forEach((s, k) => { s.points = s.points.map((p, i) => [0, 1, 2].map((c) => p[c] + hashNoise(i + 1, k + m.seed * 13 + step * 7, c) * m.factor)); });
        break;
      }
      case 'SMOOTH': for (const s of list) smoothStroke(s, m.factor, m.steps); break;
      case 'SIMPLIFY': for (const s of list) simplifyStroke(s, m.tolerance); break;
      case 'SUBDIVIDE': for (const s of list) for (let n = 0; n < m.levels; n++) subdivideStroke(s); break;
      case 'ARRAY': {
        const copies = [];
        for (let n = 1; n < m.count; n++) for (const s of list) { const c = copyStroke(s); c.points = c.points.map((p) => v3.add(p, v3.mul(m.offset, n))); copies.push(c); }
        list = [...list, ...copies];
        break;
      }
      case 'MIRROR': {
        const copies = [];
        for (const [axis, on] of [[0, m.x], [1, m.y], [2, m.z]]) {
          if (!on) continue;
          for (const s of [...list, ...copies]) { const c = copyStroke(s); c.points = c.points.map((p) => p.map((x, k) => (k === axis ? -x : x))); copies.push(c); }
        }
        list = [...list, ...copies];
        break;
      }
      case 'BUILD': {
        // Strokes appear one after another, point by point, over `length` frames.
        const total = list.reduce((n, s) => n + s.points.length, 0);
        let left = Math.round(total * Math.max(0, Math.min(1, (frame - m.start) / m.length)));
        const kept = [];
        for (const s of list) {
          if (left <= 1) break;
          const n = Math.min(s.points.length, left);
          kept.push(pick(s, Array.from({ length: n }, (_, i) => i)));
          left -= n;
        }
        list = kept;
        break;
      }
      case 'TINT': color = lerp3(color, m.color, m.factor); fillColor = lerp3(fillColor, m.color, m.factor); break;
      case 'OPACITY': opacity = Math.max(0, Math.min(1, opacity * m.factor)); break;
      default:
    }
  }
  return { strokes: list.filter((s) => s.points.length > 1), color, fillColor, opacity };
}

// ─────────────── sculpting

export const GP_SCULPT_TOOLS = ['SMOOTH', 'THICKNESS', 'STRENGTH', 'GRAB', 'PUSH', 'TWIST', 'PINCH', 'RANDOMIZE'];
const falloff = (d, r) => { const x = 1 - d / r; return x <= 0 ? 0 : x * x * (3 - 2 * x); };

/**
 * A sculpt brush dragged along `path` over the strokes, each point answering by how near the brush passes. Grab holds the points it first
 * touched and carries them; push moves whatever it passes. `normal`: the axis twist turns about (towards the viewer). Returns how many points moved.
 */
export function sculptStrokes(strokes, tool, path, { radius = 0.2, strength = 0.5, normal = [0, 0, 1], invert = false, seed = 1 } = {}) {
  if (!path.length) return 0;
  const sign = invert ? -1 : 1;
  let touched = 0;
  const held = tool === 'GRAB' ? strokes.map((s) => s.points.map((p) => falloff(v3.dist(p, path[0]), radius))) : null;
  const axis = v3.norm(normal);
  for (let n = 0; n < path.length; n++) {
    const c = path[n];
    const delta = n > 0 ? v3.sub(path[n], path[n - 1]) : [0, 0, 0];
    strokes.forEach((s, k) => {
      if (tool === 'GRAB') {
        if (!n) return;
        s.points = s.points.map((p, i) => { const w = held[k][i]; if (w <= 0) return p; touched++; return v3.add(p, v3.mul(delta, w)); });
        return;
      }
      // Push moves what the brush leaves from, by how far it went.
      const from = tool === 'PUSH' && n > 0 ? path[n - 1] : c;
      const weights = s.points.map((p) => falloff(v3.dist(p, from), radius) * strength);
      if (!weights.some((w) => w > 0)) return;
      touched += weights.filter((w) => w > 0).length;
      switch (tool) {
        case 'SMOOTH': {
          const was = s.points;
          s.points = was.map((p, i) => (i === 0 || i === was.length - 1 || weights[i] <= 0 ? p : v3.add(p, v3.mul(v3.sub(v3.mul(v3.add(was[i - 1], was[i + 1]), 0.5), p), weights[i]))));
          break;
        }
        case 'THICKNESS': s.pressure = valuesOf(s, 'pressure').map((x, i) => Math.max(0, Math.min(10, x + weights[i] * 0.1 * sign))); break;
        case 'STRENGTH': s.strength = valuesOf(s, 'strength').map((x, i) => Math.max(0, Math.min(1, x + weights[i] * 0.1 * sign))); break;
        case 'PUSH': s.points = s.points.map((p, i) => v3.add(p, v3.mul(delta, weights[i]))); break;
        case 'PINCH': s.points = s.points.map((p, i) => v3.add(p, v3.mul(v3.sub(c, p), weights[i] * 0.1 * sign))); break;
        case 'TWIST': s.points = s.points.map((p, i) => {
          if (weights[i] <= 0) return p;
          const angle = weights[i] * 0.1 * sign;
          const r = v3.sub(p, c);
          const along = v3.mul(axis, v3.dot(r, axis));
          const flat = v3.sub(r, along);
          const turned = v3.add(v3.mul(flat, Math.cos(angle)), v3.mul(v3.cross(axis, flat), Math.sin(angle)));
          return v3.add(v3.add(c, along), turned);
        }); break;
        case 'RANDOMIZE': s.points = s.points.map((p, i) => (weights[i] <= 0 ? p : [0, 1, 2].map((d) => p[d] + hashNoise(i + n * 31, k + seed, d) * radius * 0.1 * weights[i]))); break;
        default: throw new Error(`Unknown sculpt tool: ${tool}`);
      }
    });
  }
  return touched;
}

// ─────────────── interpolation

/** A stroke resampled to `count` points evenly along its length, its pressures and strengths with it. */
function resampleStroke(stroke, count) {
  const pts = stroke.points;
  const along = [0];
  for (let i = 1; i < pts.length; i++) along.push(along[i - 1] + v3.dist(pts[i - 1], pts[i]));
  const total = along.at(-1) || 1;
  const [pressure, strength] = [valuesOf(stroke, 'pressure'), valuesOf(stroke, 'strength')];
  const out = { ...stroke, points: [], pressure: [], strength: [] };
  let j = 0;
  for (let n = 0; n < count; n++) {
    const want = (n / Math.max(1, count - 1)) * total;
    while (j + 2 < pts.length && along[j + 1] < want) j++;
    const span = along[j + 1] - along[j] || 1;
    const t = pts.length > 1 ? Math.max(0, Math.min(1, (want - along[j]) / span)) : 0;
    const k = Math.min(j + 1, pts.length - 1);
    out.points.push(lerp3(pts[j], pts[k], t));
    out.pressure.push(pressure[j] + (pressure[k] - pressure[j]) * t);
    out.strength.push(strength[j] + (strength[k] - strength[j]) * t);
  }
  return out;
}

const EASE = { LINEAR: (t) => t, EASE_IN: (t) => t * t, EASE_OUT: (t) => 1 - (1 - t) * (1 - t), EASE_IN_OUT: (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)) };
export const GP_EASINGS = Object.keys(EASE);

/** The drawings either side of a frame on a keyed layer: the frames they were made at, or null. */
export function neighbourDrawings(layer, frame) {
  const frames = [...new Set(layer.strokes.map((s) => s.frame ?? 0))].sort((a, b) => a - b);
  return { before: frames.filter((f) => f < frame).at(-1) ?? null, after: frames.find((f) => f > frame) ?? null };
}

/**
 * New strokes at `frame`, part way from the drawing before it to the one after, stroke by stroke in the order they were drawn. Strokes the other
 * drawing has no partner for are left out, as in Blender. Returns the strokes made, or null when there is no drawing on both sides.
 */
export function interpolateDrawing(layer, frame, easing = 'LINEAR') {
  const { before, after } = neighbourDrawings(layer, frame);
  if (before == null || after == null) return null;
  const [a, b] = [layer.strokes.filter((s) => (s.frame ?? 0) === before), layer.strokes.filter((s) => (s.frame ?? 0) === after)];
  const t = (EASE[easing] ?? EASE.LINEAR)((frame - before) / (after - before));
  const made = [];
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const count = Math.max(a[i].points.length, b[i].points.length, 2);
    const [p, q] = [resampleStroke(a[i], count), resampleStroke(b[i], count)];
    made.push({
      ...a[i], frame, width: (a[i].width ?? 2) + ((b[i].width ?? 2) - (a[i].width ?? 2)) * t,
      points: p.points.map((x, k) => lerp3(x, q.points[k], t)),
      pressure: p.pressure.map((x, k) => x + (q.pressure[k] - x) * t),
      strength: p.strength.map((x, k) => x + (q.strength[k] - x) * t),
    });
  }
  layer.keyed = true;
  layer.strokes = [...layer.strokes.filter((s) => (s.frame ?? 0) !== frame), ...made];
  return made;
}

// ─────────────── tools

/** Each interior point pulled towards its neighbours. */
export function smoothStroke(stroke, factor = 0.5, passes = 1) {
  for (let pass = 0; pass < passes; pass++) {
    stroke.points = stroke.points.map((p, i, all) => {
      if (i === 0 || i === all.length - 1) return p;
      return v3.add(p, v3.mul(v3.sub(v3.mul(v3.add(all[i - 1], all[i + 1]), 0.5), p), factor));
    });
  }
  return stroke;
}

/** Fewer points where they add little: Ramer-Douglas-Peucker. */
export function simplifyStroke(stroke, tolerance = 0.01) {
  const pts = stroke.points;
  const keep = new Array(pts.length).fill(false);
  keep[0] = true;
  keep[pts.length - 1] = true;
  const walk = (a, b) => {
    let far = -1;
    let most = tolerance;
    const axis = v3.sub(pts[b], pts[a]);
    const length = v3.len(axis) || 1;
    for (let i = a + 1; i < b; i++) {
      const d = v3.len(v3.cross(axis, v3.sub(pts[i], pts[a]))) / length;
      if (d > most) { most = d; far = i; }
    }
    if (far >= 0) { keep[far] = true; walk(a, far); walk(far, b); }
  };
  if (pts.length > 2) walk(0, pts.length - 1);
  Object.assign(stroke, pick(stroke, pts.map((_, i) => i).filter((i) => keep[i])));
  return stroke;
}

/** A point halfway along each segment. */
export function subdivideStroke(stroke) {
  const out = [];
  stroke.points.forEach((p, i, all) => { out.push(p); if (i + 1 < all.length) out.push(v3.mul(v3.add(p, all[i + 1]), 0.5)); });
  for (const key of ['pressure', 'strength']) {
    const v = stroke[key];
    if (v) stroke[key] = v.flatMap((x, i) => (i + 1 < v.length ? [x, (x + v[i + 1]) / 2] : [x]));
  }
  stroke.points = out;
  return stroke;
}

/** Rubs out what is within `radius` of a point. A stroke cut in the middle becomes two. Returns how many points went. */
export function eraseAt(layer, point, radius) {
  let gone = 0;
  const next = [];
  for (const s of layer.strokes) {
    let run = [];
    s.points.forEach((p, i) => {
      if (v3.dist(p, point) <= radius) { gone++; if (run.length > 1) next.push(pick(s, run)); run = []; } else run.push(i);
    });
    if (run.length > 1) next.push(pick(s, run));
  }
  layer.strokes = next;
  return gone;
}

/** All of it, as one mesh: for turning a drawing into ordinary geometry. */
export function gpencilToMesh(data, frame) {
  const out = createMesh();
  for (const part of gpencilMeshes(data, frame)) {
    for (const piece of [part.fills, part.lines]) {
      const base = out.verts.length;
      for (const v of piece.verts) out.verts.push(v);
      for (const f of piece.faces) out.faces.push(f.map((i) => i + base));
    }
  }
  return out;
}

// IGES 5.3 (Initial Graphics Exchange Specification), the open CAD exchange
// format: 2D/3D wireframe and annotation both ways.
//   Read:  100 arc · 102 composite · 104 conic · 106 copious data · 110 line ·
//          112 parametric spline · 116 point · 124 transformation · 126 NURBS ·
//          212 note · 214 leader · 308/408 subfigures · 314 colour.
//          Parameter-space curves (of 141/142 surface boundaries) are left out;
//          3D curves are projected on XY.
//   Write: lines, arcs, circles, polylines, ellipses (104 + 124), splines
//          (126), points and notes — everything else through its primitives;
//          3D solids (with the OpenCASCADE kernel) as manifold solid B-reps
//          (186 → 514 shell → 510 faces → 508 loops → 504 edges, 502 vertices) on
//          planes (190), cylinders (192), spheres (196) and B-spline surfaces (128).
//   Read:  3D solids too — 186 B-reps and 144 trimmed surfaces (108/190–198 planes and
//          quadrics, 120 revolutions, 122 tabulated cylinders, 128 B-splines), tessellated.
import { AUTO, createDrawing, isVisible, styleOf } from './drawing.js';
import { primitives } from './entities.js';
import { clampedKnots, curvePoint, sampleCurve } from './nurbs.js';
import { occReady, occTopology } from './occ.js';
import { faceTriangles, makeSurface } from './igesbrep.js';
import { repairMesh } from './meshcheck.js';

/** Units flag (global parameter 14) → mm. */
const UNIT_MM = { 1: 25.4, 2: 1, 4: 304.8, 5: 1609344, 6: 1000, 7: 1e6, 8: 0.0254, 9: 0.001, 10: 10, 11: 0.0000254 };
/** DE colour numbers 1–8. */
const COLORS = { 1: '#000000', 2: '#ff0000', 3: '#00ff00', 4: '#0000ff', 5: '#ffff00', 6: '#ff00ff', 7: '#00ffff', 8: '#ffffff' };
/** DE line font → MyCAD line type. */
const FONTS = { 1: 'continuous', 2: 'dashed', 3: 'phantom', 4: 'center', 5: 'dotted' };

export const looksLikeIges = (text) => {
  const first = String(text).split(/\r\n|\r|\n/, 4);
  return first.some((line) => line.length >= 73 && /^[SG]$/.test(line[72]) && /^\s*\d+$/.test(line.slice(73, 80)));
};

// ───────────────────────── reading

/** Free-format parameters: numbers (D exponents too), Hollerith strings "5HHello", empty = null. */
function parseParams(text, delimiter = ',', terminator = ';') {
  const out = [];
  let i = 0;
  while (i <= text.length) {
    while (text[i] === ' ') i++;
    const hollerith = /^(\d+)H/.exec(text.slice(i, i + 12));
    let value;
    if (hollerith) {
      const from = i + hollerith[0].length;
      value = text.slice(from, from + Number(hollerith[1]));
      i = from + Number(hollerith[1]);
      while (i < text.length && text[i] !== delimiter && text[i] !== terminator) i++;
    } else {
      let j = i;
      while (j < text.length && text[j] !== delimiter && text[j] !== terminator) j++;
      const token = text.slice(i, j).trim();
      if (!token) value = null;
      else { const number = Number(token.replace(/[dD]/, 'E')); value = Number.isFinite(number) ? number : token; }
      i = j;
    }
    out.push(value);
    if (i >= text.length || text[i] === terminator) break;
    i++; // the delimiter
  }
  return out;
}

const field = (line, k) => line.slice(k * 8, k * 8 + 8).trim();
const int = (text, d = 0) => { const v = Number.parseInt(text, 10); return Number.isFinite(v) ? v : d; };

/** Affine 3D transform [R(3×3) | T] as 12 numbers (row-major with T at 3, 7, 11). */
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
const compose = (a, b) => [ // a ∘ b
  a[0] * b[0] + a[1] * b[4] + a[2] * b[8], a[0] * b[1] + a[1] * b[5] + a[2] * b[9], a[0] * b[2] + a[1] * b[6] + a[2] * b[10], a[0] * b[3] + a[1] * b[7] + a[2] * b[11] + a[3],
  a[4] * b[0] + a[5] * b[4] + a[6] * b[8], a[4] * b[1] + a[5] * b[5] + a[6] * b[9], a[4] * b[2] + a[5] * b[6] + a[6] * b[10], a[4] * b[3] + a[5] * b[7] + a[6] * b[11] + a[7],
  a[8] * b[0] + a[9] * b[4] + a[10] * b[8], a[8] * b[1] + a[9] * b[5] + a[10] * b[9], a[8] * b[2] + a[9] * b[6] + a[10] * b[10], a[8] * b[3] + a[9] * b[7] + a[10] * b[11] + a[11],
];
const apply = (m, x, y, z = 0) => ({ x: m[0] * x + m[1] * y + m[2] * z + m[3], y: m[4] * x + m[5] * y + m[6] * z + m[7], z: m[8] * x + m[9] * y + m[10] * z + m[11] });

/** Is the transform a similarity in the XY plane (rotation · uniform scale, maybe mirrored)? Returns { scale, mirror } or null. */
function planar(m) {
  if (Math.abs(m[2]) > 1e-9 || Math.abs(m[6]) > 1e-9 || Math.abs(m[8]) > 1e-9 || Math.abs(m[9]) > 1e-9) return null;
  const sx = Math.hypot(m[0], m[4]);
  const sy = Math.hypot(m[1], m[5]);
  if (Math.abs(sx - sy) > 1e-9 * Math.max(1, sx) || Math.abs(m[0] * m[1] + m[4] * m[5]) > 1e-9 * Math.max(1, sx * sy)) return null;
  return { scale: sx, mirror: m[0] * m[5] - m[1] * m[4] < 0 };
}

/**
 * Reads an IGES file into a new drawing (mm). Returns { drawing, imported, skipped, units }.
 */
export function importIges(text, { title = 'IGES', language = 'ko' } = {}) {
  const lines = String(text).split(/\r\n|\r|\n/).map((line) => line.padEnd(80));
  const of = (letter) => lines.filter((line) => line[72] === letter);
  if (lines.some((line) => line[72] === 'C')) throw new Error('IGES: compressed IGES files are not supported');
  const globalText = of('G').map((line) => line.slice(0, 72)).join('');
  let delimiter = ',';
  let terminator = ';';
  if (/^1H./.test(globalText)) delimiter = globalText[2];
  const afterFirst = globalText.slice(globalText.indexOf(delimiter) + 1);
  if (/^1H./.test(afterFirst)) terminator = afterFirst[2];
  const global = parseParams(globalText, delimiter, terminator);
  const unitFlag = int(String(global[13] ?? 2), 2);
  const unitName = String(global[14] ?? '').toUpperCase();
  const byName = { IN: 25.4, INCH: 25.4, MM: 1, FT: 304.8, MI: 1609344, M: 1000, KM: 1e6, MIL: 0.0254, UM: 0.001, CM: 10, UIN: 0.0000254 };
  const scale = (unitFlag === 3 ? byName[unitName] : UNIT_MM[unitFlag]) ?? 1;

  // Directory: two lines per entity; its number is the sequence number of the first line.
  const directory = new Map();
  const dLines = of('D');
  for (let i = 0; i + 1 < dLines.length; i += 2) {
    const a = dLines[i];
    const b = dLines[i + 1];
    const de = int(a.slice(73, 80));
    directory.set(de, {
      de, type: int(field(a, 0)), pointer: int(field(a, 1)), font: int(field(a, 3)), level: int(field(a, 4)), transform: int(field(a, 6)),
      status: field(a, 8).padStart(8, '0'), color: int(field(b, 2)), lines: int(field(b, 3)), form: int(field(b, 4)),
    });
  }
  // Parameters: grouped by the DE pointer in columns 66–72.
  const paramText = new Map();
  for (const line of of('P')) {
    const de = int(line.slice(64, 72));
    paramText.set(de, (paramText.get(de) ?? '') + line.slice(0, 64));
  }
  const params = new Map();
  for (const [de, raw] of paramText) params.set(de, parseParams(raw, delimiter, terminator).slice(1)); // first value is the type
  const P = (de) => params.get(de) ?? [];

  const transformCache = new Map();
  const matrixOf = (de, depth = 0) => {
    if (!de || depth > 20) return IDENTITY;
    if (transformCache.has(de)) return transformCache.get(de);
    const entry = directory.get(de);
    if (!entry || entry.type !== 124) return IDENTITY;
    const p = P(de).map((v) => Number(v) || 0);
    const own = [p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], p[9], p[10], p[11]];
    const m = compose(matrixOf(entry.transform, depth + 1), own);
    transformCache.set(de, m);
    return m;
  };

  // Entities never drawn on their own: parameter-space curves and subfigure members.
  const excluded = new Set();
  const excludeTree = (de, depth = 0) => {
    if (!de || excluded.has(de) || depth > 50) return;
    excluded.add(de);
    const entry = directory.get(de);
    if (entry?.type === 102) for (const member of P(de).slice(1, 1 + (Number(P(de)[0]) || 0))) excludeTree(Number(member), depth + 1);
  };
  for (const entry of directory.values()) {
    const p = P(entry.de);
    if (entry.type === 142) { excludeTree(Number(p[2])); excludeTree(Number(p[3])); }
    if (entry.type === 504) for (let i = 0; i < (Number(p[0]) || 0); i++) excludeTree(Number(p[1 + i * 5]));
    if (entry.type === 120) { excludeTree(Number(p[0])); excludeTree(Number(p[1])); }
    // The points and directions that place planes, cylinders, cones, spheres and tori.
    if ([190, 192, 194, 196, 198].includes(entry.type)) for (const ref of p) if (Number.isInteger(Number(ref)) && [116, 123].includes(directory.get(Number(ref))?.type)) excluded.add(Number(ref));
    if (entry.type === 122) excludeTree(Number(p[0]));
    if (entry.type === 141) {
      const n = Number(p[3]) || 0;
      let k = 4;
      for (let i = 0; i < n; i++) {
        const count = Number(p[k + 2]) || 0;
        for (let j = 0; j < count; j++) excludeTree(Number(p[k + 3 + j]));
        k += 3 + count;
      }
    }
    if (entry.type === 308) {
      const n = Number(p[2]) || 0;
      for (const member of p.slice(3, 3 + n)) excludeTree(Number(member));
    }
  }

  const drawing = createDrawing({ title, language });
  const layers = new Map();
  const layerOf = (level) => {
    if (!level) return '0';
    const id = `level${level}`;
    if (!layers.has(id)) {
      layers.set(id, true);
      drawing.layers.push({ id, name: `Level ${level}`, color: AUTO, lineType: 'continuous', lineWidth: 0.25, visible: true, locked: false });
    }
    return id;
  };
  const colorOf = (entry) => {
    if (entry.color > 0) return entry.color === 1 ? null : COLORS[entry.color] ?? null;
    if (entry.color < 0) {
      const p = P(-entry.color).map(Number);
      if (p.length >= 3) {
        const hex = (v) => Math.round(Math.max(0, Math.min(100, v)) * 2.55).toString(16).padStart(2, '0');
        const c = `#${hex(p[0])}${hex(p[1])}${hex(p[2])}`;
        return c === '#000000' ? null : c;
      }
    }
    return null;
  };
  const entities = [];
  const skipped = {};
  const skip = (type) => { skipped[type] = (skipped[type] ?? 0) + 1; };
  const mm = (p) => ({ x: p.x * scale, y: p.y * scale });

  const convert = (entry, outer = IDENTITY, depth = 0) => {
    if (depth > 30) return;
    const m = compose(outer, matrixOf(entry.transform));
    const p = P(entry.de);
    const N = (k, d = 0) => (Number.isFinite(Number(p[k])) && p[k] !== null ? Number(p[k]) : d);
    const style = { layer: layerOf(entry.level), ...(colorOf(entry) ? { color: colorOf(entry) } : {}), ...(FONTS[entry.font] && entry.font !== 1 ? { lineType: FONTS[entry.font] } : {}) };
    const poly = (points, closed = false) => {
      const pts = points.map((q) => mm(apply(m, q.x, q.y, q.z ?? 0)));
      // A path that ends where it starts is a closed outline.
      if (pts.length > 3 && Math.hypot(pts[0].x - pts.at(-1).x, pts[0].y - pts.at(-1).y) < 1e-9 * Math.max(1, Math.abs(pts[0].x) + Math.abs(pts[0].y))) { pts.pop(); closed = true; }
      if (pts.length >= 2) entities.push({ type: 'polyline', points: pts, closed, ...style });
    };
    switch (entry.type) {
      case 100: { // circular arc: ZT, centre, start, end (counter-clockwise)
        const zt = N(0);
        const c = { x: N(1), y: N(2) };
        const s = { x: N(3), y: N(4) };
        const e = { x: N(5), y: N(6) };
        const r = Math.hypot(s.x - c.x, s.y - c.y);
        if (!(r > 0)) return skip('100 (r=0)');
        let a0 = Math.atan2(s.y - c.y, s.x - c.x);
        let a1 = Math.atan2(e.y - c.y, e.x - c.x);
        const full = Math.hypot(s.x - e.x, s.y - e.y) < 1e-9 * Math.max(1, r);
        if (a1 <= a0) a1 += Math.PI * 2;
        const sim = planar(m);
        if (sim) {
          const cc = mm(apply(m, c.x, c.y, zt));
          const radius = r * sim.scale * scale;
          if (full) { entities.push({ type: 'circle', cx: cc.x, cy: cc.y, r: radius, ...style }); return; }
          const ps = mm(apply(m, s.x, s.y, zt));
          const pe = mm(apply(m, e.x, e.y, zt));
          const deg = (q) => (Math.atan2(q.y - cc.y, q.x - cc.x) * 180) / Math.PI;
          entities.push({ type: 'arc', cx: cc.x, cy: cc.y, r: radius, start: sim.mirror ? deg(pe) : deg(ps), end: sim.mirror ? deg(ps) : deg(pe), ...style });
          return;
        }
        if (full) { a0 = 0; a1 = Math.PI * 2; }
        const n = Math.max(8, Math.ceil(((a1 - a0) * 180) / Math.PI / 4));
        poly(Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a), z: zt }; }), full);
        return;
      }
      case 102: return; // composite: its members are drawn themselves
      case 104: { // conic: A B C D E F ZT X1 Y1 X2 Y2
        const [A, B, C, D, E, F, zt, x1, y1, x2, y2] = Array.from({ length: 11 }, (_, k) => N(k));
        const pts = [];
        if (entry.form === 1 || (Math.abs(B) < 1e-12 && Math.abs(D) < 1e-12 && Math.abs(E) < 1e-12 && A * C > 0)) {
          const a = Math.sqrt(Math.abs(F / A));
          const b = Math.sqrt(Math.abs(F / C));
          let t0 = Math.atan2(y1 / b, x1 / a);
          let t1 = Math.atan2(y2 / b, x2 / a);
          const full = Math.hypot(x1 - x2, y1 - y2) < 1e-9 * Math.max(1, a);
          if (full) t1 = t0 + Math.PI * 2; else if (t1 <= t0) t1 += Math.PI * 2;
          const sim = planar(m);
          if (sim && !sim.mirror) {
            const cc = mm(apply(m, 0, 0, zt));
            const ax = apply(m, 1, 0, zt);
            const o = apply(m, 0, 0, zt);
            const angle = (Math.atan2(ax.y - o.y, ax.x - o.x) * 180) / Math.PI;
            entities.push({ type: 'ellipse', cx: cc.x, cy: cc.y, rx: a * sim.scale * scale, ry: b * sim.scale * scale, angle, start: full ? 0 : (t0 * 180) / Math.PI, end: full ? 360 : (t1 * 180) / Math.PI, ...style });
            return;
          }
          const n = Math.max(16, Math.ceil(((t1 - t0) * 180) / Math.PI / 4));
          for (let i = 0; i <= n; i++) { const t = t0 + ((t1 - t0) * i) / n; pts.push({ x: a * Math.cos(t), y: b * Math.sin(t), z: zt }); }
          poly(pts, full);
          return;
        }
        // Hyperbola / parabola: step along the longer extent, solving for the other coordinate.
        const byX = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
        const n = 48;
        let prev = byX ? y1 : x1;
        for (let i = 0; i <= n; i++) {
          const u = byX ? x1 + ((x2 - x1) * i) / n : y1 + ((y2 - y1) * i) / n;
          // Quadratic in v: (C|A) v² + (B u + E|D) v + (A u² + D u + F | C u² + E u + F) = 0
          const qa = byX ? C : A;
          const qb = byX ? B * u + E : B * u + D;
          const qc = byX ? A * u * u + D * u + F : C * u * u + E * u + F;
          let roots;
          if (Math.abs(qa) < 1e-14) roots = Math.abs(qb) < 1e-14 ? [] : [-qc / qb];
          else { const disc = qb * qb - 4 * qa * qc; roots = disc < 0 ? [] : [(-qb + Math.sqrt(disc)) / (2 * qa), (-qb - Math.sqrt(disc)) / (2 * qa)]; }
          if (!roots.length) continue;
          const v = roots.reduce((best, r) => (Math.abs(r - prev) < Math.abs(best - prev) ? r : best));
          prev = v;
          pts.push(byX ? { x: u, y: v, z: zt } : { x: v, y: u, z: zt });
        }
        if (pts.length >= 2) poly(pts); else skip('104');
        return;
      }
      case 106: { // copious data
        const ip = N(0, 1);
        const n = N(1);
        const pts = [];
        if (ip === 1) { const zt = N(2); for (let i = 0; i < n; i++) pts.push({ x: N(3 + i * 2), y: N(4 + i * 2), z: zt }); }
        else { const step = ip === 3 ? 6 : 3; for (let i = 0; i < n; i++) pts.push({ x: N(2 + i * step), y: N(3 + i * step), z: N(4 + i * step) }); }
        if (entry.form >= 31 && entry.form <= 38) { for (let i = 0; i + 1 < pts.length; i += 2) poly([pts[i], pts[i + 1]]); return; }
        if (entry.form === 1 || entry.form === 2 || entry.form === 3) { for (const q of pts) { const w = mm(apply(m, q.x, q.y, q.z)); entities.push({ type: 'point', x: w.x, y: w.y, ...style }); } return; }
        poly(pts, entry.form === 63);
        return;
      }
      case 110: { // line
        const a = mm(apply(m, N(0), N(1), N(2)));
        const b = mm(apply(m, N(3), N(4), N(5)));
        if (entry.form === 0) entities.push({ type: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, ...style });
        else skip(`110 form ${entry.form}`); // rays / infinite lines
        return;
      }
      case 112: { // parametric cubic spline
        const n = N(3);
        const T = Array.from({ length: n + 1 }, (_, i) => N(4 + i));
        const base = 5 + n;
        const pts = [];
        for (let seg = 0; seg < n; seg++) {
          const k = base + seg * 12;
          const span = T[seg + 1] - T[seg];
          for (let j = seg ? 1 : 0; j <= 12; j++) {
            const u = (span * j) / 12;
            const cubic = (o) => N(k + o) + N(k + o + 1) * u + N(k + o + 2) * u * u + N(k + o + 3) * u * u * u;
            pts.push({ x: cubic(0), y: cubic(4), z: cubic(8) });
          }
        }
        poly(pts);
        return;
      }
      case 116: { const q = mm(apply(m, N(0), N(1), N(2))); entities.push({ type: 'point', x: q.x, y: q.y, ...style }); return; }
      case 126: { // rational B-spline curve
        const K = N(0);
        const M = N(1);
        const polynomial = N(4) === 1;
        const knots = Array.from({ length: K + M + 2 }, (_, i) => N(6 + i));
        const wStart = 6 + K + M + 2;
        const weights = Array.from({ length: K + 1 }, (_, i) => N(wStart + i, 1));
        const cStart = wStart + K + 1;
        const control = Array.from({ length: K + 1 }, (_, i) => mm(apply(m, N(cStart + i * 3), N(cStart + i * 3 + 1), N(cStart + i * 3 + 2))));
        const v0 = N(cStart + (K + 1) * 3);
        const v1 = N(cStart + (K + 1) * 3 + 1);
        const rational = !polynomial && weights.some((w) => Math.abs(w - weights[0]) > 1e-12);
        const whole = Math.abs(v0 - knots[M]) < 1e-9 && Math.abs(v1 - knots[K + 1]) < 1e-9;
        if (M >= 1 && M <= 5 && whole) {
          entities.push({ type: 'spline', degree: M, knots, points: control, ...(rational ? { weights } : {}), ...style });
          return;
        }
        // Higher degree or a trimmed parameter range: sampled.
        const curve = { degree: M, points: control.map((q) => [q.x, q.y]), knots, weights: rational ? weights : null };
        const samples = sampleCurve(curve, 240).filter((_, i, all) => { const u = knots[M] + ((knots[K + 1] - knots[M]) * i) / (all.length - 1); return u >= Math.min(v0, v1) - 1e-9 && u <= Math.max(v0, v1) + 1e-9; });
        if (samples.length >= 2) entities.push({ type: 'polyline', points: samples.map(([x, y]) => ({ x, y })), closed: false, ...style });
        return;
      }
      case 212: { // general note
        const ns = N(0);
        let k = 1;
        for (let i = 0; i < ns; i++) {
          const height = N(k + 2);
          const angle = N(k + 5);
          const at = mm(apply(m, N(k + 8), N(k + 9), N(k + 10)));
          const textValue = p[k + 11];
          if (typeof textValue === 'string' && textValue.trim()) {
            const o = apply(m, 0, 0, 0);
            const ax = apply(m, Math.cos(angle), Math.sin(angle), 0);
            entities.push({ type: 'text', x: at.x, y: at.y, text: textValue, size: Math.max(0.5, height * (planar(m)?.scale ?? 1) * scale), angle: (Math.atan2(ax.y - o.y, ax.x - o.x) * 180) / Math.PI, ...style });
          }
          k += 12;
        }
        return;
      }
      case 214: { // leader (arrow): arrowhead, then the segment points
        const n = N(0);
        const zt = N(3);
        const pts = [{ x: N(4), y: N(5), z: zt }];
        for (let i = 0; i < n; i++) pts.push({ x: N(6 + i * 2), y: N(7 + i * 2), z: zt });
        poly(pts);
        return;
      }
      case 408: { // subfigure instance: definition DE, X, Y, Z, scale
        const def = directory.get(N(0));
        if (!def || def.type !== 308) return skip('408');
        const s = N(4, 1) || 1;
        const place = compose(m, [s, 0, 0, N(1), 0, s, 0, N(2), 0, 0, s, N(3)]);
        const dp = P(def.de);
        const count = Number(dp[2]) || 0;
        for (const member of dp.slice(3, 3 + count)) { const e = directory.get(Number(member)); if (e) convert(e, place, depth + 1); }
        return;
      }
      default: skip(String(entry.type));
    }
  };
  const NON_GEOMETRY = new Set([0, 123, 124, 142, 141, 144, 143, 308, 314, 402, 404, 406, 410, 108, 118, 120, 122, 128, 140, 190, 192, 194, 196, 198, 186, 502, 504, 508, 510, 514, 202, 206, 210, 216, 218, 220, 222, 228, 230, 302, 304, 306, 310, 312, 316, 320, 322, 412, 414, 416, 418, 420, 422, 430]);
  for (const entry of directory.values()) {
    if (excluded.has(entry.de) || entry.status.slice(0, 2) === '01' || entry.status.slice(4, 6) === '05') continue;
    // (B-rep and surface entities are read below as solids.)
    if (NON_GEOMETRY.has(entry.type)) { if (![0, 124, 142, 141, 308, 314, 402, 406, 202, 206, 210, 216, 218, 220, 222, 228, 230, 108, 120, 122, 123, 128, 144, 186, 190, 192, 194, 196, 198, 502, 504, 508, 510, 514].includes(entry.type)) skip(String(entry.type)); continue; }
    try { convert(entry); } catch { skip(`${entry.type} (damaged)`); }
  }
  // ── 3D solids: B-rep objects (186) and trimmed surfaces (144), as mesh solids.
  const DE = (k) => directory.get(Number(k));
  const mmPoint = (m, x, y, z) => { const q = apply(m, x, y, z); return [q.x * scale, q.y * scale, q.z * scale]; };
  const dirOf = (m, d) => { const a = apply(m, d[0], d[1], d[2]); const o = apply(m, 0, 0, 0); return [a.x - o.x, a.y - o.y, a.z - o.z]; };
  /** Points along a curve (mm, model space), in its own direction. */
  const curve3d = (entry, outer = IDENTITY, depth = 0) => {
    if (!entry || depth > 20) return [];
    const m = compose(outer, matrixOf(entry.transform));
    const p = P(entry.de).map((v) => (v === null || v === undefined ? 0 : v));
    const N = (k, d = 0) => (Number.isFinite(Number(p[k])) ? Number(p[k]) : d);
    switch (entry.type) {
      case 110: return [mmPoint(m, N(0), N(1), N(2)), mmPoint(m, N(3), N(4), N(5))];
      case 100: {
        const zt = N(0); const c = [N(1), N(2)]; const a = [N(3), N(4)]; const b = [N(5), N(6)];
        const r = Math.hypot(a[0] - c[0], a[1] - c[1]);
        const a0 = Math.atan2(a[1] - c[1], a[0] - c[0]);
        let a1 = Math.atan2(b[1] - c[1], b[0] - c[0]);
        if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9 * Math.max(1, r)) a1 = a0 + Math.PI * 2; else if (a1 <= a0) a1 += Math.PI * 2;
        const n = Math.max(4, Math.ceil(((a1 - a0) / (Math.PI * 2)) * 96));
        return Array.from({ length: n + 1 }, (_, i) => { const t = a0 + ((a1 - a0) * i) / n; return mmPoint(m, c[0] + r * Math.cos(t), c[1] + r * Math.sin(t), zt); });
      }
      case 102: {
        const out = [];
        for (const member of p.slice(1, 1 + N(0))) { const pts = curve3d(DE(member), m, depth + 1); if (out.length && pts.length && Math.hypot(...pts[0].map((v, i) => v - out[out.length - 1][i])) < 1e-9) pts.shift(); out.push(...pts); }
        return out;
      }
      case 104: {
        const [A, , C, , , F, zt, x1, y1, x2, y2] = Array.from({ length: 11 }, (_, k) => N(k));
        const a = Math.sqrt(Math.abs(F / A)); const b = Math.sqrt(Math.abs(F / C));
        const t0 = Math.atan2(y1 / b, x1 / a); let t1 = Math.atan2(y2 / b, x2 / a);
        if (Math.hypot(x1 - x2, y1 - y2) < 1e-9 * Math.max(1, a)) t1 = t0 + Math.PI * 2; else if (t1 <= t0) t1 += Math.PI * 2;
        const n = 96;
        return Array.from({ length: n + 1 }, (_, i) => { const t = t0 + ((t1 - t0) * i) / n; return mmPoint(m, a * Math.cos(t), b * Math.sin(t), zt); });
      }
      case 106: {
        const ip = N(0, 1); const n = N(1); const out = [];
        if (ip === 1) { for (let i = 0; i < n; i++) out.push(mmPoint(m, N(3 + i * 2), N(4 + i * 2), N(2))); } else { const step = ip === 3 ? 6 : 3; for (let i = 0; i < n; i++) out.push(mmPoint(m, N(2 + i * step), N(3 + i * step), N(4 + i * step))); }
        return out;
      }
      case 126: {
        const K = N(0); const M = N(1);
        const knots = Array.from({ length: K + M + 2 }, (_, i) => N(6 + i));
        const wStart = 6 + K + M + 2;
        const weights = Array.from({ length: K + 1 }, (_, i) => N(wStart + i, 1));
        const cStart = wStart + K + 1;
        const ctrl = Array.from({ length: K + 1 }, (_, i) => mmPoint(m, N(cStart + i * 3), N(cStart + i * 3 + 1), N(cStart + i * 3 + 2)));
        const v0 = N(cStart + (K + 1) * 3, knots[M]); const v1 = N(cStart + (K + 1) * 3 + 1, knots[K + 1]);
        const H = ctrl.map((q, i) => [q[0] * weights[i], q[1] * weights[i], q[2] * weights[i], weights[i]]);
        const n = M === 1 ? K : Math.max(24, K * 8);
        return Array.from({ length: n + 1 }, (_, i) => { const u = v0 + ((v1 - v0) * i) / n; const h = curvePoint({ degree: M, points: H, knots }, Math.min(Math.max(u, knots[M]), knots[K + 1])); return [h[0] / h[3], h[1] / h[3], h[2] / h[3]]; });
      }
      default: skip(`${entry.type} (curve of a surface)`); return [];
    }
  };
  const vec3 = (m, k) => { const e = DE(k); if (!e) return null; const q = P(e.de).map(Number); return e.type === 116 ? mmPoint(compose(m, matrixOf(e.transform)), q[0], q[1], q[2]) : dirOf(compose(m, matrixOf(e.transform)), q); };
  /** The surface of a face as a spec for makeSurface (model space, mm). */
  const surfaceOf = (entry) => {
    if (!entry) return null;
    const m = matrixOf(entry.transform);
    const p = P(entry.de);
    const N = (k, d = 0) => (Number.isFinite(Number(p[k])) ? Number(p[k]) : d);
    switch (entry.type) {
      case 108: { const n = [N(0), N(1), N(2)]; const l2 = n[0] ** 2 + n[1] ** 2 + n[2] ** 2 || 1; const o = n.map((v) => (v * N(3)) / l2); return { kind: 'plane', origin: mmPoint(m, ...o), normal: dirOf(m, n) }; }
      case 190: return { kind: 'plane', origin: vec3(m, p[0]), normal: vec3(m, p[1]), ref: entry.form === 1 ? vec3(m, p[2]) : null };
      case 192: return { kind: 'cylinder', origin: vec3(m, p[0]), axis: vec3(m, p[1]), radius: N(2) * scale, ref: entry.form === 1 ? vec3(m, p[3]) : null };
      case 194: return { kind: 'cone', origin: vec3(m, p[0]), axis: vec3(m, p[1]), radius: N(2) * scale, angle: (N(3) * Math.PI) / 180, ref: entry.form === 1 ? vec3(m, p[4]) : null };
      case 196: return { kind: 'sphere', center: vec3(m, p[0]), radius: N(1) * scale, axis: entry.form === 1 ? vec3(m, p[2]) : [0, 0, 1], ref: entry.form === 1 ? vec3(m, p[3]) : null };
      case 198: return { kind: 'torus', center: vec3(m, p[0]), axis: vec3(m, p[1]), major: N(2) * scale, minor: N(3) * scale, ref: entry.form === 1 ? vec3(m, p[4]) : null };
      case 120: {
        const axis = curve3d(DE(p[0])); const gen = curve3d(DE(p[1]), m);
        if (axis.length < 2 || gen.length < 2) return null;
        const a = axis.map((q) => apply(m, q[0] / scale, q[1] / scale, q[2] / scale)).map((q) => [q.x * scale, q.y * scale, q.z * scale]);
        return { kind: 'revolution', axisPoint: a[0], axisDir: a[1].map((v, i) => v - a[0][i]), generatrix: gen, start: N(2), end: N(3, Math.PI * 2) };
      }
      case 122: { const dir = curve3d(DE(p[0]), m); return dir.length >= 2 ? { kind: 'tabulated', directrix: dir, end: mmPoint(m, N(1), N(2), N(3)) } : null; }
      case 128: {
        const [K1, K2, M1, M2] = [N(0), N(1), N(2), N(3)];
        let k = 9;
        const uKnots = Array.from({ length: K1 + M1 + 2 }, () => N(k++));
        const vKnots = Array.from({ length: K2 + M2 + 2 }, () => N(k++));
        const count = (K1 + 1) * (K2 + 1);
        const weights = Array.from({ length: count }, () => N(k++, 1));
        const poles = Array.from({ length: count }, () => { const q = mmPoint(m, N(k), N(k + 1), N(k + 2)); k += 3; return q; });
        return { kind: 'bspline', nu: K1 + 1, nv: K2 + 1, uDegree: M1, vDegree: M2, uKnots, vKnots, weights, poles, uRange: [N(k, uKnots[M1]), N(k + 1, uKnots[K1 + 1])], vRange: [N(k + 2, vKnots[M2]), N(k + 3, vKnots[K2 + 1])] };
      }
      default: skip(`${entry.type} (surface)`); return null;
    }
  };
  const closeLoop = (pts) => { const out = pts.filter((q, i) => i === 0 || Math.hypot(...q.map((v, d) => v - pts[i - 1][d])) > 1e-9); if (out.length > 2 && Math.hypot(...out[0].map((v, d) => v - out[out.length - 1][d])) < 1e-6) out.pop(); return out; };
  const tessellate = (surfaceEntry, loops) => {
    const spec = surfaceOf(surfaceEntry);
    const surface = spec ? makeSurface(spec) : null;
    if (!surface) return [];
    try { return faceTriangles(surface, loops.map(closeLoop)); } catch { skip(`${surfaceEntry.type} (face)`); return []; }
  };
  const solids = [];
  const finish = (tris, name, entry) => {
    if (!tris.length) return;
    let mesh = repairMesh(tris).triangles;
    let v = 0;
    for (const [a, b, c] of mesh) v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    if (v < 0) mesh = mesh.map(([a, b, c]) => [a, c, b]);
    solids.push({ type: 'solid', kind: 'mesh', name, params: {}, shape: { tris: mesh.flat(2) }, layer: layerOf(entry.level), ...(colorOf(entry) ? { color: colorOf(entry) } : {}) });
  };
  // Manifold solid B-reps.
  for (const entry of directory.values()) {
    if (entry.type !== 186) continue;
    const shell = DE(P(entry.de)[0]);
    if (shell?.type !== 514) continue;
    const sp = P(shell.de);
    const tris = [];
    for (let i = 0; i < (Number(sp[0]) || 0); i++) {
      const face = DE(sp[1 + i * 2]);
      if (face?.type !== 510) continue;
      const fp = P(face.de);
      const loops = [];
      for (let l = 0; l < (Number(fp[1]) || 0); l++) {
        const loop = DE(fp[3 + l]);
        if (loop?.type !== 508) continue;
        const lp = P(loop.de);
        const pts = [];
        let k = 1;
        for (let e = 0; e < (Number(lp[0]) || 0); e++) {
          const [type, list, index, forward, pcurves] = [Number(lp[k]), DE(lp[k + 1]), Number(lp[k + 2]), Number(lp[k + 3]), Number(lp[k + 4]) || 0];
          k += 5 + pcurves * 2;
          if (type !== 0 || list?.type !== 504) continue;
          const el = P(list.de);
          const curve = curve3d(DE(el[1 + (index - 1) * 5]));
          const run = forward ? curve : curve.slice().reverse();
          if (pts.length && run.length && Math.hypot(...run[0].map((v, d) => v - pts[pts.length - 1][d])) < 1e-6) run.shift();
          pts.push(...run);
        }
        loops.push(pts);
      }
      tris.push(...tessellate(DE(fp[0]), loops));
    }
    finish(tris, `IGES solid ${solids.length + 1}`, entry);
  }
  // Trimmed surfaces (as FreeCAD and most CAD write faces): all of them as one solid.
  const trimmed = [];
  for (const entry of directory.values()) {
    if (entry.type !== 144) continue;
    const p = P(entry.de);
    const boundary = (k) => { const c = DE(k); return c?.type === 142 ? curve3d(DE(P(c.de)[3])) : c ? curve3d(c) : []; };
    const outer = Number(p[3]) ? boundary(p[3]) : [];
    const inner = Array.from({ length: Number(p[2]) || 0 }, (_, i) => boundary(p[4 + i]));
    if (outer.length < 2) { skip('144 (untrimmed)'); continue; }
    trimmed.push(...tessellate(DE(p[0]), [outer, ...inner]));
  }
  if (trimmed.length) finish(trimmed, 'IGES surfaces', { level: 1, color: 0 });
  entities.push(...solids);

  drawing.entities = entities;
  return { drawing, imported: entities.length, skipped, units: scale };
}

// ───────────────────────── writing

const real = (v) => {
  const n = Math.abs(v) < 1e-12 ? 0 : Number(v.toPrecision(15));
  let s = String(n).replace('e', 'E');
  if (!/[.E]/.test(s)) s += '.';
  return s;
};
const hollerith = (text) => `${text.length}H${text}`;
const ascii = (text) => String(text).replace(/[^\x20-\x7e]/g, '?');

/**
 * IGES 5.3 of a drawing (mm, one level per layer, colours as 314 entities,
 * line fonts). `meta`: { author, organization, file }.
 */
export function exportIges(drawing, { entities = null, author = '', organization = '', file = 'drawing.igs', date = new Date() } = {}) {
  const list = (entities ?? drawing.entities).filter((entity) => isVisible(drawing, entity) && !entity.construction);
  const records = []; // { type, params: [], form, level, color, font, transform, status, label }
  const levels = new Map(drawing.layers.map((layer, i) => [layer.id, i + 1]));
  const colorDe = new Map();
  const colorFor = (hex) => {
    if (!hex || hex === AUTO) return 0;
    const value = hex.toLowerCase();
    const known = Object.entries(COLORS).find(([, c]) => c === value);
    if (known) return Number(known[0]);
    if (!colorDe.has(value)) {
      const rgb = [1, 3, 5].map((i) => (Number.parseInt(value.slice(i, i + 2), 16) / 2.55));
      records.push({ type: 314, params: [...rgb, hollerith(value)], form: 0 });
      colorDe.set(value, records.length); // index; turned into a DE number below
    }
    return -colorDe.get(value);
  };
  const fontFor = (lineType) => ({ continuous: 1, dashed: 2, hidden: 2, phantom: 3, center: 4, dotted: 5 })[lineType] ?? 1;
  const add = (entity, type, params, extra = {}) => {
    const style = styleOf(drawing, entity);
    records.push({ type, params, form: 0, level: levels.get(entity.layer) ?? 1, color: colorFor(style.color), font: fontFor(style.lineType), ...extra });
    return records.length;
  };
  const arc = (entity, c, r, startDeg, endDeg) => {
    const s = { x: c.x + r * Math.cos((startDeg * Math.PI) / 180), y: c.y + r * Math.sin((startDeg * Math.PI) / 180) };
    const e = { x: c.x + r * Math.cos((endDeg * Math.PI) / 180), y: c.y + r * Math.sin((endDeg * Math.PI) / 180) };
    add(entity, 100, [0, c.x, c.y, s.x, s.y, e.x, e.y]);
  };
  const polyline = (entity, points, closed) => {
    const pts = closed ? [...points, points[0]] : points;
    if (pts.length === 2) { add(entity, 110, [pts[0].x, pts[0].y, 0, pts[1].x, pts[1].y, 0]); return; }
    add(entity, 106, [2, pts.length, ...pts.flatMap((q) => [q.x, q.y, 0])], { form: 12 });
  };
  const note = (entity, prim) => {
    const text = ascii(prim.text).split('\n')[0];
    if (!text.trim()) return;
    const a = ((prim.angle ?? 0) * Math.PI) / 180;
    add(entity, 212, [1, text.length, prim.size * 0.6 * text.length, prim.size, 1, Math.PI / 2, a, 0, 0, prim.p.x, prim.p.y, 0, hollerith(text)]);
  };
  // Solids: their exact B-rep (manifold solid B-rep object) when the kernel is there.
  const dependent = '00010000';
  const geo = (type, params, form = 0, extra = {}) => { records.push({ type, params, form, level: 1, color: 0, font: 1, status: dependent, ...extra }); return { ref: records.length }; };
  const point = (p) => geo(116, [p[0], p[1], p[2], 0]);
  const dir = (d) => geo(123, [d[0], d[1], d[2]]);
  const curveRecord = (c) => {
    if (c.type === 'line') return geo(110, [...c.a, ...c.b]);
    if (c.type === 'circle') {
      // In the circle's own plane (centre at the origin), placed by a 124.
      const y = [c.axis[1] * c.xdir[2] - c.axis[2] * c.xdir[1], c.axis[2] * c.xdir[0] - c.axis[0] * c.xdir[2], c.axis[0] * c.xdir[1] - c.axis[1] * c.xdir[0]];
      const t = geo(124, [c.xdir[0], y[0], c.axis[0], c.center[0], c.xdir[1], y[1], c.axis[1], c.center[1], c.xdir[2], y[2], c.axis[2], c.center[2]], 0, { status: '00010200' });
      const full = Math.abs(c.t1 - c.t0 - 2 * Math.PI) < 1e-9;
      const end = full ? c.t0 : c.t1;
      return geo(100, [0, 0, 0, c.radius * Math.cos(c.t0), c.radius * Math.sin(c.t0), c.radius * Math.cos(end), c.radius * Math.sin(end)], 0, { transform: t.ref });
    }
    const spline = c.type === 'bspline' ? c : { degree: 1, poles: c.points, weights: c.points.map(() => 1), knots: [0, ...c.points.map((_, i) => i / (c.points.length - 1)), 1], t0: 0, t1: 1 };
    const n = spline.poles.length;
    const rational = spline.weights.some((w) => Math.abs(w - 1) > 1e-12);
    return geo(126, [n - 1, spline.degree, 0, 0, rational ? 0 : 1, 0, ...spline.knots, ...spline.weights, ...spline.poles.flat(), spline.t0, spline.t1, 0, 0, 0]);
  };
  const surfaceRecord = (sf) => {
    if (sf.type === 'plane') return geo(190, [point(sf.origin), dir(sf.normal), dir(sf.xdir)], 1);
    if (sf.type === 'cylinder') return geo(192, [point(sf.origin), dir(sf.axis), sf.radius, dir(sf.xdir)], 1);
    if (sf.type === 'sphere') return geo(196, [point(sf.center), sf.radius, dir(sf.axis), dir(sf.xdir)], 1);
    const rational = sf.weights.some((w) => Math.abs(w - 1) > 1e-12);
    return geo(128, [sf.nu - 1, sf.nv - 1, sf.uDegree, sf.vDegree, 0, 0, rational ? 0 : 1, 0, 0, ...sf.uKnots, ...sf.vKnots, ...sf.weights, ...sf.poles.flat(), sf.uKnots[sf.uDegree], sf.uKnots[sf.nu], sf.vKnots[sf.vDegree], sf.vKnots[sf.nv]]);
  };
  const solidRecords = (entity, topo) => {
    const vertexList = geo(502, [topo.vertices.length, ...topo.vertices.flat()], 1);
    const curves = topo.edges.map((e) => curveRecord(e.curve));
    const edgeList = geo(504, [topo.edges.length, ...topo.edges.flatMap((e, i) => [curves[i], vertexList, e.v0 + 1, vertexList, e.v1 + 1])], 1);
    const faces = topo.faces.map((face) => {
      const surface = surfaceRecord(face.surface);
      const loops = face.loops.map((loop) => geo(508, [loop.length, ...loop.flatMap((u) => [0, edgeList, u.edge + 1, u.forward ? 1 : 0, 0])], 1));
      return { ref: geo(510, [surface, loops.length, 1, ...loops], 1), forward: !face.reversed };
    });
    const shell = geo(514, [faces.length, ...faces.flatMap((fc) => [fc.ref, fc.forward ? 1 : 0])], 1);
    const style = styleOf(drawing, entity);
    records.push({ type: 186, params: [shell, 1, 0], form: 0, level: levels.get(entity.layer) ?? 1, color: colorFor(style.color), font: 1, status: '00000000', label: 'SOLID' });
  };
  for (const entity of list) {
    if (entity.type === 'solid' && occReady()) {
      const topo = occTopology(entity);
      if (topo?.faces.length) { solidRecords(entity, topo); continue; }
    }
    switch (entity.type) {
      case 'line': add(entity, 110, [entity.x1, entity.y1, 0, entity.x2, entity.y2, 0]); continue;
      case 'arc': arc(entity, { x: entity.cx, y: entity.cy }, entity.r, entity.start, entity.end); continue;
      case 'point': add(entity, 116, [entity.x, entity.y, 0, 0]); continue;
      case 'ellipse': {
        // 104 in its own frame (centred, axes aligned) placed by a 124 rotation + translation.
        const a = (entity.angle * Math.PI) / 180;
        records.push({ type: 124, params: [Math.cos(a), -Math.sin(a), 0, entity.cx, Math.sin(a), Math.cos(a), 0, entity.cy, 0, 0, 1, 0], form: 0, level: 0, color: 0, font: 0, status: '00000000' });
        const transform = records.length;
        const full = Math.abs(entity.end - entity.start) >= 360 - 1e-9;
        const t0 = (entity.start * Math.PI) / 180;
        const t1 = (entity.end * Math.PI) / 180;
        const p0 = { x: entity.rx * Math.cos(t0), y: entity.ry * Math.sin(t0) };
        const p1 = full ? p0 : { x: entity.rx * Math.cos(t1), y: entity.ry * Math.sin(t1) };
        add(entity, 104, [entity.ry ** 2, 0, entity.rx ** 2, 0, 0, -(entity.rx ** 2) * entity.ry ** 2, 0, p0.x, p0.y, p1.x, p1.y], { form: 1, transform });
        continue;
      }
      case 'spline': {
        const n = entity.points.length;
        const p = entity.degree;
        const knots = entity.knots ?? clampedKnots(n, p);
        const weights = entity.weights ?? Array(n).fill(1);
        add(entity, 126, [n - 1, p, 1, entity.closed ? 1 : 0, entity.weights ? 0 : 1, 0, ...knots, ...weights, ...entity.points.flatMap((q) => [q.x, q.y, 0]), knots[p], knots[n], 0, 0, 1]);
        continue;
      }
      case 'polyline': polyline(entity, entity.points, entity.closed); continue;
      case 'text': { for (const prim of primitives(entity)) if (prim.kind === 'text') note(entity, prim); continue; }
      default:
        for (const prim of primitives(entity)) {
          if (prim.kind === 'line') add(entity, 110, [prim.a.x, prim.a.y, 0, prim.b.x, prim.b.y, 0]);
          else if (prim.kind === 'poly' || prim.kind === 'fill') { if (prim.points.length >= 2) polyline(entity, prim.points, prim.closed || prim.kind === 'fill'); }
          else if (prim.kind === 'circle') arc(entity, prim.c, prim.r, 0, 0);
          else if (prim.kind === 'arc') arc(entity, prim.c, prim.r, prim.start, prim.end);
          else if (prim.kind === 'text') note(entity, prim);
        }
    }
  }

  // Sections. DE numbers: 2·index − 1.
  const deOf = (index) => index * 2 - 1;
  const seq = (n) => String(n).padStart(7, ' ');
  const stamp = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
  const start = [`MyCAD IGES 5.3: ${ascii(drawing.title ?? '')}`.slice(0, 72)];
  let maxCoord = 1;
  for (const r of records) if (r.type !== 502 && r.type !== 504) for (const v of r.params) if (typeof v === 'number') maxCoord = Math.max(maxCoord, Math.abs(v));
  const globalParams = [hollerith(','), hollerith(';'), hollerith(ascii(drawing.title || 'MyCAD')), hollerith(ascii(file)), hollerith('MyCAD'), hollerith('MyCAD 1.0'), 32, 38, 6, 308, 15, hollerith(ascii(drawing.title || 'MyCAD')), real(1), 2, hollerith('MM'), 1, real(1), hollerith(stamp(date)), real(1e-6), real(maxCoord), hollerith(ascii(author || 'MyCAD')), hollerith(ascii(organization || 'MyCAD')), 11, 0, hollerith(stamp(date))];
  const wrap = (tokens, width) => {
    const out = [];
    let line = '';
    for (const token of tokens) {
      if (line.length + token.length > width && line) { out.push(line); line = ''; }
      let rest = token;
      while (rest.length > width) { out.push(rest.slice(0, width)); rest = rest.slice(width); }
      line += rest;
    }
    if (line) out.push(line);
    return out;
  };
  const value = (v) => (v && typeof v === 'object' && 'ref' in v ? String(deOf(v.ref)) : typeof v === 'number' ? (Number.isInteger(v) && Math.abs(v) < 1e9 && !Object.is(v, -0) ? String(v) : real(v)) : String(v));
  const globalTokens = globalParams.map((v, i) => `${value(v)}${i === globalParams.length - 1 ? ';' : ','}`);
  const G = wrap(globalTokens, 72);
  const D = [];
  const Pl = [];
  records.forEach((r, i) => {
    const de = deOf(i + 1);
    const tokens = [String(r.type), ...r.params.map(value)].map((t, k, all) => `${t}${k === all.length - 1 ? ';' : ','}`);
    const lines = wrap(tokens, 64);
    const pStart = Pl.length + 1;
    for (const line of lines) Pl.push(`${line.padEnd(64)}${String(de).padStart(8)}P${seq(Pl.length + 1)}`);
    const color = r.color > 0 ? r.color : r.color < 0 ? -deOf(-r.color) : 0;
    const f = (v) => String(v).padStart(8);
    D.push(`${f(r.type)}${f(pStart)}${f(0)}${f(r.font ?? 1)}${f(r.level ?? 0)}${f(0)}${f(r.transform ? deOf(r.transform) : 0)}${f(0)}${(r.status ?? (r.type === 124 || r.type === 314 ? '00000200' : '00000000')).padStart(8, '0')}D${seq(D.length + 1)}`);
    D.push(`${f(r.type)}${f(0)}${f(color)}${f(lines.length)}${f(r.form ?? 0)}${f('')}${f('')}${f('')}${f(0)}D${seq(D.length + 1)}`);
  });
  const out = [
    ...start.map((line, i) => `${line.padEnd(72)}S${seq(i + 1)}`),
    ...G.map((line, i) => `${line.padEnd(72)}G${seq(i + 1)}`),
    ...D,
    ...Pl,
    `${`S${seq(start.length)}G${seq(G.length)}D${seq(D.length)}P${seq(Pl.length)}`.padEnd(72)}T${seq(1)}`,
  ];
  return `${out.join('\n')}\n`;
}

export { UNIT_MM as IGES_UNITS };

// The sketch's conic curves and equation-driven curves as exact rational Bézier pieces (no DOM, no kernel):
//   partial ellipse  — an elliptical arc: pieces of at most 90°, each the affine image of a circular arc piece
//                      (poles: the ends and the meeting point of their tangents, middle weight cos(θ/2));
//   conic / parabola — one rational quadratic piece through the start, the meeting point of the end tangents
//                      (the "top vertex") and the end, middle weight w = ρ / (1 − ρ) (ρ = 0.5: a parabola,
//                      ρ < 0.5 an ellipse, ρ > 0.5 a hyperbola);
//   equation curve   — y = f(x) or x = f(t), y = g(t) (angles in radians): cubic Hermite pieces with the
//                      curve's own derivative, split until the piece is within the tolerance of the curve.
// A piece is { P: [[x, y], …], w: [w0, …] } (degree = P.length − 1); the kernel gets the same poles and weights.

const TAU = Math.PI * 2;

/** A point of a rational Bézier piece at t ∈ [0, 1] (de Casteljau in homogeneous coordinates). */
export function pieceAt(piece, t) {
  let q = piece.P.map((p, i) => [p[0] * piece.w[i], p[1] * piece.w[i], piece.w[i]]);
  while (q.length > 1) {
    const next = [];
    for (let i = 0; i < q.length - 1; i++) next.push([q[i][0] + (q[i + 1][0] - q[i][0]) * t, q[i][1] + (q[i + 1][1] - q[i][1]) * t, q[i][2] + (q[i + 1][2] - q[i][2]) * t]);
    q = next;
  }
  return [q[0][0] / q[0][2], q[0][1] / q[0][2]];
}

/** Points along pieces (n per piece, the shared ends once). */
export function piecesPolyline(pieces, n = 16) {
  const out = [];
  pieces.forEach((pc, k) => { for (let i = k ? 1 : 0; i <= n; i++) out.push(pieceAt(pc, i / n)); });
  return out;
}

/** The pieces in the other direction. */
export const reversePieces = (pieces) => pieces.slice().reverse().map((pc) => ({ P: pc.P.slice().reverse(), w: pc.w.slice().reverse() }));

// ───────────────────────── ellipses

/** A point of the ellipse at parameter angle t. */
export function ellipsePoint(c, rx, ry, rot, t) {
  const cr = Math.cos(rot); const sr = Math.sin(rot);
  const u = rx * Math.cos(t); const v = ry * Math.sin(t);
  return [c[0] + u * cr - v * sr, c[1] + u * sr + v * cr];
}

/** The parameter angle of a point (its direction from the centre in the ellipse's own, unstretched frame). */
export function ellipseParam(c, rx, ry, rot, p) {
  const dx = p[0] - c[0]; const dy = p[1] - c[1];
  const cr = Math.cos(rot); const sr = Math.sin(rot);
  const u = dx * cr + dy * sr; const v = -dx * sr + dy * cr;
  return Math.atan2(v / ry, u / rx);
}

/** The ellipse's equation at a point: (u/rx)² + (v/ry)² − 1 scaled to a length (0 on the curve). */
export function ellipseResidual(c, rx, ry, rot, p) {
  const dx = p[0] - c[0]; const dy = p[1] - c[1];
  const cr = Math.cos(rot); const sr = Math.sin(rot);
  const u = (dx * cr + dy * sr) / rx; const v = (-dx * sr + dy * cr) / ry;
  return (Math.hypot(u, v) - 1) * Math.min(rx, ry);
}

/** Counter-clockwise parameter span from t0 to t1 (0 < span ≤ 2π). */
export function ccwSpan(t0, t1) {
  let d = t1 - t0;
  while (d <= 1e-12) d += TAU;
  while (d > TAU + 1e-12) d -= TAU;
  return d;
}

/** An elliptical arc from parameter t0 counter-clockwise to t1 as rational quadratic pieces (exact). */
export function ellipseArcPieces(c, rx, ry, rot, t0, t1) {
  const span = ccwSpan(t0, t1);
  const n = Math.max(1, Math.ceil(span / (Math.PI / 2) - 1e-9));
  const h = span / n / 2;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = t0 + (span * i) / n; const b = t0 + (span * (i + 1)) / n; const m = (a + b) / 2;
    // The circular piece's middle pole lies on the bisector at 1 / cos(h); the affine map keeps the weights.
    const k = 1 / Math.cos(h);
    const mid = [c[0], c[1]];
    const cr = Math.cos(rot); const sr = Math.sin(rot);
    const u = rx * Math.cos(m) * k; const v = ry * Math.sin(m) * k;
    mid[0] += u * cr - v * sr; mid[1] += u * sr + v * cr;
    out.push({ P: [ellipsePoint(c, rx, ry, rot, a), mid, ellipsePoint(c, rx, ry, rot, b)], w: [1, Math.cos(h), 1] });
  }
  return out;
}

// ───────────────────────── conics

/** The middle weight of a conic of ratio ρ (0 < ρ < 1). */
export const conicWeight = (rho) => { const r = Math.min(0.999, Math.max(0.001, Number(rho) || 0.5)); return r / (1 - r); };

/** A conic from p0 to p2 with the top vertex (the tangents' meeting point) pc. */
export const conicPieces = (p0, pc, p2, rho = 0.5) => [{ P: [p0, pc, p2], w: [1, conicWeight(rho), 1] }];

/** ρ of the conic through a shoulder point s: s = M + ρ (pc − M), M the middle of the chord. */
export function rhoFromShoulder(p0, pc, p2, s) {
  const m = [(p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2];
  const d = [pc[0] - m[0], pc[1] - m[1]];
  const l2 = d[0] * d[0] + d[1] * d[1];
  if (!(l2 > 0)) return 0.5;
  return Math.min(0.99, Math.max(0.01, ((s[0] - m[0]) * d[0] + (s[1] - m[1]) * d[1]) / l2));
}

/**
 * A parabola segment from its focus and apex (vertex), between the points of it nearest to `a` and `b` (their
 * positions along the axis' perpendicular). Returns { p0, pc, p2 } (a conic with ρ = 0.5) or null.
 */
export function parabolaSegment(focus, apex, a, b) {
  const ax = [focus[0] - apex[0], focus[1] - apex[1]];
  const f = Math.hypot(ax[0], ax[1]);
  if (!(f > 1e-9)) return null;
  const n = [ax[0] / f, ax[1] / f]; const t = [n[1], -n[0]];
  const local = (p) => (p[0] - apex[0]) * t[0] + (p[1] - apex[1]) * t[1];
  const x1 = local(a); const x2 = local(b);
  if (Math.abs(x1 - x2) < 1e-9) return null;
  const at = (x, y) => [apex[0] + t[0] * x + n[0] * y, apex[1] + t[1] * x + n[1] * y];
  // y = x² / (4f); the tangents at x1 and x2 meet at ((x1 + x2) / 2, x1 x2 / (4f)).
  return { p0: at(x1, (x1 * x1) / (4 * f)), pc: at((x1 + x2) / 2, (x1 * x2) / (4 * f)), p2: at(x2, (x2 * x2) / (4 * f)) };
}

// ───────────────────────── equation-driven curves (angles in radians)

const FN = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp, ln: Math.log, log: Math.log10,
  sgn: Math.sign, sign: Math.sign, int: Math.trunc, floor: Math.floor, ceil: Math.ceil, round: Math.round, min: Math.min, max: Math.max, pow: Math.pow,
  sec: (v) => 1 / Math.cos(v), csc: (v) => 1 / Math.sin(v), cot: (v) => 1 / Math.tan(v),
};
const CONST = { pi: Math.PI, e: Math.E };

export class EquationError extends Error { constructor(detail) { super(detail); this.code = 'equation'; } }

/** Compiles an expression of one variable (`name`) to a function; operators + − * / ^ (right-assoc.), functions above. */
export function compileEquation(text, name = 'x') {
  const s = String(text ?? '');
  const tokens = [];
  for (let i = 0; i < s.length;) {
    const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }
    const num = /^(\d+\.?\d*|\.\d+)(e[-+]?\d+)?/i.exec(s.slice(i));
    if (num) { tokens.push({ t: 'num', v: Number(num[0]) }); i += num[0].length; continue; }
    const id = /^[A-Za-z_]\w*/.exec(s.slice(i));
    if (id) { tokens.push({ t: 'name', v: id[0] }); i += id[0].length; continue; }
    if ('+-*/^(),'.includes(ch)) { tokens.push({ t: 'op', v: ch }); i++; continue; }
    throw new EquationError(`unexpected "${ch}"`);
  }
  let k = 0;
  const eat = (v) => (tokens[k]?.v === v && tokens[k].t === 'op' ? (k++, true) : false);
  const add = () => { let a = mul(); for (;;) { if (eat('+')) { const l = a; const r = mul(); a = (x) => l(x) + r(x); } else if (eat('-')) { const l = a; const r = mul(); a = (x) => l(x) - r(x); } else return a; } };
  const mul = () => { let a = unary(); for (;;) { if (eat('*')) { const l = a; const r = unary(); a = (x) => l(x) * r(x); } else if (eat('/')) { const l = a; const r = unary(); a = (x) => l(x) / r(x); } else return a; } };
  const unary = () => { if (eat('-')) { const a = unary(); return (x) => -a(x); } if (eat('+')) return unary(); return pow(); };
  const pow = () => { const a = primary(); if (eat('^')) { const b = unary(); return (x) => a(x) ** b(x); } return a; };
  const primary = () => {
    const tk = tokens[k++];
    if (!tk) throw new EquationError('unexpected end');
    if (tk.t === 'num') { const v = tk.v; return () => v; }
    if (tk.t === 'op' && tk.v === '(') { const a = add(); if (!eat(')')) throw new EquationError('missing )'); return a; }
    if (tk.t === 'name') {
      const lower = tk.v.toLowerCase();
      if (eat('(')) {
        const fn = FN[lower];
        if (!fn) throw new EquationError(`unknown function ${tk.v}`);
        const args = [];
        if (!eat(')')) { do args.push(add()); while (eat(',')); if (!eat(')')) throw new EquationError('missing )'); }
        return (x) => fn(...args.map((g) => g(x)));
      }
      if (tk.v === name) return (x) => x;
      if (lower in CONST) { const v = CONST[lower]; return () => v; }
      throw new EquationError(`unknown name ${tk.v}`);
    }
    throw new EquationError(`unexpected "${tk.v}"`);
  };
  const fn = add();
  if (k < tokens.length) throw new EquationError(`unexpected "${tokens[k].v}"`);
  return fn;
}

/** The curve of an equation entity as a function t → [x, y] over [t0, t1] (explicit: t is x). Throws EquationError. */
export function equationFunction(e) {
  if (e.mode === 'parametric') {
    const fx = compileEquation(e.fx, 't'); const fy = compileEquation(e.fy, 't');
    return { at: (t) => [fx(t), fy(t)], t0: Number(e.t0), t1: Number(e.t1) };
  }
  const fy = compileEquation(e.fy, 'x');
  return { at: (x) => [x, fy(x)], t0: Number(e.t0), t1: Number(e.t1) };
}

/**
 * Cubic Hermite pieces of an equation curve (exact ends, derivative from a central difference), split until the
 * middle of each piece is within `tol` of the curve. Throws EquationError when the curve is not finite there.
 */
export function equationPieces(e, tol = 1e-4) {
  const { at, t0, t1 } = equationFunction(e);
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) throw new EquationError('the end value must be greater than the start value');
  const span = t1 - t0;
  const h = span * 1e-6;
  const pt = (t) => { const p = at(t); if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) throw new EquationError(`not defined at ${+t.toFixed(6)}`); return p; };
  const der = (t) => {
    const a = Math.max(t0, t - h); const b = Math.min(t1, t + h);
    const p = pt(a); const q = pt(b);
    return [(q[0] - p[0]) / (b - a), (q[1] - p[1]) / (b - a)];
  };
  const piece = (a, b) => {
    const pa = pt(a); const pb = pt(b); const da = der(a); const db = der(b); const k = (b - a) / 3;
    return { P: [pa, [pa[0] + da[0] * k, pa[1] + da[1] * k], [pb[0] - db[0] * k, pb[1] - db[1] * k], pb], w: [1, 1, 1, 1] };
  };
  const out = [];
  const close = (pc, a, b) => [0.25, 0.5, 0.75].every((f) => { const p = pieceAt(pc, f); const q = pt(a + (b - a) * f); return Math.hypot(p[0] - q[0], p[1] - q[1]) <= tol; });
  const split = (a, b, depth) => {
    const pc = piece(a, b);
    if (depth >= 14 || close(pc, a, b)) { out.push(pc); return; }
    const m = (a + b) / 2;
    split(a, m, depth + 1); split(m, b, depth + 1);
  };
  const start = 8;
  for (let i = 0; i < start; i++) split(t0 + (span * i) / start, t0 + (span * (i + 1)) / start, 0);
  return out;
}

/** The end points of an equation curve (where its points are put). */
export function equationEnds(e) {
  const { at, t0, t1 } = equationFunction(e);
  return [at(Number(t0)), at(Number(t1))];
}

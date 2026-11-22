// Routing: pipes, tubes and cables along a network of 3D points (a route's own points plus its branches, or a
// 3D sketch / XYZ curve of the part as the main run).
//   pipe   a standard pipe size (PIPES: outside diameter, wall) per run. Corners are either bent (one pipe, bend
//          radius) or get butt-weld elbows (ASME B16.9: 90° and 45° long radius; other angles are cut from a 90°
//          elbow or, beyond 90°, from a 180° return). A branch starting on the network makes a tee (equal, or
//          reducing when the branch is smaller; a smaller run side gets a concentric reducer on the tee); a size
//          change along a straight run gets a concentric reducer. Weld-neck flanges can end the route.
//          Two opposite branches make a cross; a branch at 15°–75° a lateral (45°: standard dimensions,
//          LATERAL_STD); three legs without a straight run a Y (90° true Y standard, others fabricated); a size
//          change at a 90° elbow a B16.9 reducing elbow (law-driven sweep), elsewhere an elbow or bend + reducers.
//   tube   any outside diameter and wall, bent at the corners; branches are saddle-welded into the run (the
//          branch is cut to fit the run's outside), size changes along a run get a 30° swaged cone.
//   cable  a solid round cable (diameter, colour) along a smooth spline through each run's points; branches are
//          spliced where they start.
//   harness (harness.js) bundles, connectors, clips and wires on the same network.
// The network (nodes, edges), its junctions (ends, bends, elbows, tees, reducers, saddles), the runs of pipe
// between fittings with their take-outs, the centre line and the bill of materials are plain maths; routeSolid()
// sweeps the hollow circular profile on the kernel and adds the fittings.
import { rep } from './kernel.js';
import { PIPES, PIPE_SIZES } from './stdparts.js';
import { rotate, quatConjugate } from './assembly.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = len(a) || 1; return mul(a, 1 / l); };
const neg = (a) => [-a[0], -a[1], -a[2]];
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const code = (c, params = {}) => Object.assign(new Error(c), { code: c, params });
const clamp1 = (c) => Math.max(-1, Math.min(1, c));

/** Points closer than this (mm) are the same network node. */
export const NODE_TOL = 1e-4;
/** Fitting angles within this (degrees) of 90° / 45° take the standard elbow. */
export const ELBOW_ANGLE_TOL = 0.05;

// ───────────────────────── standard fittings (ASME B16.9, mm; sizes keyed like PIPES)

/** 45° long-radius elbow, centre to end (B). */
export const ELBOW45_B = { DN15: 15.9, DN20: 11.1, DN25: 22.2, DN32: 25.4, DN40: 28.6, DN50: 34.9, DN65: 44.5, DN80: 50.8, DN100: 63.5 };
/** Concentric reducer, end to end (H), by the large end. */
export const REDUCER_H = { DN20: 38.1, DN25: 50.8, DN32: 50.8, DN40: 63.5, DN50: 76.2, DN65: 88.9, DN80: 88.9, DN100: 101.6 };
/** The small ends B16.9 lists for a concentric reducer of each large end (smaller steps chain: reducerChain). */
export const REDUCER_SMALL = {
  DN20: ['DN15'], DN25: ['DN20', 'DN15'], DN32: ['DN25', 'DN20', 'DN15'], DN40: ['DN32', 'DN25', 'DN20', 'DN15'],
  DN50: ['DN40', 'DN32', 'DN25', 'DN20'], DN65: ['DN50', 'DN40', 'DN32', 'DN25'], DN80: ['DN65', 'DN50', 'DN40', 'DN32'], DN100: ['DN80', 'DN65', 'DN50', 'DN40'],
};
/** Reducing outlet tee, centre to end of the outlet (M), by run and outlet size (the run's C is PIPES.tee). */
export const REDUCING_TEE_M = {
  DN20: { DN15: 28.6 },
  DN25: { DN20: 38.1, DN15: 38.1 },
  DN32: { DN25: 47.6, DN20: 47.6, DN15: 47.6 },
  DN40: { DN32: 57.2, DN25: 57.2, DN20: 57.2, DN15: 57.2 },
  DN50: { DN40: 60.3, DN32: 57.2, DN25: 50.8, DN20: 44.5 },
  DN65: { DN50: 69.9, DN40: 66.7, DN32: 63.5, DN25: 57.2 },
  DN80: { DN65: 82.6, DN50: 76.2, DN40: 73.0, DN32: 69.9 },
  DN100: { DN80: 98.4, DN65: 95.3, DN50: 88.9, DN40: 85.7 },
};
/**
 * 45° laterals and 90° true "Y"s, centre to end (mm), by the largest opening. ASME B16.9 does not cover laterals;
 * manufacturer-standard laterals follow the centre-to-face dimensions of ASME B16.5-2013, Table 9 ("Dimensions
 * of Class 150 Flanged Fittings", columns AA, EE, FF), and so do these:
 *   EE  long centre to end of a 45° lateral (the long run end and the branch end)
 *   FF  short centre to end of a 45° lateral, and the inlet of a true "Y"
 *   AA  centre to end of a tee / cross / the outlets of a true "Y"
 * The table starts at NPS 1 (DN25); NPS 1/2 and 3/4 laterals have no listed size (the geometric rule applies).
 * Reducing laterals / Ys take the dimensions of the largest opening (B16.5, para. 6.2.3).
 */
export const LATERAL_STD = {
  DN25: { AA: 89, EE: 146, FF: 44 }, DN32: { AA: 95, EE: 159, FF: 44 }, DN40: { AA: 102, EE: 178, FF: 51 }, DN50: { AA: 114, EE: 203, FF: 64 },
  DN65: { AA: 127, EE: 241, FF: 64 }, DN80: { AA: 140, EE: 254, FF: 76 }, DN100: { AA: 165, EE: 305, FF: 76 },
};
export const LATERAL_STD_SOURCE = 'ASME B16.5-2013 Table 9 (Class 150 flanged fittings: AA, EE, FF)';

/** Half-angle of a swaged tube reducer cone (degrees). */
export const TUBE_REDUCER_HALF_ANGLE = 15;

const dnOf = (f) => (PIPES[f.dn] ? f.dn : 'DN25');
const dnIndex = (dn) => PIPE_SIZES.indexOf(dn);

// ───────────────────────── points, chains, sections

const validPt = (p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
const cleanPts = (pts) => { const v = (pts ?? []).filter(validPt); return v.filter((p, i) => i === 0 || len(sub(p, v[i - 1])) > 1e-9); };

/** The points of a route: its own list, or the points of the 3D sketch / XYZ curve it follows (`path`). */
export function routePoints(f, features = []) {
  const src = f.path ? features.find((x) => x.id === f.path && Array.isArray(x.points)) : null;
  return cleanPts(src ? src.points : f.points ?? []);
}

/** The settings of a branch: the route's, with the branch's own size / colour / bend radius. */
export function chainSpec(f, b = null) {
  if (!b) return f;
  const out = { ...f };
  for (const k of ['dn', 'od', 'wall', 'diameter', 'color', 'bendRadius']) if (b[k] != null && b[k] !== '') out[k] = b[k];
  return out;
}

/** Outside / inside radius of a pipe or tube route. */
export function routeSection(f) {
  if (f.kind === 'pipe') { const p = PIPES[f.dn] ?? PIPES.DN25; return { ro: p.od / 2, ri: p.od / 2 - p.wall, od: p.od, wall: p.wall }; }
  if (f.kind === 'cable' || f.kind === 'harness') { const d = Math.max(0.1, Number(f.diameter) || 6); return { ro: d / 2, ri: 0, od: d, wall: d / 2 }; }
  const od = Math.max(0.1, Number(f.od) || 12); const wall = Math.min(od / 2 - 1e-3, Math.max(0.01, Number(f.wall) || 1));
  return { ro: od / 2, ri: od / 2 - wall, od, wall };
}

/** A key that is equal for runs of the same size. */
export function sizeKey(f) {
  if (f.kind === 'pipe') return dnOf(f);
  const s = routeSection(f);
  return f.kind === 'tube' ? `${s.od}x${s.wall}` : `${s.od}`;
}

/** The bend radius used: the elbow's for a pipe with elbows, the route's otherwise (never below the tube's radius). */
export function bendRadiusOf(f) {
  const { ro } = routeSection(f);
  if (f.kind === 'pipe' && f.fittings === 'elbows') return (PIPES[f.dn] ?? PIPES.DN25).elbow;
  return Math.max(ro * 1.0001, Number(f.bendRadius) || ro * 3);
}

/** The main run and the branches (each with its own settings); branches with fewer than two points are left out. */
export function routeChains(f, features = []) {
  const chains = [{ points: routePoints(f, features), spec: f, index: 0 }];
  (f.branches ?? []).forEach((b, i) => { const pts = cleanPts(b?.points); if (pts.length >= 2) chains.push({ points: pts, spec: chainSpec(f, b), index: i + 1 }); });
  return chains;
}

// ───────────────────────── the network

/**
 * The route as a graph: { chains, nodes: [{ id, p, edges }], edges: [{ id, a, b, chain, seg, spec, key, sec,
 * length, dir }], start (node of the first point), end (node of the main run's last point) }. Coincident points
 * are one node; a branch must start on the network (a point of an earlier run or inside one of its straights,
 * which is split there). `splitAt`: more points on the network to split at (clips, connectors). Loops throw.
 */
export function routeNetwork(f, features = [], { splitAt = [] } = {}) {
  const chains = routeChains(f, features);
  if (chains[0].points.length < 2) throw code('no-path');
  const splits = chains.map((c) => c.points.slice(1).map(() => []));
  const locate = (p, upto) => {
    for (let ci = 0; ci < upto; ci++) if (chains[ci].points.some((q) => len(sub(q, p)) < NODE_TOL)) return { at: 'point' };
    for (let ci = 0; ci < upto; ci++) {
      const pts = chains[ci].points;
      for (let s = 0; s < pts.length - 1; s++) {
        const ab = sub(pts[s + 1], pts[s]); const L2 = dot(ab, ab);
        const t = dot(sub(p, pts[s]), ab) / L2;
        if (t <= 0 || t >= 1) continue;
        if (len(sub(add(pts[s], mul(ab, t)), p)) < NODE_TOL) return { at: 'seg', ci, s, t };
      }
    }
    return null;
  };
  for (let ci = 1; ci < chains.length; ci++) {
    const hit = locate(chains[ci].points[0], ci);
    if (!hit) throw code('branch-not-attached', { index: chains[ci].index });
    if (hit.at === 'seg') splits[hit.ci][hit.s].push(hit.t);
  }
  for (const p of splitAt) {
    if (!validPt(p)) continue;
    const hit = locate(p, chains.length);
    if (!hit) throw code('point-off-route');
    if (hit.at === 'seg') splits[hit.ci][hit.s].push(hit.t);
  }
  const nodes = []; const edges = [];
  const nodeAt = (p) => { let i = nodes.findIndex((n) => len(sub(n.p, p)) < NODE_TOL); if (i < 0) { i = nodes.length; nodes.push({ id: i, p: p.slice(), edges: [] }); } return i; };
  chains.forEach((c, ci) => {
    const pts = c.points;
    for (let s = 0; s < pts.length - 1; s++) {
      const ts = [...new Set(splits[ci][s])].sort((x, y) => x - y);
      const seq = [pts[s], ...ts.map((t) => add(pts[s], mul(sub(pts[s + 1], pts[s]), t))), pts[s + 1]];
      for (let k = 0; k < seq.length - 1; k++) {
        const a = nodeAt(seq[k]); const b = nodeAt(seq[k + 1]);
        if (a === b) continue;
        const v = sub(nodes[b].p, nodes[a].p);
        const id = edges.length;
        edges.push({ id, a, b, chain: c.index, seg: s, spec: c.spec, key: sizeKey(c.spec), sec: routeSection(c.spec), length: len(v), dir: unit(v) });
        nodes[a].edges.push(id); nodes[b].edges.push(id);
      }
    }
  });
  // A tree: every extra edge closes a loop.
  const parent = nodes.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const e of edges) { const ra = find(e.a); const rb = find(e.b); if (ra === rb) throw code('route-loop'); parent[ra] = rb; }
  const main = chains[0].points;
  return { chains, nodes, edges, start: nodeAt(main[0]), end: nodeAt(main.at(-1)) };
}

/** Direction of edge `ei` going out of node `n`. */
export const outDir = (net, n, ei) => (net.edges[ei].a === n ? net.edges[ei].dir : neg(net.edges[ei].dir));
const otherEnd = (net, ei, n) => (net.edges[ei].a === n ? net.edges[ei].b : net.edges[ei].a);

/**
 * The elbow for a pipe corner turning `angle`° (ASME B16.9 long radius): { fitting: 'lr90' | 'lr45' | 'cut90' |
 * 'cut180', angle, R (arc radius), T (take-out: corner point to the fitting's end along each leg), stub (straight
 * tangent at each end) }. 45° elbows whose B is shorter than R·tan 22.5° get the radius that matches B.
 */
export function elbowFitting(dn, angle) {
  const p = PIPES[dn] ?? PIPES.DN25;
  const A = p.elbow; const th = rad(angle);
  if (Math.abs(angle - 90) < ELBOW_ANGLE_TOL) return { fitting: 'lr90', angle: 90, R: A, T: A * Math.tan(th / 2), stub: 0 };
  if (Math.abs(angle - 45) < ELBOW_ANGLE_TOL) {
    const B = ELBOW45_B[dn] ?? A * Math.tan(rad(22.5));
    const t = Math.tan(th / 2);
    const R = Math.min(A, B / t);
    return { fitting: 'lr45', angle: 45, R, T: B, stub: B - R * t };
  }
  return { fitting: angle < 90 ? 'cut90' : 'cut180', angle, R: A, T: A * Math.tan(th / 2), stub: 0 };
}

/** Length of a swaged tube reducer between two outside diameters. */
export const tubeReducerLength = (odL, odS) => Math.abs(odL - odS) / 2 / Math.tan(rad(TUBE_REDUCER_HALF_ANGLE));

/**
 * The B16.9 concentric reducers that take a pipe from `large` down to `small`: one when the table lists the pair,
 * else a chain (each step to the smallest listed small end that is not below `small`). [{ largeSize, smallSize,
 * H }]; throws 'no-standard-reducer' when no listed step gets there.
 */
export function reducerChain(large, small) {
  const out = [];
  let cur = large;
  while (cur !== small) {
    const opts = (REDUCER_SMALL[cur] ?? []).filter((s) => dnIndex(s) >= dnIndex(small));
    if (!opts.length || !REDUCER_H[cur]) throw code('no-standard-reducer', { large, small });
    const next = opts.reduce((m, s) => (dnIndex(s) < dnIndex(m) ? s : m), opts[0]);
    out.push({ largeSize: cur, smallSize: next, H: REDUCER_H[cur] });
    cur = next;
  }
  return out;
}

/**
 * The outlet of a B16.9 reducing tee / cross of run `run` for a branch of size `outlet`: { size (the fitting's
 * outlet), M (centre to outlet end), reducers (chain from the fitting's outlet down to the branch) }. A branch
 * smaller than the smallest listed outlet takes the smallest listed one and reducers after it.
 */
export function teeOutlet(run, outlet) {
  const C = PIPES[run].tee;
  if (outlet === run) return { size: run, M: C, reducers: [] };
  const listed = REDUCING_TEE_M[run] ?? {};
  if (listed[outlet] != null) return { size: outlet, M: listed[outlet], reducers: [] };
  const bigger = Object.keys(listed).filter((s) => dnIndex(s) > dnIndex(outlet));
  if (!bigger.length) throw code('no-standard-tee', { run, outlet });
  const size = bigger.reduce((m, s) => (dnIndex(s) < dnIndex(m) ? s : m), bigger[0]);
  return { size, M: listed[size], reducers: reducerChain(size, outlet) };
}

/** Reducers placed one after another from `start` along `dir` (their large end first). */
const placeChain = (chain, start, dir) => { let at = start; return chain.map((r) => { const out = { ...r, base: at, dir }; at = add(at, mul(dir, r.H)); return out; }); };
const chainLength = (chain) => chain.reduce((s, r) => s + r.H, 0);

/**
 * Take-outs of an angled branch (lateral) leaving a run of outside radius R at `alpha` (radians, to the run leg
 * it leans toward) with outside radius r: the branch clears the run's outside at s = (R + r·cos α)/sin α; the
 * opening in the run reaches x2 = (R + r·cos α)·cot α + r·sin α along the long leg and x1 = (R − r·cos α)·cot α
 * − r·sin α (the short side covers max(−x1, r·sin α)). A margin of one branch radius past each.
 * { long, short, branch, clear, x1, x2 }.
 */
export function lateralTakeouts(R, r, alpha) {
  const s = Math.sin(alpha); const c = Math.cos(alpha); const cot = c / s;
  const clear = (R + r * c) / s;
  const x2 = (R + r * c) * cot + r * s;
  const x1 = (R - r * c) * cot - r * s;
  return { long: x2 + r, short: Math.max(-x1, r * s) + r, branch: clear + r, clear, x1, x2 };
}

/**
 * Cut-back of a tube branch saddle-welded into a run at angle α (long point: the branch generator that meets
 * the run's outside nearest the junction). α = 90° gives √(R² − r²).
 */
export function saddleCutBack(R, r, alpha) {
  const s = Math.sin(alpha); const c = Math.cos(alpha);
  const f = (k) => (Math.sqrt(Math.max(0, R * R - r * r + r * r * k * k)) - r * k * c) / s;
  const k0 = s > 1e-12 && r > 0 ? (c * Math.sqrt(Math.max(0, R * R - r * r))) / (r * s) : 1;
  return Math.min(f(1), f(-1), ...(k0 >= -1 && k0 <= 1 ? [f(k0)] : []));
}

/** B16.9 long-radius 90° reducing elbows (large → listed small ends); centre to end = the large size's A. */
export const REDUCING_ELBOWS = { DN50: ['DN40', 'DN32', 'DN25'], DN65: ['DN50', 'DN40', 'DN32'], DN80: ['DN65', 'DN50', 'DN40', 'DN32'], DN100: ['DN80', 'DN65', 'DN50'] };

/**
 * A three-way junction without a straight run (a "Y"): the inlet is the leg whose way on lies between the other
 * two. Outlets 45° either side of it in one plane make a standard 90° true "Y" (LATERAL_STD: outlets AA, inlet FF,
 * by the largest opening); any other Y is fabricated: each leg ends where its outside clears the other legs'
 * outsides ((Rⱼ + r·cos γ)/sin γ, γ the angle between the legs) plus one radius, at least one diameter.
 */
function wyeJunction(J, inc, n) {
  const ang = (u, v) => Math.acos(clamp1(dot(u, v)));
  let inlet = -1;
  for (let i = 0; i < 3 && inlet < 0; i++) {
    const on = neg(inc[i].out);
    const others = inc.filter((_, k) => k !== i);
    const b = others.map((o) => ang(on, o.out));
    if (b.every((x) => deg(x) >= 15 - 1e-9 && deg(x) <= 75 + 1e-9)) inlet = i;
  }
  if (inlet < 0) throw code('tee-no-run', { index: n.id + 1 });
  const inl = inc[inlet]; const outs = inc.filter((_, k) => k !== inlet);
  const dns = inc.map((x) => dnOf(x.e.spec));
  const big = dns.reduce((m, d) => (dnIndex(d) > dnIndex(m) ? d : m), dns[0]);
  if (dnIndex(dnOf(inl.e.spec)) < Math.max(...outs.map((o) => dnIndex(dnOf(o.e.spec))))) throw code('tee-outlet-larger', { index: n.id + 1 });
  const on = neg(inl.out);
  const betas = outs.map((o) => deg(ang(on, o.out)));
  const planar = Math.abs(dot(cross(outs[0].out, outs[1].out), on)) < 1e-6;
  const sym = planar && betas.every((b) => Math.abs(b - 45) < ELBOW_ANGLE_TOL) && dot(outs[0].out, outs[1].out) < 1e-6;
  const legs = inc.map((x) => {
    const r = x.e.sec.ro;
    let L = 2 * r;
    for (const y of inc) {
      if (y === x) continue;
      const g = ang(x.out, y.out);
      if (Math.sin(g) < 1e-9) continue;
      L = Math.max(L, (y.e.sec.ro + r * Math.cos(g)) / Math.sin(g) + r);
    }
    return { ei: x.ei, dir: x.out, L, sec: x.e.sec, size: dnOf(x.e.spec) };
  });
  const std = sym ? LATERAL_STD[big] : null;
  if (std) for (const l of legs) l.L = l.ei === inl.ei ? std.FF : std.AA;
  J.kind = 'wye';
  J.fitting = { size: big, legs, inlet: inl.ei, betas, standard: std ? LATERAL_STD_SOURCE : null, trueY: Boolean(std) };
  for (const l of legs) J.trim.set(l.ei, l.L);
  return J;
}

/**
 * What happens at each node of the network: [{ node, kind: 'end' | 'inline' | 'bend' | 'elbow' | 'tee' |
 * 'cross' | 'lateral' | 'reducer' | 'saddle' | 'splice', trim: Map edge → take-out (the pipe of that edge starts
 * this far from the node), cut: Map edge → extra cut length (saddles), through: [e, e] (the run goes on through
 * the node), arc (bends: { r, theta, T }), fitting (elbows, branch fittings), reducers (placed concentric
 * reducers at the node: on a straight, on a tee / cross / lateral leg, after an elbow or bend), flange }].
 */
export function routeJunctions(net, f) {
  const kind = f.kind ?? 'pipe';
  const pipe = kind === 'pipe';
  const elbowsMode = pipe && f.fittings === 'elbows';
  const flangeAt = (n) => {
    if (!pipe) return false;
    const fl = f.flanges ?? 'none';
    return fl === 'both' || (fl === 'start' && n === net.start) || (fl === 'end' && n !== net.start);
  };
  const bigger = (a, b) => (pipe ? dnIndex(dnOf(a.e.spec)) >= dnIndex(dnOf(b.e.spec)) : a.e.sec.od >= b.e.sec.od);
  /** Reducers from size `fromSpec` down to the leg `x`, starting `start` from the node along it. */
  const legReducers = (fromSpec, x, start, n) => {
    if (pipe) return placeChain(reducerChain(dnOf(fromSpec), dnOf(x.e.spec)), add(n.p, mul(x.out, start)), x.out);
    const L = routeSection(fromSpec); const S = x.e.sec;
    if (Math.abs(L.od - S.od) < 1e-9) return [];
    return placeChain([{ largeSize: `Ø${L.od}`, smallSize: `Ø${S.od}`, H: tubeReducerLength(L.od, S.od), secL: L, secS: S }], add(n.p, mul(x.out, start)), x.out);
  };
  const out = net.nodes.map((n) => {
    const inc = n.edges.map((ei) => ({ ei, out: outDir(net, n.id, ei), e: net.edges[ei] }));
    const J = { node: n.id, kind: 'end', trim: new Map(), cut: new Map(), through: null, arc: null, fitting: null, reducers: [], flange: null };
    if (inc.length === 1) {
      if (flangeAt(n.id)) { const dn = dnOf(inc[0].e.spec); J.flange = { dn, H: PIPES[dn].flange.H }; J.trim.set(inc[0].ei, J.flange.H); }
      return J;
    }
    if (kind === 'cable') {
      if (inc.length === 2 && inc[0].e.key === inc[1].e.key && Math.PI - Math.acos(clamp1(dot(neg(inc[0].out), inc[1].out))) >= 1e-4) { J.kind = 'inline'; J.through = [inc[0].ei, inc[1].ei]; return J; }
      if (inc.length === 2 && Math.PI - Math.acos(clamp1(dot(neg(inc[0].out), inc[1].out))) < 1e-4) throw code('route-reversal', { index: n.id + 1 });
      J.kind = 'splice';
      return J;
    }
    if (inc.length === 2) {
      const [a, b] = inc;
      const theta = Math.acos(clamp1(dot(neg(a.out), b.out)));
      if (theta < 1e-6) {
        if (a.e.key === b.e.key) { J.kind = 'inline'; J.through = [a.ei, b.ei]; return J; }
        // A size change on a straight run: concentric reducer(s) centred on the node.
        const [L, S] = bigger(a, b) ? [a, b] : [b, a];
        const chain = pipe ? reducerChain(dnOf(L.e.spec), dnOf(S.e.spec)) : [{ largeSize: `Ø${L.e.sec.od}`, smallSize: `Ø${S.e.sec.od}`, H: tubeReducerLength(L.e.sec.od, S.e.sec.od), secL: L.e.sec, secS: S.e.sec }];
        const H = chainLength(chain);
        J.kind = 'reducer';
        J.reducers = placeChain(chain, add(n.p, mul(L.out, H / 2)), S.out);
        J.fitting = { large: L.ei, small: S.ei, H, largeSize: chain[0].largeSize, smallSize: chain.at(-1).smallSize };
        J.trim.set(L.ei, H / 2); J.trim.set(S.ei, H / 2);
        return J;
      }
      if (Math.PI - theta < 1e-4) throw code('route-reversal', { index: n.id + 1 });
      if (a.e.key !== b.e.key) {
        // A size change at a corner: a B16.9 reducing elbow when one is listed (90°, elbows), else an elbow or
        // bend of the larger size and reducers on the smaller leg.
        const [L, S] = bigger(a, b) ? [a, b] : [b, a];
        const d1 = neg(a.out); const d2 = b.out;
        const angle = deg(theta);
        if (elbowsMode && Math.abs(angle - 90) < ELBOW_ANGLE_TOL && (REDUCING_ELBOWS[dnOf(L.e.spec)] ?? []).includes(dnOf(S.e.spec))) {
          const A = PIPES[dnOf(L.e.spec)].elbow;
          J.kind = 'elbow';
          J.fitting = { fitting: 'lr90r', angle: 90, R: A, T: A * Math.tan(theta / 2), stub: 0, theta, dn: dnOf(L.e.spec), small: dnOf(S.e.spec), edges: [a.ei, b.ei], d1, d2, secA: a.e.sec, secB: b.e.sec };
          J.trim.set(a.ei, J.fitting.T); J.trim.set(b.ei, J.fitting.T);
          return J;
        }
        const el = elbowsMode ? elbowFitting(dnOf(L.e.spec), angle) : (() => { const r = bendRadiusOf(L.e.spec); return { fitting: 'bend', angle, R: r, T: r * Math.tan(theta / 2), stub: 0 }; })();
        J.kind = 'elbow';
        J.fitting = { ...el, theta, dn: pipe ? dnOf(L.e.spec) : null, edges: [a.ei, b.ei], d1, d2, secA: L.e.sec, secB: L.e.sec, reduced: true };
        J.reducers = legReducers(L.e.spec, S, el.T, n);
        J.trim.set(L.ei, el.T); J.trim.set(S.ei, el.T + chainLength(J.reducers));
        return J;
      }
      if (elbowsMode) {
        const el = elbowFitting(dnOf(a.e.spec), deg(theta));
        J.kind = 'elbow';
        J.fitting = { ...el, theta, dn: dnOf(a.e.spec), edges: [a.ei, b.ei], d1: neg(a.out), d2: b.out, secA: a.e.sec, secB: a.e.sec };
        J.trim.set(a.ei, el.T); J.trim.set(b.ei, el.T);
        return J;
      }
      const r = bendRadiusOf(a.e.spec);
      const T = r * Math.tan(theta / 2);
      J.kind = 'bend'; J.through = [a.ei, b.ei]; J.arc = { r, theta, T };
      J.trim.set(a.ei, T); J.trim.set(b.ei, T);
      return J;
    }
    if (inc.length > 4) throw code('junction-degree', { index: n.id + 1, count: inc.length });
    // Collinear pairs: the run (and, at a cross, the outlets).
    const pairs = [];
    for (let i = 0; i < inc.length; i++) for (let j = i + 1; j < inc.length; j++) if (dot(inc[i].out, inc[j].out) < -1 + 1e-6) pairs.push([i, j]);
    if (!pairs.length) {
      if (inc.length !== 3) throw code('tee-no-run', { index: n.id + 1 });
      return wyeJunction(J, inc, n);
    }
    if (inc.length === 4 && pairs.length < 2 && pipe) throw code('cross-angle', { index: n.id + 1 });
    // The run: the pair with the largest leg.
    const size = (x) => (pipe ? dnIndex(dnOf(x.e.spec)) : x.e.sec.od);
    const runPair = pairs.reduce((m, p) => (Math.max(size(inc[p[0]]), size(inc[p[1]])) > Math.max(size(inc[m[0]]), size(inc[m[1]])) ? p : m), pairs[0]);
    const [ri, rj] = runPair.map((k) => inc[k]);
    const outs = inc.filter((_, k) => !runPair.includes(k));
    const big = bigger(ri, rj) ? ri : rj;
    for (const o of outs) if (size(o) > size(big) + 1e-9) throw code('tee-outlet-larger', { index: n.id + 1 });
    // Angle of each outlet to the run leg it leans toward.
    const lean = (o) => { const ci = dot(o.out, ri.out); return ci >= 0 ? { toward: ri, alpha: Math.acos(clamp1(ci)) } : { toward: rj, alpha: Math.acos(clamp1(dot(o.out, rj.out))) }; };
    const square = (o) => Math.abs(dot(o.out, ri.out)) <= 1e-5;
    if (!pipe) {
      // Tubes: the run goes through; every branch is saddle-welded at its angle (15°–90°).
      if (ri.e.key !== rj.e.key) throw code('tube-tee-sizes', { index: n.id + 1 });
      const R = ri.e.sec.ro;
      J.kind = 'saddle'; J.through = [ri.ei, rj.ei];
      J.fitting = { run: [ri.ei, rj.ei], outlets: outs.map((o) => { const { alpha } = lean(o); if (deg(alpha) < 15 - 1e-9) throw code('tee-angle', { index: n.id + 1 }); return { ei: o.ei, alpha }; }), R, rb: Math.max(...outs.map((o) => o.e.sec.ro)), outlet: outs[0].ei };
      for (const o of outs) J.cut.set(o.ei, saddleCutBack(R, o.e.sec.ro, lean(o).alpha));
      return J;
    }
    const runDn = dnOf(big.e.spec);
    const C = PIPES[runDn].tee;
    if (inc.length === 4) {
      // A cross: both outlets square to the run, opposite each other; B16.9 reducing crosses share the tee's M.
      const [o1, o2] = outs;
      if (!square(o1) || !square(o2) || dot(o1.out, o2.out) > -1 + 1e-6) throw code('cross-angle', { index: n.id + 1 });
      const outDn = dnIndex(dnOf(o1.e.spec)) >= dnIndex(dnOf(o2.e.spec)) ? dnOf(o1.e.spec) : dnOf(o2.e.spec);
      const o = teeOutlet(runDn, outDn);
      J.kind = 'cross';
      J.fitting = { runSize: runDn, outletSize: o.size, C, M: o.M, reducing: o.size !== runDn, runDir: rj.out, outDir: o2.out, run: [ri.ei, rj.ei], outlets: [o1.ei, o2.ei] };
      for (const x of [ri, rj]) { const red = legReducers(big.e.spec, x, C, n); J.reducers.push(...red); J.trim.set(x.ei, C + chainLength(red)); }
      for (const x of [o1, o2]) { const red = placeChain(reducerChain(o.size, dnOf(x.e.spec)), add(n.p, mul(x.out, o.M)), x.out); J.reducers.push(...red); J.trim.set(x.ei, o.M + chainLength(red)); }
      return J;
    }
    const [ob] = outs;
    const { toward, alpha } = lean(ob);
    if (square(ob)) {
      const o = teeOutlet(runDn, dnOf(ob.e.spec));
      J.kind = 'tee';
      J.fitting = { run: [ri.ei, rj.ei], outlet: ob.ei, runSize: runDn, outletSize: o.size, C, M: o.M, reducing: o.size !== runDn, runDir: rj.out, outDir: ob.out };
      for (const x of [ri, rj]) { const red = legReducers(big.e.spec, x, C, n); J.reducers.push(...red); J.trim.set(x.ei, C + chainLength(red)); }
      const red = placeChain(o.reducers, add(n.p, mul(ob.out, o.M)), ob.out);
      J.reducers.push(...red); J.trim.set(ob.ei, o.M + chainLength(red));
      return J;
    }
    const a = deg(alpha);
    if (a < 15 - 1e-9 || a > 75 + 1e-9) throw code('tee-angle', { index: n.id + 1 });
    // A lateral: at 45° the standard dimensions (LATERAL_STD, by the run's size), at other angles fabricated with
    // take-outs from the geometry of the two pipes (lateralTakeouts).
    const secRun = routeSection({ kind: 'pipe', dn: runDn }); const secOut = ob.e.sec;
    const geo = lateralTakeouts(secRun.ro, secOut.ro, alpha);
    const std = Math.abs(a - 45) < ELBOW_ANGLE_TOL ? LATERAL_STD[runDn] : null;
    const t = std ? { ...geo, long: std.EE, short: std.FF, branch: std.EE, standard: LATERAL_STD_SOURCE } : { ...geo, standard: null };
    if (std && (t.branch < geo.clear || t.long < geo.x2 || t.short < Math.max(-geo.x1, secOut.ro * Math.sin(alpha)))) throw code('route-failed');
    const short = toward === ri ? rj : ri;
    J.kind = 'lateral';
    J.fitting = { runSize: runDn, outletSize: dnOf(ob.e.spec), angle: a, alpha, ...t, run: [ri.ei, rj.ei], outlet: ob.ei, longDir: toward.out, outDir: ob.out, secRun, secOut };
    for (const [x, L] of [[toward, t.long], [short, t.short]]) { const red = legReducers(big.e.spec, x, L, n); J.reducers.push(...red); J.trim.set(x.ei, L + chainLength(red)); }
    J.trim.set(ob.ei, t.branch);
    return J;
  });
  // Every straight must hold the take-outs at its two ends.
  for (const e of net.edges) {
    const ta = out[e.a].trim.get(e.id) ?? 0; const tb = out[e.b].trim.get(e.id) ?? 0;
    if (ta + tb > e.length + 1e-6) {
      const fl = (out[e.a].flange ? out[e.a].flange.H : 0) + (out[e.b].flange ? out[e.b].flange.H : 0);
      throw code(fl && ta + tb - fl <= e.length + 1e-6 ? 'route-end-short' : 'bend-too-large', { index: e.seg + 1, branch: e.chain });
    }
  }
  return out;
}

/**
 * The runs of the network: lengths of the same size that go on through bends / inline points (and saddles),
 * broken at ends, elbows, tees and reducers. [{ nodes, edges, spec, sec, key }] in the order of the edges.
 */
export function routeRuns(net, J) {
  const visited = new Set(); const runs = [];
  const through = (n, ei) => { const t = J[n]?.through; if (!t) return null; return ei === t[0] ? t[1] : ei === t[1] ? t[0] : null; };
  for (const e0 of net.edges) {
    if (visited.has(e0.id)) continue;
    let cur = e0.id; let node = e0.a; const back = new Set([cur]);
    for (;;) { const o = through(node, cur); if (o == null || back.has(o) || visited.has(o)) break; back.add(o); node = otherEnd(net, o, node); cur = o; }
    const nodes = [node]; const edges = [];
    for (;;) {
      edges.push(cur); visited.add(cur);
      node = otherEnd(net, cur, node); nodes.push(node);
      const o = through(node, cur);
      if (o == null || visited.has(o)) break;
      cur = o;
    }
    const e = net.edges[edges[0]];
    runs.push({ nodes, edges, spec: e.spec, sec: e.sec, key: e.key, chain: e.chain });
  }
  return runs;
}

/** The arc rounding the corner prev → p → next with radius r (its tangent points r·tan(θ/2) from p). */
export function cornerArc(prev, p, next, r, corner = null) {
  const d1 = unit(sub(p, prev)); const d2 = unit(sub(next, p));
  const theta = Math.acos(clamp1(dot(d1, d2)));
  const T = r * Math.tan(theta / 2);
  const a = sub(p, mul(d1, T)); const b = add(p, mul(d2, T));
  const bis = unit(sub(d2, d1));
  const centre = add(p, mul(bis, r / Math.cos(theta / 2)));
  const mid = add(centre, mul(unit(sub(p, centre)), r));
  return { type: 'arc', a, mid, b, centre, radius: r, angle: deg(theta), length: r * theta, corner };
}

/** The centre-line pieces of a run between its end take-outs (lines, and arcs at its bends). */
export function runPieces(net, J, run) {
  const P = run.nodes.map((n) => net.nodes[n].p);
  const pieces = [];
  for (let i = 0; i < run.edges.length; i++) {
    const ei = run.edges[i];
    const d = unit(sub(P[i + 1], P[i]));
    const s = J[run.nodes[i]].trim.get(ei) ?? 0;
    const t = J[run.nodes[i + 1]].trim.get(ei) ?? 0;
    const a = add(P[i], mul(d, s)); const b = sub(P[i + 1], mul(d, t));
    const l = len(sub(P[i + 1], P[i])) - s - t;
    if (l > 1e-9) pieces.push({ type: 'line', a, b, length: l, edge: ei });
    const arc = i < run.edges.length - 1 ? J[run.nodes[i + 1]].arc : null;
    if (arc) pieces.push(cornerArc(P[i], P[i + 1], P[i + 2], arc.r, run.nodes[i + 1]));
  }
  return pieces;
}

/** The centre line of an elbow: tangent stub, arc of radius R, stub (the stubs only on B16.9 45° elbows). */
export function elbowPieces(net, j) {
  const p = net.nodes[j.node].p;
  const { d1, d2, T, R } = j.fitting;
  const arc = cornerArc(sub(p, d1), p, add(p, d2), R, j.node);
  const pieces = [];
  const a0 = sub(p, mul(d1, T)); const b0 = add(p, mul(d2, T));
  if (len(sub(arc.a, a0)) > 1e-9) pieces.push({ type: 'line', a: a0, b: arc.a, length: len(sub(arc.a, a0)) });
  pieces.push(arc);
  if (len(sub(b0, arc.b)) > 1e-9) pieces.push({ type: 'line', a: arc.b, b: b0, length: len(sub(b0, arc.b)) });
  return pieces;
}

/** Centre-line length of the network: the straights with every bend / elbow corner rounded by its radius. */
export function networkLength(net, J) {
  let L = net.edges.reduce((s, e) => s + e.length, 0);
  for (const j of J) {
    const R = j.arc?.r ?? (j.kind === 'elbow' ? j.fitting.R : null);
    if (R == null) continue;
    const theta = j.arc?.theta ?? j.fitting.theta;
    L -= 2 * R * Math.tan(theta / 2) - R * theta;
  }
  return L;
}

/** The routed network in one go: { net, J, runs, length }. */
export function routeLayout(f, features = []) {
  const net = routeNetwork(f, features);
  const J = routeJunctions(net, f);
  const runs = routeRuns(net, J);
  return { net, J, runs, length: networkLength(net, J) };
}

// ───────────────────────── the old single-chain helpers (still used for checks)

/**
 * The centre line through `points` with arcs of `radius` at the corners: { pieces, length, bends }.
 * pieces: { type: 'line', a, b, length } and { type: 'arc', a, mid, b, centre, radius, angle (°), length,
 * corner (index of the point) } in order. Collinear corners need no arc; a corner whose arcs do not fit
 * between its neighbours throws 'bend-too-large', a U-turn 'route-reversal'.
 */
export function routePath(points, radius) {
  if (points.length < 2) throw code('no-path');
  const n = points.length;
  const corners = new Map();
  for (let i = 1; i < n - 1; i++) {
    const d1 = unit(sub(points[i], points[i - 1])); const d2 = unit(sub(points[i + 1], points[i]));
    const theta = Math.acos(clamp1(dot(d1, d2)));
    if (theta < 1e-7 || radius <= 0) continue;
    if (Math.PI - theta < 1e-4) throw code('route-reversal', { index: i + 1 });
    const arc = cornerArc(points[i - 1], points[i], points[i + 1], radius, i);
    corners.set(i, { T: radius * Math.tan(theta / 2), arc });
  }
  const pieces = [];
  let start = points[0];
  for (let i = 1; i < n; i++) {
    const c = corners.get(i);
    const end = c ? c.arc.a : points[i];
    const segLen = len(sub(points[i], points[i - 1]));
    const used = (corners.get(i - 1)?.T ?? 0) + (c?.T ?? 0);
    if (used > segLen + 1e-6) throw code('bend-too-large', { index: i });
    const l = len(sub(end, start));
    if (l > 1e-9) pieces.push({ type: 'line', a: start, b: end, length: l });
    if (c) { pieces.push(c.arc); start = c.arc.b; } else start = points[i];
  }
  const length = pieces.reduce((s, p) => s + p.length, 0);
  return { pieces, length, bends: pieces.filter((p) => p.type === 'arc') };
}

/** Length of the straight polyline through the points (a lower bound for a cable's spline). */
export const polylineLength = (pts) => pts.slice(1).reduce((s, p, i) => s + len(sub(p, pts[i])), 0);

/** Trims a centre line at its ends by `start` / `end` (the hub of a flange): only straight end pieces can be trimmed. */
export function trimEnds(pieces, start = 0, end = 0) {
  const out = pieces.map((p) => ({ ...p }));
  const trim = (p, atStart, by) => {
    if (!by) return;
    if (!p || p.type !== 'line' || p.length <= by + 1e-6) throw code('route-end-short');
    const dir = unit(sub(p.b, p.a));
    if (atStart) p.a = add(p.a, mul(dir, by)); else p.b = sub(p.b, mul(dir, by));
    p.length -= by;
  };
  trim(out[0], true, start);
  trim(out.at(-1), false, end);
  return out;
}

/** Rounds a length for the cut list (0.1 mm). */
const cut = (l) => Math.round(l * 10) / 10;

// ───────────────────────── bill of materials

/** The point lists of a cable's chains through the network (split points included), with their settings. */
function cableChains(net) {
  const out = new Map();
  for (const e of net.edges) {
    if (!out.has(e.chain)) out.set(e.chain, { chain: e.chain, spec: e.spec, sec: e.sec, points: [net.nodes[e.a].p] });
    out.get(e.chain).points.push(net.nodes[e.b].p);
  }
  return [...out.values()];
}

/**
 * The route's bill of materials: { kind, length (centre line, flanges included), rows: [{ item, size, qty,
 * length (each, mm) | null, angle }], bends, fittings: { elbows, tees, reducers, saddles }, notes }. Pipe /
 * tube: one row per run (cut length = developed length between the fittings' take-outs) in network order, then
 * bends, elbows (standard 90° / 45°, cut elbows with the elbow they are cut from), tees, reducers, flanges.
 * Cable: one row per chain (`measured`: the kernel's spline length — a number for one chain or a list).
 */
export function routeBom(f, features = [], { measured = null } = {}) {
  if (f.kind === 'cable') {
    const net = routeNetwork(f, features);
    const chains = cableChains(net);
    const m = Array.isArray(measured) ? measured : chains.length === 1 && measured != null ? [measured] : [];
    const rows = chains.map((c, i) => ({ item: 'cable', size: `Ø${c.sec.od}`, color: c.spec.color ?? '#d23c3c', qty: 1, length: cut(m[i] ?? polylineLength(c.points)), branch: c.chain }));
    const length = chains.reduce((s, c, i) => s + (m[i] ?? polylineLength(c.points)), 0);
    return { kind: 'cable', length, rows, bends: 0, fittings: { splices: chains.length - 1 }, notes: [] };
  }
  const { net, J, runs, length } = routeLayout(f, features);
  const rows = [];
  const notes = new Set();
  const sizeName = (spec) => (f.kind === 'pipe' ? dnOf(spec) : `Ø${routeSection(spec).od}×${routeSection(spec).wall}`);
  for (const run of runs) {
    const pieces = runPieces(net, J, run);
    const cutTrim = (J[run.nodes[0]].cut.get(run.edges[0]) ?? 0) + (J[run.nodes.at(-1)].cut.get(run.edges.at(-1)) ?? 0);
    rows.push({ item: f.kind, size: sizeName(run.spec), qty: 1, length: cut(pieces.reduce((s, p) => s + p.length, 0) - cutTrim), branch: run.chain });
  }
  const group = (key, make) => { const r = rows.find((x) => x.key === key); if (r) r.qty += 1; else rows.push({ ...make(), key, qty: 1 }); };
  const bendsAt = J.filter((j) => j.kind === 'bend' || (j.kind === 'elbow' && j.fitting.fitting === 'bend'));
  for (const j of bendsAt) { const r = j.arc?.r ?? j.fitting.R; group(`bend|${cut(r)}`, () => ({ item: 'bend', size: `R${cut(r)}`, length: null, angle: null })); }
  const bends = bendsAt;
  for (const j of J.filter((x) => x.kind === 'elbow' && x.fitting.fitting !== 'bend')) {
    const el = j.fitting;
    const angle = Math.round(el.angle * 10) / 10;
    if (el.fitting === 'lr90r') group(`relbow|${el.dn}|${el.small}`, () => ({ item: 'reducingElbow', size: `${el.dn}×${el.small}`, length: null, angle: 90 }));
    else if (el.fitting === 'lr90' || el.fitting === 'lr45') group(`elbow|${el.dn}|${angle}`, () => ({ item: 'elbow', size: el.dn, length: null, angle }));
    else { notes.add('cut-elbow'); group(`cut|${el.dn}|${angle}|${el.fitting}`, () => ({ item: 'elbowCut', size: el.dn, length: null, angle, from: el.fitting === 'cut90' ? 90 : 180 })); }
  }
  for (const j of J.filter((x) => x.kind === 'tee' || x.kind === 'cross')) {
    const t = j.fitting; const k = j.kind;
    if (t.reducing) group(`r${k}|${t.runSize}|${t.outletSize}`, () => ({ item: k === 'tee' ? 'reducingTee' : 'reducingCross', size: `${t.runSize}×${t.outletSize}`, length: null }));
    else group(`${k}|${t.runSize}`, () => ({ item: k, size: t.runSize, length: null }));
  }
  for (const j of J.filter((x) => x.kind === 'lateral')) {
    const t = j.fitting; const a = Math.round(t.angle * 10) / 10;
    if (!t.standard) notes.add('lateral');
    group(`lat|${t.runSize}|${t.outletSize}|${a}`, () => ({ item: 'lateral', size: t.outletSize === t.runSize ? t.runSize : `${t.runSize}×${t.outletSize}`, length: null, angle: a }));
  }
  for (const j of J.filter((x) => x.kind === 'wye')) {
    const w = j.fitting;
    if (!w.trueY) notes.add('wye');
    group(`wye|${w.size}|${w.trueY}|${w.betas.map((b) => Math.round(b * 10) / 10).join('/')}`, () => ({ item: w.trueY ? 'trueY' : 'wye', size: w.size, length: null, angle: Math.round((w.betas[0] + w.betas[1]) * 10) / 10 }));
  }
  const reducers = J.flatMap((x) => x.reducers ?? []);
  for (const r of reducers) group(`red|${r.largeSize}|${r.smallSize}`, () => ({ item: f.kind === 'pipe' ? 'reducer' : 'tubeReducer', size: `${r.largeSize}×${r.smallSize}`, length: f.kind === 'pipe' ? null : cut(r.H) }));
  const saddles = J.filter((x) => x.kind === 'saddle');
  for (const s of saddles) for (const o of s.fitting.outlets) { const rb = net.edges[o.ei].sec.ro; const a = Math.round(deg(o.alpha) * 10) / 10; group(`saddle|${cut(rb * 2)}|${cut(s.fitting.R * 2)}|${a}`, () => ({ item: 'saddle', size: `Ø${cut(rb * 2)}→Ø${cut(s.fitting.R * 2)}`, length: null, angle: a })); }
  for (const j of J.filter((x) => x.flange)) group(`flange|${j.flange.dn}`, () => ({ item: 'flange', size: `${j.flange.dn} PN16`, length: null }));
  for (const r of rows) delete r.key;
  const elbows = J.filter((x) => x.kind === 'elbow' && x.fitting.fitting !== 'bend').length;
  return {
    kind: f.kind, length, rows, bends: bends.length + elbows,
    fittings: { elbows, tees: J.filter((x) => x.kind === 'tee').length, crosses: J.filter((x) => x.kind === 'cross').length, laterals: J.filter((x) => x.kind === 'lateral').length, wyes: J.filter((x) => x.kind === 'wye').length, reducers: reducers.length, saddles: saddles.length },
    notes: [...notes],
  };
}

// ───────────────────────── kernel

const edgeOf = (p) => (p.type === 'line' ? rep().makeLine(p.a, p.b) : rep().makeThreePointArc(p.a, p.mid, p.b));

/** A round section of radius r swept along the pieces (solid). */
function sweepSolid(pieces, r) {
  const R = rep();
  const first = pieces[0];
  // The start tangent of the first edge (for an arc it is not the chord toward its middle).
  const tg = edgeOf(first).tangentAt(0);
  const t0 = unit([tg.x, tg.y, tg.z]);
  const spine = R.assembleWire(pieces.map(edgeOf));
  const profile = R.assembleWire([R.makeCircle(r, first.a, t0)]);
  return R.genericSweep(profile, spine, { frenet: true }, false);
}

/** A hollow (ri > 0) or solid round section swept along the pieces. */
function sweepSection(pieces, ro, ri) {
  const outer = sweepSolid(pieces, ro);
  return ri > 0 ? outer.cut(sweepSolid(pieces, ri)) : outer;
}

/** A solid cone frustum: radius r1 at `base`, r2 at base + dir·h (ruled loft between the two circles). */
export function frustum(r1, r2, h, base, dir) {
  const R = rep(); const oc = R.getOC();
  const d = unit(dir);
  const ts = new oc.BRepOffsetAPI_ThruSections(true, true, 1e-6);
  try {
    ts.AddWire(R.assembleWire([R.makeCircle(r1, base, d)]).wrapped);
    ts.AddWire(R.assembleWire([R.makeCircle(r2, add(base, mul(d, h)), d)]).wrapped);
    ts.Build(new oc.Message_ProgressRange());
    if (!ts.IsDone()) throw code('route-failed');
    return R.cast(ts.Shape());
  } finally { ts.delete(); }
}

/** A hollow concentric reducer: outside roL → roS, bore riL → riS over H from `base` (the large end) along `dir`. */
export function reducerSolid(roL, roS, riL, riS, H, base, dir) {
  const d = unit(dir); const delta = Math.max(0.5, H * 0.05);
  const k = (riS - riL) / H;
  const outer = frustum(roL, roS, H, base, d);
  return outer.cut(frustum(riL - k * delta, riS + k * delta, H + 2 * delta, sub(base, mul(d, delta)), d));
}

/** Volume of a hollow reducer (frustum minus frustum). */
export const reducerVolume = (roL, roS, riL, riS, H) => (Math.PI * H / 3) * (roL * roL + roL * roS + roS * roS - (riL * riL + riL * riS + riS * riS));

/**
 * A branch fitting at p: the run from p − runDir·back to p + runDir·ahead (section secRun) and branches
 * [{ dir, L, sec, from }] (from the node, or `from` behind it for a through outlet); hollow (outsides fused, then
 * the bores, a little longer than the open ends, cut away).
 */
export function branchFittingSolid(p, { runDir, back, ahead, secRun, branches }) {
  const R = rep();
  const delta = 1;
  const base = sub(p, mul(runDir, back));
  let outer = R.makeCylinder(secRun.ro, back + ahead, base, runDir);
  let inner = R.makeCylinder(secRun.ri, back + ahead + 2 * delta, sub(base, mul(runDir, delta)), runDir);
  for (const b of branches) {
    const from = b.from ?? 0;
    outer = outer.fuse(R.makeCylinder(b.sec.ro, b.L + from, sub(p, mul(b.dir, from)), b.dir));
    inner = inner.fuse(R.makeCylinder(b.sec.ri, b.L + from + delta + (from ? delta : 0), sub(p, mul(b.dir, from + (from ? delta : 0))), b.dir));
  }
  return outer.cut(inner);
}

/** A tee: run ±C along runDir, outlet M along outDir. */
function teeSolid(p, t, secRun, secOut) {
  return branchFittingSolid(p, { runDir: t.runDir, back: t.C, ahead: t.C, secRun, branches: [{ dir: t.outDir, L: t.M, sec: secOut }] });
}

/** A cross: run ±C, outlets ±M through the centre. */
function crossSolid(p, t, secRun, secOut) {
  return branchFittingSolid(p, { runDir: t.runDir, back: t.C, ahead: t.C, secRun, branches: [{ dir: t.outDir, L: t.M, from: t.M, sec: secOut }] });
}

/** A lateral: run from −short to +long (along the leg it leans to), the branch to its take-out. */
function lateralSolid(p, t) {
  return branchFittingSolid(p, { runDir: t.longDir, back: t.short, ahead: t.long, secRun: t.secRun, branches: [{ dir: t.outDir, L: t.branch, sec: t.secOut }] });
}

/**
 * A fabricated / standard Y: every leg a hollow cylinder from the node, each outside and bore carried back
 * through the node by its own radius so the bores meet in a ball round the junction.
 */
function wyeSolid(p, w) {
  const R = rep();
  const delta = 1;
  let outer = null; let inner = null;
  for (const l of w.legs) {
    const o = R.makeCylinder(l.sec.ro, l.L + l.sec.ro, sub(p, mul(l.dir, l.sec.ro)), l.dir);
    const i = R.makeCylinder(l.sec.ri, l.L + l.sec.ri + delta, sub(p, mul(l.dir, l.sec.ri)), l.dir);
    outer = outer ? outer.fuse(o) : o; inner = inner ? inner.fuse(i) : i;
  }
  return outer.cut(inner);
}

/**
 * A reducing elbow as the standard defines it: the circular section swept along the centre-line arc (radius R,
 * p − d1·T to p + d2·T) with its radius going linearly from secA to secB — a law-driven sweep (the kernel's pipe
 * shell with a linear homothety law), outside minus bore. Volume = R·θ·π·((a² + ab + b²) − (c² + cd + d²))/3.
 */
export function reducingElbowSolid(p, { d1, d2, R: radius, secA, secB }) {
  const Rk = rep(); const oc = Rk.getOC();
  const arc = cornerArc(sub(p, d1), p, add(p, d2), radius);
  const sweep = (r0, r1) => {
    const spine = Rk.assembleWire([Rk.makeThreePointArc(arc.a, arc.mid, arc.b)]);
    const profile = Rk.assembleWire([Rk.makeCircle(r0, arc.a, d1)]);
    const ps = new oc.BRepOffsetAPI_MakePipeShell(spine.wrapped);
    const law = new oc.Law_Linear();
    try {
      ps.SetMode(false);
      law.Set(0, 1, 1, r1 / r0);
      ps.SetLaw(profile.wrapped, law, false, false);
      ps.SetTolerance(1e-7, 1e-7, 1e-4);
      ps.Build(new oc.Message_ProgressRange());
      if (!ps.IsDone()) throw code('route-failed');
      ps.MakeSolid();
      return Rk.cast(ps.Shape());
    } finally { ps.delete(); }
  };
  return sweep(secA.ro, secB.ro).cut(sweep(secA.ri, secB.ri));
}

/** Exact volume of a reducing elbow (section radii linear along the arc). */
export const reducingElbowVolume = (R, theta, roA, roB, riA, riB) => R * theta * Math.PI * ((roA * roA + roA * roB + roB * roB) - (riA * riA + riA * riB + riB * riB)) / 3;

/** A part moved so that its +Z points along `dir`, then to `at`. */
export function orientZ(s, dir, at) {
  const z = [0, 0, 1];
  const axis = cross(z, dir);
  const c = clamp1(dot(z, dir));
  if (len(axis) > 1e-9) s = s.rotate(deg(Math.acos(c)), [0, 0, 0], unit(axis));
  else if (c < 0) s = s.rotate(180, [0, 0, 0], [1, 0, 0]);
  return s.translate(at);
}

/** A standard flange at a route end: its face at `at`, its hub toward `dir` (into the route). */
function placedFlange(dn, at, dir, stdShape) {
  return orientZ(stdShape({ kind: 'flange', dn }), dir, at);
}

/** The faces of a shape as their hashes (the mesh's faceGroups carry the same ids). */
const faceHashes = (s) => { try { return s.faces.map((x) => x.hashCode); } catch { return []; } };

/**
 * The route's solid and its data: { shape, length (centre line), measured (cable spline length; a list per
 * chain in `measuredChains`), pieces (centre line of the pipe runs and elbows), colors: [{ faces (hashes),
 * color }] (cables: their colour shown on the part), layout }. `stdShape` (stdparts.js) builds the flanges.
 */
export function routeSolid(f, features, stdShape) {
  const R = rep();
  if (f.kind === 'cable') {
    const net = routeNetwork(f, features);
    const solids = []; const measuredChains = []; const colors = [];
    for (const c of cableChains(net)) {
      const pts = c.points;
      const edge = pts.length === 2 ? R.makeLine(pts[0], pts[1]) : R.makeBSplineApproximation(pts, { tolerance: 1e-3, smoothing: null, degMax: 3, degMin: 2 });
      const spine = R.assembleWire([edge]);
      const t = edge.tangentAt(0); const st = edge.startPoint;
      const profile = R.assembleWire([R.makeCircle(c.sec.ro, [st.x, st.y, st.z], unit([t.x, t.y, t.z]))]);
      const s = R.genericSweep(profile, spine, { frenet: false }, false);
      solids.push(s);
      measuredChains.push(R.measureLength(edge));
      colors.push({ faces: faceHashes(s), color: c.spec.color ?? '#d23c3c' });
    }
    const shape = solids.length === 1 ? solids[0] : R.makeCompound(solids);
    const measured = measuredChains.reduce((s, x) => s + x, 0);
    return { shape, length: measured, measured: solids.length === 1 ? measured : measuredChains, measuredChains, pieces: [], colors };
  }
  const layout = routeLayout(f, features);
  const { net, J, runs } = layout;
  const solids = []; const allPieces = [];
  const saddles = J.some((j) => j.kind === 'saddle');
  const outers = []; const inners = [];
  for (const run of runs) {
    const pieces = runPieces(net, J, run);
    if (!pieces.length) continue;
    allPieces.push(...pieces);
    const { ro, ri } = run.sec;
    if (saddles) { outers.push(sweepSolid(pieces, ro)); inners.push(sweepSolid(pieces, ri)); continue; }
    try { solids.push(sweepSection(pieces, ro, ri)); } catch { for (const p of pieces) solids.push(sweepSection([p], ro, ri)); }
  }
  if (saddles && outers.length) {
    const fuse = (list) => list.slice(1).reduce((acc, s) => acc.fuse(s), list[0]);
    solids.push(fuse(outers).cut(fuse(inners)));
  }
  for (const j of J) {
    const p = net.nodes[j.node].p;
    if (j.kind === 'elbow') {
      const pieces = elbowPieces(net, j);
      allPieces.push(...pieces);
      if (j.fitting.fitting === 'lr90r') solids.push(reducingElbowSolid(p, j.fitting));
      else { const { ro, ri } = j.fitting.secA; solids.push(sweepSection(pieces, ro, ri)); }
    } else if (j.kind === 'tee' || j.kind === 'cross') {
      const t = j.fitting;
      const secRun = routeSection({ kind: 'pipe', dn: t.runSize }); const secOut = routeSection({ kind: 'pipe', dn: t.outletSize });
      solids.push(j.kind === 'tee' ? teeSolid(p, t, secRun, secOut) : crossSolid(p, t, secRun, secOut));
    } else if (j.kind === 'lateral') solids.push(lateralSolid(p, j.fitting));
    else if (j.kind === 'wye') solids.push(wyeSolid(p, j.fitting));
    for (const r of j.reducers ?? []) {
      const L = r.secL ?? routeSection({ kind: 'pipe', dn: r.largeSize }); const S = r.secS ?? routeSection({ kind: 'pipe', dn: r.smallSize });
      solids.push(reducerSolid(L.ro, S.ro, L.ri, S.ri, r.H, r.base, r.dir));
    }
    if (j.flange) {
      const ei = net.nodes[j.node].edges[0];
      solids.push(placedFlange(j.flange.dn, p, outDir(net, j.node, ei), stdShape));
    }
  }
  if (!solids.length) throw code('route-failed');
  const shape = solids.length === 1 ? solids[0] : R.makeCompound(solids);
  return { shape, length: layout.length, measured: null, pieces: allPieces, colors: [], layout };
}

/** Volume of a straight / bent hollow section by Pappus (for checks): π (ro² − ri²) · centre-line length. */
export const sectionVolume = (ro, ri, length) => Math.PI * (ro * ro - ri * ri) * length;

// ───────────────────────── picking route points on faces

/**
 * A picked point moved `distance` off a component's face along its outward normal. `placement` is the face's
 * part placed in the world ({ position, rotation } — for a part inside a sub-assembly the top component's
 * placement composed with the part's own in it), `normalAt(local)` the face's normal at a point of the part.
 */
export function faceOffsetPoint(point, placement, normalAt, distance) {
  if (!distance) return point.slice();
  const local = rotate(quatConjugate(placement.rotation), sub(point, placement.position));
  const nl = normalAt(local);
  const nw = unit(rotate(placement.rotation, Array.isArray(nl) ? nl : [nl.x, nl.y, nl.z]));
  return add(point, mul(nw, distance));
}

// ───────────────────────── colours on the part

/** Hex colour → [r, g, b] (0–1). */
export const hexRgb = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '')); const v = m ? parseInt(m[1], 16) : 0xa9b4c2; return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]; };

/**
 * Face id → colour of the route features of a rebuilt part (regenerate's results): cables in their colour,
 * harness bundles, connectors and clips in theirs. Null when the part has none.
 */
export function routeFaceColours(result) {
  const map = new Map();
  for (const r of result?.results?.values?.() ?? []) for (const c of r?.route?.colors ?? []) for (const h of c.faces) map.set(h, hexRgb(c.color));
  return map.size ? map : null;
}

/** sRGB → linear (vertex colours are taken as linear by the renderer, material colours are converted). */
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/**
 * Per-vertex colours of a mesh (faceGroups) from face colours; other faces get `rest` ([r, g, b]). With
 * `linear` the (sRGB) colours are turned linear for the renderer.
 */
export function routeVertexColours(mesh, map, rest, { linear = false } = {}) {
  const lin = (c) => (linear ? c.map(toLinear) : c);
  const out = new Float32Array(mesh.vertices.length);
  const base = lin(rest);
  for (let i = 0; i < out.length; i += 3) out.set(base, i);
  const T = mesh.triangles;
  for (const fg of mesh.faceGroups ?? []) {
    const c = map.get(fg.faceId);
    if (!c) continue;
    const v = lin(c);
    for (let k = fg.start; k < fg.start + fg.count; k++) out.set(v, 3 * T[k]);
  }
  return out;
}

/**
 * The vertex colours of a built part (app.js's build entry: { result, mesh }) when it has cables or harness
 * pieces, the rest in the part's colour `baseHex`; null otherwise. Cached on the entry.
 */
export function routeBodyColours(entry, baseHex) {
  if (!entry?.mesh || !entry.result) return null;
  if (entry.routeColours?.base === baseHex) return entry.routeColours.value;
  const map = routeFaceColours(entry.result);
  const value = map ? routeVertexColours(entry.mesh, map, hexRgb(baseHex), { linear: true }) : null;
  entry.routeColours = { base: baseHex, value };
  return value;
}

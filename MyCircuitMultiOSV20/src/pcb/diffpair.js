// Differential pairs: name matching, coupled routing and skew.
//
// findPairs(project)                         -> [{p, n, base}]
// routeDiffPair(project, netP, netN, opts)   -> {remove, add:{tracks, vias}, info} | {error}
// pairSkew(project, netP, netN, opts)        -> {lengthP, lengthN, skew, longer}
//
// routeDiffPair is pure. How it works:
//   1. Each net must have two pads on the layer (if more, the first ratsnest
//      airwire picks them). The pads are paired up into a start end and a far
//      end (the pairing with the shorter total distance).
//   2. A centre line is found by grid A* (8 directions, turn penalties, no
//      turns sharper than 90°) from the free grid node nearest the midpoint of
//      the two start pads to the one nearest the midpoint of the two end pads.
//      Obstacles (all pads, incl. the pair's own — the fan-outs bridge that
//      last bit) are inflated by clearance + gap/2 + width, so both tracks of
//      the pair fit wherever the centre line goes (opts.ignoreEndPads lets the
//      centre line start right between the pads).
//   3. The centre line (already 45°) is offset by ±(gap + width)/2 with miter
//      joins into two parallel polylines; P takes the side its start pad is on.
//   4. Each pad is joined to its line by a short fan-out (straight or one of
//      the two 45° doglegs). If that is not clear the line start is trimmed
//      back a little at a time. Every generated segment is verified exactly
//      against other-net copper, the partner net and the board edge.
//   Existing tracks/vias of both nets are replaced (listed in `remove`).

import { copperItems, clearanceFor, trackWidthFor, footprintPads, ratsnest } from "./board.js";
import { pointSegDist, pointInPolygon, polygonBounds, round, DEG } from "../core/geom.js";
import { route45 } from "./ops.js";
import {
  rulesOf, obstacleContext, segmentMargin, trackItem, polylineTracks, simplifyPolyline, polylineLength, netLength,
} from "./tuning.js";

const SQRT2 = Math.SQRT2;
const DX = [1, 1, 0, -1, -1, -1, 0, 1];
const DY = [0, 1, 1, 1, 0, -1, -1, -1];
const TURN = [0, 0.4, 1.6, Infinity, Infinity];
const EPS = 1e-6;
const SAFETY = 0.002;

// ---------------------------------------------------------------- naming
const PATTERNS = [
  [/^(.*)\+$/, (b) => `${b}-`],
  [/^(.*)_P$/i, (b, m) => `${b}_${m[0].slice(-1) === "p" ? "n" : "N"}`],
  [/^(.*)DP$/, (b) => `${b}DM`],
  [/^(.*)dp$/, (b) => `${b}dm`],
  [/^(.*[^_])P$/, (b) => `${b}N`],
  [/^(.*[^_])p$/, (b) => `${b}n`],
];

export function findPairs(project) {
  const pcb = project.pcb;
  const nets = new Set();
  for (const fp of pcb.footprints) for (const n of Object.values(fp.padNets || {})) if (n) nets.add(n);
  for (const t of pcb.tracks) if (t.net) nets.add(t.net);
  const used = new Set();
  const out = [];
  const sorted = [...nets].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  for (const [re, partner] of PATTERNS) {
    for (const net of sorted) {
      if (used.has(net)) continue;
      const m = net.match(re);
      if (!m || !m[1]) continue;
      const other = partner(m[1], m);
      if (other === net || !nets.has(other) || used.has(other)) continue;
      used.add(net); used.add(other);
      out.push({ p: net, n: other, base: m[1].replace(/[_-]$/, "") });
    }
  }
  return out;
}

export function pairSkew(project, netP, netN, opts = {}) {
  const lengthP = netLength(project, netP, opts).length;
  const lengthN = netLength(project, netN, opts).length;
  return { lengthP, lengthN, skew: round(Math.abs(lengthP - lengthN), 4), longer: lengthP > lengthN ? "P" : lengthN > lengthP ? "N" : null };
}

// ---------------------------------------------------------------- geometry helpers
function padDistFn(p) {
  const r = (p.rot || 0) * DEG;
  const c = Math.cos(r), s = Math.sin(r);
  if (p.shape === "circle") {
    const rad = Math.max(p.w, p.h) / 2;
    return (x, y) => Math.hypot(x - p.x, y - p.y) - rad;
  }
  const rr = p.shape === "oval" ? Math.min(p.w, p.h) / 2 : p.shape === "roundrect" ? Math.min(p.w, p.h) * 0.25 : 0;
  const hx = p.w / 2 - rr, hy = p.h / 2 - rr;
  return (x, y) => {
    const dx = x - p.x, dy = y - p.y;
    const lx = dx * c - dy * s;
    const ly = dx * s + dy * c;
    return Math.hypot(Math.max(Math.abs(lx) - hx, 0), Math.max(Math.abs(ly) - hy, 0)) - rr;
  };
}

function distFn(it) {
  if (it.kind === "pad") return padDistFn(it.pad);
  if (it.kind === "track") { const t = it.t; return (x, y) => pointSegDist(x, y, t.x1, t.y1, t.x2, t.y2) - t.w / 2; }
  const v = it.v;
  return (x, y) => Math.hypot(x - v.x, y - v.y) - v.d / 2;
}

const leftNormal = (a, b) => {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return [(b[1] - a[1]) / L, -(b[0] - a[0]) / L];
};

// Offset a polyline by d (positive = left of travel) with miter joins.
// Returns null when a segment would collapse or reverse.
export function offsetPolyline(pts, d) {
  const n = pts.length;
  const N = [];
  for (let i = 1; i < n; i++) N.push(leftNormal(pts[i - 1], pts[i]));
  const out = [];
  for (let i = 0; i < n; i++) {
    if (i === 0) out.push([pts[0][0] + N[0][0] * d, pts[0][1] + N[0][1] * d]);
    else if (i === n - 1) out.push([pts[i][0] + N[i - 1][0] * d, pts[i][1] + N[i - 1][1] * d]);
    else {
      const a = N[i - 1], b = N[i];
      const k = 1 + a[0] * b[0] + a[1] * b[1];
      if (k < 0.2) return null; // sharper than ~145°
      out.push([pts[i][0] + ((a[0] + b[0]) * d) / k, pts[i][1] + ((a[1] + b[1]) * d) / k]);
    }
  }
  for (let i = 1; i < n; i++) {
    const ux = pts[i][0] - pts[i - 1][0], uy = pts[i][1] - pts[i - 1][1];
    const vx = out[i][0] - out[i - 1][0], vy = out[i][1] - out[i - 1][1];
    if (ux * vx + uy * vy <= EPS || Math.hypot(vx, vy) < 1e-4) return null;
  }
  return out;
}

// Polyline starting `d` along from its first point (or ending `d` before its last).
function cutStart(pts, d) {
  if (d <= EPS) return pts.slice();
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (acc + L > d + EPS) {
      const f = (d - acc) / L;
      const p = [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f];
      return [p, ...pts.slice(i)];
    }
    acc += L;
  }
  return null;
}
const cutEnd = (pts, d) => { const r = cutStart(pts.slice().reverse(), d); return r && r.reverse(); };

function segsOf(pts, layer, w) {
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    if (Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) < 1e-9) continue;
    out.push({ x1: pts[i - 1][0], y1: pts[i - 1][1], x2: pts[i][0], y2: pts[i][1], w, layer });
  }
  return out;
}

// Fan-out candidates from pad centre q to line point x: straight, then 45° doglegs.
function fanCandidates(q, x) {
  const c = [[q, x]];
  for (const diag of [false, true]) {
    const r = route45(q[0], q[1], x[0], x[1], diag);
    if (r.length === 3) c.push(r);
  }
  return c;
}

// ---------------------------------------------------------------- pads of a net
function netPads(project, net, layer) {
  const pcb = project.pcb;
  const pads = pcb.footprints.flatMap((fp) => footprintPads(fp, pcb)).filter((p) => p.net === net && !p.npth && p.layers.includes(layer));
  if (pads.length === 2) return pads;
  if (pads.length < 2) return null;
  // More than two: take the pads at the ends of the first airwire.
  const rats = ratsnest(pcb).filter((r) => r.net === net);
  if (!rats.length) return pads.slice(0, 2);
  const near = (x, y) => pads.reduce((a, b) => (Math.hypot(b.x - x, b.y - y) < Math.hypot(a.x - x, a.y - y) ? b : a));
  const a = near(rats[0].x1, rats[0].y1), b = near(rats[0].x2, rats[0].y2);
  return a === b ? pads.slice(0, 2) : [a, b];
}

// ---------------------------------------------------------------- centre-line A*
function centreLine(project, ctx, o) {
  const { g, layer, R0, edgeNeed, start, end, padSkip, netP, netN } = o;
  const pcb = project.pcb;
  const b = polygonBounds(pcb.outline);
  const x0 = Math.floor(b.x1 / g) * g, y0 = Math.floor(b.y1 / g) * g;
  const NX = Math.ceil((b.x2 - x0) / g) + 1, NY = Math.ceil((b.y2 - y0) / g) + 1;
  const NN = NX * NY;
  const blocked = new Uint8Array(NN);
  const out = pcb.outline;
  // Quantisation margin: a diagonal step between two clear nodes can dip this
  // far towards a point obstacle.
  const s = (g * SQRT2) / 2;
  const margin = R0 - Math.sqrt(Math.max(0, R0 * R0 - s * s)) + 0.01;
  for (let j = 0; j < NY; j++) {
    const y = y0 + j * g;
    for (let i = 0; i < NX; i++) {
      const x = x0 + i * g;
      let d = Infinity;
      for (let a = 0, c = out.length - 1; a < out.length; c = a++) d = Math.min(d, pointSegDist(x, y, out[c][0], out[c][1], out[a][0], out[a][1]));
      if (!pointInPolygon(x, y, out) || d < edgeNeed + margin) blocked[j * NX + i] = 1;
    }
  }
  for (const it of ctx.items) {
    if (it.layers[0] !== "*" && !it.layers.includes(layer)) continue;
    if (it.kind === "pad" && padSkip && padSkip.has(it.id)) continue;
    if ((it.net === netP || it.net === netN) && it.kind !== "pad") continue;
    const cl = it.hole ? ctx.rules.clearance : Math.max(clearanceFor(ctx.rules, netP, it.net), clearanceFor(ctx.rules, netN, it.net));
    const R = cl + R0 + margin;
    const bb = it._bb;
    const dist = distFn(it);
    const i1 = Math.max(0, Math.ceil((bb.x1 - R - x0) / g)), i2 = Math.min(NX - 1, Math.floor((bb.x2 + R - x0) / g));
    const j1 = Math.max(0, Math.ceil((bb.y1 - R - y0) / g)), j2 = Math.min(NY - 1, Math.floor((bb.y2 + R - y0) / g));
    for (let j = j1; j <= j2; j++) for (let i = i1; i <= i2; i++) {
      const k = j * NX + i;
      if (!blocked[k] && dist(x0 + i * g, y0 + j * g) < R) blocked[k] = 1;
    }
  }
  const nearestFree = (p) => {
    const ci = Math.round((p[0] - x0) / g), cj = Math.round((p[1] - y0) / g);
    let best = -1, bd = Infinity;
    const rad = Math.ceil(3 / g);
    for (let r = 0; r <= rad && best < 0; r++) {
      for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
        if (i < 0 || j < 0 || i >= NX || j >= NY || blocked[j * NX + i]) continue;
        const d = Math.hypot(x0 + i * g - p[0], y0 + j * g - p[1]);
        if (d < bd) { bd = d; best = j * NX + i; }
      }
    }
    return best;
  };
  const sN = nearestFree(start), eN = nearestFree(end);
  if (sN < 0 || eN < 0) return null;
  // A* over (node, incoming direction) so turn costs are exact.
  const S = NN * 8;
  const gS = new Float32Array(S).fill(Infinity);
  const prev = new Int32Array(S).fill(-1);
  const closed = new Uint8Array(S);
  const ei = eN % NX, ej = (eN / NX) | 0;
  const heur = (i, j) => { const dx = Math.abs(i - ei), dy = Math.abs(j - ej); return dx > dy ? dx + (SQRT2 - 1) * dy : dy + (SQRT2 - 1) * dx; };
  const heap = new Heap();
  const si = sN % NX, sj = (sN / NX) | 0;
  for (let d = 0; d < 8; d++) { gS[sN * 8 + d] = 0; heap.push(heur(si, sj), sN * 8 + d); }
  let goal = -1, iter = 0;
  while (heap.size) {
    const st = heap.pop();
    if (closed[st]) continue;
    closed[st] = 1;
    const n = (st / 8) | 0, d0 = st - n * 8;
    if (n === eN) { goal = st; break; }
    if (++iter > 4e6) break;
    const i = n % NX, j = (n / NX) | 0;
    for (let d = 0; d < 8; d++) {
      const t = Math.abs(d - d0), turn = TURN[t > 4 ? 8 - t : t];
      if (!Number.isFinite(turn)) continue;
      const ni = i + DX[d], nj = j + DY[d];
      if (ni < 0 || nj < 0 || ni >= NX || nj >= NY) continue;
      const m = nj * NX + ni;
      if (blocked[m]) continue;
      const ms = m * 8 + d;
      if (closed[ms]) continue;
      const ng = gS[st] + (d & 1 ? SQRT2 : 1) + (n === sN ? 0 : turn);
      if (ng >= gS[ms]) continue;
      gS[ms] = ng; prev[ms] = st;
      heap.push(ng + heur(ni, nj), ms);
    }
  }
  if (goal < 0) return null;
  const path = [];
  for (let st = goal; st >= 0; st = prev[st]) {
    const n = (st / 8) | 0;
    path.push([round(x0 + (n % NX) * g, 5), round(y0 + ((n / NX) | 0) * g, 5)]);
  }
  path.reverse();
  return simplifyPolyline(path);
}

class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v, top = v[0], lk = k.pop(), lv = v.pop(), n = k.length;
    if (n) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}

// ---------------------------------------------------------------- routing
export function routeDiffPair(project, netP, netN, opts = {}) {
  const pcb = project.pcb;
  const rules = rulesOf(pcb);
  if (!netP || !netN || netP === netN) return { error: "Two different nets are needed" };
  const layer = opts.layer || "F.Cu";
  const w = opts.width ?? Math.max(trackWidthFor(rules, netP), trackWidthFor(rules, netN));
  const clPN = clearanceFor(rules, netP, netN);
  let gap = opts.gap ?? (rules.clearance ? round(rules.clearance * 1.5, 4) : 0.2);
  if (gap < clPN) gap = clPN;
  const off = (gap + w) / 2;

  const pp = netPads(project, netP, layer), pn = netPads(project, netN, layer);
  if (!pp) return { error: `Net ${netP} needs two pads on ${layer}` };
  if (!pn) return { error: `Net ${netN} needs two pads on ${layer}` };
  const D = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  let [pS, pE] = pp;
  let [nS, nE] = D(pp[0], pn[0]) + D(pp[1], pn[1]) <= D(pp[0], pn[1]) + D(pp[1], pn[0]) ? pn : [pn[1], pn[0]];
  const mid = (a, b) => [(a.x + b.x) / 2, (a.y + b.y) / 2];

  // Copper that stays: everything except the existing tracks/vias of the pair.
  const remove = [
    ...pcb.tracks.filter((t) => t.net === netP || t.net === netN).map((t) => t.id),
    ...pcb.vias.filter((v) => v.net === netP || v.net === netN).map((v) => v.id),
  ];
  const ctx = obstacleContext(project, { ignore: remove, items: copperItems(pcb).filter((it) => !remove.includes(it.id)) });
  const padId = (p) => `${p.fpId}#${p.index}`;
  const padSkip = new Set([pS, pE, nS, nE].map(padId));

  const grids = opts.grid ? [opts.grid] : [0.1, 0.2];
  let lastErr = "No path for the pair";
  for (const g of grids) {
    const C = centreLine(project, ctx, {
      g, layer, R0: gap / 2 + w, edgeNeed: rules.edgeClearance + gap / 2 + w,
      start: mid(pS, nS), end: mid(pE, nE), padSkip: opts.ignoreEndPads ? padSkip : null, netP, netN,
    });
    if (!C || C.length < 2) { lastErr = "No path for the pair (blocked)"; continue; }
    // P takes the side its start pad is on.
    const n0 = leftNormal(C[0], C[1]);
    let side = (pS.x - C[0][0]) * n0[0] + (pS.y - C[0][1]) * n0[1];
    if (Math.abs(side) < 1e-3) {
      const nl = leftNormal(C[C.length - 2], C[C.length - 1]);
      side = (pE.x - C[C.length - 1][0]) * nl[0] + (pE.y - C[C.length - 1][1]) * nl[1];
    }
    const sP = side >= 0 ? 1 : -1;
    const LP = offsetPolyline(C, sP * off), LN = offsetPolyline(C, -sP * off);
    if (!LP || !LN) { lastErr = "Centre line turns too tightly for the pair"; continue; }
    const res = attachFans(ctx, { LP, LN, pS, pE, nS, nE, netP, netN, layer, w });
    if (res.error) { lastErr = res.error; continue; }
    const tracksP = polylineTracks(res.P, { net: netP, layer, w });
    const tracksN = polylineTracks(res.N, { net: netN, layer, w });
    const lengthP = polylineLength(res.P), lengthN = polylineLength(res.N);
    return {
      remove,
      add: { tracks: [...tracksP, ...tracksN], vias: [] },
      info: {
        netP, netN, layer, width: w, gap, grid: g,
        lengthP: round(lengthP, 4), lengthN: round(lengthN, 4), skew: round(Math.abs(lengthP - lengthN), 4),
        centre: C, lineP: res.P, lineN: res.N, coupledP: res.coupledP, coupledN: res.coupledN,
      },
    };
  }
  return { error: lastErr };
}

// Choose trims and fan-outs at both ends so everything is clear.
function attachFans(ctx, o) {
  const { LP, LN, pS, pE, nS, nE, netP, netN, layer, w } = o;
  const lenP = polylineLength(LP), lenN = polylineLength(LN);
  const step = Math.max(w, 0.25);
  const trims = [];
  for (let t = 0; t <= Math.min(4, Math.min(lenP, lenN) / 2 - step); t += step) trims.push(t);
  if (!trims.length) trims.push(0);
  const clearSet = (segs, net, others) => {
    const extra = others.map((s, i) => trackItem({ ...s, id: `_o${i}`, net: net === netP ? netN : netP }));
    for (const s of segs) if (segmentMargin(ctx, s, net, extra).margin < SAFETY - EPS) return false;
    return true;
  };
  const q = (p) => [p.x, p.y];
  const halfP = cutEnd(LP, lenP / 2) || LP, halfN = cutEnd(LN, lenN / 2) || LN;
  // Phase 1: start fans against the first half of the lines.
  const startCands = [];
  for (const t of trims) {
    const lp = cutStart(halfP, t), ln = cutStart(halfN, t);
    if (!lp || !ln) continue;
    for (const fp of fanCandidates(q(pS), lp[0])) for (const fn of fanCandidates(q(nS), ln[0])) {
      const P = simplifyPolyline([...fp, ...lp.slice(1)]);
      const N = simplifyPolyline([...fn, ...ln.slice(1)]);
      const sp = segsOf(P, layer, w), sn = segsOf(N, layer, w);
      if (clearSet(sp, netP, sn) && clearSet(sn, netN, sp)) startCands.push({ t, fp, fn });
    }
    if (startCands.length >= 6) break;
  }
  if (!startCands.length) return { error: "Pair start pads cannot be reached cleanly" };
  // Phase 2: end fans with the start fixed; everything verified.
  for (const sc of startCands) {
    for (const t of trims) {
      const lp = cutEnd(cutStart(LP, sc.t), t), ln = cutEnd(cutStart(LN, sc.t), t);
      if (!lp || !ln || lp.length < 2 || ln.length < 2) continue;
      for (const fp of fanCandidates(q(pE), lp[lp.length - 1])) for (const fn of fanCandidates(q(nE), ln[ln.length - 1])) {
        const P = simplifyPolyline([...sc.fp, ...lp.slice(1, -1), ...fp.slice().reverse()]);
        const N = simplifyPolyline([...sc.fn, ...ln.slice(1, -1), ...fn.slice().reverse()]);
        const sp = segsOf(P, layer, w), sn = segsOf(N, layer, w);
        if (clearSet(sp, netP, sn) && clearSet(sn, netN, sp)) return { P, N, coupledP: lp, coupledN: ln };
      }
    }
  }
  return { error: "Pair end pads cannot be reached cleanly (do the nets swap sides?)" };
}

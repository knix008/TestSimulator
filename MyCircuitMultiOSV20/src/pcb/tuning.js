// Length tuning (KiCad "Tune length"): serpentine meanders, bus matching and
// skew reports. Also hosts the small clearance helpers that diffpair.js and
// shove.js share.
//
// netLength(project, net, opts)                -> {length, trackLength, viaLength, padInside, tracks, vias}
// tuneTrack(project, trackId, target, opts)    -> {remove, add:{tracks, vias}, info} | {error}
// matchLengths(project, nets, opts)            -> {remove, add:{tracks, vias}, info:{target, nets:[...]}}
// skewReport(project, nets, opts)              -> [{net, length, delta}]   (delta = length - longest, <= 0)
//
// Every function is pure: the project is never mutated. The editor applies
// {remove, add} as one undo step.
//
// Meander geometry
//   The chosen segment is rotated into its own frame (s along the segment from
//   (x1,y1), h perpendicular, +h = screen-left of the travel direction). Legs
//   sit at a pitch p = spacing + width. A "bump" is leg-up, top run of length p,
//   leg-down. One-sided styles ("left"/"right") leave a baseline run of p
//   between bumps; "both" alternates sides with no baseline run (a classic
//   serpentine). Each bump's amplitude is limited independently by clearance
//   to other-net copper and the board edge (binary search on the square bump,
//   which encloses the mitered/rounded shape), so a bump next to an obstacle
//   simply shrinks or disappears. The minimal number of bumps that can reach
//   the target is then scaled uniformly (binary search on the measured length
//   of the styled polyline) to land on the target length.

import { copperItems, itemDistance, itemBounds, clearanceFor, footprintPads } from "./board.js";
import { segSegDist, pointInPolygon, padPolygon, round, uid } from "../core/geom.js";
import { defaultRules } from "../core/project.js";

const EPS = 1e-6;
const SAFETY = 0.002; // extra clearance margin kept by generated copper (coordinate rounding)

// ---------------------------------------------------------------- shared helpers
export function rulesOf(pcb) {
  return { ...defaultRules(), ...(pcb.rules || {}) };
}

export function segLength(t) {
  return Math.hypot(t.x2 - t.x1, t.y2 - t.y1);
}

export function polylineLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

// NPTH holes are not copper items, but copper must keep clear of them.
function npthItems(pcb) {
  const out = [];
  for (const fp of pcb.footprints) {
    for (const p of footprintPads(fp, pcb)) {
      if (!p.npth || !p.drill) continue;
      const d = p.drill;
      out.push({ kind: "via", id: `${p.fpId}#${p.index}`, net: "", layers: ["*"], x: p.x, y: p.y, v: { x: p.x, y: p.y, d, drill: d }, hole: true });
    }
  }
  return out;
}

// Obstacle context for clearance queries: copper items (zones excluded — fills
// pull back on their own) plus NPTH holes; `ignore` is a set of item ids to skip
// (e.g. the track being replaced). Items get cached bounds.
export function obstacleContext(project, { ignore = [], items = null } = {}) {
  const pcb = project.pcb;
  const rules = rulesOf(pcb);
  const list = (items || copperItems(pcb)).filter((it) => it.kind !== "zone").concat(npthItems(pcb));
  for (const it of list) it._bb = itemBounds(it);
  let maxCl = rules.clearance;
  for (const nc of rules.netClasses || []) maxCl = Math.max(maxCl, nc.clearance || 0);
  return { pcb, rules, items: list, ignore: new Set(ignore), maxCl, outline: pcb.outline };
}

export function trackItem(t) {
  const it = { kind: "track", id: t.id, net: t.net || "", layers: [t.layer], t };
  it._bb = itemBounds(it);
  return it;
}

// Distance from a segment (with width) to the board edge minus edge clearance;
// -Infinity when an end lies outside the outline.
export function edgeMargin(ctx, seg) {
  const out = ctx.outline;
  if (!out || out.length < 3) return Infinity;
  if (!pointInPolygon(seg.x1, seg.y1, out) || !pointInPolygon(seg.x2, seg.y2, out)) return -Infinity;
  let d = Infinity;
  for (let i = 0, j = out.length - 1; i < out.length; j = i++) {
    d = Math.min(d, segSegDist(seg.x1, seg.y1, seg.x2, seg.y2, out[j][0], out[j][1], out[i][0], out[i][1]));
  }
  return d - seg.w / 2 - ctx.rules.edgeClearance;
}

// Worst clearance margin of a segment {x1,y1,x2,y2,w,layer} of `net` against
// other-net copper (ctx.items + extra items) and the board edge.
// Returns {margin, item} — item is the worst offender ("edge" for the outline).
export function segmentMargin(ctx, seg, net, extra = [], { edge = true } = {}) {
  const probe = { kind: "track", id: "_probe", net, layers: [seg.layer], t: seg };
  const h = seg.w / 2 + ctx.maxCl + 0.05;
  const x1 = Math.min(seg.x1, seg.x2) - h, x2 = Math.max(seg.x1, seg.x2) + h;
  const y1 = Math.min(seg.y1, seg.y2) - h, y2 = Math.max(seg.y1, seg.y2) + h;
  let worst = { margin: Infinity, item: null };
  const visit = (it) => {
    if (ctx.ignore.has(it.id)) return;
    if (it.layers[0] !== "*" && !it.layers.includes(seg.layer)) return;
    if (it.net && it.net === net) return;
    const b = it._bb || (it._bb = itemBounds(it));
    if (b.x1 > x2 || b.x2 < x1 || b.y1 > y2 || b.y2 < y1) return;
    const need = it.hole ? ctx.rules.clearance : clearanceFor(ctx.rules, net, it.net);
    const m = itemDistance(probe, it) - need;
    if (m < worst.margin) worst = { margin: m, item: it };
  };
  for (const it of ctx.items) visit(it);
  for (const it of extra) visit(it);
  if (edge) {
    const e = edgeMargin(ctx, seg);
    if (e < worst.margin) worst = { margin: e, item: "edge" };
  }
  return worst;
}

export function segmentClear(ctx, seg, net, extra = [], safety = SAFETY) {
  return segmentMargin(ctx, seg, net, extra).margin >= safety - EPS;
}

// Polyline -> track objects. The first and last points are used verbatim so the
// new copper lands exactly on the old connection points; inner points are
// rounded like every other editor operation.
export function polylineTracks(pts, { net, layer, w, base = {} }) {
  const out = [];
  const P = pts.map((p, i) => (i === 0 || i === pts.length - 1 ? [p[0], p[1]] : [round(p[0], 4), round(p[1], 4)]));
  for (let i = 1; i < P.length; i++) {
    const [ax, ay] = P[i - 1], [bx, by] = P[i];
    if (Math.abs(ax - bx) < 1e-9 && Math.abs(ay - by) < 1e-9) continue;
    out.push({ ...base, id: uid("t"), layer, net, w, x1: ax, y1: ay, x2: bx, y2: by });
  }
  return out;
}

// Drop duplicate points and merge collinear same-direction runs.
export function simplifyPolyline(pts) {
  const out = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.abs(last[0] - p[0]) < 1e-9 && Math.abs(last[1] - p[1]) < 1e-9) continue;
    if (out.length >= 2) {
      const a = out[out.length - 2];
      const ux = last[0] - a[0], uy = last[1] - a[1], vx = p[0] - last[0], vy = p[1] - last[1];
      const cross = ux * vy - uy * vx;
      if (Math.abs(cross) < 1e-9 * Math.max(1, Math.hypot(ux, uy) * Math.hypot(vx, vy)) && ux * vx + uy * vy > 0) {
        out[out.length - 1] = p;
        continue;
      }
    }
    out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------- net length
function padContains(pad, x, y) {
  return pointInPolygon(x, y, padPolygon(pad));
}

// Routed copper length of a net.
//   opts.viaLength: true -> each via adds the board thickness (or a number in mm per via)
//   opts.padToPad:  true -> track length hidden inside the net's pads is not counted
export function netLength(project, net, opts = {}) {
  const pcb = project.pcb;
  const tracks = pcb.tracks.filter((t) => t.net === net);
  const vias = pcb.vias.filter((v) => v.net === net);
  let trackLength = 0;
  for (const t of tracks) trackLength += segLength(t);
  let padInside = 0;
  if (opts.padToPad) {
    const pads = pcb.footprints.flatMap((fp) => footprintPads(fp, pcb)).filter((p) => p.net === net);
    for (const t of tracks) {
      const L = segLength(t);
      if (L < EPS) continue;
      for (const [ex, ey, ox, oy] of [[t.x1, t.y1, t.x2, t.y2], [t.x2, t.y2, t.x1, t.y1]]) {
        const pad = pads.find((p) => p.layers.includes(t.layer) && padContains(p, ex, ey));
        if (!pad) continue;
        padInside += exitDistance((x, y) => padContains(pad, x, y), ex, ey, ox, oy);
      }
    }
    padInside = Math.min(padInside, trackLength);
  }
  const per = opts.viaLength === true ? (pcb.thickness || 1.6) : typeof opts.viaLength === "number" ? opts.viaLength : 0;
  const viaLength = per * vias.length;
  return {
    length: round(trackLength - padInside + viaLength, 4),
    trackLength: round(trackLength, 4),
    viaLength: round(viaLength, 4),
    padInside: round(padInside, 4),
    tracks: tracks.length,
    vias: vias.length,
  };
}

// Distance from (ax,ay) towards (bx,by) until `inside` turns false (convex shapes).
function exitDistance(inside, ax, ay, bx, by) {
  const L = Math.hypot(bx - ax, by - ay);
  if (L < EPS) return 0;
  if (inside(bx, by)) return L;
  let lo = 0, hi = 1;
  for (let i = 0; i < 30; i++) {
    const m = (lo + hi) / 2;
    if (inside(ax + (bx - ax) * m, ay + (by - ay) * m)) lo = m; else hi = m;
  }
  return L * hi;
}

// ---------------------------------------------------------------- meander geometry
function bumpPositions(s0, s1, p, side) {
  const step = side === "both" ? p : 2 * p;
  const out = [];
  let k = 0;
  for (let x = s0; x + p <= s1 + EPS; x += step, k++) {
    const sign = side === "right" ? -1 : side === "both" ? (k % 2 ? -1 : 1) : 1;
    out.push({ x, sign });
  }
  return out;
}

// Square-wave vertices in the segment frame for bumps with amplitudes amps.
function squareVerts(L, bumps, amps, p) {
  const v = [[0, 0]];
  bumps.forEach((b, i) => {
    const a = amps[i] || 0;
    if (a <= EPS) return;
    const h = b.sign * a;
    v.push([b.x, 0], [b.x, h], [b.x + p, h], [b.x + p, 0]);
  });
  v.push([L, 0]);
  return simplifyPolyline(v);
}

// Mitered (45° chamfer) or rounded (arc) corners; r is the corner size.
function styleVerts(v, style, r, arcSegs = 4) {
  if (style === "square" || r <= EPS || v.length < 3) return v;
  const out = [v[0]];
  for (let i = 1; i < v.length - 1; i++) {
    const a = v[i - 1], b = v[i], c = v[i + 1];
    const d1 = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const d2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
    // Endpoints of the whole polyline may give their full length; inner
    // segments are shared with the next corner, so only half.
    const lim1 = i - 1 === 0 ? d1 : d1 / 2;
    const lim2 = i + 1 === v.length - 1 ? d2 : d2 / 2;
    const t = Math.min(r, lim1, lim2);
    const u1 = [(b[0] - a[0]) / d1, (b[1] - a[1]) / d1];
    const u2 = [(c[0] - b[0]) / d2, (c[1] - b[1]) / d2];
    const cross = u1[0] * u2[1] - u1[1] * u2[0];
    const dot = u1[0] * u2[0] + u1[1] * u2[1];
    if (Math.abs(cross) < 1e-9 || t <= EPS) { out.push(b); continue; }
    const T1 = [b[0] - u1[0] * t, b[1] - u1[1] * t];
    const T2 = [b[0] + u2[0] * t, b[1] + u2[1] * t];
    if (style === "mitered") { out.push(T1, T2); continue; }
    const theta = Math.atan2(cross, dot); // signed turn angle
    const R = t / Math.tan(Math.abs(theta) / 2);
    const nrm = cross > 0 ? [-u1[1], u1[0]] : [u1[1], -u1[0]];
    const C = [T1[0] + nrm[0] * R, T1[1] + nrm[1] * R];
    const a1 = Math.atan2(T1[1] - C[1], T1[0] - C[0]);
    const n = Math.max(2, Math.ceil((Math.abs(theta) / (Math.PI / 2)) * arcSegs));
    for (let k = 0; k <= n; k++) {
      const ang = a1 + (theta * k) / n;
      out.push([C[0] + R * Math.cos(ang), C[1] + R * Math.sin(ang)]);
    }
  }
  out.push(v[v.length - 1]);
  return simplifyPolyline(out);
}

function frameOf(t) {
  const L = segLength(t);
  const u = [(t.x2 - t.x1) / L, (t.y2 - t.y1) / L];
  const n = [u[1], -u[0]]; // screen-left of the travel direction (y grows down)
  const toWorld = ([s, h]) => [t.x1 + u[0] * s + n[0] * h, t.y1 + u[1] * s + n[1] * h];
  return { L, u, n, toWorld };
}

// Copper of the track's own net sitting on an end point -> how far into the
// segment the meander must keep away.
function endClearance(project, t, atStart) {
  const pcb = project.pcb;
  const [ex, ey, ox, oy] = atStart ? [t.x1, t.y1, t.x2, t.y2] : [t.x2, t.y2, t.x1, t.y1];
  let d = 0;
  for (const fp of pcb.footprints) {
    for (const p of footprintPads(fp, pcb)) {
      if (p.npth || !p.layers.includes(t.layer)) continue;
      if (Math.hypot(p.x - ex, p.y - ey) > Math.hypot(p.w, p.h)) continue;
      if (!padContains(p, ex, ey)) continue;
      d = Math.max(d, exitDistance((x, y) => padContains(p, x, y), ex, ey, ox, oy));
    }
  }
  for (const v of pcb.vias) {
    if (Math.hypot(v.x - ex, v.y - ey) <= v.d / 2) d = Math.max(d, exitDistance((x, y) => Math.hypot(x - v.x, y - v.y) <= v.d / 2, ex, ey, ox, oy));
  }
  return d;
}

// Plan a meander for one track. extraLen = how much longer the track must get.
function planMeander(project, t, extraLen, opts, ctx) {
  const rules = ctx.rules;
  const w = t.w;
  const cl = clearanceFor(rules, t.net, "");
  const spacing = opts.spacing ?? Math.max(cl * 2, 2 * w);
  const p = spacing + w;
  const style = opts.style === "mitered" || opts.style === "square" ? opts.style : "rounded";
  const side = ["left", "right", "both"].includes(opts.side) ? opts.side : "left";
  const corner = opts.radius ?? (style === "rounded" ? p / 2 : p / 3);
  const arcSegs = opts.arcSegments ?? 4;
  const tol = opts.tolerance ?? 0.05;
  const { L, toWorld } = frameOf(t);
  const endGap = Math.max(w, spacing / 2);
  const s0 = endClearance(project, t, true) + endGap;
  const s1 = L - endClearance(project, t, false) - endGap;
  const bumps = bumpPositions(s0, s1, p, side);
  if (!bumps.length) return { error: "Segment too short for a meander", bumps: 0 };
  const minAmp = opts.minAmplitude ?? Math.max(w, 0.1);
  const userAmp = opts.amplitude != null;
  const maxAuto = opts.maxAmplitude ?? 10 * w;
  const caps = userAmp ? [opts.amplitude] : [3 * w, 5 * w, maxAuto].filter((c, i, a) => i === 0 || c > a[i - 1]);

  const clearAt = (b, a) => {
    const h = b.sign * a;
    const sq = [[b.x, 0], [b.x, h], [b.x + p, h], [b.x + p, 0]].map(toWorld);
    for (let i = 1; i < sq.length; i++) {
      const seg = { x1: sq[i - 1][0], y1: sq[i - 1][1], x2: sq[i][0], y2: sq[i][1], w, layer: t.layer };
      if (!segmentClear(ctx, seg, t.net)) return false;
    }
    return true;
  };
  const maxAmpFor = (b, cap) => {
    if (clearAt(b, cap)) return cap;
    let lo = 0, hi = cap;
    for (let i = 0; i < 14; i++) {
      const m = (lo + hi) / 2;
      if (clearAt(b, m)) lo = m; else hi = m;
    }
    return lo >= minAmp ? lo : 0;
  };
  const lengthFor = (amps) => polylineLength(styleVerts(squareVerts(L, bumps, amps, p), style, corner, arcSegs));

  let best = null;
  for (const cap of caps) {
    const amax = bumps.map((b) => maxAmpFor(b, cap));
    const order = bumps.map((_, i) => i).filter((i) => amax[i] > 0);
    // Smallest prefix of usable bumps that can reach the target.
    let k = 0, full = null;
    for (k = 1; k <= order.length; k++) {
      const amps = bumps.map((_, i) => (order.indexOf(i) >= 0 && order.indexOf(i) < k ? amax[i] : 0));
      const extra = lengthFor(amps) - L;
      if (extra >= extraLen - EPS) { full = amps; break; }
    }
    if (!full) {
      const amps = amax.slice();
      const extra = lengthFor(amps) - L;
      if (!best || extra > best.extra) best = { amps, extra, cap, reached: false };
      continue;
    }
    // Scale the chosen bumps uniformly onto the target.
    let lo = 0, hi = 1;
    for (let i = 0; i < 40; i++) {
      const m = (lo + hi) / 2;
      const ex = lengthFor(full.map((a) => a * m)) - L;
      if (ex < extraLen) lo = m; else hi = m;
    }
    let f = hi;
    let amps = full.map((a) => a * f);
    // A bump scaled below the minimum amplitude would be a wiggle; fall back
    // to dropping the last bump and putting the rest at full size when close.
    if (amps.some((a) => a > 0 && a < minAmp * 0.5)) {
      const ex = lengthFor(full) - L;
      if (Math.abs(ex - extraLen) <= tol) amps = full;
    }
    best = { amps, extra: lengthFor(amps) - L, cap, reached: true };
    break;
  }
  const verts = styleVerts(squareVerts(L, bumps, best.amps, p), style, corner, arcSegs);
  const pts = verts.map(toWorld);
  pts[0] = [t.x1, t.y1];
  pts[pts.length - 1] = [t.x2, t.y2];
  return {
    pts, extra: best.extra, reached: best.reached, cap: best.cap,
    amplitudes: best.amps.filter((a) => a > 0).map((a) => round(a, 4)),
    bumps: best.amps.filter((a) => a > 0).length, spacing, pitch: p, style, side,
  };
}

// ---------------------------------------------------------------- public API
export function tuneTrack(project, trackId, targetLength, opts = {}) {
  const pcb = project.pcb;
  const t = pcb.tracks.find((x) => x.id === trackId);
  if (!t) return { error: `Track ${trackId} not found` };
  if (!t.net) return { error: "Track has no net" };
  if (segLength(t) < EPS) return { error: "Zero-length track" };
  const tol = opts.tolerance ?? 0.05;
  const lenOpts = { padToPad: opts.padToPad, viaLength: opts.viaLength };
  const before = netLength(project, t.net, lenOpts).length;
  const need = targetLength - before;
  const baseInfo = { net: t.net, trackId, before, target: targetLength, tolerance: tol };
  if (need < -tol) return { error: `Target ${round(targetLength, 3)} mm is shorter than the current length ${round(before, 3)} mm`, info: baseInfo };
  if (need <= tol) return { remove: [], add: { tracks: [], vias: [] }, info: { ...baseInfo, achieved: before, reached: true, bumps: 0, amplitudes: [] } };
  const ctx = opts._ctx || obstacleContext(project, { ignore: [t.id] });
  if (opts._ctx) ctx.ignore = new Set([t.id]);
  const plan = planMeander(project, t, need, opts, ctx);
  if (plan.error) return { error: plan.error, info: baseInfo };
  if (plan.bumps === 0) return { error: "No room for a meander next to this segment (clearance)", info: { ...baseInfo, achieved: before, reached: false } };
  const tracks = polylineTracks(plan.pts, { net: t.net, layer: t.layer, w: t.w, base: copyExtras(t) });
  const achieved = round(before - segLength(t) + polylineLength(plan.pts), 4);
  const reached = Math.abs(achieved - targetLength) <= tol;
  return {
    remove: [t.id],
    add: { tracks, vias: [] },
    info: {
      ...baseInfo, achieved, reached, short: reached ? 0 : round(targetLength - achieved, 4),
      bumps: plan.bumps, amplitude: plan.cap, amplitudes: plan.amplitudes,
      spacing: plan.spacing, style: plan.style, side: plan.side,
    },
  };
}

function copyExtras(t) {
  const { id, x1, y1, x2, y2, layer, net, w, ...rest } = t;
  void id; void x1; void y1; void x2; void y2; void layer; void net; void w;
  return rest;
}

// Tune a group of nets (a bus) to the longest one (or opts.target).
// Each net's longest straight segment is meandered; when it has no room the
// next longest is tried. Nets are tuned one after another on a scratch copy so
// later meanders keep clear of earlier ones.
export function matchLengths(project, nets, opts = {}) {
  const tol = opts.tolerance ?? 0.05;
  const lenOpts = { padToPad: opts.padToPad, viaLength: opts.viaLength };
  const work = { ...project, pcb: { ...project.pcb, tracks: project.pcb.tracks.slice() } };
  const lengths = nets.map((n) => netLength(project, n, lenOpts).length);
  const target = opts.target ?? Math.max(...lengths);
  const remove = [];
  const added = [];
  const perNet = [];
  nets.forEach((net, i) => {
    const before = lengths[i];
    if (before >= target - tol) { perNet.push({ net, before, after: before, reached: true, trackId: null }); return; }
    const cands = work.pcb.tracks.filter((t) => t.net === net && !added.includes(t)).sort((a, b) => segLength(b) - segLength(a));
    let res = null, lastErr = null, partial = null;
    for (const c of cands.slice(0, opts.maxCandidates ?? 4)) {
      const r = tuneTrack(work, c.id, target, opts);
      if (r.error) { lastErr = r.error; continue; }
      if (r.info.reached) { res = r; break; }
      if (!partial || r.info.achieved > partial.info.achieved) partial = r;
    }
    res = res || partial;
    if (!res) { perNet.push({ net, before, after: before, reached: false, trackId: null, error: lastErr || "No track to tune" }); return; }
    const gone = new Set(res.remove);
    work.pcb.tracks = work.pcb.tracks.filter((t) => !gone.has(t.id)).concat(res.add.tracks);
    for (const id of res.remove) remove.push(id);
    added.push(...res.add.tracks);
    perNet.push({ net, before, after: res.info.achieved, reached: res.info.reached, trackId: res.info.trackId, bumps: res.info.bumps, amplitudes: res.info.amplitudes });
  });
  return { remove, add: { tracks: added, vias: [] }, info: { target: round(target, 4), tolerance: tol, nets: perNet } };
}

export function skewReport(project, nets, opts = {}) {
  const rows = nets.map((net) => ({ net, length: netLength(project, net, opts).length }));
  const max = rows.length ? Math.max(...rows.map((r) => r.length)) : 0;
  return rows.map((r) => ({ ...r, delta: round(r.length - max, 4) }));
}

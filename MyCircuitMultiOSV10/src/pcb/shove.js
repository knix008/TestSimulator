// Simple push-and-shove for interactive routing.
//
// shoveForSegment(project, seg, net, opts)
//   -> {ok, moved:[{id, x1,y1,x2,y2}], added:[track], removed:[id], blockedBy?, reason?}
// shoveResult(project, seg, net, opts)
//   -> {ok, remove:[id], add:{tracks, vias}, update:[{id, patch:{x1,y1,x2,y2}}], blockedBy?, reason?}
//
// seg = {x1, y1, x2, y2, w, layer} is the segment the user is about to place
// for `net`. Other-net TRACK segments on the same layer that come closer than
// the clearance are pushed sideways (perpendicular to the pushing segment) by
// the smallest amount that clears them:
//   * the colliding segment moves in parallel;
//   * an end shared with exactly one non-parallel neighbour slides along that
//     neighbour (the neighbour just gets longer/shorter, keeping its angle);
//   * an end sitting on a pad or via (or shared with several / parallel
//     neighbours) stays put and a 45° jog is inserted next to it;
//   * moved copper that now hits other tracks pushes them in turn, up to
//     opts.maxDepth levels (default 2);
//   * pads, vias, NPTH holes, the router's own net and the board edge are
//     never moved — hitting them returns ok:false with blockedBy.
// Pure: the project is not modified.

import { allPads, clearanceFor } from "./board.js";
import { segSegDist, pointInPolygon, padPolygon, round, uid } from "../core/geom.js";
import { rulesOf, obstacleContext, segmentMargin, trackItem } from "./tuning.js";

const EPS = 1e-6;
const SAFETY = 0.002;
const JOIN = 1e-3;

const near = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by) <= JOIN;

function segDist(a, b) {
  return segSegDist(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1, b.x2, b.y2) - a.w / 2 - b.w / 2;
}

function lineIntersect(p, d, q, e) {
  // p + t d = q + s e
  const den = d[0] * e[1] - d[1] * e[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / den;
  return [p[0] + t * d[0], p[1] + t * d[1]];
}

function blocker(item, extra = {}) {
  if (item === "edge") return { kind: "edge", id: "outline", ...extra };
  if (!item) return null;
  if (item.kind === "pad") return { kind: "pad", id: item.id, fpId: item.pad.fpId, ref: item.pad.ref, num: item.pad.num, net: item.net, ...extra };
  if (item.hole) return { kind: "hole", id: item.id, ...extra };
  return { kind: item.kind, id: item.id, net: item.net, ...extra };
}

export function shoveForSegment(project, seg, net, opts = {}) {
  const pcb = project.pcb;
  const rules = rulesOf(pcb);
  const layer = seg.layer;
  const maxDepth = opts.maxDepth ?? 2;
  const maxPush = opts.maxPush ?? 5;
  const P0 = { x1: seg.x1, y1: seg.y1, x2: seg.x2, y2: seg.y2, w: seg.w ?? rules.trackWidth, layer, net };

  // Static copper: pads, vias, holes (+ tracks of the router's own net, which
  // we never push). Movable: other-net tracks on this layer.
  const ctxStatic = obstacleContext(project, { ignore: pcb.tracks.map((t) => t.id) });
  const pads = allPads(pcb).filter((p) => !p.npth && p.layers.includes(layer));
  const geo = new Map(); // id -> working copy of a movable track
  for (const t of pcb.tracks) if (t.layer === layer) geo.set(t.id, { ...t });
  const fixedOwn = [...geo.values()].filter((t) => t.net === net);
  const added = [];
  const touched = new Set(); // tracks pushed (not just slid) — never pushed twice
  const changed = new Set();
  const fail = (by, reason) => ({ ok: false, moved: [], added: [], removed: [], blockedBy: by, reason });

  // The new segment itself must clear everything that cannot move.
  {
    const m = segmentMargin(ctxStatic, P0, net);
    if (m.margin < -EPS) return fail(blocker(m.item), "Segment hits fixed copper or the board edge");
  }

  const anchoredAt = (x, y, tnet) => {
    for (const p of pads) {
      if (p.net !== tnet) continue;
      if (Math.abs(p.x - x) > Math.max(p.w, p.h) || Math.abs(p.y - y) > Math.max(p.w, p.h)) continue;
      if (pointInPolygon(x, y, padPolygon(p))) return true;
    }
    for (const v of pcb.vias) if (v.net === tnet && Math.hypot(v.x - x, v.y - y) <= v.d / 2) return true;
    return false;
  };
  const neighboursAt = (T, x, y) => [...geo.values()].filter((o) => o.id !== T.id && o.net === T.net && (near(o.x1, o.y1, x, y) || near(o.x2, o.y2, x, y)));

  // Geometry of T pushed by vector v. Returns {segs:[{ref, x1..}], ...} or null.
  function build(T, v) {
    const L = Math.hypot(T.x2 - T.x1, T.y2 - T.y1);
    if (L < EPS) return null;
    const uT = [(T.x2 - T.x1) / L, (T.y2 - T.y1) / L];
    const nT = [-uT[1], uT[0]];
    const out = { T: null, nbrs: [], jogs: [] };
    const ends = [];
    for (const atStart of [true, false]) {
      const E = atStart ? [T.x1, T.y1] : [T.x2, T.y2];
      const uIn = atStart ? uT : [-uT[0], -uT[1]];
      const shifted = [E[0] + v[0], E[1] + v[1]];
      const nb = neighboursAt(T, E[0], E[1]);
      const anchored = anchoredAt(E[0], E[1], T.net);
      let point = null;
      if (!anchored && nb.length === 0) point = shifted;
      else if (!anchored && nb.length === 1) {
        const N = nb[0];
        const sharedStart = near(N.x1, N.y1, E[0], E[1]);
        const F = sharedStart ? [N.x2, N.y2] : [N.x1, N.y1];
        const dN = [E[0] - F[0], E[1] - F[1]];
        const X = lineIntersect(shifted, uT, F, dN);
        if (X) {
          const along = ((X[0] - F[0]) * dN[0] + (X[1] - F[1]) * dN[1]) / Math.hypot(dN[0], dN[1]);
          if (along > 0.05) {
            point = X;
            out.nbrs.push({ id: N.id, w: N.w, net: N.net, ...(sharedStart ? { x1: X[0], y1: X[1], x2: F[0], y2: F[1] } : { x1: F[0], y1: F[1], x2: X[0], y2: X[1] }) });
          }
        }
      }
      if (!point) {
        // Jog: keep E, reach the shifted line at 45° towards T's interior.
        const vp = v[0] * nT[0] + v[1] * nT[1];
        const va = v[0] * uIn[0] + v[1] * uIn[1];
        const s = Math.abs(vp) - va;
        point = [E[0] + nT[0] * vp + uIn[0] * (va + s), E[1] + nT[1] * vp + uIn[1] * (va + s)];
        out.jogs.push({ x1: E[0], y1: E[1], x2: point[0], y2: point[1], w: T.w, net: T.net, atStart });
      }
      ends.push(point);
    }
    const [A, B] = ends;
    // The moved segment must keep its direction (jogs must not eat it up).
    if ((B[0] - A[0]) * uT[0] + (B[1] - A[1]) * uT[1] < 0.01) return null;
    out.T = { id: T.id, w: T.w, net: T.net, x1: A[0], y1: A[1], x2: B[0], y2: B[1] };
    return out;
  }

  const partsOf = (b) => [b.T, ...b.nbrs, ...b.jogs];
  const clearOf = (b, pusher) => {
    const need = clearanceFor(rules, pusher.net, b.T.net) + SAFETY;
    return partsOf(b).every((s) => segDist(s, pusher) >= need - EPS);
  };

  function pushTrack(T, pusher) {
    const L = Math.hypot(pusher.x2 - pusher.x1, pusher.y2 - pusher.y1);
    if (L < EPS) return null;
    const n = [-(pusher.y2 - pusher.y1) / L, (pusher.x2 - pusher.x1) / L];
    const side = (x, y) => (x - pusher.x1) * n[0] + (y - pusher.y1) * n[1];
    const s1 = side(T.x1, T.y1), s2 = side(T.x2, T.y2);
    const mid = (s1 + s2) / 2;
    const sides = Math.abs(mid) > 1e-6 ? [Math.sign(mid)] : [1, -1];
    if (s1 * s2 < 0) sides.push(-sides[0]);
    let best = null;
    for (const sg of sides) {
      const make = (d) => build(T, [n[0] * sg * d, n[1] * sg * d]);
      let lo = 0, hi = 0.02, b = null;
      while (hi <= maxPush) {
        b = make(hi);
        if (b && clearOf(b, pusher)) break;
        lo = hi; hi *= 2; b = null;
      }
      if (!b) continue;
      for (let i = 0; i < 30; i++) {
        const m = (lo + hi) / 2;
        const bm = make(m);
        if (bm && clearOf(bm, pusher)) { hi = m; b = bm; } else lo = m;
      }
      if (!best || hi < best.d) best = { d: hi, b };
    }
    return best;
  }

  const commit = (b) => {
    for (const s of [b.T, ...b.nbrs]) {
      const g = geo.get(s.id);
      g.x1 = round(s.x1, 4); g.y1 = round(s.y1, 4); g.x2 = round(s.x2, 4); g.y2 = round(s.y2, 4);
      changed.add(s.id);
    }
    const newOnes = [];
    for (const j of b.jogs) {
      const t = { id: uid("t"), layer, net: j.net, w: j.w, x1: j.x1, y1: j.y1, x2: round(j.x2, 4), y2: round(j.y2, 4) };
      geo.set(t.id, t);
      added.push(t);
      newOnes.push(t);
    }
    return [geo.get(b.T.id), ...b.nbrs.map((s) => geo.get(s.id)), ...newOnes];
  };

  // Resolve every collision of `pusher` with movable tracks.
  function resolve(pusher, depth, exclude) {
    for (let guard = 0; guard < 50; guard++) {
      const hit = [...geo.values()].find((t) => t.net !== pusher.net && t.net !== net && !exclude.has(t.id) &&
        segDist(t, pusher) < clearanceFor(rules, pusher.net, t.net) - EPS);
      if (!hit) return null;
      if (depth > maxDepth) return fail(blocker(trackItem(hit)), "Too many tracks to shove");
      if (touched.has(hit.id)) return fail(blocker(trackItem(hit)), "Track would be shoved twice");
      const r = pushTrack(hit, pusher);
      if (!r) return fail(blocker(trackItem(hit)), "Track cannot be pushed far enough");
      touched.add(hit.id);
      const moved = commit(r.b);
      for (const s of moved) {
        const sl = { ...s, layer };
        // Fixed copper / edge.
        const m = segmentMargin(ctxStatic, sl, s.net);
        if (m.margin < SAFETY - EPS) return fail(blocker(m.item, { pushed: hit.id }), "Shoved track would hit fixed copper or the board edge");
        // The router's own net and the new segment never move.
        for (const o of [P0, ...fixedOwn]) {
          if (segDist(sl, o) < clearanceFor(rules, s.net, net) - EPS) return fail(blocker(o === P0 ? { kind: "track", id: "_new", net } : trackItem(o), { pushed: hit.id }), "Shoved track would hit the routed net");
        }
      }
      // Then let the moved copper push further tracks.
      const ex = new Set([...exclude, ...moved.map((s) => s.id)]);
      for (const s of moved) {
        const f = resolve({ ...s, layer }, depth + 1, ex);
        if (f) return f;
      }
    }
    return fail(null, "Shove did not converge");
  }

  const f = resolve(P0, 1, new Set());
  if (f) return f;

  // Final verification of everything that changed against all other copper.
  const all = [...geo.values()];
  for (const id of [...changed, ...added.map((t) => t.id)]) {
    const s = geo.get(id);
    for (const o of [...all, P0]) {
      if (o.id === s.id || o.net === s.net) continue;
      if (segDist(s, o) < clearanceFor(rules, s.net, o.net) - EPS) return fail(blocker(o === P0 ? { kind: "track", id: "_new", net } : trackItem(o)), "Shove left a clearance violation");
    }
  }
  const removed = [];
  const moved = [];
  for (const id of changed) {
    const g = geo.get(id);
    if (Math.hypot(g.x2 - g.x1, g.y2 - g.y1) < 1e-4) { removed.push(id); continue; }
    moved.push({ id, x1: g.x1, y1: g.y1, x2: g.x2, y2: g.y2 });
  }
  return { ok: true, moved, added, removed };
}

export function shoveResult(project, seg, net, opts = {}) {
  const r = shoveForSegment(project, seg, net, opts);
  const out = { ok: r.ok, remove: [], add: { tracks: [], vias: [] }, update: [] };
  if (!r.ok) return { ...out, blockedBy: r.blockedBy, reason: r.reason };
  out.remove = r.removed.slice();
  out.update = r.moved.map((m) => ({ id: m.id, patch: { x1: m.x1, y1: m.y1, x2: m.x2, y2: m.y2 } }));
  out.add.tracks = r.added.slice();
  if (opts.includeSegment !== false) {
    const rules = rulesOf(project.pcb);
    out.add.tracks.unshift({ id: uid("t"), layer: seg.layer, net: net || "", w: seg.w ?? rules.trackWidth, x1: round(seg.x1, 4), y1: round(seg.y1, 4), x2: round(seg.x2, 4), y2: round(seg.y2, 4) });
  }
  return out;
}

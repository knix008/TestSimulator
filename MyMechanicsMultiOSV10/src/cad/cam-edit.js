// Toolpath editing: edits kept on an operation (op.edits) and laid over its generated moves every time the path is
// made again, so changing the operation's parameters keeps them.
//
// The moves are split into passes — a pass is the cutting run between two rapids (its first point is where the
// rapids left the tool) — and canned cycles. Then:
//   trim        each pass clipped to an XY window (keep inside or outside; a pass may split in two)
//   deleted     passes left out (by number, after trimming)
//   reversed    passes cut the other way round (climb ↔ conventional)
//   feeds       a feed factor for chosen passes
//   order       'nearest': the passes re-ordered so the next one starts nearest where the last ended
//   leadIn / leadOut   { type 'none' | 'arc' | 'line', radius, length, angle (degrees of arc) } added tangent to
//               each pass's first / last cutting segment (in its level plane), on the side away from the cut
//   linking     { mode 'clearance' | 'minimum' | 'stay', stayDown (mm) }: between passes the tool goes up to the
//               clearance plane, or only `retract` over the higher of the two ends, or — when the next pass starts
//               within `stayDown` at the same level — straight across at feed
// and the moves are made again: rapid down to the first approach, each pass with its leads, the links, and back up
// to the clearance plane. Canned cycles stay where they were in the order.
//
// Moves: { k: 'r' (rapid) | 'f' (feed, f mm/min) | 't' (thread) | 'cyc' (canned cycle) | 'dwell', p: [x, y, z] }.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len2 = (a) => Math.hypot(a[0], a[1]);
const same = (a, b, tol = 1e-9) => Math.abs(a[0] - b[0]) < tol && Math.abs(a[1] - b[1]) < tol && Math.abs(a[2] - b[2]) < tol;

/** The items of a path: passes { pts: [[x,y,z] …], f: [feed per segment], k: ['f' | 't' per segment] } and cycles { cycle: move }. */
export function passesOf(moves) {
  const items = []; let pos = null; let cur = null;
  for (const m of moves) {
    if (m.k === 'cyc') { cur = null; items.push({ cycle: m }); pos = [m.p[0], m.p[1], m.init]; continue; }
    if (m.k === 'dwell') { if (cur) cur.dwell = { at: cur.pts.length - 1, s: m.s }; else items.push({ dwell: m }); continue; }
    if (m.k === 'r') { cur = null; pos = [...m.p]; continue; }
    if (!cur) { cur = { pts: [pos ? [...pos] : [...m.p]], f: [], k: [] }; items.push(cur); }
    cur.pts.push([...m.p]); cur.f.push(m.f); cur.k.push(m.k);
    pos = [...m.p];
  }
  return items.filter((x) => !x.pts || x.pts.length > 1);
}

/** Liang–Barsky: the part of segment a→b inside the box, as parameters [t0, t1] or null. */
function clipSeg(a, b, box) {
  let t0 = 0, t1 = 1; const d = [b[0] - a[0], b[1] - a[1]];
  for (const [p, q] of [[-d[0], a[0] - box.x0], [d[0], box.x1 - a[0]], [-d[1], a[1] - box.y0], [d[1], box.y1 - a[1]]]) {
    if (Math.abs(p) < 1e-15) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return t1 - t0 > 1e-12 ? [t0, t1] : null;
}
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** A pass clipped to the window: the pieces kept (keep 'inside' or 'outside'). */
export function trimPass(pass, box, keep = 'inside') {
  const out = []; let cur = null;
  const push = (a, b, f, k) => {
    if (cur && same(cur.pts.at(-1), a)) { cur.pts.push(b); cur.f.push(f); cur.k.push(k); return; }
    cur = { pts: [a, b], f: [f], k: [k] }; out.push(cur);
  };
  for (let i = 1; i < pass.pts.length; i++) {
    const a = pass.pts[i - 1], b = pass.pts[i], f = pass.f[i - 1], k = pass.k[i - 1];
    const c = clipSeg(a, b, box);
    const spans = keep === 'inside' ? (c ? [c] : []) : (c ? [[0, c[0]], [c[1], 1]] : [[0, 1]]);
    for (const [t0, t1] of spans) if (t1 - t0 > 1e-12) push(lerp(a, b, t0), lerp(a, b, t1), f, k);
  }
  return out;
}

/** A pass the other way round. */
export function reversePass(p) {
  return { ...p, pts: p.pts.slice().reverse().map((x) => [...x]), f: p.f.slice().reverse(), k: p.k.slice().reverse(), dwell: undefined };
}

/** The unit XY direction of a pass's first (or last) segment that moves in XY, and that segment's z. */
function endDir(pts, last) {
  const n = pts.length;
  for (let i = 1; i < n; i++) {
    const a = last ? pts[n - 1 - i] : pts[i - 1], b = last ? pts[n - i] : pts[i];
    const d = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(...d);
    if (l > 1e-9) return [d[0] / l, d[1] / l];
  }
  return null;
}

/**
 * The lead points (excluding the pass end itself) of a lead-in (into p0 along d) or a lead-out (from p0 along d):
 * an arc of `angle` degrees and `radius` turning onto / off the cut tangentially, or a straight line of `length`.
 * `side` +1 puts the arc's centre left of the direction, −1 right.
 */
export function leadPoints(p0, d, lead, out, side = 1) {
  if (!lead || lead.type === 'none' || !d) return [];
  if (lead.type === 'line') {
    const L = Math.max(0, Number(lead.length) || 0); if (!(L > 0)) return [];
    return [[p0[0] + (out ? 1 : -1) * d[0] * L, p0[1] + (out ? 1 : -1) * d[1] * L, p0[2]]];
  }
  const r = Math.max(0, Number(lead.radius) || 0), th = ((Number(lead.angle) || 90) * Math.PI) / 180;
  if (!(r > 0)) return [];
  const n = [-d[1] * side, d[0] * side];             // towards the centre
  const c = [p0[0] + n[0] * r, p0[1] + n[1] * r];
  const a0 = Math.atan2(p0[1] - c[1], p0[0] - c[0]);
  // Moving along d at p0 turns the angle about c by +side (counter-clockwise when the centre is on the left).
  const steps = Math.max(2, Math.ceil(th / (Math.PI / 16)));
  const pts = [];
  for (let i = steps; i >= 1; i--) {
    const a = a0 + (out ? 1 : -1) * side * (th * i) / steps;
    pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a), p0[2]]);
  }
  return out ? pts.reverse() : pts;
}

/** The first point from which the pass moves in XY (−1 for none), and the last point reached by an XY move. */
function firstXY(pts) { for (let i = 1; i < pts.length; i++) if (Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) > 1e-9) return i - 1; return -1; }
function lastXY(pts) { for (let i = pts.length - 1; i > 0; i--) if (Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) > 1e-9) return i; return -1; }

/** The passes in the order nearest-next (the first kept first). */
function nearestOrder(passes) {
  if (passes.length < 3) return passes;
  const left = passes.slice(1), out = [passes[0]];
  while (left.length) {
    const end = out.at(-1).pts.at(-1);
    let best = 0, bd = Infinity;
    left.forEach((p, i) => { const d = Math.hypot(...sub(p.pts[0], end)); if (d < bd) { bd = d; best = i; } });
    out.push(left.splice(best, 1)[0]);
  }
  return out;
}

/** Moves of a path with its edits laid over. ctx: { clearance, retract }. */
export function editMoves(moves, edits, ctx) {
  if (!edits || !moves.length) return moves;
  const items = passesOf(moves);
  // Trim, number, delete, reverse, scale feeds.
  let n = 0; const list = [];
  for (const it of items) {
    if (!it.pts) { list.push(it); continue; }
    const pieces = edits.trim ? trimPass(it, edits.trim, edits.trim.keep ?? 'inside') : [it];
    for (const p of pieces) {
      const i = n++;
      if ((edits.deleted ?? []).includes(i)) continue;
      let q = (edits.reversed ?? []).includes(i) || edits.reverseAll ? reversePass(p) : p;
      const factor = edits.feeds?.[i] ?? edits.feedAll ?? 1;
      if (factor !== 1) q = { ...q, f: q.f.map((x) => (x == null ? x : Math.round(x * factor * 1000) / 1000)) };
      q.index = i;
      list.push(q);
    }
  }
  // Order: passes between cycles re-ordered nearest-next.
  let ordered = list;
  if (edits.order === 'nearest') {
    ordered = []; let run = [];
    for (const it of list) { if (it.pts) run.push(it); else { ordered.push(...nearestOrder(run), it); run = []; } }
    ordered.push(...nearestOrder(run));
  }
  // Re-link.
  const clear = ctx.clearance, up = ctx.retract ?? 2;
  const link = edits.linking ?? { mode: 'clearance' };
  const out = []; let pos = null;
  const rapid = (p) => { if (!pos || !same(pos, p)) { out.push({ k: 'r', p: [...p] }); pos = [...p]; } };
  const feed = (p, f, k = 'f') => { if (!pos || !same(pos, p)) { out.push({ k, p: [...p], f }); pos = [...p]; } };
  for (const it of ordered) {
    if (it.cycle) { if (pos) rapid([pos[0], pos[1], Math.max(pos[2], it.cycle.init)]); out.push(it.cycle); pos = [it.cycle.p[0], it.cycle.p[1], it.cycle.init]; continue; }
    if (it.dwell) { out.push(it.dwell); continue; }
    // Where cutting in XY starts and ends (a pass may begin with a plunge or ramp from its approach point).
    const jIn = firstXY(it.pts), jOut = lastXY(it.pts);
    const side = edits.leadSide === 'right' ? -1 : 1;
    const dIn = endDir(it.pts, false), dOut = endDir(it.pts, true);
    const inPts = jIn >= 0 ? leadPoints(it.pts[jIn], dIn, edits.leadIn, false, side) : [];
    const outPts = jOut >= 0 ? leadPoints(it.pts[jOut], dOut, edits.leadOut, true, side) : [];
    const f0 = it.f.find((x) => x != null) ?? null;
    // The cut begins at the lead's start (then the pass from jIn), else at the pass's own first point.
    const body = inPts.length ? it.pts.slice(jIn) : it.pts;
    const fb = inPts.length ? it.f.slice(jIn) : it.f; const kb = inPts.length ? it.k.slice(jIn) : it.k;
    const end = outPts.length ? jOut - (inPts.length ? jIn : 0) : body.length - 1;
    const cutStart = inPts.length ? inPts[0] : body[0];
    const safeZ = it.pts[0][2];
    const stayTarget = inPts.length ? inPts[0] : jIn >= 0 ? it.pts[jIn] : body[0];
    let entered = false;
    if (pos) {
      const sameLevel = Math.abs(pos[2] - stayTarget[2]) < 1e-6, far = Math.hypot(stayTarget[0] - pos[0], stayTarget[1] - pos[1]);
      if (link.mode === 'stay' && sameLevel && far <= (Number(link.stayDown) || 0)) {
        feed(stayTarget, f0); entered = true;
        // Carry on from the stay target: the lead (if any) or the pass from its first XY point.
        if (inPts.length) { for (const p of inPts.slice(1)) feed(p, f0); }
        const from = inPts.length ? 0 : jIn;
        for (let i = from; i <= end; i++) if (i > from) feed(body[i], fb[i - 1], kb[i - 1] ?? 'f');
      } else {
        const z = link.mode === 'minimum' ? Math.max(pos[2], safeZ) + (pos[2] < safeZ ? 0 : up) : clear;
        rapid([pos[0], pos[1], Math.max(z, pos[2])]); rapid([cutStart[0], cutStart[1], Math.max(z, pos[2])]);
      }
    }
    if (!entered) {
      if (!pos) rapid([cutStart[0], cutStart[1], clear]);
      if (inPts.length) { rapid([cutStart[0], cutStart[1], safeZ]); feed(cutStart, f0); for (const p of inPts.slice(1)) feed(p, f0); }
      // A pass that begins cutting at once (trimmed, reversed): down from just above it at the plunge feed.
      else if (jIn === 0 && !(edits.leadIn && edits.leadIn.type !== 'none')) { rapid([body[0][0], body[0][1], body[0][2] + up]); feed(body[0], f0); }
      else rapid(body[0]);
      body.forEach((p, i) => { if (i > 0 && i <= end) feed(p, fb[i - 1], kb[i - 1] ?? 'f'); if (it.dwell && it.dwell.at === i + (inPts.length ? jIn : 0)) out.push({ k: 'dwell', p: [...p], s: it.dwell.s }); });
    }
    const fl = [...it.f].reverse().find((x) => x != null) ?? f0;
    for (const p of outPts) feed(p, fl);
  }
  if (pos) rapid([pos[0], pos[1], clear]);
  return out;
}

/** A path's passes for the editor: [{ index, from, to (points), length, z, feed }] after trim (before deletes). */
export function passList(moves, edits = null) {
  const items = passesOf(moves); const out = []; let n = 0;
  for (const it of items) {
    if (!it.pts) continue;
    const pieces = edits?.trim ? trimPass(it, edits.trim, edits.trim.keep ?? 'inside') : [it];
    for (const p of pieces) {
      let L = 0; for (let i = 1; i < p.pts.length; i++) L += Math.hypot(...sub(p.pts[i], p.pts[i - 1]));
      out.push({ index: n++, from: p.pts[0], to: p.pts.at(-1), length: L, z: Math.min(...p.pts.map((q) => q[2])), feed: p.f.find((x) => x != null) ?? null });
    }
  }
  return out;
}

export const cutLength = (moves) => { let L = 0; let pos = null; for (const m of moves) { if (m.p && pos && (m.k === 'f' || m.k === 't')) L += Math.hypot(...sub(m.p, pos)); if (m.p) pos = m.p; } return L; };
export const rapidLength = (moves) => { let L = 0; let pos = null; for (const m of moves) { if (m.p && pos && m.k === 'r') L += Math.hypot(...sub(m.p, pos)); if (m.p) pos = m.p; } return L; };

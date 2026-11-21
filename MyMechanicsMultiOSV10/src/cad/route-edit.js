// Edits of a route's tables from the PropertyManager (no DOM): branch points and sizes, harness connectors,
// clips and wires. Field keys:
//   pt3:i:j        main point i, coordinate j (connectors, clips and branches attached there move with it)
//   rbp:i:k:j      branch i, point k, coordinate j
//   rb:i:<prop>    branch i: dn, od, wall, diameter, bendRadius (numbers / size), color
//   hc:i:<prop>    connector i: name, pins, at ("x,y,z" of a network point)
//   hk:i:<j|name>  clip i: coordinate j, name
//   hw:i:<prop>    wire i: name, from, to, fromPin, toPin, gauge, color, via ("C1, C2")
// Commands (routeTableCommand): addBranch, delBranch.i, addBranchPt.i, delBranchPt.i.k, addConn, delConn.i,
// addClip, delClip.i, addWire, delWire.i.
import { sampleHarness } from './harness.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const same = (a, b) => Array.isArray(a) && Array.isArray(b) && len(sub(a, b)) < 1e-4;
const round3 = (v) => Math.round(v * 1000) / 1000;

const KEY = /^(pt3|rbp|rb|hc|hk|hw):/;
/** Is this PropertyManager key one of the route tables'? */
export const isRouteTableKey = (key) => KEY.test(String(key));

/** Moves what is attached at `from` (branch starts, connectors, clips) to `to`. */
function moveAttached(f, from, to) {
  for (const b of f.branches ?? []) if (same(b.points?.[0], from)) b.points[0] = to.slice();
  for (const c of f.connectors ?? []) if (same(c.at, from)) c.at = to.slice();
  for (const c of f.clips ?? []) if (same(c.at, from)) c.at = to.slice();
}

function setPoint(f, list, k, j, v) {
  const p = list?.[k];
  if (!p) return;
  const old = p.slice();
  p[j] = v;
  moveAttached(f, old, p);
}

/**
 * Applies one table field to the route `f` (in place). `raw` is the typed text, `v` its number (null when not a
 * number). Returns true when applied, 'invalid' for a bad number, false when the key is not a route table's.
 */
export function editRouteTable(f, key, raw, v) {
  if (!isRouteTableKey(key)) return false;
  const [kind, a, b, c] = String(key).split(':');
  const i = Number(a);
  const needNum = () => v == null || !Number.isFinite(v);
  if (kind === 'pt3') { if (needNum()) return 'invalid'; setPoint(f, f.points, i, Number(b), v); return true; }
  if (kind === 'rbp') { if (needNum()) return 'invalid'; setPoint(f, f.branches?.[i]?.points, Number(b), Number(c), v); return true; }
  if (kind === 'rb') {
    const br = f.branches?.[i]; if (!br) return true;
    if (b === 'dn' || b === 'color') { br[b] = raw || undefined; return true; }
    if (needNum() || !(v > 0)) return 'invalid';
    br[b] = v; return true;
  }
  if (kind === 'hc') {
    const con = f.connectors?.[i]; if (!con) return true;
    if (b === 'name') {
      const name = String(raw).trim(); if (!name) return 'invalid';
      for (const w of f.wires ?? []) { if (w.from === con.name) w.from = name; if (w.to === con.name) w.to = name; }
      con.name = name; return true;
    }
    if (b === 'pins') { if (needNum() || v < 1) return 'invalid'; con.pins = Math.round(v); return true; }
    if (b === 'at') { const p = String(raw).split(',').map(Number); if (p.length !== 3 || !p.every(Number.isFinite)) return 'invalid'; con.at = p; return true; }
    return true;
  }
  if (kind === 'hk') {
    const k = f.clips?.[i]; if (!k) return true;
    if (b === 'name') { k.name = String(raw).trim() || k.name; return true; }
    if (needNum()) return 'invalid';
    k.at = k.at.slice(); k.at[Number(b)] = v; return true;
  }
  if (kind === 'hw') {
    const w = f.wires?.[i]; if (!w) return true;
    if (['name', 'from', 'to', 'color'].includes(b)) { w[b] = String(raw).trim(); return true; }
    if (b === 'via') { w.via = String(raw).split(/[\s,;]+/).filter(Boolean); return true; }
    if (needNum() || !(v > 0)) return 'invalid';
    w[b] = ['fromPin', 'toPin'].includes(b) ? Math.round(v) : v; return true;
  }
  return false;
}

/** The straights of the route's own points and branches (for placing new branches and clips). */
function segments(f) {
  const out = [];
  const add2 = (pts) => { for (let k = 0; k < (pts?.length ?? 0) - 1; k++) out.push([pts[k], pts[k + 1]]); };
  add2(f.points); for (const b of f.branches ?? []) add2(b.points);
  return out;
}

/** Free ends of the route (main ends, branch ends) that hold no connector yet. */
function freeEnds(f) {
  const ends = [f.points?.[0], f.points?.at(-1), ...(f.branches ?? []).map((b) => b.points?.at(-1))].filter(Array.isArray);
  return ends.filter((p) => !(f.connectors ?? []).some((c) => same(c.at, p)));
}

const midOf = ([a, b]) => mul(add(a, b), 0.5).map(round3);

/** Runs one table command on `f` (in place); returns true when it was one. */
export function routeTableCommand(f, cmd) {
  const [name, ...rest] = String(cmd).split('.');
  const i = Number(rest[0]); const k = Number(rest[1]);
  const taken = (p) => (f.branches ?? []).some((b) => same(b.points?.[0], p)) || (f.clips ?? []).some((c) => same(c.at, p)) || (f.connectors ?? []).some((c) => same(c.at, p));
  if (name === 'addBranch') {
    // The longest free straight: the most room for the tee's take-outs.
    const segs = segments(f).sort((a, b) => len(sub(b[1], b[0])) - len(sub(a[1], a[0])));
    const seg = segs.find((s) => !taken(midOf(s))) ?? segs[0];
    if (!seg) return true;
    const start = midOf(seg);
    const d = sub(seg[1], seg[0]); const l = len(d) || 1; const u = mul(d, 1 / l);
    let perp = [u[1], -u[0], 0];
    if (len(perp) < 1e-6) perp = [1, 0, 0];
    perp = mul(perp, 1 / len(perp));
    f.branches = [...(f.branches ?? []), { points: [start, add(start, mul(perp, 80)).map(round3)] }];
    return true;
  }
  if (name === 'delBranch') { f.branches = (f.branches ?? []).filter((_, x) => x !== i); return true; }
  if (name === 'addBranchPt') {
    const b = f.branches?.[i]; if (!b) return true;
    const p = b.points; const last = p.at(-1); const prev = p.at(-2) ?? sub(last, [50, 0, 0]);
    const d = sub(last, prev); const l = len(d) || 1;
    p.push(add(last, mul(d, 50 / l)).map(round3));
    return true;
  }
  if (name === 'delBranchPt') { const b = f.branches?.[i]; if (b && b.points.length > 2) b.points.splice(k, 1); return true; }
  if (name === 'addConn') {
    const at = freeEnds(f)[0] ?? f.points?.[0] ?? [0, 0, 0];
    let n = (f.connectors?.length ?? 0) + 1; while ((f.connectors ?? []).some((c) => c.name === `J${n}`)) n += 1;
    f.connectors = [...(f.connectors ?? []), { name: `J${n}`, at: at.slice(), pins: 2 }];
    return true;
  }
  if (name === 'delConn') {
    const c = f.connectors?.[i]; if (!c) return true;
    f.connectors = f.connectors.filter((_, x) => x !== i);
    f.wires = (f.wires ?? []).filter((w) => w.from !== c.name && w.to !== c.name);
    return true;
  }
  if (name === 'addClip') {
    const seg = segments(f).find((s) => !taken(midOf(s)));
    if (!seg) return true;
    let n = (f.clips?.length ?? 0) + 1; while ((f.clips ?? []).some((c) => c.name === `C${n}`)) n += 1;
    f.clips = [...(f.clips ?? []), { name: `C${n}`, at: midOf(seg) }];
    return true;
  }
  if (name === 'delClip') { f.clips = (f.clips ?? []).filter((_, x) => x !== i); return true; }
  if (name === 'addWire') {
    const cs = f.connectors ?? [];
    if (cs.length < 2) return true;
    const used = (c) => new Set((f.wires ?? []).flatMap((w) => [w.from === c.name ? w.fromPin : null, w.to === c.name ? w.toPin : null]).filter((x) => x != null));
    const freePin = (c) => { const u = used(c); for (let p = 1; p <= c.pins; p++) if (!u.has(p)) return p; c.pins += 1; return c.pins; };
    const [A, B] = cs;
    let n = (f.wires?.length ?? 0) + 1; while ((f.wires ?? []).some((w) => w.name === `W${n}`)) n += 1;
    f.wires = [...(f.wires ?? []), { name: `W${n}`, from: A.name, fromPin: freePin(A), to: B.name, toPin: freePin(B), color: 'BK', gauge: 0.5 }];
    return true;
  }
  if (name === 'delWire') { f.wires = (f.wires ?? []).filter((_, x) => x !== i); return true; }
  return false;
}

/** Makes `f` a harness: a starting set of connectors, a clip and wires when it has none. */
export function ensureHarness(f) {
  if ((f.connectors ?? []).length) return f;
  if ((f.branches ?? []).length) {
    f.connectors = []; f.wires = []; f.clips = f.clips ?? [];
    for (let n = 0; n < 3; n++) routeTableCommand(f, 'addConn');
    routeTableCommand(f, 'addWire');
  } else Object.assign(f, sampleHarness(f.points ?? []));
  f.fill ??= 0.8; f.endAllowance ??= 0; f.color = '#2b2d31';
  return f;
}

// Electrical harness routing (no DOM): a route of kind 'harness' — bundles along the route network (routing.js:
// the main run and its branches), connectors (name, pin count) at network points, clips holding the bundle, and
// wires from a connector pin to another connector pin (colour, cross-section), each routed along the shortest
// way through the bundles (and through the clips it is told to pass, in order).
//   wire length   centre line of the bundles it runs in (bundle bends rounded with the harness bend radius) plus
//                 the termination allowance at each end
//   bundle Ø      √(Σ dᵢ² / fill) of the wires in it (dᵢ: insulated outside diameter of the wire's size)
//   wire list     from / pin / to / pin / colour / size / length / clips
//   flattened     the bundle tree laid flat (formboard drawing): each branch keeps its true developed length,
//                 connector tables, as data, SVG or DXF
// harnessSolid() builds bundles (solid sweeps), connector housings and clips on the kernel, each with a colour.
import { rep } from './kernel.js';
import { routeNetwork, outDir, routeRuns, runPieces, NODE_TOL } from './routing.js';
import { connectorDims, clipDims, connectorLocal, clipLocal, orientFrame, upFor, CONNECTOR_TYPES, CLIP_TYPES } from './harness-parts.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const neg = (a) => [-a[0], -a[1], -a[2]];
const code = (c, params = {}) => Object.assign(new Error(c), { code: c, params });
const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : d);
const r1 = (v) => Math.round(v * 10) / 10;

/** Wire sizes (mm²) → insulated outside diameter (mm), ISO 6722 thin wall (maximum). */
export const WIRE_GAUGES = { 0.35: 1.3, 0.5: 1.6, 0.75: 1.9, 1: 2.1, 1.5: 2.4, 2.5: 3.0, 4: 3.7, 6: 4.3 };
export const WIRE_SIZES = Object.keys(WIRE_GAUGES).map(Number).sort((a, b) => a - b);
/** Wire colour codes (IEC 60757) → display colour. */
export const WIRE_COLOURS = { RD: '#d23c3c', BK: '#222428', BU: '#2f6fd6', GN: '#2e9e4f', YE: '#f0c419', WH: '#f2f2f2', OG: '#e07b22', VT: '#8a4fd1', BN: '#8b5a2b', GY: '#8f969e' };
export const HARNESS_COLOURS = { bundle: '#2b2d31', connector: '#4a5260', clip: '#e8e8e8' };
/** Contact pitch of a connector housing (mm) and its depth. */

/** The outside diameter of a wire: its own, or its size's. */
export const wireOd = (w) => num(w.od, WIRE_GAUGES[Number(w.gauge)] ?? WIRE_GAUGES[0.5]);
/** Bundle diameter of wires with outside diameters `ods` at `fill` (the share of the bundle the wires fill). */
export const bundleDiameter = (ods, fill = 0.8) => Math.sqrt(ods.reduce((s, d) => s + d * d, 0) / Math.max(0.05, Math.min(1, fill)));

/** Settings with their defaults. */
export function harnessSettings(f) {
  return { fill: Math.max(0.05, Math.min(1, num(f.fill, 0.8))), bendRadius: Math.max(0, num(f.bendRadius, 20)), endAllowance: Math.max(0, num(f.endAllowance, 0)), empty: Math.max(0.1, num(f.diameter, 6)), color: f.color && /^#/.test(f.color) ? f.color : HARNESS_COLOURS.bundle };
}

/** Shortest node path a → b on the network (by straight lengths): [nodes], or null. */
function shortestPath(net, a, b) {
  const dist = net.nodes.map(() => Infinity); const prev = net.nodes.map(() => null);
  dist[a] = 0; const open = new Set([a]);
  while (open.size) {
    let u = null; for (const x of open) if (u == null || dist[x] < dist[u]) u = x;
    open.delete(u);
    if (u === b) break;
    for (const ei of net.nodes[u].edges) {
      const e = net.edges[ei]; const v = e.a === u ? e.b : e.a;
      const d = dist[u] + e.length;
      if (d < dist[v] - 1e-12) { dist[v] = d; prev[v] = { u, ei }; open.add(v); }
    }
  }
  if (!Number.isFinite(dist[b])) return null;
  const nodes = [b]; const edges = [];
  for (let x = b; x !== a; x = prev[x].u) { edges.unshift(prev[x].ei); nodes.unshift(prev[x].u); }
  return { nodes, edges };
}

/**
 * The harness on its network: { net, settings, connectors: [{ name, pins, node }], clips: [{ name, node }],
 * corners (node → { theta, T, correction }), wires: [{ name, from, fromPin, to, toPin, color, gauge, od, nodes,
 * edges, clips, length }], bundles: [{ edge, wires (names), diameter, length }], length (bundle centre line) }.
 */
export function harnessModel(f, features = []) {
  const s = harnessSettings(f);
  const clipsIn = (f.clips ?? []).filter((c) => Array.isArray(c?.at));
  const connIn = (f.connectors ?? []).filter((c) => Array.isArray(c?.at));
  const net = routeNetwork({ ...f, kind: 'harness' }, features, { splitAt: [...clipsIn.map((c) => c.at), ...connIn.map((c) => c.at)] });
  const nodeOf = (p) => net.nodes.findIndex((n) => len(sub(n.p, p)) < NODE_TOL);
  const connectors = connIn.map((c, i) => ({ name: String(c.name || `J${i + 1}`), pins: Math.max(1, Math.round(num(c.pins, 1))), node: nodeOf(c.at), type: CONNECTOR_TYPES[c.type] ? c.type : 'rect25' }));
  const names = new Set();
  for (const c of connectors) { if (names.has(c.name)) throw code('connector-name', { name: c.name }); names.add(c.name); }
  for (const n of connectors.map((c) => c.node)) if (connectors.filter((c) => c.node === n).length > 1) throw code('connector-shared');
  const clips = clipsIn.map((c, i) => ({ name: String(c.name || `C${i + 1}`), node: nodeOf(c.at), type: CLIP_TYPES[c.type] ? c.type : 'pClip' }));
  const isConn = new Set(connectors.map((c) => c.node));
  // Bends of the bundle: deg-2 points (not connectors) rounded with the bend radius.
  const corners = new Map();
  for (const n of net.nodes) {
    if (n.edges.length !== 2 || isConn.has(n.id)) continue;
    const [a, b] = n.edges.map((ei) => outDir(net, n.id, ei));
    const theta = Math.acos(Math.max(-1, Math.min(1, -dot(a, b))));
    if (theta < 1e-6) continue;
    if (Math.PI - theta < 1e-4) throw code('route-reversal', { index: n.id + 1 });
    const T = s.bendRadius * Math.tan(theta / 2);
    corners.set(n.id, { theta, T, correction: 2 * T - s.bendRadius * theta });
  }
  for (const e of net.edges) if ((corners.get(e.a)?.T ?? 0) + (corners.get(e.b)?.T ?? 0) > e.length + 1e-6) throw code('bend-too-large', { index: e.seg + 1, branch: e.chain });
  const byName = new Map(connectors.map((c) => [c.name, c]));
  const used = new Set();
  const wires = (f.wires ?? []).map((w, i) => {
    const name = String(w.name || `W${i + 1}`);
    const A = byName.get(String(w.from)); const B = byName.get(String(w.to));
    if (!A || !B) throw code('wire-connector', { wire: name });
    const fromPin = Math.round(num(w.fromPin, 1)); const toPin = Math.round(num(w.toPin, 1));
    for (const [c, p] of [[A, fromPin], [B, toPin]]) {
      if (p < 1 || p > c.pins) throw code('wire-pin', { wire: name, connector: c.name, pin: p });
      const k = `${c.name}:${p}`;
      if (used.has(k)) throw code('pin-used', { wire: name, pin: k });
      used.add(k);
    }
    const via = (Array.isArray(w.via) ? w.via : String(w.via ?? '').split(/[\s,;]+/)).filter((x) => x !== '' && x != null).map((x) => {
      const c = clips.find((k) => k.name === String(x)) ?? clips[Number(x) - 1];
      if (!c) throw code('wire-clip', { wire: name, clip: String(x) });
      return c.node;
    });
    const stops = [A.node, ...via, B.node];
    const nodes = [A.node]; const edges = [];
    for (let k = 0; k < stops.length - 1; k++) {
      if (stops[k] === stops[k + 1]) continue;
      const p = shortestPath(net, stops[k], stops[k + 1]);
      if (!p) throw code('wire-no-path', { wire: name });
      nodes.push(...p.nodes.slice(1)); edges.push(...p.edges);
    }
    let length = edges.reduce((sum, ei) => sum + net.edges[ei].length, 0);
    for (let k = 1; k < nodes.length - 1; k++) { const c = corners.get(nodes[k]); if (c && edges[k - 1] !== edges[k]) length -= c.correction; }
    length += 2 * s.endAllowance;
    const clipNames = clips.filter((c) => nodes.includes(c.node)).map((c) => c.name);
    return { name, from: A.name, fromPin, to: B.name, toPin, color: String(w.color ?? 'BK'), gauge: Number(w.gauge ?? 0.5), od: wireOd(w), nodes, edges, clips: clipNames, length };
  });
  const bundles = net.edges.map((e) => {
    const ws = wires.filter((w) => w.edges.includes(e.id));
    return { edge: e.id, wires: ws.map((w) => w.name), diameter: ws.length ? bundleDiameter(ws.map((w) => w.od), s.fill) : s.empty, length: e.length };
  });
  let length = net.edges.reduce((sum, e) => sum + e.length, 0);
  for (const c of corners.values()) length -= c.correction;
  return { net, settings: s, connectors, clips, corners, wires, bundles, length };
}

/** The wire list rows (rounded to 0.1 mm). */
export const wireList = (m) => m.wires.map((w) => ({ wire: w.name, from: w.from, fromPin: w.fromPin, to: w.to, toPin: w.toPin, color: w.color, gauge: w.gauge, od: w.od, length: r1(w.length), clips: w.clips }));

/** Per connector: its pins and the wire on each ({ pin, wire, color, gauge, to }). */
export function connectorTables(m) {
  return m.connectors.map((c) => ({
    connector: c.name, pins: c.pins,
    rows: Array.from({ length: c.pins }, (_, i) => {
      const pin = i + 1;
      const w = m.wires.find((x) => (x.from === c.name && x.fromPin === pin) || (x.to === c.name && x.toPin === pin));
      if (!w) return { pin, wire: '', color: '', gauge: null, to: '' };
      const to = w.from === c.name && w.fromPin === pin ? `${w.to}:${w.toPin}` : `${w.from}:${w.fromPin}`;
      return { pin, wire: w.name, color: w.color, gauge: w.gauge, to };
    }),
  }));
}

/** The harness BOM: wires by size and colour (total length), connectors by pin count, clips; bundle length. */
export function harnessBom(m) {
  const rows = [];
  const group = (key, make, length = null) => { const r = rows.find((x) => x.key === key); if (r) { r.qty += 1; if (length != null) r.length = r1(r.length + length); } else rows.push({ ...make(), key, qty: 1, length: length == null ? null : r1(length) }); };
  for (const w of m.wires) group(`w|${w.gauge}|${w.color}`, () => ({ item: 'wire', size: `${w.gauge} mm²`, color: WIRE_COLOURS[w.color] ?? w.color, code: w.color }), w.length);
  for (const c of m.connectors) { const d = connectorDims(c.type, c.pins); group(`c|${c.type}|${c.pins}`, () => ({ item: 'connector', type: c.type, size: `${c.pins}P ${d.shape === 'round' ? `Ø${r1(d.D)}` : `${r1(d.w)}×${r1(d.h)}`}×${d.depth}` })); }
  for (const c of m.clips) { const d = Math.max(...m.net.nodes[c.node].edges.map((ei) => m.bundles[ei].diameter)); group(`k|${c.type}|${r1(d)}`, () => ({ item: 'clip', type: c.type, size: `Ø${r1(d)}` })); }
  for (const r of rows) delete r.key;
  return { kind: 'harness', length: m.length, rows, bends: m.corners.size, wires: wireList(m), tables: connectorTables(m), bundles: m.bundles.map((b) => ({ ...b, diameter: Math.round(b.diameter * 1000) / 1000 })), notes: [] };
}

// ───────────────────────── kernel

/**
 * The harness solid: bundle runs (constant diameter between junctions, bends rounded), connector housings at
 * their points facing away from the bundle, clips around the bundle. { shape, length, colors: [{ faces, color }] }.
 */
export function harnessSolid(f, features = []) {
  const R = rep();
  const m = harnessModel(f, features);
  const { net } = m;
  const isConn = new Set(m.connectors.map((c) => c.node));
  // Junction table in the form routing.js's runs take: deg-2 points continue when the diameter stays the same.
  const J = net.nodes.map((n) => {
    const j = { node: n.id, trim: new Map(), through: null, arc: null };
    if (n.edges.length === 2 && !isConn.has(n.id) && Math.abs(m.bundles[n.edges[0]].diameter - m.bundles[n.edges[1]].diameter) < 1e-9) {
      j.through = [...n.edges];
      const c = m.corners.get(n.id);
      if (c && m.settings.bendRadius > 0) { j.arc = { r: m.settings.bendRadius, theta: c.theta, T: c.T }; for (const ei of n.edges) j.trim.set(ei, c.T); }
      else if (c) j.through = null;
    }
    return j;
  });
  const runs = routeRuns(net, J);
  const bundles = []; const connectors = []; const clips = [];
  for (const run of runs) {
    const pieces = runPieces(net, J, run);
    const d = m.bundles[run.edges[0]].diameter;
    const solid = (list) => {
      const first = list[0];
      const edgeOf = (p) => (p.type === 'line' ? R.makeLine(p.a, p.b) : R.makeThreePointArc(p.a, p.mid, p.b));
      const tg = edgeOf(first).tangentAt(0);
      const spine = R.assembleWire(list.map(edgeOf));
      const profile = R.assembleWire([R.makeCircle(d / 2, first.a, [tg.x, tg.y, tg.z])]);
      return R.genericSweep(profile, spine, { frenet: true }, false);
    };
    try { bundles.push(solid(pieces)); } catch { for (const p of pieces) bundles.push(solid([p])); }
  }
  // Housings from the parts library: the wire side on the bundle end, facing away from it, latch up.
  for (const c of m.connectors) {
    const n = net.nodes[c.node];
    const out = n.edges.length === 1 ? neg(outDir(net, n.id, n.edges[0])) : [0, 0, 1];
    connectors.push(orientFrame(connectorLocal(connectorDims(c.type, c.pins)), out, upFor(out), n.p));
  }
  // Clips round the bundle, their mount on the side away from "up" (below the bundle in the Z-up world).
  for (const c of m.clips) {
    const n = net.nodes[c.node];
    const dir = outDir(net, n.id, n.edges[0]);
    const d = Math.max(...n.edges.map((x) => m.bundles[x].diameter));
    clips.push(orientFrame(clipLocal(clipDims(c.type, d)), dir, upFor(dir), n.p));
  }
  let bundle = bundles[0];
  if (bundles.length > 1) { try { bundle = bundles.slice(1).reduce((acc, s) => acc.fuse(s), bundles[0]); } catch { bundle = R.makeCompound(bundles); } }
  const hashes = (list) => list.flatMap((s) => { try { return s.faces.map((x) => x.hashCode); } catch { return []; } });
  const colors = [
    { faces: hashes([bundle]), color: m.settings.color },
    { faces: hashes(connectors), color: HARNESS_COLOURS.connector },
    { faces: hashes(clips), color: HARNESS_COLOURS.clip },
  ];
  const all = [bundle, ...connectors, ...clips];
  return { shape: all.length === 1 ? all[0] : R.makeCompound(all), length: m.length, measured: null, model: m, colors };
}

// ───────────────────────── flattened harness (formboard)

/**
 * The bundle tree laid flat: { nodes: [{ id (network node), x, y, kind: 'connector' | 'junction' | 'end', name }],
 * segments: [{ a, b, length (true developed length), angle (°), diameter (largest on it), wires, clips: [{ name,
 * at (distance from a) }], points: [[x, y]] }], tables (connector tables), wires (wire list), bounds }.
 * Bends inside a branch are straightened; every branch keeps its length. Branches leave a junction straight on
 * (the longest) or at ±60°, ±90°, ±30°.
 */
export function harnessFlat(m) {
  const { net } = m;
  const conn = new Map(m.connectors.map((c) => [c.node, c]));
  const clipAt = new Map(m.clips.map((c) => [c.node, c]));
  const isBreak = (n) => net.nodes[n].edges.length !== 2 || conn.has(n);
  const segs = []; const seen = new Set();
  for (const n of net.nodes) {
    if (!isBreak(n.id)) continue;
    for (const e0 of n.edges) {
      if (seen.has(e0)) continue;
      let node = n.id; let ei = e0; let length = 0; const clips = []; const edges = [];
      if (clipAt.has(node)) clips.push({ name: clipAt.get(node).name, at: 0 });
      for (;;) {
        seen.add(ei); edges.push(ei);
        length += net.edges[ei].length;
        const next = net.edges[ei].a === node ? net.edges[ei].b : net.edges[ei].a;
        const c = m.corners.get(next);
        if (isBreak(next)) { if (clipAt.has(next)) clips.push({ name: clipAt.get(next).name, at: length }); node = next; break; }
        // A clip at a bend sits at the middle of the arc.
        if (c) length -= c.T;
        if (clipAt.has(next)) clips.push({ name: clipAt.get(next).name, at: length + (c ? (m.settings.bendRadius * c.theta) / 2 : 0) });
        if (c) length += m.settings.bendRadius * c.theta - c.T;
        node = next;
        ei = net.nodes[next].edges.find((x) => x !== ei);
      }
      segs.push({ a: n.id, b: node, length, edges, clips, diameter: Math.max(...edges.map((x) => m.bundles[x].diameter)), wires: [...new Set(edges.flatMap((x) => m.bundles[x].wires))] });
    }
  }
  const breaks = net.nodes.filter((n) => isBreak(n.id)).map((n) => n.id);
  if (!breaks.length || segs.length !== breaks.length - 1) throw code('harness-loop');
  const adj = new Map(breaks.map((b) => [b, []]));
  segs.forEach((s, i) => { adj.get(s.a).push(i); adj.get(s.b).push(i); });
  const root = m.connectors.find((c) => isBreak(c.node) && net.nodes[c.node].edges.length === 1)?.node ?? breaks.find((b) => net.nodes[b].edges.length === 1) ?? breaks[0];
  const reach = (node, from) => Math.max(0, ...adj.get(node).filter((i) => i !== from).map((i) => segs[i].length + reach(segs[i].a === node ? segs[i].b : segs[i].a, i)));
  const pos = new Map([[root, [0, 0]]]);
  const OFFS = [60, -60, 90, -90, 30, -30, 120, -120];
  const place = (node, angle, from) => {
    const kids = adj.get(node).filter((i) => i !== from).map((i) => ({ i, other: segs[i].a === node ? segs[i].b : segs[i].a })).map((k) => ({ ...k, reach: segs[k.i].length + reach(k.other, k.i) })).sort((x, y) => y.reach - x.reach);
    kids.forEach((k, idx) => {
      const a = from == null ? (idx === 0 ? 0 : idx === 1 ? 180 : OFFS[(idx - 2) % OFFS.length] + 0) : idx === 0 ? angle : angle + OFFS[(idx - 1) % OFFS.length];
      const s = segs[k.i];
      const p = pos.get(node);
      const q = [p[0] + s.length * Math.cos((a * Math.PI) / 180), p[1] + s.length * Math.sin((a * Math.PI) / 180)];
      pos.set(k.other, q);
      // Oriented from the node nearer the root.
      if (s.a !== node) { s.clips = s.clips.map((c) => ({ ...c, at: s.length - c.at })).reverse(); [s.a, s.b] = [node, k.other]; }
      s.angle = a; s.points = [p, q];
      place(k.other, a, k.i);
    });
  };
  place(root, 0, null);
  const nodes = breaks.map((b) => ({ id: b, x: pos.get(b)[0], y: pos.get(b)[1], kind: conn.has(b) ? 'connector' : net.nodes[b].edges.length === 1 ? 'end' : 'junction', name: conn.get(b)?.name ?? '' }));
  const xs = nodes.map((n) => n.x); const ys = nodes.map((n) => n.y);
  return { nodes, segments: segs, tables: connectorTables(m), wires: wireList(m), bounds: [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]] };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const DEFAULT_LABELS = { title: 'Flattened harness', pin: 'Pin', wire: 'Wire', colour: 'Colour', size: 'mm²', to: 'To', from: 'From', length: 'Length', wireList: 'Wire list' };

/** The flattened harness as an SVG drawing (true lengths labelled in mm, connector tables and the wire list). */
export function harnessSvg(flat, { labels = {}, width = 820 } = {}) {
  const L = { ...DEFAULT_LABELS, ...labels };
  const [[x0, y0], [x1, y1]] = flat.bounds;
  const pad = 40;
  const k = Math.min((width - 2 * pad) / Math.max(1, x1 - x0), 360 / Math.max(1, y1 - y0));
  const X = (x) => pad + (x - x0) * k; const Y = (y) => pad + (y1 - y) * k;
  const drawH = pad * 2 + (y1 - y0) * k;
  const out = [];
  for (const s of flat.segments) {
    const [p, q] = s.points;
    const sw = Math.max(2, Math.min(14, s.diameter * k));
    out.push(`<line x1="${X(p[0]).toFixed(1)}" y1="${Y(p[1]).toFixed(1)}" x2="${X(q[0]).toFixed(1)}" y2="${Y(q[1]).toFixed(1)}" stroke="#2b2d31" stroke-width="${sw.toFixed(1)}" stroke-linecap="round" data-length="${s.length.toFixed(3)}"/>`);
    const mx = (X(p[0]) + X(q[0])) / 2; const my = (Y(p[1]) + Y(q[1])) / 2;
    const a = (s.angle * Math.PI) / 180;
    out.push(`<text x="${(mx - Math.sin(a) * 12).toFixed(1)}" y="${(my - Math.cos(a) * 12).toFixed(1)}" font-size="11" text-anchor="middle" fill="#1d4f91">${r1(s.length)}</text>`);
    for (const c of s.clips) {
      const t = s.length > 0 ? c.at / s.length : 0;
      const cx = X(p[0] + (q[0] - p[0]) * t); const cy = Y(p[1] + (q[1] - p[1]) * t);
      const nx = Math.sin(a) * (sw / 2 + 4); const ny = Math.cos(a) * (sw / 2 + 4);
      out.push(`<line x1="${(cx - nx).toFixed(1)}" y1="${(cy - ny).toFixed(1)}" x2="${(cx + nx).toFixed(1)}" y2="${(cy + ny).toFixed(1)}" stroke="#c0392b" stroke-width="2"/><text x="${(cx + nx + 3).toFixed(1)}" y="${(cy + ny + 10).toFixed(1)}" font-size="9" fill="#c0392b">${esc(c.name)}</text>`);
    }
  }
  for (const n of flat.nodes) {
    if (n.kind === 'connector') out.push(`<rect x="${(X(n.x) - 9).toFixed(1)}" y="${(Y(n.y) - 7).toFixed(1)}" width="18" height="14" rx="2" fill="#4a5260"/><text x="${X(n.x).toFixed(1)}" y="${(Y(n.y) - 11).toFixed(1)}" font-size="11" font-weight="bold" text-anchor="middle">${esc(n.name)}</text>`);
    else if (n.kind === 'junction') out.push(`<circle cx="${X(n.x).toFixed(1)}" cy="${Y(n.y).toFixed(1)}" r="3" fill="#2b2d31"/>`);
  }
  // Tables under the drawing.
  let ty = drawH + 10; let tx = pad; let rowMax = 0;
  const cell = (x, y, text, w, bold = false) => `<text x="${x + 3}" y="${y + 11}" font-size="9" ${bold ? 'font-weight="bold"' : ''}>${esc(text)}</text><rect x="${x}" y="${y}" width="${w}" height="15" fill="none" stroke="#9aa0a6" stroke-width="0.5"/>`;
  for (const tb of flat.tables) {
    const cols = [[L.pin, 26], [L.wire, 40], [L.colour, 40], [L.size, 34], [L.to, 50]];
    const w = cols.reduce((s, c) => s + c[1], 0);
    if (tx + w > width - pad) { tx = pad; ty += rowMax + 12; rowMax = 0; }
    out.push(`<text x="${tx}" y="${ty + 11}" font-size="11" font-weight="bold">${esc(tb.connector)}</text>`);
    let cx = tx; for (const [h, cw] of cols) { out.push(cell(cx, ty + 15, h, cw, true)); cx += cw; }
    tb.rows.forEach((r, i) => { let x = tx; [r.pin, r.wire, r.color, r.gauge ?? '', r.to].forEach((v, j) => { out.push(cell(x, ty + 30 + i * 15, String(v), cols[j][1])); x += cols[j][1]; }); });
    rowMax = Math.max(rowMax, 30 + tb.rows.length * 15);
    tx += w + 16;
  }
  ty += rowMax + 16;
  const wc = [[L.wire, 40], [L.from, 50], [L.to, 50], [L.colour, 40], [L.size, 34], [L.length, 56]];
  out.push(`<text x="${pad}" y="${ty + 11}" font-size="11" font-weight="bold">${esc(L.wireList)}</text>`);
  let cx = pad; for (const [h, cw] of wc) { out.push(cell(cx, ty + 15, h, cw, true)); cx += cw; }
  flat.wires.forEach((w, i) => { let x = pad; [w.wire, `${w.from}:${w.fromPin}`, `${w.to}:${w.toPin}`, w.color, w.gauge, w.length].forEach((v, j) => { out.push(cell(x, ty + 30 + i * 15, String(v), wc[j][1])); x += wc[j][1]; }); });
  const H = ty + 30 + flat.wires.length * 15 + pad / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${Math.ceil(H)}" viewBox="0 0 ${width} ${Math.ceil(H)}" font-family="sans-serif"><title>${esc(L.title)}</title><rect width="100%" height="100%" fill="#ffffff"/>${out.join('')}</svg>`;
}

/** The flattened harness as DXF (R12): bundle lines, length texts, connector boxes and names, clip marks, tables. */
export function harnessDxf(flat, { labels = {} } = {}) {
  const L = { ...DEFAULT_LABELS, ...labels };
  const ents = [];
  const line = (layer, a, b) => ents.push(`0\nLINE\n8\n${layer}\n10\n${a[0].toFixed(4)}\n20\n${a[1].toFixed(4)}\n30\n0\n11\n${b[0].toFixed(4)}\n21\n${b[1].toFixed(4)}\n31\n0`);
  const text = (layer, p, h, s, rot = 0) => ents.push(`0\nTEXT\n8\n${layer}\n10\n${p[0].toFixed(4)}\n20\n${p[1].toFixed(4)}\n30\n0\n40\n${h}\n1\n${String(s).replace(/\n/g, ' ')}\n50\n${rot.toFixed(3)}`);
  for (const s of flat.segments) {
    const [p, q] = s.points;
    line('BUNDLE', p, q);
    const a = (s.angle * Math.PI) / 180;
    text('DIM', [(p[0] + q[0]) / 2 - Math.sin(a) * 4, (p[1] + q[1]) / 2 + Math.cos(a) * 4], 3, r1(s.length).toString(), s.angle > 90 || s.angle < -90 ? s.angle + 180 : s.angle);
    for (const c of s.clips) {
      const t = s.length > 0 ? c.at / s.length : 0;
      const m = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
      const n = [-Math.sin(a) * (s.diameter / 2 + 3), Math.cos(a) * (s.diameter / 2 + 3)];
      line('CLIP', [m[0] - n[0], m[1] - n[1]], [m[0] + n[0], m[1] + n[1]]);
      text('CLIP', [m[0] + n[0], m[1] + n[1] + 1], 2.5, c.name);
    }
  }
  for (const n of flat.nodes) {
    if (n.kind !== 'connector') continue;
    const c = [[n.x - 6, n.y - 4], [n.x + 6, n.y - 4], [n.x + 6, n.y + 4], [n.x - 6, n.y + 4]];
    c.forEach((p, i) => line('CONNECTOR', p, c[(i + 1) % 4]));
    text('CONNECTOR', [n.x - 6, n.y + 6], 3.5, n.name);
  }
  let y = flat.bounds[0][1] - 30;
  for (const tb of flat.tables) {
    text('TABLE', [flat.bounds[0][0], y], 3.5, tb.connector); y -= 6;
    text('TABLE', [flat.bounds[0][0], y], 2.5, `${L.pin} | ${L.wire} | ${L.colour} | ${L.size} | ${L.to}`); y -= 5;
    for (const r of tb.rows) { text('TABLE', [flat.bounds[0][0], y], 2.5, `${r.pin} | ${r.wire} | ${r.color} | ${r.gauge ?? ''} | ${r.to}`); y -= 5; }
    y -= 4;
  }
  text('TABLE', [flat.bounds[0][0], y], 3.5, L.wireList); y -= 6;
  for (const w of flat.wires) { text('TABLE', [flat.bounds[0][0], y], 2.5, `${w.wire} | ${w.from}:${w.fromPin} | ${w.to}:${w.toPin} | ${w.color} | ${w.gauge} | ${w.length}`); y -= 5; }
  return `0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n5\n${['BUNDLE', 'DIM', 'CLIP', 'CONNECTOR', 'TABLE'].map((l, i) => `0\nLAYER\n2\n${l}\n70\n0\n62\n${[7, 5, 1, 8, 3][i]}\n6\nCONTINUOUS`).join('\n')}\n0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${ents.join('\n')}\n0\nENDSEC\n0\nEOF\n`;
}

/** A starting harness on a route's points: connectors at the free ends, one clip, two wires. */
export function sampleHarness(points) {
  const p = points.length >= 2 ? points : [[0, 0, 20], [150, 0, 20], [300, 0, 20]];
  const mid = p.length >= 3 ? p[1] : p[0].map((v, i) => (v + p[1][i]) / 2);
  const dir = (() => { const d = sub(p.at(-1), p[0]); const l = len(d) || 1; return mul(d, 1 / l); })();
  const side = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const branchEnd = add(mid, mul(side, 100));
  const clipAt = p[0].map((v, i) => (v + mid[i]) / 2);
  return {
    branches: [{ points: [mid.slice(), branchEnd] }],
    connectors: [{ name: 'J1', at: p[0].slice(), pins: 4 }, { name: 'J2', at: p.at(-1).slice(), pins: 4 }, { name: 'J3', at: branchEnd.slice(), pins: 2 }],
    clips: [{ name: 'C1', at: clipAt }],
    wires: [
      { name: 'W1', from: 'J1', fromPin: 1, to: 'J2', toPin: 1, color: 'RD', gauge: 0.5 },
      { name: 'W2', from: 'J1', fromPin: 2, to: 'J2', toPin: 2, color: 'BK', gauge: 0.5 },
      { name: 'W3', from: 'J1', fromPin: 3, to: 'J3', toPin: 1, color: 'BU', gauge: 0.35 },
      { name: 'W4', from: 'J2', fromPin: 3, to: 'J3', toPin: 2, color: 'GN', gauge: 0.75 },
    ],
  };
}

/** Network points a connector or clip can sit on (the route's nodes), as [x, y, z] lists. */
export function harnessPoints(f, features = []) {
  try { return routeNetwork({ ...f, kind: 'harness' }, features).nodes.map((n) => n.p); } catch { return []; }
}

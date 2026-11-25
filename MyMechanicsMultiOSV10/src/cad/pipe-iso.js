// Pipe spools and the isometric piping drawing (ISO) of a pipe or tube route (no DOM).
//
// Spools: the shop-fabricated pieces a route is cut into. The route's network is split at field welds — points on
// the route the user gives (`breaks`), and, when a spool's pipe would be longer than `maxSpool`, one more at the
// middle of its longest straight — and every connected piece of pipe and fittings between them is a spool. Each
// spool lists its pipe pieces (size, cut length, cut from stock lengths `stock` with shop splices), its fittings,
// its shop welds (one per fitting end: elbow 2, tee 3, cross 4, lateral / wye 3, reducing elbow 2, each reducer 2,
// each weld-neck flange 1, each saddle 1, plus the stock splices) and its weight (steel 7850 kg/m³).
//
// The ISO: the route's centre line in the standard isometric projection (plant x to the right and down 30°, y to
// the left and down 30°... seen from above the south-east: u = (x − y)·cos 30°, v = (x + y)·sin 30° + z), fittings
// (elbow arcs, branch legs, reducers as cones, flanges as double bars), shop welds as dots, field welds as "FW"
// circles, centre-to-centre dimensions of every straight, spool numbers, the elevation of the ends, a north arrow.
// isoSheet() lays it out on a drawing sheet (a 'drwPipeIso' annotation and general tables for the spools, the bill
// of materials and the welds); isoPrimitives() draws the annotation (poly / circle / text, sheet mm, y down).
import { routeNetwork, routeJunctions, routeRuns, runPieces, elbowPieces, routeSection, routeBom, outDir } from './routing.js';
import { isoSheetOptions, ISO_SCALES } from './pipe-iso-draw.js';

export { ISO_SHEET_DEFAULTS, isoSheetOptions, ISO_SCALES, isoToSheet, isoPrimitives } from './pipe-iso-draw.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const r1 = (v) => Math.round(v * 10) / 10;
const STEEL = 7850e-9;               // kg/mm³

/** Shop welds of a junction (fitting ends welded to pipe or each other). */
function junctionWelds(j) {
  let n = 0;
  if (j.kind === 'elbow' && j.fitting?.fitting !== 'bend') n += 2;
  else if (j.kind === 'tee' || j.kind === 'lateral' || j.kind === 'wye') n += 3;
  else if (j.kind === 'cross') n += 4;
  else if (j.kind === 'saddle') n += j.fitting?.outlets?.length ?? 1;
  n += 2 * (j.reducers?.length ?? 0);
  if (j.flange) n += 1;
  return n;
}
const fittingName = (j) => {
  if (j.kind === 'elbow') return j.fitting?.fitting === 'bend' ? null : j.fitting?.fitting === 'lr90r' ? 'reducingElbow' : 'elbow';
  if (['tee', 'cross', 'lateral', 'wye', 'saddle'].includes(j.kind)) return j.kind;
  return null;
};

/** Splits a run at break nodes: sub-runs { nodes, edges }. */
function splitRun(run, breakSet) {
  const out = []; let nodes = [run.nodes[0]], edges = [];
  for (let i = 0; i < run.edges.length; i++) {
    edges.push(run.edges[i]); nodes.push(run.nodes[i + 1]);
    if (i < run.edges.length - 1 && breakSet.has(run.nodes[i + 1])) { out.push({ ...run, nodes, edges }); nodes = [run.nodes[i + 1]]; edges = []; }
  }
  out.push({ ...run, nodes, edges });
  return out;
}

/** The spools of a layout split at `breaks` (points on the route). */
function spoolsOf(f, features, breaks, { stock }) {
  const net = routeNetwork(f, features, { splitAt: breaks });
  const J = routeJunctions(net, f);
  const near = (p) => net.nodes.findIndex((n) => len(sub(n.p, p)) < 1e-3);
  const breakSet = new Set(breaks.map(near).filter((i) => i >= 0 && J[i].kind === 'inline' && !(J[i].reducers?.length)));
  const runs = routeRuns(net, J).flatMap((r) => splitRun(r, breakSet));
  // Union the sub-runs through every node that is not a field weld.
  const parent = runs.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const atNode = new Map();
  runs.forEach((r, i) => { for (const n of [r.nodes[0], r.nodes.at(-1)]) { if (!atNode.has(n)) atNode.set(n, []); atNode.get(n).push(i); } });
  for (const [n, list] of atNode) if (!breakSet.has(n)) for (const i of list.slice(1)) parent[find(i)] = find(list[0]);
  const groups = new Map();
  runs.forEach((r, i) => { const g = find(i); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(i); });
  const spools = [...groups.values()].map((ids, k) => {
    const pieces = [], nodesIn = new Set();
    let pipeLength = 0, weight = 0, splices = 0;
    for (const i of ids) {
      const r = runs[i];
      const ps = runPieces(net, J, r);
      const L = ps.reduce((s, p) => s + p.length, 0);
      const sec = r.sec ?? routeSection(r.spec);
      pieces.push({ size: f.kind === 'pipe' ? r.spec.dn ?? 'DN25' : `Ø${sec.od}×${sec.wall}`, length: L, run: i });
      pipeLength += L;
      weight += Math.PI / 4 * (sec.od ** 2 - (sec.od - 2 * sec.wall) ** 2) * L * STEEL;
      if (stock > 0) splices += Math.max(0, Math.ceil(L / stock) - 1);
      for (const n of r.nodes) nodesIn.add(n);
    }
    const fittings = [], ends = [];
    let welds = splices;
    for (const n of nodesIn) {
      if (breakSet.has(n)) { ends.push({ node: n, kind: 'field' }); continue; }
      const j = J[n];
      welds += junctionWelds(j);
      const name = fittingName(j);
      if (name) fittings.push({ node: n, item: name, size: j.fitting?.runSize ?? j.fitting?.dn ?? j.fitting?.size ?? null });
      for (const r of j.reducers ?? []) fittings.push({ node: n, item: 'reducer', size: `${r.largeSize}×${r.smallSize}` });
      if (j.flange) { fittings.push({ node: n, item: 'flange', size: j.flange.dn }); ends.push({ node: n, kind: 'flange' }); }
      else if (j.kind === 'end') ends.push({ node: n, kind: 'open' });
    }
    return { id: `S${k + 1}`, runs: ids, pieces, pipeLength, weight, fittings, welds, splices, ends, nodes: [...nodesIn] };
  });
  return { net, J, runs, spools, breakNodes: [...breakSet] };
}

/**
 * Spools of a pipe / tube route: { spools: [{ id, pieces, pipeLength, weight, fittings, welds (shop), splices, ends }],
 * fieldWelds: [{ point }], shopWelds, net, J, runs }. `breaks`: field-weld points on the route; `maxSpool` (mm):
 * spools longer than this get more field welds; `stock`: pipe stock length (mm, 6000).
 */
export function pipeSpools(f, features = [], { breaks = [], maxSpool = 0, stock = 6000 } = {}) {
  let pts = breaks.filter((p) => Array.isArray(p) && p.length === 3);
  let res = spoolsOf(f, features, pts, { stock });
  for (let guard = 0; maxSpool > 0 && guard < 50; guard++) {
    const long = res.spools.find((s) => s.pipeLength > maxSpool);
    if (!long) break;
    // Its longest straight network edge (not touching a fitting's take-out): a field weld at its middle.
    let best = null;
    for (const i of long.runs) for (const ei of res.runs[i].edges) { const e = res.net.edges[ei]; if (!best || e.length > best.length) best = e; }
    if (!best || best.length < 1) break;
    const mid = mul(add(res.net.nodes[best.a].p, res.net.nodes[best.b].p), 0.5);
    pts = [...pts, mid];
    res = spoolsOf(f, features, pts, { stock });
  }
  const fieldWelds = res.breakNodes.map((n) => ({ point: res.net.nodes[n].p.slice(), node: n }));
  return { ...res, fieldWelds, breaks: pts, shopWelds: res.spools.reduce((s, x) => s + x.welds, 0) };
}

// ───────────────────────── the isometric drawing

const C30 = Math.cos(Math.PI / 6), S30 = Math.sin(Math.PI / 6);
/** Isometric projection: model (x, y, z) → drawing (u right, v up). */
export const isoProject = (p) => [(p[0] - p[1]) * C30, (p[0] + p[1]) * S30 + p[2]];

/**
 * The ISO model (drawing units = model mm, v up): { lines: [[u,v]…] polylines, welds: [[u,v]], field: [[u,v]],
 * flanges: [{ at, dir }], reducers: [{ a, b, wa, wb }], dims: [{ a, b, text }], labels: [{ at, text }], ends:
 * [{ at, text }], bounds }. From pipeSpools().
 */
export function isoModel(f, features = [], opts = {}) {
  const sp = pipeSpools(f, features, opts);
  const { net, J, runs } = sp;
  const P = isoProject;
  const lines = [], welds = [], flanges = [], reducers = [], dims = [], labels = [], ends = [];
  const arcPts = (p) => { const out = []; for (let k = 0; k <= 8; k++) { const t = k / 8; const q = (1 - t) * (1 - t), w = 2 * t * (1 - t), s = t * t; const c = [0, 1, 2].map((i) => q * p.a[i] + w * (2 * p.mid[i] - 0.5 * p.a[i] - 0.5 * p.b[i]) + s * p.b[i]); out.push(P(c)); } return out; };
  const piecePts = (p) => (p.type === 'line' ? [P(p.a), P(p.b)] : arcPts(p));
  for (const r of runs) {
    const ps = runPieces(net, J, r);
    if (!ps.length) continue;
    const poly = [];
    for (const p of ps) { const q = piecePts(p); if (poly.length) q.shift(); poly.push(...q); }
    lines.push(poly);
    // Shop welds where the pipe meets a fitting (not at open ends, bends or field welds).
    const fitEnd = (n) => { const j = J[n]; return j.kind !== 'end' && j.kind !== 'inline' && j.kind !== 'bend' && !(j.kind === 'elbow' && j.fitting?.fitting === 'bend') || Boolean(j.flange) || (j.reducers?.length ?? 0) > 0; };
    if (fitEnd(r.nodes[0]) && !sp.breakNodes.includes(r.nodes[0])) welds.push(P(ps[0].a));
    if (fitEnd(r.nodes.at(-1)) && !sp.breakNodes.includes(r.nodes.at(-1))) welds.push(P(ps.at(-1).b));
  }
  for (const j of J) {
    const p = net.nodes[j.node].p;
    if (j.kind === 'elbow' && j.fitting?.fitting !== 'bend') { const q = []; for (const pc of elbowPieces(net, j)) { const s = piecePts(pc); if (q.length) s.shift(); q.push(...s); } lines.push(q); }
    else if (['tee', 'cross', 'lateral', 'wye', 'saddle'].includes(j.kind)) for (const ei of net.nodes[j.node].edges) { const tr = j.trim.get(ei) ?? 0; if (tr > 0) lines.push([P(p), P(add(p, mul(outDir(net, j.node, ei), tr)))]); }
    for (const r of j.reducers ?? []) {
      const a = r.base, b = add(r.base, mul(r.dir, r.H));
      const wa = (r.secL?.od ?? 0) || null, wb = (r.secS?.od ?? 0) || null;
      reducers.push({ a: P(a), b: P(b), wa, wb, text: `${r.largeSize}×${r.smallSize}` });
    }
    if (j.flange) { const ei = net.nodes[j.node].edges[0]; const d = outDir(net, j.node, ei); flanges.push({ at: P(add(p, mul(d, j.flange.H))), at0: P(p), dir: d, text: j.flange.dn }); }
    if (j.kind === 'end') ends.push({ at: P(p), text: `EL ${r1(p[2])}` });
  }
  // Centre-to-centre dimensions of the network's straights (between the original route points, split welds merged).
  const breakSet = new Set(sp.breakNodes);
  const seen = new Set();
  for (const e of net.edges) {
    if (seen.has(e.id)) continue;
    // Walk through inline nodes (and field welds) to the next real node on each side.
    const chain = [e.id]; seen.add(e.id);
    const walk = (n, from) => { let node = n, cur = from; for (;;) { const j = J[node]; if (!(j.kind === 'inline' && !j.reducers?.length) && !breakSet.has(node)) return node; const nx = net.nodes[node].edges.find((x) => x !== cur); if (nx == null) return node; chain.push(nx); seen.add(nx); node = net.edges[nx].a === node ? net.edges[nx].b : net.edges[nx].a; cur = nx; } };
    const a = walk(e.a, e.id), b = walk(e.b, e.id);
    const pa = net.nodes[a].p, pb = net.nodes[b].p, L = len(sub(pb, pa));
    if (L > 1e-6) dims.push({ a: P(pa), b: P(pb), text: String(Math.round(L)), value: L });
  }
  for (const s of sp.spools) {
    let sx = 0, sy = 0, n = 0;
    for (const i of s.runs) for (const nd of runs[i].nodes) { const q = P(net.nodes[nd].p); sx += q[0]; sy += q[1]; n++; }
    if (n) labels.push({ at: [sx / n, sy / n], text: s.id });
  }
  const field = sp.fieldWelds.map((w) => P(w.point));
  const all = [...lines.flat(), ...welds, ...field, ...ends.map((x) => x.at)];
  const us = all.map((q) => q[0]), vs = all.map((q) => q[1]);
  const bounds = [[Math.min(...us), Math.min(...vs)], [Math.max(...us), Math.max(...vs)]];
  return { kind: f.kind, lines, welds, field, flanges, reducers, dims, labels, ends, bounds, spools: sp.spools, fieldWelds: sp.fieldWelds, shopWelds: sp.shopWelds, breaks: sp.breaks };
}

const table = (id, title, rows, colW, rowH, role) => ({ id, kind: 'drwTable', x: 0, y: 0, title, rows: rows.length, cols: colW.length, cells: rows.map((r) => r.map((v) => (v == null ? '' : String(v)))), colW: colW.map((w) => (w * rowH) / 6), rowH, role });
const tableH = (t) => (t.title ? t.rowH : 0) + t.rowH * t.rows;
const tableW = (t) => t.colW.reduce((s, w) => s + w, 0);

/**
 * The sheet of an ISO: { annotations: [the 'drwPipeIso' annotation, tables …], scale, scaleLabel, fits }. Tables
 * (spools, bill of materials, welds) go along the bottom left of the title block; the iso above at the largest
 * standard scale that fits.
 */
export function isoSheet(f, features = [], { W = 420, H = 297, margin = 15, titleBlock = [180, 56], labels = {}, ids = (k) => `iso-${k}`, title = '', opts = {}, itemName = (x) => x } = {}) {
  const o = isoSheetOptions(opts);
  const iso = isoModel(f, features, { maxSpool: Number(o.maxSpool) || 0, stock: Number(o.stock) || 6000, breaks: f.spoolBreaks ?? [] });
  const L = { spools: 'Spools', spool: 'Spool', pipe: 'Pipe', fittings: 'Fittings', welds: 'Shop welds', weight: 'kg', bom: 'Bill of materials', item: 'Item', size: 'Size', qty: 'Qty', length: 'Length', weldList: 'Welds', weld: 'Weld', type: 'Type', shop: 'SW', fieldW: 'FW', ...labels };
  const rh = Math.max(3, Math.min(12, Number(o.rowH) || 6));
  const tables = [];
  if (o.showSpools) tables.push(table(ids('spools'), L.spools, [[L.spool, L.pipe, L.fittings, L.welds, L.weight], ...iso.spools.map((s) => [s.id, s.pieces.map((p) => `${p.size} ${Math.round(p.length)}`).join(', '), [...new Set(s.fittings.map((x) => x.item))].map((it) => `${s.fittings.filter((x) => x.item === it).length}× ${itemName(it)}`).join(', '), s.welds, r1(s.weight)])], [12, 44, 46, 16, 12], rh, 'spools'));
  if (o.showBom) {
    const bom = routeBom(f, features);
    tables.push(table(ids('bom'), L.bom, [[L.item, L.size, L.qty, L.length], ...bom.rows.map((r) => [itemName(r.item), r.size, r.qty, r.length ?? ''])], [28, 22, 10, 16], rh, 'bom'));
  }
  if (o.showWelds) {
    const rows = [];
    let k = 0;
    for (const s of iso.spools) if (s.welds) rows.push([`${s.id}`, L.shop, s.welds]);
    for (const w of iso.fieldWelds) rows.push([`FW${++k}`, L.fieldW, 1]);
    tables.push(table(ids('welds'), L.weldList, [[L.weld, L.type, L.qty], ...rows], [14, 10, 10], rh, 'welds'));
  }
  const bottom = H - margin;
  let x = margin, rowTop = bottom, rowH = 0, top = bottom;
  const placeRow = [];
  const flush = () => { for (const t of placeRow) t.y = rowTop - rowH; top = Math.min(top, rowTop - rowH); rowTop = rowTop - rowH - 6; rowH = 0; placeRow.length = 0; x = margin; };
  for (const t of tables) {
    const limit = rowTop > H - margin - titleBlock[1] - 1 ? W - margin - titleBlock[0] - 6 : W - margin;
    if (x + tableW(t) > limit && placeRow.length) flush();
    t.x = x; x += tableW(t) + 6; rowH = Math.max(rowH, tableH(t)); placeRow.push(t);
  }
  if (placeRow.length) flush();
  const area = { x: margin + 14, y: margin + 16, w: W - 2 * margin - 28, h: top - margin - 30 };
  const [[u0, v0], [u1, v1]] = iso.bounds;
  const fit = Math.min(area.w / Math.max(1e-6, u1 - u0), area.h / Math.max(1e-6, v1 - v0));
  const fixed = Number(o.scale);
  const scale = o.scale !== 'auto' && fixed > 0 ? fixed : ISO_SCALES.find((s) => s <= fit) ?? fit;
  const scaleLabel = scale >= 1 ? `${r1(scale)}:1` : `1:${r1(1 / scale)}`;
  const w = (u1 - u0) * scale, h = (v1 - v0) * scale;
  const ann = { id: ids('iso'), kind: 'drwPipeIso', x: area.x + (area.w - w) / 2, y: area.y + (area.h - h) / 2, scale, scaleLabel, title, iso, opts: o };
  return { annotations: [ann, ...tables], scale, scaleLabel, fits: w <= area.w + 1e-6 && h <= area.h + 1e-6 };
}

/** What an ISO sheet depends on: equal keys mean it is up to date. */
export function isoKey(f, features = []) {
  const path = f.path ? features.find((x) => x.id === f.path)?.points ?? null : null;
  const pick = ['kind', 'points', 'branches', 'dn', 'od', 'wall', 'fittings', 'flanges', 'bendRadius', 'path', 'spoolBreaks'];
  return JSON.stringify([Object.fromEntries(pick.map((k) => [k, f[k] ?? null])), path]);
}

/** Puts a (re)built ISO sheet on drawing `d` (as applyHarnessSheet: the annotation kept, its tables replaced in place). */
export function applyIsoSheet(d, ann, sheet, { source = null, key = null } = {}) {
  const [isoAnn, ...tables] = sheet.annotations;
  const old = (d.annotations ?? []).filter((x) => x.kind === 'drwTable' && x.pipeIso === ann.id);
  const keepPlace = ann.iso && ann.scale === isoAnn.scale;
  Object.assign(ann, { ...isoAnn, id: ann.id, x: keepPlace ? ann.x : isoAnn.x, y: keepPlace ? ann.y : isoAnn.y, source: source ?? ann.source, key: key ?? ann.key, stale: false });
  // The places the tables had (the user may have moved them) — unless one changed size (or one came or went): then
  // all are laid out afresh, so a grown table does not run into its neighbours or off the sheet.
  const same = old.length === tables.length && tables.every((t) => { const p = old.find((x) => x.role === t.role); return p && p.rows === t.rows && p.cols === t.cols; });
  for (const t of tables) {
    t.pipeIso = ann.id;
    const prev = old.find((x) => x.role === t.role);
    if (prev) { t.id = prev.id; if (same) { t.x = prev.x; t.y = prev.y; } }
  }
  d.annotations = [...(d.annotations ?? []).filter((x) => !(x.kind === 'drwTable' && x.pipeIso === ann.id)), ...tables];
  return ann;
}

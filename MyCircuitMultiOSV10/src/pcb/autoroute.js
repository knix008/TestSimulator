// Grid-based maze autorouter (A* on a 3D grid: x, y, copper layer).
//
// autoroute(project, opts) -> {tracks, vias, routed, failed, stats}
// routeSingle(project, net, from, to, opts) -> {tracks, vias} | null
//
// Neither function mutates the project; the caller appends the result (one
// undo step).
//
// How it works
//   * Routing nodes sit on a coarse grid (opts.grid, default 0.25 mm). The
//     obstacle maps are rasterised at half that pitch, so every step checks
//     its start, midpoint and end cell — that keeps diagonal moves from
//     clipping a pad corner between two clear nodes.
//   * One obstacle map set per "profile" (track width / via size / class
//     clearance). A map cell holds 0 = free, k = only net k may enter
//     (its own copper plus halo), -1 = nobody (another net's halo overlapping,
//     board edge, NPTH, unnetted pads). Halo radius = clearance + half the
//     routed width (+ a small quantisation margin).
//   * A separate via map per profile (all copper layers, hole-to-hole, edge).
//   * Each ratsnest connection is routed from every node of the source island
//     to any node of the target island; turns and off-axis moves are
//     penalised so results look tidy. Routed copper is stamped into all maps
//     straight away so later nets avoid it.
//   * If something fails, a second pass starts over with the failures first
//     (rip-up-and-retry of the whole board) and the better pass wins.

import { copperLayers, defaultRules } from "../core/project.js";
import { netClassFor, clearanceFor, itemDistance, itemBounds, copperConnectivity, ratsnest, footprintPads } from "./board.js";
import { pointSegDist, pointInPolygon, polygonBounds, uid, round, DEG } from "../core/geom.js";

const SQRT2 = Math.SQRT2;
const DX = [1, 1, 0, -1, -1, -1, 0, 1];
const DY = [0, 1, 1, 1, 0, -1, -1, -1];
// Cost of changing direction by 0, 45, 90, 135, 180 degrees.
const TURN = [0, 0.35, 0.9, 6, 1e9];

// ---------------------------------------------------------------- geometry
// Exact (analytic) distance from a point to a pad outline; <= 0 inside.
function padDistFn(p) {
  const r = (p.rot || 0) * DEG;
  const c = Math.cos(r), s = Math.sin(r);
  const px = p.x, py = p.y;
  if (p.shape === "circle") {
    const rad = Math.max(p.w, p.h) / 2;
    return (x, y) => Math.hypot(x - px, y - py) - rad;
  }
  const rr = p.shape === "oval" ? Math.min(p.w, p.h) / 2 : p.shape === "roundrect" ? Math.min(p.w, p.h) * 0.25 : 0;
  const hx = p.w / 2 - rr, hy = p.h / 2 - rr;
  return (x, y) => {
    const dx = x - px, dy = y - py;
    // Inverse of geom.rotatePoint(lx, ly, rot).
    const lx = dx * c - dy * s;
    const ly = dx * s + dy * c;
    const ex = Math.max(Math.abs(lx) - hx, 0);
    const ey = Math.max(Math.abs(ly) - hy, 0);
    return Math.hypot(ex, ey) - rr;
  };
}

function netProfile(rules, net) {
  const nc = netClassFor(rules, net);
  return {
    w: (nc && nc.trackWidth) || rules.trackWidth,
    vd: (nc && nc.viaDiameter) || rules.viaDiameter,
    vdrill: (nc && nc.viaDrill) || rules.viaDrill,
    cl: (nc && nc.clearance) || 0,
  };
}

// ---------------------------------------------------------------- binary heap
class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v;
    const top = v[0];
    const lk = k.pop(), lv = v.pop();
    const n = k.length;
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

// ---------------------------------------------------------------- router
class Router {
  constructor(project, opts = {}) {
    const pcb = project.pcb;
    this.pcb = pcb;
    this.rules = { ...defaultRules(), ...(pcb.rules || {}) };
    const allCu = copperLayers(pcb);
    this.allCu = allCu;
    this.layers = (opts.layers && opts.layers.length ? opts.layers : [allCu[0], allCu[allCu.length - 1]]).filter((l) => allCu.includes(l));
    if (!this.layers.length) this.layers = [allCu[0]];
    this.viaCost = opts.viaCost ?? 20;
    this.preferDir = opts.preferDirection !== false;

    const b = polygonBounds(pcb.outline);
    let g = opts.grid || 0.25;
    // Keep memory sane on huge boards by coarsening the grid.
    while (((b.x2 - b.x1) / g) * ((b.y2 - b.y1) / g) > 3e6) g *= 2;
    this.g = g;
    this.h = g / 2;
    this.x0 = Math.floor(b.x1 / g) * g;
    this.y0 = Math.floor(b.y1 / g) * g;
    this.NX = Math.ceil((b.x2 - this.x0) / g) + 1;
    this.NY = Math.ceil((b.y2 - this.y0) / g) + 1;
    this.FX = this.NX * 2 - 1;
    this.FY = this.NY * 2 - 1;
    this.L = this.layers.length;
    this.NN = this.NX * this.NY;

    // Signed distance to the board edge per fine cell (negative = outside).
    const FX = this.FX, FY = this.FY, h = this.h, out = pcb.outline;
    this.edge = new Float32Array(FX * FY);
    for (let fj = 0; fj < FY; fj++) {
      const y = this.y0 + fj * h;
      for (let fi = 0; fi < FX; fi++) {
        const x = this.x0 + fi * h;
        let d = Infinity;
        for (let i = 0, j = out.length - 1; i < out.length; j = i++) {
          const e = pointSegDist(x, y, out[j][0], out[j][1], out[i][0], out[i][1]);
          if (e < d) d = e;
        }
        this.edge[fj * FX + fi] = pointInPolygon(x, y, out) ? d : -d;
      }
    }

    // Copper connectivity (items + union-find), extended as we route.
    const conn = copperConnectivity(pcb);
    this.items = conn.items.slice();
    this.parent = this.items.map((_, i) => conn.find(i));
    this.netIdx = new Map();
    this.netItems = new Map();
    this.items.forEach((it, i) => this.indexItem(it, i));

    // Obstacles: every copper item except zones (fills clear themselves) + NPTH.
    this.obstacles = [];
    for (const it of this.items) if (it.kind !== "zone") this.obstacles.push(this.makeObstacle(it));
    // NPTH holes are not copper items; pull them from the footprints.
    for (const fp of pcb.footprints) {
      for (const p of footprintPads(fp, pcb)) {
        if (!p.npth || !p.drill) continue;
        const r = p.drill / 2;
        this.obstacles.push({ type: "hole", net: "", layers: allCu, x: p.x, y: p.y, r, holeR: r, bb: { x1: p.x - r, y1: p.y - r, x2: p.x + r, y2: p.y + r } });
      }
    }
    this.profiles = new Map();

    const N = this.NN * this.L;
    this.gScore = new Float32Array(N);
    this.prev = new Int32Array(N);
    this.dir = new Int8Array(N);
    this.seen = new Uint32Array(N);
    this.closed = new Uint32Array(N);
    this.target = new Uint32Array(N);
    this.stamp = 0;
    this.expansions = 0;
  }

  netId(net) {
    if (!net) return -1;
    let k = this.netIdx.get(net);
    if (!k) { k = this.netIdx.size + 1; this.netIdx.set(net, k); }
    return k;
  }

  indexItem(it, i) {
    if (!it.net) return;
    this.netId(it.net);
    if (!this.netItems.has(it.net)) this.netItems.set(it.net, []);
    this.netItems.get(it.net).push(i);
  }

  find(i) {
    const p = this.parent;
    while (p[i] !== i) { p[i] = p[p[i]]; i = p[i]; }
    return i;
  }

  union(a, b) {
    const ra = this.find(a), rb = this.find(b);
    if (ra !== rb) this.parent[ra] = rb;
  }

  makeObstacle(it) {
    const bb = itemBounds(it);
    if (it.kind === "pad") {
      const p = it.pad;
      return { type: "pad", net: it.net, layers: it.layers, smd: p.smd, dist: padDistFn(p), bb, holeR: p.drill ? p.drill / 2 : 0, x: p.x, y: p.y };
    }
    if (it.kind === "track") {
      const t = it.t;
      return { type: "track", net: it.net, layers: it.layers, bb, holeR: 0, dist: (x, y) => pointSegDist(x, y, t.x1, t.y1, t.x2, t.y2) - t.w / 2 };
    }
    const v = it.v;
    return { type: "via", net: it.net, layers: it.layers, bb, holeR: v.drill / 2, x: v.x, y: v.y, dist: (x, y) => Math.hypot(x - v.x, y - v.y) - v.d / 2 };
  }

  // ---- obstacle maps
  profileFor(net) {
    const pr = netProfile(this.rules, net);
    const key = `${pr.w}|${pr.vd}|${pr.vdrill}|${pr.cl}`;
    let P = this.profiles.get(key);
    if (P) return P;
    // Quantisation margin: worst-case dip of a sub-step past a point obstacle.
    const R = this.rules.clearance + pr.w / 2;
    const s = (this.g * SQRT2) / 4;
    const margin = (s >= R ? s : R - Math.sqrt(R * R - s * s)) + 0.003;
    P = { key, rep: net, ...pr, margin, maps: this.layers.map(() => new Int32Array(this.FX * this.FY)), via: new Int32Array(this.FX * this.FY) };
    const ec = this.rules.edgeClearance;
    const tLim = ec + pr.w / 2 + margin, vLim = ec + pr.vd / 2 + margin;
    for (let k = 0; k < this.edge.length; k++) {
      const e = this.edge[k];
      if (e < tLim) for (const m of P.maps) m[k] = -1;
      if (e < vLim) P.via[k] = -1;
    }
    for (const o of this.obstacles) this.stampObstacle(P, o);
    this.profiles.set(key, P);
    return P;
  }

  stampObstacle(P, o) {
    const owner = o.net ? this.netId(o.net) : -1;
    const cl = clearanceFor(this.rules, P.rep, o.net || "");
    const dist = o.type === "hole" ? (x, y) => Math.hypot(x - o.x, y - o.y) - o.r : o.dist;
    const tR = cl + P.w / 2 + P.margin;
    this.layers.forEach((l, li) => {
      if (o.layers.includes(l)) this.paint(P.maps[li], owner, o.bb, tR, dist);
    });
    // Vias span every copper layer, so any copper blocks them; SMD pads are
    // kept via-free even for their own net (no via-in-pad).
    if (o.layers.length) this.paint(P.via, o.type === "pad" && o.smd ? -1 : owner, o.bb, cl + P.vd / 2 + P.margin, dist);
    if (o.holeR) {
      const hb = { x1: o.x - o.holeR, y1: o.y - o.holeR, x2: o.x + o.holeR, y2: o.y + o.holeR };
      this.paint(P.via, -1, hb, o.holeR + this.rules.holeToHole + P.vdrill / 2 + P.margin, (x, y) => Math.hypot(x - o.x, y - o.y) - o.holeR);
    }
  }

  paint(map, owner, bb, R, dist) {
    const { x0, y0, h, FX, FY } = this;
    const fi1 = Math.max(0, Math.ceil((bb.x1 - R - x0) / h));
    const fi2 = Math.min(FX - 1, Math.floor((bb.x2 + R - x0) / h));
    const fj1 = Math.max(0, Math.ceil((bb.y1 - R - y0) / h));
    const fj2 = Math.min(FY - 1, Math.floor((bb.y2 + R - y0) / h));
    for (let fj = fj1; fj <= fj2; fj++) {
      const y = y0 + fj * h;
      const row = fj * FX;
      for (let fi = fi1; fi <= fi2; fi++) {
        const k = row + fi;
        const c = map[k];
        if (c === -1 || c === owner) continue;
        if (dist(x0 + fi * h, y) < R) map[k] = c === 0 ? owner : -1;
      }
    }
  }

  // ---- node helpers
  nodeXY(n) {
    const r = n % this.NN;
    return [round(this.x0 + (r % this.NX) * this.g, 5), round(this.y0 + Math.floor(r / this.NX) * this.g, 5)];
  }
  fineOf(n) {
    const r = n % this.NN;
    return Math.floor(r / this.NX) * 2 * this.FX + (r % this.NX) * 2;
  }

  // Nodes covered by an item's copper and enterable by `nid`.
  coverNodes(it, P, nid, fn) {
    const { x0, y0, g, NX, NY } = this;
    const b = itemBounds(it);
    const i1 = Math.max(0, Math.ceil((b.x1 - x0) / g)), i2 = Math.min(NX - 1, Math.floor((b.x2 - x0) / g));
    const j1 = Math.max(0, Math.ceil((b.y1 - y0) / g)), j2 = Math.min(NY - 1, Math.floor((b.y2 - y0) / g));
    const inside = this.insideFn(it);
    let count = 0;
    this.layers.forEach((l, li) => {
      if (!it.layers.includes(l)) return;
      const map = P.maps[li];
      for (let j = j1; j <= j2; j++) {
        for (let i = i1; i <= i2; i++) {
          if (!inside(x0 + i * g, y0 + j * g)) continue;
          const v = map[j * 2 * this.FX + i * 2];
          if (v !== 0 && v !== nid) continue;
          fn(li * this.NN + j * NX + i);
          count++;
        }
      }
    });
    if (count) return;
    // Off-grid or crowded copper: fall back to the nearest enterable node.
    const [ax, ay] = it.kind === "track" ? [it.t.x1, it.t.y1] : [it.x, it.y];
    const ci = Math.round((ax - x0) / g), cj = Math.round((ay - y0) / g);
    let best = -1, bd = Infinity;
    this.layers.forEach((l, li) => {
      if (!it.layers.includes(l)) return;
      for (let j = cj - 2; j <= cj + 2; j++) {
        for (let i = ci - 2; i <= ci + 2; i++) {
          if (i < 0 || j < 0 || i >= NX || j >= NY) continue;
          const v = P.maps[li][j * 2 * this.FX + i * 2];
          if (v !== 0 && v !== nid) continue;
          const d = Math.hypot(x0 + i * g - ax, y0 + j * g - ay);
          if (d < bd) { bd = d; best = li * this.NN + j * NX + i; }
        }
      }
    });
    if (best >= 0) fn(best);
  }

  insideFn(it) {
    if (it.kind === "pad") { const d = padDistFn(it.pad); return (x, y) => d(x, y) <= 1e-9; }
    if (it.kind === "via") return (x, y) => Math.hypot(x - it.v.x, y - it.v.y) <= it.v.d / 2 - 1e-6;
    if (it.kind === "track") return (x, y) => pointSegDist(x, y, it.t.x1, it.t.y1, it.t.x2, it.t.y2) <= it.t.w / 2 - 1e-6;
    return () => false;
  }

  // ---- A*
  search(P, nid, sources, targetBox, deadline) {
    const { NX, NY, NN, L, FX } = this;
    const st = this.stamp;
    const gS = this.gScore, prev = this.prev, dir = this.dir, seen = this.seen, closed = this.closed, target = this.target;
    const heap = new Heap();
    const [tx1, ty1, tx2, ty2] = targetBox;
    const heur = (i, j) => {
      const dx = Math.max(tx1 - i, 0, i - tx2);
      const dy = Math.max(ty1 - j, 0, j - ty2);
      return dx > dy ? dx + (SQRT2 - 1) * dy : dy + (SQRT2 - 1) * dx;
    };
    for (const s of sources) {
      if (seen[s] === st) continue;
      seen[s] = st; gS[s] = 0; prev[s] = -1; dir[s] = -1;
      const r = s % NN;
      heap.push(heur(r % NX, (r / NX) | 0), s);
    }
    const maps = P.maps, via = P.via, viaCost = this.viaCost, pref = this.preferDir;
    let iter = 0;
    while (heap.size) {
      const n = heap.pop();
      if (closed[n] === st) continue;
      closed[n] = st;
      if (target[n] === st) return this.unwind(n);
      if ((++iter & 1023) === 0 && Date.now() > deadline) return null;
      this.expansions++;
      const li = (n / NN) | 0;
      const r = n - li * NN;
      const j = (r / NX) | 0;
      const i = r - j * NX;
      const map = maps[li];
      const g0 = gS[n];
      const d0 = dir[n];
      const fc = j * 2 * FX + i * 2;
      for (let d = 0; d < 8; d++) {
        const ni = i + DX[d], nj = j + DY[d];
        if (ni < 0 || nj < 0 || ni >= NX || nj >= NY) continue;
        const m = li * NN + nj * NX + ni;
        if (closed[m] === st) continue;
        const fm = fc + DY[d] * FX + DX[d];
        const fe = fm + DY[d] * FX + DX[d];
        let v = map[fm];
        if (v !== 0 && v !== nid) continue;
        v = map[fe];
        if (v !== 0 && v !== nid) continue;
        let cost = d & 1 ? SQRT2 : 1;
        if (d0 >= 0) {
          const t = Math.abs(d - d0);
          cost += TURN[t > 4 ? 8 - t : t];
        }
        // Mild preferred direction per layer (H on even, V on odd layers).
        if (pref && L > 1 && !(d & 1)) cost += (li & 1 ? DY[d] === 0 : DX[d] === 0) ? 0.15 : 0;
        const ng = g0 + cost;
        if (seen[m] === st && gS[m] <= ng) continue;
        seen[m] = st; gS[m] = ng; prev[m] = n; dir[m] = d;
        heap.push(ng + heur(ni, nj), m);
      }
      // Layer change through a via.
      if (L > 1) {
        const vv = via[fc];
        if (vv === 0 || vv === nid) {
          for (let l2 = 0; l2 < L; l2++) {
            if (l2 === li) continue;
            const m = l2 * NN + r;
            if (closed[m] === st) continue;
            const v = maps[l2][fc];
            if (v !== 0 && v !== nid) continue;
            const ng = g0 + viaCost;
            if (seen[m] === st && gS[m] <= ng) continue;
            seen[m] = st; gS[m] = ng; prev[m] = n; dir[m] = d0;
            heap.push(ng + heur(i, j), m);
          }
        }
      }
    }
    return null;
  }

  unwind(n) {
    const path = [];
    while (n >= 0) { path.push(n); n = this.prev[n]; }
    return path.reverse();
  }

  // Route between two copper islands (lists of item indices, or {x,y,layer}
  // free points). Returns {tracks, vias} or null.
  connect(net, srcSet, dstSet, deadline) {
    const P = this.profileFor(net);
    const nid = this.netId(net);
    this.stamp++;
    if (this.stamp >= 0xfffffff0) { this.seen.fill(0); this.closed.fill(0); this.target.fill(0); this.stamp = 1; }
    const st = this.stamp;
    const srcItem = new Map();
    const dstItem = new Map();
    const sources = [];
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    const addSrc = (it) => (n) => { if (!srcItem.has(n)) { srcItem.set(n, it); sources.push(n); } };
    const addDst = (it) => (n) => {
      if (this.target[n] === st) return;
      this.target[n] = st;
      dstItem.set(n, it);
      const r = n % this.NN, i = r % this.NX, j = (r / this.NX) | 0;
      if (i < box[0]) box[0] = i;
      if (j < box[1]) box[1] = j;
      if (i > box[2]) box[2] = i;
      if (j > box[3]) box[3] = j;
    };
    for (const it of srcSet) this.coverNodes(it, P, nid, addSrc(it));
    for (const it of dstSet) this.coverNodes(it, P, nid, addDst(it));
    if (!sources.length || !dstItem.size) return null;
    // A node in both sets means the islands already touch.
    const path = this.search(P, nid, sources.filter((s) => this.target[s] !== st), box, deadline);
    if (!path) return null;
    return this.buildCopper(net, P, path, srcItem.get(path[0]), dstItem.get(path[path.length - 1]));
  }

  buildCopper(net, P, path, sItem, dItem) {
    const pts = path.map((n) => {
      const [x, y] = this.nodeXY(n);
      return { x, y, l: (n / this.NN) | 0 };
    });
    // Snap the ends onto the exact pad / via centre.
    const centre = (it) => (it && (it.kind === "pad" || it.kind === "via") ? [it.x, it.y] : null);
    const sc = centre(sItem);
    if (sc && (Math.abs(sc[0] - pts[0].x) > 1e-6 || Math.abs(sc[1] - pts[0].y) > 1e-6)) pts.unshift({ x: sc[0], y: sc[1], l: pts[0].l });
    const dc = centre(dItem);
    const last = pts[pts.length - 1];
    if (dc && (Math.abs(dc[0] - last.x) > 1e-6 || Math.abs(dc[1] - last.y) > 1e-6)) pts.push({ x: dc[0], y: dc[1], l: last.l });

    const tracks = [];
    const vias = [];
    let run = [pts[0]];
    const flush = () => {
      const s = simplify(run);
      for (let k = 1; k < s.length; k++) {
        tracks.push({ id: uid("t"), layer: this.layers[s[k].l], net, w: P.w, x1: s[k - 1].x, y1: s[k - 1].y, x2: s[k].x, y2: s[k].y });
      }
    };
    for (let k = 1; k < pts.length; k++) {
      const p = pts[k];
      if (p.l !== run[run.length - 1].l) {
        flush();
        vias.push({ id: uid("v"), x: p.x, y: p.y, d: P.vd, drill: P.vdrill, net });
        run = [p];
      } else run.push(p);
    }
    flush();
    return { tracks, vias };
  }

  // Register freshly routed copper: obstacles for others, connectivity for us.
  commit(net, res, joinA, joinB) {
    const added = [];
    for (const t of res.tracks) added.push({ kind: "track", id: t.id, net, layers: [t.layer], t });
    for (const v of res.vias) added.push({ kind: "via", id: v.id, net, layers: [...this.allCu], v, x: v.x, y: v.y });
    const netList = this.netItems.get(net) || [];
    for (const it of added) {
      const i = this.items.length;
      this.items.push(it);
      this.parent.push(i);
      const o = this.makeObstacle(it);
      this.obstacles.push(o);
      for (const P of this.profiles.values()) this.stampObstacle(P, o);
      if (joinA != null) this.union(i, joinA);
      if (joinB != null) this.union(i, joinB);
      // Passing over other same-net copper joins it too.
      const b = itemBounds(it);
      for (const k of netList) {
        const other = this.items[k];
        if (other.kind === "zone" || !other.layers.some((l) => it.layers.includes(l))) continue;
        const ob = itemBounds(other);
        if (ob.x1 > b.x2 || b.x1 > ob.x2 || ob.y1 > b.y2 || b.y1 > ob.y2) continue;
        if (itemDistance(it, other) <= 1e-3) this.union(i, k);
      }
      this.indexItem(it, i);
    }
  }

  // Index of the net item anchored at (x, y).
  itemAt(net, x, y) {
    let best = -1, bd = Infinity;
    for (const i of this.netItems.get(net) || []) {
      const it = this.items[i];
      const pts = it.kind === "track" ? [[it.t.x1, it.t.y1], [it.t.x2, it.t.y2]] : it.kind === "zone" ? [] : [[it.x, it.y]];
      for (const [px, py] of pts) {
        const d = Math.hypot(px - x, py - y);
        if (d < bd) { bd = d; best = i; }
      }
    }
    return bd < 1e-3 ? best : -1;
  }

  island(net, idx) {
    const root = this.find(idx);
    return (this.netItems.get(net) || []).filter((k) => this.find(k) === root && this.items[k].kind !== "zone");
  }
}

function simplify(run) {
  const out = [];
  for (const p of run) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 1e-9 && Math.abs(last.y - p.y) < 1e-9) continue;
    if (out.length >= 2) {
      const a = out[out.length - 2];
      const ux = last.x - a.x, uy = last.y - a.y, vx = p.x - last.x, vy = p.y - last.y;
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

// ---------------------------------------------------------------- public API
function runPass(project, conns, opts, deadline, onStep) {
  const R = new Router(project, opts);
  const tracks = [];
  const vias = [];
  const failed = [];
  let routed = 0;
  for (const c of conns) {
    const a = R.itemAt(c.net, c.x1, c.y1);
    const b = R.itemAt(c.net, c.x2, c.y2);
    if (a < 0 || b < 0) { failed.push(c); onStep(); continue; }
    if (R.find(a) === R.find(b)) { routed++; onStep(); continue; }
    const src = R.island(c.net, a).map((k) => R.items[k]);
    const dst = R.island(c.net, b).map((k) => R.items[k]);
    const res = Date.now() < deadline ? R.connect(c.net, src, dst, deadline) : null;
    if (!res) { failed.push(c); onStep(); continue; }
    R.commit(c.net, res, a, b);
    tracks.push(...res.tracks);
    vias.push(...res.vias);
    routed++;
    onStep();
  }
  return { tracks, vias, failed, routed, expansions: R.expansions };
}

export function autoroute(project, opts = {}) {
  const t0 = Date.now();
  const o = { grid: 0.25, viaCost: 20, maxMs: 15000, ...opts };
  const deadline = t0 + o.maxMs;
  let conns = ratsnest(project.pcb);
  if (o.nets && o.nets.length) {
    const want = new Set(o.nets);
    conns = conns.filter((c) => want.has(c.net));
  }
  const len = (c) => Math.hypot(c.x2 - c.x1, c.y2 - c.y1);
  conns.sort((a, b) => len(a) - len(b));
  const total = conns.length;
  let done = 0;
  const step = () => { done++; if (o.onProgress) o.onProgress(Math.min(done, total), total); };

  let best = runPass(project, conns, o, deadline, step);
  let passes = 1;
  let expansions = best.expansions;
  // Rip-up-and-retry: start over routing the hard connections first.
  while (best.failed.length && passes < 3 && Date.now() < deadline - 50) {
    const hard = new Set(best.failed);
    const order = [...best.failed, ...conns.filter((c) => !hard.has(c))];
    const next = runPass(project, order, o, deadline, () => {});
    passes++;
    expansions += next.expansions;
    if (next.failed.length < best.failed.length) best = next;
    else break;
  }
  if (o.onProgress) o.onProgress(total, total);
  return {
    tracks: best.tracks,
    vias: best.vias,
    routed: best.routed,
    failed: best.failed.map((c) => ({ net: c.net, x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2 })),
    stats: { ms: Date.now() - t0, connections: total, passes, expansions },
  };
}

// Route one airwire. `from`/`to` are points on (or near) copper of `net`;
// when there is no copper there the route starts/ends at that grid point.
export function routeSingle(project, net, from, to, opts = {}) {
  const o = { grid: 0.25, viaCost: 20, maxMs: 5000, ...opts };
  const R = new Router(project, o);
  const deadline = Date.now() + o.maxMs;
  const ends = [from, to].map((p) => {
    // Copper of the net under the point (on its layer when given).
    let hit = -1;
    for (const k of R.netItems.get(net) || []) {
      const it = R.items[k];
      if (it.kind === "zone") continue;
      if (p.layer && !it.layers.includes(p.layer)) continue;
      if (R.insideFn(it)(p.x, p.y) || R.itemAt(net, p.x, p.y) === k) { hit = k; break; }
    }
    if (hit >= 0) return { idx: hit, set: R.island(net, hit).map((k) => R.items[k]) };
    // A bare point: a tiny pseudo-via on the requested layer only.
    const layers = p.layer && R.layers.includes(p.layer) ? [p.layer] : R.layers;
    return { idx: null, set: [{ kind: "via", net, layers, x: p.x, y: p.y, v: { x: p.x, y: p.y, d: R.g * 0.9, drill: 0 }, pseudo: true }] };
  });
  const [a, b] = ends;
  if (a.idx != null && b.idx != null && R.find(a.idx) === R.find(b.idx)) return { tracks: [], vias: [] };
  const res = R.connect(net, a.set, b.set, deadline);
  if (!res) return null;
  return res;
}


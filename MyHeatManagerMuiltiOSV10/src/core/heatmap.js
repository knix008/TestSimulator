// Heat maps from node data (the Heat Analysis Manager side): a CSV of node
// temperatures exported from a lumped-node thermal model (Thermal Desktop,
// SINDA/FLUINT, ESATAN, a test rig's thermocouples …) is read, statistics are
// computed and the nodes are interpolated onto a raster with inverse-distance
// weighting so it can be shown and exported like a simulated field.

/**
 * Parses node CSV. Recognised columns (case-insensitive): node/id/name, x, y, (z), T/temp/temperature,
 * and optionally time/t. Separators: comma, semicolon or tab. Returns
 * { nodes: [{ id, x, y, z, T, time }], times: [..], columns, unit } or throws.
 */
export function parseNodeCsv(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  if (lines.length < 2) throw new Error('need a header and at least one row');
  const sep = [',', ';', '\t'].map((s) => [s, lines[0].split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const head = lines[0].split(sep).map((h) => h.trim().replace(/^"|"$/g, '').toLowerCase());
  const find = (...names) => head.findIndex((h) => names.some((n) => h === n || h.startsWith(`${n}_`) || h.startsWith(`${n} (`) || h.startsWith(`${n}[`)));
  const col = {
    id: find('node', 'id', 'name', 'label'),
    x: find('x'), y: find('y'), z: find('z'),
    T: find('t', 'temp', 'temperature', 'value'),
    time: find('time', 'step'),
  };
  if (col.x < 0 || col.y < 0) throw new Error('columns x and y are required');
  if (col.T < 0) throw new Error('a temperature column (T, temp, temperature) is required');
  const kelvin = /\(k\)|_k$|\[k\]/.test(head[col.T]);
  const nodes = [];
  for (let r = 1; r < lines.length; r++) {
    const cells = lines[r].split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
    const x = Number(cells[col.x]);
    const y = Number(cells[col.y]);
    let T = Number(cells[col.T]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(T)) continue;
    if (kelvin) T -= 273.15;
    nodes.push({
      id: col.id >= 0 ? cells[col.id] : String(r),
      x, y, z: col.z >= 0 ? Number(cells[col.z]) || 0 : 0,
      T, time: col.time >= 0 ? Number(cells[col.time]) || 0 : 0,
    });
  }
  if (!nodes.length) throw new Error('no numeric rows');
  const times = [...new Set(nodes.map((n) => n.time))].sort((a, b) => a - b);
  return { nodes, times, columns: head, kelvin };
}

/** Nodes of one time step (the last when `time` is null). */
export function nodesAt(data, time = null) {
  const t = time ?? data.times[data.times.length - 1];
  return data.nodes.filter((n) => n.time === t);
}

/** min, max, mean, standard deviation, percentiles, and nodes above `limit`. */
export function nodeStats(nodes, limit = null) {
  const values = nodes.map((n) => n.T).sort((a, b) => a - b);
  const count = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / Math.max(1, count);
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, count));
  const pct = (p) => (count ? values[Math.min(count - 1, Math.max(0, Math.round((p / 100) * (count - 1))))] : NaN);
  const hottest = [...nodes].sort((a, b) => b.T - a.T).slice(0, 10);
  const over = limit == null ? [] : nodes.filter((n) => n.T > limit);
  return { count, min: values[0], max: values[count - 1], mean, sd, p5: pct(5), p50: pct(50), p95: pct(95), hottest, over };
}

/** Bounding box of the nodes, padded by 5 %. */
export function nodeBounds(nodes) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const n of nodes) {
    x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y);
  }
  const px = (x1 - x0 || 1) * 0.05;
  const py = (y1 - y0 || 1) * 0.05;
  return { x0: x0 - px, y0: y0 - py, x1: x1 + px, y1: y1 + py };
}

/**
 * Inverse-distance-weighted raster: `nx` × `ny` values over `bounds` (row 0 = bottom), power `p`.
 * Uses the `k` nearest nodes per cell (all when k ≥ count) via a bucket grid so thousands of nodes stay fast.
 */
export function idwRaster(nodes, bounds, nx, ny, p = 2, k = 12) {
  const out = new Float32Array(nx * ny);
  const w = bounds.x1 - bounds.x0;
  const h = bounds.y1 - bounds.y0;
  const buckets = Math.max(1, Math.round(Math.sqrt(nodes.length / 4)));
  const grid = Array.from({ length: buckets * buckets }, () => []);
  for (const n of nodes) {
    const bi = Math.min(buckets - 1, Math.max(0, Math.floor(((n.x - bounds.x0) / w) * buckets)));
    const bj = Math.min(buckets - 1, Math.max(0, Math.floor(((n.y - bounds.y0) / h) * buckets)));
    grid[bi + bj * buckets].push(n);
  }
  for (let j = 0; j < ny; j++) {
    const y = bounds.y0 + ((j + 0.5) / ny) * h;
    for (let i = 0; i < nx; i++) {
      const x = bounds.x0 + ((i + 0.5) / nx) * w;
      const bi = Math.min(buckets - 1, Math.floor(((x - bounds.x0) / w) * buckets));
      const bj = Math.min(buckets - 1, Math.floor(((y - bounds.y0) / h) * buckets));
      // Grow the search ring until it holds k nodes (or everything).
      let candidates = [];
      for (let ring = 0; ring <= buckets; ring++) {
        candidates = [];
        for (let a = Math.max(0, bi - ring); a <= Math.min(buckets - 1, bi + ring); a++) {
          for (let b = Math.max(0, bj - ring); b <= Math.min(buckets - 1, bj + ring); b++) candidates.push(...grid[a + b * buckets]);
        }
        if (candidates.length >= Math.min(k, nodes.length)) break;
      }
      const near = candidates.map((n) => [n, (n.x - x) ** 2 + (n.y - y) ** 2]).sort((a, b) => a[1] - b[1]).slice(0, k);
      let sw = 0;
      let sv = 0;
      let exact = null;
      for (const [n, d2] of near) {
        if (d2 < 1e-18) { exact = n.T; break; }
        const wgt = 1 / d2 ** (p / 2);
        sw += wgt;
        sv += wgt * n.T;
      }
      out[i + j * nx] = exact ?? (sw > 0 ? sv / sw : NaN);
    }
  }
  return out;
}

/** A sample node file (a radiator panel with a hot electronics box), for the gallery and the guide. */
export function sampleNodeCsv() {
  const rows = ['node,x,y,z,T'];
  let id = 1;
  for (let j = 0; j <= 12; j++) {
    for (let i = 0; i <= 20; i++) {
      const x = i * 50;
      const y = j * 50;
      const box = Math.exp(-(((x - 300) / 180) ** 2 + ((y - 350) / 140) ** 2));
      const strap = Math.exp(-(((x - 750) / 90) ** 2 + ((y - 150) / 220) ** 2));
      const T = -20 + 65 * box + 25 * strap + 4 * Math.sin(i * 0.9 + j * 0.4);
      rows.push(`${id++},${x},${y},0,${T.toFixed(2)}`);
    }
  }
  return `${rows.join('\n')}\n`;
}

/**
 * Sample 3D node data: thermocouples on three layers (z = 0, 40, 80 mm) of a 200 × 120 mm battery module, hottest in
 * the middle layer near the busbar end (x = 180 mm) — for the z range and the 3D point view.
 */
export function sampleNodeCsv3d() {
  const rows = ['node,x,y,z,T'];
  let id = 1;
  for (const z of [0, 40, 80]) {
    for (let j = 0; j <= 6; j++) {
      for (let i = 0; i <= 10; i++) {
        const x = i * 20;
        const y = j * 20;
        const core = Math.exp(-(((x - 180) / 70) ** 2 + ((y - 60) / 50) ** 2 + ((z - 40) / 45) ** 2));
        const T = 24 + 21 * core + 0.06 * x + 1.5 * Math.cos(i * 0.7 + j * 0.5);
        rows.push(`${id++},${x},${y},${z},${T.toFixed(2)}`);
      }
    }
  }
  return `${rows.join('\n')}\n`;
}

/**
 * Difference of two node sets matched by node id: [{ id, x, y, z (from B), T: TB − TA, TA, TB }] — node-shaped, so it
 * feeds nodeStats / idwRaster directly. Nodes present in only one set are left out.
 */
export function deltaMap(nodesA, nodesB) {
  const byId = new Map(nodesA.map((n) => [String(n.id), n]));
  const out = [];
  for (const b of nodesB) {
    const a = byId.get(String(b.id));
    if (!a) continue;
    out.push({ id: b.id, x: b.x, y: b.y, z: b.z ?? 0, time: b.time ?? 0, T: b.T - a.T, TA: a.T, TB: b.T });
  }
  return out;
}

/**
 * Per-node envelope over several node sets (time steps or load cases), matched by id:
 * [{ id, x, y, z, T: max, max, min, range, maxSet, minSet (index of the set) }] — node-shaped (T = max).
 */
export function envelope(nodeSets) {
  const map = new Map();
  nodeSets.forEach((nodes, s) => {
    for (const n of nodes) {
      const key = String(n.id);
      const e = map.get(key);
      if (!e) { map.set(key, { id: n.id, x: n.x, y: n.y, z: n.z ?? 0, max: n.T, min: n.T, maxSet: s, minSet: s }); continue; }
      if (n.T > e.max) { e.max = n.T; e.maxSet = s; }
      if (n.T < e.min) { e.min = n.T; e.minSet = s; }
    }
  });
  return [...map.values()].map((e) => ({ ...e, T: e.max, range: e.max - e.min }));
}

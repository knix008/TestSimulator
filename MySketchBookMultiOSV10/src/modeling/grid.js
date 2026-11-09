// Uniform spatial hash grids. They keep every operation local: merging a vertex,
// finding the edges a new segment crosses or the faces under a point only looks
// at a few cells instead of the whole model (models of 50k+ edges stay interactive).

const hash = (i, j, k) => (Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ Math.imul(k, 83492791)) | 0;

// Items with an axis-aligned box (edges, faces). Cells may collide in the hash; the
// caller always checks real geometry, so a collision only costs a little time.
export class BoxGrid {
  constructor(cell = 0.5, maxCells = 4096) {
    this.cell = cell;
    this.maxCells = maxCells;
    this.cells = new Map(); // hash -> Set(id)
    this.itemCells = new Map(); // id -> array of hashes, or null for "big" items
    this.big = new Set(); // items too large for the grid, always returned
  }

  _range(min, max) {
    const c = this.cell;
    return [Math.floor(min.x / c), Math.floor(min.y / c), Math.floor(min.z / c), Math.floor(max.x / c), Math.floor(max.y / c), Math.floor(max.z / c)];
  }

  insert(id, min, max) {
    if (this.itemCells.has(id)) this.remove(id);
    const [i0, j0, k0, i1, j1, k1] = this._range(min, max);
    const count = (i1 - i0 + 1) * (j1 - j0 + 1) * (k1 - k0 + 1);
    if (!(count <= this.maxCells)) { // also catches NaN
      this.big.add(id);
      this.itemCells.set(id, null);
      return;
    }
    const list = [];
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
      const h = hash(i, j, k);
      let s = this.cells.get(h);
      if (!s) { s = new Set(); this.cells.set(h, s); }
      if (!s.has(id)) { s.add(id); list.push(h); }
    }
    this.itemCells.set(id, list);
  }

  remove(id) {
    const list = this.itemCells.get(id);
    if (list === undefined) return;
    if (list === null) this.big.delete(id);
    else for (const h of list) {
      const s = this.cells.get(h);
      if (s) { s.delete(id); if (!s.size) this.cells.delete(h); }
    }
    this.itemCells.delete(id);
  }

  // Ids whose cells overlap the box (a superset of the real overlaps).
  queryBox(min, max, out = new Set()) {
    for (const id of this.big) out.add(id);
    const [i0, j0, k0, i1, j1, k1] = this._range(min, max);
    const count = (i1 - i0 + 1) * (j1 - j0 + 1) * (k1 - k0 + 1);
    if (count > this.maxCells * 4) {
      // huge query box: scanning all items is cheaper than walking the cells
      for (const id of this.itemCells.keys()) out.add(id);
      return out;
    }
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
      const s = this.cells.get(hash(i, j, k));
      if (s) for (const id of s) out.add(id);
    }
    return out;
  }

  // Ids near the segment a-b (within pad). Long diagonal segments walk along the
  // segment instead of scanning their whole bounding box.
  querySegment(a, b, pad, out = new Set()) {
    const min = { x: Math.min(a.x, b.x) - pad, y: Math.min(a.y, b.y) - pad, z: Math.min(a.z, b.z) - pad };
    const max = { x: Math.max(a.x, b.x) + pad, y: Math.max(a.y, b.y) + pad, z: Math.max(a.z, b.z) + pad };
    const [i0, j0, k0, i1, j1, k1] = this._range(min, max);
    const count = (i1 - i0 + 1) * (j1 - j0 + 1) * (k1 - k0 + 1);
    if (count <= 512) return this.queryBox(min, max, out);
    for (const id of this.big) out.add(id);
    const c = this.cell;
    const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    const steps = Math.max(1, Math.ceil(L / (c * 0.5)));
    const seen = new Set();
    const r = Math.ceil(pad / c) + 1;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const ci = Math.floor((a.x + (b.x - a.x) * t) / c), cj = Math.floor((a.y + (b.y - a.y) * t) / c), ck = Math.floor((a.z + (b.z - a.z) * t) / c);
      for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) for (let k = ck - r; k <= ck + r; k++) {
        const h = hash(i, j, k);
        if (seen.has(h)) continue;
        seen.add(h);
        const set = this.cells.get(h);
        if (set) for (const id of set) out.add(id);
      }
    }
    return out;
  }

  clear() { this.cells.clear(); this.itemCells.clear(); this.big.clear(); }
}

// Points (vertices). Cell size is a few merge tolerances so a lookup checks 27 small cells.
export class PointGrid {
  constructor(cell) {
    this.cell = cell;
    this.cells = new Map(); // hash -> array of ids
  }
  _key(p) { const c = this.cell; return [Math.floor(p.x / c), Math.floor(p.y / c), Math.floor(p.z / c)]; }
  insert(id, p) {
    const [i, j, k] = this._key(p);
    const h = hash(i, j, k);
    let a = this.cells.get(h);
    if (!a) { a = []; this.cells.set(h, a); }
    a.push(id);
  }
  remove(id, p) {
    const [i, j, k] = this._key(p);
    const h = hash(i, j, k);
    const a = this.cells.get(h);
    if (!a) return;
    const at = a.indexOf(id);
    if (at >= 0) { a[at] = a[a.length - 1]; a.pop(); }
    if (!a.length) this.cells.delete(h);
  }
  // Calls fn(id) for every id in the 27 cells around p.
  near(p, fn) {
    const [ci, cj, ck] = this._key(p);
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) for (let k = ck - 1; k <= ck + 1; k++) {
      const a = this.cells.get(hash(i, j, k));
      if (a) for (let n = 0; n < a.length; n++) if (fn(a[n]) === true) return;
    }
  }
  clear() { this.cells.clear(); }
}

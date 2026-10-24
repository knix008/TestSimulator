// Isosurfaces of a cell-centred 3D field (for the 3D view): the cell values are
// averaged to the cell corners (void cells left out), every simulated cell is
// cut into six tetrahedra sharing its main diagonal (a conforming split, so
// neighbouring cells share their triangles' edges and the surface has no
// cracks) and each tetrahedron is cut at the iso value. This "marching
// tetrahedra" variant needs no 256-case tables and has no ambiguous cases; it
// makes somewhat more triangles than table-driven marching cubes.
// 2D isotherm lines are drawn by EditorView2D.paintIsotherms (src/ui/editor2d.js).
// Pure functions, unit-tested in Node.

// Cube corners (di, dj, dk) and the six tetrahedra around the 0–6 diagonal.
const CORNERS = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
const TETS = [[0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6]];

/**
 * Corner (node) values of a cell field: the mean of the up to eight simulated cells around each node; NaN where none is.
 * Node index i + (nx+1)·(j + (ny+1)·k).
 */
export function nodeValues(grid, values, mat = null) {
  const { nx, ny } = grid;
  const nz = grid.dim === 3 ? grid.nz : 1;
  const out = new Float32Array((nx + 1) * (ny + 1) * (nz + 1));
  for (let k = 0; k <= nz; k++) for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    let sum = 0; let n = 0;
    for (let c = k - 1; c <= k; c++) for (let b = j - 1; b <= j; b++) for (let a = i - 1; a <= i; a++) {
      if (a < 0 || b < 0 || c < 0 || a >= nx || b >= ny || c >= nz) continue;
      const idx = a + nx * (b + ny * c);
      if ((mat && mat[idx] >= 255) || !Number.isFinite(values[idx])) continue;
      sum += values[idx]; n++;
    }
    out[i + (nx + 1) * (j + (ny + 1) * k)] = n ? sum / n : NaN;
  }
  return out;
}

/**
 * Isosurface at `iso` of a 3D cell-centred field. grid { dim: 3, nx, ny, nz, dx, dy, dz (mm) }, values per cell, mat
 * (255 = void, optional). Returns { positions: Float32Array (x, y, z mm per vertex, shared between triangles),
 * indices: Uint32Array (three per triangle, wound so the normal faces the lower values), triangles }.
 */
export function marchingCubes(grid, values, mat, iso) {
  if (grid.dim !== 3) return { positions: new Float32Array(0), indices: new Uint32Array(0), triangles: 0 };
  const { nx, ny, nz, dx, dy, dz } = grid;
  const nodes = nodeValues(grid, values, mat);
  const node = (i, j, k) => i + (nx + 1) * (j + (ny + 1) * k);
  const positions = [];
  const indices = [];
  const edgeVertex = new Map();
  const vertexOn = (a, b, pa, pb, va, vb) => {
    const key = a < b ? a * nodes.length + b : b * nodes.length + a;
    let v = edgeVertex.get(key);
    if (v === undefined) {
      const t = vb === va ? 0.5 : (iso - va) / (vb - va);
      v = positions.length / 3;
      positions.push(pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t, pa[2] + (pb[2] - pa[2]) * t);
      edgeVertex.set(key, v);
    }
    return v;
  };
  const emit = (v0, v1, v2, gradient) => {
    if (v0 === v1 || v1 === v2 || v0 === v2) return;
    const p = (v) => [positions[3 * v], positions[3 * v + 1], positions[3 * v + 2]];
    const a = p(v0); const b = p(v1); const c = p(v2);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    if (n[0] * gradient[0] + n[1] * gradient[1] + n[2] * gradient[2] > 0) indices.push(v0, v2, v1);
    else indices.push(v0, v1, v2);
  };
  const ids = new Array(8); const pos = new Array(8); const val = new Array(8);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const cell = i + nx * (j + ny * k);
    if ((mat && mat[cell] >= 255) || !Number.isFinite(values[cell])) continue;
    let ok = true; let above = 0;
    for (let c = 0; c < 8; c++) {
      const [di, dj, dk] = CORNERS[c];
      ids[c] = node(i + di, j + dj, k + dk);
      val[c] = nodes[ids[c]];
      if (!Number.isFinite(val[c])) { ok = false; break; }
      pos[c] = [(i + di) * dx, (j + dj) * dy, (k + dk) * dz];
      if (val[c] >= iso) above++;
    }
    if (!ok || above === 0 || above === 8) continue;
    for (const tet of TETS) {
      const up = tet.filter((c) => val[c] >= iso);
      const down = tet.filter((c) => val[c] < iso);
      if (!up.length || !down.length) continue;
      // Direction of increasing value across this tetrahedron (centroid of the "up" corners minus the "down" ones).
      const centre = (list) => [0, 1, 2].map((ax) => list.reduce((s, c) => s + pos[c][ax], 0) / list.length);
      const cu = centre(up); const cd = centre(down);
      const gradient = [cu[0] - cd[0], cu[1] - cd[1], cu[2] - cd[2]];
      const cut = (a, b) => vertexOn(ids[a], ids[b], pos[a], pos[b], val[a], val[b]);
      if (up.length === 1 || down.length === 1) {
        const [lone, others] = up.length === 1 ? [up[0], down] : [down[0], up];
        emit(cut(lone, others[0]), cut(lone, others[1]), cut(lone, others[2]), gradient);
      } else {
        const [a, b] = up; const [c, d] = down;
        const ac = cut(a, c); const ad = cut(a, d); const bd = cut(b, d); const bc = cut(b, c);
        emit(ac, ad, bd, gradient);
        emit(ac, bd, bc, gradient);
      }
    }
  }
  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices), triangles: indices.length / 3 };
}

// CAM in 3D (FreeCAD CAM 3D Surface, Waterline and the CAM simulator): a
// solid's top surface as a height field, a ball or flat end mill dropped onto
// it (drop-cutter: the tool tip height that touches without cutting into the
// model), roughing in Z levels with stock left on, raster finishing, and a
// material-removal simulator over a stock height field (dexels) that also
// reports gouges and material left. No DOM.

/** The top surface of triangles: a grid of heights, cells `cell` mm, the empty cells at the floor. */
export function heightField(tris, { cell = 0, pad = 0, maxCells = 320 } = {}) {
  if (!tris.length) return null;
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
  for (const t of tris) for (const p of t) {
    if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
    if (p[2] < minZ) minZ = p[2]; if (p[2] > maxZ) maxZ = p[2];
  }
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  const size = Math.max(maxX - minX, maxY - minY);
  const step = Math.max(cell || 0, size / maxCells, 1e-3);
  const nx = Math.max(2, Math.ceil((maxX - minX) / step) + 1);
  const ny = Math.max(2, Math.ceil((maxY - minY) / step) + 1);
  const z = new Array(nx * ny).fill(minZ);
  for (const [a, b, c] of tris) {
    const det = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
    if (Math.abs(det) < 1e-12) continue; // seen edge-on from above
    const i0 = Math.max(0, Math.ceil((Math.min(a[0], b[0], c[0]) - minX) / step));
    const i1 = Math.min(nx - 1, Math.floor((Math.max(a[0], b[0], c[0]) - minX) / step));
    const j0 = Math.max(0, Math.ceil((Math.min(a[1], b[1], c[1]) - minY) / step));
    const j1 = Math.min(ny - 1, Math.floor((Math.max(a[1], b[1], c[1]) - minY) / step));
    for (let j = j0; j <= j1; j++) {
      const y = minY + j * step;
      for (let i = i0; i <= i1; i++) {
        const x = minX + i * step;
        const u = ((b[0] - x) * (c[1] - y) - (c[0] - x) * (b[1] - y)) / det;
        const v = ((c[0] - x) * (a[1] - y) - (a[0] - x) * (c[1] - y)) / det;
        const w = 1 - u - v;
        if (u < -1e-9 || v < -1e-9 || w < -1e-9) continue;
        const h = u * a[2] + v * b[2] + w * c[2];
        if (h > z[j * nx + i]) z[j * nx + i] = h;
      }
    }
  }
  return { x0: minX, y0: minY, cell: step, nx, ny, z: z.map((v) => Math.round(v * 1e4) / 1e4), zMin: minZ, zMax: maxZ };
}

/** Cells of a tool footprint: [di, dj, lift] — how far above the tip the tool's surface is there. */
function toolKernel(cell, radius, shape) {
  const n = Math.ceil(radius / cell);
  const out = [];
  for (let dj = -n; dj <= n; dj++) for (let di = -n; di <= n; di++) {
    const d = Math.hypot(di, dj) * cell;
    if (d > radius + 1e-9) continue;
    out.push([di, dj, shape === 'ball' ? radius - Math.sqrt(Math.max(0, radius * radius - d * d)) : 0]);
  }
  return out;
}

/**
 * Drop-cutter: for every cell, the lowest tool-tip height at which the tool
 * (ball or flat, `radius`) touches the surface without cutting into it.
 */
export function dropCutter(field, radius, shape = 'flat') {
  const { nx, ny, z } = field;
  const kernel = toolKernel(field.cell, radius, shape);
  const tip = new Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      let best = -Infinity;
      for (const [di, dj, lift] of kernel) {
        const ii = i + di; const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
        const h = z[jj * nx + ii] - lift;
        if (h > best) best = h;
      }
      tip[j * nx + i] = best;
    }
  }
  return tip;
}

/** Drops the middle of runs that lie on one straight line (in x, y and z). */
function simplify(points, tol = 1e-3) {
  if (points.length < 3) return points;
  const out = [points[0]];
  for (let k = 1; k < points.length - 1; k++) {
    const a = out[out.length - 1]; const b = points[k]; const c = points[k + 1];
    const ab = [b.x - a.x, b.y - a.y, b.z - a.z]; const ac = [c.x - a.x, c.y - a.y, c.z - a.z];
    const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const len = Math.hypot(...ac) || 1;
    if (Math.hypot(...cross) / len > tol) out.push(b);
  }
  out.push(points[points.length - 1]);
  return out;
}

/**
 * Steep steps between samples: going up, the tool rises first and then moves
 * across; going down, across first and then down — a straight slant between
 * two samples would cut through the side of a wall.
 */
function stairs(points, cell) {
  // (cell = 0: every change of height is a step — roughing, which leaves stock anyway.)
  const out = [];
  for (const p of points) {
    const q = out[out.length - 1];
    if (q && Math.abs(p.z - q.z) > cell) out.push(p.z > q.z ? { x: q.x, y: q.y, z: p.z } : { x: p.x, y: p.y, z: q.z });
    out.push(p);
  }
  return out;
}

/** Raster lines across the field (along x or y), `gap` mm apart, zigzag. Each: a list of cell indices. */
function rasterLines(field, gap, direction) {
  const { nx, ny } = field;
  const along = direction === 'y' ? ny : nx;
  const across = direction === 'y' ? nx : ny;
  const every = Math.max(1, Math.round(gap / field.cell));
  const lines = [];
  for (let a = 0, k = 0; a < across; a += every, k++) {
    const line = [];
    for (let b = 0; b < along; b++) line.push(direction === 'y' ? b * nx + a : a * nx + b);
    if (k % 2) line.reverse();
    lines.push(line);
  }
  // The last line on the far edge.
  const last = (Math.ceil((across - 1) / every)) * every;
  if (last !== across - 1 && lines.length) {
    const line = [];
    for (let b = 0; b < along; b++) line.push(direction === 'y' ? b * nx + (across - 1) : (across - 1) * nx + b);
    if (lines.length % 2) line.reverse();
    lines.push(line);
  }
  return lines;
}

const at = (field, c) => ({ x: field.x0 + (c % field.nx) * field.cell, y: field.y0 + Math.floor(c / field.nx) * field.cell });

/**
 * 3D tool paths over a height field: 'rough3d' clears the stock in levels
 * `stepDown` apart leaving `leave` mm on the surface (only where there is
 * material at that level), 'finish3d' rasters the surface with the tool
 * touching it. Paths: [{ op, kind: 'cut', points: [{ x, y, z }] }].
 */
export function surfacePaths(field, o) {
  const r = o.tool / 2;
  const tip = dropCutter(field, r, o.toolShape);
  const top = field.zMax + o.stockTop;
  const paths = [];
  const gap = Math.max(field.cell, o.tool * o.stepOver);
  if (o.operation === 'rough3d') {
    let previous = top;
    for (let level = top - o.stepDown; ; level -= o.stepDown) {
      const z = Math.max(level, field.zMin);
      for (const line of rasterLines(field, gap, o.direction)) {
        let run = [];
        const flush = () => { if (run.length > 1) paths.push({ op: 'rough3d', kind: 'cut', points: simplify(stairs(run, 0)) }); run = []; };
        for (const c of line) {
          const want = Math.max(z, tip[c] + o.leave);
          if (want < previous - 1e-6) run.push({ ...at(field, c), z: want }); else flush();
        }
        flush();
      }
      previous = z;
      if (z <= field.zMin + 1e-9) break;
    }
  } else {
    for (const line of rasterLines(field, gap, o.direction)) {
      paths.push({ op: 'finish3d', kind: 'cut', points: simplify(stairs(line.map((c) => ({ ...at(field, c), z: tip[c] })), field.cell)) });
    }
  }
  return paths;
}

// ───────────────────────── the simulator

/**
 * The stock (a height field over the same grid, starting `top` high) after the
 * first `count` path points of the job have been cut — plunges included, the
 * rapids above the stock not. Returns { stock, cut: points done, total }.
 * Continue a run by passing the previous { stock, cut } as `from`.
 */
export function simulate(grid, job, { count = Infinity, top = 0, from = null } = {}) {
  const o = job.options;
  const r = o.tool / 2;
  const ball = (o.toolShape ?? 'flat') === 'ball';
  const stock = from ? from.stock : new Array(grid.nx * grid.ny).fill(top);
  // The tool at its exact place: each cell's own distance from the axis (no snapping to the grid).
  const stamp = (x, y, z) => {
    const i0 = Math.max(0, Math.ceil((x - r - grid.x0) / grid.cell)); const i1 = Math.min(grid.nx - 1, Math.floor((x + r - grid.x0) / grid.cell));
    const j0 = Math.max(0, Math.ceil((y - r - grid.y0) / grid.cell)); const j1 = Math.min(grid.ny - 1, Math.floor((y + r - grid.y0) / grid.cell));
    for (let j = j0; j <= j1; j++) {
      const dy = grid.y0 + j * grid.cell - y;
      for (let i = i0; i <= i1; i++) {
        const dx = grid.x0 + i * grid.cell - x;
        const d2 = dx * dx + dy * dy;
        if (d2 > r * r + 1e-9) continue;
        const surface = z + (ball ? r - Math.sqrt(Math.max(0, r * r - d2)) : 0);
        const k = j * grid.nx + i;
        if (surface < stock[k]) stock[k] = surface;
      }
    }
  };
  const total = job.paths.reduce((s, p) => s + p.points.length, 0);
  const start = from?.cut ?? 0;
  const end = Math.min(total, count);
  let index = 0;
  for (const path of job.paths) {
    for (let k = 0; k < path.points.length; k++, index++) {
      if (index < start) continue;
      if (index >= end) return { stock, cut: end, total };
      const p = path.points[k];
      if (path.kind === 'drill') { stamp(p.x, p.y, p.z); continue; }
      if (k === 0) { stamp(p.x, p.y, p.z); continue; }
      const q = path.points[k - 1];
      const steps = Math.max(1, Math.ceil(Math.hypot(p.x - q.x, p.y - q.y) / (grid.cell * 0.5)));
      for (let s = 1; s <= steps; s++) { const t = s / steps; stamp(q.x + (p.x - q.x) * t, q.y + (p.y - q.y) * t, q.z + (p.z - q.z) * t); }
    }
  }
  return { stock, cut: end, total };
}

/** How the stock compares with the model: gouge (cut into it) and material left, both the largest, mm. */
export function stockCheck(field, stock) {
  let gouge = 0; let left = 0;
  for (let k = 0; k < stock.length; k++) {
    const d = stock[k] - field.z[k];
    if (-d > gouge) gouge = -d;
    if (d > left) left = d;
  }
  return { gouge, left };
}

/** A grid for simulating a 2.5D job: the paths' extent plus the tool, the stock top at `top`. */
export function gridFor(job, cell = 0) {
  const pts = job.paths.flatMap((p) => p.points);
  if (!pts.length) return null;
  const r = job.options.tool / 2 + 1;
  const xs = pts.map((p) => p.x); const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs) - r; const minY = Math.min(...ys) - r;
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) + 2 * r;
  const step = Math.max(cell, size / 240);
  const nx = Math.ceil((Math.max(...xs) + r - minX) / step) + 1; const ny = Math.ceil((Math.max(...ys) + r - minY) / step) + 1;
  const floor = Math.min(...pts.map((p) => p.z));
  return { x0: minX, y0: minY, cell: step, nx, ny, z: new Array(nx * ny).fill(floor), zMin: floor, zMax: job.options.top };
}

/**
 * The machined stock as a closed mesh (top from the height field, four walls,
 * a bottom at `bottom`): triangles in drawing coordinates, for a solid.
 */
export function stockMesh(grid, stock, bottom) {
  const { nx, ny, cell, x0, y0 } = grid;
  const P = (i, j) => [x0 + i * cell, y0 + j * cell, stock[j * nx + i]];
  const B = (i, j) => [x0 + i * cell, y0 + j * cell, bottom];
  const tris = [];
  for (let j = 0; j + 1 < ny; j++) for (let i = 0; i + 1 < nx; i++) {
    tris.push([P(i, j), P(i + 1, j), P(i + 1, j + 1)], [P(i, j), P(i + 1, j + 1), P(i, j + 1)]);
  }
  for (let i = 0; i + 1 < nx; i++) {
    tris.push([B(i, 0), B(i + 1, 0), P(i + 1, 0)], [B(i, 0), P(i + 1, 0), P(i, 0)]);
    tris.push([B(i + 1, ny - 1), B(i, ny - 1), P(i, ny - 1)], [B(i + 1, ny - 1), P(i, ny - 1), P(i + 1, ny - 1)]);
  }
  for (let j = 0; j + 1 < ny; j++) {
    tris.push([B(0, j + 1), B(0, j), P(0, j)], [B(0, j + 1), P(0, j), P(0, j + 1)]);
    tris.push([B(nx - 1, j), B(nx - 1, j + 1), P(nx - 1, j + 1)], [B(nx - 1, j), P(nx - 1, j + 1), P(nx - 1, j)]);
  }
  tris.push([B(0, 0), B(nx - 1, ny - 1), B(nx - 1, 0)], [B(0, 0), B(0, ny - 1), B(nx - 1, ny - 1)]);
  return tris;
}

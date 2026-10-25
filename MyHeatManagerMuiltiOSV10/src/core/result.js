// Reading the engine's result bytes (ARCHITECTURE.md "Result bytes") and the
// derived quantities the views need (magnitudes, ranges, samples along a line).

import { bodyContains } from './model.js';

export const MAGIC = 0x54484d48;

/** Decodes result bytes into { header, data: Float32Array }. */
export function decodeResult(buffer) {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (bytes.byteLength < 8) throw new Error('empty result');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== MAGIC) throw new Error('not a MyHeatManager result');
  const length = view.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + length)));
  const start = 8 + length;
  // Copy so the floats are aligned whatever the source buffer was.
  const data = new Float32Array(bytes.slice(start, start + Math.floor((bytes.byteLength - start) / 4) * 4).buffer);
  return { header, data };
}

/** One frame of a stored field, or null when the result has no such field. */
export function field(result, name, frame = 0) {
  const info = result?.header?.fields?.[name];
  if (!info) return null;
  const f = Math.max(0, Math.min((info.frames ?? 1) - 1, frame));
  const offset = info.offset + f * info.length;
  return result.data.subarray(offset, offset + info.length);
}

export function frameCount(result, name) {
  return result?.header?.fields?.[name]?.frames ?? 0;
}

/** √(a² + b² + c²) per cell. */
export function magnitude(...parts) {
  const list = parts.filter(Boolean);
  if (!list.length) return null;
  const out = new Float32Array(list[0].length);
  for (let i = 0; i < out.length; i++) {
    let s = 0;
    for (const p of list) s += p[i] * p[i];
    out[i] = Math.sqrt(s);
  }
  return out;
}

/**
 * The scalar a "view field" shows: T, |q|, |u|, p, von Mises, |d|, liquid fraction.
 * Returns { values, unit, frames } or null when the result does not have it.
 */
export function viewField(result, kind, frame = 0) {
  switch (kind) {
    case 'T': return field(result, 'T', frame) && { values: field(result, 'T', frame), unit: '°C', frames: frameCount(result, 'T') };
    case 'flux': {
      const values = magnitude(field(result, 'qx'), field(result, 'qy'), field(result, 'qz'));
      return values && { values, unit: 'W/m²', frames: 1 };
    }
    case 'velocity': {
      // The engine writes |U| as "speed" (with w in 3D); older results have u and v only.
      const values = field(result, 'speed') ?? magnitude(field(result, 'u'), field(result, 'v'), field(result, 'w'));
      return values && { values, unit: 'm/s', frames: 1 };
    }
    case 'pressure': return field(result, 'p') && { values: field(result, 'p'), unit: 'Pa', frames: 1 };
    case 'stress': return field(result, 'vonMises') && { values: field(result, 'vonMises'), unit: 'MPa', scale: 1e-6, frames: 1 };
    case 'disp': {
      const values = magnitude(field(result, 'dispX'), field(result, 'dispY'), field(result, 'dispZ'));
      return values && { values, unit: 'µm', scale: 1e6, frames: 1 };
    }
    case 'liquid': return field(result, 'liquid', frame) && { values: field(result, 'liquid', frame), unit: '', frames: frameCount(result, 'liquid') };
    case 'turbulence': return field(result, 'nut') && { values: field(result, 'nut'), unit: 'm²/s', frames: 1 };
    case 'voltage': return field(result, 'V') && { values: field(result, 'V'), unit: 'V', frames: 1 };
    case 'current': return field(result, 'J') && { values: field(result, 'J'), unit: 'A/mm²', scale: 1e-6, frames: 1 };
    case 'mode': {
      // `frame` picks the mode (0-based) for this kind.
      const k = frame + 1;
      const values = magnitude(field(result, `modeX_${k}`), field(result, `modeY_${k}`), field(result, `modeZ_${k}`));
      return values && { values, unit: '', frames: 1 };
    }
    case 'comfort': return result.derived?.pmv ? { values: result.derived.pmv, unit: 'PMV', frames: 1 } : null;
    case 'ppd': return result.derived?.ppd ? { values: result.derived.ppd, unit: 'PPD %', frames: 1 } : null;
    case 'calc': return result.derived?.calc ? { values: result.derived.calc.values, unit: result.derived.calc.unit, frames: 1 } : null;
    default: return null;
  }
}

/** Min / max over simulated cells (mat ≠ 255), ignoring non-finite values. */
export function range(values, mat) {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < values.length; i++) {
    if (mat && mat[i] >= 255) continue;
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (lo === Infinity) return { lo: 0, hi: 1 };
  if (hi - lo < 1e-12) return { lo: lo - 0.5, hi: hi + 0.5 };
  return { lo, hi };
}

/** Min / max of a field over every stored frame (one colour scale for a whole animation). Cached per result. */
export function rangeAllFrames(result, name) {
  result.ranges ??= {};
  if (result.ranges[name]) return result.ranges[name];
  const mat = field(result, 'mat');
  let lo = Infinity;
  let hi = -Infinity;
  for (let f = 0; f < frameCount(result, name); f++) {
    const r = range(field(result, name, f), mat);
    lo = Math.min(lo, r.lo);
    hi = Math.max(hi, r.hi);
  }
  result.ranges[name] = lo <= hi ? { lo, hi } : { lo: 0, hi: 1 };
  return result.ranges[name];
}

/** Cell index of a point (mm), or -1 outside the grid. */
export function cellAt(grid, x, y, z = null) {
  const i = Math.floor(x / grid.dx);
  const j = Math.floor(y / grid.dy);
  const k = grid.dim === 3 ? Math.floor((z ?? 0) / grid.dz) : 0;
  if (i < 0 || j < 0 || k < 0 || i >= grid.nx || j >= grid.ny || k >= (grid.dim === 3 ? grid.nz : 1)) return -1;
  return i + grid.nx * (j + grid.ny * k);
}

/** Values along the segment a→b (mm) in the layer k: [{ s (mm from a), x, y, value }]. */
export function sampleLine(grid, values, mat, a, b, layer = 0, samples = 200) {
  const out = [];
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  for (let n = 0; n <= samples; n++) {
    const t = n / samples;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const i = Math.floor(x / grid.dx);
    const j = Math.floor(y / grid.dy);
    if (i < 0 || j < 0 || i >= grid.nx || j >= grid.ny) continue;
    const index = i + grid.nx * (j + grid.ny * layer);
    if (mat && mat[index] >= 255) continue;
    out.push({ s: length * t, x, y, value: values[index] });
  }
  return out;
}

/** Per-cell CSV of the shown field: x, y, (z) in mm and the value. */
export function fieldCsv(result, values, name, unit) {
  const { grid } = result.header;
  const mat = field(result, 'mat');
  const layers = grid.dim === 3 ? grid.nz : 1;
  const rows = [grid.dim === 3 ? `x_mm,y_mm,z_mm,${name}${unit ? `_${unit}` : ''}` : `x_mm,y_mm,${name}${unit ? `_${unit}` : ''}`];
  for (let k = 0; k < layers; k++) {
    for (let j = 0; j < grid.ny; j++) {
      for (let i = 0; i < grid.nx; i++) {
        const index = i + grid.nx * (j + grid.ny * k);
        if (mat && mat[index] >= 255) continue;
        const x = ((i + 0.5) * grid.dx).toFixed(4);
        const y = ((j + 0.5) * grid.dy).toFixed(4);
        const v = Number(values[index]).toPrecision(7);
        rows.push(grid.dim === 3 ? `${x},${y},${((k + 0.5) * grid.dz).toFixed(4)},${v}` : `${x},${y},${v}`);
      }
    }
  }
  return `${rows.join('\n')}\n`;
}

/** Legacy-VTK structured points with every cell field of the last frame (ParaView, VisIt). */
export function resultVtk(result, title = 'MyHeatManager') {
  const { grid, fields } = result.header;
  const nz = grid.dim === 3 ? grid.nz : 1;
  const cells = grid.nx * grid.ny * nz;
  const lines = [
    '# vtk DataFile Version 3.0',
    title.replace(/\n/g, ' ').slice(0, 250),
    'ASCII',
    'DATASET STRUCTURED_POINTS',
    `DIMENSIONS ${grid.nx + 1} ${grid.ny + 1} ${nz + 1}`,
    'ORIGIN 0 0 0',
    `SPACING ${grid.dx} ${grid.dy} ${grid.dim === 3 ? grid.dz : grid.dz}`,
    `CELL_DATA ${cells}`,
  ];
  for (const name of Object.keys(fields)) {
    const info = fields[name];
    if (info.length !== cells) continue;
    const values = field(result, name, (info.frames ?? 1) - 1);
    lines.push(`SCALARS ${name} float 1`, 'LOOKUP_TABLE default');
    for (let i = 0; i < values.length; i += 8) lines.push(Array.from(values.subarray(i, i + 8), (v) => (Number.isFinite(v) ? v.toPrecision(7) : '0')).join(' '));
  }
  return `${lines.join('\n')}\n`;
}

/** Is cell `index` simulated (mat ≠ 255 and a finite value)? */
function live(values, mat, index) {
  return !(mat && mat[index] >= 255) && Number.isFinite(values[index]);
}

/**
 * Values along the segment a→b (mm, {x, y, z}) through a 3D (or 2D) grid with trilinear interpolation between cell
 * centres: [{ s (mm from a), x, y, z, value }]. A point in a void cell gives NaN; void neighbours are left out of the
 * weights. Points outside the domain are skipped (like sampleLine).
 */
export function sampleLine3D(grid, values, mat, a, b, samples = 200) {
  const is3d = grid.dim === 3;
  const nz = is3d ? grid.nz : 1;
  const az = is3d ? a.z ?? 0 : 0;
  const bz = is3d ? b.z ?? 0 : 0;
  const length = Math.hypot(b.x - a.x, b.y - a.y, bz - az);
  const out = [];
  for (let n = 0; n <= samples; n++) {
    const t = n / samples;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const z = az + (bz - az) * t;
    const index = cellAt(grid, x, y, is3d ? z : null);
    if (index < 0) continue;
    if (!live(values, mat, index)) { out.push({ s: length * t, x, y, z, value: NaN }); continue; }
    // Continuous cell-centre coordinates, clamped so the edge half-cells hold their value.
    const u = Math.min(grid.nx - 1, Math.max(0, x / grid.dx - 0.5));
    const v = Math.min(grid.ny - 1, Math.max(0, y / grid.dy - 0.5));
    const w = is3d ? Math.min(nz - 1, Math.max(0, z / grid.dz - 0.5)) : 0;
    const i0 = Math.floor(u); const j0 = Math.floor(v); const k0 = Math.floor(w);
    const fu = u - i0; const fv = v - j0; const fw = w - k0;
    let sum = 0; let weight = 0;
    for (let dk = 0; dk <= (is3d ? 1 : 0); dk++) for (let dj = 0; dj <= 1; dj++) for (let di = 0; di <= 1; di++) {
      const i = Math.min(grid.nx - 1, i0 + di); const j = Math.min(grid.ny - 1, j0 + dj); const k = Math.min(nz - 1, k0 + dk);
      const wt = (di ? fu : 1 - fu) * (dj ? fv : 1 - fv) * (is3d ? (dk ? fw : 1 - fw) : 1);
      const idx = i + grid.nx * (j + grid.ny * k);
      if (wt <= 0 || !live(values, mat, idx)) continue;
      sum += wt * values[idx];
      weight += wt;
    }
    out.push({ s: length * t, x, y, z, value: weight > 0 ? sum / weight : values[index] });
  }
  return out;
}

/**
 * One plane of cells: axis 'z' (the layer view: x across, y up), 'y' (x across, z up) or 'x' (z across, y up) at cell
 * `index` (clamped). Returns { width, height, values: Float32Array (row 0 = bottom; void = NaN when `mat` is given),
 * axes: { u, v, du, dv (mm), position (mm of the plane centre) } }.
 */
export function slice(grid, values, axis = 'z', index = 0, mat = null) {
  const nz = grid.dim === 3 ? grid.nz : 1;
  const spec = {
    z: { width: grid.nx, height: grid.ny, n: nz, d: grid.dz, u: 'x', v: 'y', du: grid.dx, dv: grid.dy, at: (a, b, c) => a + grid.nx * (b + grid.ny * c) },
    y: { width: grid.nx, height: nz, n: grid.ny, d: grid.dy, u: 'x', v: 'z', du: grid.dx, dv: grid.dz, at: (a, b, c) => a + grid.nx * (c + grid.ny * b) },
    x: { width: nz, height: grid.ny, n: grid.nx, d: grid.dx, u: 'z', v: 'y', du: grid.dz, dv: grid.dy, at: (a, b, c) => c + grid.nx * (b + grid.ny * a) },
  }[axis];
  if (!spec) throw new Error(`unknown axis ${axis}`);
  const c = Math.min(spec.n - 1, Math.max(0, Math.round(index)));
  const out = new Float32Array(spec.width * spec.height);
  for (let b = 0; b < spec.height; b++) {
    for (let a = 0; a < spec.width; a++) {
      const idx = spec.at(a, b, c);
      out[a + spec.width * b] = mat && mat[idx] >= 255 ? NaN : values[idx];
    }
  }
  return { width: spec.width, height: spec.height, values: out, axes: { u: spec.u, v: spec.v, du: spec.du, dv: spec.dv, position: (c + 0.5) * spec.d, index: c } };
}

/**
 * Volume statistics of a stored field per material (from the 'mat' field and header.materials) and, when the model is
 * given, per body (cells assigned by the same last-body-wins rule as the rasteriser, since the result has no per-cell
 * body ids). Each region: { id, name, cells, volume (m³), min, max, mean (volume-weighted), integral (∫f dV, field unit·m³) }.
 * Returns { materials: [...], bodies: [...] } (bodies empty without a model).
 */
export function bodyIntegrals(result, model = null, fieldName = 'T', frame = 0) {
  const { grid } = result.header;
  const values = field(result, fieldName, frame);
  const mat = field(result, 'mat');
  if (!values) return { materials: [], bodies: [] };
  const nz = grid.dim === 3 ? grid.nz : 1;
  const cellVolume = grid.dx * grid.dy * grid.dz * 1e-9; // mm³ → m³ (2D: dz is the depth)
  const acc = () => ({ cells: 0, volume: 0, min: Infinity, max: -Infinity, integral: 0 });
  const add = (r, v) => { r.cells++; r.volume += cellVolume; r.integral += v * cellVolume; if (v < r.min) r.min = v; if (v > r.max) r.max = v; };
  const finish = (r, id, name) => ({ id, name, cells: r.cells, volume: r.volume, min: r.cells ? r.min : NaN, max: r.cells ? r.max : NaN, mean: r.volume > 0 ? r.integral / r.volume : NaN, integral: r.integral });
  const byMat = new Map();
  const bodies = model ? model.bodies.filter((b) => !b.hidden) : [];
  const byBody = bodies.map(acc);
  for (let k = 0; k < nz; k++) for (let j = 0; j < grid.ny; j++) for (let i = 0; i < grid.nx; i++) {
    const index = i + grid.nx * (j + grid.ny * k);
    const m = mat ? mat[index] : 0;
    const v = values[index];
    if (m >= 255 || !Number.isFinite(v)) continue;
    if (!byMat.has(m)) byMat.set(m, acc());
    add(byMat.get(m), v);
    if (!bodies.length) continue;
    const x = (i + 0.5) * grid.dx; const y = (j + 0.5) * grid.dy; const z = (k + 0.5) * grid.dz;
    for (let n = bodies.length - 1; n >= 0; n--) {
      const body = bodies[n];
      if (grid.dim === 3 && (z < body.z0 || z > body.z1)) continue;
      if (bodyContains(body, x, y)) { add(byBody[n], v); break; }
    }
  }
  const names = result.header.materials ?? [];
  const materialName = (id) => model?.materials?.find((m) => m.id === id)?.name ?? id;
  return {
    materials: [...byMat.entries()].sort((a, b) => a[0] - b[0]).map(([m, r]) => finish(r, names[m] ?? String(m), materialName(names[m] ?? String(m)))),
    bodies: bodies.map((b, n) => finish(byBody[n], b.id, b.name || b.id)),
  };
}

/** Quotes a CSV cell when needed. */
function csvCell(text) {
  const s = String(text);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV of the probe histories: time_s, then one column per probe (named from the model, unit in the header); null → empty. */
export function probesCsv(header, model = null, unitLabel = '°C') {
  const probes = header.probes ?? [];
  const times = header.times ?? [0];
  const name = (p) => model?.probes?.find((x) => x.id === p.id)?.name || p.id;
  const rows = [['time_s', ...probes.map((p) => csvCell(`${name(p)}${unitLabel ? ` (${unitLabel})` : ''}`))].join(',')];
  times.forEach((t, f) => {
    rows.push([t, ...probes.map((p) => (p.values?.[f] == null || !Number.isFinite(p.values[f]) ? '' : Number(p.values[f]).toPrecision(7)))].join(','));
  });
  return `${rows.join('\n')}\n`;
}

/** CSV of a sampled line (sampleLine or sampleLine3D output): s_mm, x_mm, y_mm, (z_mm), value. */
export function lineCsv(samples, name = 'value', unit = '') {
  const has3d = samples.some((p) => p.z != null);
  const label = `${name}${unit ? `_${unit}` : ''}`;
  const rows = [has3d ? `s_mm,x_mm,y_mm,z_mm,${label}` : `s_mm,x_mm,y_mm,${label}`];
  for (const p of samples) {
    const v = Number.isFinite(p.value) ? Number(p.value).toPrecision(7) : '';
    rows.push([p.s.toFixed(4), p.x.toFixed(4), p.y.toFixed(4), ...(has3d ? [(p.z ?? 0).toFixed(4)] : []), v].join(','));
  }
  return `${rows.join('\n')}\n`;
}

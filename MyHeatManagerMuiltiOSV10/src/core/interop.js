// Interchange with the open-source workflow (FreeCAD / Gmsh / CalculiX /
// ParaView): a CalculiX input deck (.inp) of the model's grid — nodes,
// hexahedral (3D) or quadrilateral heat elements (2D), materials, sections,
// boundary conditions and a heat-transfer step — and the import of 2D outlines
// from DXF drawings (closed polylines and circles become bodies).
// SI units in the deck (m, kg, s, K, W). Pure functions, unit-tested in Node.
import { cellSize, materialAt, newId } from './model.js';

/** Cell material ids on the grid (null = void), the same cell-centre rule as the engine. */
function cellMaterials(model) {
  const d = model.domain;
  const { dx, dy, dz } = cellSize(d);
  const nz = d.dim === 3 ? d.nz : 1;
  const out = new Array(d.nx * d.ny * nz);
  for (let k = 0; k < nz; k++) for (let j = 0; j < d.ny; j++) for (let i = 0; i < d.nx; i++) {
    out[i + d.nx * (j + d.ny * k)] = materialAt(model, (i + 0.5) * dx, (j + 0.5) * dy, d.dim === 3 ? (k + 0.5) * dz : null);
  }
  return out;
}

/**
 * CalculiX input deck. 2D models use DC2D4 (heat-transfer quads) with the depth as thickness; 3D models use
 * DC3D8. Exterior convection / radiation / flux go on element faces, fixed temperatures on nodes, body power
 * as volumetric flux (*DFLUX, BF). Steady or transient heat transfer step; nodal temperatures requested.
 */
export function calculixDeck(model) {
  const d = model.domain;
  const is3d = d.dim === 3;
  const { dx, dy, dz } = cellSize(d);
  const nz = is3d ? d.nz : 1;
  const mats = cellMaterials(model);
  const cell = (i, j, k) => (i < 0 || j < 0 || k < 0 || i >= d.nx || j >= d.ny || k >= nz ? null : mats[i + d.nx * (j + d.ny * k)]);
  const nodeId = (i, j, k) => 1 + i + (d.nx + 1) * (j + (d.ny + 1) * k);
  const lines = ['** MyHeatManager → CalculiX input deck', `** ${model.name || 'model'} — ${is3d ? '3D DC3D8' : '2D DC2D4'}, SI units (m, kg, s, K, W)`, '*HEADING', model.name || 'MyHeatManager model', '*NODE'];
  const used = new Set();
  const elements = [];
  for (let k = 0; k < nz; k++) for (let j = 0; j < d.ny; j++) for (let i = 0; i < d.nx; i++) {
    const m = cell(i, j, k);
    if (m == null) continue;
    const n = is3d
      ? [nodeId(i, j, k), nodeId(i + 1, j, k), nodeId(i + 1, j + 1, k), nodeId(i, j + 1, k), nodeId(i, j, k + 1), nodeId(i + 1, j, k + 1), nodeId(i + 1, j + 1, k + 1), nodeId(i, j + 1, k + 1)]
      : [nodeId(i, j, 0), nodeId(i + 1, j, 0), nodeId(i + 1, j + 1, 0), nodeId(i, j + 1, 0)];
    n.forEach((x) => used.add(x));
    elements.push({ id: elements.length + 1, i, j, k, m, n });
  }
  const zLayers = is3d ? nz + 1 : 1;
  for (let k = 0; k < zLayers; k++) for (let j = 0; j <= d.ny; j++) for (let i = 0; i <= d.nx; i++) {
    const id = nodeId(i, j, k);
    if (!used.has(id)) continue;
    lines.push(`${id}, ${(i * dx / 1000).toExponential(6)}, ${(j * dy / 1000).toExponential(6)}, ${is3d ? (k * dz / 1000).toExponential(6) : '0.0'}`);
  }
  const byMat = new Map();
  for (const e of elements) {
    if (!byMat.has(e.m)) byMat.set(e.m, []);
    byMat.get(e.m).push(e);
  }
  const elset = (id) => `M_${String(id).replace(/[^A-Za-z0-9_]/g, '_')}`;
  for (const [m, list] of byMat) {
    lines.push(`*ELEMENT, TYPE=${is3d ? 'DC3D8' : 'DC2D4'}, ELSET=${elset(m)}`);
    for (const e of list) lines.push(`${e.id}, ${e.n.join(', ')}`);
  }
  for (const material of model.materials.filter((x) => byMat.has(x.id))) {
    lines.push(`*MATERIAL, NAME=${elset(material.id)}`, '*CONDUCTIVITY', `${material.k}`, '*DENSITY', `${material.rho}`, '*SPECIFIC HEAT', `${material.cp}`);
    if (material.E) lines.push('*ELASTIC', `${material.E}, ${material.nu ?? 0.3}`, '*EXPANSION, ZERO=' + (model.study.Tref ?? 25), `${material.alpha ?? 0}`);
    lines.push(`*SOLID SECTION, ELSET=${elset(material.id)}, MATERIAL=${elset(material.id)}`);
    if (!is3d) lines.push(`${d.depth / 1000}`);
  }
  // Faces: which element faces lie on the outside (void or domain edge) and their direction.
  const faces2d = [[0, -1, 'F1', 'bottom'], [1, 0, 'F2', 'right'], [0, 1, 'F3', 'top'], [-1, 0, 'F4', 'left']];
  const faces3d = [[0, 0, -1, 'F1', 'front'], [0, 0, 1, 'F2', 'back'], [0, -1, 0, 'F3', 'bottom'], [1, 0, 0, 'F4', 'right'], [0, 1, 0, 'F5', 'top'], [-1, 0, 0, 'F6', 'left']];
  const outside = [];
  for (const e of elements) {
    for (const f of is3d ? faces3d : faces2d) {
      const [fi, fj, fk] = is3d ? f : [f[0], f[1], 0];
      if (cell(e.i + fi, e.j + fj, e.k + fk) == null) {
        const edge = (is3d ? f[4] : f[3]);
        const onEdge = (edge === 'left' && e.i === 0) || (edge === 'right' && e.i === d.nx - 1) || (edge === 'bottom' && e.j === 0) || (edge === 'top' && e.j === d.ny - 1) || (edge === 'front' && e.k === 0) || (edge === 'back' && e.k === nz - 1);
        outside.push({ e, face: is3d ? f[3] : f[2], edge: onEdge ? edge : null, x: (e.i + 0.5 + fi * 0.5) * dx, y: (e.j + 0.5 + fj * 0.5) * dy });
      }
    }
  }
  const matches = (bc, f) => {
    if (bc.region && !(f.x >= bc.region[0] && f.x <= bc.region[2] && f.y >= bc.region[1] && f.y <= bc.region[3])) return false;
    if (bc.target === 'exterior') return true;
    if (bc.target.startsWith('body:')) return model.bodies.find((b) => `body:${b.id}` === bc.target)?.material === f.e.m;
    return f.edge === bc.target;
  };
  // Every node in use (CalculiX rejects sets that name nodes it does not have), 16 per line.
  const all = [...used].sort((a, b) => a - b);
  lines.push('*NSET, NSET=NALL');
  for (let n = 0; n < all.length; n += 16) lines.push(all.slice(n, n + 16).join(', '));
  lines.push('*INITIAL CONDITIONS, TYPE=TEMPERATURE', `NALL, ${model.study.initialT ?? model.ambient}`);
  const transient = model.study.type === 'transient';
  lines.push('*STEP', transient ? '*HEAT TRANSFER' : '*HEAT TRANSFER, STEADY STATE', transient ? `${model.study.dt}, ${model.study.endTime}` : '1.0, 1.0');
  for (const bc of model.boundaries) {
    const hits = outside.filter((f) => matches(bc, f));
    if (!hits.length) continue;
    lines.push(`** ${bc.name || bc.id} (${bc.type})`);
    if (bc.type === 'temperature') {
      const nodes = new Set();
      for (const f of hits) f.e.n.forEach((x) => nodes.add(x)); // all nodes of the touching elements' outer faces (conservative)
      lines.push('*BOUNDARY');
      for (const n of nodes) lines.push(`${n}, 11, 11, ${bc.T}`);
    } else if (bc.type === 'convection') {
      lines.push('*FILM');
      for (const f of hits) lines.push(`${f.e.id}, ${f.face}, ${bc.Tinf}, ${bc.h}`);
      if (bc.emissivity > 0) { lines.push('*RADIATE'); for (const f of hits) lines.push(`${f.e.id}, R${f.face.slice(1)}, ${bc.Tinf}, ${bc.emissivity}`); }
    } else if (bc.type === 'radiation') {
      lines.push('*RADIATE');
      for (const f of hits) lines.push(`${f.e.id}, R${f.face.slice(1)}, ${bc.Tamb}, ${bc.emissivity}`);
    } else if (bc.type === 'flux') {
      lines.push('*DFLUX');
      for (const f of hits) lines.push(`${f.e.id}, S${f.face.slice(1)}, ${bc.q}`);
    }
  }
  // Body power as a volumetric source (W/m³) on the body's cells.
  const cellVolume = (dx / 1000) * (dy / 1000) * ((is3d ? dz : d.depth) / 1000);
  for (const body of model.bodies.filter((b) => b.power > 0 && !b.hidden)) {
    const inBody = elements.filter((e) => materialAt({ ...model, bodies: [body], domain: { ...d, background: null } }, (e.i + 0.5) * dx, (e.j + 0.5) * dy, is3d ? (e.k + 0.5) * dz : null) != null);
    if (!inBody.length) continue;
    lines.push(`** ${body.name || body.id}: ${body.power} W`, '*DFLUX');
    const q = body.power / (inBody.length * cellVolume);
    for (const e of inBody) lines.push(`${e.id}, BF, ${q.toExponential(6)}`);
  }
  lines.push('*NODE FILE', 'NT', '*EL FILE', 'HFL', '*END STEP', '');
  // CalculiX (and Abaqus readers) expect plain ASCII: dashes become '-', names in other scripts '?'.
  return lines.join('\n').replace(/[–—]/g, '-').replace(/[^\x00-\x7f]/g, '?');
}

/** Pairs of DXF group codes and values. */
function dxfPairs(text) {
  const rows = String(text).split(/\r?\n/);
  const out = [];
  for (let i = 0; i + 1 < rows.length; i += 2) out.push([Number(rows[i].trim()), rows[i + 1].trim()]);
  return out;
}

/**
 * Bodies from an ASCII DXF: closed LWPOLYLINE / POLYLINE outlines become polygons (rectangles when axis-aligned
 * with four corners), CIRCLE becomes circles. Coordinates in drawing units × `scale` (mm). Returns
 * { bodies, bounds } — the caller places them in the model.
 */
export function bodiesFromDxf(text, { material = null, scale = 1, taken = [] } = {}) {
  const pairs = dxfPairs(text);
  const shapes = [];
  let current = null;
  let polyline = null;
  const flush = () => {
    if (current?.type === 'LWPOLYLINE' && current.points.length >= 3) shapes.push({ kind: 'poly', points: current.points, layer: current.layer });
    if (current?.type === 'CIRCLE' && current.r > 0) shapes.push({ kind: 'circle', cx: current.cx, cy: current.cy, r: current.r, layer: current.layer });
    current = null;
  };
  for (let n = 0; n < pairs.length; n++) {
    const [code, value] = pairs[n];
    if (code === 0) {
      flush();
      if (value === 'LWPOLYLINE' || value === 'CIRCLE') current = { type: value, points: [], layer: '' };
      else if (value === 'POLYLINE') polyline = { points: [], layer: '' };
      else if (value === 'VERTEX' && polyline) current = { type: 'VERTEX' };
      else if (value === 'SEQEND' && polyline) {
        if (polyline.points.length >= 3) shapes.push({ kind: 'poly', points: polyline.points, layer: polyline.layer });
        polyline = null;
      }
      continue;
    }
    if (!current) { if (polyline && code === 8) polyline.layer = value; continue; }
    const v = Number(value);
    if (code === 8) current.layer = value;
    if (current.type === 'LWPOLYLINE') {
      if (code === 10) current.points.push([v * scale, 0]);
      if (code === 20 && current.points.length) current.points[current.points.length - 1][1] = v * scale;
    } else if (current.type === 'CIRCLE') {
      if (code === 10) current.cx = v * scale;
      if (code === 20) current.cy = v * scale;
      if (code === 40) current.r = v * scale;
    } else if (current.type === 'VERTEX') {
      if (code === 10) polyline.points.push([v * scale, 0]);
      if (code === 20 && polyline.points.length) polyline.points[polyline.points.length - 1][1] = v * scale;
    }
  }
  flush();
  const ids = [...taken];
  // A layer holding one outline names the body (MyHeatManager's own DXF: a layer per body); several are numbered.
  const perLayer = new Map();
  for (const s of shapes) perLayer.set(s.layer, (perLayer.get(s.layer) ?? 0) + 1);
  const seen = new Map();
  const bodies = shapes.map((s, i) => {
    const id = newId('dxf', ids);
    ids.push(id);
    const n = (seen.get(s.layer) ?? 0) + 1;
    seen.set(s.layer, n);
    const name = s.layer && s.layer !== '0' ? (perLayer.get(s.layer) === 1 ? s.layer.replace(/_/g, ' ') : `${s.layer.replace(/_/g, ' ')} ${n}`) : `DXF ${i + 1}`;
    if (s.kind === 'circle') return { id, name, shape: 'circle', cx: s.cx, cy: s.cy, r: s.r, material };
    const xs = [...new Set(s.points.map((p) => p[0]))];
    const ys = [...new Set(s.points.map((p) => p[1]))];
    if (s.points.length === 4 && xs.length === 2 && ys.length === 2) {
      return { id, name, shape: 'rect', x: Math.min(...xs), y: Math.min(...ys), w: Math.abs(xs[1] - xs[0]), h: Math.abs(ys[1] - ys[0]), material };
    }
    return { id, name, shape: 'polygon', points: s.points, material };
  });
  const all = shapes.flatMap((s) => (s.kind === 'circle' ? [[s.cx - s.r, s.cy - s.r], [s.cx + s.r, s.cy + s.r]] : s.points));
  const bounds = all.length ? { x0: Math.min(...all.map((p) => p[0])), y0: Math.min(...all.map((p) => p[1])), x1: Math.max(...all.map((p) => p[0])), y1: Math.max(...all.map((p) => p[1])) } : null;
  return { bodies, bounds };
}

/** A small DXF (two rectangles and a circle) for the tests and the guide. */
export function sampleDxf() {
  const lw = (layer, pts) => ['0', 'LWPOLYLINE', '8', layer, '90', String(pts.length), '70', '1', ...pts.flatMap(([x, y]) => ['10', String(x), '20', String(y)])];
  return [...['0', 'SECTION', '2', 'ENTITIES'], ...lw('BASE', [[0, 0], [60, 0], [60, 5], [0, 5]]), ...lw('CHIP', [[20, 5], [40, 5], [40, 8], [20, 8]]),
    '0', 'CIRCLE', '8', 'PIPE', '10', '50', '20', '20', '40', '4', '0', 'ENDSEC', '0', 'EOF'].join('\n');
}

/** Dew point (°C) of air at T (°C) and RH (%) — Magnus formula. */
export function dewPoint(T, rh) {
  const a = 17.62;
  const b = 243.12;
  const g = Math.log(Math.max(1e-6, rh / 100)) + (a * T) / (b + T);
  return (b * g) / (a - g);
}

/** Temperature factor fRsi = (Tsi − Te) / (Ti − Te) (ISO 13788); above ~0.75 avoids mould in dwellings. */
export function temperatureFactor(Tsi, Ti, Te) {
  return (Tsi - Te) / (Ti - Te);
}

// ───────────────────────── THERM helpers: equivalent conductivity of air cavities, U-factor per tag

const STEFAN_BOLTZMANN = 5.670374419e-8; // W/(m²·K⁴)

/**
 * Equivalent conductivity (W/mK) of an unventilated rectangular air cavity, simplified ISO 10077-2 / ISO 15099:
 * λeq = d·(ha + hr) with d the cavity size along the heat flow. Convection ha = max(C1/d, C2·ΔT^(1/3)) with C1 = 0.025 W/mK and
 * C2 = 0.73 (heat flow horizontal) or 1.14 (upward) W/m²K^(4/3); downward ha = C1/d (still air). Linearised radiation
 * hr = 4σTm³ / (1/ε1 + 1/ε2 − 2 + 1/F), view factor F = ½·(1 + √(1 + d²/b²) − d/b), b the size across the heat flow.
 * width = d, height = b (mm), dT (K), Tmean (°C), heatFlow 'horizontal' | 'up' | 'down'. Returns { k, ha, hr, F, d, b } (SI).
 */
export function cavityK({ width, height, dT = 10, Tmean = 10, e1 = 0.9, e2 = 0.9, heatFlow = 'horizontal' }) {
  const d = width / 1000;
  const b = height / 1000;
  if (!(d > 0) || !(b > 0)) throw new Error('cavity size must be positive');
  const C1 = 0.025;
  const C2 = heatFlow === 'up' ? 1.14 : 0.73;
  const ha = heatFlow === 'down' ? C1 / d : Math.max(C1 / d, C2 * Math.abs(dT) ** (1 / 3));
  const F = 0.5 * (1 + Math.sqrt(1 + (d * d) / (b * b)) - d / b);
  const hr = (4 * STEFAN_BOLTZMANN * (Tmean + 273.15) ** 3) / (1 / e1 + 1 / e2 - 2 + 1 / F);
  return { k: d * (ha + hr), ha, hr, F, d, b };
}

/**
 * U-factors per boundary tag (THERM "U-factor tags"): boundaries = model.boundaries (each may carry `tag` and an optional
 * `projectedLength` mm), results = header.boundaries ({ id, heat W, area m² }), depth (mm, 2D section depth), Twarm / Tcold
 * (°C film temperatures). Projected length per tag: projected[tag] (mm), else the sum of the boundaries' projectedLength,
 * else of their `range` spans, else the total length. Returns [{ tag, ids, heat (W), length, projectedLength (mm),
 * Utotal, Uprojected (W/m²K) }].
 */
export function uFactorByTag({ boundaries, results, depth, Twarm, Tcold, projected = {} }) {
  const dT = Math.abs(Twarm - Tcold);
  const depthM = depth / 1000;
  const groups = new Map();
  for (const bc of boundaries) {
    if (!bc.tag) continue;
    const r = results?.find((x) => x.id === bc.id);
    if (!r) continue;
    if (!groups.has(bc.tag)) groups.set(bc.tag, { tag: bc.tag, ids: [], heat: 0, length: 0, proj: 0, projKnown: true });
    const g = groups.get(bc.tag);
    const length = depthM > 0 ? ((r.area ?? 0) / depthM) * 1000 : 0; // mm
    g.ids.push(bc.id);
    g.heat += r.heat ?? 0;
    g.length += length;
    const p = bc.projectedLength ?? (Array.isArray(bc.range) ? Math.abs(bc.range[1] - bc.range[0]) : null);
    if (p == null) g.projKnown = false;
    else g.proj += p;
  }
  return [...groups.values()].map((g) => {
    const projectedLength = projected[g.tag] ?? (g.projKnown ? g.proj : g.length);
    const U = (len) => (len > 0 && depthM > 0 && dT > 0 ? Math.abs(g.heat) / ((len / 1000) * depthM * dT) : NaN);
    return { tag: g.tag, ids: g.ids, heat: g.heat, length: g.length, projectedLength, Utotal: U(g.length), Uprojected: U(projectedLength) };
  });
}

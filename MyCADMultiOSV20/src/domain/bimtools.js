// FreeCAD BIM / Arch / IFC tools that work on the data: a component's
// additions and subtractions (Arch_Add / Arch_Remove), IFC information of an
// object (class, classification, property sets, B-rep flag), gluing and
// rewiring wires, grids from spans, a structural system on an axis grid, the
// IFC preflight checks, model differences, reordering, nudging and an example
// building. No DOM.

/** IFC classes an object can be given (BIM_IfcElements, BIM_Convert): built elements with the same nine attributes. */
export const IFC_TYPES = [
  'IfcBuildingElementProxy', 'IfcWall', 'IfcCurtainWall', 'IfcColumn', 'IfcBeam', 'IfcMember', 'IfcSlab', 'IfcRoof', 'IfcStair', 'IfcRamp',
  'IfcRailing', 'IfcPlate', 'IfcCovering', 'IfcFooting', 'IfcPile', 'IfcChimney', 'IfcShadingDevice', 'IfcFurniture', 'IfcPipeSegment', 'IfcDuctSegment',
];

/** Classification systems (BIM_Classification). */
export const CLASSIFICATION_SYSTEMS = ['Uniclass 2015', 'OmniClass', 'MasterFormat', 'UniFormat II', 'CCI', 'NL-SfB'];

/** Some codes of each system to choose from (any code may be typed). */
export const CLASSIFICATION_CODES = {
  'Uniclass 2015': [['EF_25_10', 'Walls'], ['EF_20_05', 'Structural frames'], ['EF_30_10', 'Roofs'], ['EF_25_30', 'Doors and windows'], ['EF_35_10', 'Stairs']],
  OmniClass: [['21-02 10 10', 'Substructure'], ['21-02 20 10', 'Superstructure'], ['21-02 20 20', 'Exterior walls'], ['21-03 10 10', 'Interior partitions'], ['21-02 30 10', 'Roofing']],
  MasterFormat: [['03 30 00', 'Cast-in-place concrete'], ['04 20 00', 'Unit masonry'], ['05 12 00', 'Structural steel framing'], ['08 50 00', 'Windows'], ['09 21 16', 'Gypsum board assemblies']],
  'UniFormat II': [['A1010', 'Standard foundations'], ['B1010', 'Floor construction'], ['B2010', 'Exterior walls'], ['B3010', 'Roof coverings'], ['C1010', 'Partitions']],
  CCI: [['AD', 'Wall'], ['UB', 'Column'], ['UC', 'Beam'], ['AE', 'Slab'], ['AB', 'Roof']],
  'NL-SfB': [['21', 'Buitenwanden'], ['22', 'Binnenwanden'], ['23', 'Vloeren'], ['27', 'Daken'], ['28', 'Hoofddraagconstructies']],
};

const text = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);

/** A solid's IFC information: { ifcType, classification: { system, code, title }, props: { name: value }, brep }. */
export function normalizeBimInfo(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  const type = IFC_TYPES.find((ty) => ty.toLowerCase() === String(raw.ifcType ?? '').toLowerCase());
  if (type) out.ifcType = type;
  const c = raw.classification;
  if (c && text(c.code, 40)) out.classification = { system: text(c.system, 40) ?? CLASSIFICATION_SYSTEMS[0], code: text(c.code, 40), title: text(c.title, 80) ?? '' };
  if (raw.props && typeof raw.props === 'object') {
    const props = {};
    for (const [k, v] of Object.entries(raw.props).slice(0, 60)) {
      const key = text(k, 60);
      if (key && (typeof v === 'string' || Number.isFinite(v) || typeof v === 'boolean')) props[key] = typeof v === 'string' ? v.slice(0, 200) : v;
    }
    if (Object.keys(props).length) out.props = props;
  }
  if (raw.brep) out.brep = true;
  return Object.keys(out).length ? out : null;
}

/** Property text "Name = value" lines → { Name: value } (numbers and true/false read as such). */
export function parseProps(textValue) {
  const props = {};
  for (const line of String(textValue ?? '').split(/\r?\n/)) {
    const m = /^\s*([^=]+?)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m) continue;
    const v = m[2];
    props[m[1]] = /^(true|false)$/i.test(v) ? /^true$/i.test(v) : v !== '' && Number.isFinite(Number(v)) ? Number(v) : v;
  }
  return props;
}

export const propsText = (props) => Object.entries(props ?? {}).map(([k, v]) => `${k} = ${v}`).join('\n');

// ───────────────────────── components (Arch_Add, Arch_Remove, Arch_ToggleSubs)

/**
 * A component's additions and subtractions: { add: [ids], sub: [ids], parts: { add: [solid data], sub: [solid data] } }.
 * `parts` are copies of the referenced solids (kept up to date by syncComponents), so meshing needs no drawing.
 */
export function normalizeComponents(raw, normalizeSolidData) {
  if (!raw || typeof raw !== 'object') return null;
  const ids = (list) => [...new Set((Array.isArray(list) ? list : []).filter((id) => typeof id === 'string' && id))].slice(0, 200);
  const add = ids(raw.add); const sub = ids(raw.sub);
  if (!add.length && !sub.length) return null;
  const parts = (list) => (Array.isArray(list) ? list : []).map((p) => normalizeSolidData(p)).filter(Boolean);
  return { add, sub, parts: { add: parts(raw.parts?.add), sub: parts(raw.parts?.sub) } };
}

/** Copies the referenced solids into each component (after any change); a removed reference is dropped. Returns how many changed. */
export function syncComponents(drawing, normalizeSolidData) {
  const hosts = drawing.entities.filter((e) => e.components);
  if (!hosts.length) return 0;
  const byId = new Map(drawing.entities.map((e) => [e.id, e]));
  let changed = 0;
  for (const host of hosts) {
    const live = (list) => list.filter((id) => id !== host.id && byId.get(id)?.type === 'solid');
    const add = live(host.components.add); const sub = live(host.components.sub);
    // A part's own components are not followed (no loops): its plain shape is used.
    const copy = (id) => { const { components, ...rest } = byId.get(id); void components; return normalizeSolidData(rest); };
    const next = add.length || sub.length ? { add, sub, parts: { add: add.map(copy).filter(Boolean), sub: sub.map(copy).filter(Boolean) } } : null;
    if (JSON.stringify(next) === JSON.stringify(host.components)) continue;
    const index = drawing.entities.indexOf(host);
    const fresh = { ...host };
    if (next) fresh.components = next; else delete fresh.components;
    drawing.entities[index] = fresh;
    changed += 1;
  }
  return changed;
}

/** Ids of the solids that are some component's additions or subtractions. */
export function componentMembers(drawing) {
  const out = new Map();
  for (const e of drawing.entities) {
    if (!e.components) continue;
    for (const id of e.components.add) out.set(id, { host: e.id, role: 'add' });
    for (const id of e.components.sub) out.set(id, { host: e.id, role: 'sub' });
  }
  return out;
}

// ───────────────────────── wires (BIM_Glue, BIM_Rewire)

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * BIM_Glue: several wires into one, always joining the nearest free ends
 * (reversing wires as needed); a gap becomes a straight segment. Returns { points, closed }.
 */
export function gluePaths(paths, tolerance = 1e-6) {
  const pool = paths.filter((p) => p.length >= 2).map((p) => p.slice());
  if (!pool.length) return null;
  let chain = pool.shift();
  while (pool.length) {
    let best = null;
    pool.forEach((p, i) => {
      const options = [[dist(chain.at(-1), p[0]), 'tail', false], [dist(chain.at(-1), p.at(-1)), 'tail', true], [dist(chain[0], p.at(-1)), 'head', false], [dist(chain[0], p[0]), 'head', true]];
      for (const [d, end, rev] of options) if (!best || d < best.d) best = { d, end, rev, i };
    });
    const [next] = pool.splice(best.i, 1);
    const p = best.rev ? next.reverse() : next;
    const touch = best.d <= tolerance;
    if (best.end === 'tail') chain = [...chain, ...(touch ? p.slice(1) : p)];
    else chain = [...(touch ? p.slice(0, -1) : p), ...chain];
  }
  const closed = chain.length >= 4 && dist(chain[0], chain.at(-1)) <= tolerance;
  return { points: closed ? chain.slice(0, -1) : chain, closed };
}

// ───────────────────────── grids and structures (Arch_Grid, Arch_StructuralSystem, Arch_AxisSystem)

/** Grid line positions from spans "3000, 4500, 3000" → [0, 3000, 7500, 10500]. */
export function gridPositions(spans) {
  const list = (Array.isArray(spans) ? spans : String(spans ?? '').split(/[,;\s]+/)).map(Number).filter((v) => Number.isFinite(v) && v > 0).slice(0, 60);
  const out = [0];
  for (const v of list) out.push(out.at(-1) + v);
  return out;
}

/** Arch_AxisSystem: two axis objects → one grid with the first's x lines and the second's y lines (local to the first). */
export function combineAxes(a, b, linesOf) {
  const la = linesOf(a); const lb = linesOf(b);
  const ang = ((a.rz ?? 0) * Math.PI) / 180;
  // The second's lines measured in the first's frame (its origin offset along the first's y).
  const dy = -(b.x - a.x) * Math.sin(ang) + (b.y - a.y) * Math.cos(ang);
  const ys = (lb.ys.length > 1 ? lb.ys : lb.xs).map((y) => y + dy).sort((p, q) => p - q);
  return { xs: la.xs.slice(), ys: [...new Set(ys.map((y) => Math.round(y * 1e6) / 1e6))] };
}

/** Arch_StructuralSystem: world points where an axis system's lines cross. */
export function axisCrossings(axis, linesOf) {
  const { xs, ys } = linesOf(axis);
  const a = ((axis.rz ?? 0) * Math.PI) / 180;
  const out = [];
  for (const y of ys) for (const x of xs) out.push({ x: (axis.x ?? 0) + x * Math.cos(a) - y * Math.sin(a), y: (axis.y ?? 0) + x * Math.sin(a) + y * Math.cos(a) });
  return out;
}

// ───────────────────────── walls (Arch_MergeWalls)

/**
 * Arch_MergeWalls: walls with the same width, height and alignment whose paths
 * meet end to end → one wall (world path, openings measured along the new path).
 * Returns { path, closed, openings } or null when they do not form one run.
 */
export function mergeWallPaths(walls, toWorld) {
  const runs = walls.map((w) => ({ w, pts: (w.shape?.path ?? []).map((p) => toWorld(w, p)) }));
  const glued = gluePaths(runs.map((r) => r.pts), 1);
  if (!glued) return null;
  // Every joint must touch (within 1 mm): merged walls are one run, not a gap bridged.
  const total = runs.reduce((s, r) => s + r.pts.slice(1).reduce((t, p, i) => t + dist(p, r.pts[i]), 0), 0);
  const len = glued.points.slice(1).reduce((t, p, i) => t + dist(p, glued.points[i]), 0) + (glued.closed ? dist(glued.points.at(-1), glued.points[0]) : 0);
  if (Math.abs(total - len) > 1) return null;
  // Openings: their centre's world point, measured along the merged path.
  const along = (q) => {
    let best = { d: Infinity, s: 0 }; let s = 0;
    const pts = glued.closed ? [...glued.points, glued.points[0]] : glued.points;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]; const b = pts[i]; const L = dist(a, b) || 1;
      const t = Math.max(0, Math.min(1, ((q.x - a.x) * (b.x - a.x) + (q.y - a.y) * (b.y - a.y)) / (L * L)));
      const d = Math.hypot(a.x + (b.x - a.x) * t - q.x, a.y + (b.y - a.y) * t - q.y);
      if (d < best.d) best = { d, s: s + t * L };
      s += L;
    }
    return best.s;
  };
  const openings = [];
  for (const r of runs) {
    let s = 0;
    for (let i = 1; i < r.pts.length; i++) {
      const L = dist(r.pts[i - 1], r.pts[i]);
      for (const o of r.w.shape?.openings ?? []) {
        const mid = o.at + o.width / 2;
        if (mid >= s - 1e-9 && mid <= s + L + 1e-9) {
          const t = (mid - s) / (L || 1);
          const q = { x: r.pts[i - 1].x + (r.pts[i].x - r.pts[i - 1].x) * t, y: r.pts[i - 1].y + (r.pts[i].y - r.pts[i - 1].y) * t };
          openings.push({ ...o, at: Math.max(0, along(q) - o.width / 2) });
        }
      }
      s += L;
    }
  }
  return { path: glued.points, closed: glued.closed, openings };
}

// ───────────────────────── checks (BIM_Preflight, Arch_Check)

/**
 * BIM_Preflight: tests a model must pass before it goes out as IFC. Each test
 * { id, ok, items: [entity ids that fail] }.
 *   helpers { analyze(entity) → { closed, volume }, isArch(kind) }
 */
export function preflight(drawing, { analyze, isArch }) {
  const solids = drawing.entities.filter((e) => e.type === 'solid');
  const levels = new Set((drawing.bim?.levels ?? []).map((l) => l.id));
  const fail = (id, pred) => ({ id, items: solids.filter(pred).map((e) => e.id) });
  const names = new Map();
  for (const e of solids) names.set(e.name || '', (names.get(e.name || '') ?? 0) + 1);
  const tests = [
    { id: 'project', items: drawing.bim ? [] : ['-'] },
    fail('named', (e) => !e.name),
    fail('uniqueNames', (e) => e.name && names.get(e.name) > 1),
    fail('ifcType', (e) => !isArch(e.kind) && !e.bim?.ifcType && e.kind !== 'mesh'),
    fail('levels', (e) => !(e.level && levels.has(e.level))),
    fail('materials', (e) => isArch(e.kind) && !['axis', 'space'].includes(e.kind) && !e.material && !(e.shape?.layers?.length)),
    fail('solid', (e) => e.kind !== 'axis' && !analyze(e).closed),
    fail('volume', (e) => e.kind !== 'axis' && !(Math.abs(analyze(e).volume) > 1e-6)),
    fail('classification', (e) => e.kind !== 'axis' && !e.bim?.classification),
  ];
  return tests.map((test) => ({ ...test, ok: test.items.length === 0 }));
}

// ───────────────────────── differences (BIM_Diff, IFC_Diff)

/**
 * Objects of two models matched by name (and their order among equal names):
 * { added: [names], removed: [names], changed: [{ name, what: [...] }] }.
 * Each item { name, kind, box: [minX, minY, minZ, maxX, maxY, maxZ] | null, volume }.
 */
export function diffModels(before, after, tolerance = 1) {
  const keyed = (list) => {
    const count = new Map();
    return new Map(list.map((item) => { const n = (count.get(item.name) ?? 0) + 1; count.set(item.name, n); return [`${item.name}#${n}`, item]; }));
  };
  const a = keyed(before); const b = keyed(after);
  const label = (k) => k.replace(/#1$/, '').replace(/#(\d+)$/, ' ($1)');
  const out = { added: [], removed: [], changed: [] };
  for (const [k] of b) if (!a.has(k)) out.added.push(label(k));
  for (const [k] of a) if (!b.has(k)) out.removed.push(label(k));
  for (const [k, x] of a) {
    const y = b.get(k);
    if (!y) continue;
    const what = [];
    if (x.kind !== y.kind) what.push('kind');
    if (x.box && y.box && x.box.some((v, i) => Math.abs(v - y.box[i]) > tolerance)) what.push('placement');
    if (Number.isFinite(x.volume) && Number.isFinite(y.volume) && Math.abs(x.volume - y.volume) > Math.max(tolerance ** 3, 1e-3 * Math.abs(x.volume))) what.push('volume');
    if (what.length) out.changed.push({ name: label(k), what });
  }
  return out;
}

// ───────────────────────── order and nudging (BIM_Reorder, BIM_Nudge_*)

/** BIM_Reorder: the entities `ids` take, in that order, the places they had in the list. */
export function reorderEntities(entities, ids) {
  const wanted = ids.filter((id) => entities.some((e) => e.id === id));
  const slots = entities.map((e, i) => (wanted.includes(e.id) ? i : -1)).filter((i) => i >= 0);
  const byId = new Map(entities.map((e) => [e.id, e]));
  const out = entities.slice();
  slots.forEach((slot, k) => { out[slot] = byId.get(wanted[k]); });
  return out;
}

/** BIM_Nudge_Extend / _Shrink on 2D geometry: grows a line at both ends, a circle's or arc's radius, a rectangle on every side, by d. */
export function extendEntity(e, d) {
  switch (e.type) {
    case 'line': {
      const L = Math.hypot(e.x2 - e.x1, e.y2 - e.y1) || 1;
      if (L + 2 * d <= 1e-9) return null;
      const ux = (e.x2 - e.x1) / L; const uy = (e.y2 - e.y1) / L;
      return { x1: e.x1 - ux * d, y1: e.y1 - uy * d, x2: e.x2 + ux * d, y2: e.y2 + uy * d };
    }
    case 'circle': case 'arc': return e.r + d > 1e-9 ? { r: e.r + d } : null;
    case 'rect': return e.width + 2 * d > 1e-9 && e.height + 2 * d > 1e-9 ? { x: e.x - d, y: e.y - d, width: e.width + 2 * d, height: e.height + 2 * d } : null;
    case 'ellipse': return e.rx + d > 1e-9 && e.ry + d > 1e-9 ? { rx: e.rx + d, ry: e.ry + d } : null;
    default: return null;
  }
}

/** BIM_Nudge_Extend / _Shrink on BIM objects: the size parameters that grow (a wall's height, a column's width and depth …). */
export const NUDGE_PARAMS = { wall: ['height'], curtainwall: ['height'], column: ['width', 'depth'], beam: ['width', 'height'], slab: ['thickness'], space: ['height'], railing: ['height'], equipment: ['length', 'width'], panel: ['thickness'], pipe: ['diameter'], box: ['length', 'width', 'height'], cylinder: ['radius'], sphere: ['radius'] };

// ───────────────────────── survey and quantities (Arch_Survey, BIM_IfcQuantities)

/** Rows "label | length | area | volume" of what was surveyed, and their totals. */
export function surveyTable(rows) {
  const total = { length: 0, area: 0, volume: 0 };
  for (const r of rows) for (const k of ['length', 'area', 'volume']) if (Number.isFinite(r[k])) total[k] += r[k];
  return { rows, total };
}

/** BIM_IfcSpreadsheet: cells of a table — one row per object, columns name, class, then every property name met. */
export function ifcSheetCells(rows) {
  const col = (i) => { let s = ''; let n = i + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r.props ?? {})))];
  const head = ['Name', 'IfcClass', ...keys];
  const cells = {};
  head.forEach((h, i) => { cells[`${col(i)}1`] = h; });
  rows.forEach((r, j) => {
    cells[`A${j + 2}`] = r.name; cells[`B${j + 2}`] = r.ifcClass;
    keys.forEach((k, i) => { const v = r.props?.[k]; if (v !== undefined) cells[`${col(i + 2)}${j + 2}`] = String(v); });
  });
  return cells;
}

// ───────────────────────── example (BIM_Examples)

/**
 * A small house (raw entities, millimetres): four walls with a door and two
 * windows, a floor slab, a gable roof and a space; materials by id.
 */
export function exampleHouse(names = {}) {
  const L = 8000; const W = 6000; const H = 2700;
  const n = (k, d) => names[k] ?? d;
  const solid = (kind, extra) => ({ type: 'solid', kind, z: 0, rx: 0, ry: 0, rz: 0, ...extra });
  const walls = [
    [{ x: 0, y: 0 }, { x: L, y: 0 }, [{ type: 'door', at: 1000, width: 900, height: 2100, sill: 0, swing: 1, hinge: 1 }, { type: 'window', at: 4500, width: 1500, height: 1300, sill: 900, swing: 1, hinge: 1 }]],
    [{ x: L, y: 0 }, { x: L, y: W }, []],
    [{ x: L, y: W }, { x: 0, y: W }, [{ type: 'window', at: 3000, width: 1500, height: 1300, sill: 900, swing: 1, hinge: 1 }]],
    [{ x: 0, y: W }, { x: 0, y: 0 }, []],
  ].map(([a, b, openings], i) => solid('wall', { name: `${n('wall', 'Wall')} ${i + 1}`, x: a.x, y: a.y, params: { width: 200, height: H, align: 0 }, shape: { path: [{ x: 0, y: 0 }, { x: b.x - a.x, y: b.y - a.y }], closed: false, openings }, material: 'brick' }));
  const outline = [{ x: -100, y: -100 }, { x: L + 100, y: -100 }, { x: L + 100, y: W + 100 }, { x: -100, y: W + 100 }];
  const rel = (pts) => pts.map((p) => ({ x: p.x - pts[0].x, y: p.y - pts[0].y }));
  return [
    ...walls,
    solid('slab', { name: n('slab', 'Floor slab'), x: -100, y: -100, params: { thickness: 200 }, shape: { outer: rel(outline), holes: [] }, material: 'concrete' }),
    solid('roof', { name: n('roof', 'Roof'), x: -100, y: -100, z: H, params: { roofType: 0, slope: 30, overhang: 400, thickness: 200 }, shape: { outer: rel(outline), holes: [] }, material: 'tile' }),
    solid('space', { name: n('space', 'Living room'), x: 100, y: 100, params: { height: H }, shape: { outer: rel([{ x: 100, y: 100 }, { x: L - 100, y: 100 }, { x: L - 100, y: W - 100 }, { x: 100, y: W - 100 }]), holes: [] } }),
  ];
}

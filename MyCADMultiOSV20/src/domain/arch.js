// BIM / Arch objects, like FreeCAD's BIM workbench: one 3D model gives both the
// 3D view and the floor plan. Every object is a solid entity (kind below) with
// parameters, shape data and a placement, so the 3D view, booleans, sections,
// projections and the 3D exports take it as they take any solid.
//   wall         Arch Wall — along a path (line / polyline), width, height, alignment, with
//                windows, doors and openings cut in it (shape.openings, like FreeCAD's hosted windows)
//   curtainwall  Arch Curtain Wall — mullions, transoms and glass along a path
//   column       Arch Structure (column) — rectangular, round or H-section
//   beam         Arch Structure (beam) — along a path
//   slab         Arch Structure (slab) — a closed outline with holes, thickness down from its top
//   stairs       Arch Stairs — a straight flight: treads, risers and a waist slab
//   roof         Arch Roof — gable, hip, shed or flat over an outline, pitch and overhang
//   space        Arch Space — a room: name, floor area and volume (a light volume in 3D)
//   railing      Arch Railing / Fence — posts and rails along a path
//   equipment    Arch Equipment — furniture and fixtures (bed, sofa, table, WC, bath, car…)
//   axis         Arch Axis system — the structural grid with numbered bubbles
// The 2D drawing shows each object as an architectural plan: the model cut by a
// horizontal plane PLAN_CUT above the object's base (FreeCAD's Section Plane +
// TechDraw Arch view): cut walls and columns hatched, door swings, window glass
// lines, stairs broken at the cut, beams and roofs above dashed.
import { arcPoints, polygonArea } from './geometry.js';
import { hatchPrimitives } from './hatch.js';
import { straightSkeleton } from './skeleton.js';
import { triangulate } from './triangulate.js';

export const ARCH_KINDS = ['wall', 'curtainwall', 'column', 'beam', 'slab', 'stairs', 'roof', 'space', 'railing', 'equipment', 'axis', 'rebar', 'truss', 'panel', 'pipe'];
/** Made from selected 2D lines and outlines (FreeCAD: select a wire, press Wall). */
export const ARCH_FROM_LINES = ['wall', 'curtainwall', 'beam', 'railing', 'truss', 'pipe'];
export const ARCH_FROM_OUTLINES = ['slab', 'roof', 'space', 'panel'];
/** Made for a selected structure (column, beam, slab): Arch Rebar. */
export const REBAR_HOSTS = ['column', 'beam', 'slab'];
export const TRUSS_TYPES = ['pratt', 'howe', 'warren'];
/** Placed with the solid window. */
export const ARCH_INSERT_KINDS = ['column', 'stairs', 'equipment', 'axis'];
export const OPENING_TYPES = ['window', 'door', 'doubleDoor', 'sliding', 'opening', 'custom'];
export const WALL_ALIGN = ['center', 'left', 'right'];
export const COLUMN_SHAPES = ['rect', 'round', 'hsection', 'channel', 'angle', 'tee', 'rhs', 'chs'];
/** Standard steel sections (FreeCAD Arch profile library): [name, shape, width b, depth h, web/wall t, flange tf]. */
export const STEEL_PRESETS = [
  ['customSize'],
  ['IPE200', 'hsection', 100, 200, 5.6, 8.5], ['IPE300', 'hsection', 150, 300, 7.1, 10.7], ['IPE400', 'hsection', 180, 400, 8.6, 13.5],
  ['HEA200', 'hsection', 200, 190, 6.5, 10], ['HEA300', 'hsection', 300, 290, 8.5, 14], ['HEB300', 'hsection', 300, 300, 11, 19],
  ['UPN200', 'channel', 75, 200, 8.5, 11.5], ['L100x10', 'angle', 100, 100, 10, 10], ['T100', 'tee', 100, 100, 11, 11],
  ['RHS200x100x8', 'rhs', 100, 200, 8, 8], ['SHS150x6', 'rhs', 150, 150, 6, 6], ['CHS168x6', 'chs', 168.3, 168.3, 6.3, 6.3],
];
export const STEEL_PRESET_NAMES = STEEL_PRESETS.map((p) => p[0]);
export const STAIR_TYPES = ['straight', 'lShape', 'uShape', 'spiral'];
export const RAILING_INFILL = ['rails', 'balusters', 'glass'];
export const AXIS_TYPES = ['grid', 'radial'];
export const PIPE_SERVICES = ['pipe', 'cable', 'duct'];
export const ROOF_TYPES = ['gable', 'hip', 'shed', 'flat'];
export const EQUIPMENT_TYPES = ['bed', 'sofa', 'table', 'chair', 'desk', 'wardrobe', 'toilet', 'basin', 'bathtub', 'sink', 'fridge', 'car'];
/** Typical sizes [length, width, height] of each equipment type. */
export const EQUIPMENT_SIZES = {
  bed: [2100, 1600, 900], sofa: [2200, 900, 850], table: [1600, 900, 740], chair: [450, 500, 900], desk: [1400, 700, 740], wardrobe: [1800, 600, 2200],
  toilet: [700, 400, 800], basin: [600, 450, 850], bathtub: [1700, 750, 550], sink: [2400, 600, 900], fridge: [900, 750, 1800], car: [4700, 1850, 1450],
};
/** Height of the plan cut above an object's base (mm). */
export const PLAN_CUT = 1000;
/**
 * 3D colour of each kind's main part (like FreeCAD's BIM materials). Layers of a
 * building drawing colour its plan lines, so they do not paint the model; an
 * object's own colour does.
 */
export const ARCH_COLORS = {
  wall: '#e6e1d6', curtainwall: '#8f98a3', column: '#d3d3d0', beam: '#b4bcc4', slab: '#c4c7cc', stairs: '#d8c9a8',
  roof: '#b5523b', space: '#79d29a', railing: '#8f98a3', equipment: '#ece8e1', axis: '#e5484d', rebar: '#8a4b2a', truss: '#8f98a3', panel: '#c9b18a', pipe: '#6f8fb3',
};

/** Colours of the parts of an object in the 3D view (main = the object's own colour). */
export const ARCH_MATERIALS = {
  glass: { color: '#8cc4ec', opacity: 0.45 },
  wood: { color: '#a8763e' },
  metal: { color: '#8f98a3' },
  space: { color: '#79d29a', opacity: 0.14, edges: false },
};

const num = (key, def, min, max, step = 10, unit = 'mm') => ({ key, type: 'number', def, min, max, step, unit });
const int = (key, def, min, max) => ({ key, type: 'int', def, min, max, step: 1, unit: '' });
const choice = (key, options, def = 0) => ({ key, type: 'choice', options, def, min: 0, max: options.length - 1, step: 1, unit: '' });

export const ARCH_SOLIDS = {
  wall: { params: [num('width', 200, 10, 5000), num('height', 2700, 100, 100000), choice('align', WALL_ALIGN)] },
  curtainwall: { params: [num('height', 3000, 100, 100000), num('spacing', 1500, 100, 20000), num('vspacing', 1500, 100, 20000), num('mullion', 60, 5, 1000, 5), num('depth', 150, 5, 2000, 5)] },
  column: { params: [num('width', 400, 10, 10000), num('depth', 400, 10, 10000), num('height', 3000, 100, 100000), choice('profile', COLUMN_SHAPES), choice('preset', STEEL_PRESET_NAMES), num('tw', 0, 0, 500, 0.5), num('tf', 0, 0, 500, 0.5)] },
  beam: { params: [num('width', 300, 10, 5000), num('height', 600, 10, 10000), choice('profile', COLUMN_SHAPES), choice('preset', STEEL_PRESET_NAMES), num('tw', 0, 0, 500, 0.5), num('tf', 0, 0, 500, 0.5)] },
  slab: { params: [num('thickness', 200, 10, 10000)] },
  stairs: { params: [num('length', 3500, 300, 50000), num('width', 1100, 300, 10000), num('height', 2700, 100, 20000), int('steps', 14, 2, 100), num('thickness', 150, 20, 2000), choice('stairType', STAIR_TYPES)] },
  roof: { params: [choice('roofType', ROOF_TYPES), num('slope', 30, 0, 75, 2.5, '°'), num('overhang', 500, 0, 5000), num('thickness', 200, 10, 2000)] },
  space: { params: [num('height', 2400, 100, 100000)] },
  railing: { params: [num('height', 1000, 100, 5000), num('spacing', 1200, 100, 10000), num('post', 50, 10, 500, 5), choice('infill', RAILING_INFILL)] },
  equipment: { params: [choice('equipment', EQUIPMENT_TYPES), num('length', 2100, 10, 50000), num('width', 1600, 10, 50000), num('height', 900, 10, 20000)] },
  axis: { params: [int('countX', 4, 1, 60), num('spacingX', 6000, 100, 100000, 100), int('countY', 3, 1, 60), num('spacingY', 6000, 100, 100000, 100), num('extension', 1500, 0, 20000, 100), num('bubble', 400, 50, 5000), choice('axisType', AXIS_TYPES), num('angleStep', 30, 1, 180, 5, '°')] },
  rebar: { params: [num('diameter', 16, 4, 60, 1), num('spacing', 200, 25, 2000), num('cover', 40, 10, 500, 5), int('bars', 2, 2, 20), num('stirrup', 10, 4, 40, 1)] },
  truss: { params: [choice('trussType', TRUSS_TYPES), num('height', 1500, 100, 20000), int('panels', 6, 1, 100), num('chord', 150, 10, 2000, 5), num('web', 80, 10, 2000, 5)] },
  panel: { params: [num('thickness', 20, 1, 2000, 1), num('waveLength', 0, 0, 20000), num('waveHeight', 0, 0, 2000, 5)] },
  pipe: { params: [num('diameter', 100, 5, 5000, 5), num('wall', 5, 0, 500, 1), num('bend', 0, 0, 20000, 10), choice('service', PIPE_SERVICES)] },
};

export const ARCH_ICONS = {
  wall: 'archWall', curtainwall: 'archCurtain', column: 'archColumn', beam: 'archBeam', slab: 'archSlab', stairs: 'archStairs', roof: 'archRoof',
  space: 'archSpace', railing: 'archRailing', equipment: 'archEquipment', axis: 'archAxis', window: 'archWindow', door: 'archDoor',
  rebar: 'archRebar', truss: 'archTruss', panel: 'archPanel', pipe: 'archPipe', custom: 'archCustomWindow',
};

export const isArchKind = (kind) => ARCH_KINDS.includes(kind);

// ───────────────────────── materials (FreeCAD Arch Material, MultiMaterial)

/** Materials a new BIM drawing starts with: colour in 3D, hatch pattern when cut in plan. */
export const MATERIAL_PRESETS = [
  { id: 'concrete', ko: '콘크리트', en: 'Concrete', color: '#c4c7cc', pattern: 'ansi37' },
  { id: 'brick', ko: '벽돌', en: 'Brick', color: '#b5653f', pattern: 'ansi31' },
  { id: 'block', ko: '콘크리트 블록', en: 'Concrete block', color: '#a9adb3', pattern: 'ansi32' },
  { id: 'insulation', ko: '단열재', en: 'Insulation', color: '#f2d36b', pattern: 'net' },
  { id: 'gypsum', ko: '석고보드', en: 'Gypsum board', color: '#efece4', pattern: 'dots' },
  { id: 'plaster', ko: '미장', en: 'Plaster', color: '#e6e1d6', pattern: 'dots' },
  { id: 'wood', ko: '목재', en: 'Wood', color: '#a8763e', pattern: 'line' },
  { id: 'stone', ko: '석재', en: 'Stone', color: '#9c9a92', pattern: 'ansi37' },
  { id: 'steel', ko: '강재', en: 'Steel', color: '#8f98a3', pattern: 'solid' },
  { id: 'glass', ko: '유리', en: 'Glass', color: '#8cc4ec', pattern: 'none' },
  { id: 'tile', ko: '타일', en: 'Tile', color: '#d9c7a7', pattern: 'net' },
];
export const MATERIAL_PATTERNS = ['none', 'solid', 'ansi31', 'ansi32', 'ansi37', 'net', 'line', 'dash', 'dots'];

/** A material: { id, name, color, pattern }. */
export function normalizeMaterial(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 40) : null;
  if (!id) return null;
  return {
    id,
    name: typeof raw.name === 'string' && raw.name ? raw.name.slice(0, 60) : id,
    color: /^#[0-9a-f]{6}$/i.test(raw.color ?? '') ? raw.color.toLowerCase() : '#c4c7cc',
    pattern: MATERIAL_PATTERNS.includes(raw.pattern) ? raw.pattern : 'ansi31',
  };
}

/** The preset materials in a language. */
export const presetMaterials = (language = 'ko') => MATERIAL_PRESETS.map(({ id, color, pattern, ...names }) => ({ id, name: language === 'en' ? names.en : names.ko, color, pattern }));

/** Layers of a multi-material wall (outside → inside, i.e. left → right of its path): [{ material, thickness }]. */
export function normalizeWallLayers(raw) {
  return (Array.isArray(raw) ? raw : []).map((layer) => {
    const material = normalizeMaterial(layer?.material);
    const thickness = Number(layer?.thickness);
    return material && thickness > 0 ? { material, thickness: Math.min(5000, thickness) } : null;
  }).filter(Boolean).slice(0, 12);
}

// ───────────────────────── levels and the building (FreeCAD BuildingPart: Site › Building › Level)

/**
 * The BIM data of a drawing: { site, building, levels: [{ id, name, elevation,
 * height, visible }], activeLevel, planLevel (the level the 2D plan shows, or
 * null for all), materials }.
 */
export function normalizeBim(raw, language = 'ko') {
  if (!raw || typeof raw !== 'object') return null;
  const en = language === 'en';
  const levels = (Array.isArray(raw.levels) ? raw.levels : []).map((level, i) => ({
    id: typeof level?.id === 'string' && level.id ? level.id.slice(0, 40) : `L${i + 1}`,
    name: typeof level?.name === 'string' && level.name ? level.name.slice(0, 60) : (en ? `Level ${i + 1}` : `${i + 1}층`),
    elevation: Number.isFinite(Number(level?.elevation)) ? Number(level.elevation) : i * 3000,
    height: Number(level?.height) > 0 ? Number(level.height) : 3000,
    visible: level?.visible !== false,
  }));
  const seen = new Set();
  const unique = levels.filter((level) => !seen.has(level.id) && seen.add(level.id)).sort((a, b) => a.elevation - b.elevation);
  if (!unique.length) unique.push({ id: 'L1', name: en ? 'Level 1' : '1층', elevation: 0, height: 3000, visible: true });
  const materials = (Array.isArray(raw.materials) ? raw.materials : presetMaterials(language)).map(normalizeMaterial).filter(Boolean);
  return {
    site: typeof raw.site === 'string' && raw.site ? raw.site.slice(0, 80) : (en ? 'Site' : '대지'),
    building: typeof raw.building === 'string' && raw.building ? raw.building.slice(0, 80) : (en ? 'Building' : '건물'),
    levels: unique,
    activeLevel: unique.some((level) => level.id === raw.activeLevel) ? raw.activeLevel : unique[0].id,
    planLevel: unique.some((level) => level.id === raw.planLevel) ? raw.planLevel : null,
    materials,
  };
}

/** A new BIM block for a drawing that has none. */
export const createBim = (language = 'ko') => normalizeBim({}, language);

// ───────────────────────── shape data

const P2 = (p) => ({ x: Number(p?.x) || 0, y: Number(p?.y) || 0 });
const fin = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** Defaults of a new opening of a type. */
export function defaultOpening(type = 'window', at = 0) {
  const door = type !== 'window';
  return {
    type, at,
    width: { window: 1500, door: 900, doubleDoor: 1600, sliding: 2400, opening: 1200 }[type] ?? 1000,
    height: door ? 2100 : 1300,
    sill: door ? 0 : 900,
    swing: 1, hinge: 1,
    ...(type === 'window' ? { cols: (({ window: 1500 })[type] ?? 1000) > 1400 ? 2 : 1, rows: 1 } : {}),
  };
}

function normalizeOpening(raw) {
  const type = OPENING_TYPES.includes(raw?.type) ? raw.type : 'window';
  return {
    type,
    at: Math.max(0, fin(raw?.at)),
    width: Math.min(50000, Math.max(50, fin(raw?.width, 900))),
    height: Math.min(50000, Math.max(50, fin(raw?.height, 2100))),
    sill: Math.max(0, fin(raw?.sill)),
    swing: fin(raw?.swing, 1) < 0 ? -1 : 1,
    hinge: fin(raw?.hinge, 1) < 0 ? -1 : 1,
    // A window's panes (columns × rows, FreeCAD's window presets).
    ...(type === 'window' ? { cols: Math.min(8, Math.max(1, Math.round(fin(raw?.cols, fin(raw?.width, 900) > 1400 ? 2 : 1)))), rows: Math.min(8, Math.max(1, Math.round(fin(raw?.rows, 1)))) } : {}),
    // A window drawn as a sketch: its frame outline and panes, in 0…1 of its width and height.
    ...(type === 'custom' ? { profile: normalizeProfile(raw?.profile) } : {}),
  };
}

function normalizeProfile(raw) {
  const loop = (list) => (Array.isArray(list) ? list.map((q) => ({ u: Math.min(1, Math.max(0, fin(q?.u))), v: Math.min(1, Math.max(0, fin(q?.v))) })) : []);
  const outer = loop(raw?.outer);
  return { outer: outer.length >= 3 ? outer : [{ u: 0, v: 0 }, { u: 1, v: 0 }, { u: 1, v: 1 }, { u: 0, v: 1 }], holes: (Array.isArray(raw?.holes) ? raw.holes : []).map(loop).filter((hole) => hole.length >= 3) };
}

/**
 * A sketch window's profile from 2D outlines: the biggest is the frame, the others its panes.
 * Returns { profile, width, height }.
 */
export function profileFromLoops(loops) {
  const sorted = loops.filter((loop) => loop.length >= 3).sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)));
  if (!sorted.length) return null;
  const xs = sorted[0].map((q) => q.x); const ys = sorted[0].map((q) => q.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const w = x1 - x0; const h = y1 - y0;
  if (!(w > 0 && h > 0)) return null;
  const uv = (loop) => loop.map((q) => ({ u: (q.x - x0) / w, v: (q.y - y0) / h }));
  return { profile: { outer: uv(sorted[0]), holes: sorted.slice(1).map(uv) }, width: w, height: h };
}

/**
 * Repairs the shape data of an arch object:
 *   wall { path, closed, openings: [{ type, at, width, height, sill, swing, hinge }] }
 *   curtainwall / beam / railing { path: [{ x, y }], closed }
 *   slab / roof / space { outer: [{ x, y }], holes: [[{ x, y }]] }
 */
export function normalizeArchShape(kind, raw) {
  if (ARCH_FROM_LINES.includes(kind)) {
    const path = (Array.isArray(raw?.path) ? raw.path : []).map(P2);
    return { path, closed: Boolean(raw?.closed) && path.length >= 3, ...(kind === 'wall' ? { openings: (Array.isArray(raw?.openings) ? raw.openings : []).map(normalizeOpening), layers: normalizeWallLayers(raw?.layers) } : {}) };
  }
  if (ARCH_FROM_OUTLINES.includes(kind)) {
    const outer = (Array.isArray(raw?.outer) ? raw.outer : []).map(P2);
    const holes = (Array.isArray(raw?.holes) ? raw.holes : []).map((hole) => (Array.isArray(hole) ? hole.map(P2) : [])).filter((hole) => hole.length >= 3);
    // A roof's own slope per edge (null: the roof's slope).
    if (kind === 'roof') return { outer, holes, slopes: outer.map((_, i) => { const v = Number(raw?.slopes?.[i]); return raw?.slopes?.[i] !== null && raw?.slopes?.[i] !== undefined && Number.isFinite(v) ? Math.min(90, Math.max(1, v)) : null; }) };
    return { outer, holes };
  }
  if (kind === 'rebar') {
    // The structure the bars are in (a copy: kind, parameters, path or outline), in the rebar's own coordinates.
    const host = raw?.host && REBAR_HOSTS.includes(raw.host.kind) ? raw.host : null;
    if (host) return { host: { kind: host.kind, params: { ...host.params }, ...(host.path ? { path: host.path.map(P2) } : {}), ...(host.outer ? { outer: host.outer.map(P2), holes: (host.holes ?? []).map((hole) => hole.map(P2)) } : {}) } };
    // A custom bar shape drawn as a line or polyline (FreeCAD Rebar: custom shape).
    const path = (Array.isArray(raw?.path) ? raw.path : []).map(P2);
    return path.length >= 2 ? { host: null, path, closed: Boolean(raw?.closed) && path.length >= 3 } : { host: null };
  }
  if (kind === 'axis') {
    // Optional line positions (FreeCAD Axis distances); otherwise counts × spacings.
    const list = (v) => (Array.isArray(v) ? v.map(Number).filter(Number.isFinite).sort((a, b) => a - b) : []);
    return { xs: list(raw?.xs), ys: list(raw?.ys) };
  }
  return {};
}

/** Positions of the grid lines of an axis system (local): { xs, ys }. */
export function axisLines(entity) {
  const p = entity.params;
  const s = entity.shape ?? {};
  const xs = s.xs?.length ? s.xs : Array.from({ length: p.countX }, (_, i) => i * p.spacingX);
  const ys = s.ys?.length ? s.ys : Array.from({ length: p.countY }, (_, j) => j * p.spacingY);
  return { xs, ys };
}

/** Label of the n-th lettered grid line: A … Z, AA, AB … */
export const axisLetter = (i) => (i < 26 ? String.fromCharCode(65 + i) : `${String.fromCharCode(65 + Math.floor(i / 26) - 1)}${String.fromCharCode(65 + (i % 26))}`);

export function hasArchShape(entity) {
  const s = entity.shape ?? {};
  if (entity.kind === 'rebar') return Boolean(s.host) || (s.path?.length ?? 0) >= 2;
  if (ARCH_FROM_LINES.includes(entity.kind)) return (s.path?.length ?? 0) >= 2;
  if (ARCH_FROM_OUTLINES.includes(entity.kind)) return (s.outer?.length ?? 0) >= 3;
  return true;
}

/**
 * Arch objects (raw solid data) from 2D geometry, one per wire like FreeCAD:
 *   path kinds    source { paths: [{ points, closed }] }
 *   outline kinds source { shapes: [{ outer, holes }] }
 * Each object's placement is its first point, its shape relative to it.
 */
export function archFrom(kind, source, params = {}, { normalizeParams = (k, p) => p } = {}) {
  if (kind === 'rebar' && source.paths?.length && !source.hosts?.length) {
    // Custom bars: one rebar object per drawn line or polyline.
    return source.paths.filter((path) => path.points.length >= 2).map(({ points, closed }) => {
      const o = points[0];
      return { type: 'solid', kind: 'rebar', params: normalizeParams('rebar', params), x: o.x, y: o.y, z: 0, rx: 0, ry: 0, rz: 0, shape: { host: null, path: points.map((q) => ({ x: q.x - o.x, y: q.y - o.y })), closed: Boolean(closed) } };
    });
  }
  if (kind === 'rebar') {
    // One rebar object per structure, in the structure's place (its bars follow its shape).
    return (source.hosts ?? []).filter((host) => REBAR_HOSTS.includes(host.kind)).map((host) => ({
      type: 'solid', kind: 'rebar', params: normalizeParams('rebar', params),
      x: host.x ?? 0, y: host.y ?? 0, z: host.z ?? 0, rx: 0, ry: 0, rz: host.rz ?? 0, ...(host.level ? { level: host.level } : {}),
      shape: { host: { kind: host.kind, params: { ...host.params }, ...(host.shape?.path ? { path: host.shape.path } : {}), ...(host.shape?.outer ? { outer: host.shape.outer, holes: host.shape.holes ?? [] } : {}) } },
    }));
  }
  const base = (origin) => ({ type: 'solid', kind, params: normalizeParams(kind, params), x: origin.x, y: origin.y, z: 0, rx: 0, ry: 0, rz: 0 });
  const rel = (o) => (p) => ({ x: p.x - o.x, y: p.y - o.y });
  if (ARCH_FROM_LINES.includes(kind)) {
    return (source.paths ?? []).filter((path) => path.points.length >= 2).map(({ points, closed }) => {
      const o = points[0];
      const pts = closed && points.length > 2 && Math.hypot(points[0].x - points[points.length - 1].x, points[0].y - points[points.length - 1].y) < 1e-6 ? points.slice(0, -1) : points;
      return { ...base(o), shape: { path: pts.map(rel(o)), closed: Boolean(closed) && pts.length >= 3, ...(kind === 'wall' ? { openings: [] } : {}) } };
    });
  }
  if (ARCH_FROM_OUTLINES.includes(kind)) {
    return (source.shapes ?? []).map(({ outer, holes = [] }) => {
      const o = outer[0];
      return { ...base(o), shape: { outer: outer.map(rel(o)), holes: holes.map((hole) => hole.map(rel(o))) } };
    });
  }
  return [];
}

// ───────────────────────── small geometry

const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a, b) => a.x * b.x + a.y * b.y;
const rect = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const ngon = (cx, cy, rx, ry, n = 48) => Array.from({ length: n }, (_, i) => ({ x: cx + rx * Math.cos((2 * Math.PI * i) / n), y: cy + ry * Math.sin((2 * Math.PI * i) / n) }));

// Each block (prism, roof slab) marks its triangles, so an object's blocks can be fused into one solid.
let blockCount = 0;
const mark = (tris) => { blockCount += 1; for (const tri of tris) tri.block = blockCount; return tris; };

/** Prism of an outline (x–y) with holes, from z0 to z1 (outward-facing triangles). */
export function prism(points, z0, z1, holes = []) {
  if (points.length < 3 || !(z1 - z0 > 1e-9)) return [];
  const tris = [];
  const outer = polygonArea(points) > 0 ? points : points.slice().reverse();
  const inner = holes.map((hole) => (polygonArea(hole) < 0 ? hole : hole.slice().reverse()));
  for (const [a, b, c] of triangulate(outer, inner)) {
    tris.push([[a.x, a.y, z1], [b.x, b.y, z1], [c.x, c.y, z1]]);
    tris.push([[a.x, a.y, z0], [c.x, c.y, z0], [b.x, b.y, z0]]);
  }
  for (const loop of [outer, ...inner]) {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i];
      const b = loop[(i + 1) % loop.length];
      tris.push([[a.x, a.y, z0], [b.x, b.y, z0], [b.x, b.y, z1]], [[a.x, a.y, z0], [b.x, b.y, z1], [a.x, a.y, z1]]);
    }
  }
  return mark(tris);
}

/** A box in a frame: origin o, along u (s0…s1), across n (d0…d1), z0…z1. */
function frameBox(o, u, n, s0, s1, d0, d1, z0, z1) {
  if (!(s1 - s0 > 1e-6) || !(d1 - d0 > 1e-6)) return [];
  const P = (s, d) => ({ x: o.x + u.x * s + n.x * d, y: o.y + u.y * s + n.y * d });
  return prism([P(s0, d0), P(s1, d0), P(s1, d1), P(s0, d1)], z0, z1);
}

// ───────────────────────── paths (walls, curtain walls, beams, railings)

/** Segments of a path: { a, b, len, dir, n (left normal), s0, s1 }. */
export function analyzePath(points, closed = false) {
  const pts = points.filter((p, i) => i === 0 || Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) > 1e-6);
  const segs = [];
  let s = 0;
  const count = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < count; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-6) continue;
    const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    segs.push({ a, b, len, dir, n: { x: -dir.y, y: dir.x }, s0: s, s1: s + len });
    s += len;
  }
  return { segs, total: s, closed: closed && segs.length >= 3 };
}

function miter(prev, next, d) {
  const m = add(prev.n, next.n);
  const ml = Math.hypot(m.x, m.y);
  if (ml < 1e-9) return add(next.a, mul(next.n, d));
  const mu = mul(m, 1 / ml);
  return add(next.a, mul(mu, d / Math.max(dot(mu, next.n), 0.25)));
}

/** Offset (d to the left) of vertex k of the path, mitred at corners. */
function vertexOffset(path, k, d) {
  const { segs, closed } = path;
  const m = segs.length;
  if (closed) {
    const i = ((k % m) + m) % m;
    return miter(segs[(i - 1 + m) % m], segs[i], d);
  }
  if (k <= 0) return add(segs[0].a, mul(segs[0].n, d));
  if (k >= m) return add(segs[m - 1].b, mul(segs[m - 1].n, d));
  return miter(segs[k - 1], segs[k], d);
}

/** The segment at distance s along the path (wrapping on a closed path). */
function segmentAt(path, s) {
  const { segs, total, closed } = path;
  let t = closed ? ((s % total) + total) % total : Math.min(Math.max(s, 0), total);
  let index = segs.findIndex((seg) => t <= seg.s1 + 1e-9);
  if (index < 0) index = segs.length - 1;
  if (closed && t >= total - 1e-9) { t = 0; index = 0; }
  return { seg: segs[index], index, t };
}

function offsetAt(path, s, d) {
  const { seg, index, t } = segmentAt(path, s);
  if (Math.abs(t - seg.s0) < 1e-6) return vertexOffset(path, index, d);
  if (Math.abs(t - seg.s1) < 1e-6) return vertexOffset(path, index + 1, d);
  return add(add(seg.a, mul(seg.dir, t - seg.s0)), mul(seg.n, d));
}

/** Offset line between distances s0 and s1 (s1 may pass the end of a closed path), corners included. */
function chain(path, s0, s1, d) {
  const out = [offsetAt(path, s0, d)];
  const marks = [];
  path.segs.forEach((seg, k) => {
    if (k > 0 || path.closed) { marks.push([seg.s0, k]); if (path.closed) marks.push([seg.s0 + path.total, k]); }
  });
  marks.sort((a, b) => a[0] - b[0]);
  for (const [pos, k] of marks) if (pos > s0 + 1e-6 && pos < s1 - 1e-6) out.push(vertexOffset(path, k, d));
  out.push(offsetAt(path, s1, d));
  return out;
}

const band = (path, s0, s1, dl, dr) => [...chain(path, s0, s1, dl), ...chain(path, s0, s1, dr).reverse()];

/** Left / right offsets of a wall for its alignment. */
/** Width of a wall: its layers together, or its width parameter. */
export const wallWidth = (entity) => {
  const layers = entity.shape?.layers ?? [];
  return layers.length ? layers.reduce((sum, layer) => sum + layer.thickness, 0) : entity.params.width;
};

function wallSides(p, width = p.width) {
  const w = width;
  if (p.align === 1) return [w, 0];
  if (p.align === 2) return [0, -w];
  return [w / 2, -w / 2];
}

/**
 * A wall's layout: its path, side offsets, the openings fitted on the path
 * (sorted, not overlapping) and the solid stretches between them. With
 * `filter`, only the openings it accepts count (the plan cut).
 */
export function wallLayout(entity, filter = null) {
  const p = entity.params;
  const shape = entity.shape ?? {};
  const path = analyzePath(shape.path ?? [], shape.closed);
  const [dl, dr] = wallSides(p, wallWidth(entity));
  if (!path.segs.length) return { path, dl, dr, openings: [], runs: [], ring: false };
  const fitted = [];
  for (const raw of [...(shape.openings ?? [])].sort((a, b) => a.at - b.at)) {
    const width = Math.min(raw.width, path.total - 2);
    const at = path.closed ? ((raw.at % path.total) + path.total) % path.total : Math.min(Math.max(raw.at, 0), path.total - width);
    const last = fitted[fitted.length - 1];
    if (width < 10 || (last && at < last.at + last.width + 1)) continue;
    if (path.closed && fitted.length && at + width > fitted[0].at + path.total - 1) continue;
    fitted.push({ ...raw, at, width, sill: Math.min(raw.sill, p.height), height: Math.min(raw.height, p.height - Math.min(raw.sill, p.height)) });
  }
  const openings = filter ? fitted.filter(filter) : fitted;
  const runs = [];
  if (path.closed) {
    if (!openings.length) return { path, dl, dr, openings, fitted, runs, ring: true };
    openings.forEach((o, i) => {
      const next = openings[(i + 1) % openings.length];
      const s0 = o.at + o.width;
      const s1 = next.at + (i === openings.length - 1 ? path.total : 0);
      if (s1 - s0 > 1e-3) runs.push([s0, s1]);
    });
  } else {
    let at = 0;
    for (const o of openings) { if (o.at - at > 1e-3) runs.push([at, o.at]); at = o.at + o.width; }
    if (path.total - at > 1e-3) runs.push([at, path.total]);
  }
  return { path, dl, dr, openings, fitted, runs, ring: false };
}

/** The two loops of a closed wall without openings (outer first). */
function ringLoops(L, dl = L.dl, dr = L.dr) {
  const m = L.path.segs.length;
  const left = Array.from({ length: m }, (_, k) => vertexOffset(L.path, k, dl));
  const right = Array.from({ length: m }, (_, k) => vertexOffset(L.path, k, dr));
  return Math.abs(polygonArea(left)) >= Math.abs(polygonArea(right)) ? [left, right] : [right, left];
}

/**
 * The material bands of a wall across its thickness, left (outside) to right:
 * [{ dl, dr, material }] — one band for a wall without layers.
 */
function wallBands(entity, L) {
  const layers = entity.shape?.layers ?? [];
  if (!layers.length) return [{ dl: L.dl, dr: L.dr, material: entity.material ?? null }];
  let at = L.dl;
  return layers.map((layer) => {
    const band = { dl: at, dr: at - layer.thickness, material: layer.material };
    at -= layer.thickness;
    return band;
  });
}

/** Length of a wall's path (mm). */
export const wallLength = (entity) => analyzePath(entity.shape?.path ?? [], entity.shape?.closed).total;

// ───────────────────────── 3D (local coordinates, in groups by material)

/**
 * A wall in parts (local coordinates): the wall body with its openings cut
 * (main), and per opening the frame and leaves or panes filling it (wood,
 * glass) and the void it cuts (a box through the wall, for IFC).
 */
export function wallParts(entity) {
  const p = entity.params;
  const H = p.height;
  const L = wallLayout(entity);
  const main = [];
  const openings = [];
  const bodies = [];
  if (!L.path.segs.length) return { main, openings, bodies };
  // Each material band of the wall is a body of its own (the same stretches, sills and lintels).
  for (const b of wallBands(entity, L)) {
    const tris = [];
    if (L.ring) {
      const [outer, inner] = ringLoops(L, b.dl, b.dr);
      tris.push(...prism(outer, 0, H, [inner]));
    }
    for (const [s0, s1] of L.runs) tris.push(...prism(band(L.path, s0, s1, b.dl, b.dr), 0, H));
    for (const o of L.openings) {
      const quad = band(L.path, o.at, o.at + o.width, b.dl, b.dr);
      if (o.sill > 1) tris.push(...prism(quad, 0, o.sill));
      if (o.sill + o.height < H - 1) tris.push(...prism(quad, o.sill + o.height, H));
    }
    bodies.push({ material: b.material, tris });
    main.push(...tris);
  }
  const dm = (L.dl + L.dr) / 2;
  const w = L.dl - L.dr;
  for (const o of L.openings) {
    const head = o.sill + o.height;
    const { seg } = segmentAt(L.path, o.at + o.width / 2);
    const a = o.at - seg.s0;
    const b = a + o.width;
    const box = (s0, s1, d0, d1, z0, z1) => frameBox(seg.a, seg.dir, seg.n, s0, s1, d0, d1, z0, z1);
    const glass = [];
    const wood = [];
    if (o.type === 'window') {
      const f = Math.min(60, o.width / 6, o.height / 6);
      const fd = Math.min(70, w * 0.8);
      const [d0, d1] = [dm - fd / 2, dm + fd / 2];
      wood.push(...box(a, a + f, d0, d1, o.sill, head), ...box(b - f, b, d0, d1, o.sill, head), ...box(a + f, b - f, d0, d1, o.sill, o.sill + f), ...box(a + f, b - f, d0, d1, head - f, head));
      // Panes: columns × rows, split by mullions and transoms that touch the frame.
      const cols = o.cols ?? 1;
      const rows = o.rows ?? 1;
      const m = f * 0.8;
      const cw = (b - a - 2 * f - (cols - 1) * m) / cols;
      const rh = (o.height - 2 * f - (rows - 1) * m) / rows;
      for (let i = 0; i < cols; i++) {
        const s0 = a + f + i * (cw + m);
        if (i) wood.push(...box(s0 - m, s0, d0, d1, o.sill + f, head - f));
        for (let j = 0; j < rows; j++) {
          const z0 = o.sill + f + j * (rh + m);
          if (j) wood.push(...box(s0, s0 + cw, d0, d1, z0 - m, z0));
          glass.push(...box(s0, s0 + cw, dm - 6, dm + 6, z0, z0 + rh));
        }
      }
    } else if (o.type === 'custom') {
      // A sketch window: the frame is its outline less the panes, the panes are glass.
      const fd = Math.min(70, w * 0.8);
      const toWall = (tris) => tris.map((tri) => tri.map(([x, y, zz]) => { const q = add(add(seg.a, mul(seg.dir, x)), mul(seg.n, zz)); return [q.x, q.y, y]; }).reverse());
      const at2 = (loop) => loop.map((q) => ({ x: a + q.u * o.width, y: o.sill + q.v * o.height }));
      const profile = o.profile ?? normalizeProfile(null);
      wood.push(...mark(toWall(prism(at2(profile.outer), dm - fd / 2, dm + fd / 2, profile.holes.map(at2)))));
      for (const hole of profile.holes) glass.push(...mark(toWall(prism(at2(hole), dm - 6, dm + 6))));
    } else if (o.type !== 'opening') {
      const f = Math.min(50, o.width / 8);
      const fd = Math.min(w, 120);
      const [d0, d1] = [dm - fd / 2, dm + fd / 2];
      wood.push(...box(a, a + f, d0, d1, o.sill, head), ...box(b - f, b, d0, d1, o.sill, head), ...box(a + f, b - f, d0, d1, head - f, head));
      const top = head - f;
      if (o.type === 'door') wood.push(...box(a + f, b - f, dm - 20, dm + 20, o.sill + 5, top));
      if (o.type === 'doubleDoor') {
        const c = (a + b) / 2;
        wood.push(...box(a + f, c - 2, dm - 20, dm + 20, o.sill + 5, top), ...box(c + 2, b - f, dm - 20, dm + 20, o.sill + 5, top));
      }
      if (o.type === 'sliding') {
        const half = (b - a - 2 * f) * 0.55;
        glass.push(...box(a + f, a + f + half, dm - 45, dm - 15, o.sill + 5, top), ...box(b - f - half, b - f, dm + 15, dm + 45, o.sill + 5, top));
      }
    }
    // The void reaches a little past both faces, so subtracting it from the uncut wall (IFC) leaves no slivers.
    openings.push({ opening: o, glass, wood, void: prism(band(L.path, o.at, o.at + o.width, L.dl + 20, L.dr - 20), o.sill, head) });
  }
  return { main, openings, bodies };
}

function wallGroups(entity) {
  const { main, openings, bodies } = wallParts(entity);
  const fill = { glass: openings.flatMap((part) => part.glass), wood: openings.flatMap((part) => part.wood) };
  if (!(entity.shape?.layers ?? []).length) return { main, ...fill };
  // A layered wall shows each layer in its material's colour.
  const groups = {};
  for (const body of bodies) {
    const key = `color:${body.material?.color ?? '#e6e1d6'}`;
    (groups[key] ??= []).push(...body.tris);
  }
  return { ...groups, ...fill };
}

function curtainGroups(entity) {
  const p = entity.params;
  const path = analyzePath(entity.shape?.path ?? [], entity.shape?.closed);
  const metal = [];
  const glass = [];
  const m = p.mullion;
  const rows = Math.max(1, Math.round(p.height / p.vspacing));
  path.segs.forEach((seg, i) => {
    const panels = Math.max(1, Math.round(seg.len / p.spacing));
    const box = (s0, s1, d0, d1, z0, z1) => frameBox(seg.a, seg.dir, seg.n, Math.max(0, s0), Math.min(seg.len, s1), d0, d1, z0, z1);
    // Mullions full height; transoms and panes fill the cells between them (nothing overlaps).
    const at = (k) => (k * seg.len) / panels;
    for (let k = 0; k <= panels; k++) {
      if (k === 0 && (i > 0 || path.closed)) continue;
      metal.push(...box(at(k) - m / 2, at(k) + m / 2, -p.depth / 2, p.depth / 2, 0, p.height));
    }
    const levels = Array.from({ length: rows + 1 }, (_, j) => (j * p.height) / rows);
    for (let k = 0; k < panels; k++) {
      // The first mullion of a segment that follows another is the previous segment's last one.
      const s0 = at(k) + (k === 0 && (i > 0 || path.closed) ? 0 : m / 2);
      const s1 = at(k + 1) - m / 2;
      levels.forEach((z, j) => metal.push(...box(s0, s1, -m / 2, m / 2, Math.max(0, z - m / 2), Math.min(p.height, z + m / 2))));
      for (let j = 0; j < rows; j++) glass.push(...box(s0, s1, -12, 12, levels[j] + (j ? m / 2 : m / 2), levels[j + 1] - m / 2));
    }
  });
  return { metal, glass };
}

/** Outline of a column (centred on its origin). */
/** Width, depth, web and flange of a column or beam section (a preset fills them in). */
export function sectionOf(p, width = p.width, depth = p.depth ?? p.height) {
  const preset = STEEL_PRESETS[p.preset ?? 0];
  if (preset && preset[0] !== 'customSize') {
    const [, shape, b, h, t, tf] = preset;
    return { shape, w: b, d: h, tw: t, tf };
  }
  const shape = COLUMN_SHAPES[p.profile ?? 0] ?? 'rect';
  // No web/flange given: the proportions the H-section always had.
  return { shape, w: width, d: depth, tw: p.tw > 0 ? p.tw : Math.max(2, width * 0.045), tf: p.tf > 0 ? p.tf : Math.max(2, depth * 0.07) };
}

/** Outline (and holes) of a section centred on the origin: x across the width, y across the depth. */
export function sectionOutline(sec) {
  const { shape, w, d } = sec;
  const tw = Math.min(sec.tw, w / 2 - 0.1);
  const tf = Math.min(sec.tf, d / 2 - 0.1);
  const [x0, x1, y0, y1] = [-w / 2, w / 2, -d / 2, d / 2];
  const P = (x, y) => ({ x, y });
  switch (shape) {
    case 'round': return { outer: ngon(0, 0, w / 2, d / 2), holes: [] };
    case 'hsection': return { outer: [P(x0, y0), P(x1, y0), P(x1, y0 + tf), P(tw / 2, y0 + tf), P(tw / 2, y1 - tf), P(x1, y1 - tf), P(x1, y1), P(x0, y1), P(x0, y1 - tf), P(-tw / 2, y1 - tf), P(-tw / 2, y0 + tf), P(x0, y0 + tf)], holes: [] };
    case 'channel': return { outer: [P(x0, y0), P(x1, y0), P(x1, y0 + tf), P(x0 + tw, y0 + tf), P(x0 + tw, y1 - tf), P(x1, y1 - tf), P(x1, y1), P(x0, y1)], holes: [] };
    case 'angle': return { outer: [P(x0, y0), P(x1, y0), P(x1, y0 + tw), P(x0 + tw, y0 + tw), P(x0 + tw, y1), P(x0, y1)], holes: [] };
    case 'tee': return { outer: [P(-tw / 2, y0), P(tw / 2, y0), P(tw / 2, y1 - tf), P(x1, y1 - tf), P(x1, y1), P(x0, y1), P(x0, y1 - tf), P(-tw / 2, y1 - tf)], holes: [] };
    case 'rhs': return { outer: rect(x0, y0, x1, y1), holes: [rect(x0 + tw, y0 + tw, x1 - tw, y1 - tw).reverse()] };
    case 'chs': return { outer: ngon(0, 0, w / 2, d / 2), holes: [ngon(0, 0, w / 2 - tw, d / 2 - tw).reverse()] };
    default: return { outer: rect(x0, y0, x1, y1), holes: [] };
  }
}

const isSteel = (sec) => sec.shape !== 'rect' && sec.shape !== 'round';

/**
 * A section (u across to the left of the path, v up) run along a level path,
 * one closed block per segment, the ends between segments cut on the
 * bisector so neighbours meet face to face.
 */
function mitredSweep(path, outer, holes) {
  const segs = path.segs;
  const turn = (d1, d2) => {
    const cross = d1.x * d2.y - d1.y * d2.x;
    const cos = Math.max(-1, Math.min(1, d1.x * d2.x + d1.y * d2.y));
    return Math.sign(cross) * Math.tan(Math.acos(cos) / 2);
  };
  const tris = [];
  segs.forEach((seg, k) => {
    const prev = k > 0 ? segs[k - 1] : path.closed ? segs[segs.length - 1] : null;
    const next = k < segs.length - 1 ? segs[k + 1] : path.closed ? segs[0] : null;
    const tStart = prev ? turn(prev.dir, seg.dir) : 0;
    const tEnd = next ? turn(seg.dir, next.dir) : 0;
    // A section point at (u, v) where the segment starts and ends.
    const at = (q, end) => {
      const s = end ? seg.len - q.x * tEnd : q.x * tStart;
      return [seg.a.x + seg.dir.x * s + seg.n.x * q.x, seg.a.y + seg.dir.y * s + seg.n.y * q.x, q.y];
    };
    const block = [];
    for (const [a, b, c] of triangulate(outer, holes)) {
      block.push([at(a, false), at(c, false), at(b, false)]);
      block.push([at(a, true), at(b, true), at(c, true)]);
    }
    for (const loop of [outer, ...holes]) {
      for (let i = 0; i < loop.length; i++) {
        const p = loop[i]; const q = loop[(i + 1) % loop.length];
        block.push([at(p, false), at(q, false), at(q, true)], [at(p, false), at(q, true), at(p, true)]);
      }
    }
    // Whichever way the section is wound, the block faces out.
    const vol = block.reduce((sum, [a, b, c]) => sum + (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])), 0);
    tris.push(...mark(vol < 0 ? block.map(([a, b, c]) => [a, c, b]) : block));
  });
  return tris;
}

/** A polyline with each inside corner replaced by a tangent arc of radius R (pipe elbows, bent bars). */
export function filletPath(points, R) {
  if (!(R > 0) || points.length < 3) return points;
  const out = [points[0]];
  for (let i = 1; i + 1 < points.length; i++) {
    const a = points[i - 1]; const v = points[i]; const b = points[i + 1];
    const u1 = { x: v.x - a.x, y: v.y - a.y }; const u2 = { x: b.x - v.x, y: b.y - v.y };
    const l1 = Math.hypot(u1.x, u1.y); const l2 = Math.hypot(u2.x, u2.y);
    if (l1 < 1e-9 || l2 < 1e-9) continue;
    const d1 = { x: u1.x / l1, y: u1.y / l1 }; const d2 = { x: u2.x / l2, y: u2.y / l2 };
    const turn = Math.acos(Math.max(-1, Math.min(1, d1.x * d2.x + d1.y * d2.y)));
    if (turn < 1e-6) { out.push(v); continue; }
    const back = Math.min(R * Math.tan(turn / 2), l1 / 2, l2 / 2);
    const r = back / Math.tan(turn / 2);
    const p1 = { x: v.x - d1.x * back, y: v.y - d1.y * back };
    const side = d1.x * d2.y - d1.y * d2.x > 0 ? 1 : -1;
    const c = { x: p1.x - d1.y * r * side, y: p1.y + d1.x * r * side };
    const a0 = Math.atan2(p1.y - c.y, p1.x - c.x);
    const steps = Math.max(2, Math.ceil(turn / (Math.PI / 16)));
    for (let k = 0; k <= steps; k++) {
      const t = a0 + side * turn * (k / steps);
      out.push({ x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t) });
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

/** Side profile of a straight flight (x along the run, z up). */
function stairsProfile(p) {
  const n = p.steps;
  const g = p.length / n;
  const r = p.height / n;
  const pts = [{ x: 0, y: 0 }];
  for (let k = 0; k < n; k++) pts.push({ x: k * g, y: (k + 1) * r }, { x: (k + 1) * g, y: (k + 1) * r });
  // Waist slab under the nosings, `thickness` thick (measured square to the slope).
  const slope = Math.hypot(g, r);
  const drop = (p.thickness * slope) / g;
  const endZ = Math.max(0, p.height - r - drop);
  const startX = Math.min(p.length, g + (drop * g) / r);
  pts.push({ x: p.length, y: endZ });
  if (endZ > 0 && startX < p.length) pts.push({ x: startX, y: 0 });
  return pts;
}

/** A straight flight of n steps (rise r, going g), placed at (x, y) turned by angle a, starting at height z. */
function flight(n, g, r, width, thickness, x, y, a, z) {
  const prof = stairsProfile({ steps: n, length: n * g, height: n * r, thickness });
  const c = Math.cos(a); const s = Math.sin(a);
  return mark(prism(prof, 0, width).map((tri) => tri.map(([u, v, w]) => [x + u * c - w * s, y + u * s + w * c, z + v]).reverse()));
}

/**
 * Stairs (FreeCAD Arch Stairs): straight, L (quarter landing, the second
 * flight turning left), U (half landing, back alongside) or spiral (round a newel).
 */
function stairsMesh(p) {
  const type = STAIR_TYPES[p.stairType] ?? 'straight';
  const n = p.steps;
  const r = p.height / n;
  const W = p.width;
  if (type === 'straight') return prism(stairsProfile(p), 0, W).map((tri) => tri.map(([x, z, y]) => [x, y, z]).reverse());
  if (type === 'spiral') {
    // Treads as ring sectors round a newel (radius 100), 30° each, under each the tread slab.
    const ri = 100; const ro = ri + W; const step = Math.PI / 6;
    const tris = prism(ngon(0, 0, ri, ri, 24), 0, p.height);
    for (let k = 0; k < n; k++) {
      const a0 = k * step; const a1 = (k + 1) * step;
      const arc = (rad, from, to) => Array.from({ length: 5 }, (_, i) => ({ x: rad * Math.cos(from + ((to - from) * i) / 4), y: rad * Math.sin(from + ((to - from) * i) / 4) }));
      const sector = [...arc(ri, a0, a1), ...arc(ro, a1, a0)];
      const top = (k + 1) * r;
      tris.push(...prism(sector, Math.max(0, top - Math.min(p.thickness, r * 0.9 + 40)), top));
    }
    return tris;
  }
  const g = p.length / n;
  const n1 = Math.max(1, Math.floor(n / 2));
  const n2 = n - n1;
  const L1 = n1 * g;
  const z1 = n1 * r;
  const tris = flight(n1, g, r, W, p.thickness, 0, 0, 0, 0);
  if (type === 'lShape') {
    // Landing W × W at the end, the second flight going +y from it.
    tris.push(...prism(rect(L1, 0, L1 + W, W), z1 - p.thickness, z1));
    tris.push(...flight(n2, g, r, W, p.thickness, L1 + W, W, Math.PI / 2, z1));
  } else {
    // Landing across both flights (2W + 100 gap), the second flight coming back along −x beside the first.
    const gap = 100;
    tris.push(...prism(rect(L1, 0, L1 + W, 2 * W + gap), z1 - p.thickness, z1));
    tris.push(...flight(n2, g, r, W, p.thickness, L1, 2 * W + gap, Math.PI, z1));
  }
  return tris;
}

/** Plan of turning stairs: tread lines, the landing, the walking line with its arrow. */
function stairsPlanTurning(p) {
  const type = STAIR_TYPES[p.stairType] ?? 'lShape';
  const n = p.steps;
  const W = p.width;
  const prims = [];
  if (type === 'spiral') {
    const ri = 100; const ro = ri + W; const step = Math.PI / 6;
    prims.push({ kind: 'circle', c: { x: 0, y: 0 }, r: ri });
    const total = Math.min(n * step, 2 * Math.PI);
    prims.push(poly(Array.from({ length: 49 }, (_, i) => ({ x: ro * Math.cos((total * i) / 48), y: ro * Math.sin((total * i) / 48) })), false));
    for (let k = 0; k <= Math.min(n, 12); k++) prims.push(line({ x: ri * Math.cos(k * step), y: ri * Math.sin(k * step) }, { x: ro * Math.cos(k * step), y: ro * Math.sin(k * step) }));
    prims.push(label({ x: (ri + W / 2) * Math.cos(step / 2), y: (ri + W / 2) * Math.sin(step / 2) }, 'UP', Math.min(W * 0.14, 250)));
    return prims;
  }
  const g = p.length / n;
  const n1 = Math.max(1, Math.floor(n / 2));
  const n2 = n - n1;
  const L1 = n1 * g;
  for (let k = 0; k <= n1; k++) prims.push(line({ x: k * g, y: 0 }, { x: k * g, y: W }));
  prims.push(line({ x: 0, y: 0 }, { x: L1, y: 0 }), line({ x: 0, y: W }, { x: L1, y: W }));
  if (type === 'lShape') {
    prims.push(poly(rect(L1, 0, L1 + W, W)));
    for (let k = 0; k <= n2; k++) prims.push(line({ x: L1, y: W + k * g }, { x: L1 + W, y: W + k * g }, k * g + W > PLAN_CUT * 2 ? { lineType: 'hidden', thin: true } : {}));
    prims.push(line({ x: L1, y: W }, { x: L1, y: W + n2 * g }), line({ x: L1 + W, y: W }, { x: L1 + W, y: W + n2 * g }));
    prims.push(poly([{ x: g * 0.4, y: W / 2 }, { x: L1 + W / 2, y: W / 2 }, { x: L1 + W / 2, y: W + (n2 - 0.4) * g }], false, { thin: true }));
  } else {
    const gap = 100;
    prims.push(poly(rect(L1, 0, L1 + W, 2 * W + gap)));
    for (let k = 0; k <= n2; k++) prims.push(line({ x: L1 - k * g, y: W + gap }, { x: L1 - k * g, y: 2 * W + gap }, { lineType: 'hidden', thin: true }));
    prims.push(line({ x: L1 - n2 * g, y: W + gap }, { x: L1, y: W + gap }), line({ x: L1 - n2 * g, y: 2 * W + gap }, { x: L1, y: 2 * W + gap }));
    prims.push(poly([{ x: g * 0.4, y: W / 2 }, { x: L1 + W / 2, y: W / 2 }, { x: L1 + W / 2, y: 1.5 * W + gap }, { x: L1 - (n2 - 0.4) * g, y: 1.5 * W + gap }], false, { thin: true }));
  }
  prims.push(label({ x: g * 0.9, y: W / 2 + W * 0.18 }, 'UP', Math.min(W * 0.14, 250), { align: 'left' }));
  return prims;
}

/** Is the outline a rectangle (four right angles)? */
const isRectangle = (pts) => pts.length === 4 && pts.every((p, i) => {
  const a = sub(pts[(i + 3) % 4], p);
  const c = sub(pts[(i + 1) % 4], p);
  return Math.abs(dot(a, c)) <= 1e-6 * Math.hypot(a.x, a.y) * Math.hypot(c.x, c.y);
});

/** The outline moved outwards by d (mitred corners), in the same order. */
export function offsetPolygon(points, d) {
  if (!d) return points.map((q) => ({ x: q.x, y: q.y }));
  const ccw = polygonArea(points) > 0 ? 1 : -1;
  const n = points.length;
  const lines = points.map((a, i) => {
    const b = points[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    const out = { x: dir.y * ccw, y: -dir.x * ccw };
    return { p: add(a, mul(out, d)), dir };
  });
  return points.map((q, i) => {
    const l1 = lines[(i - 1 + n) % n];
    const l2 = lines[i];
    const den = l1.dir.x * l2.dir.y - l1.dir.y * l2.dir.x;
    if (Math.abs(den) < 1e-9) return l2.p;
    const w = sub(l2.p, l1.p);
    const t = (w.x * l2.dir.y - w.y * l2.dir.x) / den;
    return add(l1.p, mul(l1.dir, t));
  });
}

/** The slope of each edge of a roof: its own (shape.slopes), 90° for the gable ends, else the roof's. */
export function roofSlopes(entity) {
  const p = entity.params;
  const outer = entity.shape?.outer ?? [];
  const own = entity.shape?.slopes ?? [];
  const n = outer.length;
  const first = n >= 2 ? norm2(sub(outer[1], outer[0])) : { x: 1, y: 0 };
  return outer.map((a, i) => {
    if (Number.isFinite(own[i])) return own[i];
    if (p.roofType === 0) {
      // Gable: the edges across the ridge (square to the first edge) stand up.
      const dir = norm2(sub(outer[(i + 1) % n], a));
      if (Math.abs(dot(dir, first)) < 0.2) return 90;
    }
    return p.slope;
  });
}
const norm2 = (v) => { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; };

/**
 * Faces of a roof (3D polygons, its underside) and its plan lines. Gable, hip
 * and per-edge roofs over any outline come from the weighted straight
 * skeleton (each edge rises at its own slope, 90° = a gable end); a shed roof
 * is one plane over the outline's box; a flat roof is the outline itself.
 * The eaves (the outline moved out by the overhang) sit at one height, lower
 * than the wall line by overhang × tan(slope).
 */
export function roofGeometry(entity) {
  const p = entity.params;
  const outer = entity.shape?.outer ?? [];
  if (outer.length < 3) return { faces: [], lines: [], corners: null };
  const tan = Math.tan((Math.min(p.slope, 75) * Math.PI) / 180);
  const ov = p.overhang;
  const type = p.slope < 0.01 ? 3 : p.roofType;
  if (type === 3) {
    const corners = offsetPolygon(outer, ov).map((q) => ({ ...q, z: 0 }));
    return { faces: [corners], lines: [], corners, tan: 0 };
  }
  if (type === 2) {
    // Shed: one plane rising from the first edge across the outline's box.
    const a = outer[0];
    const u = norm2(sub(outer[1], a));
    let n = { x: -u.y, y: u.x };
    if (outer.reduce((sum, q) => sum + dot(sub(q, a), n), 0) < 0) n = mul(n, -1);
    const us = outer.map((q) => dot(sub(q, a), u));
    const ns = outer.map((q) => dot(sub(q, a), n));
    const [u0, u1, n0, n1] = [Math.min(...us) - ov, Math.max(...us) + ov, Math.min(...ns) - ov, Math.max(...ns) + ov];
    const ze = -ov * tan;
    const P = (uu, nn, z) => ({ x: a.x + u.x * uu + n.x * nn, y: a.y + u.y * uu + n.y * nn, z });
    const corners = [P(u0, n0, ze), P(u1, n0, ze), P(u1, n1, ze + (n1 - n0) * tan), P(u0, n1, ze + (n1 - n0) * tan)];
    return { faces: [corners], lines: [], corners: corners.map((q) => ({ ...q, z: ze })), tan };
  }
  const eaves = offsetPolygon(outer, ov);
  const ze = -ov * tan;
  const { faces, arcs } = straightSkeleton(eaves, roofSlopes(entity));
  const lifted = faces.map((face) => face.points.map((q) => ({ x: q.x, y: q.y, z: ze + q.z }))).filter((face) => face.length >= 3 && Math.abs(polygonArea(face)) > 1e-3);
  // Hips, valleys and ridges: the arcs off the eaves.
  const lines = arcs.filter((arc) => Math.hypot(arc.from.x - arc.to.x, arc.from.y - arc.to.y) > 1e-6 && (arc.from.z > 1e-9 || arc.to.z > 1e-9))
    .map((arc) => [{ x: arc.from.x, y: arc.from.y, z: ze + arc.from.z }, { x: arc.to.x, y: arc.to.y, z: ze + arc.to.z }]);
  return { faces: lifted, lines, corners: eaves.map((q) => ({ ...q, z: ze })), tan, slopes: roofSlopes(entity) };
}

/**
 * A roof as one closed solid: the planes as its underside, the same lifted by
 * the vertical thickness as its top, and upright sides round the eaves and
 * gables (the edges no two planes share).
 */
function roofGroups(entity) {
  const p = entity.params;
  const { faces, tan } = roofGeometry(entity);
  if (!faces.length) return { main: [] };
  const t = faces.length === 1 && faces[0].every((q) => q.z === 0) ? p.thickness : p.thickness * Math.sqrt(1 + (tan ?? 0) ** 2);
  const tris = [];
  const key = (q) => `${q.x.toFixed(3)},${q.y.toFixed(3)}`;
  const edges = new Map();
  for (const face of faces) {
    const pts = polygonArea(face) > 0 ? face : face.slice().reverse();
    for (const [a, b, c] of triangulate(pts)) {
      tris.push([[a.x, a.y, a.z + t], [b.x, b.y, b.z + t], [c.x, c.y, c.z + t]]);
      tris.push([[a.x, a.y, a.z], [c.x, c.y, c.z], [b.x, b.y, b.z]]);
    }
    pts.forEach((a, i) => {
      const b = pts[(i + 1) % pts.length];
      const back = `${key(b)}>${key(a)}`;
      if (edges.has(back)) edges.delete(back); else edges.set(`${key(a)}>${key(b)}`, [a, b]);
    });
  }
  for (const [a, b] of edges.values()) tris.push([[a.x, a.y, a.z], [b.x, b.y, b.z], [b.x, b.y, b.z + t]], [[a.x, a.y, a.z], [b.x, b.y, b.z + t], [a.x, a.y, a.z + t]]);
  return { main: mark(tris) };
}

function railingGroups(entity) {
  const p = entity.params;
  const path = analyzePath(entity.shape?.path ?? [], entity.shape?.closed);
  const metal = [];
  const glass = [];
  const q = p.post;
  path.segs.forEach((seg, i) => {
    const box = (s0, s1, d0, d1, z0, z1) => frameBox(seg.a, seg.dir, seg.n, s0, s1, d0, d1, z0, z1);
    const posts = Math.max(1, Math.round(seg.len / p.spacing));
    for (let k = 0; k <= posts; k++) {
      if (k === 0 && (i > 0 || path.closed)) continue;
      const s = (k * seg.len) / posts;
      metal.push(...box(s - q / 2, s + q / 2, -q / 2, q / 2, 0, p.height - q));
    }
    metal.push(...box(-q / 2, seg.len + q / 2, -q * 0.6, q * 0.6, p.height - q, p.height));
    for (let k = 0; k < posts; k++) metal.push(...box((k * seg.len) / posts + q / 2, ((k + 1) * seg.len) / posts - q / 2, -q / 3, q / 3, 100, 100 + q * 0.6));
    const infill = RAILING_INFILL[p.infill] ?? 'rails';
    for (let k = 0; k < posts; k++) {
      const s0 = (k * seg.len) / posts + q / 2; const s1 = ((k + 1) * seg.len) / posts - q / 2;
      if (infill === 'balusters') {
        // Square balusters, at most 120 apart (a child must not pass), from the bottom rail to the handrail.
        const count = Math.max(1, Math.ceil((s1 - s0) / 120) - 1);
        for (let b = 1; b <= count; b++) { const s = s0 + ((s1 - s0) * b) / (count + 1); metal.push(...box(s - 10, s + 10, -10, 10, 100 + q * 0.6, p.height - q)); }
      } else if (infill === 'glass') glass.push(...box(s0 + 10, s1 - 10, -5, 5, 100 + q * 0.6 + 10, p.height - q - 10));
    }
  });
  return glass.length ? { metal, glass } : { metal };
}

/** Furniture and fixtures: simple blocks inside length × width × height (origin at a corner). */
function equipmentGroups(entity) {
  const { length: L, width: W, height: H } = entity.params;
  const type = EQUIPMENT_TYPES[entity.params.equipment] ?? 'bed';
  const box = (x0, y0, z0, x1, y1, z1) => prism(rect(x0, y0, x1, y1), z0, z1);
  const legs = (top) => [[0, 0], [L - 60, 0], [L - 60, W - 60], [0, W - 60]].flatMap(([x, y]) => box(x, y, 0, x + 60, y + 60, top));
  const main = [];
  const wood = [];
  switch (type) {
    case 'bed': main.push(...box(0, 0, 0, L, W, H * 0.55), ...box(L * 0.05, W * 0.12, H * 0.55, L * 0.22, W * 0.88, H * 0.65)); wood.push(...box(-60, 0, 0, 0, W, H)); break;
    case 'sofa': main.push(...box(0, 0, 0, L, W, H * 0.5), ...box(0, W - 200, H * 0.5, L, W, H), ...box(0, 0, H * 0.5, 180, W - 200, H * 0.75), ...box(L - 180, 0, H * 0.5, L, W - 200, H * 0.75)); break;
    case 'table': case 'desk':
      wood.push(...box(0, 0, H - 40, L, W, H), ...legs(H - 40));
      if (type === 'desk') wood.push(...box(L - 420, 0, H * 0.35, L - 60, W, H - 40));
      break;
    case 'chair': wood.push(...box(0, 0, H * 0.48, L, W, H * 0.52), ...box(0, W - 50, H * 0.52, L, W, H), ...legs(H * 0.48)); break;
    case 'wardrobe': wood.push(...box(0, 0, 0, L, W, H)); break;
    case 'toilet': main.push(...box(0, W * 0.1, 0, L * 0.25, W * 0.9, H), ...prism(ngon(L * 0.6, W / 2, L * 0.35, W * 0.45), 0, H * 0.5)); break;
    case 'basin': main.push(...box(0, 0, H - 180, L, W, H), ...box(L * 0.35, W * 0.2, 0, L * 0.65, W * 0.6, H - 180)); break;
    case 'bathtub': main.push(...box(0, 0, 0, L, W, 120), ...prism(rect(0, 0, L, W), 120, H, [rect(80, 80, L - 80, W - 80)])); break;
    case 'sink': wood.push(...box(0, 0, 0, L, W, H - 40)); main.push(...prism(rect(0, 0, L, W), H - 40, H, [rect(L * 0.3, W * 0.15, L * 0.55, W * 0.8)])); break;
    case 'fridge': main.push(...box(0, 0, 0, L, W, H)); break;
    case 'car': main.push(...box(0, 0, 350, L, W, H * 0.5), ...box(L * 0.28, 80, H * 0.5, L * 0.78, W - 80, H)); wood.push(...[[L * 0.15, 0], [L * 0.8, 0], [L * 0.15, W - 220], [L * 0.8, W - 220]].flatMap(([x, y]) => box(x - 330, y, 0, x + 330, y + 220, 350))); break;
    default: main.push(...box(0, 0, 0, L, W, H));
  }
  return { main, wood };
}

/** The triangles of an arch object in its own coordinates, by material: { main, glass, wood, metal, space }. */
export function archGroups(entity) {
  const p = entity.params;
  switch (entity.kind) {
    case 'wall': return wallGroups(entity);
    case 'curtainwall': return curtainGroups(entity);
    case 'column': {
      const sec = sectionOf(p);
      const { outer, holes } = sectionOutline(sec);
      return { [isSteel(sec) ? 'metal' : 'main']: prism(outer, 0, p.height, holes) };
    }
    case 'beam': {
      const path = analyzePath(entity.shape?.path ?? [], entity.shape?.closed);
      const sec = sectionOf(p, p.width, p.height);
      if (sec.shape === 'rect' && (p.preset ?? 0) === 0) return { main: path.segs.flatMap((seg) => frameBox(seg.a, seg.dir, seg.n, 0, seg.len, -p.width / 2, p.width / 2, 0, p.height)) };
      // The section (x across, y up from the beam's underside) run along the path, mitred at the bends.
      const { outer, holes } = sectionOutline(sec);
      const lift = (loop) => loop.map((q) => ({ x: q.x, y: q.y + sec.d / 2 }));
      return { [isSteel(sec) ? 'metal' : 'main']: mitredSweep(path, lift(outer), holes.map(lift)) };
    }
    case 'slab': return { main: prism(entity.shape?.outer ?? [], -p.thickness, 0, entity.shape?.holes ?? []) };
    case 'stairs': return { main: stairsMesh(p) };
    case 'roof': return roofGroups(entity);
    case 'space': return { space: prism(entity.shape?.outer ?? [], 0, p.height, entity.shape?.holes ?? []) };
    case 'railing': return railingGroups(entity);
    case 'equipment': return equipmentGroups(entity);
    case 'rebar': return { main: rebarBars(entity).flatMap((bar) => tubeAlong(bar.points, bar.radius, false, 10)) };
    case 'truss': return { metal: trussMembers(entity).flatMap(([p, q, size]) => boxBetween(p, q, size)) };
    case 'panel': return { main: panelMesh(entity) };
    case 'pipe': return { main: pipeMesh(entity) };
    default: return {};
  }
}

/**
 * All the triangles of an arch object (local), without the light space
 * volumes. Its blocks (wall stretches, frames, panes, furniture parts) touch
 * but never overlap, so the volume is the sum of theirs.
 */
export function archMesh(entity) {
  return Object.entries(archGroups(entity)).filter(([name]) => name !== 'space').flatMap(([, tris]) => tris);
}

/** The closed blocks of an arch object (local): each a solid of its own for B-rep exports (STEP). */
export function archBlocks(entity) {
  const blocks = new Map();
  for (const tri of archMesh(entity)) {
    const key = tri.block ?? 0;
    if (!blocks.has(key)) blocks.set(key, []);
    blocks.get(key).push(tri);
  }
  return [...blocks.values()];
}

// ───────────────────────── pipes, trusses, panels, rebars

/** A round tube (r) along a 3D polyline [[x, y, z]], mitred at its bends; hollow inside r − wall when wall > 0. */
export function tubeAlong(points, r, closed = false, sides = 16, wall = 0) {
  const pts = points.filter((q, i) => i === 0 || Math.hypot(q[0] - points[i - 1][0], q[1] - points[i - 1][1], q[2] - points[i - 1][2]) > 1e-6);
  if (pts.length < 2 || !(r > 0)) return [];
  const n = pts.length;
  const dotV = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const crossV = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const unit = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
  /** Rodrigues: v turned by the rotation that takes unit a onto unit b. */
  const turn = (v, a, b) => {
    const k = crossV(a, b);
    const s = Math.hypot(...k);
    const c = dotV(a, b);
    if (s < 1e-12) return v;
    const kk = k.map((x) => x / s);
    const kv = crossV(kk, v);
    const kd = dotV(kk, v);
    return v.map((x, i) => x * c + kv[i] * s + kk[i] * kd * (1 - c));
  };
  const dirs = pts.slice(0, -1).map((q, i) => unit([pts[i + 1][0] - q[0], pts[i + 1][1] - q[1], pts[i + 1][2] - q[2]]));
  // A frame perpendicular to the path, carried round each bend (no twist).
  let side = unit(crossV(dirs[0], Math.abs(dirs[0][2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
  let up = crossV(dirs[0], side);
  const rings = [];
  for (let k = 0; k < n; k++) {
    const din = dirs[Math.max(0, k - 1)];
    const dout = dirs[Math.min(dirs.length - 1, k)];
    const t = unit([din[0] + dout[0], din[1] + dout[1], din[2] + dout[2]]);
    const ct = dotV(din, t) || 1;
    // The incoming cylinder cut by the plane that halves the bend.
    const ring = (radius) => Array.from({ length: sides }, (_, j) => {
      const th = (2 * Math.PI * j) / sides;
      const o = [0, 1, 2].map((i) => side[i] * Math.cos(th) * radius + up[i] * Math.sin(th) * radius);
      const lambda = -dotV(o, t) / ct;
      return [0, 1, 2].map((i) => pts[k][i] + o[i] + din[i] * lambda);
    });
    rings.push({ outer: ring(r), inner: wall > 0 && wall < r ? ring(r - wall) : null });
    if (k > 0 && k < n - 1) { side = turn(side, din, dout); up = turn(up, din, dout); }
    if (k === 0 && n > 1) { /* the first frame already belongs to the first segment */ }
  }
  const tris = [];
  const quad = (a, b, c, d) => tris.push([a, b, c], [a, c, d]);
  for (let k = 0; k + 1 < n; k++) {
    for (let j = 0; j < sides; j++) {
      const j2 = (j + 1) % sides;
      quad(rings[k].outer[j], rings[k].outer[j2], rings[k + 1].outer[j2], rings[k + 1].outer[j]);
      if (rings[k].inner) quad(rings[k].inner[j2], rings[k].inner[j], rings[k + 1].inner[j], rings[k + 1].inner[j2]);
    }
  }
  // End caps: discs, or flat rings for a hollow pipe.
  const cap = (ring, flip) => {
    const c = ring.outer.reduce((acc, q) => acc.map((v, i) => v + q[i] / sides), [0, 0, 0]);
    for (let j = 0; j < sides; j++) {
      const j2 = (j + 1) % sides;
      if (ring.inner) {
        if (flip) quad(ring.outer[j2], ring.outer[j], ring.inner[j], ring.inner[j2]);
        else quad(ring.outer[j], ring.outer[j2], ring.inner[j2], ring.inner[j]);
      } else tris.push(flip ? [c, ring.outer[j2], ring.outer[j]] : [c, ring.outer[j], ring.outer[j2]]);
    }
  };
  cap(rings[0], true);
  cap(rings[n - 1], false);
  void closed;
  // The winding follows the frame's handedness: make the faces point out.
  let v = 0;
  for (const [p, q, s] of tris) v += p[0] * (q[1] * s[2] - q[2] * s[1]) - p[1] * (q[0] * s[2] - q[2] * s[0]) + p[2] * (q[0] * s[1] - q[1] * s[0]);
  return mark(v < 0 ? tris.map(([p, q, s]) => [p, s, q]) : tris);
}

/** A square bar of side `size` from p to q (3D points). */
function boxBetween(p, q, size) {
  const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
  const len = Math.hypot(...d);
  if (len < 1e-6) return [];
  const u = d.map((x) => x / len);
  const ref = Math.abs(u[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const a1 = cr(u, ref); const l1 = Math.hypot(...a1); const s1 = a1.map((x) => x / l1);
  const s2 = cr(u, s1);
  const h = size / 2;
  // Unit box (x along the bar) mapped onto the bar.
  return mark(prism([{ x: -h, y: -h }, { x: h, y: -h }, { x: h, y: h }, { x: -h, y: h }], 0, len).map((tri) => tri.map(([x, y, z]) => [p[0] + s1[0] * x + s2[0] * y + u[0] * z, p[1] + s1[1] * x + s2[1] * y + u[1] * z, p[2] + s1[2] * x + s2[2] * y + u[2] * z])));
}

/** A pipe: a round (hollow) tube along its path at its own height. */
function pipeMesh(entity) {
  const p = entity.params;
  let path = entity.shape?.path ?? [];
  if (entity.shape?.closed && path.length > 2) path = [...path, path[0]];
  // Bends: elbows of the given centre-line radius instead of mitred corners.
  if (p.bend > 0) path = filletPath(path, p.bend);
  const pts = path.map((q) => [q.x, q.y, 0]);
  const service = PIPE_SERVICES[p.service] ?? 'pipe';
  // A cable is solid; a duct is rectangular (diameter wide, 0.6 × as high).
  if (service === 'cable') return tubeAlong(pts, p.diameter / 2, false, 16, 0);
  if (service === 'duct') return sweepRect(pts, p.diameter, p.diameter * 0.6, p.wall);
  return tubeAlong(pts, p.diameter / 2, false, 20, p.wall);
}

/**
 * A rectangular duct along a level path: one mitred sweep (the corners cut on
 * the bisector), hollow when wall > 0 with ring-shaped ends.
 */
function sweepRect(pts, w, h, wall) {
  const path = pts.map(([x, y]) => ({ x, y })).filter((q, k, all) => k === 0 || Math.hypot(q.x - all[k - 1].x, q.y - all[k - 1].y) > 1e-9);
  if (path.length < 2) return [];
  const segN = path.slice(0, -1).map((a, k) => { const b = path[k + 1]; const l = Math.hypot(b.x - a.x, b.y - a.y); return { x: -(b.y - a.y) / l, y: (b.x - a.x) / l }; });
  // Across-direction at each vertex: the bisector, stretched so the walls keep their width.
  const across = path.map((_, k) => {
    if (k === 0) return segN[0];
    if (k === path.length - 1) return segN[segN.length - 1];
    const m = { x: segN[k - 1].x + segN[k].x, y: segN[k - 1].y + segN[k].y };
    const l = Math.hypot(m.x, m.y) || 1;
    const nb = { x: m.x / l, y: m.y / l };
    const c = Math.max(0.2, nb.x * segN[k].x + nb.y * segN[k].y);
    return { x: nb.x / c, y: nb.y / c };
  });
  const ring = (k, u0, u1, v0, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => [path[k].x + across[k].x * u, path[k].y + across[k].y * u, v]);
  const hollow = wall > 0 && wall < Math.min(w, h) / 2;
  const outer = path.map((_, k) => ring(k, -w / 2, w / 2, -h / 2, h / 2));
  const inner = hollow ? path.map((_, k) => ring(k, -w / 2 + wall, w / 2 - wall, -h / 2 + wall, h / 2 - wall)) : null;
  const tris = [];
  const sides = (rings, inward) => {
    for (let k = 0; k + 1 < rings.length; k++) for (let e = 0; e < 4; e++) {
      const a = rings[k][e]; const b = rings[k][(e + 1) % 4]; const c = rings[k + 1][(e + 1) % 4]; const d = rings[k + 1][e];
      if (inward) tris.push([a, c, b], [a, d, c]); else tris.push([a, b, c], [a, c, d]);
    }
  };
  sides(outer, false);
  if (hollow) sides(inner, true);
  const end = (k, first) => {
    const o = outer[k];
    if (!hollow) { const q = first ? [[o[0], o[2], o[1]], [o[0], o[3], o[2]]] : [[o[0], o[1], o[2]], [o[0], o[2], o[3]]]; tris.push(...q); return; }
    const n = inner[k];
    for (let e = 0; e < 4; e++) {
      const a = o[e]; const b = o[(e + 1) % 4]; const c = n[(e + 1) % 4]; const d = n[e];
      if (first) tris.push([a, c, b], [a, d, c]); else tris.push([a, b, c], [a, c, d]);
    }
  };
  end(0, true);
  end(path.length - 1, false);
  // Whichever way the path turns, the duct faces outward.
  const vol = tris.reduce((sum, [a, b, c]) => sum + (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])), 0);
  return vol < 0 ? tris.map(([a, b, c]) => [a, c, b]) : tris;
}

function pipePlan(entity) {
  const p = entity.params;
  const path = analyzePath(entity.shape?.path ?? [], entity.shape?.closed);
  const prims = [];
  path.segs.forEach((seg) => {
    const at = (t, d) => add(add(seg.a, mul(seg.dir, t)), mul(seg.n, d));
    prims.push(line(at(0, p.diameter / 2), at(seg.len, p.diameter / 2)), line(at(0, -p.diameter / 2), at(seg.len, -p.diameter / 2)), line(seg.a, seg.b, { lineType: 'center', thin: true }));
  });
  return prims;
}

/** Members of a truss along each segment of its path: [p, q, size] (3D, local). */
export function trussMembers(entity) {
  const p = entity.params;
  const path = analyzePath(entity.shape?.path ?? [], entity.shape?.closed);
  const out = [];
  for (const seg of path.segs) {
    const P = (s, z) => { const q = add(seg.a, mul(seg.dir, s)); return [q.x, q.y, z]; };
    const c = p.chord / 2;
    const [zb, zt] = [c, p.height - c];
    const n = p.panels;
    const step = seg.len / n;
    out.push([P(0, zb), P(seg.len, zb), p.chord], [P(0, zt), P(seg.len, zt), p.chord]);
    for (let k = 0; k <= n; k++) {
      const s = k * step;
      if (p.trussType !== 2 || k === 0 || k === n) out.push([P(s, zb + c), P(s, zt - c), p.web]);
      if (k === n) continue;
      const s2 = s + step;
      const left = k < n / 2;
      if (p.trussType === 2) out.push(k % 2 ? [P(s, zt - c), P(s2, zb + c), p.web] : [P(s, zb + c), P(s2, zt - c), p.web]);
      // Pratt: diagonals fall toward the middle; Howe: rise toward it.
      else if ((p.trussType === 0) === left) out.push([P(s, zt - c), P(s2, zb + c), p.web]);
      else out.push([P(s, zb + c), P(s2, zt - c), p.web]);
    }
  }
  return out;
}

function trussPlan(entity) {
  const p = entity.params;
  const path = analyzePath(entity.shape?.path ?? [], entity.shape?.closed);
  return path.segs.flatMap((seg) => {
    const at = (t, d) => add(add(seg.a, mul(seg.dir, t)), mul(seg.n, d));
    const h = p.chord / 2;
    return [poly([at(0, -h), at(seg.len, -h), at(seg.len, h), at(0, h)], true, { lineType: 'hidden' }), line(seg.a, seg.b, { lineType: 'center', thin: true })];
  });
}

/** A panel: its outline `thickness` thick, flat or corrugated (waves along x). */
function panelMesh(entity) {
  const p = entity.params;
  const outer = entity.shape?.outer ?? [];
  const holes = entity.shape?.holes ?? [];
  if (outer.length < 3) return [];
  if (!(p.waveLength > 0 && p.waveHeight > 0)) return prism(outer, 0, p.thickness, holes);
  const xs = outer.map((q) => q.x); const ys = outer.map((q) => q.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  if (!holes.length && Math.abs(Math.abs(polygonArea(outer)) - (x1 - x0) * (y1 - y0)) < 1e-6 * (x1 - x0) * (y1 - y0)) {
    // A rectangular sheet: its wave cross-section (x–z) run along y — flat faces only, as a real corrugated sheet.
    const waveAt = (x) => (p.waveHeight / 2) * Math.sin((2 * Math.PI * (x - x0)) / p.waveLength);
    const n = Math.max(2, Math.ceil(((x1 - x0) / p.waveLength) * 12));
    const xsAlong = Array.from({ length: n + 1 }, (_, i) => x0 + ((x1 - x0) * i) / n);
    const wavy = [...xsAlong.map((x) => ({ x, y: waveAt(x) })), ...xsAlong.slice().reverse().map((x) => ({ x, y: waveAt(x) + p.thickness }))];
    // Points on one line (each zero crossing of the sine) would make zero-area cap triangles.
    const straight = (q, i, all) => { const o = all[(i + all.length - 1) % all.length]; const r = all[(i + 1) % all.length]; return Math.abs((q.x - o.x) * (r.y - o.y) - (q.y - o.y) * (r.x - o.x)) < 1e-9 * Math.hypot(r.x - o.x, r.y - o.y) ** 2; };
    const section = wavy.filter((q, i, all) => !straight(q, i, all));
    return mark(prism(section, y0, y1).map((tri) => tri.map(([x, z, y]) => [x, y, z]).reverse()));
  }
  // Corrugated: the outline's triangles cut into thin strips, lifted on a sine wave.
  const wave = (x) => (p.waveHeight / 2) * Math.sin((2 * Math.PI * x) / p.waveLength);
  const maxEdge = p.waveLength / 8;
  const flat = [];
  const split = (tri, depth = 0) => {
    const [a, b, c] = tri;
    const edges = [[a, b], [b, c], [c, a]].map(([u, v]) => Math.abs(u.x - v.x));
    const worst = Math.max(...edges);
    if (worst <= maxEdge || depth > 12) { flat.push(tri); return; }
    const i = edges.indexOf(worst);
    const [u, v, w] = [tri[i], tri[(i + 1) % 3], tri[(i + 2) % 3]];
    const m = { x: (u.x + v.x) / 2, y: (u.y + v.y) / 2 };
    split([u, m, w], depth + 1);
    split([m, v, w], depth + 1);
  };
  const ccw = polygonArea(outer) > 0 ? outer : outer.slice().reverse();
  for (const tri of triangulate(ccw, holes.map((hole) => (polygonArea(hole) < 0 ? hole : hole.slice().reverse())))) split(tri);
  const tris = [];
  for (const [a, b, c] of flat) {
    tris.push([[a.x, a.y, wave(a.x) + p.thickness], [b.x, b.y, wave(b.x) + p.thickness], [c.x, c.y, wave(c.x) + p.thickness]]);
    tris.push([[a.x, a.y, wave(a.x)], [c.x, c.y, wave(c.x)], [b.x, b.y, wave(b.x)]]);
  }
  // Sides along the edges the strips leave open (so the corrugated sheet is one closed body).
  const key = (q) => `${q.x.toFixed(4)},${q.y.toFixed(4)}`;
  const edges = new Map();
  for (const [a, b, c] of flat) for (const [u, v] of [[a, b], [b, c], [c, a]]) {
    const back = `${key(v)}>${key(u)}`;
    if (edges.has(back)) edges.delete(back); else edges.set(`${key(u)}>${key(v)}`, [u, v]);
  }
  for (const [u, v] of edges.values()) tris.push([[u.x, u.y, wave(u.x)], [v.x, v.y, wave(v.x)], [v.x, v.y, wave(v.x) + p.thickness]], [[u.x, u.y, wave(u.x)], [v.x, v.y, wave(v.x) + p.thickness], [u.x, u.y, wave(u.x) + p.thickness]]);
  return mark(tris);
}

/**
 * The bars of a rebar object (FreeCAD Arch Rebar), from the structure it is in:
 *   column  longitudinal bars round the section (`bars` per side) and ties every `spacing`
 *   beam    `bars` at the top and bottom of each segment and stirrups every `spacing`
 *   slab    a bottom mesh both ways every `spacing`, clipped to the outline
 * [{ points: [[x, y, z]], radius, length }] in the rebar's (= the host's) coordinates.
 */
export function rebarBars(entity) {
  const p = entity.params;
  const host = entity.shape?.host;
  if (!host && !(entity.shape?.path?.length >= 2)) return [];
  const r = p.diameter / 2;
  const rs = p.stirrup / 2;
  const c = p.cover + rs * 2 + r;
  const bars = [];
  const bar = (points, radius = r) => bars.push({ points, radius, length: points.slice(1).reduce((sum, q, i) => sum + Math.hypot(q[0] - points[i][0], q[1] - points[i][1], q[2] - points[i][2]), 0) });
  const custom = entity.shape?.path;
  if (!host && custom?.length >= 2) {
    // `bars` copies of the drawn shape, `spacing` apart across its first leg, bends of 2.5 d (inside radius).
    const pts = entity.shape.closed ? [...custom, custom[0]] : custom;
    const a = pts[0]; const b = pts[1];
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const n = { x: -(b.y - a.y) / l, y: (b.x - a.x) / l };
    const bent = filletPath(pts, p.diameter * 3);
    for (let k = 0; k < p.bars; k++) {
      const off = (k - (p.bars - 1) / 2) * p.spacing;
      bar(bent.map((q) => [q.x + n.x * off, q.y + n.y * off, p.cover + r]));
    }
    return bars;
  }
  const hp = host.params ?? {};
  const spread = (from, to, count) => Array.from({ length: count }, (_, i) => (count === 1 ? (from + to) / 2 : from + ((to - from) * i) / (count - 1)));
  if (host.kind === 'column') {
    const [hw, hd] = [hp.width / 2 - c, (hp.profile === 1 ? hp.width : hp.depth) / 2 - c];
    const z0 = p.cover; const z1 = hp.height - p.cover;
    if (hw > 0 && hd > 0) {
      const xs = spread(-hw, hw, p.bars); const ys = spread(-hd, hd, p.bars);
      const ring = [...xs.map((x) => [x, -hd]), ...ys.slice(1).map((y) => [hw, y]), ...xs.slice(0, -1).reverse().map((x) => [x, hd]), ...ys.slice(1, -1).reverse().map((y) => [-hw, y])];
      for (const [x, y] of ring) bar([[x, y, z0], [x, y, z1]]);
      const tw = hw + r + rs; const td = hd + r + rs;
      for (let z = z0 + p.spacing / 2; z < z1; z += p.spacing) bar([[-tw, -td, z], [tw, -td, z], [tw, td, z], [-tw, td, z], [-tw, -td, z]], rs);
    }
  } else if (host.kind === 'beam') {
    const path = analyzePath(host.path ?? [], false);
    const hw = hp.width / 2 - c;
    for (const seg of path.segs) {
      const P = (s, d, z) => { const q = add(add(seg.a, mul(seg.dir, s)), mul(seg.n, d)); return [q.x, q.y, z]; };
      const s0 = p.cover; const s1 = seg.len - p.cover;
      if (hw <= 0 || s1 <= s0) continue;
      for (const z of [c, hp.height - c]) for (const d of spread(-hw, hw, p.bars)) bar([P(s0, d, z), P(s1, d, z)]);
      const tw = hw + r + rs; const z0 = c - r - rs; const z1 = hp.height - c + r + rs;
      for (let s = s0 + p.spacing / 2; s < s1; s += p.spacing) bar([P(s, -tw, z0), P(s, tw, z0), P(s, tw, z1), P(s, -tw, z1), P(s, -tw, z0)], rs);
    }
  } else if (host.kind === 'slab') {
    const outer = host.outer ?? [];
    if (outer.length >= 3) {
      const loops = [outer, ...(host.holes ?? [])];
      const z = -hp.thickness + c;
      const xs = outer.map((q) => q.x); const ys = outer.map((q) => q.y);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      // A straight bar across the outline at every step, cut where it leaves the slab (less the cover).
      const along = (fixed, lo, hi, horizontal, zz) => {
        for (let v = fixed[0] + p.cover; v <= fixed[1] - p.cover + 1e-6; v += p.spacing) {
          const hits = [];
          for (const loop of loops) for (let i = 0; i < loop.length; i++) {
            const a = loop[i]; const b = loop[(i + 1) % loop.length];
            const [av, bv, au, bu] = horizontal ? [a.y, b.y, a.x, b.x] : [a.x, b.x, a.y, b.y];
            if ((av > v) !== (bv > v)) hits.push(au + ((v - av) / (bv - av)) * (bu - au));
          }
          hits.sort((m, n) => m - n);
          for (let i = 0; i + 1 < hits.length; i += 2) {
            const [u0, u1] = [hits[i] + p.cover, hits[i + 1] - p.cover];
            if (u1 - u0 > p.diameter) bar(horizontal ? [[u0, v, zz], [u1, v, zz]] : [[v, u0, zz], [v, u1, zz]]);
          }
        }
        void lo; void hi;
      };
      along([y0, y1], x0, x1, true, z);
      along([x0, x1], y0, y1, false, z + p.diameter);
    }
  }
  return bars;
}

function rebarPlan(entity) {
  const bars = rebarBars(entity);
  const prims = [];
  for (const b of bars) {
    const vertical = b.points.length === 2 && Math.hypot(b.points[1][0] - b.points[0][0], b.points[1][1] - b.points[0][1]) < 1e-6;
    // Bars standing through the cut show as dots; the others as thin dashed lines.
    if (vertical) prims.push({ kind: 'circle', c: { x: b.points[0][0], y: b.points[0][1] }, r: b.radius }, ...hatchPrimitives([ngon(b.points[0][0], b.points[0][1], b.radius, b.radius, 12)], 'solid'));
    else prims.push(poly(b.points.map(([x, y]) => ({ x, y })), false, { lineType: 'dashed', thin: true }));
  }
  return prims;
}

// ───────────────────────── plan (2D, local coordinates)

const line = (a, b, extra = {}) => ({ kind: 'line', a, b, ...extra });
const poly = (points, closed = true, extra = {}) => ({ kind: 'poly', points, closed, ...extra });
const arcPoly = (c, r, start, end, extra = {}) => poly(arcPoints(c.x, c.y, r, start, end, 5), false, extra);
const deg = (v) => (Math.atan2(v.y, v.x) * 180) / Math.PI;
const hatch = (loops, angle, spacing, pattern = 'ansi31') => hatchPrimitives(loops, pattern, angle, Math.max(spacing, 1) / 3.175);
const label = (p, text, size, extra = {}) => ({ kind: 'text', p, text, size, angle: 0, align: 'center', valign: 'middle', ...extra });

function wallPlan(entity) {
  const p = entity.params;
  const cutsWall = p.height > PLAN_CUT;
  const L = wallLayout(entity, (o) => o.sill < PLAN_CUT && o.sill + o.height > PLAN_CUT);
  if (!L.path.segs.length) return [];
  const prims = [];
  const w = L.dl - L.dr;
  const spacing = Math.min(Math.max(w / 4, 20), 120);
  const angle = deg(L.path.segs[0].dir);
  // Each material band cut by the plan is outlined and hatched in its material's pattern.
  const hatchOf = (loops, material, a, bandWidth) => {
    const pattern = material?.pattern ?? 'ansi31';
    if (!cutsWall || pattern === 'none') return [];
    if (pattern === 'solid') return hatchPrimitives(loops, 'solid');
    return hatch(loops, a, Math.min(Math.max(bandWidth / 3, pattern === 'dots' ? 80 : 40), 150), pattern);
  };
  void spacing;
  for (const b of wallBands(entity, L)) {
    const bw = b.dl - b.dr;
    if (L.ring) {
      const loops = ringLoops(L, b.dl, b.dr);
      prims.push(...loops.map((loop) => poly(loop)));
      prims.push(...hatchOf(loops, b.material, angle, bw));
    }
    for (const [s0, s1] of L.runs) {
      const loop = band(L.path, s0, s1, b.dl, b.dr);
      prims.push(poly(loop));
      prims.push(...hatchOf([loop], b.material, deg(segmentAt(L.path, (s0 + s1) / 2).seg.dir), bw));
    }
  }
  const dm = (L.dl + L.dr) / 2;
  for (const o of L.openings) {
    const at = (s, d) => offsetAt(L.path, s, d);
    const [a, b] = [o.at, o.at + o.width];
    const { seg } = segmentAt(L.path, (a + b) / 2);
    if (o.type === 'window' || o.type === 'custom') {
      prims.push(line(at(a, L.dl), at(b, L.dl), { thin: true }), line(at(a, L.dr), at(b, L.dr), { thin: true }));
      prims.push(line(at(a, dm + w * 0.08), at(b, dm + w * 0.08), { thin: true }), line(at(a, dm - w * 0.08), at(b, dm - w * 0.08), { thin: true }));
    } else if (o.type === 'opening') {
      prims.push(line(at(a, L.dl), at(b, L.dl), { lineType: 'hidden', thin: true }), line(at(a, L.dr), at(b, L.dr), { lineType: 'hidden', thin: true }));
    } else if (o.type === 'sliding') {
      const half = o.width * 0.55;
      prims.push(poly([at(a, dm), at(a + half, dm), at(a + half, dm + w * 0.15), at(a, dm + w * 0.15)]), poly([at(b - half, dm - w * 0.15), at(b, dm - w * 0.15), at(b, dm), at(b - half, dm)]));
    } else {
      // Door leaves square to the wall on the swing side, with their swing arcs.
      const face = o.swing > 0 ? L.dl : L.dr;
      const out = mul(seg.n, o.swing);
      const leaves = o.type === 'doubleDoor' ? [[a, 1, o.width / 2], [b, -1, o.width / 2]] : [[o.hinge > 0 ? a : b, o.hinge > 0 ? 1 : -1, o.width]];
      for (const [s, dirSign, r] of leaves) {
        const hinge = at(s, face);
        const leafEnd = add(hinge, mul(out, r));
        prims.push(line(hinge, leafEnd));
        const toJamb = mul(seg.dir, dirSign);
        const [a0, a1] = [deg(out), deg(toJamb)];
        const ccw = out.x * toJamb.y - out.y * toJamb.x > 0;
        prims.push(arcPoly(hinge, r, ccw ? a0 : a1, ccw ? a1 : a0, { thin: true }));
      }
    }
  }
  return prims;
}

function stairsPlan(p) {
  const n = p.steps;
  const g = p.length / n;
  const r = p.height / n;
  const W = p.width;
  const prims = [];
  // Steps whose tops are under the cut are seen; the flight is broken at the cut.
  const below = Math.min(n, Math.floor(PLAN_CUT / r));
  const xb = below >= n ? null : Math.min(p.length, (below + 0.5) * g);
  const style = (x) => (xb !== null && x > xb ? { lineType: 'hidden', thin: true } : {});
  for (let k = 0; k <= n; k++) prims.push(line({ x: k * g, y: 0 }, { x: k * g, y: W }, style(k * g)));
  if (xb === null) prims.push(line({ x: 0, y: 0 }, { x: p.length, y: 0 }), line({ x: 0, y: W }, { x: p.length, y: W }));
  else {
    prims.push(line({ x: 0, y: 0 }, { x: xb, y: 0 }), line({ x: 0, y: W }, { x: xb, y: W }));
    prims.push(line({ x: xb, y: 0 }, { x: p.length, y: 0 }, { lineType: 'hidden', thin: true }), line({ x: xb, y: W }, { x: p.length, y: W }, { lineType: 'hidden', thin: true }));
    prims.push(poly([{ x: xb - g * 0.5, y: -W * 0.05 }, { x: xb - g * 0.1, y: W * 0.45 }, { x: xb + g * 0.25, y: W * 0.4 }, { x: xb + g * 0.5, y: W * 1.05 }], false));
  }
  const tip = { x: (n - 0.4) * g, y: W / 2 };
  const ah = Math.min(g * 0.6, W * 0.15);
  prims.push(poly([{ x: g * 0.4, y: W / 2 }, tip], false, { thin: true }), poly([{ x: tip.x - ah, y: tip.y - ah * 0.5 }, tip, { x: tip.x - ah, y: tip.y + ah * 0.5 }], false, { thin: true }));
  prims.push({ kind: 'circle', c: { x: g * 0.4, y: W / 2 }, r: Math.min(g, W) * 0.08, thin: true });
  prims.push(label({ x: g * 0.9, y: W / 2 + W * 0.18 }, 'UP', Math.min(W * 0.14, 250), { align: 'left' }));
  return prims;
}

function equipmentPlan(p) {
  const { length: L, width: W } = p;
  const type = EQUIPMENT_TYPES[p.equipment] ?? 'bed';
  const thin = { thin: true };
  const prims = [poly(rect(0, 0, L, W))];
  switch (type) {
    case 'bed': prims.push(poly(rect(-60, 0, 0, W)), poly(rect(L * 0.05, W * 0.12, L * 0.22, W * 0.88), true, thin), line({ x: L * 0.32, y: 0 }, { x: L * 0.32, y: W }, thin), line({ x: L * 0.32, y: W }, { x: L * 0.42, y: W * 0.7 }, thin)); break;
    case 'sofa': prims.push(line({ x: 0, y: W - 200 }, { x: L, y: W - 200 }, thin), line({ x: 180, y: 0 }, { x: 180, y: W - 200 }, thin), line({ x: L - 180, y: 0 }, { x: L - 180, y: W - 200 }, thin), line({ x: L / 2, y: 0 }, { x: L / 2, y: W - 200 }, thin)); break;
    case 'chair': prims.push(line({ x: 0, y: W - 50 }, { x: L, y: W - 50 }, thin)); break;
    case 'desk': prims.push(line({ x: L - 420, y: 0 }, { x: L - 420, y: W }, { lineType: 'hidden', thin: true })); break;
    case 'wardrobe': prims.push(line({ x: 0, y: W / 2 }, { x: L, y: W / 2 }, { lineType: 'hidden', thin: true }), line({ x: L / 2, y: 0 }, { x: L / 2, y: W }, thin)); break;
    case 'toilet': prims.length = 0; prims.push(poly(rect(0, W * 0.1, L * 0.25, W * 0.9)), poly(ngon(L * 0.6, W / 2, L * 0.36, W * 0.45)), poly(ngon(L * 0.62, W / 2, L * 0.24, W * 0.3), true, thin)); break;
    case 'basin': prims.push(poly(ngon(L / 2, W * 0.45, L * 0.32, W * 0.3), true, thin), { kind: 'circle', c: { x: L / 2, y: W * 0.88 }, r: Math.min(L, W) * 0.04, thin: true }); break;
    case 'bathtub': prims.push(poly(rect(80, 80, L - 80, W - 80), true, thin), { kind: 'circle', c: { x: L - 220, y: W / 2 }, r: 35, thin: true }); break;
    case 'sink': prims.push(poly(rect(L * 0.3, W * 0.15, L * 0.55, W * 0.8), true, thin), { kind: 'circle', c: { x: L * 0.425, y: W * 0.9 }, r: 30, thin: true }, poly(ngon(L * 0.8, W / 2, W * 0.15, W * 0.15), true, thin), poly(ngon(L * 0.8, W / 2, W * 0.07, W * 0.07), true, thin)); break;
    case 'fridge': prims.push(line({ x: 0, y: 0 }, { x: L, y: W }, thin), line({ x: 0, y: W }, { x: L, y: 0 }, thin)); break;
    case 'car': prims.push(poly(rect(L * 0.28, 80, L * 0.78, W - 80), true, thin), line({ x: L * 0.72, y: 80 }, { x: L * 0.72, y: W - 80 }, thin)); break;
    default: break;
  }
  return prims;
}

function axisPlan(entity) {
  const p = entity.params;
  if ((AXIS_TYPES[p.axisType] ?? 'grid') === 'radial') return radialAxisPlan(p);
  const { xs, ys } = axisLines(entity);
  const prims = [];
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const e = p.extension;
  const r = p.bubble;
  xs.forEach((x, i) => prims.push(line({ x, y: y0 - e }, { x, y: y1 + e }, { lineType: 'center', thin: true }), { kind: 'circle', c: { x, y: y0 - e - r }, r }, label({ x, y: y0 - e - r }, String(i + 1), r * 0.9)));
  ys.forEach((y, j) => prims.push(line({ x: x0 - e, y }, { x: x1 + e, y }, { lineType: 'center', thin: true }), { kind: 'circle', c: { x: x0 - e - r, y }, r }, label({ x: x0 - e - r, y }, axisLetter(j), r * 0.9)));
  return prims;
}

/**
 * A radial axis system (FreeCAD Axis, radial): countX lines from the centre
 * angleStep apart (numbered), countY rings spacingY apart (lettered).
 */
function radialAxisPlan(p) {
  const prims = [];
  const R = p.countY * p.spacingY;
  const e = p.extension;
  const r = p.bubble;
  const step = (p.angleStep * Math.PI) / 180;
  const sweepAll = (p.countX - 1) * step;
  for (let i = 0; i < p.countX; i++) {
    const a = i * step;
    const d = { x: Math.cos(a), y: Math.sin(a) };
    prims.push(line({ x: 0, y: 0 }, { x: d.x * (R + e), y: d.y * (R + e) }, { lineType: 'center', thin: true }));
    const c = { x: d.x * (R + e + r), y: d.y * (R + e + r) };
    prims.push({ kind: 'circle', c, r }, label(c, String(i + 1), r * 0.9));
  }
  for (let j = 1; j <= p.countY; j++) {
    const rad = j * p.spacingY;
    prims.push(poly(Array.from({ length: 49 }, (_, k) => ({ x: rad * Math.cos((sweepAll * k) / 48), y: rad * Math.sin((sweepAll * k) / 48) })), false, { lineType: 'center', thin: true }));
    const c = { x: rad, y: -e - r };
    prims.push({ kind: 'circle', c, r }, label(c, axisLetter(j - 1), r * 0.9));
  }
  return prims;
}

/** Centroid of a polygon (its middle for a label). */
function centroid(points) {
  let a = 0; let cx = 0; let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    const k = p.x * q.y - q.x * p.y;
    a += k; cx += (p.x + q.x) * k; cy += (p.y + q.y) * k;
  }
  if (Math.abs(a) < 1e-9) return points[0] ?? { x: 0, y: 0 };
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

/**
 * Where a room's label goes: the inside point farthest from the outline and
 * its holes (sampled on a grid, then refined), so it stays clear of the walls
 * in L-shaped rooms and rooms round a core.
 */
export function labelPoint(outer, holes = []) {
  const loops = [outer, ...holes];
  const inside = (p) => {
    let k = 0;
    for (const loop of loops) {
      for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
        const a = loop[i]; const b = loop[j];
        if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) k += 1;
      }
    }
    return k % 2 === 1;
  };
  const clearance = (p) => {
    let best = Infinity;
    for (const loop of loops) {
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i]; const b = loop[(i + 1) % loop.length];
        const dx = b.x - a.x; const dy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
        best = Math.min(best, Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t));
      }
    }
    return best;
  };
  const xs = outer.map((p) => p.x); const ys = outer.map((p) => p.y);
  let [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  let best = centroid(outer);
  let score = inside(best) ? clearance(best) : -1;
  for (let round = 0; round < 3; round++) {
    const n = 16;
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
      const p = { x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * j) / n };
      if (!inside(p)) continue;
      const c = clearance(p);
      if (c > score + 1e-6) { score = c; best = p; }
    }
    const w = (x1 - x0) / 8; const h = (y1 - y0) / 8;
    [x0, x1, y0, y1] = [best.x - w, best.x + w, best.y - h, best.y + h];
  }
  return best;
}

/** Floor area of a space or slab (mm²). */
export function outlineArea(entity) {
  const s = entity.shape ?? {};
  return Math.abs(polygonArea(s.outer ?? [])) - (s.holes ?? []).reduce((sum, hole) => sum + Math.abs(polygonArea(hole)), 0);
}

/** The plan of an arch object, in its own coordinates (lines, polylines, circles, text; hatches as thin lines). */
export function archPlan(entity) {
  const p = entity.params;
  const s = entity.shape ?? {};
  switch (entity.kind) {
    case 'wall': return wallPlan(entity);
    case 'curtainwall': {
      const path = analyzePath(s.path ?? [], s.closed);
      const prims = [];
      const m = p.mullion;
      path.segs.forEach((seg, i) => {
        const at = (t, d) => add(add(seg.a, mul(seg.dir, t)), mul(seg.n, d));
        prims.push(line(at(0, 12), at(seg.len, 12), { thin: true }), line(at(0, -12), at(seg.len, -12), { thin: true }));
        const panels = Math.max(1, Math.round(seg.len / p.spacing));
        for (let k = 0; k <= panels; k++) {
          if (k === 0 && (i > 0 || path.closed)) continue;
          const c = (k * seg.len) / panels;
          prims.push(poly([at(Math.max(0, c - m / 2), -p.depth / 2), at(Math.min(seg.len, c + m / 2), -p.depth / 2), at(Math.min(seg.len, c + m / 2), p.depth / 2), at(Math.max(0, c - m / 2), p.depth / 2)]));
        }
      });
      return prims;
    }
    case 'column': {
      const sec = sectionOf(p);
      const { outer: outline, holes: secHoles } = sectionOutline(sec);
      const prims = sec.shape === 'round' && Math.abs(sec.w - sec.d) < 1e-6 ? [{ kind: 'circle', c: { x: 0, y: 0 }, r: sec.w / 2 }] : [poly(outline), ...secHoles.map((h) => poly(h))];
      // Cut by the plan: hatched in its material's pattern (steel solid), concrete cross-hatched by default.
      const pattern = entity.material?.pattern ?? (isSteel(sec) ? 'solid' : 'ansi37');
      if (p.height > PLAN_CUT && pattern !== 'none') prims.push(...(pattern === 'solid' ? hatchPrimitives([outline, ...secHoles], 'solid') : hatch([outline, ...secHoles], 0, Math.min(Math.max(sec.w / 8, 15), 120), pattern)));
      return prims;
    }
    case 'beam': {
      const path = analyzePath(s.path ?? [], s.closed);
      return path.segs.map((seg) => {
        const at = (t, d) => add(add(seg.a, mul(seg.dir, t)), mul(seg.n, d));
        return poly([at(0, -p.width / 2), at(seg.len, -p.width / 2), at(seg.len, p.width / 2), at(0, p.width / 2)], true, { lineType: 'hidden' });
      });
    }
    case 'slab': return [s.outer, ...(s.holes ?? [])].filter((loop) => loop?.length >= 3).map((loop) => poly(loop, true, { thin: true }));
    case 'stairs': return (STAIR_TYPES[p.stairType] ?? 'straight') === 'straight' ? stairsPlan(p) : stairsPlanTurning(p);
    case 'roof': {
      const { corners, lines } = roofGeometry(entity);
      if (!corners) return [];
      return [poly(corners, true, { lineType: 'hidden' }), ...lines.map(([a, b]) => line(a, b, { lineType: 'hidden', thin: true }))];
    }
    case 'space': {
      const outer = s.outer ?? [];
      if (outer.length < 3) return [];
      const area = outlineArea(entity) / 1e6;
      const size = Math.min(Math.max(Math.sqrt(area) * 1000 / 14, 120), 450);
      // Rectangles keep their label in the middle; other rooms at their most open point.
      const c = outer.length === 4 && !(s.holes ?? []).length ? centroid(outer) : labelPoint(outer, s.holes ?? []);
      return [
        poly(outer, true, { lineType: 'dotted', thin: true }),
        label({ x: c.x, y: c.y + size * 0.7 }, entity.name || 'Space', size, { bold: true }),
        label({ x: c.x, y: c.y - size * 0.7 }, `${area.toFixed(2)} m²`, size * 0.75),
      ];
    }
    case 'railing': {
      const path = analyzePath(s.path ?? [], s.closed);
      const prims = [poly(s.path ?? [], path.closed, { thin: true })];
      path.segs.forEach((seg, i) => {
        const posts = Math.max(1, Math.round(seg.len / p.spacing));
        for (let k = 0; k <= posts; k++) {
          if (k === 0 && (i > 0 || path.closed)) continue;
          const c = add(seg.a, mul(seg.dir, (k * seg.len) / posts));
          const h = p.post / 2;
          prims.push(poly(rect(c.x - h, c.y - h, c.x + h, c.y + h), true, { thin: true }));
        }
      });
      return prims;
    }
    case 'equipment': return equipmentPlan(p);
    case 'axis': return axisPlan(entity);
    case 'rebar': return rebarPlan(entity);
    case 'truss': return trussPlan(entity);
    case 'panel': return [s.outer, ...(s.holes ?? [])].filter((loop) => loop?.length >= 3).map((loop) => poly(loop, true, p.waveHeight > 0 ? { lineType: 'dashed' } : {}));
    case 'pipe': return pipePlan(entity);
    default: return [];
  }
}

// ───────────────────────── quantities (BIM schedule)

/** What the properties panel and the schedule say about an arch object. */
export function archQuantities(entity) {
  const p = entity.params;
  switch (entity.kind) {
    case 'wall': {
      const length = wallLength(entity);
      const openings = entity.shape?.openings ?? [];
      const openArea = openings.reduce((sum, o) => sum + o.width * o.height, 0);
      return { length, wallArea: Math.max(0, length * p.height - openArea), windows: openings.filter((o) => o.type === 'window').length, doors: openings.filter((o) => ['door', 'doubleDoor', 'sliding'].includes(o.type)).length };
    }
    case 'curtainwall': { const length = analyzePath(entity.shape?.path ?? [], entity.shape?.closed).total; return { length, wallArea: length * p.height }; }
    case 'beam': case 'railing': return { length: analyzePath(entity.shape?.path ?? [], entity.shape?.closed).total };
    case 'slab': case 'space': return { floorArea: outlineArea(entity) };
    case 'roof': {
      const { faces } = roofGeometry(entity);
      const area = faces.reduce((sum, face) => {
        // True area of a sloped face: its plan area over the cosine of its slope.
        const plan = Math.abs(polygonArea(face));
        const [a, b, c] = face;
        const n = [(b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y), (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z), (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)];
        const cos = Math.abs(n[2]) / (Math.hypot(...n) || 1);
        return sum + plan / Math.max(cos, 1e-6);
      }, 0);
      return { roofArea: area };
    }
    case 'stairs': return { riser: p.height / p.steps, tread: p.length / p.steps };
    case 'rebar': {
      const bars = rebarBars(entity);
      const length = bars.reduce((sum, bar) => sum + bar.length, 0);
      // Steel: 7850 kg/m³ → 0.00617 d² kg per metre (d in mm).
      return { count: bars.length, length, weight: bars.reduce((sum, bar) => sum + (bar.length / 1000) * 0.00617 * (bar.radius * 2) ** 2, 0) };
    }
    case 'truss': return { length: analyzePath(entity.shape?.path ?? [], entity.shape?.closed).total, count: trussMembers(entity).length };
    case 'pipe': return { length: analyzePath(entity.shape?.path ?? [], entity.shape?.closed).total };
    case 'panel': return { floorArea: outlineArea(entity) };
    default: return {};
  }
}

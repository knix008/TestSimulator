// The model: what the user draws and the engine solves (ARCHITECTURE.md "Model JSON").
// Pure functions only — no DOM — so the unit tests run them in Node.
import { materialFromLibrary } from './materials.js';

export const FORMAT = 'myheat';
export const VERSION = 1;
export const EXTENSION = 'myheat';

export const BOUNDARY_TYPES = {
  temperature: { thermal: true, fields: ['T'] },
  flux: { thermal: true, fields: ['q'] },
  convection: { thermal: true, fields: ['h', 'Tinf', 'emissivity'] },
  radiation: { thermal: true, fields: ['emissivity', 'Tamb'] },
  adiabatic: { thermal: true, fields: [] },
  inlet: { flow: true, fields: ['velocity', 'Tin'] },
  outlet: { flow: true, fields: [] },
  open: { flow: true, fields: ['Tinf'] },
  wall: { flow: true, fields: [] },
  slip: { flow: true, fields: [] },
  fixed: { structural: true, fields: [] },
  rollerX: { structural: true, fields: [] },
  rollerY: { structural: true, fields: [] },
  // SimScale-style additions (ARCHITECTURE.md): thermal contact, electric field, mechanical loads
  contact: { thermal: true, fields: ['resistance'] },
  thinLayer: { thermal: true, fields: ['thickness', 'k'] },
  voltage: { electric: true, fields: ['V'] },
  ground: { electric: true, fields: [] },
  currentIn: { electric: true, fields: ['I'] },
  fan: { flow: true, fields: ['Tin'] },
  pressure: { structural: true, fields: ['p'] },
  force: { structural: true, fields: ['fx', 'fy', 'fz'] },
};

export const EDGE_TARGETS_2D = ['left', 'right', 'bottom', 'top'];
export const EDGE_TARGETS_3D = ['left', 'right', 'bottom', 'top', 'front', 'back'];

export const DEFAULT_STUDY = {
  type: 'steady', flow: false, natural: false, stress: false, planeStrain: false,
  Tref: 25, initialT: 25, endTime: 600, dt: 1, frames: 40, tolerance: 1e-6, maxIter: 20000, flowSteps: 3000,
  turbulence: 'laminar', // laminar | kOmegaSST
  electric: false, // Joule heating from an electric potential field
  thermalStrain: true, gravityLoad: false, // stress: thermal expansion, self weight
  modal: { enabled: false, modes: 6 },
  comfort: { met: 1.2, clo: 0.5, rh: 50, tr: null },
};

let counter = 0;
/** A short id that is unique inside one model (`prefix` + base-36 counter + random tail). */
export function newId(prefix, taken = []) {
  const used = new Set(taken);
  for (;;) {
    counter += 1;
    const id = `${prefix}${counter.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    if (!used.has(id)) return id;
  }
}

export function emptyModel(language = 'ko') {
  return normalizeModel({
    name: language === 'en' ? 'Untitled' : '제목 없음',
    domain: { dim: 2, width: 100, height: 60, depth: 10, nx: 100, ny: 60, nz: 10, background: 'air' },
    ambient: 25,
    materials: [materialFromLibrary('air', language), materialFromLibrary('al6061', language)],
    bodies: [],
    boundaries: [],
    probes: [],
    study: { ...DEFAULT_STUDY },
  });
}

const num = (value, fallback) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

/** Fills in every default so the rest of the app can rely on the fields. Returns a new object. */
export function normalizeModel(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const d = raw.domain ?? {};
  const dim = d.dim === 3 ? 3 : 2;
  const domain = {
    dim,
    width: Math.max(0.001, num(d.width, 100)),
    height: Math.max(0.001, num(d.height, 60)),
    depth: Math.max(0.001, num(d.depth, 10)),
    nx: Math.max(1, Math.round(num(d.nx, 100))),
    ny: Math.max(1, Math.round(num(d.ny, 60))),
    nz: Math.max(1, Math.round(num(d.nz, 10))),
    background: d.background === undefined ? 'air' : d.background,
  };
  // [[x, value], …] tables (time tables on boundaries, cp(T) on materials): sorted by x, null when empty.
  const table = (v) => (Array.isArray(v) && v.some(Array.isArray)
    ? v.filter(Array.isArray).map((p) => [num(Number(p[0]), 0), num(Number(p[1]), 0)]).sort((a, b) => a[0] - b[0])
    : null);
  const materials = (Array.isArray(raw.materials) ? raw.materials : []).filter(Boolean).map((m) => ({
    ...m, id: String(m.id ?? newId('m')), ...(m.cpT !== undefined ? { cpT: table(m.cpT) } : {}),
  }));
  const bodies = (Array.isArray(raw.bodies) ? raw.bodies : []).filter(Boolean).map((b) => normalizeBody(b, domain));
  const boundaries = (Array.isArray(raw.boundaries) ? raw.boundaries : []).filter(Boolean).map((bc) => ({
    id: String(bc.id ?? newId('bc')), name: bc.name ?? '', target: bc.target ?? 'exterior', range: Array.isArray(bc.range) ? bc.range.slice(0, 2).map(Number) : null,
    region: Array.isArray(bc.region) && bc.region.length === 4 ? bc.region.map(Number) : null,
    curve: Array.isArray(bc.curve) ? bc.curve.map((p) => [num(p[0], 0), num(p[1], 0)]) : null,
    type: BOUNDARY_TYPES[bc.type] || bc.type === 'thinLayer' ? bc.type : 'convection',
    T: num(bc.T, 25), q: num(bc.q, 0), h: num(bc.h, 10), Tinf: num(bc.Tinf, 25), emissivity: num(bc.emissivity, 0), Tamb: num(bc.Tamb, 25),
    // time tables [[t s, value], …] overriding T / q / h / Tinf / Tamb in transient studies
    Tt: table(bc.Tt), qt: table(bc.qt), ht: table(bc.ht), Tinft: table(bc.Tinft), Tambt: table(bc.Tambt),
    // convection correlation (length mm; velocity m/s for forcedPlate)
    hMode: ['fixed', 'naturalVertical', 'naturalHorizontalUp', 'naturalHorizontalDown', 'forcedPlate'].includes(bc.hMode) ? bc.hMode : 'fixed',
    length: num(bc.length, 100),
    velocity: num(bc.velocity, 1), Tin: num(bc.Tin, 25),
    turbulenceIntensity: num(bc.turbulenceIntensity, 0.05), mixingLength: bc.mixingLength == null ? null : num(bc.mixingLength, 1),
    resistance: num(bc.resistance, 1e-4), V: num(bc.V, 1), I: num(bc.I, 1), p: num(bc.p, 1e5), fx: num(bc.fx, 0), fy: num(bc.fy, -10), fz: num(bc.fz, 0),
    // thin layer: thickness (mm), conductivity (W/mK), resistive | conductive
    thickness: num(bc.thickness, 0.1), k: num(bc.k, 1), mode: bc.mode === 'conductive' ? 'conductive' : 'resistive',
    // UI-only (THERM/NFRC): boundary tag and projected length (mm); the engine ignores both
    tag: typeof bc.tag === 'string' && bc.tag ? bc.tag : null,
    projectedLength: typeof bc.projectedLength === 'number' && Number.isFinite(bc.projectedLength) ? bc.projectedLength : null,
  }));
  const probes = (Array.isArray(raw.probes) ? raw.probes : []).filter(Boolean).map((p) => ({
    id: String(p.id ?? newId('p')), name: p.name ?? '', x: num(p.x, 0), y: num(p.y, 0), z: num(p.z, domain.depth / 2),
  }));
  return {
    format: FORMAT,
    version: VERSION,
    name: typeof raw.name === 'string' ? raw.name : '',
    description: typeof raw.description === 'string' ? raw.description : '',
    domain,
    ambient: num(raw.ambient, 25),
    gravity: Array.isArray(raw.gravity) && raw.gravity.length >= 2 ? [num(raw.gravity[0], 0), num(raw.gravity[1], -9.81)] : [0, -9.81],
    materials,
    bodies,
    boundaries,
    probes,
    study: {
      ...DEFAULT_STUDY, s2s: false, s2sMedium: 'void', ...(raw.study ?? {}),
      modal: { ...DEFAULT_STUDY.modal, ...(raw.study?.modal ?? {}) }, comfort: { ...DEFAULT_STUDY.comfort, ...(raw.study?.comfort ?? {}) },
      ...(raw.study?.s2sMedium === 'fluids' ? {} : { s2sMedium: 'void' }), // surface-to-surface radiation medium: void | fluids
    },
    reliability: { components: Array.isArray(raw.reliability?.components) ? raw.reliability.components : [] },
    view: raw.view && typeof raw.view === 'object' ? raw.view : {},
  };
}

function normalizeBody(b, domain) {
  const shape = ['rect', 'circle', 'polygon'].includes(b.shape) ? b.shape : 'rect';
  const body = {
    id: String(b.id ?? newId('b')), name: b.name ?? '', shape, material: b.material ?? null,
    x: num(b.x, 0), y: num(b.y, 0), w: Math.max(0, num(b.w, 10)), h: Math.max(0, num(b.h, 10)),
    cx: num(b.cx, 0), cy: num(b.cy, 0), r: Math.max(0, num(b.r, 5)),
    points: Array.isArray(b.points) ? b.points.map((p) => [num(p[0], 0), num(p[1], 0)]) : [],
    z0: num(b.z0, 0), z1: num(b.z1, domain.depth),
    power: num(b.power, 0),
    powerProfile: Array.isArray(b.powerProfile) && b.powerProfile.length ? b.powerProfile.map((p) => [num(p[0], 0), num(p[1], 0)]) : null,
    current: Array.isArray(b.current) && b.current.length ? b.current.map((p) => [num(p[0], 0), num(p[1], 0)]) : null,
    resistance: b.resistance == null ? null : num(b.resistance, 0),
    hidden: Boolean(b.hidden),
  };
  return body;
}

/** The model as saved: everything but transient UI state. */
export function serializeModel(model) {
  return JSON.stringify(model, null, 2);
}

export function parseModel(text) {
  let raw;
  try {
    raw = JSON.parse(String(text).replace(/^﻿/, ''));
  } catch (error) {
    throw new Error(`JSON: ${error.message}`);
  }
  if (!raw || typeof raw !== 'object') throw new Error('not a model');
  if (raw.format && raw.format !== FORMAT) throw new Error(`unknown format "${raw.format}"`);
  return normalizeModel(raw);
}

// ───────────────────────── geometry

/** Axis-aligned bounds of a body in mm: {x0, y0, x1, y1}. */
export function bodyBounds(body) {
  if (body.shape === 'circle') return { x0: body.cx - body.r, y0: body.cy - body.r, x1: body.cx + body.r, y1: body.cy + body.r };
  if (body.shape === 'polygon') {
    if (!body.points.length) return { x0: 0, y0: 0, x1: 0, y1: 0 };
    const xs = body.points.map((p) => p[0]);
    const ys = body.points.map((p) => p[1]);
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  }
  return { x0: body.x, y0: body.y, x1: body.x + body.w, y1: body.y + body.h };
}

export function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Is (x, y) mm inside the body's 2D outline? (The engine uses the same test on cell centres.) */
export function bodyContains(body, x, y) {
  if (body.shape === 'circle') return (x - body.cx) ** 2 + (y - body.cy) ** 2 <= body.r * body.r;
  if (body.shape === 'polygon') return body.points.length >= 3 && pointInPolygon(x, y, body.points);
  return x >= body.x && x <= body.x + body.w && y >= body.y && y <= body.y + body.h;
}

/** Area of the body outline in mm². */
export function bodyArea(body) {
  if (body.shape === 'circle') return Math.PI * body.r * body.r;
  if (body.shape === 'polygon') {
    let sum = 0;
    const p = body.points;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) sum += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]);
    return Math.abs(sum) / 2;
  }
  return body.w * body.h;
}

/** Moves a body by (dx, dy) mm (returns a new body). */
export function moveBody(body, dx, dy) {
  if (body.shape === 'circle') return { ...body, cx: body.cx + dx, cy: body.cy + dy };
  if (body.shape === 'polygon') return { ...body, points: body.points.map(([x, y]) => [x + dx, y + dy]) };
  return { ...body, x: body.x + dx, y: body.y + dy };
}

/** Resizes a body so its bounds become `b` (rect: exact; circle: fits; polygon: scaled). */
export function resizeBody(body, b) {
  const x0 = Math.min(b.x0, b.x1);
  const x1 = Math.max(b.x0, b.x1);
  const y0 = Math.min(b.y0, b.y1);
  const y1 = Math.max(b.y0, b.y1);
  if (body.shape === 'circle') {
    const r = Math.max(0.01, Math.min(x1 - x0, y1 - y0) / 2);
    return { ...body, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, r };
  }
  if (body.shape === 'polygon') {
    const old = bodyBounds(body);
    const sx = (x1 - x0) / Math.max(1e-9, old.x1 - old.x0);
    const sy = (y1 - y0) / Math.max(1e-9, old.y1 - old.y0);
    return { ...body, points: body.points.map(([x, y]) => [x0 + (x - old.x0) * sx, y0 + (y - old.y0) * sy]) };
  }
  return { ...body, x: x0, y: y0, w: Math.max(0.01, x1 - x0), h: Math.max(0.01, y1 - y0) };
}

/** Snap a coordinate to the grid step (0 = off). */
export function snap(value, step) {
  return step > 0 ? Math.round(value / step) * step : value;
}

/** Cell size in mm. */
export function cellSize(domain) {
  return { dx: domain.width / domain.nx, dy: domain.height / domain.ny, dz: domain.dim === 3 ? domain.depth / domain.nz : domain.depth };
}

export function cellCount(domain) {
  return domain.nx * domain.ny * (domain.dim === 3 ? domain.nz : 1);
}

/**
 * Material id of the cell whose centre is at (x, y) (and z in 3D): the last body that
 * covers it, else the background (null = void). Mirrors the engine's rasteriser.
 */
export function materialAt(model, x, y, z = null) {
  for (let i = model.bodies.length - 1; i >= 0; i--) {
    const body = model.bodies[i];
    if (body.hidden) continue;
    if (model.domain.dim === 3 && z != null && (z < body.z0 || z > body.z1)) continue;
    if (bodyContains(body, x, y)) return body.material;
  }
  return model.domain.background;
}

/** The labels of the selectable targets a boundary condition can be applied to. */
export function boundaryTargets(model) {
  const edges = model.domain.dim === 3 ? EDGE_TARGETS_3D : EDGE_TARGETS_2D;
  return [...edges, 'exterior', ...model.bodies.map((b) => `body:${b.id}`)];
}

/** Power of a body at time t (W): Joule heating, a power profile, or the constant power. */
export function bodyPowerAt(body, t) {
  if (body.current && body.resistance) {
    const current = interpolate(body.current, t);
    return current * current * body.resistance;
  }
  if (body.powerProfile) return interpolate(body.powerProfile, t);
  return body.power;
}

/** Piecewise-linear interpolation in [[t, value], …], clamped at the ends. */
export function interpolate(table, t) {
  if (!table?.length) return 0;
  if (t <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (t <= table[i][0]) {
      const [t0, v0] = table[i - 1];
      const [t1, v1] = table[i];
      return t1 === t0 ? v1 : v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
  }
  return table[table.length - 1][1];
}

/** Total heat input of the model at time t (W). */
export function totalPower(model, t = 0) {
  return model.bodies.filter((b) => !b.hidden).reduce((sum, body) => sum + bodyPowerAt(body, t), 0);
}

/**
 * Problems the user should fix before solving (the engine validates again). Each item:
 * { level: 'error' | 'warning', key, args } — the UI translates `key`.
 */
export function checkModel(model) {
  const issues = [];
  const ids = new Set(model.materials.map((m) => m.id));
  const { domain, study } = model;
  const cells = cellCount(domain);
  if (cells > 4_000_000) issues.push({ level: 'error', key: 'issueTooManyCells', args: { cells } });
  else if (cells > 600_000) issues.push({ level: 'warning', key: 'issueManyCells', args: { cells } });
  if (domain.background && !ids.has(domain.background)) issues.push({ level: 'error', key: 'issueBackground', args: { id: domain.background } });
  for (const body of model.bodies) {
    if (!body.material || !ids.has(body.material)) issues.push({ level: 'error', key: 'issueBodyMaterial', args: { name: body.name || body.id } });
    const b = bodyBounds(body);
    if (b.x1 < 0 || b.y1 < 0 || b.x0 > domain.width || b.y0 > domain.height) issues.push({ level: 'warning', key: 'issueOutside', args: { name: body.name || body.id } });
    const { dx, dy } = cellSize(domain);
    if ((b.x1 - b.x0) < dx || (b.y1 - b.y0) < dy) issues.push({ level: 'warning', key: 'issueThin', args: { name: body.name || body.id } });
    if (body.shape === 'polygon' && body.points.length < 3) issues.push({ level: 'error', key: 'issuePolygon', args: { name: body.name || body.id } });
  }
  const thermal = model.boundaries.filter((bc) => ['temperature', 'convection', 'radiation', 'open', 'outlet', 'inlet'].includes(bc.type));
  if (!thermal.length) issues.push({ level: study.type === 'steady' ? 'error' : 'warning', key: 'issueNoSink' });
  if (study.flow) {
    if (domain.dim === 3) issues.push({ level: 'error', key: 'issueFlow3d' });
    const fluids = model.materials.filter((m) => m.kind === 'fluid' || m.kind === 'porous').map((m) => m.id);
    const hasFluid = fluids.includes(domain.background) || model.bodies.some((b) => fluids.includes(b.material));
    if (!hasFluid) issues.push({ level: 'error', key: 'issueNoFluid' });
    if (!study.natural && !model.boundaries.some((bc) => bc.type === 'inlet')) issues.push({ level: 'warning', key: 'issueNoInlet' });
  }
  for (const m of model.materials) {
    if (!(m.k > 0) || !(m.rho > 0) || !(m.cp > 0)) issues.push({ level: 'error', key: 'issueMaterialProps', args: { name: m.name || m.id } });
    if (m.kind === 'fluid' && !(m.mu > 0) && study.flow) issues.push({ level: 'error', key: 'issueViscosity', args: { name: m.name || m.id } });
    if (m.kind === 'pcm' && !(m.latent > 0)) issues.push({ level: 'warning', key: 'issueLatent', args: { name: m.name || m.id } });
  }
  if (study.type === 'transient') {
    if (!(study.dt > 0) || !(study.endTime > 0)) issues.push({ level: 'error', key: 'issueTime' });
    else if (study.endTime / study.dt > 200_000) issues.push({ level: 'warning', key: 'issueSteps', args: { steps: Math.round(study.endTime / study.dt) } });
  }
  if (study.electric) {
    if (!model.materials.some((m) => m.sigma > 0)) issues.push({ level: 'error', key: 'issueNoConductor' });
    if (!model.boundaries.some((bc) => bc.type === 'voltage' || bc.type === 'currentIn')) issues.push({ level: 'error', key: 'issueNoVoltage' });
  }
  if ((study.stress || study.modal?.enabled) && study.modal?.enabled && !model.boundaries.some((bc) => ['fixed', 'rollerX', 'rollerY'].includes(bc.type))) issues.push({ level: 'warning', key: 'issueModalFree' });
  if (study.turbulence === 'kOmegaSST' && !study.flow) issues.push({ level: 'warning', key: 'issueTurbNoFlow' });
  for (const bc of model.boundaries) {
    if (bc.target.startsWith('body:') && !model.bodies.some((b) => `body:${b.id}` === bc.target)) issues.push({ level: 'error', key: 'issueBcTarget', args: { name: bc.name || bc.id } });
    const name = bc.name || bc.id;
    if (bc.type === 'convection' && bc.hMode && bc.hMode !== 'fixed' && !(bc.length > 0)) issues.push({ level: 'error', key: 'issueHModeLength', args: { name } });
    if (bc.type === 'thinLayer') {
      if (!(bc.thickness > 0) || !(bc.k > 0)) issues.push({ level: 'error', key: 'issueThinLayerProps', args: { name } });
      if (bc.target === 'exterior') issues.push({ level: 'error', key: 'issueThinLayerTarget', args: { name } });
    }
    if (study.type !== 'transient' && ['Tt', 'qt', 'ht', 'Tinft', 'Tambt'].some((key) => bc[key]?.length)) issues.push({ level: 'warning', key: 'issueTimeTableSteady', args: { name } });
  }
  for (const m of model.materials) {
    if (Array.isArray(m.cpT) && m.cpT.some((p) => !(p[1] > 0))) issues.push({ level: 'error', key: 'issueCpT', args: { name: m.name || m.id } });
  }
  if (study.s2s) {
    // Radiating faces border transparent cells: void (background null) or, with s2sMedium "fluids", fluid cells.
    const fluidIds = model.materials.filter((m) => m.kind === 'fluid').map((m) => m.id);
    const hasVoid = domain.background === null;
    const hasFluid = fluidIds.includes(domain.background) || model.bodies.some((b) => fluidIds.includes(b.material));
    if (!hasVoid && !(study.s2sMedium === 'fluids' && hasFluid)) issues.push({ level: 'warning', key: 'issueS2sNoMedium' });
  }
  return issues;
}

/** The model with only what the engine reads (drops UI-only fields). */
export function engineModel(model) {
  const { view, ...rest } = model;
  return { ...rest, bodies: model.bodies.filter((b) => !b.hidden) };
}

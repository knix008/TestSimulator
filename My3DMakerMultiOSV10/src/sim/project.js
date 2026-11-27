// The project: bodies (parametric geometry), engineering data (materials), analysis systems with
// their settings, mesh controls, contacts and boundary conditions, the schematic links between
// systems, and the design-exploration study. Saved as JSON (.my3d). Values are SI except geometry
// (model units, mm) and picked faces (model units).
import { BCS, SYSTEMS, defaultSettings, defaultBc } from './catalog.js';
import { MATERIALS, solverMaterial } from './materials.js';
import { bodyNode, defaultParams } from './shapes.js';

export const FORMAT = 'my3dmaker';
export const FORMAT_VERSION = 1;
export const UNIT = 0.001; // metres per model unit

let counter = 0;
export const newId = (prefix = 'id') => `${prefix}${Date.now().toString(36).slice(-4)}${(++counter).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function createProject(name = '') {
  return {
    format: FORMAT, version: FORMAT_VERSION, name, units: 'mm',
    bodies: [], materials: [], systems: [], links: [],
    parameters: [], outputs: [], study: { method: 'ccd', samples: 12, points: [], rows: [], fit: null },
    active: null, created: new Date().toISOString(),
  };
}

export function ensureMaterial(project, id) {
  if (!project.materials.some((m) => m.id === id)) {
    const lib = MATERIALS.find((m) => m.id === id);
    if (lib) project.materials.push(structuredClone(lib));
  }
  return project.materials.find((m) => m.id === id) ?? null;
}

export function addBody(project, template, { name = '', params = {}, material = 'steel', position = [0, 0, 0], rotation = [0, 0, 0], stl = null } = {}) {
  ensureMaterial(project, material);
  const body = { id: newId('b'), name: name || `${template} ${project.bodies.length + 1}`, template, params: { ...defaultParams(template), ...params }, material, position, rotation, suppressed: false, meshSize: 0 };
  if (stl) body.stl = stl;
  project.bodies.push(body);
  return body;
}

export function addSystem(project, type, { name = '', from = null } = {}) {
  const def = SYSTEMS[type];
  if (!def) throw new Error(`unknown system ${type}`);
  const sys = {
    id: newId('s'), type, name: name || '', settings: defaultSettings(type), bcs: [], contacts: [],
    mesh: { size: 0, order: def.linearOnly ? 1 : 2 }, enclosure: { enabled: Boolean(def.enclosure && type !== 'fluid'), padding: 0 },
    probes: [], status: 'setup', position: null,
  };
  if (from) {
    const src = project.systems.find((s) => s.id === from);
    if (src) {
      // Loads and supports that the new system understands come along; the link shows where from.
      sys.bcs = structuredClone(src.bcs.filter((b) => def.bcs.includes(b.type)));
      sys.contacts = structuredClone(src.contacts ?? []);
      sys.mesh = { ...src.mesh, order: def.linearOnly ? 1 : src.mesh.order };
      project.links.push({ from: src.id, to: sys.id });
    }
  }
  project.systems.push(sys);
  project.active = sys.id;
  return sys;
}

export function addBc(sys, type, extra = {}) {
  const bc = { id: newId('c'), ...defaultBc(type), faces: [], bodies: [], suppressed: false, ...extra };
  sys.bcs.push(bc);
  return bc;
}

/** The solver's job for a system (or just the mesh with analysis 'mesh'). */
export function buildJob(project, sys, { analysis = null, preview = false } = {}) {
  const def = SYSTEMS[sys.type];
  const settings = { ...structuredClone(sys.settings ?? {}), ...(def.fixed ?? {}) };
  // Lengths in the settings go to the solver in model units.
  for (const f of def.settings) {
    if (f.kind === 'length' && typeof settings[f.key] === 'number') settings[f.key] /= UNIT;
    if (f.kind === 'area' && typeof settings[f.key] === 'number') settings[f.key] /= UNIT * UNIT;
  }
  if (sys.type === 'fluid') {
    settings.boundaries = Object.fromEntries(['xmin', 'xmax', 'ymin', 'ymax', 'zmin', 'zmax'].map((side, i) => {
      const kind = settings[side] ?? (i === 0 ? 'inlet' : i === 1 ? 'outlet' : 'slip');
      const v = settings.inletVelocity ?? [5, 0, 0];
      return [side, { type: kind, velocity: kind === 'inlet' ? v : [0, 0, 0], temperature: settings.inletTemperature ?? 22 }];
    }));
    if (!(settings.cellSize > 0)) delete settings.cellSize;
    if (!(settings.referenceArea > 0)) delete settings.referenceArea;
  }
  if (sys.type === 'topology' && !settings.body) delete settings.body;
  if (sys.type === 'explicit' && !(settings.targetTimeStep > 0)) delete settings.targetTimeStep;
  const bodies = project.bodies.filter((b) => !b.suppressed);
  const used = new Set(bodies.map((b) => b.material));
  if (sys.type === 'fluid') used.add(settings.fluid ?? 'air');
  const materials = {};
  for (const id of used) { const m = project.materials.find((x) => x.id === id) ?? MATERIALS.find((x) => x.id === id); if (m) materials[id] = solverMaterial(m); }
  const bcs = (sys.bcs ?? []).filter((b) => !b.suppressed && BCS[b.type]).map((b) => {
    const out = { ...structuredClone(b), type: BCS[b.type].solverType ?? b.type };
    if (b.type === 'wall' && Array.isArray(out.point)) out.point = out.point.map((v) => v / UNIT);
    if (b.type === 'displacement') for (const k of ['x', 'y', 'z']) if (out[k] === null || out[k] === undefined || out[k] === '') delete out[k];
    return out;
  });
  const size = sys.mesh?.size > 0 ? sys.mesh.size / UNIT : 0;
  const pad = sys.enclosure?.padding > 0 ? sys.enclosure.padding / UNIT : 0;
  return {
    analysis: analysis ?? def.analysis,
    unit: UNIT,
    bodies: bodies.map((b) => ({ id: b.id, name: b.name, material: b.material, shape: bodyNode(b), meshSize: b.meshSize > 0 ? b.meshSize / UNIT : null })),
    materials,
    mesh: { size: preview ? previewSize(project) : size, order: preview ? 1 : sys.mesh?.order ?? 2, maxNodes: sys.mesh?.maxNodes ?? 600000 },
    enclosure: { enabled: Boolean(sys.enclosure?.enabled) && !preview, padding: pad ? [pad, pad, pad, pad, pad, pad] : [0, 0, 0, 0, 0, 0] },
    bcs,
    contacts: (sys.contacts ?? []).filter((c) => !c.suppressed),
    settings,
    probes: (sys.probes ?? []).map((p) => p.point),
  };
}

/** A quick, coarse mesh for showing the geometry and picking faces. */
export function previewSize(project) {
  let lo = [Infinity, Infinity, Infinity];
  let hi = [-Infinity, -Infinity, -Infinity];
  for (const b of project.bodies) {
    if (b.suppressed) continue;
    const box = boxOfBody(b);
    for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], box[0][k]); hi[k] = Math.max(hi[k], box[1][k]); }
  }
  const diag = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  return Number.isFinite(diag) && diag > 0 ? diag / 40 : 5;
}

import { nodeBox } from './shapes.js';
export const boxOfBody = (b) => nodeBox(bodyNode(b));

/** Serializable copy without results. */
export function packProject(project) {
  const p = structuredClone({ ...project, systems: project.systems.map((s) => ({ ...s, result: undefined, error: undefined })) });
  return JSON.stringify(p, null, 1);
}

export function unpackProject(text) {
  const p = typeof text === 'string' ? JSON.parse(text) : text;
  if (p?.format !== FORMAT) throw new Error('file.notProject');
  const base = createProject(p.name ?? '');
  const out = { ...base, ...p };
  for (const s of out.systems) { s.settings = { ...defaultSettings(s.type), ...(s.settings ?? {}) }; s.status = s.status === 'solved' ? 'outdated' : s.status ?? 'setup'; s.bcs ??= []; s.contacts ??= []; s.mesh ??= { size: 0, order: 2 }; s.enclosure ??= { enabled: false, padding: 0 }; s.probes ??= []; }
  for (const id of new Set(out.bodies.map((b) => b.material))) ensureMaterial(out, id);
  return out;
}

// ───────────────────────── design exploration: parameters and outputs

/** Reads / writes a value at a dotted path inside the project ("bodies.b1.params.width"). Ids select array items. */
export function pathGet(project, path) {
  let cur = project;
  for (const part of path.split('.')) {
    if (cur === undefined || cur === null) return undefined;
    cur = Array.isArray(cur) ? cur.find((x) => x.id === part) ?? cur[Number(part)] : cur[part];
  }
  return cur;
}

export function pathSet(project, path, value) {
  const parts = path.split('.');
  let cur = project;
  for (const part of parts.slice(0, -1)) {
    if (cur === undefined || cur === null) return;
    cur = Array.isArray(cur) ? cur.find((x) => x.id === part) ?? cur[Number(part)] : cur[part];
  }
  const last = parts.at(-1);
  if (cur && last !== undefined) { if (Array.isArray(cur) && !/^\d+$/.test(last)) return; cur[last] = value; }
}

/** A system result reduced to the output quantities of its type. */
export function outputsOf(sys, result) {
  if (!result) return {};
  const r = result.result ?? {};
  const out = {};
  const put = (k, v) => { if (Number.isFinite(v)) out[k] = v; };
  put('maxDisplacement', r.max?.displacement);
  put('maxVonMises', r.max?.vonMises);
  put('minSafety', r.max?.safety);
  put('maxPlasticStrain', r.max?.plasticStrain);
  put('mass', result.mass);
  put('maxTemperature', r.max?.temperature ?? result.thermal?.max?.temperature);
  put('minTemperature', r.min?.temperature);
  if (result.modes?.length) { put('frequency1', result.modes[0]?.frequency); put('frequency2', result.modes[1]?.frequency); put('loadFactor1', result.modes[0]?.factor); }
  if (result.fatigue) put('minLife', result.fatigue.minLife);
  if (result.harmonic) put('peakFrequency', result.harmonic.frequency);
  if (result.topology) { put('compliance', result.topology.history?.at(-1)?.compliance); put('keptFraction', result.topology.keptFraction); }
  if (result.fluid) {
    const f = result.fluid.forces?.[0];
    if (f) { put('drag', f.drag); put('lift', f.lift); put('cd', f.cd); }
    put('maxSpeed', result.fluid.max?.speed);
    if (result.fluid.thermal) put('maxFluidTemperature', result.fluid.max?.temperature);
    put('pressureDrop', result.fluid.pressureDrop);
  }
  if (result.electric) { put('capacitance', result.electric.capacitance); put('energy', result.electric.energy); put('resistance', result.electric.resistance); put('power', result.electric.power); }
  put('maxField', r.max?.field);
  put('maxCurrentDensity', r.max?.currentDensity);
  if (result.magnetic) { put('inductance', result.magnetic.inductance); put('energy', result.magnetic.energy); const f = result.magnetic.forces?.[0]?.force; if (f) put('force', Math.hypot(...f)); }
  put('maxFlux', r.max?.flux);
  put('maxSpl', r.max?.spl);
  return out;
}

/** Output quantity → unit kind (for display). */
export const OUTPUT_KINDS = {
  maxDisplacement: 'displacement', maxVonMises: 'stress', minSafety: 'ratio', maxPlasticStrain: 'strain', mass: 'mass', maxTemperature: 'temperature', minTemperature: 'temperature',
  frequency1: 'frequency', frequency2: 'frequency', loadFactor1: 'ratio', minLife: 'life', peakFrequency: 'frequency', compliance: 'energy', keptFraction: 'ratio',
  drag: 'force', lift: 'force', cd: 'ratio', maxSpeed: 'velocity', maxFluidTemperature: 'temperature', pressureDrop: 'pressure',
  capacitance: 'capacitance', energy: 'energy', resistance: 'resistance', power: 'power', maxField: 'efield', maxCurrentDensity: 'currentDensity',
  inductance: 'inductance', force: 'force', maxFlux: 'flux', maxSpl: 'spl',
};

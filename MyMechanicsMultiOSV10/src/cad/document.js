// A MyMechanics project (.mymech, JSON): parts (feature trees), assemblies (components and mates)
// and drawings (sheets with views), a part / assembly / drawing kept in one file.
// One of them is open in the main window at a time (the document tabs switch between them).
// Projects are Z up (`up: 'z'`); one made before that (Y up) is turned when it is read (zup.js).
import { DEFAULT_MATERIAL } from './materials.js';
import { createDrawing } from './drawing.js';
import { quatIdentity } from './assembly.js';
import { isYUp } from './frame.js';
import { migrateProject } from './zup.js';

export { migrateProject };

export const FORMAT = 'mymechanics';
export const FORMAT_VERSION = 1;
export const DOC_KINDS = ['part', 'assembly', 'drawing'];

let counter = 0;
export const newId = (prefix = 'id') => `${prefix}-${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function createPart(name = 'Part1', extra = {}) {
  return { id: newId('part'), name, material: DEFAULT_MATERIAL, color: null, description: '', partNo: '', features: [], rollback: null, ...extra };
}

export function createAssembly(name = 'Assem1', extra = {}) {
  return { id: newId('asm'), name, components: [], mates: [], ...extra };
}

export function createProject({ name = 'Project', kind = 'part', units = 'mm' } = {}) {
  const project = { format: FORMAT, version: FORMAT_VERSION, name, units, parts: [], assemblies: [], drawings: [], active: null, created: new Date().toISOString() };
  // A sample builder (written Y up, frame.js withYUp) gets an unmarked project, turned to Z up when it is done.
  if (!isYUp()) project.up = 'z';
  if (kind === 'part') { const p = createPart(name); project.parts.push(p); project.active = { kind: 'part', id: p.id }; }
  else if (kind === 'assembly') { const a = createAssembly(name); project.assemblies.push(a); project.active = { kind: 'assembly', id: a.id }; }
  return project;
}

export function addDrawing(project, source, name) {
  const d = createDrawing({ id: newId('drw'), name, source });
  project.drawings.push(d);
  return d;
}

/** Every document of the project in tab order: parts, assemblies, drawings. */
export function documentsOf(project) {
  return [
    ...project.parts.map((d) => ({ kind: 'part', doc: d })),
    ...project.assemblies.map((d) => ({ kind: 'assembly', doc: d })),
    ...project.drawings.map((d) => ({ kind: 'drawing', doc: d })),
  ];
}

export function findDocument(project, ref) {
  if (!project || !ref) return null;
  const list = ref.kind === 'part' ? project.parts : ref.kind === 'assembly' ? project.assemblies : ref.kind === 'drawing' ? project.drawings : [];
  return list.find((d) => d.id === ref.id) ?? null;
}

/** Fills gaps of a project read from a file (older or hand-written files); a Y-up one is turned to Z up. */
export function normalizeProject(raw) {
  if (!raw || typeof raw !== 'object') throw Object.assign(new Error('not a project'), { code: 'bad-file' });
  if (raw.format && raw.format !== FORMAT) throw Object.assign(new Error('not a MyMechanics project'), { code: 'bad-file' });
  const p = { format: FORMAT, version: FORMAT_VERSION, name: String(raw.name ?? 'Project'), units: raw.units ?? 'mm', parts: [], assemblies: [], drawings: [], active: raw.active ?? null };
  for (const part of raw.parts ?? []) p.parts.push({ ...createPart(part.name), ...part, features: Array.isArray(part.features) ? part.features : [] });
  for (const a of raw.assemblies ?? []) {
    p.assemblies.push({
      ...createAssembly(a.name), ...a,
      components: (a.components ?? []).map((c) => ({ position: [0, 0, 0], rotation: quatIdentity(), fixed: false, ...c })),
      mates: Array.isArray(a.mates) ? a.mates : [],
    });
  }
  for (const d of raw.drawings ?? []) p.drawings.push({ ...createDrawing({ id: d.id ?? newId('drw'), name: d.name, source: d.source }), ...d });
  if (!findDocument(p, p.active)) {
    const first = documentsOf(p)[0];
    p.active = first ? { kind: first.kind, id: first.doc.id } : null;
  }
  if (raw.camera) p.camera = raw.camera;
  // Version history, check-out settings and sketch blocks (cad/versions.js, cad/asm-extra.js).
  for (const k of ['versions', 'sketchBlocks']) if (Array.isArray(raw[k])) p[k] = raw[k];
  if (raw.vault && typeof raw.vault === 'object') p.vault = raw.vault;
  // The vault file this project is (cad/vault.js: vaultLink { vaultId, fileId, name }).
  if (raw.vaultLink && typeof raw.vaultLink === 'object') p.vaultLink = raw.vaultLink;
  if (raw.lights) p.lights = raw.lights;
  if (raw.thumbnail) p.thumbnail = raw.thumbnail;
  if (raw.created) p.created = raw.created; // kept, so saving again does not lose when the project was made
  if (raw.up) p.up = raw.up;
  return migrateProject(p);
}

/** The project as file text. */
export function packProject(project, { thumbnail = null } = {}) {
  const out = { ...project, saved: new Date().toISOString() };
  if (thumbnail) out.thumbnail = thumbnail;
  return JSON.stringify(out, null, 1);
}

export function unpackProject(text) {
  const source = typeof text === 'string' ? text : new TextDecoder().decode(text);
  let raw;
  try { raw = JSON.parse(source); } catch { throw Object.assign(new Error('not JSON'), { code: 'bad-file' }); }
  return normalizeProject(raw);
}

/** Undo / redo by snapshots of the whole project (JSON): small enough for feature trees. */
export class History {
  constructor(project, limit = 150) {
    this.limit = limit;
    this.states = [{ json: JSON.stringify(project), label: '' }];
    this.index = 0;
  }
  commit(project, label) {
    const json = JSON.stringify(project);
    if (json === this.states[this.index].json) return false;
    this.states = this.states.slice(0, this.index + 1);
    this.states.push({ json, label });
    if (this.states.length > this.limit) this.states.shift();
    this.index = this.states.length - 1;
    return true;
  }
  get canUndo() { return this.index > 0; }
  get canRedo() { return this.index < this.states.length - 1; }
  get undoLabel() { return this.states[this.index]?.label ?? ''; }
  get redoLabel() { return this.states[this.index + 1]?.label ?? ''; }
  /** Returns { project, label } to show, or null. */
  undo() {
    if (!this.canUndo) return null;
    const label = this.states[this.index].label;
    this.index -= 1;
    return { project: JSON.parse(this.states[this.index].json), label };
  }
  redo() {
    if (!this.canRedo) return null;
    this.index += 1;
    return { project: JSON.parse(this.states[this.index].json), label: this.states[this.index].label };
  }
}

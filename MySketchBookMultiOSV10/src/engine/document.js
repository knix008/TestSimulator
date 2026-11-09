// The project document (CONTRACT.md › Documents): creation, repair of loaded
// files, ids, lookups and undo/redo. Pure (no DOM, no three) so Node tests use it.
//
// Undo keeps snapshots per top-level collection: a change names the collections
// it touches and only those are serialised again; the others share the string
// of the previous step. A furniture move therefore costs the `objects` array,
// never the (possibly large) modelled geometry in `models`.

export const FORMAT = 'mysketchbook';
export const FORMAT_VERSION = 1;
export const COLLECTIONS = ['levels', 'walls', 'openings', 'rooms', 'objects', 'models', 'tags', 'scenes', 'guides', 'dimensions', 'texts', 'sections', 'materials', 'lights'];
const SETTINGS_KEYS = ['name', 'units', 'sun', 'style', 'camera', 'activeLevel', 'activeScene', 'assets', 'notes', 'author', 'created', 'modified'];

let counter = 0;
/** Short unique ids: time + counter + random, readable in files. */
export function newId(prefix = 'e') {
  counter = (counter + 1) % 1679616;
  return `${prefix}${Date.now().toString(36).slice(-5)}${counter.toString(36).padStart(4, '0')}${Math.floor(Math.random() * 1296).toString(36).padStart(2, '0')}`;
}

export const DEFAULT_SUN = { date: '06-21', time: '14:00', latitude: 37.57, longitude: 126.98, utcOffset: 9, north: 0 };
export const DEFAULT_STYLE = { mode: 'textured', edges: true, profiles: false, background: 'sky', environment: 'room', exposure: 1, lightsOn: false };

/** A new, empty project with one level, the default tag and a 3/4 camera. */
export function createProject({ name = '', units = 'mm', wallHeight = 2.4 } = {}) {
  const level = { id: newId('lv'), name: '1F', elevation: 0, height: wallHeight };
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    name,
    units,
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    levels: [level],
    activeLevel: level.id,
    walls: [],
    openings: [],
    rooms: [],
    objects: [],
    models: [],
    tags: [{ id: 'untagged', name: '', visible: true, color: '#9aa4b2' }],
    scenes: [],
    activeScene: null,
    guides: [],
    dimensions: [],
    texts: [],
    sections: [],
    materials: [],
    lights: [],
    sun: { ...DEFAULT_SUN },
    style: { ...DEFAULT_STYLE },
    camera: { position: [8, 7, 9], target: [0, 0.8, 0], fov: 50, ortho: false },
    assets: {},
  };
}

const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);
const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const vec = (v, n, fallback) => (Array.isArray(v) && v.length === n && v.every((x) => Number.isFinite(Number(x))) ? v.map(Number) : fallback);

/** Repairs a loaded project: fills missing parts, drops broken entries, keeps unknown fields. */
export function normalizeProject(raw) {
  if (!isObject(raw)) throw Object.assign(new Error('not a MySketchBook project'), { code: 'bad-file' });
  if (raw.format && raw.format !== FORMAT) throw Object.assign(new Error(`unknown format ${raw.format}`), { code: 'bad-file' });
  const base = createProject({ name: raw.name ?? '' });
  const p = { ...base, ...raw, format: FORMAT, version: FORMAT_VERSION };
  for (const key of COLLECTIONS) p[key] = Array.isArray(raw[key]) ? raw[key].filter(isObject) : base[key];
  if (!p.levels.length) p.levels = base.levels;
  for (const level of p.levels) { level.id ??= newId('lv'); level.name ??= ''; level.elevation = num(level.elevation); level.height = num(level.height, 2.4); }
  if (!p.levels.some((l) => l.id === p.activeLevel)) p.activeLevel = p.levels[0].id;
  const levelIds = new Set(p.levels.map((l) => l.id));
  const fixLevel = (e) => { if (!levelIds.has(e.level)) e.level = p.levels[0].id; };
  p.walls = p.walls.filter((w) => vec(w.a, 2) && vec(w.b, 2)).map((w) => ({ id: w.id ?? newId('w'), thickness: 0.15, height: null, material: {}, ...w, a: vec(w.a, 2), b: vec(w.b, 2) }));
  p.walls.forEach(fixLevel);
  const wallIds = new Set(p.walls.map((w) => w.id));
  p.openings = p.openings.filter((o) => wallIds.has(o.wall)).map((o) => ({ id: o.id ?? newId('op'), offset: 0.5, width: 0.9, height: 2.1, sill: 0, flip: false, params: {}, ...o }));
  p.rooms = p.rooms.filter((r) => Array.isArray(r.points) && r.points.length >= 3).map((r) => ({ id: r.id ?? newId('rm'), name: '', floor: 'floor-oak', ceiling: 'wall-paint-white', showCeiling: false, ...r }));
  p.rooms.forEach(fixLevel);
  p.objects = p.objects.filter((o) => o.item).map((o) => ({ id: o.id ?? newId('ob'), params: {}, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], materials: {}, tag: 'untagged', name: '', ...o, position: vec(o.position, 3, [0, 0, 0]), rotation: vec(o.rotation, 3, [0, 0, 0]), scale: vec(o.scale, 3, [1, 1, 1]) }));
  p.objects.forEach(fixLevel);
  p.models = p.models.filter((m) => isObject(m.mesh)).map((m) => ({ id: m.id ?? newId('md'), name: '', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], tag: 'untagged', ...m }));
  p.models.forEach(fixLevel);
  if (!p.tags.some((t) => t.id === 'untagged')) p.tags.unshift(base.tags[0]);
  p.sun = { ...DEFAULT_SUN, ...(isObject(raw.sun) ? raw.sun : {}) };
  p.style = { ...DEFAULT_STYLE, ...(isObject(raw.style) ? raw.style : {}) };
  p.camera = isObject(raw.camera) && vec(raw.camera.position, 3) && vec(raw.camera.target, 3) ? raw.camera : base.camera;
  p.assets = isObject(raw.assets) ? raw.assets : {};
  return p;
}

/** Every entity with an id, for lookups: id → { kind, entity }. */
export function buildIndex(project) {
  const index = new Map();
  for (const kind of COLLECTIONS) for (const entity of project[kind] ?? []) if (entity?.id) index.set(entity.id, { kind, entity });
  return index;
}

export const levelOf = (project, id) => project.levels.find((l) => l.id === id) ?? project.levels[0];
export const activeLevel = (project) => levelOf(project, project.activeLevel);
export const wallHeight = (project, wall) => wall.height ?? levelOf(project, wall.level).height;

/** Removes entities by id from every collection; openings go with their walls. Returns removed count. */
export function removeEntities(project, ids) {
  const set = new Set(ids);
  for (const wall of project.walls) if (set.has(wall.id)) for (const o of project.openings) if (o.wall === wall.id) set.add(o.id);
  let removed = 0;
  for (const kind of COLLECTIONS) {
    const before = project[kind].length;
    project[kind] = project[kind].filter((e) => !set.has(e.id));
    removed += before - project[kind].length;
  }
  return removed;
}

/** The collections a set of ids lives in (for History.change's `touch`). */
export function collectionsOf(project, ids) {
  const index = buildIndex(project);
  const kinds = new Set();
  for (const id of ids) { const hit = index.get(id); if (hit) kinds.add(hit.kind); }
  if (kinds.has('walls')) kinds.add('openings');
  return [...kinds];
}

// ───────────────────────── undo / redo

const serialize = (project, key) => JSON.stringify(project[key] ?? null);
const settingsOf = (project) => JSON.stringify(Object.fromEntries(SETTINGS_KEYS.map((k) => [k, project[k]])));

export class History {
  constructor(project, { limit = 100 } = {}) {
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
    this.current = this.snapshot(project, null);
  }

  /** A snapshot that reuses the previous step's strings for untouched collections. */
  snapshot(project, touched, previous = this.current) {
    const parts = {};
    for (const key of COLLECTIONS) parts[key] = !previous || !touched || touched.includes(key) ? serialize(project, key) : previous.parts[key];
    return { parts, settings: settingsOf(project) };
  }

  /** Records the state after a change. `touched` = collections changed (null: all). */
  commit(project, label, touched = null) {
    this.undoStack.push({ label, state: this.current });
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
    this.current = this.snapshot(project, touched);
  }

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }

  restore(project, state) {
    for (const key of COLLECTIONS) project[key] = JSON.parse(state.parts[key]) ?? [];
    Object.assign(project, JSON.parse(state.settings));
    this.current = state;
  }

  /** Steps back; returns the label undone (null when nothing to undo). */
  undo(project) {
    const step = this.undoStack.pop();
    if (!step) return null;
    this.redoStack.push({ label: step.label, state: this.current });
    this.restore(project, step.state);
    return step.label;
  }

  redo(project) {
    const step = this.redoStack.pop();
    if (!step) return null;
    this.undoStack.push({ label: step.label, state: this.current });
    this.restore(project, step.state);
    return step.label;
  }
}

// ───────────────────────── units

const UNIT_FACTOR = { mm: 1000, cm: 100, m: 1, in: 39.37007874, ft: 3.280839895 };
const UNIT_DIGITS = { mm: 0, cm: 1, m: 3, in: 2, ft: 3 };
export const toUnits = (metres, units) => metres * (UNIT_FACTOR[units] ?? 1000);
export const fromUnits = (value, units) => value / (UNIT_FACTOR[units] ?? 1000);

/** "2,400 mm", "2.4 m", "7' 10 1/2\"" … */
export function formatLength(metres, units = 'mm', { suffix = true } = {}) {
  const v = toUnits(metres, units);
  if (units === 'ft') {
    const inches = metres * UNIT_FACTOR.in;
    const sign = inches < 0 ? '-' : '';
    const total = Math.round(Math.abs(inches) * 8) / 8;
    const feet = Math.floor(total / 12);
    const rest = total - feet * 12;
    return `${sign}${feet}' ${Number(rest.toFixed(3))}"`;
  }
  const digits = UNIT_DIGITS[units] ?? 0;
  const text = Number(v.toFixed(digits)).toLocaleString('en-US', { maximumFractionDigits: digits });
  return suffix ? `${text} ${units}` : text;
}

/**
 * Parses what the user types in the Measurements box: "2400", "2.4m", "240cm", "8'", "7'6\"", "1200,800"
 * (two values for rectangles). Plain numbers are in the document's units. Returns metres (array for lists) or null.
 */
export function parseLength(text, units = 'mm') {
  const parts = String(text ?? '').split(/[,;xX×]/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  const values = parts.map((part) => {
    const ftIn = part.match(/^(-?\d+(?:\.\d+)?)\s*'\s*(?:(\d+(?:\.\d+)?)\s*"?)?$/);
    if (ftIn) return Number(ftIn[1]) / UNIT_FACTOR.ft + (ftIn[2] ? Number(ftIn[2]) / UNIT_FACTOR.in : 0);
    const m = part.match(/^(-?\d+(?:\.\d+)?|-?\.\d+)\s*(mm|cm|m|in|"|ft)?$/i);
    if (!m) return NaN;
    const unit = (m[2] ?? units).toLowerCase().replace('"', 'in');
    return Number(m[1]) / (UNIT_FACTOR[unit] ?? 1000);
  });
  if (values.some((v) => !Number.isFinite(v))) return null;
  return values.length === 1 ? values[0] : values;
}

/** Area text in m² (or ft² for imperial units). */
export function formatArea(m2, units = 'mm') {
  if (units === 'ft' || units === 'in') return `${(m2 * 10.7639).toFixed(1)} ft²`;
  return `${m2.toFixed(2)} m²`;
}

/** Polygon area (shoelace) of [[x, z], …] in m². */
export function polygonArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, z1] = points[i];
    const [x2, z2] = points[(i + 1) % points.length];
    sum += x1 * z2 - x2 * z1;
  }
  return Math.abs(sum) / 2;
}

export function polygonCentroid(points) {
  let a = 0; let cx = 0; let cz = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, z1] = points[i];
    const [x2, z2] = points[(i + 1) % points.length];
    const f = x1 * z2 - x2 * z1;
    a += f; cx += (x1 + x2) * f; cz += (z1 + z2) * f;
  }
  if (Math.abs(a) < 1e-9) return points.reduce((s, p) => [s[0] + p[0] / points.length, s[1] + p[1] / points.length], [0, 0]);
  return [cx / (3 * a), cz / (3 * a)];
}

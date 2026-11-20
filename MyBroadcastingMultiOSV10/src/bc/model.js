// The scene collection: the inputs (sources), the scenes that place them, the transitions and the audio
// settings of every source. Plain JSON (saved as .mybc, exported / imported, kept per collection name).
// Every function here is pure in spirit: it changes the collection it is given and returns what it made;
// the app records an Undo step (bc/history.js) before calling it. No DOM — tested in node.
//
//   collection = { version, name, sources: { id: Source }, scenes: [Scene], current, preview,
//                  transitions: [Transition], transition, duration, quick: [Quick] }
//   Source     = { id, type, name, settings, filters: [Filter], audio: Audio, hotkeys: {} }
//   Scene      = { id, name, items: [Item] (drawn first → last: the last is on top), override: { transition, duration } | null }
//   Item       = { id, source, visible, locked, transform, blend, scaleFilter, show: TransitionRef|null, hide: TransitionRef|null,
//                  children: [Item] (groups only), collapsed }
//   transform  = { x, y, rot, sx, sy, align, crop: {l,t,r,b}, bounds: { type, w, h, align, crop } }
import { FILTER_TYPES, SOURCE_TYPES, TRANSITION_TYPES, filterDefaults, sourceDefaults, transitionDefaults } from './catalog.js';
import { TRANSITION_IN } from './compat/wire.js';

export const VERSION = 1;
export const TRACKS = 6;

let seq = 0;
/** A short unique id (time + counter + random). */
export function newId(prefix = 'x') {
  seq = (seq + 1) % 46656;
  return `${prefix}${Date.now().toString(36)}${seq.toString(36).padStart(3, '0')}${Math.random().toString(36).slice(2, 5)}`;
}

export const defaultAudio = () => ({ volume: 1, muted: false, monitor: 'off', balance: 0.5, sync: 0, tracks: [true, true, true, true, true, true], mono: false, ptt: { enabled: false, delay: 200 }, ptm: { enabled: false, delay: 200 }, hidden: false });

export function defaultTransform() {
  return { x: 0, y: 0, rot: 0, sx: 1, sy: 1, align: 'top-left', crop: { l: 0, t: 0, r: 0, b: 0 }, bounds: { type: 'none', w: 0, h: 0, align: 'center', crop: false } };
}

export function createCollection(name = 'Untitled') {
  const c = { version: VERSION, name, sources: {}, scenes: [], current: null, preview: null, transitions: [], transition: null, duration: 300, quick: [] };
  const cut = addTransition(c, 'cut_transition');
  const fade = addTransition(c, 'fade_transition');
  c.transition = fade.id;
  c.quick = [{ id: newId('q'), transition: cut.id, duration: 300 }, { id: newId('q'), transition: fade.id, duration: 300 }];
  addScene(c, 'Scene');
  return c;
}

// ───────────────────────── names

/** "Name", "Name 2", "Name 3"… — the first not used by any source or scene. */
export function uniqueName(c, base) {
  const used = new Set([...Object.values(c.sources).map((s) => s.name), ...c.scenes.map((s) => s.name)]);
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) if (!used.has(`${base} ${i}`)) return `${base} ${i}`;
}
export const nameTaken = (c, name, exceptId = null) => Object.values(c.sources).some((s) => s.name === name && s.id !== exceptId) || c.scenes.some((s) => s.name === name && s.id !== exceptId);

// ───────────────────────── scenes

export const sceneById = (c, id) => c.scenes.find((s) => s.id === id) ?? null;
export const currentScene = (c) => sceneById(c, c.current) ?? c.scenes[0] ?? null;

export function addScene(c, name = 'Scene', { after = null } = {}) {
  const scene = { id: newId('sc'), name: uniqueName(c, name), items: [], override: null };
  const i = after ? c.scenes.findIndex((s) => s.id === after) : -1;
  if (i >= 0) c.scenes.splice(i + 1, 0, scene); else c.scenes.push(scene);
  if (!c.current) c.current = scene.id;
  if (!c.preview) c.preview = scene.id;
  return scene;
}

export function duplicateScene(c, id, name = null) {
  const scene = sceneById(c, id);
  if (!scene) return null;
  const copy = { id: newId('sc'), name: uniqueName(c, name ?? scene.name), items: cloneItems(scene.items), override: scene.override ? { ...scene.override } : null };
  c.scenes.splice(c.scenes.indexOf(scene) + 1, 0, copy);
  return copy;
}

/** Removes a scene; items of other scenes that showed it (nested) go too. Unused sources stay while referenced. */
export function removeScene(c, id) {
  if (c.scenes.length <= 1) return false;
  const i = c.scenes.findIndex((s) => s.id === id);
  if (i < 0) return false;
  c.scenes.splice(i, 1);
  for (const s of c.scenes) s.items = filterItems(s.items, (it) => it.source !== id);
  if (c.current === id) c.current = c.scenes[Math.min(i, c.scenes.length - 1)].id;
  if (c.preview === id) c.preview = c.current;
  pruneSources(c);
  return true;
}

export function renameScene(c, id, name) {
  const scene = sceneById(c, id);
  const clean = String(name ?? '').trim();
  if (!scene || !clean || nameTaken(c, clean, id)) return false;
  scene.name = clean;
  return true;
}

export function moveScene(c, id, to) {
  const i = c.scenes.findIndex((s) => s.id === id);
  if (i < 0) return false;
  const j = Math.max(0, Math.min(c.scenes.length - 1, to));
  const [scene] = c.scenes.splice(i, 1);
  c.scenes.splice(j, 0, scene);
  return i !== j;
}

// ───────────────────────── sources

export const sourceById = (c, id) => c.sources[id] ?? null;
/** A scene shown as a source in another scene: a pseudo source record. */
export function sourceOf(c, id) {
  if (c.sources[id]) return c.sources[id];
  const scene = sceneById(c, id);
  return scene ? { id: scene.id, type: 'scene', name: scene.name, settings: {}, filters: scene.filters ?? [], audio: null } : null;
}

export function createSource(c, type, name = null, settings = {}) {
  if (!SOURCE_TYPES[type] || type === 'scene') throw new Error(`unknown source type ${type}`);
  const info = SOURCE_TYPES[type];
  const source = { id: newId('src'), type, name: uniqueName(c, name ?? type), settings: sourceDefaults(type, settings), filters: [], audio: info.audio ? defaultAudio() : null, hotkeys: {} };
  c.sources[source.id] = source;
  return source;
}

export function renameSource(c, id, name) {
  const s = c.sources[id];
  const clean = String(name ?? '').trim();
  if (!s || !clean || nameTaken(c, clean, id)) return false;
  s.name = clean;
  return true;
}

/** Sources no scene shows any more are dropped (groups' children count). */
export function pruneSources(c) {
  const used = new Set();
  for (const s of c.scenes) walkItems(s.items, (it) => { if (it.source) used.add(it.source); });
  // A compressor's side-chain keeps its source alive too.
  for (const src of Object.values(c.sources)) for (const f of src.filters) if (f.settings?.sidechain_source) used.add(f.settings.sidechain_source);
  for (const id of Object.keys(c.sources)) if (!used.has(id) && !c.sources[id].global) delete c.sources[id];
}

/** Scenes, directly or through other scenes, that show this scene (no loops allowed). */
export function sceneContains(c, outerId, innerId, seen = new Set()) {
  if (outerId === innerId) return true;
  if (seen.has(outerId)) return false;
  seen.add(outerId);
  const outer = sceneById(c, outerId);
  let found = false;
  if (outer) walkItems(outer.items, (it) => { if (!found && sceneById(c, it.source) && sceneContains(c, it.source, innerId, seen)) found = true; });
  return found;
}

// ───────────────────────── items

export function walkItems(items, fn, parent = null) {
  for (const it of items) { fn(it, parent); if (it.children) walkItems(it.children, fn, it); }
}
export function filterItems(items, keep) {
  return items.filter(keep).map((it) => (it.children ? { ...it, children: filterItems(it.children, keep) } : it));
}
export function findItem(scene, id) {
  let found = null;
  walkItems(scene?.items ?? [], (it, parent) => { if (it.id === id) found = { item: it, parent, list: parent ? parent.children : scene.items }; });
  return found;
}
export const allItems = (scene) => { const out = []; walkItems(scene?.items ?? [], (it) => out.push(it)); return out; };

function cloneItems(items) {
  return items.map((it) => ({ ...JSON.parse(JSON.stringify(it)), id: newId('it'), children: it.children ? cloneItems(it.children) : undefined }));
}

export function makeItem(sourceId, transform = {}) {
  return { id: newId('it'), source: sourceId, visible: true, locked: false, transform: { ...defaultTransform(), ...transform }, blend: 'normal', scaleFilter: 'bilinear', show: null, hide: null };
}

/** Adds a source (or a scene, nested) to a scene, on top. Refuses a scene inside itself. */
export function addItem(c, sceneId, sourceId, transform = {}) {
  const scene = sceneById(c, sceneId);
  if (!scene) return null;
  if (sceneById(c, sourceId) && sceneContains(c, sourceId, sceneId)) return null;
  if (!sourceOf(c, sourceId)) return null;
  const item = makeItem(sourceId, transform);
  scene.items.push(item);
  return item;
}

export function removeItems(c, sceneId, ids) {
  const scene = sceneById(c, sceneId);
  if (!scene) return 0;
  const drop = new Set(ids);
  let n = 0;
  const keep = (it) => { if (drop.has(it.id)) { n++; return false; } return true; };
  // A removed group takes its children with it; a removed child leaves the group.
  scene.items = filterItems(scene.items, keep);
  pruneSources(c);
  return n;
}

export function duplicateItem(c, sceneId, id) {
  const scene = sceneById(c, sceneId);
  const hit = findItem(scene, id);
  if (!hit) return null;
  const [copy] = cloneItems([hit.item]);
  copy.transform.x += 20; copy.transform.y += 20;
  hit.list.splice(hit.list.indexOf(hit.item) + 1, 0, copy);
  return copy;
}

/** Order: 'up' (one step towards the top), 'down', 'top', 'bottom' — within the item's own list. */
export function orderItem(c, sceneId, id, how) {
  const hit = findItem(sceneById(c, sceneId), id);
  if (!hit) return false;
  const list = hit.list;
  const i = list.indexOf(hit.item);
  const j = how === 'up' ? i + 1 : how === 'down' ? i - 1 : how === 'top' ? list.length - 1 : how === 'bottom' ? 0 : i;
  if (j < 0 || j >= list.length || j === i) return false;
  list.splice(i, 1);
  list.splice(j, 0, hit.item);
  return true;
}

/** Moves an item to `index` in the top-level list or inside a group (drag & drop in the Sources list). */
export function moveItemTo(c, sceneId, id, groupId, index) {
  const scene = sceneById(c, sceneId);
  const hit = findItem(scene, id);
  if (!hit) return false;
  if (hit.item.children && groupId) return false; // groups do not nest
  const target = groupId ? findItem(scene, groupId)?.item?.children : scene.items;
  if (!target) return false;
  hit.list.splice(hit.list.indexOf(hit.item), 1);
  target.splice(Math.max(0, Math.min(target.length, index)), 0, hit.item);
  return true;
}

/** Groups items of a scene's top level into a new group (a group source is created). */
export function groupItems(c, sceneId, ids, name = 'Group') {
  const scene = sceneById(c, sceneId);
  if (!scene) return null;
  const picked = scene.items.filter((it) => ids.includes(it.id) && !it.children);
  if (!picked.length) return null;
  const source = createSource(c, 'group', name);
  const at = Math.max(...picked.map((it) => scene.items.indexOf(it)));
  const group = { ...makeItem(source.id), children: picked, collapsed: false };
  scene.items.splice(at + 1, 0, group);
  scene.items = scene.items.filter((it) => !picked.includes(it));
  return group;
}

export function ungroup(c, sceneId, groupItemId) {
  const scene = sceneById(c, sceneId);
  const i = scene?.items.findIndex((it) => it.id === groupItemId) ?? -1;
  if (i < 0 || !scene.items[i].children) return false;
  const g = scene.items[i];
  // Children keep their place on screen: the group's offset moves into them.
  const kids = g.children.map((k) => ({ ...k, transform: { ...k.transform, x: k.transform.x * g.transform.sx + g.transform.x, y: k.transform.y * g.transform.sy + g.transform.y, sx: k.transform.sx * g.transform.sx, sy: k.transform.sy * g.transform.sy, rot: k.transform.rot + g.transform.rot } }));
  scene.items.splice(i, 1, ...kids);
  pruneSources(c);
  return true;
}

// ───────────────────────── filters

export function addFilter(c, sourceId, type, name = null, settings = {}) {
  const src = sourceOf(c, sourceId);
  if (!src || !FILTER_TYPES[type]) return null;
  const holder = c.sources[sourceId] ?? sceneById(c, sourceId);
  holder.filters ??= [];
  const used = new Set(holder.filters.map((f) => f.name));
  let n = name ?? type;
  if (used.has(n)) { let i = 2; while (used.has(`${n} ${i}`)) i++; n = `${n} ${i}`; }
  const filter = { id: newId('f'), type, name: n, enabled: true, settings: filterDefaults(type, settings) };
  holder.filters.push(filter);
  return filter;
}
const filterHolder = (c, sourceId) => c.sources[sourceId] ?? sceneById(c, sourceId);
export function removeFilter(c, sourceId, filterId) {
  const h = filterHolder(c, sourceId);
  const i = h?.filters?.findIndex((f) => f.id === filterId) ?? -1;
  if (i < 0) return false;
  h.filters.splice(i, 1);
  return true;
}
export function moveFilter(c, sourceId, filterId, dir) {
  const list = filterHolder(c, sourceId)?.filters;
  const i = list?.findIndex((f) => f.id === filterId) ?? -1;
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return false;
  [list[i], list[j]] = [list[j], list[i]];
  return true;
}
/** Copies all filters of one source onto another ("Copy filters" / "Paste filters"). */
export function pasteFilters(c, fromId, toId) {
  const from = filterHolder(c, fromId)?.filters ?? [];
  const to = filterHolder(c, toId);
  if (!to) return 0;
  const target = sourceOf(c, toId);
  const fits = (f) => (FILTER_TYPES[f.type].kind === 'audio' ? Boolean(SOURCE_TYPES[target.type]?.audio) : Boolean(SOURCE_TYPES[target.type]?.video));
  let n = 0;
  for (const f of from) if (fits(f)) { addFilter(c, toId, f.type, f.name, f.settings); n++; }
  return n;
}

// ───────────────────────── transitions

export function addTransition(c, type, name = null, settings = {}) {
  if (!TRANSITION_TYPES[type]) return null;
  const used = new Set(c.transitions.map((x) => x.name));
  let n = name ?? type;
  if (used.has(n)) { let i = 2; while (used.has(`${n} ${i}`)) i++; n = `${n} ${i}`; }
  const tr = { id: newId('tr'), type, name: n, settings: transitionDefaults(type, settings) };
  c.transitions.push(tr);
  return tr;
}
export const transitionById = (c, id) => c.transitions.find((x) => x.id === id) ?? null;
export function removeTransition(c, id) {
  const tr = transitionById(c, id);
  if (!tr || TRANSITION_TYPES[tr.type].fixed && c.transitions.filter((x) => x.type === tr.type).length === 1) return false;
  c.transitions = c.transitions.filter((x) => x.id !== id);
  if (c.transition === id) c.transition = c.transitions[0]?.id ?? null;
  c.quick = c.quick.filter((q) => q.transition !== id);
  for (const s of c.scenes) if (s.override?.transition === id) s.override = null;
  return true;
}

/** The transition used to switch to `sceneId`: the scene's override, else the current one. */
export function transitionFor(c, sceneId) {
  const scene = sceneById(c, sceneId);
  const o = scene?.override;
  if (o?.transition && transitionById(c, o.transition)) return { transition: transitionById(c, o.transition), duration: o.duration ?? c.duration };
  return { transition: transitionById(c, c.transition) ?? c.transitions[0], duration: c.duration };
}

// ───────────────────────── checks and normalisation

/** Problems of a collection (bottom panel › Problems): missing files, empty scenes, loops… */
export function findProblems(c, { exists = () => true } = {}) {
  const out = [];
  for (const s of c.scenes) if (!s.items.length) out.push({ kind: 'emptyScene', severity: 'info', scene: s.id, params: { name: s.name } });
  for (const src of Object.values(c.sources)) {
    const st = src.settings ?? {};
    const files = [st.file, st.local_file, ...(Array.isArray(st.files) ? st.files : []), ...(Array.isArray(st.playlist) ? st.playlist : [])]
      .map((f) => (typeof f === 'object' && f ? f.value ?? f.path : f)).filter((f) => typeof f === 'string' && f && !f.startsWith('asset:') && !f.startsWith('sample:'));
    const needsFile = (src.type === 'image_source' && !st.file) || (src.type === 'ffmpeg_source' && st.is_local_file !== false && !st.local_file);
    if (needsFile) out.push({ kind: 'noFile', severity: 'warning', source: src.id, params: { name: src.name } });
    for (const f of files) if (!exists(f)) out.push({ kind: 'missingFile', severity: 'error', source: src.id, params: { name: src.name, file: f } });
    for (const f of src.filters) if (FILTER_TYPES[f.type]?.unsupported) out.push({ kind: 'unsupportedFilter', severity: 'warning', source: src.id, params: { name: src.name, filter: f.name } });
    if (src.audio?.muted && SOURCE_TYPES[src.type]?.group === 'audio') out.push({ kind: 'mutedMic', severity: 'info', source: src.id, params: { name: src.name } });
  }
  return out;
}

/** A collection read from a file or storage: missing parts filled, unknown types dropped. */
export function normalizeCollection(raw) {
  const c = raw && typeof raw === 'object' ? JSON.parse(JSON.stringify(raw)) : createCollection();
  c.version = VERSION;
  c.name = String(c.name || 'Untitled');
  c.sources = c.sources && typeof c.sources === 'object' ? c.sources : {};
  for (const [id, s] of Object.entries(c.sources)) {
    if (!SOURCE_TYPES[s?.type] || s.type === 'scene') { delete c.sources[id]; continue; }
    s.id = id;
    s.name = String(s.name || s.type);
    s.settings = sourceDefaults(s.type, s.settings ?? {});
    s.filters = (Array.isArray(s.filters) ? s.filters : []).filter((f) => FILTER_TYPES[f?.type]).map((f) => ({ id: f.id || newId('f'), type: f.type, name: String(f.name || f.type), enabled: f.enabled !== false, settings: filterDefaults(f.type, f.settings ?? {}) }));
    s.audio = SOURCE_TYPES[s.type].audio ? { ...defaultAudio(), ...(s.audio ?? {}) } : null;
    if (s.audio) s.audio.tracks = Array.from({ length: TRACKS }, (_, i) => s.audio.tracks?.[i] !== false);
    s.hotkeys ??= {};
  }
  c.scenes = (Array.isArray(c.scenes) ? c.scenes : []).filter((s) => s && s.id);
  const known = (id) => Boolean(c.sources[id]) || c.scenes.some((s) => s.id === id);
  const fixItem = (it) => ({ ...makeItem(it.source), ...it, id: it.id || newId('it'), transform: { ...defaultTransform(), ...(it.transform ?? {}), crop: { l: 0, t: 0, r: 0, b: 0, ...(it.transform?.crop ?? {}) }, bounds: { ...defaultTransform().bounds, ...(it.transform?.bounds ?? {}) } }, children: it.children ? it.children.filter((k) => known(k.source)).map(fixItem) : undefined });
  for (const s of c.scenes) { s.name = String(s.name || 'Scene'); s.items = (Array.isArray(s.items) ? s.items : []).filter((it) => known(it.source)).map(fixItem); s.override ??= null; }
  if (!c.scenes.length) addScene(c, 'Scene');
  // Kinds saved under the scene-file names (older collections) are read as ours, not dropped.
  c.transitions = (Array.isArray(c.transitions) ? c.transitions : []).map((x) => (x && TRANSITION_IN[x.type] ? { ...x, type: TRANSITION_IN[x.type] } : x)).filter((x) => TRANSITION_TYPES[x?.type]).map((x) => ({ ...x, id: x.id || newId('tr'), settings: transitionDefaults(x.type, x.settings ?? {}) }));
  if (!c.transitions.some((x) => x.type === 'cut_transition')) c.transitions.unshift({ id: newId('tr'), type: 'cut_transition', name: 'cut_transition', settings: {} });
  if (!c.transitions.some((x) => x.type === 'fade_transition')) c.transitions.push({ id: newId('tr'), type: 'fade_transition', name: 'fade_transition', settings: {} });
  if (!transitionById(c, c.transition)) c.transition = c.transitions.find((x) => x.type === 'fade_transition').id;
  c.duration = Math.max(50, Math.min(20000, Number(c.duration) || 300));
  c.quick = (Array.isArray(c.quick) ? c.quick : []).filter((q) => transitionById(c, q.transition));
  if (!sceneById(c, c.current)) c.current = c.scenes[0].id;
  if (!sceneById(c, c.preview)) c.preview = c.current;
  return c;
}

/** Whether a scene shows any picture (a visible source with video); a scene of sound only is black. */
export function showsPicture(c, sceneId) {
  for (const id of activeSources(c, sceneId)) if (SOURCE_TYPES[c.sources[id]?.type]?.video) return true;
  return false;
}

/** The sources a scene shows, nested scenes and groups included (for audio: what is "active"). */
export function activeSources(c, sceneId, seen = new Set()) {
  const out = new Set();
  const scene = sceneById(c, sceneId);
  if (!scene || seen.has(sceneId)) return out;
  seen.add(sceneId);
  walkItems(scene.items, (it, parent) => {
    if (!it.visible || (parent && !parent.visible)) return;
    if (sceneById(c, it.source)) for (const id of activeSources(c, it.source, seen)) out.add(id);
    else out.add(it.source);
  });
  return out;
}

// A drawing (one tab, one .mcad file): layers, entities, grid and the
// title-block information printed on the sheet.
import { createEntity, entityBox, newId, normalizeEntity, transformEntity } from './entities.js';
import { unionBox } from './geometry.js';
import { composeClone, syncClones } from './clones.js';
import { normalizeWorkPlane } from './workplane.js';
import { normalizeConstraints } from './constraints.js';
import { normalizeFem } from './fem.js';
import { normalizeSpreadsheet } from './spreadsheet.js';
import { normalizeJoints } from './assembly.js';
import { normalizeBim } from './arch.js';

export const LAYER_LINE_TYPES = ['continuous', 'dashed', 'center', 'hidden', 'phantom', 'dotted'];
/** "auto" = the drawing ink colour: dark on light backgrounds and paper, light on dark backgrounds. */
export const AUTO = 'auto';

/** The standard layers of a new mechanical drawing (names follow the language). */
export function defaultLayers(language = 'ko') {
  const en = language === 'en';
  return [
    { id: '0', name: en ? 'Outline' : '외형선', color: AUTO, lineType: 'continuous', lineWidth: 0.5, visible: true, locked: false },
    { id: 'center', name: en ? 'Center lines' : '중심선', color: '#e5484d', lineType: 'center', lineWidth: 0.18, visible: true, locked: false },
    { id: 'hidden', name: en ? 'Hidden lines' : '숨은선', color: '#3a8fd6', lineType: 'hidden', lineWidth: 0.25, visible: true, locked: false },
    { id: 'dim', name: en ? 'Dimensions' : '치수', color: '#2fa36b', lineType: 'continuous', lineWidth: 0.18, visible: true, locked: false },
    { id: 'text', name: en ? 'Text' : '문자', color: AUTO, lineType: 'continuous', lineWidth: 0.25, visible: true, locked: false },
  ];
}

export function createDrawing({ title = 'Drawing', language = 'ko', author = '', gridSize = 10 } = {}) {
  const now = new Date().toISOString();
  return {
    id: newId('dwg'),
    title,
    description: '',
    author,
    units: 'mm',
    created: now,
    updated: now,
    layers: defaultLayers(language),
    activeLayer: '0',
    grid: { size: gridSize },
    sheet: { number: '', material: '', scale: '1:1', company: '', checkedBy: '' },
    entities: [],
  };
}

const text = (value, fallback = '') => (typeof value === 'string' ? value : fallback);

export function normalizeLayer(raw, index = 0) {
  return {
    id: text(raw?.id) || newId('layer'),
    name: text(raw?.name) || `Layer ${index}`,
    color: raw?.color === AUTO || /^#[0-9a-f]{6}$/i.test(raw?.color ?? '') ? String(raw.color).toLowerCase() : AUTO,
    lineType: LAYER_LINE_TYPES.includes(raw?.lineType) ? raw.lineType : 'continuous',
    lineWidth: Number.isFinite(raw?.lineWidth) && raw.lineWidth > 0 ? raw.lineWidth : 0.25,
    visible: raw?.visible !== false,
    locked: Boolean(raw?.locked),
  };
}

/** Repairs a drawing read from a file (keeps every usable entity). */
export function normalizeDrawing(raw, language = 'ko') {
  const base = createDrawing({ language });
  const layers = Array.isArray(raw?.layers) && raw.layers.length ? raw.layers.map(normalizeLayer) : base.layers;
  const seen = new Set();
  const uniqueLayers = layers.filter((layer) => !seen.has(layer.id) && seen.add(layer.id));
  const ids = new Set();
  const entities = (Array.isArray(raw?.entities) ? raw.entities : []).map(normalizeEntity).filter(Boolean).map((entity) => {
    // Unknown layer → the first layer; duplicate id → a new one.
    const fixed = uniqueLayers.some((layer) => layer.id === entity.layer) ? entity : { ...entity, layer: uniqueLayers[0].id };
    if (ids.has(fixed.id)) fixed.id = newId();
    ids.add(fixed.id);
    return fixed;
  });
  const size = Number(raw?.grid?.size);
  return {
    id: text(raw?.id) || base.id,
    title: text(raw?.title) || base.title,
    description: text(raw?.description),
    author: text(raw?.author),
    units: 'mm',
    created: text(raw?.created) || base.created,
    updated: text(raw?.updated) || base.updated,
    layers: uniqueLayers,
    activeLayer: uniqueLayers.some((layer) => layer.id === raw?.activeLayer) ? raw.activeLayer : uniqueLayers[0].id,
    grid: { size: Number.isFinite(size) && size > 0 ? Math.min(1000, size) : 10 },
    sheet: { ...base.sheet, ...Object.fromEntries(Object.entries(raw?.sheet ?? {}).filter(([key, value]) => key in base.sheet && typeof value === 'string')) },
    entities,
    // BIM: site, building, levels and materials (only in drawings that have BIM objects).
    ...(raw?.bim ? { bim: normalizeBim(raw.bim, language) } : {}),
    ...(normalizeWorkPlane(raw?.workPlane) ? { workPlane: normalizeWorkPlane(raw.workPlane) } : {}),
    ...(normalizeConstraints(raw?.constraints).length ? { constraints: normalizeConstraints(raw.constraints) } : {}),
    ...(raw?.fem ? { fem: normalizeFem(raw.fem) } : {}),
    ...(raw?.spreadsheet ? { spreadsheet: normalizeSpreadsheet(raw.spreadsheet) } : {}),
    // Assembly joints between solids.
    ...(normalizeJoints(raw?.joints).length ? { joints: normalizeJoints(raw.joints) } : {}),
  };
}

// ───────────────────────── lookups

export const findEntity = (drawing, id) => drawing.entities.find((entity) => entity.id === id) ?? null;
export const findLayer = (drawing, id) => drawing.layers.find((layer) => layer.id === id) ?? null;
export const layerOf = (drawing, entity) => findLayer(drawing, entity.layer) ?? drawing.layers[0];
/** The level (storey) an entity stands on, if any. */
export const levelOf = (drawing, entity) => (entity.level ? drawing.bim?.levels?.find((level) => level.id === entity.level) ?? null : null);
/** Shown in 3D: its layer and its level are visible. */
export const isVisible3d = (drawing, entity) => layerOf(drawing, entity)?.visible !== false && levelOf(drawing, entity)?.visible !== false;
/** Shown in the 2D drawing: as in 3D, and on the level the plan shows (when one is chosen). */
export const isVisible = (drawing, entity) => isVisible3d(drawing, entity) && (!drawing.bim?.planLevel || !entity.level || entity.level === drawing.bim.planLevel);
/** Part of the result (exports, print, outlines for solids and CAM): visible and not construction geometry. */
export const isOutput = (drawing, entity) => isVisible(drawing, entity) && !entity.construction;
export const isLocked = (drawing, entity) => Boolean(layerOf(drawing, entity)?.locked);
/** Entities the user can pick: on visible, unlocked layers. */
export const editable = (drawing) => drawing.entities.filter((entity) => isVisible(drawing, entity) && !isLocked(drawing, entity));

/** Resolved style of an entity: its own value or its layer's ("ByLayer"). */
export function styleOf(drawing, entity) {
  const layer = layerOf(drawing, entity);
  return {
    color: entity.color ?? layer?.color ?? AUTO,
    lineType: entity.lineType ?? layer?.lineType ?? 'continuous',
    lineWidth: entity.lineWidth ?? layer?.lineWidth ?? 0.25,
  };
}

export function extents(drawing, { visibleOnly = true } = {}) {
  return drawing.entities.filter((entity) => !visibleOnly || isVisible(drawing, entity)).reduce((box, entity) => unionBox(box, entityBox(entity)), null);
}

function touch(drawing) {
  drawing.updated = new Date().toISOString();
}

// ───────────────────────── entity operations (mutate the drawing; callers wrap them in undo steps)

export function addEntity(drawing, type, data = {}) {
  const entity = createEntity(type, { layer: drawing.activeLayer, ...data });
  if (!findLayer(drawing, entity.layer)) entity.layer = drawing.activeLayer;
  drawing.entities.push(entity);
  touch(drawing);
  return entity;
}

/** Adds ready-made entities (pasted, exploded…) with fresh ids. */
export function insertEntities(drawing, list) {
  const added = list.map((raw) => {
    const entity = normalizeEntity({ ...structuredClone(raw), id: newId() });
    if (!entity) return null;
    if (!findLayer(drawing, entity.layer)) entity.layer = drawing.activeLayer;
    drawing.entities.push(entity);
    return entity;
  }).filter(Boolean);
  if (added.length) touch(drawing);
  return added;
}

export function updateEntity(drawing, id, patch) {
  const index = drawing.entities.findIndex((entity) => entity.id === id);
  if (index < 0) return null;
  const merged = normalizeEntity({ ...drawing.entities[index], ...patch, id, type: drawing.entities[index].type });
  if (!merged) return null;
  drawing.entities[index] = merged;
  touch(drawing);
  return merged;
}

/** Replaces an entity with a new version (same id) — used by grips and transforms. */
export function replaceEntity(drawing, entity) {
  const index = drawing.entities.findIndex((item) => item.id === entity.id);
  if (index < 0) return null;
  drawing.entities[index] = normalizeEntity(entity);
  touch(drawing);
  return drawing.entities[index];
}

export function removeEntities(drawing, ids) {
  const set = new Set(ids);
  const before = drawing.entities.length;
  drawing.entities = drawing.entities.filter((entity) => !set.has(entity.id));
  if (drawing.entities.length !== before) touch(drawing);
  return before - drawing.entities.length;
}

export function transformEntities(drawing, ids, op, { copy = false } = {}) {
  const set = new Set(ids);
  const result = [];
  for (const entity of [...drawing.entities]) {
    if (!set.has(entity.id)) continue;
    // A clone keeps its shape from the source: only its own transform changes.
    const moved = normalizeEntity(entity.clone ? { ...entity, clone: composeClone(entity.clone, op) } : transformEntity(entity, op));
    if (copy) {
      moved.id = newId();
      drawing.entities.push(moved);
    } else {
      drawing.entities[drawing.entities.indexOf(entity)] = moved;
    }
    result.push(moved);
  }
  if (result.length) {
    syncDrawingClones(drawing);
    touch(drawing);
  }
  return result.map((e) => findEntity(drawing, e.id) ?? e);
}

/** Rebuilds the clones of a drawing from their sources (after any change). */
export function syncDrawingClones(drawing) {
  return syncClones(drawing, { transformEntity, normalizeEntity });
}

/**
 * Draft Clone: a copy of each entity (moved by offset) that keeps following
 * its source. A clone of a clone follows the same chain.
 */
export function cloneEntities(drawing, ids, offset = { x: 10, y: -10 }) {
  const made = [];
  for (const id of ids) {
    const source = findEntity(drawing, id);
    if (!source) continue;
    const box = entityBox(source);
    const cx = box ? (box.minX + box.maxX) / 2 : 0;
    const cy = box ? (box.minY + box.maxY) / 2 : 0;
    const raw = { ...structuredClone(source), id: newId(), clone: { of: source.id, cx, cy, dx: offset.x, dy: offset.y, angle: 0, scale: 1, flip: false } };
    if (source.name) raw.name = source.name;
    const entity = normalizeEntity(raw);
    if (!entity) continue;
    drawing.entities.push(entity);
    made.push(entity.id);
  }
  syncDrawingClones(drawing);
  if (made.length) touch(drawing);
  return made.map((id) => findEntity(drawing, id));
}

/** Makes clones ordinary objects again (Draft: Make independent). */
export function unlinkClones(drawing, ids) {
  let count = 0;
  for (const id of ids) {
    const entity = findEntity(drawing, id);
    if (!entity?.clone) continue;
    delete entity.clone;
    count++;
  }
  if (count) touch(drawing);
  return count;
}

export function duplicateEntities(drawing, ids, offset = { x: 10, y: -10 }) {
  return transformEntities(drawing, ids, { type: 'move', dx: offset.x, dy: offset.y }, { copy: true });
}

/** Moves entities to the end (drawn on top) or the start (drawn below) of the list. */
export function reorder(drawing, ids, toFront) {
  const set = new Set(ids);
  const picked = drawing.entities.filter((entity) => set.has(entity.id));
  const rest = drawing.entities.filter((entity) => !set.has(entity.id));
  drawing.entities = toFront ? [...rest, ...picked] : [...picked, ...rest];
  touch(drawing);
}

/** Rectangular array: copies on a rows × columns grid. Returns the new entities. */
export function rectangularArray(drawing, ids, { rows, columns, dx, dy }) {
  const created = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      if (!r && !c) continue;
      created.push(...transformEntities(drawing, ids, { type: 'move', dx: c * dx, dy: r * dy }, { copy: true }));
    }
  }
  return created;
}

/** Polar array: `count` items (the original included) over `angle` degrees around (cx, cy). */
export function polarArray(drawing, ids, { count, angle, cx, cy, rotateItems = true }) {
  const created = [];
  const full = Math.abs(Math.abs(angle) - 360) < 1e-9;
  const step = count > 1 ? angle / (full ? count : count - 1) : 0;
  const originals = drawing.entities.filter((entity) => ids.includes(entity.id));
  for (let i = 1; i < count; i++) {
    for (const entity of originals) {
      let copy = transformEntity(entity, { type: 'rotate', cx, cy, angle: step * i });
      if (!rotateItems) {
        // Keep the item's orientation: rotate back around its own (moved) position.
        const box = entityBox(entity);
        const center = box ? { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 } : { x: cx, y: cy };
        const movedBox = entityBox(copy);
        const movedCenter = movedBox ? { x: (movedBox.minX + movedBox.maxX) / 2, y: (movedBox.minY + movedBox.maxY) / 2 } : center;
        copy = transformEntity(entity, { type: 'move', dx: movedCenter.x - center.x, dy: movedCenter.y - center.y });
      }
      const added = normalizeEntity({ ...copy, id: newId() });
      drawing.entities.push(added);
      created.push(added);
    }
  }
  if (created.length) touch(drawing);
  return created;
}

// ───────────────────────── layers

export function addLayer(drawing, data = {}) {
  let n = drawing.layers.length;
  let name = data.name;
  while (!name || drawing.layers.some((layer) => layer.name === name)) name = `${data.base ?? 'Layer'} ${n++}`;
  const layer = normalizeLayer({ color: AUTO, lineType: 'continuous', lineWidth: 0.35, ...data, id: newId('layer'), name });
  drawing.layers.push(layer);
  touch(drawing);
  return layer;
}

export function updateLayer(drawing, id, patch) {
  const layer = findLayer(drawing, id);
  if (!layer) return null;
  Object.assign(layer, normalizeLayer({ ...layer, ...patch, id }));
  touch(drawing);
  return layer;
}

/** Removes a layer; its entities move to the first remaining layer. The last layer cannot be removed. */
export function removeLayer(drawing, id) {
  if (drawing.layers.length <= 1 || !findLayer(drawing, id)) return false;
  drawing.layers = drawing.layers.filter((layer) => layer.id !== id);
  const fallback = drawing.layers[0].id;
  for (const entity of drawing.entities) if (entity.layer === id) entity.layer = fallback;
  if (drawing.activeLayer === id) drawing.activeLayer = fallback;
  touch(drawing);
  return true;
}

export function moveToLayer(drawing, ids, layerId) {
  if (!findLayer(drawing, layerId)) return 0;
  const set = new Set(ids);
  let count = 0;
  for (const entity of drawing.entities) if (set.has(entity.id) && entity.layer !== layerId) { entity.layer = layerId; count += 1; }
  if (count) touch(drawing);
  return count;
}

// ───────────────────────── statistics

export function stats(drawing) {
  const byType = {};
  for (const entity of drawing.entities) byType[entity.type] = (byType[entity.type] ?? 0) + 1;
  return { entities: drawing.entities.length, layers: drawing.layers.length, byType, box: extents(drawing, { visibleOnly: false }) };
}

/**
 * Line type scale of a drawing (like LTSCALE): dashes are lengths on paper, so
 * a 1:100 drawing gets dashes 100 times as long in model units.
 */
export function dashScaleOf(drawing) {
  const m = /^\s*([\d.]+)\s*:\s*([\d.]+)\s*$/.exec(String(drawing?.sheet?.scale ?? ''));
  const k = m ? Number(m[2]) / Number(m[1]) : 1;
  return Number.isFinite(k) && k > 0 ? Math.min(Math.max(k, 0.01), 10000) : 1;
}

// The diagram model and every edit on it. A document has pages; a page has
// layers, guides and shapes in z-order (first = back). Shapes are
//   2-D shapes   { type: 'shape', master, x, y, w, h, angle, flipH, flipV, text, style, qs, params, … }
//   groups       { type: 'group', x, y, w, h, … } — members carry groupId
//   connectors   { type: 'connector', from, to, route, waypoints, text, style, … }
//                an end is glued ({ id, pt }: pt = connection point index or 'auto')
//                or free ({ x, y })
// The functions change the document in place; the app runs each edit through
// PlanDocument.apply() so it becomes one undo step. Pure (no DOM): unit-tested.
import { boundsOf, center, corners, rectInside, rotatePoint, shapeBounds, unionBounds } from './geometry.js';
import { connectionPoints, hasMaster, masterById, shapeParams } from './stencils.js';

export const FORMAT = 'mydiagram';
export const VERSION = 1;
/** Pixels per inch / millimetre (the drawing is stored in CSS pixels at 96 dpi). */
export const PX_PER_IN = 96;
export const PX_PER_MM = 96 / 25.4;

/** Paper sizes in millimetres (portrait). */
export const PAGE_SIZES = {
  A3: [297, 420], A4: [210, 297], A5: [148, 210], B4: [250, 353], B5: [176, 250],
  Letter: [215.9, 279.4], Legal: [215.9, 355.6], Tabloid: [279.4, 431.8], Ledger: [431.8, 279.4],
  Screen: [338.7, 190.5], Wide: [508, 285.75],
};
export const UNITS = ['mm', 'cm', 'in', 'pt', 'px'];
export const ROUTES = ['orthogonal', 'straight', 'curved'];

let counter = 0;
export function newId(prefix = 'id') {
  counter = (counter + 1) % 1679616;
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36).padStart(3, '0')}${Math.floor(Math.random() * 1296).toString(36).padStart(2, '0')}`;
}

const clone = (value) => JSON.parse(JSON.stringify(value));
const mmToPx = (mm) => Math.round(mm * PX_PER_MM * 100) / 100;

/** Page size in px from a paper name and orientation. */
export function paperSize(name = 'A4', orientation = 'landscape') {
  const [w, h] = PAGE_SIZES[name] ?? PAGE_SIZES.A4;
  const [pw, ph] = orientation === 'landscape' ? [Math.max(w, h), Math.min(w, h)] : [Math.min(w, h), Math.max(w, h)];
  return { width: mmToPx(pw), height: mmToPx(ph) };
}

/** Converts px to a display unit and back. */
export const toUnit = (px, unit) => ({ mm: px / PX_PER_MM, cm: px / PX_PER_MM / 10, in: px / PX_PER_IN, pt: (px * 72) / PX_PER_IN, px }[unit] ?? px);
export const fromUnit = (value, unit) => ({ mm: value * PX_PER_MM, cm: value * PX_PER_MM * 10, in: value * PX_PER_IN, pt: (value * PX_PER_IN) / 72, px: value }[unit] ?? value);
export function formatLength(px, unit, digits = null) {
  const value = toUnit(px, unit);
  const d = digits ?? (unit === 'in' ? 2 : unit === 'cm' ? 2 : unit === 'px' || unit === 'pt' ? 0 : 1);
  return `${Number(value.toFixed(d))} ${unit}`;
}
/** "25 mm", "1.5in", "40" (in the default unit) → px, or null. */
export function parseLength(text, unit = 'mm') {
  const m = /^\s*([-+]?\d*[.,]?\d+)\s*(mm|cm|in|"|pt|px)?\s*$/i.exec(String(text ?? ''));
  if (!m) return null;
  const value = Number(m[1].replace(',', '.'));
  const u = (m[2] ?? unit).toLowerCase().replace('"', 'in');
  return fromUnit(value, u);
}

// ───────────────────────── creating

export function createLayer(name, extra = {}) {
  return { id: newId('layer'), name, visible: true, print: true, locked: false, color: '', ...extra };
}

export function createPage({ name = 'Page-1', paper = 'A4', orientation = 'landscape', width = null, height = null, background = false } = {}) {
  const size = width && height ? { width, height } : paperSize(paper, orientation);
  return {
    id: newId('page'), name, paper: width && height ? 'custom' : paper, orientation, width: size.width, height: size.height,
    autoSize: true, background, backgroundId: null, color: '', grid: true, gridSize: 0, layers: [], activeLayer: null, guides: [], comments: [], shapes: [],
  };
}

export function createDocument({ title = 'Drawing', language = 'ko', design = 'office', paper = null, orientation = 'landscape', pageName = null } = {}) {
  const now = new Date().toISOString();
  const doc = {
    format: FORMAT, version: VERSION, id: newId('dgm'), title, subject: '', author: '', manager: '', company: '', category: '', keywords: '', description: '',
    created: now, design, variant: 0, units: language === 'en' ? 'in' : 'mm', language,
    options: { lineJumps: true, jumpSize: 1, avoidShapes: true, snapGrid: true, snapShapes: true, snapGuides: true, glue: true, dataGraphics: false, connectorRoute: 'orthogonal' },
    pages: [],
  };
  doc.pages.push(createPage({ name: pageName ?? (language === 'en' ? 'Page-1' : '페이지-1'), paper: paper ?? (language === 'en' ? 'Letter' : 'A4'), orientation }));
  return doc;
}

/** A new 2-D shape from a master, centred on (cx, cy) unless `x`/`y` are given. */
export function createShape(masterId, { cx = 100, cy = 100, x = null, y = null, w = null, h = null, text = '', ...extra } = {}) {
  const master = masterById(hasMaster(masterId) ? masterId : 'rect');
  const width = w ?? master.w;
  const height = h ?? master.h;
  return {
    id: newId('shp'), type: 'shape', master: master.id, name: '', x: x ?? cx - width / 2, y: y ?? cy - height / 2, w: width, h: height,
    angle: 0, flipH: false, flipV: false, text, style: {}, qs: {}, params: {}, layers: [], locked: {}, data: [], hyperlink: '', comments: [], groupId: null, showData: false,
    ...extra,
  };
}

export function createConnector(from, to, { route = 'orthogonal', text = '', ...extra } = {}) {
  return {
    id: newId('con'), type: 'connector', from: { ...from }, to: { ...to }, route, waypoints: [], text, textPos: 0.5, style: {}, layers: [], locked: {}, data: [], hyperlink: '', comments: [], groupId: null, name: '',
    ...extra,
  };
}

// ───────────────────────── lookups

export const pageById = (doc, id) => doc.pages.find((page) => page.id === id) ?? null;
export const findShape = (page, id) => page?.shapes.find((shape) => shape.id === id) ?? null;
export const shapeIndex = (page, id) => page.shapes.findIndex((shape) => shape.id === id);
export const isConnector = (shape) => shape?.type === 'connector';
export const isGroup = (shape) => shape?.type === 'group';

/** Where a shape lives anywhere in the document: { page, shape } or null. */
export function locate(doc, id) {
  for (const page of doc.pages) {
    const shape = findShape(page, id);
    if (shape) return { page, shape };
  }
  return null;
}

export const membersOf = (page, groupId) => page.shapes.filter((shape) => shape.groupId === groupId);

/** A shape and, for a group, all its members (nested groups included). */
export function withMembers(page, ids) {
  const out = new Set();
  const visit = (id) => {
    if (out.has(id)) return;
    out.add(id);
    for (const member of page.shapes) if (member.groupId === id) visit(member.id);
  };
  for (const id of ids) visit(id);
  return [...out];
}

/** The outermost group a shape belongs to (or the shape itself). */
export function topLevel(page, id) {
  let shape = findShape(page, id);
  while (shape?.groupId) {
    const parent = findShape(page, shape.groupId);
    if (!parent) break;
    shape = parent;
  }
  return shape;
}

/** Layer test: is the shape on a hidden / locked layer? */
export function layerState(page, shape) {
  const layers = (shape.layers ?? []).map((id) => page.layers.find((layer) => layer.id === id)).filter(Boolean);
  return {
    visible: !layers.length || layers.some((layer) => layer.visible),
    locked: layers.length > 0 && layers.every((layer) => layer.locked),
    print: !layers.length || layers.some((layer) => layer.print),
    color: layers.find((layer) => layer.color)?.color ?? '',
  };
}

/** The connection point positions of a 2-D shape on the page. */
export function pagePoints(shape) {
  return connectionPoints(shape).map((p) => {
    const lx = shape.flipH ? shape.w - p.x : p.x;
    const ly = shape.flipV ? shape.h - p.y : p.y;
    const at = rotatePoint({ x: shape.x + lx, y: shape.y + ly }, center(shape), shape.angle ?? 0);
    return { ...at, nx: shape.flipH ? 1 - p.nx : p.nx, ny: shape.flipV ? 1 - p.ny : p.ny };
  });
}

/** Box of anything on the page (connectors: around their path, given by `routeOf`). */
export function boundsOfShape(page, shape, routeOf = null) {
  if (isConnector(shape)) {
    const points = routeOf ? routeOf(shape).points : [endPosition(page, shape.from), endPosition(page, shape.to)].filter(Boolean);
    return boundsOf(points);
  }
  return shapeBounds(shape);
}

/** A connector end on the page, without routing: a glued end at its point (or the shape centre). */
export function endPosition(page, end) {
  if (!end) return null;
  if (end.id) {
    const shape = findShape(page, end.id);
    if (!shape) return end.x != null ? { x: end.x, y: end.y } : null;
    if (typeof end.pt === 'number') {
      const points = pagePoints(shape);
      if (points[end.pt]) return points[end.pt];
    }
    return center(shape);
  }
  return { x: end.x ?? 0, y: end.y ?? 0 };
}

/** Bounding box of the given shapes, or of everything on the page. */
export function contentBounds(page, ids = null, routeOf = null) {
  const set = ids ? new Set(ids) : null;
  return unionBounds(page.shapes.filter((shape) => (!set || set.has(shape.id)) && !isGroup(shape)).map((shape) => boundsOfShape(page, shape, routeOf)));
}

/** The drawing area: the page, grown by whole pages to the right / down when shapes lie beyond it (auto size). */
export function drawingSize(page, routeOf = null) {
  if (!page.autoSize) return { width: page.width, height: page.height, tilesX: 1, tilesY: 1 };
  const b = contentBounds(page, null, routeOf);
  const tilesX = b ? Math.max(1, Math.ceil((b.x + b.w - 0.5) / page.width)) : 1;
  const tilesY = b ? Math.max(1, Math.ceil((b.y + b.h - 0.5) / page.height)) : 1;
  return { width: page.width * tilesX, height: page.height * tilesY, tilesX, tilesY };
}

// ───────────────────────── adding & deleting

export function addShape(page, shape, index = page.shapes.length) {
  if (page.activeLayer && !shape.layers?.length) shape.layers = [page.activeLayer];
  page.shapes.splice(Math.max(0, Math.min(index, page.shapes.length)), 0, shape);
  return shape;
}

/** Deletes shapes (with their group members) and the connectors glued to them. Returns how many went. */
export function deleteShapes(page, ids) {
  const doomed = new Set(withMembers(page, ids));
  for (const shape of page.shapes) {
    if (isConnector(shape) && ((shape.from?.id && doomed.has(shape.from.id)) || (shape.to?.id && doomed.has(shape.to.id)))) doomed.add(shape.id);
  }
  const before = page.shapes.length;
  page.shapes = page.shapes.filter((shape) => !doomed.has(shape.id));
  // A group left with fewer than two members dissolves.
  for (const group of page.shapes.filter(isGroup)) {
    const members = membersOf(page, group.id);
    if (members.length < 2) {
      for (const member of members) member.groupId = group.groupId ?? null;
      page.shapes = page.shapes.filter((shape) => shape.id !== group.id);
    }
  }
  refreshGroups(page);
  return before - page.shapes.length;
}

// ───────────────────────── moving, sizing, rotating

/** Moves shapes (and group members); connectors move their free ends and bends when both ends move. */
export function moveShapes(page, ids, dx, dy) {
  if (!dx && !dy) return 0;
  const moving = new Set(withMembers(page, ids));
  let count = 0;
  for (const shape of page.shapes) {
    if (!moving.has(shape.id)) continue;
    if (isConnector(shape)) {
      for (const end of [shape.from, shape.to]) if (!end.id || !moving.has(end.id)) { if (!end.id) { end.x += dx; end.y += dy; } }
      shape.waypoints = (shape.waypoints ?? []).map((p) => ({ x: p.x + dx, y: p.y + dy }));
    } else {
      shape.x += dx;
      shape.y += dy;
    }
    count += 1;
  }
  // Connectors glued at both ends to moving shapes carry their bends along.
  for (const shape of page.shapes) {
    if (!isConnector(shape) || moving.has(shape.id) || !shape.waypoints?.length) continue;
    if (shape.from.id && shape.to.id && moving.has(shape.from.id) && moving.has(shape.to.id)) shape.waypoints = shape.waypoints.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  }
  refreshGroups(page);
  return count;
}

/** Sets a 2-D shape's box (a group scales its members). */
export function setBox(page, id, box) {
  const shape = findShape(page, id);
  if (!shape || isConnector(shape)) return;
  const w = Math.max(1, box.w);
  const h = Math.max(1, box.h);
  if (isGroup(shape)) {
    const sx = w / (shape.w || 1);
    const sy = h / (shape.h || 1);
    for (const memberId of withMembers(page, [id]).slice(1)) {
      const member = findShape(page, memberId);
      if (isConnector(member)) {
        for (const end of [member.from, member.to]) if (!end.id) { end.x = box.x + (end.x - shape.x) * sx; end.y = box.y + (end.y - shape.y) * sy; }
        member.waypoints = (member.waypoints ?? []).map((p) => ({ x: box.x + (p.x - shape.x) * sx, y: box.y + (p.y - shape.y) * sy }));
      } else if (!isGroup(member)) {
        member.x = box.x + (member.x - shape.x) * sx;
        member.y = box.y + (member.y - shape.y) * sy;
        member.w *= sx;
        member.h *= sy;
      }
    }
  }
  Object.assign(shape, { x: box.x, y: box.y, w, h });
  refreshGroups(page);
}

/** Rotates shapes by `degrees` around the centre of their selection (each shape turns too). */
export function rotateShapes(page, ids, degrees, pivot = null) {
  const list = withMembers(page, ids).map((id) => findShape(page, id)).filter((shape) => shape && !isGroup(shape));
  if (!list.length) return;
  const c = pivot ?? center(contentBounds(page, list.map((shape) => shape.id)) ?? { x: 0, y: 0, w: 0, h: 0 });
  for (const shape of list) {
    if (isConnector(shape)) {
      for (const end of [shape.from, shape.to]) if (!end.id) Object.assign(end, rotatePoint(end, c, degrees));
      shape.waypoints = (shape.waypoints ?? []).map((p) => rotatePoint(p, c, degrees));
      continue;
    }
    const at = rotatePoint(center(shape), c, degrees);
    shape.x = at.x - shape.w / 2;
    shape.y = at.y - shape.h / 2;
    shape.angle = normalizeAngle((shape.angle ?? 0) + degrees);
  }
  refreshGroups(page);
}

export const normalizeAngle = (angle) => {
  const a = ((Number(angle) % 360) + 360) % 360;
  return Math.round(a * 100) / 100;
};

export function setAngle(page, ids, angle) {
  for (const id of ids) {
    const shape = findShape(page, id);
    if (shape && !isConnector(shape) && !isGroup(shape)) shape.angle = normalizeAngle(angle);
  }
}

/** Flips shapes horizontally or vertically within their selection box. */
export function flipShapes(page, ids, axis) {
  const all = withMembers(page, ids).map((id) => findShape(page, id)).filter(Boolean);
  const box = contentBounds(page, all.map((shape) => shape.id));
  if (!box) return;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  for (const shape of all) {
    if (isGroup(shape)) continue;
    if (isConnector(shape)) {
      for (const end of [shape.from, shape.to]) if (!end.id) { if (axis === 'h') end.x = 2 * cx - end.x; else end.y = 2 * cy - end.y; }
      shape.waypoints = (shape.waypoints ?? []).map((p) => (axis === 'h' ? { x: 2 * cx - p.x, y: p.y } : { x: p.x, y: 2 * cy - p.y }));
      continue;
    }
    if (axis === 'h') { shape.x = 2 * cx - shape.x - shape.w; shape.flipH = !shape.flipH; } else { shape.y = 2 * cy - shape.y - shape.h; shape.flipV = !shape.flipV; }
    if (shape.angle) shape.angle = normalizeAngle(-shape.angle);
  }
  refreshGroups(page);
}

// ───────────────────────── groups

/** Recomputes every group's box from its members (deepest first). */
export function refreshGroups(page, routeOf = null) {
  const groups = page.shapes.filter(isGroup);
  const depth = (group) => { let d = 0; let g = group; while (g?.groupId) { d += 1; g = findShape(page, g.groupId); if (d > 50) break; } return d; };
  for (const group of groups.sort((a, b) => depth(b) - depth(a))) {
    const members = membersOf(page, group.id);
    const box = unionBounds(members.map((member) => (isGroup(member) ? { x: member.x, y: member.y, w: member.w, h: member.h } : boundsOfShape(page, member, routeOf))));
    if (box) Object.assign(group, { x: box.x, y: box.y, w: Math.max(1, box.w), h: Math.max(1, box.h) });
  }
}

/** Groups top-level shapes into a new group placed where the front-most of them was. */
export function groupShapes(page, ids) {
  const tops = [...new Set(ids.map((id) => topLevel(page, id)?.id).filter(Boolean))];
  if (tops.length < 2) return null;
  const group = { id: newId('grp'), type: 'group', master: 'group', name: '', x: 0, y: 0, w: 1, h: 1, angle: 0, flipH: false, flipV: false, text: '', style: {}, qs: {}, params: {}, layers: [], locked: {}, data: [], hyperlink: '', comments: [], groupId: null, showData: false };
  const indexes = tops.map((id) => shapeIndex(page, id));
  // Members move together just below the group record, keeping their order.
  const memberIds = new Set(withMembers(page, tops));
  const moved = page.shapes.filter((shape) => memberIds.has(shape.id));
  page.shapes = page.shapes.filter((shape) => !memberIds.has(shape.id));
  const at = Math.min(Math.max(...indexes) - moved.length + 1, page.shapes.length);
  for (const id of tops) findShape({ shapes: moved }, id).groupId = group.id;
  page.shapes.splice(Math.max(0, at), 0, ...moved, group);
  refreshGroups(page);
  return group;
}

/** Ungroups groups; returns the ids of the former members. */
export function ungroupShapes(page, ids) {
  const out = [];
  for (const id of ids) {
    const group = findShape(page, id);
    if (!isGroup(group)) continue;
    for (const member of membersOf(page, id)) { member.groupId = group.groupId ?? null; out.push(member.id); }
    page.shapes = page.shapes.filter((shape) => shape.id !== id);
  }
  refreshGroups(page);
  return out;
}

// ───────────────────────── containers

/** Shapes lying inside a container (kept with it when it moves): in front of it and wholly inside its box. */
export function containedShapes(page, containerId) {
  const container = findShape(page, containerId);
  if (!container || masterById(container.master).kind !== 'container') return [];
  const box = shapeBounds(container);
  const index = shapeIndex(page, containerId);
  return page.shapes.filter((shape, i) => i > index && !isConnector(shape) && !shape.groupId && shape.id !== containerId && rectInside(shapeBounds(shape), box)).map((shape) => shape.id);
}

// ───────────────────────── arranging

const boxOf = (page, id) => { const shape = findShape(page, id); return shape ? (isConnector(shape) ? contentBounds(page, [id]) : shapeBounds(shape)) : null; };

/** Aligns shapes to the first selected one (Visio aligns to the primary selection). */
export function alignShapes(page, ids, how) {
  const tops = [...new Set(ids.map((id) => topLevel(page, id)?.id).filter(Boolean))].filter((id) => !isConnector(findShape(page, id)));
  if (tops.length < 2) return 0;
  const ref = boxOf(page, tops[0]);
  let moved = 0;
  for (const id of tops.slice(1)) {
    const b = boxOf(page, id);
    let dx = 0; let dy = 0;
    if (how === 'left') dx = ref.x - b.x;
    if (how === 'center') dx = ref.x + ref.w / 2 - (b.x + b.w / 2);
    if (how === 'right') dx = ref.x + ref.w - (b.x + b.w);
    if (how === 'top') dy = ref.y - b.y;
    if (how === 'middle') dy = ref.y + ref.h / 2 - (b.y + b.h / 2);
    if (how === 'bottom') dy = ref.y + ref.h - (b.y + b.h);
    if (dx || dy) { moveShapes(page, [id], dx, dy); moved += 1; }
  }
  return moved;
}

/** Spreads shapes so the gaps between them are equal (horizontal 'h' or vertical 'v'). */
export function distributeShapes(page, ids, axis) {
  const tops = [...new Set(ids.map((id) => topLevel(page, id)?.id).filter(Boolean))].filter((id) => !isConnector(findShape(page, id)));
  if (tops.length < 3) return 0;
  const items = tops.map((id) => ({ id, b: boxOf(page, id) })).sort((a, b) => (axis === 'h' ? a.b.x - b.b.x : a.b.y - b.b.y));
  const first = items[0].b;
  const last = items[items.length - 1].b;
  const span = axis === 'h' ? last.x + last.w - first.x : last.y + last.h - first.y;
  const used = items.reduce((sum, item) => sum + (axis === 'h' ? item.b.w : item.b.h), 0);
  const gap = (span - used) / (items.length - 1);
  let at = axis === 'h' ? first.x : first.y;
  for (const item of items) {
    const delta = at - (axis === 'h' ? item.b.x : item.b.y);
    if (Math.abs(delta) > 0.01) moveShapes(page, [item.id], axis === 'h' ? delta : 0, axis === 'v' ? delta : 0);
    at += (axis === 'h' ? item.b.w : item.b.h) + gap;
  }
  return items.length;
}

/** Makes shapes the width and / or height of the first one. */
export function sameSize(page, ids, which = 'both') {
  const list = ids.map((id) => findShape(page, id)).filter((shape) => shape && !isConnector(shape));
  if (list.length < 2) return 0;
  const ref = list[0];
  for (const shape of list.slice(1)) {
    const c = center(shape);
    const w = which === 'height' ? shape.w : ref.w;
    const h = which === 'width' ? shape.h : ref.h;
    setBox(page, shape.id, { x: c.x - w / 2, y: c.y - h / 2, w, h });
  }
  return list.length - 1;
}

/** Bring to front / send to back / forward / backward (groups move with their members). */
export function reorder(page, ids, how) {
  const moving = new Set(withMembers(page, ids.map((id) => topLevel(page, id)?.id).filter(Boolean)));
  if (!moving.size) return;
  const picked = page.shapes.filter((shape) => moving.has(shape.id));
  const rest = page.shapes.filter((shape) => !moving.has(shape.id));
  if (how === 'front') { page.shapes = [...rest, ...picked]; return; }
  if (how === 'back') { page.shapes = [...picked, ...rest]; return; }
  // Forward / backward: past the next overlapping top-level shape.
  const firstIndex = page.shapes.findIndex((shape) => moving.has(shape.id));
  const lastIndex = page.shapes.length - 1 - [...page.shapes].reverse().findIndex((shape) => moving.has(shape.id));
  const box = contentBounds(page, [...moving]);
  const overlaps = (shape) => { const b = boundsOfShape(page, shape); return box && b && b.x < box.x + box.w && box.x < b.x + b.w && b.y < box.y + box.h && box.y < b.y + b.h; };
  if (how === 'forward') {
    let target = page.shapes.findIndex((shape, i) => i > lastIndex && !shape.groupId && overlaps(shape));
    if (target < 0) target = lastIndex + 1;
    const anchor = page.shapes[Math.min(target, page.shapes.length - 1)];
    const anchorMembers = new Set(withMembers(page, [anchor.id]));
    const insertAfter = Math.max(...page.shapes.map((shape, i) => (anchorMembers.has(shape.id) ? i : -1)));
    const after = page.shapes[insertAfter];
    const at = rest.indexOf(after) + 1;
    page.shapes = [...rest.slice(0, at), ...picked, ...rest.slice(at)];
  } else if (how === 'backward') {
    let target = -1;
    for (let i = firstIndex - 1; i >= 0; i--) if (!page.shapes[i].groupId && overlaps(page.shapes[i])) { target = i; break; }
    if (target < 0) target = firstIndex - 1;
    if (target < 0) return;
    const anchor = page.shapes[target];
    const anchorMembers = new Set(withMembers(page, [anchor.id]));
    const before = page.shapes.find((shape) => anchorMembers.has(shape.id));
    const at = rest.indexOf(before);
    page.shapes = [...rest.slice(0, at), ...picked, ...rest.slice(at)];
  }
}

// ───────────────────────── styles, text, data

/** Patches the style of shapes; null / undefined values go back to the design. */
export function setStyle(page, ids, patch) {
  for (const id of withMembers(page, ids)) {
    const shape = findShape(page, id);
    if (!shape || isGroup(shape)) continue;
    shape.style = { ...(shape.style ?? {}) };
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === undefined) delete shape.style[key];
      else shape.style[key] = value;
    }
  }
}

export function clearStyle(page, ids) {
  for (const id of withMembers(page, ids)) { const shape = findShape(page, id); if (shape) { shape.style = {}; shape.qs = {}; } }
}

export function setQuickStyle(page, ids, qs) {
  for (const id of withMembers(page, ids)) {
    const shape = findShape(page, id);
    if (!shape || isConnector(shape) || isGroup(shape)) continue;
    shape.qs = { ...(shape.qs ?? {}), ...qs };
    for (const key of ['fill', 'fill2', 'fillPattern', 'line', 'textColor']) delete shape.style?.[key];
  }
}

export function setText(page, id, text) {
  const shape = findShape(page, id);
  if (shape) shape.text = String(text ?? '');
}

/** Shape data fields: [{ key, label, type, value, options? }]. */
export const DATA_TYPES = ['text', 'number', 'currency', 'date', 'bool', 'list'];
export function normalizeData(fields) {
  return (Array.isArray(fields) ? fields : []).filter((f) => f && String(f.key ?? f.label ?? '').trim()).map((f) => ({
    key: String(f.key ?? f.label).trim(), label: String(f.label ?? f.key).trim(), type: DATA_TYPES.includes(f.type) ? f.type : 'text',
    value: f.value == null ? '' : String(f.value), options: Array.isArray(f.options) ? f.options.map(String) : [],
  }));
}
export const dataValue = (shape, key) => shape?.data?.find((f) => f.key === key || f.label === key)?.value ?? '';

/** Every data key used on the given pages (for the data table and reports). */
export function dataKeys(pages) {
  const keys = [];
  for (const page of pages) for (const shape of page.shapes) for (const f of shape.data ?? []) if (!keys.includes(f.key)) keys.push(f.key);
  return keys;
}

// ───────────────────────── layers

export function addLayer(page, name) {
  const layer = createLayer(name);
  page.layers.push(layer);
  return layer;
}

export function deleteLayer(page, layerId, { deleteShapes: removeShapes = false } = {}) {
  page.layers = page.layers.filter((layer) => layer.id !== layerId);
  if (page.activeLayer === layerId) page.activeLayer = null;
  if (removeShapes) deleteShapes(page, page.shapes.filter((shape) => shape.layers?.includes(layerId) && shape.layers.length === 1).map((shape) => shape.id));
  for (const shape of page.shapes) if (shape.layers?.includes(layerId)) shape.layers = shape.layers.filter((id) => id !== layerId);
}

/** Puts shapes on a layer (only), adds them to it, or takes them off. */
export function assignLayer(page, ids, layerId, mode = 'only') {
  for (const id of withMembers(page, ids)) {
    const shape = findShape(page, id);
    if (!shape) continue;
    const list = shape.layers ?? [];
    if (mode === 'only') shape.layers = layerId ? [layerId] : [];
    else if (mode === 'add' && !list.includes(layerId)) shape.layers = [...list, layerId];
    else if (mode === 'remove') shape.layers = list.filter((x) => x !== layerId);
  }
}

// ───────────────────────── pages

export function uniquePageName(doc, base) {
  const names = new Set(doc.pages.map((page) => page.name));
  if (!names.has(base)) return base;
  const stem = base.replace(/-\d+$/, '');
  for (let i = 2; i < 1000; i++) if (!names.has(`${stem}-${i}`)) return `${stem}-${i}`;
  return `${stem}-${Date.now()}`;
}

export function addPage(doc, options = {}, index = doc.pages.length) {
  const ref = doc.pages[Math.max(0, Math.min(index, doc.pages.length) - 1)] ?? doc.pages[0];
  const page = createPage({ paper: ref?.paper === 'custom' ? 'A4' : ref?.paper, orientation: ref?.orientation, width: ref?.width, height: ref?.height, ...options });
  page.name = uniquePageName(doc, options.name ?? page.name);
  if (ref && !options.background) { page.backgroundId = ref.backgroundId; page.autoSize = ref.autoSize; page.grid = ref.grid; }
  doc.pages.splice(index, 0, page);
  return page;
}

/** A copy of a page with new ids (glue and groups follow the new ids). */
export function duplicatePage(doc, pageId) {
  const source = pageById(doc, pageId);
  if (!source) return null;
  const copy = clone(source);
  copy.id = newId('page');
  copy.name = uniquePageName(doc, `${source.name}-2`);
  const map = new Map();
  for (const shape of copy.shapes) { const id = newId(shape.type === 'connector' ? 'con' : shape.type === 'group' ? 'grp' : 'shp'); map.set(shape.id, id); shape.id = id; }
  for (const layer of copy.layers) { const id = newId('layer'); map.set(layer.id, id); layer.id = id; }
  copy.activeLayer = copy.activeLayer ? map.get(copy.activeLayer) ?? null : null;
  for (const shape of copy.shapes) {
    if (shape.groupId) shape.groupId = map.get(shape.groupId) ?? null;
    shape.layers = (shape.layers ?? []).map((id) => map.get(id)).filter(Boolean);
    if (isConnector(shape)) for (const end of [shape.from, shape.to]) if (end.id) end.id = map.get(end.id) ?? end.id;
  }
  doc.pages.splice(doc.pages.indexOf(source) + 1, 0, copy);
  return copy;
}

export function deletePage(doc, pageId) {
  if (doc.pages.length <= 1) return false;
  doc.pages = doc.pages.filter((page) => page.id !== pageId);
  for (const page of doc.pages) if (page.backgroundId === pageId) page.backgroundId = null;
  return true;
}

export function movePage(doc, pageId, index) {
  const from = doc.pages.findIndex((page) => page.id === pageId);
  if (from < 0) return;
  const [page] = doc.pages.splice(from, 1);
  doc.pages.splice(Math.max(0, Math.min(index, doc.pages.length)), 0, page);
}

/** Foreground pages first, then background pages (Visio keeps them at the end). */
export const foregroundPages = (doc) => doc.pages.filter((page) => !page.background);
export const backgroundPages = (doc) => doc.pages.filter((page) => page.background);

// ───────────────────────── guides

export function addGuide(page, orient, pos) {
  const guide = { id: newId('guide'), orient, pos };
  page.guides = [...(page.guides ?? []), guide];
  return guide;
}

// ───────────────────────── clipboard

export const CLIP_MARK = 'mydiagram/shapes';

/** A copy of shapes (and group members, and connectors among them) for pasting. */
export function copyShapes(page, ids) {
  const set = new Set(withMembers(page, ids.map((id) => topLevel(page, id)?.id).filter(Boolean)));
  // Connectors whose both ends are copied come along.
  for (const shape of page.shapes) if (isConnector(shape) && shape.from.id && shape.to.id && set.has(shape.from.id) && set.has(shape.to.id)) set.add(shape.id);
  const shapes = page.shapes.filter((shape) => set.has(shape.id)).map((shape) => {
    const copy = clone(shape);
    // A connector glued to a shape that is not copied keeps its position as a free end.
    if (isConnector(copy)) for (const key of ['from', 'to']) if (copy[key].id && !set.has(copy[key].id)) copy[key] = { ...endPosition(page, shape[key]) };
    return copy;
  });
  return { mark: CLIP_MARK, shapes, bounds: contentBounds(page, [...set]) };
}

/** Pastes a copy (new ids) offset by dx, dy; returns the new top-level ids. */
export function pasteShapes(page, clip, { dx = 20, dy = 20, at = null } = {}) {
  if (!clip?.shapes?.length) return [];
  const map = new Map();
  const shapes = clip.shapes.map((shape) => { const copy = clone(shape); const id = newId(isConnector(copy) ? 'con' : isGroup(copy) ? 'grp' : 'shp'); map.set(copy.id, id); copy.id = id; return copy; });
  let ox = dx; let oy = dy;
  if (at && clip.bounds) { ox = at.x - (clip.bounds.x + clip.bounds.w / 2); oy = at.y - (clip.bounds.y + clip.bounds.h / 2); }
  const layerIds = new Set(page.layers.map((layer) => layer.id));
  for (const shape of shapes) {
    shape.groupId = shape.groupId ? map.get(shape.groupId) ?? null : null;
    shape.layers = (shape.layers ?? []).filter((id) => layerIds.has(id));
    if (isConnector(shape)) {
      for (const end of [shape.from, shape.to]) { if (end.id) end.id = map.get(end.id) ?? null; else { end.x += ox; end.y += oy; } }
      shape.waypoints = (shape.waypoints ?? []).map((p) => ({ x: p.x + ox, y: p.y + oy }));
    } else { shape.x += ox; shape.y += oy; }
    page.shapes.push(shape);
  }
  refreshGroups(page);
  return shapes.filter((shape) => !shape.groupId).map((shape) => shape.id);
}

// ───────────────────────── find & replace

const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function textMatcher(query, { matchCase = false, whole = false } = {}) {
  if (!query) return null;
  const source = whole ? `(?<![\\p{L}\\p{N}_])${escapeRegex(query)}(?![\\p{L}\\p{N}_])` : escapeRegex(query);
  return new RegExp(source, `gu${matchCase ? '' : 'i'}`);
}

/** Shapes whose text (or data values / name) matches: [{ pageId, id }] in page and z order. */
export function findMatches(doc, query, { matchCase = false, whole = false, data = true, pageId = null } = {}) {
  const re = textMatcher(query, { matchCase, whole });
  if (!re) return [];
  const out = [];
  for (const page of doc.pages) {
    if (pageId && page.id !== pageId) continue;
    for (const shape of page.shapes) {
      const texts = [shape.text ?? '', shape.name ?? '', ...(data ? (shape.data ?? []).map((f) => f.value) : [])];
      re.lastIndex = 0;
      if (texts.some((text) => { re.lastIndex = 0; return re.test(text); })) out.push({ pageId: page.id, id: shape.id });
    }
  }
  return out;
}

/** Replaces text in shape text (all pages or one); returns how many shapes changed. */
export function replaceText(doc, query, replacement, options = {}) {
  const re = textMatcher(query, options);
  if (!re) return 0;
  let count = 0;
  for (const page of doc.pages) {
    if (options.pageId && page.id !== options.pageId) continue;
    for (const shape of page.shapes) {
      const before = shape.text ?? '';
      const after = before.replace(re, replacement ?? '');
      if (after !== before) { shape.text = after; count += 1; }
    }
  }
  return count;
}

// ───────────────────────── statistics

export function statistics(doc) {
  let shapes = 0; let connectors = 0; let groups = 0; let texts = 0; let data = 0; let comments = 0;
  const byMaster = new Map();
  for (const page of doc.pages) {
    comments += page.comments?.length ?? 0;
    for (const shape of page.shapes) {
      if (isConnector(shape)) connectors += 1;
      else if (isGroup(shape)) groups += 1;
      else { shapes += 1; byMaster.set(shape.master, (byMaster.get(shape.master) ?? 0) + 1); }
      if (shape.text?.trim()) texts += 1;
      if (shape.data?.length) data += 1;
      comments += shape.comments?.length ?? 0;
    }
  }
  return { pages: doc.pages.length, shapes, connectors, groups, texts, data, comments, byMaster };
}

/** The connector graph of a page: nodes = 2-D shape ids, edges = [{ from, to, id }]. */
export function connectionGraph(page) {
  const edges = [];
  for (const shape of page.shapes) {
    if (!isConnector(shape) || !shape.from.id || !shape.to.id) continue;
    const a = topLevel(page, shape.from.id)?.id;
    const b = topLevel(page, shape.to.id)?.id;
    if (a && b && a !== b) edges.push({ from: a, to: b, id: shape.id });
  }
  return edges;
}

/** Corners of shape on page (used by hit tests of rotated shapes). */
export const shapeCorners = (shape) => corners(shape);
export { shapeParams };

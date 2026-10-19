// Mind maps the MindManager way. Topics (MMNode) form a tree in the model: a subtopic is owned by
// its parent topic, and the topic whose owner is not a topic is the central topic. The diagram
// shows each topic once, joined to its parent by a branch (MMEdgeView, a line without a model
// element). Here: adding subtopics (Insert / Tab) and topics beside one (Enter), collapsing and
// expanding branches, and laying a map out (map: main topics on both sides of the central topic;
// right / left: all on one side; down: an org chart; free: never moved). Pure (no DOM).
import { addView, buildIndex, createEdgeView, createElement, createNodeView, insertElement, isEdgeView, refId, siblingsIn, viewsOf } from './model.js';

export const MIND_LAYOUTS = ['map', 'right', 'left', 'down', 'free'];
/** Markers a topic can carry (MMNode `marker`), drawn before its text. */
export const MIND_MARKERS = ['', 'flag', 'star', 'check', 'question', 'warning', 'idea', 'heart', 'smile'];

const H_GAP = 46;
const V_GAP = 12;
const CENTRAL_GAP = 70;
const DOWN_GAP = 56;

export const isTopic = (element) => element?._type === 'MMNode';
const topicsOf = (element) => (element?.ownedElements ?? []).filter(isTopic);

/** The view of each topic on the diagram (topic id → node view). */
export function topicViews(diagram, index) {
  const map = new Map();
  for (const view of viewsOf(diagram)) {
    if (isEdgeView(view) || !view.model) continue;
    const element = index.get(refId(view.model));
    if (isTopic(element) && !map.has(element._id)) map.set(element._id, view);
  }
  return map;
}

/** The central topic of a topic (its outermost topic ancestor, or itself). */
export function centralTopic(index, element) {
  let top = element;
  for (let parent = index.parent(top._id); isTopic(parent); parent = index.parent(parent._id)) top = parent;
  return top;
}

/** The main topic (child of the central topic) a topic belongs to; null for a central topic. */
function mainTopic(index, element) {
  let top = element;
  let parent = index.parent(top._id);
  if (!isTopic(parent)) return null;
  while (isTopic(index.parent(parent._id))) { top = parent; parent = index.parent(parent._id); }
  return top;
}

/** Number of topics under a topic (all levels). */
export function descendantCount(element) {
  return topicsOf(element).reduce((sum, child) => sum + 1 + descendantCount(child), 0);
}

/**
 * Views hidden because a topic above them is collapsed (MMNode `collapsed`), and the branches
 * that touch them. The renderer leaves them out; they stay in the model and on the diagram.
 */
export function hiddenViews(diagram, index) {
  const hidden = new Set();
  if (!diagram || !viewsOf(diagram).length) return hidden;
  const views = topicViews(diagram, index);
  const hideBelow = (element) => {
    for (const child of topicsOf(element)) {
      const view = views.get(child._id);
      if (view) hidden.add(view._id);
      hideBelow(child);
    }
  };
  for (const id of views.keys()) {
    const element = index.get(id);
    if (element.collapsed && topicsOf(element).length) hideBelow(element);
  }
  if (!hidden.size) return hidden;
  for (const view of viewsOf(diagram)) if (isEdgeView(view) && (hidden.has(refId(view.tail)) || hidden.has(refId(view.head)))) hidden.add(view._id);
  return hidden;
}

/**
 * Which side of the central topic a topic grows to: -1 left, 1 right. A main topic's `direction`
 * decides; "auto" follows where its view is. Deeper topics take their main topic's side.
 */
export function sideOf(index, views, element, layout = 'map') {
  if (layout === 'right' || layout === 'down') return 1;
  if (layout === 'left') return -1;
  const main = mainTopic(index, element);
  if (!main) return 1;
  if (main.direction === 'left') return -1;
  if (main.direction === 'right') return 1;
  const view = views.get(main._id);
  const center = views.get(centralTopic(index, element)._id);
  if (!view || !center) return 1;
  return view.left + (view.width || 0) / 2 < center.left + (center.width || 0) / 2 ? -1 : 1;
}

/**
 * Adds a topic beside the topic of view `viewId`: `where` 'child' adds a subtopic (MindManager's
 * Insert / Tab), 'sibling' a topic after it under the same parent (Enter; on the central topic it
 * adds a main topic). A collapsed parent opens. Returns { element, view } or null.
 */
export function addTopic(project, diagram, viewId, where = 'child', { language = 'en', name = null } = {}) {
  const index = buildIndex(project);
  const view = viewsOf(diagram).find((v) => v._id === viewId);
  const topic = view?.model ? index.get(refId(view.model)) : null;
  if (!isTopic(topic)) return null;
  const parentOfTopic = index.parent(topic._id);
  const parent = where === 'sibling' && isTopic(parentOfTopic) ? parentOfTopic : topic;
  const siblings = siblingsIn(parent, 'MMNode');
  const position = parent === topic ? null : siblings.indexOf(topic) + 1;
  for (let above = parent; isTopic(above); above = index.parent(above._id)) if (above.collapsed) delete above.collapsed;
  const attrs = name ? { name } : {};
  // A new main topic beside one with a fixed side stays on that side.
  if (parent !== topic && !isTopic(index.parent(parent._id)) && topic.direction && topic.direction !== 'auto') attrs.direction = topic.direction;
  const element = insertElement(parent, createElement('MMNode', attrs, { language, siblings }), position);
  const views = topicViews(diagram, index);
  const parentView = views.get(parent._id) ?? view;
  // Until the map is laid out: beside the parent, below its last shown subtopic.
  const side = parent === topic && !isTopic(parentOfTopic) ? 1 : sideOf(index, views, topic, diagram.mindLayout ?? 'map');
  const shownKids = topicsOf(parent).filter((child) => child !== element && views.has(child._id)).map((child) => views.get(child._id));
  const below = shownKids.length ? Math.max(...shownKids.map((v) => v.top + (v.height || 34))) + V_GAP : parentView.top;
  const x = side > 0 ? parentView.left + (parentView.width || 120) + H_GAP : parentView.left - H_GAP - 120;
  const newView = addView(diagram, createNodeView('MMNodeView', element._id, { x: Math.max(0, x), y: Math.max(0, below), w: 0, h: 0 }));
  addView(diagram, createEdgeView('MMEdgeView', null, parentView._id, newView._id));
  return { element, view: newView };
}

/** Collapses or expands a topic's branch (MindManager's +/−). Returns the new state, or null. */
export function toggleCollapsed(project, topicId, collapsed = null) {
  const element = buildIndex(project).get(topicId);
  if (!isTopic(element) || !topicsOf(element).length) return null;
  const next = collapsed ?? !element.collapsed;
  if (next) element.collapsed = true; else delete element.collapsed;
  return next;
}

/** Collapses (or expands) every topic with subtopics at `level` and below (1 = main topics). */
export function collapseToLevel(project, diagram, level) {
  const index = buildIndex(project);
  let changed = 0;
  for (const id of topicViews(diagram, index).keys()) {
    const element = index.get(id);
    if (!topicsOf(element).length) continue;
    let depth = 0;
    for (let parent = index.parent(id); isTopic(parent); parent = index.parent(parent._id)) depth++;
    const want = depth >= level;
    if (Boolean(element.collapsed) !== want) { if (want) element.collapsed = true; else delete element.collapsed; changed++; }
  }
  return changed;
}

/**
 * Lays the map out (diagram `mindLayout`, or `layout`): each central topic stays where it is and
 * its topics are arranged around it so that no two branches overlap. Branches lose their bends.
 * `boxes` are the rendered sizes (view id → { w, h }); without them the views' own sizes are used.
 * Returns the number of moved views.
 */
export function layoutMindmap(project, diagram, boxes = new Map(), { layout = diagram?.mindLayout ?? 'map' } = {}) {
  if (!diagram || layout === 'free') return 0;
  const index = buildIndex(project);
  const views = topicViews(diagram, index);
  const size = (element) => {
    const view = views.get(element._id);
    const box = view && boxes.get(view._id);
    return { w: box?.w ?? (view?.width || 120), h: box?.h ?? (view?.height || 34) };
  };
  const kidsOf = (element) => (element.collapsed ? [] : topicsOf(element).filter((child) => views.has(child._id)));
  let moved = 0;
  const place = (element, x, y) => {
    const view = views.get(element._id);
    const left = Math.max(0, Math.round(x));
    const top = Math.max(0, Math.round(y));
    if (view.left !== left || view.top !== top) { view.left = left; view.top = top; moved++; }
  };

  // Sideways trees: each topic is centred on the height of its branch.
  const span = new Map();
  const heightOf = (element) => {
    const kids = kidsOf(element);
    const kidsH = kids.reduce((sum, child) => sum + heightOf(child), 0) + Math.max(0, kids.length - 1) * V_GAP;
    const h = Math.max(size(element).h, kidsH);
    span.set(element._id, h);
    return h;
  };
  const placeSideways = (element, edgeX, top, dir) => {
    const s = size(element);
    const h = span.get(element._id);
    const left = dir > 0 ? edgeX : edgeX - s.w;
    place(element, left, top + (h - s.h) / 2);
    const kids = kidsOf(element);
    const kidsH = kids.reduce((sum, child) => sum + span.get(child._id), 0) + Math.max(0, kids.length - 1) * V_GAP;
    let y = top + (h - kidsH) / 2;
    const next = dir > 0 ? left + s.w + H_GAP : left - H_GAP;
    for (const child of kids) { placeSideways(child, next, y, dir); y += span.get(child._id) + V_GAP; }
  };

  // Org chart: each topic is centred over the width of its branch.
  const spanW = new Map();
  const widthOf = (element) => {
    const kids = kidsOf(element);
    const kidsW = kids.reduce((sum, child) => sum + widthOf(child), 0) + Math.max(0, kids.length - 1) * (H_GAP / 2);
    const w = Math.max(size(element).w, kidsW);
    spanW.set(element._id, w);
    return w;
  };
  const placeDown = (element, left, top) => {
    const s = size(element);
    const w = spanW.get(element._id);
    place(element, left + (w - s.w) / 2, top);
    const kids = kidsOf(element);
    const kidsW = kids.reduce((sum, child) => sum + spanW.get(child._id), 0) + Math.max(0, kids.length - 1) * (H_GAP / 2);
    let x = left + (w - kidsW) / 2;
    for (const child of kids) { placeDown(child, x, top + s.h + DOWN_GAP); x += spanW.get(child._id) + H_GAP / 2; }
  };

  const centrals = [...views.keys()].map((id) => index.get(id)).filter((element) => !isTopic(index.parent(element._id)));
  for (const central of centrals) {
    const view = views.get(central._id);
    const c = size(central);
    const cx = view.left + c.w / 2;
    const cy = view.top + c.h / 2;
    const mains = kidsOf(central);
    if (layout === 'down') {
      const total = mains.reduce((sum, child) => sum + widthOf(child), 0) + Math.max(0, mains.length - 1) * (H_GAP / 2);
      let x = cx - total / 2;
      for (const child of mains) { placeDown(child, x, view.top + c.h + DOWN_GAP); x += spanW.get(child._id) + H_GAP / 2; }
      continue;
    }
    for (const child of mains) heightOf(child);
    const right = []; const left = [];
    let rightH = 0; let leftH = 0;
    for (const child of mains) {
      let dir;
      if (layout === 'right') dir = 1;
      else if (layout === 'left') dir = -1;
      else if (child.direction === 'left' || child.direction === 'right') dir = child.direction === 'left' ? -1 : 1;
      // Automatic: to the lighter side, the right first (clockwise, as MindManager starts).
      else dir = rightH <= leftH ? 1 : -1;
      (dir > 0 ? right : left).push(child);
      if (dir > 0) rightH += span.get(child._id) + V_GAP; else leftH += span.get(child._id) + V_GAP;
    }
    const column = (list, dir) => {
      const total = list.reduce((sum, child) => sum + span.get(child._id), 0) + Math.max(0, list.length - 1) * V_GAP;
      let y = cy - total / 2;
      const edgeX = dir > 0 ? view.left + c.w + CENTRAL_GAP : view.left - CENTRAL_GAP;
      for (const child of list) { placeSideways(child, edgeX, y, dir); y += span.get(child._id) + V_GAP; }
    };
    column(right, 1);
    column(left, -1);
  }
  // Branches follow their topics.
  const shown = new Set([...views.values()].map((view) => view._id));
  for (const view of viewsOf(diagram)) if (view._type === 'MMEdgeView' && shown.has(refId(view.tail)) && shown.has(refId(view.head)) && view.points?.length) { view.points = []; moved++; }
  return moved;
}

// ───────────────────────── outline (MindManager's Outline View)

/**
 * The topics of the map as an outline: central topics first, their subtopics below in model
 * order, each row { id, viewId, depth, element, hasChildren }. A collapsed topic hides its rows.
 */
export function outlineRows(project, diagram, { all = false } = {}) {
  const index = buildIndex(project);
  const views = topicViews(diagram, index);
  const rows = [];
  const visit = (element, depth) => {
    const kids = topicsOf(element);
    rows.push({ id: element._id, viewId: views.get(element._id)?._id ?? null, depth, element, hasChildren: kids.length > 0 });
    if (all || !element.collapsed) for (const child of kids) visit(child, depth + 1);
  };
  const centrals = [...views.keys()].map((id) => index.get(id)).filter((element) => !isTopic(index.parent(element._id)));
  for (const central of centrals) visit(central, 0);
  return rows;
}

/** The outline as text: one topic per line, indented with tabs (text) or as a Markdown list. */
export function outlineText(rows, format = 'text') {
  return rows.map((row) => (format === 'markdown' ? `${'  '.repeat(row.depth)}- ${row.element.name ?? ''}` : `${'\t'.repeat(row.depth)}${row.element.name ?? ''}`)).join('\n');
}

/**
 * Indented lines (tabs, or two or four spaces), Markdown lists (- * + 1.) or headings (#) as
 * [{ depth, name }], depths starting at 0.
 */
export function parseOutline(text) {
  const items = [];
  const lines = String(text ?? '').split(/\r?\n/).filter((line) => line.trim());
  const spaces = lines.map((line) => /^( *)/.exec(line.replace(/\t/g, '    '))[1].length).filter((n) => n > 0);
  const unit = spaces.length && spaces.every((n) => n % 4 === 0) ? 4 : 2;
  for (const line of lines) {
    const heading = /^\s*(#{1,6})\s+(.*)$/.exec(line);
    if (heading) { items.push({ depth: heading[1].length - 1, name: heading[2].trim() }); continue; }
    const indent = /^( *)/.exec(line.replace(/\t/g, ' '.repeat(unit)))[1].length;
    const name = line.trim().replace(/^([-*+]|\d+[.)])\s+/, '').trim();
    if (name) items.push({ depth: Math.floor(indent / unit), name });
  }
  const min = items.length ? Math.min(...items.map((item) => item.depth)) : 0;
  return items.map((item) => ({ ...item, depth: item.depth - min }));
}

/** Adds an outline (parseOutline) as subtopics of the topic of view `viewId`. Returns the new topics' views. */
export function addOutline(project, diagram, viewId, text, { language = 'en' } = {}) {
  const stack = [viewId];
  const added = [];
  for (const { depth, name } of parseOutline(text)) {
    const level = Math.min(depth, stack.length - 1);
    const result = addTopic(project, diagram, stack[level], 'child', { language, name });
    if (!result) continue;
    stack.length = level + 1;
    stack.push(result.view._id);
    added.push(result.view);
  }
  return added;
}

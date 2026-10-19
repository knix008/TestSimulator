// Draws a diagram: works out every view's box (fitted to its text unless the
// user sized it), the sequence-diagram geometry (lifeline lengths, created and
// destroyed lifelines, activation bars, message lines and their numbers), the
// route of every line (rectilinear, oblique, rounded, curved; through the
// user's bend points; clipped to each end's outline) with its UML adornments
// (triangles, diamonds, arrows, crow's feet, role names and multiplicities),
// and produces SVG. The diagram view, image/SVG/PDF export, printing,
// thumbnails and the HTML documentation all use this, so what is on screen is
// what is exported. Pure: text is measured by a function passed in.
import { esc, estimateMeasure, n, textLine, DEFAULT_FONT } from './text.js';
import { hiddenViews } from '../domain/mindmap.js';
import { SHAPES, operandBounds, shade } from './shapes.js';
import { DIAGRAM_BG_FITS, DIAGRAM_BG_KINDS, DIAGRAM_BG_PATTERNS, typeDef, viewDef } from '../domain/meta.js';
import { buildIndex, isEdgeView, refId } from '../domain/model.js';
import { flowText, messageText, stereotypeText, transitionText } from '../domain/labels.js';
import { MORE_CONTAINERS, MORE_FREE, MORE_ROUTES } from './shapes-more.js';

/** Shapes whose stored size wins over the fitted size (containers, bars, widgets). */
const FREE = new Set(['frame', 'diagramFrame', 'fragment', 'swimlane', 'pool', 'lane', 'bpmnSubProcess', 'bpmnGroup', 'expansion', 'structured', 'interruptible', 'c4Boundary', 'cloudGroup', 'rect', 'roundRect', 'ellipse', 'image', 'timingLifeline', 'subject', 'bar', 'wfFrame', 'wfMobile', 'wfPanel', 'wfInput', 'wfTextArea', 'wfDropdown', 'wfSlider', 'wfTabs', 'wfImage', 'wfAvatar', 'wfList', 'wfTable', 'wfDivider', 'wfProgress', 'wfIcon', 'note', 'text', 'cloudService', 'pseudostate']);
/** Container shapes: drawn behind the other nodes; moving one moves what is inside. */
export const CONTAINER_SHAPES = new Set(['mmBoundary', 'usRelease', 'cjStage', 'cjLane', 'frame', 'diagramFrame', 'fragment', 'swimlane', 'pool', 'lane', 'bpmnSubProcess', 'bpmnGroup', 'expansion', 'structured', 'interruptible', 'c4Boundary', 'cloudGroup', 'subject', 'package', 'state', 'node3d', 'component', 'wfFrame', 'wfMobile', 'wfPanel', 'collaboration', 'subsystem']);
for (const shape of MORE_FREE) FREE.add(shape);
for (const shape of MORE_CONTAINERS) CONTAINER_SHAPES.add(shape);

/** Diagram colour schemes (Settings › Diagram). */
export const DIAGRAM_THEMES = {
  classic: { background: '#ffffff', fill: '#ffffff', line: '#1f1f1f', color: '#000000', grid: '#e9ecf1', gridMajor: '#a9b2bf' },
  pastel: { background: '#ffffff', fill: '#fffdf2', line: '#4a4a4a', color: '#1f2937', grid: '#eceff3', gridMajor: '#b3bac5', fills: { classifier: '#fff7d6', instance: '#e8f4ff', behavior: '#f1ecff', state: '#eaf7ee', activity: '#eaf7ee', interaction: '#f0f6ff', erd: '#fff1e6', flowchart: '#eef6ff', dfd: '#fef2f2', sysml: '#f3f0ff', package: '#f5f5f4', annotation: '#fffbe6' } },
  blueprint: { background: '#0f3057', fill: '#14406f', line: '#cfe3ff', color: '#ffffff', grid: '#1a4675', gridMajor: '#4f8cca' },
  dark: { background: '#1e1f24', fill: '#2a2c33', line: '#c9ccd4', color: '#e8eaef', grid: '#2a2c33', gridMajor: '#535867' },
};

const NOTE_GROUP = new Set(['annotation']);

/**
 * The render context for one diagram: { project, index, diagram, measure,
 * language, lineStyle, theme } plus caches (boxes, routes, sequence layout).
 */
export function createRenderContext({ project, diagram, index = null, measure = estimateMeasure, language = 'ko', lineStyle = 'rectilinear', theme = 'classic', font = '', fontSize = 13, showShadow = true } = {}) {
  const palette = DIAGRAM_THEMES[theme] ?? DIAGRAM_THEMES.classic;
  // The diagram's own background (null: the scheme's). Its colour is also what hollow arrowheads are filled with.
  const backdrop = diagramBackground(diagram, palette);
  const ctx = {
    project, diagram, index: index ?? buildIndex(project), measure, language, lineStyle, palette, background: backdrop?.color ?? palette.background, backdrop, font, fontSize, showShadow,
    boxes: new Map(), routes: new Map(), cache: new Map(), sequence: null, diagramProvider: typeDef(diagram?._type)?.provider ?? null,
  };
  ctx.hidden = diagram?._type === 'MMMindmapDiagram' ? hiddenViews(diagram, ctx.index) : null;
  ctx.containsViews = (view) => containsViews(ctx, view);
  ctx.nodeBox = (view) => nodeBox(ctx, view);
  ctx.headerHeight = (view) => ctx.sequence?.lifelines.get(view._id)?.headerH ?? null;
  return ctx;
}

// A mind map leaves out the topics under a collapsed topic (mindmap.js hiddenViews).
const viewsOf = (ctx) => (ctx.hidden?.size ? (ctx.diagram?.ownedViews ?? []).filter((view) => !ctx.hidden.has(view._id)) : ctx.diagram?.ownedViews ?? []);
export const elementOf = (ctx, view) => (view.model ? ctx.index.get(refId(view.model)) : null);
export const shapeOfView = (view) => viewDef(view._type).shape ?? 'rect';

/** Resolved style of a view: { fill, line, color, face, size, bold, italic, shadow, lineWidth }. */
export function styleOf(ctx, view, element = elementOf(ctx, view)) {
  const p = ctx.palette;
  const group = element ? typeDef(element._type)?.group : 'annotation';
  let fill = p.fills?.[group] ?? p.fill;
  if (NOTE_GROUP.has(group) && view._type === 'UMLNoteView' && !p.fills) fill = p.fill;
  return {
    fill: view.fillColor || fill, userFill: Boolean(view.fillColor), line: view.lineColor || p.line, color: view.fontColor || p.color,
    face: view.fontFace || ctx.font, size: view.fontSize || ctx.fontSize || 13, bold: Boolean(view.bold), italic: Boolean(view.italic),
    shadow: ctx.showShadow && view.showShadow !== false && !isEdgeView(view), lineWidth: view.lineWidth || 1,
  };
}

// ───────────────────────── node boxes

/** Box { x, y, w, h } of a node view (cached per context). */
export function nodeBox(ctx, view) {
  if (ctx.boxes.has(view._id)) return ctx.boxes.get(view._id);
  const shape = shapeOfView(view);
  const spec = SHAPES[shape] ?? SHAPES.rect;
  const element = elementOf(ctx, view);
  let box;
  if (view.model && !element) box = { x: view.left ?? 0, y: view.top ?? 0, w: view.width || 60, h: view.height || 40 };
  else {
    const st = styleOf(ctx, view, element);
    const fit = spec.size(ctx, view, element ?? {}, st);
    let w; let h;
    if (FREE.has(shape) && view.width > 0 && view.height > 0) { w = view.width; h = view.height; } else if (view.autoResize) { w = fit.w; h = fit.h; } else { w = Math.max(view.width || 0, fit.w); h = Math.max(view.height || 0, fit.h); }
    if (shape === 'pseudostate' && !(view.width > 0)) { w = fit.w; h = fit.h; }
    box = { x: view.left ?? 0, y: view.top ?? 0, w: Math.max(4, w), h: Math.max(4, h) };
    // Views placed by their data (a task bar on its dates, an event on the time axis).
    if (spec.place && element) {
      ctx.boxes.set(view._id, box);
      const placed = spec.place(ctx, view, element, box);
      if (placed && [placed.x, placed.y, placed.w, placed.h].every(Number.isFinite)) box = placed;
    }
  }
  ctx.boxes.set(view._id, box);
  return box;
}

/** The fitted (minimum) size of a node view, for "fit to content". */
export function fittedSize(ctx, view) {
  const spec = SHAPES[shapeOfView(view)] ?? SHAPES.rect;
  const element = elementOf(ctx, view);
  return spec.size(ctx, view, element ?? {}, styleOf(ctx, view, element));
}

const inside = (inner, outer) => inner.x >= outer.x - 0.5 && inner.y >= outer.y - 0.5 && inner.x + inner.w <= outer.x + outer.w + 0.5 && inner.y + inner.h <= outer.y + outer.h + 0.5;

/** Does any other node view sit inside this one? */
function containsViews(ctx, view) {
  const box = nodeBox(ctx, view);
  return viewsOf(ctx).some((v) => v !== view && !isEdgeView(v) && inside(nodeBox(ctx, v), box) && boxArea(nodeBox(ctx, v)) < boxArea(box));
}
const boxArea = (b) => b.w * b.h;

/** Node views inside a container view (moved with it). */
export function viewsInside(ctx, view) {
  const box = nodeBox(ctx, view);
  return viewsOf(ctx).filter((v) => v !== view && !isEdgeView(v) && inside(nodeBox(ctx, v), box) && boxArea(nodeBox(ctx, v)) < boxArea(box));
}

// ───────────────────────── sequence diagrams

const isSequence = (ctx) => ctx.diagram?._type === 'UMLSequenceDiagram';
export const MESSAGE_GAP = 40;

/** Lifelines, messages, activations and numbers of a sequence diagram. */
function layoutSequence(ctx) {
  const views = viewsOf(ctx);
  const lifelines = new Map();
  for (const v of views) {
    if (v._type !== 'UMLLifelineView') continue;
    const el = elementOf(ctx, v);
    if (!el) continue;
    const st = styleOf(ctx, v, el);
    const fit = SHAPES.lifeline.size({ ...ctx, sequence: null }, v, el, st);
    const w = v.autoResize ? fit.w : Math.max(v.width || 0, fit.w);
    lifelines.set(v._id, { view: v, element: el, x: v.left ?? 0, top: v.top ?? 0, w, headerH: fit.h, headTop: v.top ?? 0, activations: [], end: null, destroyed: false });
  }
  const messages = views.filter((v) => v._type === 'UMLMessageView' && (lifelines.has(refId(v.tail)) || lifelines.has(refId(v.head))) && elementOf(ctx, v));
  messages.sort((a, b) => (a.y ?? 0) - (b.y ?? 0));
  const numbers = new Map();
  let maxY = 0;
  messages.forEach((m, i) => { numbers.set(m._id, i + 1); maxY = Math.max(maxY, m.y ?? 0); });
  // Created lifelines start at their create message; destroyed ones end at the delete message.
  for (const m of messages) {
    const el = elementOf(ctx, m);
    const head = lifelines.get(refId(m.head));
    if (!head) continue;
    if (el.messageSort === 'createMessage') head.headTop = (m.y ?? 0) - head.headerH / 2;
    if (el.messageSort === 'deleteMessage') { head.end = m.y; head.destroyed = true; }
  }
  // Activations: a synchronous call activates the receiver until the reply (or a short while).
  const replies = messages.filter((m) => elementOf(ctx, m).messageSort === 'reply');
  for (const m of messages) {
    const el = elementOf(ctx, m);
    const tailId = refId(m.tail);
    const headId = refId(m.head);
    const target = lifelines.get(headId);
    if (!target || ctx.diagram.showActivation === false) continue;
    if (el.messageSort !== 'synchCall' && el.messageSort !== 'asynchCall' && el.messageSort !== 'asynchSignal') continue;
    if (el.messageSort !== 'synchCall' && !m.activate) continue;
    const self = tailId === headId;
    const y1 = (m.y ?? 0) + (self ? 18 : 0);
    const reply = replies.find((r) => refId(r.tail) === headId && refId(r.head) === tailId && (r.y ?? 0) > y1);
    let y2 = reply ? reply.y : y1 + 26;
    if (!reply) {
      for (const other of messages) {
        if ((other.y ?? 0) <= y1 || (other.y ?? 0) > y2 + 12) continue;
        if (refId(other.tail) === headId) y2 = Math.max(y2, (other.y ?? 0) + 14);
      }
    }
    const depth = target.activations.filter((a) => a.y1 <= y1 && a.y2 >= y1).length;
    target.activations.push({ y1, y2, depth });
  }
  const bottom = Math.max(maxY + MESSAGE_GAP * 2, ...[...lifelines.values()].map((l) => l.top + Math.max(l.view.height || 0, l.headerH + 260)));
  for (const l of lifelines.values()) {
    // A destroyed lifeline ends at its delete message, never above its own header.
    l.end = l.destroyed ? Math.max(Number(l.end) || 0, l.headTop + l.headerH + 20) : bottom;
    ctx.boxes.set(l.view._id, { x: l.x, y: l.headTop, w: l.w, h: Math.max(l.headerH, l.end - l.headTop) });
  }
  return { lifelines, messages, numbers, bottom };
}

/** Offset of a lifeline's activation edge at y (0 when not active). side: +1 right, −1 left. */
function activationEdge(life, y, side) {
  let deepest = null;
  for (const a of life.activations) if (a.y1 - 0.5 <= y && a.y2 + 0.5 >= y && (!deepest || a.depth > deepest.depth)) deepest = a;
  if (!deepest) return 0;
  return deepest.depth * 6 + side * 7;
}

function messageRoute(ctx, view) {
  const seq = ctx.sequence;
  const el = elementOf(ctx, view);
  const tailLife = seq.lifelines.get(refId(view.tail));
  const headLife = seq.lifelines.get(refId(view.head));
  const y = view.y ?? 0;
  const cx = (life) => life.x + life.w / 2;
  const pointOf = (id) => { const v = viewsOf(ctx).find((x) => x._id === refId(id)); if (!v) return null; const b = nodeBox(ctx, v); return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; };
  if (tailLife && headLife && tailLife === headLife) {
    const x0 = cx(tailLife) + activationEdge(tailLife, y, 1);
    const x1 = cx(tailLife) + activationEdge(tailLife, y + 18, 1) + (activationEdge(tailLife, y + 18, 1) ? 0 : 0);
    const w = Math.max(30, view.loopWidth ?? 34);
    return [{ x: x0, y }, { x: x0 + w, y }, { x: x0 + w, y: y + 18 }, { x: x1 || x0, y: y + 18 }];
  }
  const tailX = tailLife ? cx(tailLife) : pointOf(view.tail)?.x ?? 0;
  const headX = headLife ? cx(headLife) : pointOf(view.head)?.x ?? 0;
  const dir = headX >= tailX ? 1 : -1;
  const x0 = tailLife ? tailX + activationEdge(tailLife, y, dir) : tailX;
  let x1;
  if (headLife && el.messageSort === 'createMessage') x1 = dir > 0 ? headLife.x : headLife.x + headLife.w;
  else x1 = headLife ? headX + activationEdge(headLife, y + 1, -dir) : headX;
  return [{ x: x0, y }, { x: x1, y }];
}

// ───────────────────────── edges

/** Is point p inside a view's outline? */
function insideOutline(b, clip, p) {
  if (clip === 'ellipse' || clip === 'circle') {
    const rx = b.w / 2; const ry = b.h / 2;
    if (rx <= 0 || ry <= 0) return false;
    const dx = (p.x - (b.x + rx)) / rx; const dy = (p.y - (b.y + ry)) / ry;
    return dx * dx + dy * dy <= 1;
  }
  if (clip === 'diamond') {
    const dx = Math.abs(p.x - (b.x + b.w / 2)) / (b.w / 2); const dy = Math.abs(p.y - (b.y + b.h / 2)) / (b.h / 2);
    return dx + dy <= 1;
  }
  return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
}

/** Where the segment a (inside) → b (outside) crosses the outline. */
function crossing(box, clip, a, b) {
  let lo = 0; let hi = 1;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    if (insideOutline(box, clip, { x: a.x + (b.x - a.x) * mid, y: a.y + (b.y - a.y) * mid })) lo = mid; else hi = mid;
  }
  return { x: a.x + (b.x - a.x) * hi, y: a.y + (b.y - a.y) * hi };
}

/** Trims a polyline (starting inside `box`) so that it starts on the outline. */
function clipStart(points, box, clip) {
  if (!box || box.w === 0) return points;
  const pts = [...points];
  while (pts.length > 2 && insideOutline(box, clip, pts[1])) pts.shift();
  if (pts.length >= 2 && insideOutline(box, clip, pts[0]) && !insideOutline(box, clip, pts[1])) pts[0] = crossing(box, clip, pts[0], pts[1]);
  return pts;
}
const clipEnd = (points, box, clip) => clipStart([...points].reverse(), box, clip).reverse();

const centerOf = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/** Orthogonal path through points (an elbow is added between points that are not aligned). */
function orthogonalize(points, horizontalFirst = true) {
  const out = [points[0]];
  for (let i = 1; i < points.length; i += 1) {
    const a = out.at(-1); const b = points[i];
    if (Math.abs(a.x - b.x) > 0.5 && Math.abs(a.y - b.y) > 0.5) out.push(horizontalFirst ? { x: b.x, y: a.y } : { x: a.x, y: b.y });
    out.push(b);
  }
  return out;
}

/** Automatic rectilinear route between two boxes (no bend points). */
function autoRectilinear(a, b) {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (ox > 10) { const x = Math.max(a.x, b.x) + ox / 2; return [{ x, y: a.y + a.h / 2 }, { x, y: b.y + b.h / 2 }]; }
  if (oy > 10) { const y = Math.max(a.y, b.y) + oy / 2; return [{ x: a.x + a.w / 2, y }, { x: b.x + b.w / 2, y }]; }
  const ca = centerOf(a); const cb = centerOf(b);
  const gapX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
  const gapY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
  if (gapX >= gapY) { const mx = (Math.min(a.x + a.w, b.x + b.w) + Math.max(a.x, b.x)) / 2; const x = gapX > 0 ? (ca.x < cb.x ? (a.x + a.w + b.x) / 2 : (b.x + b.w + a.x) / 2) : mx; return [ca, { x, y: ca.y }, { x, y: cb.y }, cb]; }
  const y = ca.y < cb.y ? (a.y + a.h + b.y) / 2 : (b.y + b.h + a.y) / 2;
  return [ca, { x: ca.x, y }, { x: cb.x, y }, cb];
}

function selfLoop(b) {
  const r = b.x + b.w; const t = b.y;
  return [{ x: r, y: t + Math.min(24, b.h / 3) }, { x: r + 28, y: t + Math.min(24, b.h / 3) }, { x: r + 28, y: t - 24 }, { x: r - Math.min(30, b.w / 3), y: t - 24 }, { x: r - Math.min(30, b.w / 3), y: t }];
}

/** The line style of an edge view. */
export const lineStyleOf = (ctx, view) => view.lineStyle || (view._type === 'MMEdgeView' || typeDef(elementOf(ctx, view)?._type)?.curved ? 'curve' : ctx.lineStyle);

/** End box and clip kind of an edge end (a node view, or the middle of another edge). */
function endOf(ctx, id) {
  const view = viewsOf(ctx).find((v) => v._id === refId(id));
  if (!view) return null;
  if (isEdgeView(view)) {
    const route = edgeRoute(ctx, view);
    const mid = route ? midpoint(route.points) : { x: 0, y: 0 };
    return { box: { x: mid.x, y: mid.y, w: 0, h: 0 }, clip: 'rect', view };
  }
  return { box: nodeBox(ctx, view), clip: SHAPES[shapeOfView(view)]?.clip ?? 'rect', view };
}

/** Route of an edge view: { points, style }. Cached. */
export function edgeRoute(ctx, view) {
  if (ctx.routes.has(view._id)) return ctx.routes.get(view._id);
  ctx.routes.set(view._id, null);
  let route = null;
  if (view._type === 'UMLMessageView' && ctx.sequence) route = { points: messageRoute(ctx, view), style: 'oblique' };
  else {
    const tail = endOf(ctx, view.tail);
    const head = endOf(ctx, view.head);
    if (tail && head) {
      const style = lineStyleOf(ctx, view);
      const bends = (view.points ?? []).map((p) => ({ x: p.x, y: p.y }));
      let pts;
      // Lines with their own route when the user has not bent them (Gantt dependencies, timeline links).
      const custom = !bends.length && tail.view !== head.view && !tail.view.tail && !head.view.tail ? MORE_ROUTES[elementOf(ctx, view)?._type] : null;
      if (custom) pts = custom(tail.box, head.box);
      else if (tail.view === head.view && !bends.length) pts = selfLoop(tail.box);
      else if (style === 'rectilinear' || style === 'roundRect') {
        pts = bends.length ? orthogonalize([centerOf(tail.box), ...bends, centerOf(head.box)]) : autoRectilinear(tail.box, head.box);
        pts = clipEnd(clipStart(pts, tail.box, 'rect'), head.box, 'rect');
      } else {
        pts = [centerOf(tail.box), ...bends, centerOf(head.box)];
        pts = clipEnd(clipStart(pts, tail.box, tail.clip), head.box, head.clip);
      }
      if (tail.view === head.view && !bends.length) { /* the loop starts and ends on the outline already */ }
      route = { points: dedupe(pts), style };
    }
  }
  ctx.routes.set(view._id, route);
  return route;
}

function dedupe(points) {
  const out = [];
  for (const p of points) if (!out.length || Math.abs(out.at(-1).x - p.x) > 0.01 || Math.abs(out.at(-1).y - p.y) > 0.01) out.push(p);
  if (out.length === 1) out.push({ ...out[0], x: out[0].x + 0.01 });
  return out;
}

export function midpoint(points) {
  if (!points?.length) return { x: 0, y: 0 };
  const lens = [];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) { const l = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y); lens.push(l); total += l; }
  let half = total / 2;
  for (let i = 1; i < points.length; i += 1) {
    if (half <= lens[i - 1]) { const t = lens[i - 1] ? half / lens[i - 1] : 0; return { x: points[i - 1].x + (points[i].x - points[i - 1].x) * t, y: points[i - 1].y + (points[i].y - points[i - 1].y) * t, angle: Math.atan2(points[i].y - points[i - 1].y, points[i].x - points[i - 1].x) }; }
    half -= lens[i - 1];
  }
  return { ...points.at(-1), angle: 0 };
}

/** SVG path data of a route. */
export function routePath(points, style) {
  if (style === 'curve' && points.length >= 2) {
    if (points.length === 2) {
      const [a, b] = points;
      return `M${n(a.x)} ${n(a.y)}L${n(b.x)} ${n(b.y)}`;
    }
    let d = `M${n(points[0].x)} ${n(points[0].y)}`;
    for (let i = 0; i < points.length - 1; i += 1) {
      const p0 = points[Math.max(0, i - 1)]; const p1 = points[i]; const p2 = points[i + 1]; const p3 = points[Math.min(points.length - 1, i + 2)];
      d += `C${n(p1.x + (p2.x - p0.x) / 6)} ${n(p1.y + (p2.y - p0.y) / 6)} ${n(p2.x - (p3.x - p1.x) / 6)} ${n(p2.y - (p3.y - p1.y) / 6)} ${n(p2.x)} ${n(p2.y)}`;
    }
    return d;
  }
  if (style === 'roundRect' && points.length > 2) {
    let d = `M${n(points[0].x)} ${n(points[0].y)}`;
    for (let i = 1; i < points.length - 1; i += 1) {
      const a = points[i - 1]; const b = points[i]; const c = points[i + 1];
      const r = Math.min(10, Math.hypot(b.x - a.x, b.y - a.y) / 2, Math.hypot(c.x - b.x, c.y - b.y) / 2);
      const p1 = toward(b, a, r); const p2 = toward(b, c, r);
      d += `L${n(p1.x)} ${n(p1.y)}Q${n(b.x)} ${n(b.y)} ${n(p2.x)} ${n(p2.y)}`;
    }
    return `${d}L${n(points.at(-1).x)} ${n(points.at(-1).y)}`;
  }
  return points.map((p, i) => `${i ? 'L' : 'M'}${n(p.x)} ${n(p.y)}`).join('');
}
const toward = (from, to, d) => { const l = Math.hypot(to.x - from.x, to.y - from.y) || 1; return { x: from.x + ((to.x - from.x) / l) * d, y: from.y + ((to.y - from.y) / l) * d }; };

// ───────────────────────── adornments

/** Arrowhead or end mark at `tip`, pointing along `angle` (radians, direction of travel). */
export function endMark(kind, tip, angle, st, background) {
  if (!kind || kind === 'none') return '';
  const c = Math.cos(angle); const s = Math.sin(angle);
  const P = (back, side) => ({ x: tip.x - c * back + -s * side, y: tip.y - s * back + c * side });
  const pts = (list) => list.map((p) => `${n(p.x)},${n(p.y)}`).join(' ');
  const stroke = `stroke="${esc(st.line)}" stroke-width="${n(st.lineWidth ?? 1)}"`;
  switch (kind) {
    case 'open': return `<polyline points="${pts([P(12, -6), tip, P(12, 6)])}" fill="none" ${stroke}/>`;
    case 'triangle': return `<polygon points="${pts([tip, P(15, -8), P(15, 8)])}" fill="${esc(background)}" ${stroke}/>`;
    case 'openTriangle': return `<polygon points="${pts([tip, P(11, -6), P(11, 6)])}" fill="${esc(background)}" ${stroke}/>`;
    case 'filled': return `<polygon points="${pts([tip, P(11, -5), P(11, 5)])}" fill="${esc(st.line)}" ${stroke}/>`;
    case 'filledTriangle': return `<polygon points="${pts([tip, P(15, -8), P(15, 8)])}" fill="${esc(st.line)}" ${stroke}/>`;
    case 'shared': return `<polygon points="${pts([tip, P(10, -6), P(20, 0), P(10, 6)])}" fill="${esc(background)}" ${stroke}/>`;
    case 'composite': return `<polygon points="${pts([tip, P(10, -6), P(20, 0), P(10, 6)])}" fill="${esc(st.line)}" ${stroke}/>`;
    case 'cross': { const a = P(10, -5); const b = P(20, 5); const a2 = P(20, -5); const b2 = P(10, 5); return `<path d="M${n(a.x)} ${n(a.y)}L${n(b.x)} ${n(b.y)}M${n(a2.x)} ${n(a2.y)}L${n(b2.x)} ${n(b2.y)}" fill="none" ${stroke}/>`; }
    case 'circle': { const o = P(5, 0); return `<circle cx="${n(o.x)}" cy="${n(o.y)}" r="5" fill="${esc(background)}" ${stroke}/>`; }
    case 'dot': { const o = P(3.5, 0); return `<circle cx="${n(o.x)}" cy="${n(o.y)}" r="3.5" fill="${esc(st.line)}" ${stroke}/>`; }
    case 'containment': { const o = P(7, 0); const a = P(1, 0); const b = P(13, 0); const l = P(7, -6); const r = P(7, 6); return `<circle cx="${n(o.x)}" cy="${n(o.y)}" r="6" fill="${esc(background)}" ${stroke}/><path d="M${n(a.x)} ${n(a.y)}L${n(b.x)} ${n(b.y)}M${n(l.x)} ${n(l.y)}L${n(r.x)} ${n(r.y)}" ${stroke}/>`; }
    case 'slash': { const a = P(14, -6); const b = P(6, 6); return `<path d="M${n(a.x)} ${n(a.y)}L${n(b.x)} ${n(b.y)}" ${stroke}/>`; }
    case 'deleteX': { const a = P(-9, -9); const b = P(9, 9); const a2 = P(9, -9); const b2 = P(-9, 9); return `<path d="M${n(a.x)} ${n(a.y)}L${n(b.x)} ${n(b.y)}M${n(a2.x)} ${n(a2.y)}L${n(b2.x)} ${n(b2.y)}" fill="none" stroke="${esc(st.line)}" stroke-width="2"/>`; }
    // Crow's foot (ERD) — tip is on the entity.
    case 'erd:1': { const a = P(8, -7); const b = P(8, 7); const a2 = P(13, -7); const b2 = P(13, 7); return `<path d="M${n(a.x)} ${n(a.y)}L${n(b.x)} ${n(b.y)}M${n(a2.x)} ${n(a2.y)}L${n(b2.x)} ${n(b2.y)}" ${stroke}/>`; }
    case 'erd:0..1': { const a = P(8, -7); const b = P(8, 7); const o = P(18, 0); return `<path d="M${n(a.x)} ${n(a.y)}L${n(b.x)} ${n(b.y)}" ${stroke}/><circle cx="${n(o.x)}" cy="${n(o.y)}" r="5" fill="${esc(background)}" ${stroke}/>`; }
    case 'erd:1..*': { const f1 = P(0, -7); const f2 = P(0, 7); const k = P(11, 0); const a = P(15, -7); const b = P(15, 7); return `<path d="M${n(f1.x)} ${n(f1.y)}L${n(k.x)} ${n(k.y)}L${n(f2.x)} ${n(f2.y)}M${n(a.x)} ${n(a.y)}L${n(b.x)} ${n(b.y)}" fill="none" ${stroke}/>`; }
    case 'erd:0..*': { const f1 = P(0, -7); const f2 = P(0, 7); const k = P(11, 0); const o = P(18, 0); return `<path d="M${n(f1.x)} ${n(f1.y)}L${n(k.x)} ${n(k.y)}L${n(f2.x)} ${n(f2.y)}" fill="none" ${stroke}/><circle cx="${n(o.x)}" cy="${n(o.y)}" r="5" fill="${esc(background)}" ${stroke}/>`; }
    default: return '';
  }
}

/** Marks at the tail and head of an edge, its dash pattern and labels. */
function edgeLook(ctx, view, element) {
  const def = typeDef(element?._type) ?? {};
  const look = { tail: '', head: '', dash: '', labels: [] };
  if (view._type === 'UMLNoteLinkView') { look.dash = '4 3'; return look; }
  if (view._type === 'FreelineEdgeView') return look;
  if (view._type === 'MMEdgeView') return look;
  if (!element) return look;
  look.head = def.arrow ?? '';
  look.tail = def.tailMark ?? '';
  look.dash = def.line === 'dash' ? '6 4' : def.line === 'dot' ? '2 3' : '';
  switch (element._type) {
    case 'UMLAssociation': case 'UMLLink': case 'UMLConnector': case 'UMLCommunicationPath': case 'SysMLConnector': {
      const mark = (end, other) => {
        if (!end) return '';
        if (end.aggregation === 'composite') return 'composite';
        if (end.aggregation === 'shared') return 'shared';
        return '';
      };
      const nav = (end) => (end?.navigable === 'navigable' ? 'open' : end?.navigable === 'notNavigable' && view.showNonNavigable ? 'cross' : '');
      look.tail = mark(element.end1) || nav(element.end1);
      look.head = mark(element.end2) || nav(element.end2);
      // Both an aggregation diamond and a navigability arrow can apply at the far end.
      if (mark(element.end1) && nav(element.end2) === '') { /* plain */ }
      if (element._type === 'UMLConnector' && element.kind === 'delegation') look.head = 'open';
      break;
    }
    case 'ERDRelationship':
      look.tail = `erd:${element.end1?.cardinality ?? '1'}`;
      look.head = `erd:${element.end2?.cardinality ?? '1'}`;
      look.dash = element.identifying === false ? '6 4' : '';
      break;
    case 'UMLMessage':
      switch (element.messageSort) {
        case 'synchCall': look.head = 'filled'; break;
        case 'reply': look.head = 'open'; look.dash = '6 4'; break;
        case 'createMessage': look.head = 'open'; look.dash = '6 4'; break;
        case 'deleteMessage': look.head = 'filled'; break;
        case 'asynchSignal': look.head = 'open'; break;
        default: look.head = 'open';
      }
      break;
    case 'BPMNSequenceFlow': if (element.isDefault) look.tail = 'slash'; break;
    case 'BPMNAssociation': look.head = element.associationDirection === 'one' || element.associationDirection === 'both' ? 'open' : ''; look.tail = element.associationDirection === 'both' ? 'open' : ''; break;
    // ArchiMate access: the arrow shows the direction of the data (read: towards the reader).
    case 'ArchiMateAccess': look.head = ['write', 'readwrite'].includes(element.accessType ?? 'write') ? 'open' : ''; look.tail = ['read', 'readwrite'].includes(element.accessType) ? 'open' : ''; break;
    case 'ArchiMateAssociation': look.head = element.isDirected ? 'open' : ''; break;
    default: break;
  }
  return look;
}

/** Text labels of an edge: [{ text, at: 'middle'|'tail'|'head', side: -1|1, … }]. */
function edgeLabels(ctx, view, element) {
  if (!element) return view.text ? [{ text: view.text, at: 'middle', side: -1 }] : [];
  const out = [];
  const def = typeDef(element._type) ?? {};
  const stereo = view.stereotypeDisplay !== 'none' ? stereotypeText(element, ctx.index, { keyword: true }) : '';
  switch (element._type) {
    case 'UMLMessage': {
      const number = ctx.diagram?.showSequenceNumber !== false ? ctx.sequence?.numbers.get(view._id) ?? null : null;
      out.push({ text: (stereo ? `${stereo} ` : '') + messageText(element, ctx.index, { number, signature: ctx.diagram?.messageSignature ?? 'nameAndType' }), at: 'middle', side: -1, message: true, selfMessage: refId(view.tail) === refId(view.head) });
      return out;
    }
    case 'UMLTransition': out.push({ text: transitionText(element), at: 'middle', side: -1 }); break;
    case 'UMLControlFlow': case 'UMLObjectFlow': case 'BPMNSequenceFlow': case 'FCFlow': case 'DFDDataFlow': case 'CloudConnection': out.push({ text: flowText(element), at: 'middle', side: -1 }); break;
    case 'C4Relationship': out.push({ text: element.name ?? '', at: 'middle', side: -1, bold: false }); if (element.technology) out.push({ text: `[${element.technology}]`, at: 'middle', side: 1, small: true }); break;
    case 'NWConnection': if (element.address) out.push({ text: element.address, at: 'head', side: 1, small: true }); return out;
    case 'ArchiMateInfluence': if (element.name || element.strength) out.push({ text: [element.strength, element.name].filter(Boolean).join(' '), at: 'middle', side: -1 }); return out;
    case 'UMLExtend': out.push({ text: '«extend»', at: 'middle', side: -1 }); if (element.condition) out.push({ text: `[${element.condition}]`, at: 'middle', side: 1, small: true }); return out;
    // «flow» and the conveyed information items (or the name).
    case 'UMLInformationFlow': if (stereo) out.push({ text: stereo, at: 'middle', side: -1 }); if (element.conveyed || element.name) out.push({ text: element.conveyed || element.name, at: 'middle', side: 1 }); return out;
    default:
      if (stereo) out.push({ text: stereo, at: 'middle', side: -1, offset: element.name ? 1 : 0 });
      if (element.name && !def.noName) out.push({ text: element.name, at: 'middle', side: element._type === 'UMLAssociation' && stereo ? 1 : -1 });
  }
  if (def.ends === 'association' && element.end1 && element.end2 && element._type !== 'ERDRelationship') {
    const role = (end) => `${end.visibility && end.name && view.showVisibility !== false ? { public: '+', private: '-', protected: '#', package: '~' }[end.visibility] ?? '' : ''}${end.name ?? ''}`;
    if (role(element.end1)) out.push({ text: role(element.end1), at: 'tail', side: -1 });
    if (element.end1.multiplicity && view.showMultiplicity !== false) out.push({ text: element.end1.multiplicity, at: 'tail', side: 1 });
    if (role(element.end2)) out.push({ text: role(element.end2), at: 'head', side: -1 });
    if (element.end2.multiplicity && view.showMultiplicity !== false) out.push({ text: element.end2.multiplicity, at: 'head', side: 1 });
  }
  if (element._type === 'ERDRelationship' && element.name) { /* name already added */ }
  return out;
}

/** Position of an edge label. */
function labelPosition(points, label, view, st) {
  const offset = view.labelOffsets?.[label.key ?? label.at] ?? null;
  let base;
  let angle;
  if (label.at === 'tail' || label.at === 'head') {
    const a = label.at === 'tail' ? points[0] : points.at(-1);
    const b = label.at === 'tail' ? points[1] : points.at(-2);
    angle = Math.atan2(b.y - a.y, b.x - a.x);
    base = { x: a.x + Math.cos(angle) * 22, y: a.y + Math.sin(angle) * 22 };
  } else {
    const m = midpoint(points);
    base = m;
    angle = m.angle ?? 0;
  }
  if (label.selfMessage) { const p0 = points[1]; return { x: p0.x + 6 + (offset?.dx ?? 0), y: p0.y + st.size * 0.9 + (offset?.dy ?? 0), anchor: 'start' }; }
  const horizontal = Math.abs(Math.cos(angle)) >= Math.abs(Math.sin(angle));
  const side = label.side ?? -1;
  const gap = (label.message ? 6 : 8) + (label.offset ?? 0) * (st.size + 2);
  const p = horizontal ? { x: base.x, y: base.y + side * gap + (side > 0 ? st.size * 0.8 : -2) } : { x: base.x + side * gap, y: base.y + st.size * 0.35 };
  const anchor = horizontal ? 'middle' : side > 0 ? 'start' : 'end';
  return { x: p.x + (offset?.dx ?? 0), y: p.y + (offset?.dy ?? 0), anchor };
}

function edgeSvg(ctx, view) {
  const route = edgeRoute(ctx, view);
  if (!route) return '';
  const element = elementOf(ctx, view);
  const st = styleOf(ctx, view, element);
  const look = edgeLook(ctx, view, element);
  const { points, style } = route;
  const d = routePath(points, style);
  const bg = ctx.background;
  let out = `<path d="${d}" fill="none" stroke="transparent" stroke-width="12" class="hit"/>`;
  out += `<path d="${d}" fill="none" stroke="${esc(st.line)}" stroke-width="${n(st.lineWidth)}"${look.dash ? ` stroke-dasharray="${look.dash}"` : ''} stroke-linejoin="round"/>`;
  const angleAt = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  if (look.head) out += endMark(look.head, points.at(-1), angleAt(points.at(-2), points.at(-1)), st, bg);
  if (look.tail) out += endMark(look.tail, points[0], angleAt(points[1], points[0]), st, bg);
  if (element?._type === 'UMLMessage' && element.messageSort === 'deleteMessage' && !ctx.sequence?.lifelines.get(refId(view.head))) out += endMark('deleteX', points.at(-1), 0, st, bg);
  // Communication diagram: messages ride along their connector.
  if (ctx.diagram?._type === 'UMLCommunicationDiagram' && element?._type === 'UMLConnector') out += commMessages(ctx, view, element, points, st);
  for (const label of edgeLabels(ctx, view, element)) {
    if (!label.text) continue;
    const p = labelPosition(points, label, view, st);
    const size = label.small ? st.size - 2 : st.size - (label.at === 'middle' ? 0 : 1);
    out += `<rect x="${n(p.anchor === 'start' ? p.x - 1 : p.anchor === 'end' ? p.x - ctx.measure(label.text, { fontSize: size }) - 1 : p.x - ctx.measure(label.text, { fontSize: size }) / 2 - 1)}" y="${n(p.y - size)}" width="${n(ctx.measure(label.text, { fontSize: size }) + 2)}" height="${n(size + 3)}" fill="${esc(bg)}" opacity="0.75" data-label="${esc(label.at)}"/>`;
    out += textLine(label.text, p.x, p.y, { face: st.face, size, color: st.color, anchor: p.anchor, bold: label.bold });
  }
  return out;
}

function commMessages(ctx, view, connector, points, st) {
  const messages = [];
  const interaction = ctx.index.parent(connector._id);
  for (const m of interaction?.messages ?? []) if (refId(m.connector) === connector._id) messages.push(m);
  if (!messages.length) return '';
  const all = interaction.messages.filter((m) => m.connector);
  const mid = midpoint(points);
  const tailLife = refId(viewsOf(ctx).find((v) => v._id === refId(view.tail))?.model);
  let out = '';
  messages.forEach((m, i) => {
    const forward = refId(m.source) === tailLife;
    const angle = (mid.angle ?? 0) + (forward ? 0 : Math.PI);
    const horizontal = Math.abs(Math.cos(mid.angle ?? 0)) >= Math.abs(Math.sin(mid.angle ?? 0));
    const off = 12 + i * (st.size + 4);
    const base0 = horizontal ? { x: mid.x, y: mid.y - off } : { x: mid.x + off, y: mid.y };
    const a = { x: base0.x - Math.cos(angle) * 14, y: base0.y - Math.sin(angle) * 14 };
    const b = { x: base0.x + Math.cos(angle) * 14, y: base0.y + Math.sin(angle) * 14 };
    out += `<path d="M${n(a.x)} ${n(a.y)}L${n(b.x)} ${n(b.y)}" stroke="${esc(st.line)}"/>` + endMark(m.messageSort === 'synchCall' ? 'filled' : 'open', b, angle, st, ctx.background);
    const label = messageText(m, ctx.index, { number: all.indexOf(m) + 1, signature: ctx.diagram?.messageSignature ?? 'nameAndType' });
    out += textLine(label, horizontal ? base0.x + 20 : base0.x + 6, horizontal ? base0.y + 4 : base0.y - 18, { face: st.face, size: st.size - 1, color: st.color, anchor: 'start' });
  });
  return out;
}

// ───────────────────────── the whole diagram

/** Computes boxes and routes for every view. */
export function layoutDiagram(ctx) {
  ctx.boxes.clear();
  ctx.cache?.clear();
  ctx.routes.clear();
  ctx.sequence = isSequence(ctx) ? layoutSequence(ctx) : null;
  for (const view of viewsOf(ctx)) if (!isEdgeView(view)) nodeBox(ctx, view);
  for (const view of viewsOf(ctx)) if (isEdgeView(view)) edgeRoute(ctx, view);
  return ctx;
}

/** Views in drawing order: containers (largest first), other nodes, edges. */
export function drawingOrder(ctx) {
  const views = viewsOf(ctx);
  const containers = []; const nodes = []; const edges = [];
  for (const v of views) {
    if (isEdgeView(v)) edges.push(v);
    else if (CONTAINER_SHAPES.has(shapeOfView(v)) && ctx.containsViews(v)) containers.push(v);
    else nodes.push(v);
  }
  containers.sort((a, b) => boxArea(nodeBox(ctx, b)) - boxArea(nodeBox(ctx, a)));
  // Lifelines go below the other nodes of a sequence diagram (fragments sit on top of their dashed lines).
  if (ctx.sequence) nodes.sort((a, b) => (a._type === 'UMLLifelineView' ? 0 : 1) - (b._type === 'UMLLifelineView' ? 0 : 1));
  return [...containers, ...nodes, ...edges];
}

function nodeSvg(ctx, view) {
  const element = elementOf(ctx, view);
  if (view.model && !element) return '';
  const shape = shapeOfView(view);
  const spec = SHAPES[shape] ?? SHAPES.rect;
  const box = nodeBox(ctx, view);
  const st = styleOf(ctx, view, element);
  let body;
  try { body = spec.draw(ctx, view, element ?? {}, box, st); } catch (error) { body = `<rect x="${n(box.x)}" y="${n(box.y)}" width="${n(box.w)}" height="${n(box.h)}" fill="#fee" stroke="#c00"/>`; if (ctx.onError) ctx.onError(error, view); }
  const hit = `<rect x="${n(box.x)}" y="${n(box.y)}" width="${n(box.w)}" height="${n(box.h)}" fill="transparent" stroke="none" class="hit"/>`;
  return `${hit}${body}`;
}

/** SVG of the diagram's views (no <svg> wrapper). ids: only these views. tag: wrap each in <g data-view>. */
export function renderViews(ctx, { ids = null, tag = true } = {}) {
  layoutDiagram(ctx);
  let out = '';
  for (const view of drawingOrder(ctx)) {
    if (ids && !ids.has(view._id)) continue;
    const body = isEdgeView(view) ? edgeSvg(ctx, view) : nodeSvg(ctx, view);
    if (!body) continue;
    out += tag ? `<g data-view="${esc(view._id)}" class="${isEdgeView(view) ? 'edge-view' : 'node-view'}">${body}</g>` : body;
  }
  return out;
}

/** Shared <defs> (shadow filter). */
export const svgDefs = (ctx) => `<filter id="uml-shadow" x="-10%" y="-10%" width="130%" height="140%"><feDropShadow dx="2.5" dy="2.5" stdDeviation="1.6" flood-color="${ctx?.palette === DIAGRAM_THEMES.dark || ctx?.palette === DIAGRAM_THEMES.blueprint ? '#000000' : '#000000'}" flood-opacity="0.22"/></filter>`;

/** Bounding box of all (or some) views, labels included roughly. */
export function diagramBounds(ctx, ids = null) {
  layoutDiagram(ctx);
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (const view of viewsOf(ctx)) {
    if (ids && !ids.has(view._id)) continue;
    if (isEdgeView(view)) {
      const r = edgeRoute(ctx, view);
      for (const p of r?.points ?? []) { add(p.x - 20, p.y - 20); add(p.x + 20, p.y + 20); }
    } else {
      const b = nodeBox(ctx, view);
      const def = viewDef(view._type);
      const element = elementOf(ctx, view);
      // A name wider than its symbol (ports, lollipops, events, cloud tiles) is drawn centred below it.
      const name = element?.name ? ctx.measure(element.name, { fontSize: ctx.fontSize || 13 }) : 0;
      const over = Math.max(0, (name - b.w) / 2);
      add(b.x - over, b.y - (element?.templateParameters?.length ? 12 : 0));
      add(b.x + b.w + 4 + over, b.y + b.h + (def.nameOutside || shapeOfView(view) === 'cloudService' || over > 0 ? 34 : 4));
    }
  }
  if (x0 === Infinity) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * The diagram as a standalone SVG document. options: { measure, language,
 * padding, background (colour or 'none'), ids (Set) for a selection, theme,
 * lineStyle, scale }.
 */
export function renderDiagramSvg(project, diagram, options = {}) {
  const ctx = createRenderContext({ project, diagram, ...options });
  const ids = options.ids ?? null;
  const bounds = diagramBounds(ctx, ids);
  const pad = options.padding ?? 20;
  const x = Math.floor(bounds.x - pad); const y = Math.floor(bounds.y - pad);
  const w = Math.max(40, Math.ceil(bounds.w + pad * 2)); const h = Math.max(40, Math.ceil(bounds.h + pad * 2));
  const scale = options.scale ?? 1;
  const background = options.background ?? ctx.background;
  const body = renderViews(ctx, { ids, tag: false });
  // options.background: 'none' (transparent export, print without background) or a colour win over the diagram's own background.
  const back = options.background === undefined && ctx.backdrop ? backgroundLayers(ctx.backdrop, { x, y, w, h }, { id: `bg-${diagram?._id ?? 'diagram'}` })
    : background && background !== 'none' ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${esc(background)}"/>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${n(w * scale)}" height="${n(h * scale)}" viewBox="${x} ${y} ${w} ${h}" font-family="${esc(DEFAULT_FONT)}"><defs>${svgDefs(ctx)}</defs>${back}${body}</svg>`;
  return { svg, width: w, height: h, bounds: { x, y, w, h } };
}

// ───────────────────────── diagram background

/** Pattern tiles (page units at 100 %), drawn in the pattern colour `c`. */
export const BG_PATTERN_TILES = {
  dots: { w: 20, h: 20, svg: (c) => `<circle cx="10" cy="10" r="2" fill="${c}"/>` },
  grid: { w: 20, h: 20, svg: (c) => `<path d="M0 0.5H20M0.5 0V20" stroke="${c}" stroke-width="1" fill="none"/>` },
  'lines-h': { w: 20, h: 10, svg: (c) => `<path d="M0 5H20" stroke="${c}" stroke-width="1.2" fill="none"/>` },
  'lines-v': { w: 10, h: 20, svg: (c) => `<path d="M5 0V20" stroke="${c}" stroke-width="1.2" fill="none"/>` },
  diagonal: { w: 14, h: 14, svg: (c) => `<path d="M-3.5 3.5L3.5 -3.5M0 14L14 0M10.5 17.5L17.5 10.5" stroke="${c}" stroke-width="1.2" fill="none"/>` },
  'diagonal-cross': { w: 14, h: 14, svg: (c) => `<path d="M-3.5 3.5L3.5 -3.5M0 14L14 0M10.5 17.5L17.5 10.5M-3.5 10.5L3.5 17.5M0 0L14 14M10.5 -3.5L17.5 3.5" stroke="${c}" stroke-width="1" fill="none"/>` },
  checker: { w: 20, h: 20, svg: (c) => `<path d="M0 0H10V10H0ZM10 10H20V20H10Z" fill="${c}"/>` },
  crosshatch: { w: 8, h: 8, svg: (c) => `<path d="M0 4H8M4 0V8M0 0L8 8M8 0L0 8" stroke="${c}" stroke-width="0.5" fill="none"/>` },
  waves: { w: 20, h: 10, svg: (c) => `<path d="M0 5Q5 0 10 5T20 5" stroke="${c}" stroke-width="1.2" fill="none"/>` },
  hexagon: { w: 30, h: 17.32, svg: (c) => `<path d="M0 8.66L5 0H15L20 8.66L15 17.32H5ZM20 8.66H30" stroke="${c}" stroke-width="1" fill="none"/>` },
};

const percent = (value, fallback = 100, min = 0, max = 100) => (value === '' || value === null || value === undefined || !Number.isFinite(Number(value)) ? fallback : Math.min(max, Math.max(min, Number(value))));

/**
 * A diagram's own background, resolved against the colour scheme: { kind, color, colorOpacity, image,
 * imageWidth, imageHeight, fit, opacity, pattern, patternColor, patternOpacity, patternScale }, or null
 * when it uses the scheme's background. Without backgroundKind (older files) a picture or a colour
 * alone decides the kind.
 */
export function diagramBackground(diagram, palette = DIAGRAM_THEMES.classic) {
  const d = diagram ?? {};
  const kind = d.backgroundKind === undefined ? (d.backgroundImage ? 'image' : d.backgroundColor ? 'color' : '') : d.backgroundKind;
  if (!kind || !DIAGRAM_BG_KINDS.includes(kind)) return null;
  return {
    kind,
    color: d.backgroundColor || palette.background,
    colorOpacity: percent(d.backgroundColorOpacity),
    image: kind === 'image' ? String(d.backgroundImage || '') : '',
    imageWidth: Number(d.backgroundImageWidth) > 0 ? Number(d.backgroundImageWidth) : 0,
    imageHeight: Number(d.backgroundImageHeight) > 0 ? Number(d.backgroundImageHeight) : 0,
    fit: DIAGRAM_BG_FITS.includes(d.backgroundFit) ? d.backgroundFit : 'fill',
    opacity: percent(d.backgroundOpacity),
    pattern: kind === 'pattern' ? (DIAGRAM_BG_PATTERNS.includes(d.backgroundPattern) ? d.backgroundPattern : 'dots') : '',
    patternColor: d.backgroundPatternColor || palette.gridMajor || '#a9b2bf',
    patternOpacity: percent(d.backgroundPatternOpacity),
    patternScale: percent(d.backgroundPatternScale, 100, 50, 300),
  };
}

/**
 * The background layers as SVG: the colour, then the picture or the pattern, each with its own opacity
 * (a layer at 0 % is left out). `box` is the area covered (the exported drawing, or the canvas world);
 * `view` is where a fitted, filled, centred or stretched picture is placed (default: box). Tiles and
 * patterns start at page 0,0 so they line up between the canvas and the export. `id` keeps <pattern>
 * ids apart when several drawings share a document.
 */
export function backgroundLayers(bg, box, { id = 'bg', view = box } = {}) {
  if (!bg) return '';
  const key = String(id).replace(/[^\w-]/g, '_');
  const alpha = (value, attr) => (value < 100 ? ` ${attr}="${n(value / 100)}"` : '');
  const area = (fill, extra = '') => `<rect x="${n(box.x)}" y="${n(box.y)}" width="${n(box.w)}" height="${n(box.h)}" fill="${fill}"${extra}/>`;
  let out = '';
  if (bg.colorOpacity > 0) out += area(esc(bg.color), alpha(bg.colorOpacity, 'fill-opacity'));
  if (bg.kind === 'image' && bg.image && bg.opacity > 0) {
    const iw = bg.imageWidth || 256; const ih = bg.imageHeight || 256;
    const href = esc(bg.image);
    if (bg.fit === 'tile') {
      out += `<defs><pattern id="${key}-img" patternUnits="userSpaceOnUse" x="0" y="0" width="${n(iw)}" height="${n(ih)}"><image href="${href}" width="${n(iw)}" height="${n(ih)}" preserveAspectRatio="none"/></pattern></defs>${area(`url(#${key}-img)`, alpha(bg.opacity, 'opacity'))}`;
    } else if (bg.fit === 'center') {
      out += `<svg x="${n(view.x)}" y="${n(view.y)}" width="${n(view.w)}" height="${n(view.h)}" overflow="hidden"><image href="${href}" x="${n((view.w - iw) / 2)}" y="${n((view.h - ih) / 2)}" width="${n(iw)}" height="${n(ih)}"${alpha(bg.opacity, 'opacity')}/></svg>`;
    } else {
      const aspect = { fill: 'xMidYMid slice', fit: 'xMidYMid meet', stretch: 'none' }[bg.fit];
      out += `<image href="${href}" x="${n(view.x)}" y="${n(view.y)}" width="${n(view.w)}" height="${n(view.h)}" preserveAspectRatio="${aspect}"${alpha(bg.opacity, 'opacity')}/>`;
    }
  }
  if (bg.kind === 'pattern' && bg.patternOpacity > 0) {
    const tile = BG_PATTERN_TILES[bg.pattern] ?? BG_PATTERN_TILES.dots;
    const k = bg.patternScale / 100;
    out += `<defs><pattern id="${key}-pat" patternUnits="userSpaceOnUse" x="0" y="0" width="${tile.w}" height="${tile.h}"${k !== 1 ? ` patternTransform="scale(${n(k)})"` : ''}>${tile.svg(esc(bg.patternColor))}</pattern></defs>${area(`url(#${key}-pat)`, alpha(bg.patternOpacity, 'opacity'))}`;
  }
  return out ? `<g class="diagram-background" pointer-events="none">${out}</g>` : '';
}

/** Small preview of a diagram (start page, diagram list). */
export function diagramThumbnail(project, diagram, { width = 240, height = 150, measure } = {}) {
  const { svg, width: w, height: h } = renderDiagramSvg(project, diagram, { measure, padding: 10 });
  const s = Math.min(width / w, height / h, 1);
  return svg.replace(/width="[^"]+" height="[^"]+"/, `width="${n(w * s)}" height="${n(h * s)}"`);
}

export { operandBounds, shade };

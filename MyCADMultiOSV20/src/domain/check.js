// Drawing check: what is wrong in a drawing, for the problems panel. Pure
// (no DOM): each finding is { code, severity, ids, at, params } where
//   code      what is wrong (the panel turns it into text: problems.<code>)
//   severity  'error' (broken or invisible geometry) · 'warning' (most likely a
//             mistake) · 'info' (worth a look)
//   ids       the entities involved (the first one is selected when clicked)
//   at        a point to show ({ x, y }), params the numbers in the message.
// Lengths are drawing units (mm). The near-miss tolerance follows the drawing's size.
import { entityBox, primitives, rectOutline } from './entities.js';
import { dist, polygonArea, unionBox } from './geometry.js';

export const SEVERITIES = ['error', 'warning', 'info'];
const RANK = { error: 0, warning: 1, info: 2 };

/** Every check, in the order the panel lists them within a severity. */
export const PROBLEM_CODES = [
  'zeroLength', 'zeroDim', 'degenerateOutline', 'emptyBoolean', 'emptyPad', 'hugeCoordinate',
  'duplicate', 'nearlyClosed', 'gap', 'repeatedPoint', 'emptyText', 'tinyHatch', 'missingLayer',
];

const EPS = 1e-6;
const HUGE = 1e7;
const MAX_FINDINGS = 500;

/** The gap below which two ends are "meant to meet": 1/10 000 of the drawing, between 0.01 and 0.5 mm. */
export function nearTolerance(box) {
  if (!box) return 0.01;
  const diagonal = Math.hypot(box.maxX - box.minX, box.maxY - box.minY);
  return Math.min(0.5, Math.max(0.01, diagonal * 1e-4));
}

const round = (value) => (typeof value === 'number' ? Math.round(value / EPS) * EPS : value);
/** The geometry of an entity without its identity and look (two entities with the same key lie on top of each other). */
function geometryKey(entity) {
  const { id, layer, color, lineType, lineWidth, name, ...rest } = entity;
  return JSON.stringify(rest, (key, value) => round(value));
}

/** End points of open curves (where they should join others). */
function openEnds(entity) {
  if (entity.type === 'line') return [{ x: entity.x1, y: entity.y1 }, { x: entity.x2, y: entity.y2 }];
  if (entity.type === 'polyline' && !entity.closed) return [entity.points[0], entity.points[entity.points.length - 1]];
  if (entity.type === 'arc') {
    const prim = primitives(entity)[0];
    const at = (deg) => ({ x: prim.c.x + prim.r * Math.cos((deg * Math.PI) / 180), y: prim.c.y + prim.r * Math.sin((deg * Math.PI) / 180) });
    return [at(prim.start), at(prim.end)];
  }
  return [];
}

const centre = (box) => (box ? { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 } : { x: 0, y: 0 });

/** Finds what is wrong in `drawing`; returns findings, worst first. */
export function checkDrawing(drawing) {
  const entities = drawing?.entities ?? [];
  const found = [];
  const add = (code, severity, ids, at, params = {}) => { if (found.length < MAX_FINDINGS) found.push({ code, severity, ids, at, params }); };
  const boxes = new Map();
  let box = null;
  for (const entity of entities) {
    let entityBounds = null;
    // Solids by their placement only: their outline needs the mesh (seconds for big booleans).
    if (entity.type === 'solid') entityBounds = { minX: entity.x, minY: entity.y, maxX: entity.x, maxY: entity.y };
    else try { entityBounds = entityBox(entity); } catch { entityBounds = null; }
    boxes.set(entity.id, entityBounds);
    box = unionBox(box, entityBounds);
  }
  const tol = nearTolerance(box);
  const layers = new Set((drawing?.layers ?? []).map((layer) => layer.id));

  // Entity by entity.
  for (const entity of entities) {
    const at = centre(boxes.get(entity.id));
    const ids = [entity.id];
    const bounds = boxes.get(entity.id);
    if (bounds && Math.max(Math.abs(bounds.minX), Math.abs(bounds.maxX), Math.abs(bounds.minY), Math.abs(bounds.maxY)) > HUGE) add('hugeCoordinate', 'error', ids, at);
    if (layers.size && !layers.has(entity.layer)) add('missingLayer', 'info', ids, at, { layer: entity.layer });
    switch (entity.type) {
      case 'line':
        if (dist({ x: entity.x1, y: entity.y1 }, { x: entity.x2, y: entity.y2 }) < EPS) add('zeroLength', 'error', ids, at);
        break;
      case 'polyline': {
        const points = entity.points;
        let repeated = 0;
        for (let i = 1; i < points.length; i++) if (dist(points[i], points[i - 1]) < EPS) repeated++;
        const distinct = points.filter((p, i) => !i || dist(p, points[i - 1]) >= EPS).length;
        if (distinct < 2 || (entity.closed && (distinct < 3 || Math.abs(polygonArea(points)) < EPS))) add(distinct < 2 ? 'zeroLength' : 'degenerateOutline', 'error', ids, at);
        else if (repeated) add('repeatedPoint', 'info', ids, points.find((p, i) => i && dist(p, points[i - 1]) < EPS), { count: repeated });
        if (!entity.closed && distinct >= 3) {
          const gap = dist(points[0], points[points.length - 1]);
          if (gap >= EPS && gap <= tol) add('nearlyClosed', 'warning', ids, points[0], { gap });
        }
        break;
      }
      case 'spline':
        if (!entity.closed && entity.points.length >= 3) {
          const gap = dist(entity.points[0], entity.points[entity.points.length - 1]);
          if (gap >= EPS && gap <= tol) add('nearlyClosed', 'warning', ids, entity.points[0], { gap });
        }
        break;
      case 'rect':
        if (Math.abs(polygonArea(rectOutline(entity))) < EPS) add('degenerateOutline', 'error', ids, at);
        break;
      case 'text':
        if (!entity.text.trim()) add('emptyText', 'warning', ids, { x: entity.x, y: entity.y });
        break;
      case 'dim':
        if (['aligned', 'horizontal', 'vertical'].includes(entity.kind)) {
          const length = entity.kind === 'horizontal' ? Math.abs(entity.x2 - entity.x1) : entity.kind === 'vertical' ? Math.abs(entity.y2 - entity.y1) : dist({ x: entity.x1, y: entity.y1 }, { x: entity.x2, y: entity.y2 });
          if (length < EPS) add('zeroDim', 'error', ids, at);
        }
        break;
      case 'hatch': {
        const area = entity.loops.reduce((sum, loop) => sum + Math.abs(polygonArea(loop)), 0);
        if (area < EPS) add('tinyHatch', 'warning', ids, at);
        break;
      }
      case 'solid':
        if (entity.kind === 'boolean' && (entity.shape?.parts?.length ?? 0) < 2) add('emptyBoolean', 'error', ids, at, { name: entity.name || '' });
        if (entity.kind === 'pad' && !(entity.shape?.shapes?.length)) add('emptyPad', 'error', ids, at, { name: entity.name || '' });
        break;
      default:
        break;
    }
  }

  // Entities lying exactly on top of each other.
  const byKey = new Map();
  for (const entity of entities) {
    const key = geometryKey(entity);
    const first = byKey.get(key);
    if (first) add('duplicate', 'warning', [entity.id, first.id], centre(boxes.get(entity.id)), { type: entity.type });
    else byKey.set(key, entity);
  }

  // Ends that almost meet (closer than the tolerance, but not on each other): a grid of tol-sized cells.
  const ends = [];
  for (const entity of entities) {
    let points = [];
    try { points = openEnds(entity); } catch { points = []; }
    points.forEach((p) => ends.push({ p, id: entity.id }));
  }
  const cell = (v) => Math.floor(v / tol);
  const grid = new Map();
  ends.forEach((end, index) => {
    const key = `${cell(end.p.x)},${cell(end.p.y)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(index);
  });
  const reported = new Set();
  ends.forEach((end, index) => {
    // An end joined exactly to another is fine, whatever lies near it.
    let joined = false;
    let nearest = null;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const other of grid.get(`${cell(end.p.x) + dx},${cell(end.p.y) + dy}`) ?? []) {
          if (other === index) continue;
          const d = dist(end.p, ends[other].p);
          if (d < EPS) joined = true;
          else if (d <= tol && ends[other].id !== end.id && (!nearest || d < nearest.d)) nearest = { other, d };
        }
      }
    }
    if (joined || !nearest) return;
    const pair = [end.id, ends[nearest.other].id].sort().join('|') + `@${Math.round(end.p.x / tol)},${Math.round(end.p.y / tol)}`;
    if (reported.has(pair)) return;
    reported.add(pair);
    reported.add([end.id, ends[nearest.other].id].sort().join('|') + `@${Math.round(ends[nearest.other].p.x / tol)},${Math.round(ends[nearest.other].p.y / tol)}`);
    add('gap', 'warning', [end.id, ends[nearest.other].id], end.p, { gap: nearest.d });
  });

  return found.sort((a, b) => RANK[a.severity] - RANK[b.severity] || PROBLEM_CODES.indexOf(a.code) - PROBLEM_CODES.indexOf(b.code));
}

/** Counts by severity: { error, warning, info, total }. */
export function problemCounts(findings) {
  const counts = { error: 0, warning: 0, info: 0, total: findings.length };
  for (const finding of findings) counts[finding.severity]++;
  return counts;
}

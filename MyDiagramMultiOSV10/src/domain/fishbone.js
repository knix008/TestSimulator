// Mind map ⇄ fishbone (cause-and-effect) diagram on the same shapes. The central topic becomes
// the head on the right, a thick spine runs left from it, the main topics sit on ribs above and
// below the spine, and their subtopics hang off the ribs. Pure model edits, no DOM.
import { addShape, createShape, findShape, isConnector, isGroup } from './diagram.js';
import { layoutPage } from './layout.js';

const SPINE_NAME = 'fishbone-spine';
const RIB_PREFIX = 'fishbone:';
const center = (s) => ({ x: s.x + s.w / 2, y: s.y + s.h / 2 });

export const mindCenter = (page) => page?.shapes.find((shape) => shape.master === 'centralTopic') ?? null;
const spineOf = (page) => page.shapes.find((shape) => shape.name === SPINE_NAME) ?? null;

export const hasMindMap = (page) => Boolean(mindCenter(page));
export const isFishbone = (page) => Boolean(page && spineOf(page));

/** children: id → [{ connector, child }], walking outward from the central topic. */
function tree(page, rootId) {
  const links = new Map();
  const link = (a, b, connector) => { if (!links.has(a)) links.set(a, []); links.get(a).push({ connector, child: b }); };
  for (const shape of page.shapes) {
    if (!isConnector(shape) || !shape.from.id || !shape.to.id) continue;
    link(shape.from.id, shape.to.id, shape);
    link(shape.to.id, shape.from.id, shape);
  }
  const seen = new Set([rootId]);
  const children = new Map();
  const walk = (id) => {
    const list = (links.get(id) ?? []).filter(({ child }) => !seen.has(child) && findShape(page, child) && !isGroup(findShape(page, child)));
    for (const { child } of list) seen.add(child);
    children.set(id, list);
    for (const { child } of list) walk(child);
  };
  walk(rootId);
  return children;
}

/** Glues a connector: `fromEnd` at the rib side, `shape` at the other end, as a plain straight line. */
function straight(connector, from, toId) {
  connector.from = from;
  connector.to = { id: toId, pt: 'auto' };
  connector.route = 'straight';
  connector.waypoints = [];
  connector.style = { ...connector.style, endArrow: 'none', startArrow: 'none' };
}

/** The mind map on `page` becomes a fishbone. Returns false when there is nothing to change. */
export function toFishbone(page) {
  const head = mindCenter(page);
  if (!head || isFishbone(page)) return false;
  const children = tree(page, head.id);
  const ribs = children.get(head.id) ?? [];
  if (!ribs.length) return false;
  const SUB_GAP = 10; const RIB_DX = 70; const RIB_MIN = 150;
  const subsOf = (rib) => children.get(rib.child) ?? [];
  const shapeOf = (id) => findShape(page, id);
  // A slot along the spine holds one rib above and one below.
  const slots = Math.ceil(ribs.length / 2);
  const slotOf = (i) => Math.floor(i / 2);
  const ribHeight = (rib) => Math.max(RIB_MIN, subsOf(rib).reduce((sum, { child }) => sum + shapeOf(child).h + SUB_GAP, 40));
  const heightOn = (side) => Math.max(0, ...ribs.filter((_, i) => i % 2 === side).map(ribHeight));
  const slotWidth = (slot) => Math.max(230, ...ribs.filter((_, i) => slotOf(i) === slot).map((rib) => RIB_DX + 40 + Math.max(0, ...subsOf(rib).map(({ child }) => shapeOf(child).w))));
  const topicHeight = Math.max(...ribs.map((rib) => shapeOf(rib.child).h));
  const up = heightOn(0); const down = heightOn(1);
  const spineY = 60 + topicHeight + up;
  let right = 0;
  for (let slot = 0; slot < slots; slot += 1) right += slotWidth(slot);
  const left = 60;
  const headX = left + right + 30;
  head.x = headX;
  head.y = spineY - head.h / 2;
  const spine = addShape(page, createShape('line', { x: left, y: spineY - 1, w: headX - left, h: 2, name: SPINE_NAME, style: { lineWidth: 4 }, points: [] }));
  const points = [];
  let x = headX - 30;
  ribs.forEach((rib, i) => {
    if (i % 2 === 0 && i > 0) x -= slotWidth(slotOf(i) - 1);
    const above = i % 2 === 0;
    const height = ribHeight(rib);
    const joint = { x, y: spineY };
    const end = { x: x - RIB_DX, y: spineY + (above ? -height : height) };
    const topic = shapeOf(rib.child);
    topic.x = end.x - topic.w / 2;
    topic.y = above ? end.y - topic.h : end.y;
    points.push([(joint.x - left) / spine.w, 0.5]);
    straight(rib.connector, { id: spine.id, pt: points.length - 1 }, topic.id);
    const subs = subsOf(rib);
    subs.forEach(({ connector, child }, k) => {
      const t = (k + 1) / (subs.length + 1);
      const on = { x: joint.x + (end.x - joint.x) * t, y: joint.y + (end.y - joint.y) * t };
      const sub = shapeOf(child);
      sub.x = on.x - 16 - sub.w;
      sub.y = on.y - sub.h / 2;
      connector.name = `${RIB_PREFIX}${topic.id}`;
      straight(connector, { x: on.x, y: on.y }, sub.id);
      // Anything further out stays on its parent, to the left of it.
      const place = (parent, level) => {
        (children.get(parent.id) ?? []).forEach(({ child: id, connector: line }, n) => {
          const leaf = shapeOf(id);
          leaf.x = parent.x - 30 - leaf.w;
          leaf.y = parent.y + n * (leaf.h + 6) * (level % 2 ? 1 : -1);
          line.route = 'straight';
          place(leaf, level + 1);
        });
      };
      place(sub, 1);
    });
  });
  spine.points = points;
  // Everything on the page, whatever hangs furthest out.
  const shapes = page.shapes.filter((shape) => !isConnector(shape));
  const shiftX = Math.max(0, 40 - Math.min(...shapes.map((shape) => shape.x)));
  const shiftY = Math.max(0, 40 - Math.min(...shapes.map((shape) => shape.y)));
  for (const shape of shapes) { shape.x += shiftX; shape.y += shiftY; }
  for (const shape of page.shapes) {
    if (isConnector(shape) && !shape.from.id) { shape.from.x += shiftX; shape.from.y += shiftY; }
  }
  void down;
  return true;
}

/** The fishbone goes back to a mind map. */
export function toMindMap(page) {
  const spine = spineOf(page);
  const head = mindCenter(page);
  if (!spine || !head) return false;
  for (const shape of page.shapes) {
    if (!isConnector(shape)) continue;
    if (shape.from.id === spine.id) {
      shape.from = { id: head.id, pt: 'auto' };
    } else if (shape.name?.startsWith(RIB_PREFIX)) {
      shape.from = { id: shape.name.slice(RIB_PREFIX.length), pt: 'auto' };
      shape.name = '';
    } else {
      continue;
    }
    shape.route = 'curved';
    shape.waypoints = [];
  }
  for (const shape of page.shapes) if (isConnector(shape) && shape.route === 'straight' && shape.from.id && shape.to.id) shape.route = 'curved';
  page.shapes = page.shapes.filter((shape) => shape.id !== spine.id);
  layoutPage(page, { kind: 'radial', spacing: 30, origin: { x: 60, y: 40 } });
  void center;
  return true;
}

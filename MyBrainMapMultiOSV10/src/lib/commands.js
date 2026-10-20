// Map commands that need only the map, the selection and the layout: adding
// topics, deleting, moving, navigating with the arrow keys. They return
// { map, sel, edit } — the new map, the new selection and the topic to start
// editing — and the app records the result for undo.
import {
  makeTopic, addChild, addSibling, addCallout, addFloating, insertParent, removeTopics, moveTopic, makeFloatingAt, nudgeTopics,
  shiftTopic, setCollapsed, entryOf, findTopic, isWithin, indexOf, parentOf,
} from './model.js';

// The side a new main topic goes to on a map layout: the one with fewer topics.
function lighterSide(map) {
  let r = 0, l = 0;
  map.root.children.forEach((c, i) => { const s = c.side || (i % 2 === 0 ? 'right' : 'left'); if (s === 'left') l++; else r++; });
  return l < r ? 'left' : 'right';
}

export function cmdAddChild(map, sel, { autoBalance = true } = {}) {
  const id = sel[sel.length - 1] || map.root.id;
  const extra = id === map.root.id && map.layout === 'map' && autoBalance ? { side: lighterSide(map) } : {};
  const r = addChild(map, id, makeTopic('', extra));
  return { map: r.map, sel: [r.id], edit: r.id };
}

export function cmdAddSibling(map, sel, { before = false, autoBalance = true } = {}) {
  const id = sel[sel.length - 1] || map.root.id;
  if (id === map.root.id) return cmdAddChild(map, sel, { autoBalance });
  const r = addSibling(map, id, makeTopic(''), { before });
  return { map: r.map, sel: [r.id], edit: r.id };
}

export function cmdAddParent(map, sel) {
  const id = sel[sel.length - 1];
  if (!id || id === map.root.id) return null;
  const r = insertParent(map, id, makeTopic(''));
  return r.id ? { map: r.map, sel: [r.id], edit: r.id } : null;
}

export function cmdAddCallout(map, sel) {
  const id = sel[sel.length - 1] || map.root.id;
  const r = addCallout(map, id, makeTopic(''));
  return { map: r.map, sel: [r.id], edit: r.id };
}

export function cmdAddFloating(map, x, y) {
  const r = addFloating(map, makeTopic(''), Math.round(x), Math.round(y));
  return { map: r.map, sel: [r.id], edit: r.id };
}

// Delete: the selection goes to a neighbour (next sibling, else previous, else parent).
export function cmdDelete(map, sel, { keepChildren = false } = {}) {
  const ids = sel.filter((id) => id !== map.root.id);
  if (!ids.length) return null;
  const last = entryOf(map, ids[ids.length - 1]);
  let next = null;
  if (last && last.kind === 'child') {
    const sibs = findTopic(map, last.parent).children;
    const after = sibs.slice(last.index + 1).find((s) => !ids.includes(s.id));
    const before = sibs.slice(0, last.index).reverse().find((s) => !ids.includes(s.id));
    next = (after || before || {}).id || last.parent;
  } else if (last && last.kind === 'callout') next = last.parent;
  let out = map;
  if (keepChildren) {
    // the children take the place of the deleted topic
    for (const id of ids) {
      const e = entryOf(out, id);
      if (!e || e.kind !== 'child') continue;
      const kids = findTopic(out, id).children || [];
      let at = e.index + 1;
      for (const k of kids) { out = moveTopic(out, k.id, e.parent, at); at++; }
      if (kids.length && !next) next = kids[0].id;
    }
  }
  out = removeTopics(out, ids).map;
  if (next && !indexOf(out).has(next)) next = null;
  return { map: out, sel: [next || out.root.id] };
}

// Drag & drop result: zone 'child' | 'before' | 'after'.
export function cmdMove(map, ids, targetId, zone, { autoBalance = true } = {}) {
  const tops = ids.filter((id) => id !== map.root.id && !ids.some((o) => o !== id && isWithin(map, id, o)));
  if (!tops.length || !entryOf(map, targetId)) return null;
  if (tops.some((id) => isWithin(map, targetId, id))) return null;
  let out = map;
  const target = entryOf(map, targetId);
  if (zone === 'child' || target.kind !== 'child') {
    const side = targetId === map.root.id && map.layout === 'map' && autoBalance ? lighterSide(map) : undefined;
    for (const id of tops) out = moveTopic(out, id, targetId, null, { side });
  } else {
    const parentId = target.parent;
    let at = entryOf(out, targetId).index + (zone === 'after' ? 1 : 0);
    const side = parentId === map.root.id ? findTopic(map, targetId).side : undefined;
    for (const id of tops) {
      out = moveTopic(out, id, parentId, at, { side });
      at = entryOf(out, id).index + 1;   // the next one goes right after it
    }
  }
  return out === map ? null : { map: out, sel: tops };
}

// A topic dropped on empty space becomes (or, floating already, moves as) a
// floating topic centred there — positions are relative to the central
// topic's centre, which the layout puts at (0, 0).
export function cmdFloat(map, ids, center) {
  const id = ids.length === 1 ? ids[0] : null;
  if (!id || id === map.root.id) return null;
  return { map: makeFloatingAt(map, id, Math.round(center.x), Math.round(center.y)), sel: [id] };
}

// A connected topic dropped on empty space stays connected: it (with the rest of
// the selection) moves by (dx, dy) from where it is and keeps its parent.
export function cmdNudge(map, ids, dx, dy) {
  const tops = ids.filter((id) => id !== map.root.id && !ids.some((o) => o !== id && isWithin(map, id, o)));
  if (!tops.length || (!dx && !dy)) return null;
  const out = nudgeTopics(map, tops.map((id) => ({ id, dx, dy })));
  return out === map ? null : { map: out, sel: tops };
}

// The topic in the direction of an arrow key, by where the topics are on screen.
export function navigate(L, map, id, key) {
  const n = L.nodes.get(id);
  if (!n) return map.root.id;
  const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
  const dir = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[key];
  if (!dir) return id;
  // structure first: toward the children opens / enters the branch, toward the parent goes up
  const childDir = n.dir;
  const toKids = (childDir === 'right' && key === 'ArrowRight') || (childDir === 'left' && key === 'ArrowLeft') || ((childDir === 'down' || childDir === 'treeRight' || childDir === 'treeLeft' || childDir === 'fishTop') && key === 'ArrowDown') || ((childDir === 'up' || childDir === 'fishBottom') && key === 'ArrowUp');
  if (toKids && n.kids.length) {
    // the child nearest the topic's middle
    let best = n.kids[0], bd = Infinity;
    for (const k of n.kids) { const d = Math.abs(k.y + k.h / 2 - cy) + Math.abs(k.x + k.w / 2 - cx) * 0.1; if (d < bd) { bd = d; best = k; } }
    return best.id;
  }
  const p = n.parent;
  if (p) {
    const pd = p.dir === 'map' ? (n.side === 'left' ? 'left' : 'right') : p.dir;
    const toParent = (pd === 'right' && key === 'ArrowLeft') || (pd === 'left' && key === 'ArrowRight') || ((pd === 'down' || pd === 'treeRight' || pd === 'treeLeft') && key === 'ArrowUp') || (pd === 'up' && key === 'ArrowDown');
    if (toParent) return p.id;
  }
  let best = null, bs = Infinity;
  for (const o of L.nodes.values()) {
    if (o.id === id) continue;
    const ox = o.x + o.w / 2, oy = o.y + o.h / 2;
    const dx = ox - cx, dy = oy - cy;
    const along = dx * dir[0] + dy * dir[1];
    if (along <= 4) continue;
    const perp = Math.abs(dx * dir[1] - dy * dir[0]);
    // rows / columns that overlap count as straight ahead
    const overlap = dir[0] ? Math.max(0, Math.min(n.y + n.h, o.y + o.h) - Math.max(n.y, o.y)) : Math.max(0, Math.min(n.x + n.w, o.x + o.w) - Math.max(n.x, o.x));
    const score = along + (overlap > 0 ? 0 : perp * 2.2);
    if (score < bs) { bs = score; best = o; }
  }
  return best ? best.id : id;
}

export function cmdShift(map, sel, delta) {
  const id = sel[sel.length - 1];
  if (!id) return null;
  const out = shiftTopic(map, id, delta);
  return out === map ? null : { map: out, sel };
}

export function cmdToggleFold(map, ids) {
  const list = ids.filter((id) => (findTopic(map, id).children || []).length);
  if (!list.length) return null;
  const close = !findTopic(map, list[0]).collapsed;
  return { map: setCollapsed(map, list, close) };
}

export const parentTopicOf = parentOf;

// Draft Clone: a copy that follows its source. A clone keeps its own style and
// a similarity transform around a fixed anchor c (taken from the source when cloned):
//   x' = s · R(angle) · F^flip · (x − c) + c + d      (F: mirror across the horizontal through c)
// Move, rotate, scale and mirror of a clone change that transform; its shape always comes from the source.

const finite = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const rad = (deg) => (deg * Math.PI) / 180;
const turn = (v, deg) => {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
};

/** The clone link of an entity read from a file, or null. */
export function normalizeClone(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.of !== 'string' || !raw.of) return null;
  const scale = finite(raw.scale, 1);
  return {
    of: raw.of, cx: finite(raw.cx), cy: finite(raw.cy), dx: finite(raw.dx), dy: finite(raw.dy),
    angle: finite(raw.angle), scale: scale > 0 ? scale : 1, flip: Boolean(raw.flip),
  };
}

/** The clone transform after a move / rotate / scale / mirror op (the ops of transformEntity). */
export function composeClone(clone, op) {
  const c = { x: clone.cx, y: clone.cy };
  const at = { x: c.x + clone.dx, y: c.y + clone.dy };
  const out = { ...clone };
  const place = (q) => { out.dx = q.x - c.x; out.dy = q.y - c.y; };
  switch (op.type) {
    case 'move':
      out.dx += op.dx;
      out.dy += op.dy;
      break;
    case 'rotate': {
      const p = { x: op.cx ?? 0, y: op.cy ?? 0 };
      const v = turn({ x: at.x - p.x, y: at.y - p.y }, op.angle);
      place({ x: p.x + v.x, y: p.y + v.y });
      out.angle = clone.angle + op.angle;
      break;
    }
    case 'scale': {
      const p = { x: op.cx ?? 0, y: op.cy ?? 0 };
      place({ x: p.x + (at.x - p.x) * op.factor, y: p.y + (at.y - p.y) * op.factor });
      out.scale = clone.scale * op.factor;
      break;
    }
    case 'mirror': {
      const phi = Math.atan2(op.b.y - op.a.y, op.b.x - op.a.x) * (180 / Math.PI);
      const v = turn({ x: at.x - op.a.x, y: at.y - op.a.y }, -phi);
      const back = turn({ x: v.x, y: -v.y }, phi);
      place({ x: op.a.x + back.x, y: op.a.y + back.y });
      out.angle = 2 * phi - clone.angle;
      out.flip = !clone.flip;
      break;
    }
    default: break;
  }
  out.angle = ((out.angle % 360) + 360) % 360;
  return out;
}

/** The ops that carry the source onto the clone, in order. */
export function cloneOps(clone) {
  const c = { x: clone.cx, y: clone.cy };
  const ops = [];
  if (clone.flip) ops.push({ type: 'mirror', a: c, b: { x: c.x + 1, y: c.y } });
  if (clone.angle) ops.push({ type: 'rotate', cx: c.x, cy: c.y, angle: clone.angle });
  if (clone.scale !== 1) ops.push({ type: 'scale', cx: c.x, cy: c.y, factor: clone.scale });
  if (clone.dx || clone.dy) ops.push({ type: 'move', dx: clone.dx, dy: clone.dy });
  return ops;
}

/** Fields a clone keeps as its own; everything else comes from the source. */
const OWN = ['id', 'layer', 'color', 'lineType', 'lineWidth', 'clone', 'name', 'level'];

/**
 * Rebuilds every clone from its source (sources first, so a clone of a clone
 * follows too). A clone whose source is gone becomes an ordinary object.
 * `helpers` = { transformEntity, normalizeEntity } (passed in to avoid an import cycle).
 */
export function syncClones(drawing, { transformEntity, normalizeEntity }) {
  const clones = drawing.entities.filter((e) => e.clone);
  if (!clones.length) return 0;
  const byId = new Map(drawing.entities.map((e) => [e.id, e]));
  const done = new Set();
  let changed = 0;
  const visit = (entity, path = new Set()) => {
    if (!entity.clone || done.has(entity.id)) return byId.get(entity.id);
    done.add(entity.id);
    const source = byId.get(entity.clone.of);
    const index = drawing.entities.findIndex((e) => e.id === entity.id);
    // No source (deleted) or a loop: the clone stays as it is, on its own.
    if (!source || path.has(source.id) || source.id === entity.id) {
      const { clone, ...rest } = entity;
      drawing.entities[index] = rest;
      byId.set(entity.id, rest);
      changed++;
      return rest;
    }
    path.add(entity.id);
    const from = visit(source, path) ?? source;
    let made = structuredClone(from);
    for (const op of cloneOps(entity.clone)) made = transformEntity(made, op);
    for (const key of OWN) {
      if (entity[key] !== undefined) made[key] = entity[key];
      else delete made[key];
    }
    made.type = from.type;
    const fresh = normalizeEntity(made);
    if (!fresh) return entity;
    if (JSON.stringify(fresh) !== JSON.stringify(entity)) {
      drawing.entities[index] = fresh;
      byId.set(fresh.id, fresh);
      changed++;
    }
    return byId.get(entity.id);
  };
  for (const clone of clones) visit(byId.get(clone.id));
  return changed;
}

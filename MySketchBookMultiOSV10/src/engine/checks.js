// Model checks for the bottom panel's Problems tab (pure, Node-testable):
// things that are probably mistakes in a floor plan — doors wider than their
// wall, openings overlapping, furniture overlapping or outside every room,
// items floating above the floor, library items that cannot be found.
// Each problem: { id, severity: 'error' | 'warning' | 'info', code, entity, params }.
import { wallLength, pointInPolygon } from './walls.js';

const footprint = (o, size) => {
  // The item's plan rectangle (rotated about Y) as four corners.
  const [w, , d] = size;
  const sx = Math.abs(o.scale?.[0] ?? 1); const sz = Math.abs(o.scale?.[2] ?? 1);
  const hw = (w * sx) / 2; const hd = (d * sz) / 2;
  const c = Math.cos(o.rotation?.[1] ?? 0); const s = Math.sin(o.rotation?.[1] ?? 0);
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, z]) => [o.position[0] + x * c + z * s, o.position[2] - x * s + z * c]);
};

/** Overlap area of two convex quads, estimated on a small grid (good enough for a warning). */
function overlapShare(a, b) {
  const xs = [...a, ...b].map((p) => p[0]); const zs = [...a, ...b].map((p) => p[1]);
  const x0 = Math.max(Math.min(...a.map((p) => p[0])), Math.min(...b.map((p) => p[0])));
  const x1 = Math.min(Math.max(...a.map((p) => p[0])), Math.max(...b.map((p) => p[0])));
  const z0 = Math.max(Math.min(...a.map((p) => p[1])), Math.min(...b.map((p) => p[1])));
  const z1 = Math.min(Math.max(...a.map((p) => p[1])), Math.max(...b.map((p) => p[1])));
  void xs; void zs;
  if (x1 <= x0 || z1 <= z0) return 0;
  let inBoth = 0; let inA = 0; let inB = 0;
  const N = 12;
  const ax0 = Math.min(...a.map((p) => p[0])); const ax1 = Math.max(...a.map((p) => p[0]));
  const az0 = Math.min(...a.map((p) => p[1])); const az1 = Math.max(...a.map((p) => p[1]));
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const p = [ax0 + ((i + 0.5) / N) * (ax1 - ax0), az0 + ((j + 0.5) / N) * (az1 - az0)];
    if (!pointInPolygon(p, a)) continue;
    inA += 1;
    if (pointInPolygon(p, b)) inBoth += 1;
  }
  void inB;
  return inA ? inBoth / inA : 0;
}

/**
 * @param {object} project
 * @param {(id: string) => object|null} itemOf  catalog lookup
 */
export function checkProject(project, itemOf) {
  const out = [];
  const push = (severity, code, entity, params = {}) => out.push({ id: `${code}:${entity ?? ''}:${out.length}`, severity, code, entity, params });
  const walls = new Map(project.walls.map((w) => [w.id, w]));

  for (const w of project.walls) if (wallLength(w) < 0.1) push('warning', 'wallShort', w.id);

  // Openings: within their wall and not overlapping each other.
  const byWall = new Map();
  for (const o of project.openings) {
    const w = walls.get(o.wall);
    if (!w) continue;
    const L = wallLength(w);
    if (o.width > L - 0.02) push('error', 'openingTooWide', o.id, { width: o.width, length: L });
    else if (o.offset - o.width / 2 < -0.001 || o.offset + o.width / 2 > L + 0.001) push('error', 'openingOutside', o.id);
    const level = project.levels.find((l) => l.id === w.level);
    if (level && (o.sill ?? 0) + o.height > (w.height ?? level.height) - 0.01) push('error', 'openingTooTall', o.id);
    if (!itemOf(o.item)) push('error', 'itemMissing', o.id, { item: o.item });
    (byWall.get(o.wall) ?? byWall.set(o.wall, []).get(o.wall)).push(o);
  }
  for (const list of byWall.values()) {
    const sorted = [...list].sort((a, b) => a.offset - b.offset);
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1]; const b = sorted[i];
      if (a.offset + a.width / 2 > b.offset - b.width / 2 + 0.005) push('error', 'openingsOverlap', b.id, { other: a.id });
    }
  }

  // Furniture: missing items, outside rooms, floating, overlapping others on the floor.
  const floorObjects = [];
  for (const o of project.objects) {
    const item = itemOf(o.item);
    if (!item) { push('error', 'itemMissing', o.id, { item: o.item }); continue; }
    if (o.hidden) continue;
    const rooms = project.rooms.filter((r) => r.level === o.level);
    if (rooms.length && !rooms.some((r) => pointInPolygon([o.position[0], o.position[2]], r.points))) push('warning', 'outsideRooms', o.id);
    const placement = item.placement ?? 'floor';
    if (placement === 'floor' && o.position[1] > 0.03 && o.position[1] < 0.6) push('info', 'floating', o.id, { height: o.position[1] });
    const size = item.sizeOf?.(o.params ?? {}) ?? item.size;
    if (placement === 'floor' && o.position[1] < 0.03 && size) floorObjects.push({ o, quad: footprint(o, size), rug: /rug|carpet|cushion/.test(item.id), seat: /chair|stool|bench/.test(item.id) && !/armchair|lounge/.test(item.id), table: /table|desk|island/.test(item.id) && !/side-table|coffee|bedside/.test(item.id) });
  }
  for (let i = 0; i < floorObjects.length; i++) {
    for (let j = i + 1; j < floorObjects.length; j++) {
      const A = floorObjects[i]; const B = floorObjects[j];
      if (A.rug || B.rug || A.o.level !== B.o.level) continue; // rugs lie under furniture on purpose
      if ((A.seat && B.table) || (A.table && B.seat)) continue; // chairs tuck under tables and desks
      const share = Math.max(overlapShare(A.quad, B.quad), overlapShare(B.quad, A.quad));
      if (share > 0.35) push('warning', 'objectsOverlap', B.o.id, { other: A.o.id, share: Math.round(share * 100) });
    }
  }

  // Walls drawn but no room yet: a hint, not an error.
  for (const level of project.levels) {
    if (project.walls.some((w) => w.level === level.id) && !project.rooms.some((r) => r.level === level.id)) push('info', 'noRooms', null, { level: level.name });
  }
  return out;
}

export const countBySeverity = (list) => ({ error: list.filter((p) => p.severity === 'error').length, warning: list.filter((p) => p.severity === 'warning').length, info: list.filter((p) => p.severity === 'info').length });

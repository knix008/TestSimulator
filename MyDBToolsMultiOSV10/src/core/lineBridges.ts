// Line bridges ("jumps"): where two relationship lines cross, one of them hops
// over the other in a small half circle, so a crossing never reads as a join.
//
// Which line hops: the more horizontal of the two segments at the crossing (as
// in Visio and draw.io); when they are equally steep, the line drawn later.
// Crossings next to a bend or a table end are left alone: a hop there would sit
// on the corner or on the cardinality mark.
import type { DbSchema } from '../types';
import type { Point } from './geometry';
import { getPathPoints, getRelationshipConnection } from './relationshipPath';

export interface Bridge {
  /** Segment of the hopping line (between path points `segment` and `segment + 1`). */
  segment: number;
  /** Where along that segment, 0..1. */
  t: number;
  point: Point;
}

/** A relationship's drawn path as straight pieces (a curve as its samples). */
export interface LinePath {
  id: string;
  points: Point[];
}

export function relationshipPaths(schema: DbSchema, liveRouteTableId?: string | null): LinePath[] {
  const out: LinePath[] = [];
  for (const rel of schema.Relationships) {
    const connection = getRelationshipConnection(schema, rel);
    if (!connection) continue;
    const live =
      !!liveRouteTableId &&
      rel.LineStyle === 'Orthogonal' &&
      (rel.SourceTableId === liveRouteTableId || rel.TargetTableId === liveRouteTableId);
    out.push({ id: rel.Id, points: getPathPoints(rel, connection, live) });
  }
  return out;
}

/** Where segments a→b and c→d cross strictly inside both, or null. */
function crossing(a: Point, b: Point, c: Point, d: Point): { t: number; u: number } | null {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  // Parallel or overlapping lines do not cross at a point: no hop.
  if (Math.abs(den) < 1e-9 * Math.max(1, Math.hypot(rx, ry) * Math.hypot(sx, sy))) return null;
  const qx = c.x - a.x;
  const qy = c.y - a.y;
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * ry - qy * rx) / den;
  if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return null;
  return { t, u };
}

/** How horizontal a segment is: 1 flat, 0 upright. */
function flatness(a: Point, b: Point): number {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return Math.abs(b.x - a.x) / len;
}

/**
 * The bridges each line draws, by relationship id. `radius` is the hop's
 * half-width in canvas units; a crossing closer than about a radius and a half
 * to either segment's end (a bend, or a table edge) gets no hop, and hops on
 * one segment closer than a hop's width merge into the first.
 */
export function findBridges(paths: LinePath[], radius: number): Map<string, Bridge[]> {
  const result = new Map<string, Bridge[]>();
  const keep = radius * 1.5;
  for (let i = 0; i < paths.length; i++) {
    for (let j = 0; j < i; j++) {
      const p = paths[i].points;
      const q = paths[j].points;
      for (let s = 0; s < p.length - 1; s++) {
        for (let k = 0; k < q.length - 1; k++) {
          const x = crossing(p[s], p[s + 1], q[k], q[k + 1]);
          if (!x) continue;
          const lenP = Math.hypot(p[s + 1].x - p[s].x, p[s + 1].y - p[s].y);
          const lenQ = Math.hypot(q[k + 1].x - q[k].x, q[k + 1].y - q[k].y);
          // Near an end of either piece: a corner, a table edge, or (on a curve)
          // just the joint between two samples. Curves are judged on the whole
          // line, so only real ends count there.
          const nearEnd = (t: number, len: number, pts: Point[], seg: number) => {
            const fromStart = t * len;
            const toEnd = (1 - t) * len;
            const atLineStart = seg === 0 || isCorner(pts, seg);
            const atLineEnd = seg === pts.length - 2 || isCorner(pts, seg + 1);
            return (atLineStart && fromStart < keep) || (atLineEnd && toEnd < keep);
          };
          if (nearEnd(x.t, lenP, p, s) || nearEnd(x.u, lenQ, q, k)) continue;
          const point = { x: p[s].x + (p[s + 1].x - p[s].x) * x.t, y: p[s].y + (p[s + 1].y - p[s].y) * x.t };
          // The flatter segment hops; on a tie the later line (i) does.
          const fi = flatness(p[s], p[s + 1]);
          const fj = flatness(q[k], q[k + 1]);
          if (fj > fi + 1e-6) add(result, paths[j].id, { segment: k, t: x.u, point });
          else add(result, paths[i].id, { segment: s, t: x.t, point });
        }
      }
    }
  }
  for (const [id, list] of result) result.set(id, tidy(list, radius));
  return result;
}

/** A path point where the line turns (not the joint between two curve samples). */
function isCorner(pts: Point[], i: number): boolean {
  if (i <= 0 || i >= pts.length - 1) return true;
  const ax = pts[i].x - pts[i - 1].x;
  const ay = pts[i].y - pts[i - 1].y;
  const bx = pts[i + 1].x - pts[i].x;
  const by = pts[i + 1].y - pts[i].y;
  const la = Math.hypot(ax, ay) || 1;
  const lb = Math.hypot(bx, by) || 1;
  // More than ~20° of turn is a corner; curve samples turn far less.
  return (ax * bx + ay * by) / (la * lb) < 0.94;
}

function add(map: Map<string, Bridge[]>, id: string, b: Bridge): void {
  const list = map.get(id);
  if (list) list.push(b);
  else map.set(id, [b]);
}

/** In path order, with hops that would overlap merged into the first. */
function tidy(list: Bridge[], radius: number): Bridge[] {
  list.sort((a, b) => a.segment - b.segment || a.t - b.t);
  const out: Bridge[] = [];
  for (const b of list) {
    const last = out[out.length - 1];
    if (last && Math.hypot(b.point.x - last.point.x, b.point.y - last.point.y) < radius * 2.2) continue;
    out.push(b);
  }
  return out;
}

/**
 * Trace a path with its hops into `ctx` (beginPath/stroke are the caller's).
 * Each hop is a half circle of `radius` that bulges up on a horizontal piece
 * and left on an upright one.
 */
export function traceWithBridges(
  ctx: Pick<CanvasRenderingContext2D, 'moveTo' | 'lineTo' | 'arc'>,
  pts: Point[],
  bridges: Bridge[],
  radius: number,
): void {
  ctx.moveTo(pts[0].x, pts[0].y);
  let bi = 0;
  for (let s = 0; s < pts.length - 1; s++) {
    const a = pts[s];
    const b = pts[s + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > 0) {
      const ux = (b.x - a.x) / len;
      const uy = (b.y - a.y) / len;
      while (bi < bridges.length && bridges[bi].segment === s) {
        const c = bridges[bi].point;
        bi++;
        ctx.lineTo(c.x - ux * radius, c.y - uy * radius);
        const theta = Math.atan2(uy, ux);
        // A clockwise arc from behind to ahead of the crossing bulges towards
        // (uy, -ux); flip it when that is not the wanted side.
        const flat = Math.abs(ux) >= Math.abs(uy);
        const want = flat ? { x: 0, y: -1 } : { x: -1, y: 0 };
        const anticlockwise = uy * want.x + -ux * want.y < 0;
        ctx.arc(c.x, c.y, radius, theta + Math.PI, theta, anticlockwise);
      }
    }
    ctx.lineTo(b.x, b.y);
  }
}

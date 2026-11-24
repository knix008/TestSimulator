// Port of Controls/RelationshipPathBuilder.cs
import type { DbRelationship, DbSchema } from '../types';
import {
  clamp,
  closestPointOnSegment,
  distance,
  getConnectionPoint,
  getTableBounds,
  getTableCenter,
  lerp,
  type Point,
  type Rect,
} from './geometry';
import { findTable } from './schema';

export type ConnectionEdge = 'Left' | 'Right' | 'Top' | 'Bottom';

export interface RelationshipConnectionInfo {
  start: Point;
  end: Point;
  startEdge: ConnectionEdge;
  endEdge: ConnectionEdge;
}

const BEZIER_SAMPLE_COUNT = 24;

export function getConnectionEdge(bounds: Rect, point: Point): ConnectionEdge {
  const dLeft = Math.abs(point.x - bounds.x);
  const dRight = Math.abs(point.x - (bounds.x + bounds.w));
  const dTop = Math.abs(point.y - bounds.y);
  const dBottom = Math.abs(point.y - (bounds.y + bounds.h));
  const min = Math.min(dLeft, dRight, dTop, dBottom);
  if (min === dLeft) return 'Left';
  if (min === dRight) return 'Right';
  if (min === dTop) return 'Top';
  return 'Bottom';
}

function isHorizontalEdge(edge: ConnectionEdge): boolean {
  return edge === 'Left' || edge === 'Right';
}

function getEdgeOffset(pt: Point, edge: ConnectionEdge, d: number): Point {
  switch (edge) {
    case 'Left':
      return { x: pt.x - d, y: pt.y };
    case 'Right':
      return { x: pt.x + d, y: pt.y };
    case 'Top':
      return { x: pt.x, y: pt.y - d };
    case 'Bottom':
      return { x: pt.x, y: pt.y + d };
    default:
      return pt;
  }
}

function getDefaultCubicControls(
  start: Point,
  end: Point,
  startEdge: ConnectionEdge,
  endEdge: ConnectionEdge,
): [Point, Point] {
  const dist = distance(start, end);
  const offset = clamp(dist * 0.4, 50, 180);
  return [getEdgeOffset(start, startEdge, offset), getEdgeOffset(end, endEdge, offset)];
}

function getDefaultOrthogonalBends(
  start: Point,
  end: Point,
  startEdge: ConnectionEdge,
  endEdge: ConnectionEdge,
): Point[] {
  const pad = 24;
  const startHorizontal = isHorizontalEdge(startEdge);
  const endHorizontal = isHorizontalEdge(endEdge);

  if (startHorizontal && endHorizontal) {
    if (Math.abs(start.y - end.y) < 0.5) return [];
    let midX = (start.x + end.x) * 0.5;
    if (startEdge === 'Right') midX = Math.max(midX, start.x + pad);
    if (startEdge === 'Left') midX = Math.min(midX, start.x - pad);
    if (endEdge === 'Left') midX = Math.min(midX, end.x - pad);
    if (endEdge === 'Right') midX = Math.max(midX, end.x + pad);
    return [
      { x: midX, y: start.y },
      { x: midX, y: end.y },
    ];
  }
  if (startHorizontal && !endHorizontal) return [{ x: end.x, y: start.y }];
  if (!startHorizontal && endHorizontal) return [{ x: start.x, y: end.y }];

  if (Math.abs(start.x - end.x) < 0.5) return [];
  let midY = (start.y + end.y) * 0.5;
  if (startEdge === 'Bottom') midY = Math.max(midY, start.y + pad);
  if (startEdge === 'Top') midY = Math.min(midY, start.y - pad);
  if (endEdge === 'Top') midY = Math.min(midY, end.y - pad);
  if (endEdge === 'Bottom') midY = Math.max(midY, end.y + pad);
  return [
    { x: start.x, y: midY },
    { x: end.x, y: midY },
  ];
}

export function ensureRoutePoints(
  rel: DbRelationship,
  start: Point,
  end: Point,
  startEdge: ConnectionEdge,
  endEdge: ConnectionEdge,
): void {
  rel.RoutePoints ??= [];
  if (rel.LineStyle === 'Straight') return;

  if (rel.LineStyle === 'Curved') {
    if (rel.RoutePoints.length === 1) {
      // Upgrade a legacy single control point to two cubic control points.
      const legacy = { x: rel.RoutePoints[0].X, y: rel.RoutePoints[0].Y };
      const cp1 = lerp(start, legacy, 0.6);
      const cp2 = lerp(legacy, end, 0.4);
      rel.RoutePoints = [
        { X: cp1.x, Y: cp1.y },
        { X: cp2.x, Y: cp2.y },
      ];
    } else if (rel.RoutePoints.length === 0) {
      const [cp1, cp2] = getDefaultCubicControls(start, end, startEdge, endEdge);
      rel.RoutePoints.push({ X: cp1.x, Y: cp1.y });
      rel.RoutePoints.push({ X: cp2.x, Y: cp2.y });
    }
    return;
  }

  if (rel.RoutePoints.length > 0) return;
  for (const bend of getDefaultOrthogonalBends(start, end, startEdge, endEdge)) {
    rel.RoutePoints.push({ X: bend.x, Y: bend.y });
  }
}

export function getCubicControls(
  rel: DbRelationship,
  start: Point,
  end: Point,
  startEdge: ConnectionEdge,
  endEdge: ConnectionEdge,
): [Point, Point] {
  ensureRoutePoints(rel, start, end, startEdge, endEdge);
  if (rel.RoutePoints && rel.RoutePoints.length >= 2) {
    return [
      { x: rel.RoutePoints[0].X, y: rel.RoutePoints[0].Y },
      { x: rel.RoutePoints[1].X, y: rel.RoutePoints[1].Y },
    ];
  }
  return getDefaultCubicControls(start, end, startEdge, endEdge);
}

function evaluateCubicBezier(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

function sampleCubicBezier(p0: Point, p1: Point, p2: Point, p3: Point): Point[] {
  const list: Point[] = [];
  for (let i = 0; i <= BEZIER_SAMPLE_COUNT; i++) {
    list.push(evaluateCubicBezier(p0, p1, p2, p3, i / BEZIER_SAMPLE_COUNT));
  }
  return list;
}

export function buildOrthogonalPath(
  start: Point,
  end: Point,
  startEdge: ConnectionEdge,
  endEdge: ConnectionEdge,
): Point[] {
  return [start, ...getDefaultOrthogonalBends(start, end, startEdge, endEdge), end];
}

export function getPathPoints(
  rel: DbRelationship,
  connection: RelationshipConnectionInfo,
  liveRoute = false,
): Point[] {
  const { start, end, startEdge, endEdge } = connection;
  if (liveRoute && rel.LineStyle === 'Orthogonal') {
    return buildOrthogonalPath(start, end, startEdge, endEdge);
  }
  ensureRoutePoints(rel, start, end, startEdge, endEdge);
  if (rel.LineStyle === 'Straight') return [start, end];
  if (rel.LineStyle === 'Curved') {
    const [cp1, cp2] = getCubicControls(rel, start, end, startEdge, endEdge);
    return sampleCubicBezier(start, cp1, cp2, end);
  }
  return [start, ...rel.RoutePoints.map((p) => ({ x: p.X, y: p.Y })), end];
}

function getPolylineMidpoint(pathPoints: Point[]): Point {
  if (pathPoints.length < 2) return pathPoints[0] ?? { x: 0, y: 0 };
  let total = 0;
  for (let i = 0; i < pathPoints.length - 1; i++) total += distance(pathPoints[i], pathPoints[i + 1]);
  const half = total / 2;
  let walked = 0;
  for (let i = 0; i < pathPoints.length - 1; i++) {
    const segment = distance(pathPoints[i], pathPoints[i + 1]);
    if (walked + segment >= half) {
      return lerp(pathPoints[i], pathPoints[i + 1], (half - walked) / Math.max(segment, 0.001));
    }
    walked += segment;
  }
  return pathPoints[Math.floor(pathPoints.length / 2)];
}

export function getPathMidpoint(
  rel: DbRelationship,
  connection: RelationshipConnectionInfo,
  liveRoute = false,
): Point {
  if (liveRoute && rel.LineStyle === 'Orthogonal') {
    return getPolylineMidpoint(
      buildOrthogonalPath(connection.start, connection.end, connection.startEdge, connection.endEdge),
    );
  }
  if (rel.LineStyle === 'Curved') {
    const [cp1, cp2] = getCubicControls(
      rel,
      connection.start,
      connection.end,
      connection.startEdge,
      connection.endEdge,
    );
    return evaluateCubicBezier(connection.start, cp1, cp2, connection.end, 0.5);
  }
  return getPolylineMidpoint(getPathPoints(rel, connection, liveRoute));
}

export function hitTestPath(
  rel: DbRelationship,
  point: Point,
  connection: RelationshipConnectionInfo,
  tolerance: number,
  liveRoute = false,
): boolean {
  const pathPoints = getPathPoints(rel, connection, liveRoute);
  for (let i = 0; i < pathPoints.length - 1; i++) {
    if (closestPointOnSegment(point, pathPoints[i], pathPoints[i + 1]).distance < tolerance) return true;
  }
  return false;
}

export function hitTestRoutePoint(
  rel: DbRelationship,
  point: Point,
  connection: RelationshipConnectionInfo,
  handleRadius: number,
): number {
  if (rel.LineStyle === 'Straight') return -1;
  ensureRoutePoints(rel, connection.start, connection.end, connection.startEdge, connection.endEdge);
  for (let i = 0; i < rel.RoutePoints.length; i++) {
    const rp = rel.RoutePoints[i];
    if (distance(point, { x: rp.X, y: rp.Y }) <= handleRadius) return i;
  }
  return -1;
}

export function resetRoutePoints(rel: DbRelationship, connection: RelationshipConnectionInfo): void {
  rel.RoutePoints = [];
  ensureRoutePoints(rel, connection.start, connection.end, connection.startEdge, connection.endEdge);
}

export function tryInsertOrthogonalBend(
  rel: DbRelationship,
  clickPoint: Point,
  connection: RelationshipConnectionInfo,
): number {
  if (rel.LineStyle !== 'Orthogonal') return -1;
  ensureRoutePoints(rel, connection.start, connection.end, connection.startEdge, connection.endEdge);
  const pathPoints = getPathPoints(rel, connection);
  let best = Number.MAX_VALUE;
  let bestSegment = -1;
  let bestPoint = clickPoint;
  for (let i = 0; i < pathPoints.length - 1; i++) {
    const r = closestPointOnSegment(clickPoint, pathPoints[i], pathPoints[i + 1]);
    if (r.distance < best) {
      best = r.distance;
      bestSegment = i;
      bestPoint = r.point;
    }
  }
  if (bestSegment < 0 || best > 18) return -1;
  const insertAt = Math.max(0, bestSegment - 1);
  rel.RoutePoints.splice(insertAt, 0, { X: bestPoint.x, Y: bestPoint.y });
  return insertAt;
}

function getNearestEdgeForPoint(bounds: Rect, pt: Point): ConnectionEdge {
  const left = bounds.x;
  const right = bounds.x + bounds.w;
  const top = bounds.y;
  const bottom = bounds.y + bounds.h;
  const isLeft = pt.x <= left;
  const isRight = pt.x >= right;
  const isAbove = pt.y <= top;
  const isBelow = pt.y >= bottom;

  if (isLeft && !isAbove && !isBelow) return 'Left';
  if (isRight && !isAbove && !isBelow) return 'Right';
  if (isAbove && !isLeft && !isRight) return 'Top';
  if (isBelow && !isLeft && !isRight) return 'Bottom';

  const dL = Math.abs(pt.x - left);
  const dR = Math.abs(pt.x - right);
  const dT = Math.abs(pt.y - top);
  const dB = Math.abs(pt.y - bottom);
  const min = Math.min(dL, dR, dT, dB);
  if (min === dL) return 'Left';
  if (min === dR) return 'Right';
  if (min === dT) return 'Top';
  return 'Bottom';
}

/** Slide the anchor along the chosen edge so the first/last segment stays axis-aligned. */
function getSlidingConnectionPoint(bounds: Rect, edge: ConnectionEdge, target: Point): Point {
  const left = bounds.x;
  const right = bounds.x + bounds.w;
  const top = bounds.y;
  const bottom = bounds.y + bounds.h;
  switch (edge) {
    case 'Left':
      return { x: left, y: clamp(target.y, top + 6, bottom - 6) };
    case 'Right':
      return { x: right, y: clamp(target.y, top + 6, bottom - 6) };
    case 'Top':
      return { x: clamp(target.x, left + 6, right - 6), y: top };
    default:
      return { x: clamp(target.x, left + 6, right - 6), y: bottom };
  }
}

/** Port of DiagramCanvas.TryGetRelationshipConnection. */
export function getRelationshipConnection(
  schema: DbSchema,
  rel: DbRelationship,
): RelationshipConnectionInfo | null {
  const src = findTable(schema, rel.SourceTableId);
  const dst = findTable(schema, rel.TargetTableId);
  if (!src || !dst) return null;

  const srcBounds = getTableBounds(src);
  const dstBounds = getTableBounds(dst);

  if (rel.LineStyle === 'Orthogonal' && rel.RoutePoints && rel.RoutePoints.length >= 1) {
    const firstBend = { x: rel.RoutePoints[0].X, y: rel.RoutePoints[0].Y };
    const lastBend = {
      x: rel.RoutePoints[rel.RoutePoints.length - 1].X,
      y: rel.RoutePoints[rel.RoutePoints.length - 1].Y,
    };
    const startEdge = getNearestEdgeForPoint(srcBounds, firstBend);
    const endEdge = getNearestEdgeForPoint(dstBounds, lastBend);
    return {
      start: getSlidingConnectionPoint(srcBounds, startEdge, firstBend),
      end: getSlidingConnectionPoint(dstBounds, endEdge, lastBend),
      startEdge,
      endEdge,
    };
  }

  const start = getConnectionPoint(src, getTableCenter(dst));
  const end = getConnectionPoint(dst, getTableCenter(src));
  return {
    start,
    end,
    startEdge: getConnectionEdge(srcBounds, start),
    endEdge: getConnectionEdge(dstBounds, end),
  };
}

/** Recompute orthogonal routes touching a table that just moved. */
export function resetOrthogonalRoutesForTable(schema: DbSchema, tableId: string): void {
  for (const rel of schema.Relationships) {
    if (rel.LineStyle !== 'Orthogonal') continue;
    if (rel.SourceTableId !== tableId && rel.TargetTableId !== tableId) continue;
    const connection = getRelationshipConnection(schema, rel);
    if (connection) resetRoutePoints(rel, connection);
  }
}

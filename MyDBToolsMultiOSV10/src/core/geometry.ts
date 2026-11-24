// Geometry shared by the canvas control and the image exporter.
// Ported from Controls/DiagramCanvas.cs (GetTableHeight / GetTableBounds / GetConnectionPoint).
import type { DbSchema, DbTable } from '../types';

export const HEADER_HEIGHT = 28;
export const ROW_HEIGHT = 22;
export const FOOTER_PAD = 4;
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 4;

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function getTableHeight(t: DbTable): number {
  const columnCount = t.Columns?.length ?? 0;
  return HEADER_HEIGHT + columnCount * ROW_HEIGHT + FOOTER_PAD;
}

export function getTableBounds(t: DbTable): Rect {
  return { x: t.X, y: t.Y, w: t.Width, h: getTableHeight(t) };
}

export function rectContains(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

export function getTableCenter(t: DbTable): Point {
  const b = getTableBounds(t);
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

/** Row index under a canvas point, or -1. */
export function getColumnIndexAt(t: DbTable, p: Point): number {
  const b = getTableBounds(t);
  if (!rectContains(b, p)) return -1;
  const rel = p.y - b.y - HEADER_HEIGHT;
  if (rel < 0) return -1;
  const idx = Math.floor(rel / ROW_HEIGHT);
  return idx >= 0 && idx < (t.Columns?.length ?? 0) ? idx : -1;
}

/**
 * Point on the table border along the ray from the table centre towards `from`.
 * Direct port of DiagramCanvas.GetConnectionPoint.
 */
export function getConnectionPoint(t: DbTable, from: Point): Point {
  const b = getTableBounds(t);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const dx = from.x - cx;
  const dy = from.y - cy;
  const hw = b.w / 2;
  const hh = b.h / 2;
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return { x: cx, y: b.y };
  if (Math.abs(dy) * hw > Math.abs(dx) * hh) {
    const sign = dy > 0 ? 1 : -1;
    const scale = hh / Math.abs(dy);
    return { x: cx + dx * scale, y: cy + sign * hh };
  }
  const sign = dx > 0 ? 1 : -1;
  const scale = hw / Math.abs(dx);
  return { x: cx + sign * hw, y: cy + dy * scale };
}

export function getAllTablesBounds(schema: DbSchema): Rect | null {
  if (!schema.Tables.length) return null;
  let minX = Number.MAX_VALUE;
  let minY = Number.MAX_VALUE;
  let maxX = -Number.MAX_VALUE;
  let maxY = -Number.MAX_VALUE;
  for (const t of schema.Tables) {
    const b = getTableBounds(t);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function distance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function lerp(a: Point, b: Point, amount: number): Point {
  return { x: a.x + (b.x - a.x) * amount, y: a.y + (b.y - a.y) * amount };
}

export function closestPointOnSegment(p: Point, a: Point, b: Point): { point: Point; distance: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 0.001) return { point: a, distance: distance(p, a) };
  const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  const point = lerp(a, b, t);
  return { point, distance: distance(p, point) };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

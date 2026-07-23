import type { EdgeAnchor } from './editorModel.js';

export type Point2 = { x: number; y: number };
export type Rect2 = { x: number; y: number; width: number; height: number };

const STUB_LENGTH = 28;
const DEFAULT_MARGIN = 16;

/**
 * Build an orthogonal polyline from source to target that prefers not to cross obstacles.
 * When a manual elbow offset is set, it is applied as a bias on the chosen corridor.
 */
export function routeOrthogonalAvoidingObstacles(options: {
  source: Point2;
  target: Point2;
  sourceAnchor?: EdgeAnchor;
  targetAnchor?: EdgeAnchor;
  elbow?: { dx: number; dy: number };
  obstacles: Rect2[];
  margin?: number;
}): Point2[] {
  const margin = options.margin ?? DEFAULT_MARGIN;
  const sourceAnchor = options.sourceAnchor ?? horizontalAnchorBetween(options.source, options.target);
  const targetAnchor = options.targetAnchor ?? horizontalAnchorBetween(options.target, options.source);
  const sourceDir = anchorDirection(sourceAnchor);
  const targetDir = anchorDirection(targetAnchor);
  const sourceStub = {
    x: options.source.x + sourceDir.x * STUB_LENGTH,
    y: options.source.y + sourceDir.y * STUB_LENGTH
  };
  const targetStub = {
    x: options.target.x + targetDir.x * STUB_LENGTH,
    y: options.target.y + targetDir.y * STUB_LENGTH
  };
  const dx = options.elbow?.dx ?? 0;
  const dy = options.elbow?.dy ?? 0;

  const inflated = options.obstacles.map((rect) => inflateRect(rect, margin));
  const candidates = buildCandidateRoutes(options.source, options.target, sourceStub, targetStub, sourceDir, targetDir, dx, dy, inflated);

  let bestClear: { points: Point2[]; length: number } | undefined;
  let bestAny: { points: Point2[]; length: number; crossings: number } | undefined;

  for (const points of candidates) {
    const path = simplifyOrthogonalPolyline(points);
    if (path.length < 2) {
      continue;
    }
    const length = polylineLength(path);
    const crossings = countObstacleCrossings(path, inflated, [options.source, options.target]);
    if (crossings === 0) {
      if (!bestClear || length < bestClear.length) {
        bestClear = { points: path, length };
      }
    } else if (!bestAny || crossings < bestAny.crossings || (crossings === bestAny.crossings && length < bestAny.length)) {
      bestAny = { points: path, length, crossings };
    }
  }

  return bestClear?.points ?? bestAny?.points ?? simplifyOrthogonalPolyline([options.source, sourceStub, targetStub, options.target]);
}

/** True when the straight segment between two points crosses any obstacle (ignoring endpoint nodes). */
export function straightCrossesObstacles(source: Point2, target: Point2, obstacles: Rect2[], margin = DEFAULT_MARGIN): boolean {
  const inflated = obstacles.map((rect) => inflateRect(rect, margin));
  return countObstacleCrossings([source, target], inflated, [source, target]) > 0;
}

function buildCandidateRoutes(
  source: Point2,
  target: Point2,
  sourceStub: Point2,
  targetStub: Point2,
  sourceDir: Point2,
  targetDir: Point2,
  dx: number,
  dy: number,
  obstacles: Rect2[]
): Point2[][] {
  const routes: Point2[][] = [];
  const push = (points: Point2[]) => routes.push(points);

  // Default / elbow-biased HV and VH style routes (matches previous editor behavior).
  if (targetDir.x !== 0) {
    const elbowX = targetStub.x + dx;
    const elbowY = sourceStub.y + dy;
    push([source, sourceStub, { x: sourceStub.x, y: elbowY }, { x: elbowX, y: elbowY }, { x: elbowX, y: targetStub.y }, targetStub, target]);
  } else {
    const elbowX = sourceStub.x + dx;
    const elbowY = targetStub.y + dy;
    push([source, sourceStub, { x: elbowX, y: sourceStub.y }, { x: elbowX, y: elbowY }, { x: targetStub.x, y: elbowY }, targetStub, target]);
  }

  // Opposite first bend preference.
  if (sourceDir.x !== 0) {
    const midX = Math.round((sourceStub.x + targetStub.x) / 2 + dx);
    push([source, sourceStub, { x: midX, y: sourceStub.y }, { x: midX, y: targetStub.y }, targetStub, target]);
  } else {
    const midY = Math.round((sourceStub.y + targetStub.y) / 2 + dy);
    push([source, sourceStub, { x: sourceStub.x, y: midY }, { x: targetStub.x, y: midY }, targetStub, target]);
  }

  // Wrap around the obstacle union in the corridor between stubs.
  const corridor = corridorBounds(sourceStub, targetStub, obstacles);
  if (corridor) {
    const pad = 12;
    const top = corridor.y - pad + dy;
    const bottom = corridor.y + corridor.height + pad + dy;
    const left = corridor.x - pad + dx;
    const right = corridor.x + corridor.width + pad + dx;

    push([source, sourceStub, { x: sourceStub.x, y: top }, { x: targetStub.x, y: top }, targetStub, target]);
    push([source, sourceStub, { x: sourceStub.x, y: bottom }, { x: targetStub.x, y: bottom }, targetStub, target]);
    push([source, sourceStub, { x: left, y: sourceStub.y }, { x: left, y: targetStub.y }, targetStub, target]);
    push([source, sourceStub, { x: right, y: sourceStub.y }, { x: right, y: targetStub.y }, targetStub, target]);

    // Three-sided wraps (U-shapes) around the cluster.
    push([
      source, sourceStub,
      { x: sourceStub.x, y: top },
      { x: left, y: top },
      { x: left, y: targetStub.y },
      targetStub, target
    ]);
    push([
      source, sourceStub,
      { x: sourceStub.x, y: top },
      { x: right, y: top },
      { x: right, y: targetStub.y },
      targetStub, target
    ]);
    push([
      source, sourceStub,
      { x: sourceStub.x, y: bottom },
      { x: left, y: bottom },
      { x: left, y: targetStub.y },
      targetStub, target
    ]);
    push([
      source, sourceStub,
      { x: sourceStub.x, y: bottom },
      { x: right, y: bottom },
      { x: right, y: targetStub.y },
      targetStub, target
    ]);
  }

  // Outside the overall obstacle field (global wrap).
  if (obstacles.length > 0) {
    const field = unionBounds(obstacles);
    if (field) {
      const pad = 20;
      const top = field.y - pad + dy;
      const bottom = field.y + field.height + pad + dy;
      const left = field.x - pad + dx;
      const right = field.x + field.width + pad + dx;
      push([source, sourceStub, { x: sourceStub.x, y: top }, { x: targetStub.x, y: top }, targetStub, target]);
      push([source, sourceStub, { x: sourceStub.x, y: bottom }, { x: targetStub.x, y: bottom }, targetStub, target]);
      push([source, sourceStub, { x: left, y: sourceStub.y }, { x: left, y: targetStub.y }, targetStub, target]);
      push([source, sourceStub, { x: right, y: sourceStub.y }, { x: right, y: targetStub.y }, targetStub, target]);
    }
  }

  return routes;
}

function corridorBounds(sourceStub: Point2, targetStub: Point2, obstacles: Rect2[]): Rect2 | undefined {
  const minX = Math.min(sourceStub.x, targetStub.x);
  const maxX = Math.max(sourceStub.x, targetStub.x);
  const minY = Math.min(sourceStub.y, targetStub.y);
  const maxY = Math.max(sourceStub.y, targetStub.y);
  const corridor = {
    x: minX - 8,
    y: minY - 8,
    width: Math.max(1, maxX - minX + 16),
    height: Math.max(1, maxY - minY + 16)
  };

  const overlapping = obstacles.filter((rect) => rectsOverlap(rect, corridor));
  return overlapping.length > 0 ? unionBounds(overlapping) : undefined;
}

function countObstacleCrossings(points: Point2[], obstacles: Rect2[], endpoints: Point2[]): number {
  let crossings = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    const isEndStub = index === 0 || index === points.length - 2;
    for (const obstacle of obstacles) {
      if (isEndStub && endpoints.some((point) => pointNearRect(point, obstacle, STUB_LENGTH + 8))) {
        continue;
      }
      if (segmentIntersectsRect(a, b, obstacle)) {
        crossings += 1;
      }
    }
  }
  return crossings;
}

function segmentIntersectsRect(a: Point2, b: Point2, rect: Rect2): boolean {
  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y;
  const bottom = rect.y + rect.height;

  // Both endpoints inside counts as crossing through the shape.
  if (pointInRect(a, rect) && pointInRect(b, rect)) {
    return true;
  }

  // Liang–Barsky style checks against the four sides.
  if (segmentIntersectsSegment(a, b, { x: left, y: top }, { x: right, y: top })) return true;
  if (segmentIntersectsSegment(a, b, { x: right, y: top }, { x: right, y: bottom })) return true;
  if (segmentIntersectsSegment(a, b, { x: right, y: bottom }, { x: left, y: bottom })) return true;
  if (segmentIntersectsSegment(a, b, { x: left, y: bottom }, { x: left, y: top })) return true;

  // One point inside and the other outside without touching a side (degenerate).
  if (pointInRect(a, rect) !== pointInRect(b, rect)) {
    return true;
  }

  return false;
}

function segmentIntersectsSegment(a: Point2, b: Point2, c: Point2, d: Point2): boolean {
  const orient = (p: Point2, q: Point2, r: Point2) => Math.sign((q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y));
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);

  if (o1 !== o2 && o3 !== o4) {
    return true;
  }

  const onSeg = (p: Point2, q: Point2, r: Point2) =>
    Math.min(p.x, r.x) <= q.x && q.x <= Math.max(p.x, r.x)
    && Math.min(p.y, r.y) <= q.y && q.y <= Math.max(p.y, r.y);

  if (o1 === 0 && onSeg(a, c, b)) return true;
  if (o2 === 0 && onSeg(a, d, b)) return true;
  if (o3 === 0 && onSeg(c, a, d)) return true;
  if (o4 === 0 && onSeg(c, b, d)) return true;
  return false;
}

function pointInRect(point: Point2, rect: Rect2): boolean {
  return point.x > rect.x && point.x < rect.x + rect.width && point.y > rect.y && point.y < rect.y + rect.height;
}

function pointNearRect(point: Point2, rect: Rect2, distance: number): boolean {
  const closestX = clamp(point.x, rect.x, rect.x + rect.width);
  const closestY = clamp(point.y, rect.y, rect.y + rect.height);
  return Math.hypot(point.x - closestX, point.y - closestY) <= distance;
}

function inflateRect(rect: Rect2, margin: number): Rect2 {
  return {
    x: rect.x - margin,
    y: rect.y - margin,
    width: rect.width + margin * 2,
    height: rect.height + margin * 2
  };
}

function rectsOverlap(a: Rect2, b: Rect2): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function unionBounds(rects: Rect2[]): Rect2 | undefined {
  if (rects.length === 0) {
    return undefined;
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const rect of rects) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function polylineLength(points: Point2[]): number {
  let length = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    length += Math.hypot(points[index + 1].x - points[index].x, points[index + 1].y - points[index].y);
  }
  return length;
}

function dedupe(points: Point2[]): Point2[] {
  return points.filter((point, index) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y);
}

function simplifyOrthogonalPolyline(points: Point2[]): Point2[] {
  const deduped = dedupe(points);
  if (deduped.length < 3) {
    return deduped;
  }

  const simplified: Point2[] = [deduped[0]];
  for (let index = 1; index < deduped.length - 1; index += 1) {
    const previous = simplified[simplified.length - 1];
    const current = deduped[index];
    const next = deduped[index + 1];
    const sameVertical = previous.x === current.x && current.x === next.x;
    const sameHorizontal = previous.y === current.y && current.y === next.y;

    if (!sameVertical && !sameHorizontal) {
      simplified.push(current);
    }
  }
  simplified.push(deduped[deduped.length - 1]);

  return simplified;
}

function anchorDirection(anchor: EdgeAnchor): Point2 {
  switch (anchor) {
    case 'left':
      return { x: -1, y: 0 };
    case 'right':
      return { x: 1, y: 0 };
    case 'top':
      return { x: 0, y: -1 };
    case 'bottom':
      return { x: 0, y: 1 };
  }
}

function horizontalAnchorBetween(source: Point2, target: Point2): EdgeAnchor {
  return target.x >= source.x ? 'right' : 'left';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export type Point2 = { x: number; y: number };

export type EdgePolyline = {
  id: string;
  points: Point2[];
  /** Edges that share an endpoint node should not get bridges where they meet. */
  endpointNodeIds: [string, string];
};

const BRIDGE_RADIUS = 7;
const ENDPOINT_SKIP = 18;

/**
 * For each edge, crossings where that edge should draw a bridge (jumps over earlier edges).
 * Later edges in the list jump over earlier ones.
 */
export function computeBridgeCrossings(edges: EdgePolyline[]): Map<string, Point2[]> {
  const bridges = new Map<string, Point2[]>();

  for (let later = 0; later < edges.length; later += 1) {
    const upper = edges[later];
    if (upper.points.length < 2) {
      continue;
    }
    const crossings: Point2[] = [];

    for (let earlier = 0; earlier < later; earlier += 1) {
      const lower = edges[earlier];
      if (lower.points.length < 2) {
        continue;
      }
      if (shareEndpoint(upper.endpointNodeIds, lower.endpointNodeIds)) {
        continue;
      }

      for (let ui = 0; ui < upper.points.length - 1; ui += 1) {
        for (let li = 0; li < lower.points.length - 1; li += 1) {
          const hit = segmentIntersection(upper.points[ui], upper.points[ui + 1], lower.points[li], lower.points[li + 1]);
          if (!hit) {
            continue;
          }
          if (nearPolylineEndpoint(hit, upper.points, ENDPOINT_SKIP) || nearPolylineEndpoint(hit, lower.points, ENDPOINT_SKIP)) {
            continue;
          }
          if (crossings.some((point) => Math.hypot(point.x - hit.x, point.y - hit.y) < BRIDGE_RADIUS)) {
            continue;
          }
          crossings.push(hit);
        }
      }
    }

    if (crossings.length > 0) {
      bridges.set(upper.id, crossings);
    }
  }

  return bridges;
}

/** Build an SVG path that gaps and arcs over each bridge crossing. */
export function polylinePathWithBridges(points: Point2[], crossings: Point2[], radius = BRIDGE_RADIUS): string {
  if (points.length < 2) {
    return '';
  }
  if (crossings.length === 0) {
    return pointsToPath(points);
  }

  const located = locateCrossingsOnPolyline(points, crossings, radius);
  if (located.length === 0) {
    return pointsToPath(points);
  }

  let path = `M ${points[0].x} ${points[0].y}`;
  let cursor = points[0];
  let locateIndex = 0;

  for (let segmentIndex = 0; segmentIndex < points.length - 1; segmentIndex += 1) {
    const start = points[segmentIndex];
    const end = points[segmentIndex + 1];
    const segmentCrossings: Array<{ t: number; point: Point2 }> = [];

    while (locateIndex < located.length && located[locateIndex].segmentIndex === segmentIndex) {
      segmentCrossings.push(located[locateIndex]);
      locateIndex += 1;
    }

    if (segmentCrossings.length === 0) {
      path += ` L ${end.x} ${end.y}`;
      cursor = end;
      continue;
    }

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length;
    const uy = dy / length;

    for (const crossing of segmentCrossings) {
      const gapStart = {
        x: crossing.point.x - ux * radius,
        y: crossing.point.y - uy * radius
      };
      const gapEnd = {
        x: crossing.point.x + ux * radius,
        y: crossing.point.y + uy * radius
      };

      // Keep gap inside the segment.
      const tStart = projectT(start, end, gapStart);
      const tEnd = projectT(start, end, gapEnd);
      if (tStart <= 0.02 || tEnd >= 0.98 || tEnd <= tStart) {
        continue;
      }

      path += ` L ${gapStart.x} ${gapStart.y}`;
      // Semicircle bulging to the left of travel direction.
      path += ` A ${radius} ${radius} 0 0 1 ${gapEnd.x} ${gapEnd.y}`;
      cursor = gapEnd;
    }

    path += ` L ${end.x} ${end.y}`;
    cursor = end;
  }

  void cursor;
  return path;
}

export function sampleQuadraticPoints(source: Point2, target: Point2, samples = 12): Point2[] {
  const control = {
    x: (source.x + target.x) / 2,
    y: Math.min(source.y, target.y) - 80
  };
  const points: Point2[] = [source];
  for (let index = 1; index < samples; index += 1) {
    const t = index / samples;
    const oneMinus = 1 - t;
    points.push({
      x: oneMinus * oneMinus * source.x + 2 * oneMinus * t * control.x + t * t * target.x,
      y: oneMinus * oneMinus * source.y + 2 * oneMinus * t * control.y + t * t * target.y
    });
  }
  points.push(target);
  return points;
}

function locateCrossingsOnPolyline(
  points: Point2[],
  crossings: Point2[],
  radius: number
): Array<{ segmentIndex: number; t: number; point: Point2 }> {
  const located: Array<{ segmentIndex: number; t: number; point: Point2 }> = [];

  for (const crossing of crossings) {
    let best: { segmentIndex: number; t: number; distance: number; point: Point2 } | undefined;
    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index];
      const end = points[index + 1];
      const projected = projectPointOnSegment(crossing, start, end);
      if (!projected) {
        continue;
      }
      const distance = Math.hypot(crossing.x - projected.point.x, crossing.y - projected.point.y);
      if (distance > 1.5) {
        continue;
      }
      const segmentLength = Math.hypot(end.x - start.x, end.y - start.y);
      if (segmentLength < radius * 2 + 4) {
        continue;
      }
      if (projected.t < radius / segmentLength || projected.t > 1 - radius / segmentLength) {
        continue;
      }
      if (!best || distance < best.distance) {
        best = { segmentIndex: index, t: projected.t, distance, point: projected.point };
      }
    }
    if (best) {
      located.push({ segmentIndex: best.segmentIndex, t: best.t, point: best.point });
    }
  }

  return located.sort((left, right) => left.segmentIndex - right.segmentIndex || left.t - right.t);
}

function projectPointOnSegment(point: Point2, start: Point2, end: Point2): { t: number; point: Point2 } | undefined {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq < 1e-6) {
    return undefined;
  }
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq, 0, 1);
  return {
    t,
    point: { x: start.x + dx * t, y: start.y + dy * t }
  };
}

function projectT(start: Point2, end: Point2, point: Point2): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq < 1e-6) {
    return 0;
  }
  return ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq;
}

function segmentIntersection(a1: Point2, a2: Point2, b1: Point2, b2: Point2): Point2 | undefined {
  const denom = (a2.x - a1.x) * (b2.y - b1.y) - (a2.y - a1.y) * (b2.x - b1.x);
  if (Math.abs(denom) < 1e-6) {
    return undefined; // parallel / collinear — no bridge
  }

  const t = ((b1.x - a1.x) * (b2.y - b1.y) - (b1.y - a1.y) * (b2.x - b1.x)) / denom;
  const u = ((b1.x - a1.x) * (a2.y - a1.y) - (b1.y - a1.y) * (a2.x - a1.x)) / denom;
  if (t <= 0.02 || t >= 0.98 || u <= 0.02 || u >= 0.98) {
    return undefined;
  }

  return {
    x: a1.x + t * (a2.x - a1.x),
    y: a1.y + t * (a2.y - a1.y)
  };
}

function shareEndpoint(left: [string, string], right: [string, string]): boolean {
  return left[0] === right[0] || left[0] === right[1] || left[1] === right[0] || left[1] === right[1];
}

function nearPolylineEndpoint(point: Point2, points: Point2[], distance: number): boolean {
  const first = points[0];
  const last = points[points.length - 1];
  return Math.hypot(point.x - first.x, point.y - first.y) <= distance
    || Math.hypot(point.x - last.x, point.y - last.y) <= distance;
}

function pointsToPath(points: Point2[]): string {
  if (points.length === 0) {
    return '';
  }
  const [start, ...rest] = points;
  return `M ${start.x} ${start.y}${rest.map((point) => ` L ${point.x} ${point.y}`).join('')}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

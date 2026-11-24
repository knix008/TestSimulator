// Relationship lines on every example: each path starts and ends on its two
// tables, an orthogonal path only turns at right angles, and its length stays in
// proportion to the distance it covers. Also the drag rule that once made lines
// run away: moving a segment repeatedly by the same total must land in one place.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { suite, test, expect } from '../helpers/runner.mjs';
import { geometry, relationshipPath, samples } from '../helpers/core.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const { getRelationshipConnection, getPathPoints, resetRoutePoints } = relationshipPath;

function pathLength(points) {
  let n = 0;
  for (let i = 1; i < points.length; i++) n += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return n;
}

function onEdge(point, bounds, tolerance = 2) {
  const inX = point.x >= bounds.x - tolerance && point.x <= bounds.x + bounds.w + tolerance;
  const inY = point.y >= bounds.y - tolerance && point.y <= bounds.y + bounds.h + tolerance;
  const nearX = Math.abs(point.x - bounds.x) <= tolerance || Math.abs(point.x - (bounds.x + bounds.w)) <= tolerance;
  const nearY = Math.abs(point.y - bounds.y) <= tolerance || Math.abs(point.y - (bounds.y + bounds.h)) <= tolerance;
  return (inX && nearY) || (inY && nearX);
}

suite('relationship lines', () => {
  for (const style of ['Straight', 'Curved', 'Orthogonal']) {
    test(`every example's ${style.toLowerCase()} lines start and end on their tables and stay short`, () => {
      for (const info of samples.SAMPLES) {
        const s = samples.createSample(info.id);
        for (const rel of s.Relationships) {
          rel.LineStyle = style;
          rel.RoutePoints = [];
          const connection = getRelationshipConnection(s, rel);
          expect(Boolean(connection)).toBeTruthy(`${info.id} ${rel.Name}`);
          if (style === 'Orthogonal') resetRoutePoints(rel, connection);
          const points = getPathPoints(rel, connection);
          expect(points.length >= 2).toBeTruthy(`${info.id} ${rel.Name} points`);
          const source = geometry.getTableBounds(s.Tables.find((t) => t.Id === rel.SourceTableId));
          const target = geometry.getTableBounds(s.Tables.find((t) => t.Id === rel.TargetTableId));
          const first = points[0];
          const last = points[points.length - 1];
          // A self-reference or the two ends can come out either way round.
          const ends = (onEdge(first, source) && onEdge(last, target)) || (onEdge(first, target) && onEdge(last, source));
          expect(ends).toBeTruthy(`${info.id} ${rel.Name} ends ${JSON.stringify([first, last])}`);
          const direct = Math.hypot(last.x - first.x, last.y - first.y);
          expect(pathLength(points) <= direct * 3 + 240).toBeTruthy(`${info.id} ${rel.Name} length ${Math.round(pathLength(points))} for ${Math.round(direct)}`);
          if (style === 'Orthogonal') {
            for (let i = 1; i < points.length; i++) {
              const a = points[i - 1];
              const b = points[i];
              expect(Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5).toBeTruthy(`${info.id} ${rel.Name} segment ${i}`);
            }
          }
        }
      }
    });
  }

  test('dragging a segment is measured from where the drag began, so it never runs away', () => {
    // The canvas applies "origin + total delta" on every pointer event. Ten
    // events of a 30 px drag must end 30 px away, not 10 × the accumulated sum.
    const origin = [{ X: 100, Y: 200 }, { X: 300, Y: 200 }];
    const route = origin.map((p) => ({ ...p }));
    for (let step = 1; step <= 10; step++) {
      const dy = 3 * step;
      for (const i of [0, 1]) route[i].Y = origin[i].Y + dy;
    }
    expect(route[0].Y).toBe(230);
    expect(route[1].Y).toBe(230);
    // And the canvas does exactly that: it keeps the route as it was at the press
    // and never adds the total delta to a point it has already moved.
    const canvas = readFileSync(path.join(root, 'src/components/DiagramCanvas.tsx'), 'utf8');
    expect(canvas).toContain('const start = drag.originRoute[routeIndex];');
    expect(canvas).toContain('rp.Y = snap(start.Y + dy)');
    expect(canvas).toContain('rp.X = snap(start.X + dx)');
    expect(canvas.includes('rp.Y = snap(rp.Y + dy)')).toBeFalsy();
  });
});

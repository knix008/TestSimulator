// Line bridges where relationship lines cross, and the orthogonal-route rules
// that keep a dragged line square: a bend brings its neighbours along, and two
// ends that nearly line up get a straight line instead of a tiny jog.
import { suite, test, expect } from '../helpers/runner.mjs';
import { lineBridges, relationshipPath, schema as schemaApi, geometry, samples } from '../helpers/core.mjs';

const { findBridges, traceWithBridges, relationshipPaths } = lineBridges;
const { moveOrthogonalBend, getRelationshipConnection, getPathPoints } = relationshipPath;

const line = (id, ...xy) => ({ id, points: xy.map(([x, y]) => ({ x, y })) });

function recorder() {
  const calls = [];
  return {
    calls,
    moveTo: (x, y) => calls.push(['moveTo', x, y]),
    lineTo: (x, y) => calls.push(['lineTo', x, y]),
    arc: (x, y, r, a0, a1, ccw) => calls.push(['arc', x, y, r, a0, a1, ccw]),
  };
}

suite('line bridges', () => {
  test('a horizontal line hops over a vertical one, whichever was drawn first', () => {
    const h = line('h', [0, 50], [100, 50]);
    const v = line('v', [50, 0], [50, 100]);
    for (const order of [[h, v], [v, h]]) {
      const b = findBridges(order, 6);
      expect(b.has('v')).toBeFalsy('the upright line does not hop');
      expect(b.get('h').length).toBe(1);
      expect(b.get('h')[0].point.x).toBeCloseTo(50);
      expect(b.get('h')[0].point.y).toBeCloseTo(50);
    }
  });

  test('two equally steep lines: the later one hops', () => {
    const a = line('a', [0, 0], [100, 100]);
    const b = line('b', [0, 100], [100, 0]);
    const r = findBridges([a, b], 6);
    expect(r.has('a')).toBeFalsy();
    expect(r.get('b').length).toBe(1);
  });

  test('no hop for parallel lines, lines that only touch, or crossings at a corner or a table end', () => {
    expect(findBridges([line('a', [0, 0], [100, 0]), line('b', [0, 10], [100, 10])], 6).size).toBe(0);
    expect(findBridges([line('a', [0, 0], [100, 0]), line('b', [20, 0], [80, 0])], 6).size).toBe(0);
    // b ends exactly on a (a table end touching another line).
    expect(findBridges([line('a', [0, 50], [100, 50]), line('b', [50, 0], [50, 50])], 6).size).toBe(0);
    // The crossing sits 4 px from a's bend at (50, 50): too close for a hop.
    const bent = line('a', [0, 50], [50, 50], [50, 100]);
    expect(findBridges([bent, line('b', [46, 0], [46, 100])], 6).size).toBe(0);
    // ...but 30 px away it hops.
    expect(findBridges([bent, line('b', [20, 0], [20, 100])], 6).get('a').length).toBe(1);
  });

  test('crossings closer than a hop merge into one; each line keeps its own order', () => {
    const h = line('h', [0, 50], [200, 50]);
    const r = findBridges([h, line('v1', [60, 0], [60, 100]), line('v2', [64, 0], [64, 100]), line('v3', [150, 0], [150, 100])], 6);
    const xs = r.get('h').map((b) => Math.round(b.point.x));
    expect(JSON.stringify(xs)).toBe('[60,150]');
  });

  test('traced hops: a half circle bulging up on a horizontal line, left on an upright one', () => {
    for (const [pts, cross, side] of [
      [[[0, 50], [100, 50]], [50, 50], 'up'],
      [[[100, 50], [0, 50]], [50, 50], 'up'],
      [[[50, 0], [50, 100]], [50, 50], 'left'],
      [[[50, 100], [50, 0]], [50, 50], 'left'],
    ]) {
      const ctx = recorder();
      const p = pts.map(([x, y]) => ({ x, y }));
      traceWithBridges(ctx, p, [{ segment: 0, t: 0.5, point: { x: cross[0], y: cross[1] } }], 6);
      const arc = ctx.calls.find((c) => c[0] === 'arc');
      expect(Boolean(arc)).toBeTruthy();
      const [, cx, cy, r, a0, a1, ccw] = arc;
      // The arc's middle, going the way canvas would draw it.
      let sweep = a1 - a0;
      if (!ccw && sweep < 0) sweep += Math.PI * 2;
      if (ccw && sweep > 0) sweep -= Math.PI * 2;
      const mid = a0 + sweep / 2;
      const mx = cx + r * Math.cos(mid);
      const my = cy + r * Math.sin(mid);
      if (side === 'up') expect(my < cy - r * 0.9).toBeTruthy(`${JSON.stringify(pts)} bulges up`);
      else expect(mx < cx - r * 0.9).toBeTruthy(`${JSON.stringify(pts)} bulges left`);
      // The line stops a radius short of the crossing and goes on to the end.
      const before = ctx.calls[1];
      expect(Math.hypot(before[1] - cross[0], before[2] - cross[1])).toBeCloseTo(6);
      const last = ctx.calls[ctx.calls.length - 1];
      expect(last[1]).toBe(p[1].x);
      expect(last[2]).toBe(p[1].y);
    }
  });

  test('every example in every line style: hops only where lines really cross, never at a table', () => {
    for (const info of samples.SAMPLES) {
      for (const style of ['Straight', 'Curved', 'Orthogonal']) {
        const s = samples.createSample(info.id);
        for (const rel of s.Relationships) {
          rel.LineStyle = style;
          rel.RoutePoints = [];
        }
        const paths = relationshipPaths(s);
        const bridges = findBridges(paths, 6);
        for (const [id, list] of bridges) {
          const rel = s.Relationships.find((r) => r.Id === id);
          for (const b of list) {
            for (const tid of [rel.SourceTableId, rel.TargetTableId]) {
              const t = geometry.getTableBounds(s.Tables.find((x) => x.Id === tid));
              const inside = b.point.x > t.x + 1 && b.point.x < t.x + t.w - 1 && b.point.y > t.y + 1 && b.point.y < t.y + t.h - 1;
              expect(inside).toBeFalsy(`${info.id} ${style} ${rel.Name} hop inside its own table`);
            }
            // The hop really is on another line.
            const others = paths.filter((p) => p.id !== id);
            const onOther = others.some((p) => p.points.some((q, i) => i > 0 && distToSeg(b.point, p.points[i - 1], q) < 0.5));
            expect(onOther).toBeTruthy(`${info.id} ${style} ${rel.Name} hop on another line`);
          }
        }
      }
    }
  });
});

function distToSeg(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

suite('orthogonal routes stay square', () => {
  const square = (pts) => pts.every((p, i) => i === 0 || Math.abs(p.X - pts[i - 1].X) < 0.5 || Math.abs(p.Y - pts[i - 1].Y) < 0.5);

  test('dragging a bend brings its neighbours along', () => {
    // A Z route: across, down, across.
    const origin = [{ X: 200, Y: 100 }, { X: 200, Y: 300 }];
    const moved = moveOrthogonalBend(origin, 0, { x: 240, y: 130 });
    expect(JSON.stringify(moved)).toBe(JSON.stringify([{ X: 240, Y: 130 }, { X: 240, Y: 300 }]));
    expect(square(moved)).toBeTruthy();
    // Three bends: the middle one moves both neighbours, each along its shared line.
    const three = [{ X: 100, Y: 50 }, { X: 100, Y: 150 }, { X: 300, Y: 150 }];
    const m = moveOrthogonalBend(three, 1, { x: 130, y: 170 });
    expect(JSON.stringify(m)).toBe(JSON.stringify([{ X: 130, Y: 50 }, { X: 130, Y: 170 }, { X: 300, Y: 170 }]));
    expect(square(m)).toBeTruthy();
  });

  test('measured from the press: many small moves land in one place', () => {
    const origin = [{ X: 200, Y: 100 }, { X: 200, Y: 300 }];
    let route = origin;
    for (let i = 1; i <= 40; i++) route = moveOrthogonalBend(origin, 1, { x: 200 + i * 2, y: 300 + i });
    expect(JSON.stringify(route)).toBe(JSON.stringify([{ X: 280, Y: 100 }, { X: 280, Y: 340 }]));
  });

  test('two tables almost level get a straight line, not a jog of a few pixels', () => {
    const s = schemaApi.newSchema('t');
    const a = schemaApi.newTable({ Name: 'a', X: 0, Y: 100 });
    const b = schemaApi.newTable({ Name: 'b', X: 400, Y: 105 });
    s.Tables.push(a, b);
    const rel = schemaApi.newRelationship({ SourceTableId: a.Id, TargetTableId: b.Id, LineStyle: 'Orthogonal' });
    s.Relationships.push(rel);
    let c = getRelationshipConnection(s, rel);
    getPathPoints(rel, c); // creates the route
    expect(rel.RoutePoints.length).toBe(1);
    c = getRelationshipConnection(s, rel);
    const pts = getPathPoints(rel, c);
    expect(pts.every((p) => Math.abs(p.y - pts[0].y) < 0.5)).toBeTruthy(`straight: ${JSON.stringify(pts)}`);
  });
});

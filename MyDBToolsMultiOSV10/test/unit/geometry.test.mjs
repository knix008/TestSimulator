// Canvas geometry, relationship routing and auto layout.
import { suite, test, expect } from '../helpers/runner.mjs';
import { geometry, layout, relationshipPath, sampleSchema, schema } from '../helpers/core.mjs';

const table = (props) => schema.newTable({ Name: 'g', X: 100, Y: 100, Width: 200, ...props });

suite('geometry', () => {
  test('table height = header + rows + footer padding', () => {
    const t = table({ Columns: [schema.newColumn(), schema.newColumn()] });
    expect(geometry.getTableHeight(t)).toBe(28 + 2 * 22 + 4);
    expect(geometry.getTableHeight(table({ Columns: [] }))).toBe(32);
  });

  test('bounds follow position and width', () => {
    const b = geometry.getTableBounds(table({ Columns: [schema.newColumn()] }));
    expect(b.x).toBe(100);
    expect(b.y).toBe(100);
    expect(b.w).toBe(200);
    expect(b.h).toBe(54);
  });

  test('rectContains covers edges', () => {
    const r = { x: 0, y: 0, w: 10, h: 10 };
    expect(geometry.rectContains(r, { x: 0, y: 0 })).toBeTruthy();
    expect(geometry.rectContains(r, { x: 10, y: 10 })).toBeTruthy();
    expect(geometry.rectContains(r, { x: 11, y: 5 })).toBeFalsy();
  });

  test('connection point leaves through the nearest edge', () => {
    const t = table({ Columns: [schema.newColumn(), schema.newColumn()] });
    const height = geometry.getTableHeight(t);
    const right = geometry.getConnectionPoint(t, { x: 5000, y: 100 + height / 2 });
    expect(Math.round(right.x)).toBe(300);
    const below = geometry.getConnectionPoint(t, { x: 200, y: 5000 });
    expect(Math.round(below.y)).toBe(100 + height);
    const above = geometry.getConnectionPoint(t, { x: 200, y: -5000 });
    expect(Math.round(above.y)).toBe(100);
  });

  test('a point at the exact centre falls back to the top edge', () => {
    const t = table({ Columns: [schema.newColumn()] });
    const c = geometry.getTableCenter(t);
    expect(geometry.getConnectionPoint(t, c).y).toBe(100);
  });

  test('getColumnIndexAt maps y to a row', () => {
    const t = table({ Columns: [schema.newColumn(), schema.newColumn(), schema.newColumn()] });
    expect(geometry.getColumnIndexAt(t, { x: 150, y: 100 + 28 + 1 })).toBe(0);
    expect(geometry.getColumnIndexAt(t, { x: 150, y: 100 + 28 + 23 })).toBe(1);
    expect(geometry.getColumnIndexAt(t, { x: 150, y: 110 })).toBe(-1, 'header row');
    expect(geometry.getColumnIndexAt(t, { x: 1000, y: 130 })).toBe(-1, 'outside');
  });

  test('bounds of every table, and null when empty', () => {
    expect(geometry.getAllTablesBounds(schema.newSchema('empty'))).toBe(null);
    const b = geometry.getAllTablesBounds(sampleSchema.createOnlineShopSchema());
    expect(b.w).toBeGreaterThan(0);
    expect(b.h).toBeGreaterThan(0);
  });

  test('clamp and distance', () => {
    expect(geometry.clamp(5, 0, 3)).toBe(3);
    expect(geometry.clamp(-5, 0, 3)).toBe(0);
    expect(geometry.distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  test('closestPointOnSegment clamps to the ends', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 0 };
    expect(geometry.closestPointOnSegment({ x: 5, y: 5 }, a, b).distance).toBe(5);
    expect(geometry.closestPointOnSegment({ x: -5, y: 0 }, a, b).point.x).toBe(0);
    expect(geometry.closestPointOnSegment({ x: 99, y: 0 }, a, b).point.x).toBe(10);
  });
});

suite('relationship routing', () => {
  const styles = ['Straight', 'Curved', 'Orthogonal'];

  for (const style of styles) {
    test(`${style}: path is finite and hit-testable at its midpoint`, () => {
      const s = sampleSchema.createOnlineShopSchema();
      for (const r of s.Relationships) {
        r.LineStyle = style;
        r.RoutePoints = [];
      }
      const rel = s.Relationships[0];
      const connection = relationshipPath.getRelationshipConnection(s, rel);
      expect(connection).toBeTruthy();

      const points = relationshipPath.getPathPoints(rel, connection);
      expect(points.length).toBeGreaterThan(1);
      expect(points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBeTruthy();

      const mid = relationshipPath.getPathMidpoint(rel, connection);
      expect(Number.isFinite(mid.x) && Number.isFinite(mid.y)).toBeTruthy();
      expect(relationshipPath.hitTestPath(rel, mid, connection, 4)).toBeTruthy();
      expect(
        relationshipPath.hitTestPath(rel, { x: mid.x + 5000, y: mid.y + 5000 }, connection, 4),
      ).toBeFalsy();
    });
  }

  test('orthogonal segments are axis-aligned', () => {
    const s = sampleSchema.createOnlineShopSchema();
    const rel = s.Relationships[0];
    rel.LineStyle = 'Orthogonal';
    rel.RoutePoints = [];
    const pts = relationshipPath.getPathPoints(rel, relationshipPath.getRelationshipConnection(s, rel));
    for (let i = 0; i < pts.length - 1; i++) {
      const dx = Math.abs(pts[i].x - pts[i + 1].x);
      const dy = Math.abs(pts[i].y - pts[i + 1].y);
      expect(dx < 0.5 || dy < 0.5).toBeTruthy(`segment ${i} is diagonal`);
    }
  });

  test('curved routes materialise two cubic control points', () => {
    const s = sampleSchema.createOnlineShopSchema();
    const rel = s.Relationships[0];
    rel.LineStyle = 'Curved';
    rel.RoutePoints = [];
    relationshipPath.getPathPoints(rel, relationshipPath.getRelationshipConnection(s, rel));
    expect(rel.RoutePoints).toHaveLength(2);
  });

  test('a legacy single control point is upgraded to a cubic pair', () => {
    const s = sampleSchema.createOnlineShopSchema();
    const rel = s.Relationships[0];
    rel.LineStyle = 'Curved';
    rel.RoutePoints = [{ X: 400, Y: 400 }];
    relationshipPath.getPathPoints(rel, relationshipPath.getRelationshipConnection(s, rel));
    expect(rel.RoutePoints).toHaveLength(2);
  });

  test('a relationship pointing at a missing table resolves to null', () => {
    const s = sampleSchema.createOnlineShopSchema();
    s.Relationships[0].TargetTableId = 'gone';
    expect(relationshipPath.getRelationshipConnection(s, s.Relationships[0])).toBe(null);
  });

  test('inserting a bend adds a route point', () => {
    const s = sampleSchema.createOnlineShopSchema();
    const rel = s.Relationships[0];
    rel.LineStyle = 'Orthogonal';
    rel.RoutePoints = [];
    const connection = relationshipPath.getRelationshipConnection(s, rel);
    // Materialise the default bends first: inserting also ensures them, so
    // counting from the empty array would measure both effects at once.
    relationshipPath.getPathPoints(rel, connection);
    const before = rel.RoutePoints.length;
    const mid = relationshipPath.getPathMidpoint(rel, connection);
    const index = relationshipPath.tryInsertOrthogonalBend(rel, mid, connection);
    expect(index).toBeGreaterThan(-1);
    expect(rel.RoutePoints.length).toBe(before + 1);
  });

  test('a straight line has no bends to insert', () => {
    const s = sampleSchema.createOnlineShopSchema();
    const rel = s.Relationships[0];
    rel.LineStyle = 'Straight';
    const connection = relationshipPath.getRelationshipConnection(s, rel);
    expect(relationshipPath.tryInsertOrthogonalBend(rel, { x: 0, y: 0 }, connection)).toBe(-1);
  });

  test('moving a table re-routes its orthogonal relationships', () => {
    const s = sampleSchema.createOnlineShopSchema();
    const rel = s.Relationships[0];
    rel.LineStyle = 'Orthogonal';
    rel.RoutePoints = [];
    relationshipPath.getPathPoints(rel, relationshipPath.getRelationshipConnection(s, rel));
    const before = JSON.stringify(rel.RoutePoints);
    const parent = s.Tables.find((t) => t.Id === rel.SourceTableId);
    parent.X += 400;
    parent.Y += 260;
    relationshipPath.resetOrthogonalRoutesForTable(s, parent.Id);
    expect(JSON.stringify(rel.RoutePoints) !== before).toBeTruthy('route did not change');
  });
});

suite('layout', () => {
  test('auto arrange separates every table', () => {
    const s = sampleSchema.createOnlineShopSchema();
    layout.autoArrange(s);
    expect(s.Tables.every((t) => t.X >= 0 && t.Y >= 0)).toBeTruthy();
    expect(new Set(s.Tables.map((t) => `${t.X},${t.Y}`)).size).toBe(s.Tables.length);
  });

  test('auto arrange tolerates an empty schema', () => {
    layout.autoArrange(schema.newSchema('empty'));
    expect(true).toBeTruthy();
  });

  test('fitTableWidths stays inside the min/max bounds', () => {
    const s = sampleSchema.createOnlineShopSchema();
    layout.fitTableWidths(s);
    for (const t of s.Tables) {
      expect(t.Width).toBeGreaterThan(209);
      expect(t.Width).toBeLessThanOrEqual(720);
    }
  });

  test('a table with long column names gets wider than the minimum', () => {
    const t = schema.newTable({
      Name: 'wide',
      Columns: [schema.newColumn({ Name: 'a_very_long_column_name_for_measurement', DataType: 'VARCHAR', Length: 255 })],
    });
    layout.fitTableWidth(t, 'PostgreSQL');
    expect(t.Width).toBeGreaterThan(210);
  });
});

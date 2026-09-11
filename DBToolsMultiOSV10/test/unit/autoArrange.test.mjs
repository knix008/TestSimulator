// Auto arrange has one job beyond "not overlapping": the relationship lines it
// leaves behind have to be visible. These tests measure that directly — they
// take the paths the renderer would actually draw and check nothing sits on
// top of them.
import { suite, test, expect } from '../helpers/runner.mjs';
import { geometry, layout, relationshipPath, sampleSchema, schema } from '../helpers/core.mjs';

function rectOf(table) {
  return geometry.getTableBounds(table);
}

function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Does the segment p→q pass through rect? Liang–Barsky clipping. */
function segmentHitsRect(p, q, rect) {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  let t0 = 0;
  let t1 = 1;
  const edges = [
    [-dx, p.x - rect.x],
    [dx, rect.x + rect.w - p.x],
    [-dy, p.y - rect.y],
    [dy, rect.y + rect.h - p.y],
  ];
  for (const [den, num] of edges) {
    if (den === 0) {
      if (num < 0) return false;
      continue;
    }
    const t = num / den;
    if (den < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
  }
  return t1 > t0;
}

/** Every relationship line, as the list of points the renderer draws. */
function relationshipPaths(s) {
  const out = [];
  for (const rel of s.Relationships) {
    const connection = relationshipPath.getRelationshipConnection(s, rel);
    if (!connection) continue;
    out.push({ rel, points: relationshipPath.getPathPoints(rel, connection) });
  }
  return out;
}

/** Tables a relationship line crosses that are not its own endpoints. */
function obscuringTables(s) {
  const hits = [];
  for (const { rel, points } of relationshipPaths(s)) {
    for (const table of s.Tables) {
      if (table.Id === rel.SourceTableId || table.Id === rel.TargetTableId) continue;
      // Shrink by a pixel: a line grazing the border is not "hidden".
      const r = rectOf(table);
      const inner = { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 };
      for (let i = 0; i < points.length - 1; i++) {
        if (segmentHitsRect(points[i], points[i + 1], inner)) {
          hits.push(`${rel.Name || rel.Id} crosses ${table.Name}`);
          break;
        }
      }
    }
  }
  return hits;
}

/** A chain a → b → c → ... of one-to-many relationships. */
function chainSchema(length) {
  const s = schema.newSchema('chain');
  for (let i = 0; i < length; i++) {
    s.Tables.push(
      schema.newTable({
        Name: `t${i}`,
        Columns: [
          schema.newColumn({ Name: 'id', DataType: 'INTEGER', IsPrimaryKey: true }),
          schema.newColumn({ Name: 'parent_id', DataType: 'INTEGER' }),
        ],
      }),
    );
  }
  for (let i = 0; i + 1 < length; i++) {
    s.Relationships.push(
      schema.newRelationship({
        Name: `fk${i}`,
        SourceTableId: s.Tables[i].Id,
        SourceColumnId: s.Tables[i].Columns[0].Id,
        TargetTableId: s.Tables[i + 1].Id,
        TargetColumnId: s.Tables[i + 1].Columns[1].Id,
      }),
    );
  }
  return s;
}

/** One parent with `count` children — the classic star. */
function starSchema(count) {
  const s = schema.newSchema('star');
  const parent = schema.newTable({
    Name: 'hub',
    Columns: [schema.newColumn({ Name: 'id', DataType: 'INTEGER', IsPrimaryKey: true })],
  });
  s.Tables.push(parent);
  for (let i = 0; i < count; i++) {
    const child = schema.newTable({
      Name: `leaf${i}`,
      Columns: [
        schema.newColumn({ Name: 'id', DataType: 'INTEGER', IsPrimaryKey: true }),
        schema.newColumn({ Name: 'hub_id', DataType: 'INTEGER' }),
      ],
    });
    s.Tables.push(child);
    s.Relationships.push(
      schema.newRelationship({
        Name: `fk_${i}`,
        SourceTableId: parent.Id,
        SourceColumnId: parent.Columns[0].Id,
        TargetTableId: child.Id,
        TargetColumnId: child.Columns[1].Id,
      }),
    );
  }
  return s;
}

suite('auto arrange · tables do not collide', () => {
  const cases = [
    ['the sample schema', sampleSchema.createOnlineShopSchema()],
    ['a chain of 6', chainSchema(6)],
    ['a star of 8', starSchema(8)],
  ];

  for (const [name, s] of cases) {
    test(`${name} leaves every table clear of the others`, () => {
      layout.autoArrange(s);
      for (let i = 0; i < s.Tables.length; i++) {
        for (let j = i + 1; j < s.Tables.length; j++) {
          expect(overlaps(rectOf(s.Tables[i]), rectOf(s.Tables[j]))).toBeFalsy(
            `${s.Tables[i].Name} overlaps ${s.Tables[j].Name}`,
          );
        }
      }
    });
  }

  test('unrelated tables are laid out too', () => {
    const s = schema.newSchema('loose');
    for (let i = 0; i < 5; i++) {
      s.Tables.push(schema.newTable({ Name: `solo${i}`, Columns: [schema.newColumn()] }));
    }
    layout.autoArrange(s);
    expect(new Set(s.Tables.map((t) => `${t.X},${t.Y}`)).size).toBe(5);
  });
});

suite('auto arrange · relationship lines stay visible', () => {
  test('the sample schema hides no line behind a table', () => {
    const s = sampleSchema.createOnlineShopSchema();
    layout.autoArrange(s);
    expect(obscuringTables(s)).toHaveLength(0);
  });

  test('a chain hides no line', () => {
    const s = chainSchema(6);
    layout.autoArrange(s);
    expect(obscuringTables(s)).toHaveLength(0);
  });

  test('a star hides no line', () => {
    const s = starSchema(8);
    layout.autoArrange(s);
    expect(obscuringTables(s)).toHaveLength(0);
  });

  test('every relationship still has a drawable path', () => {
    const s = sampleSchema.createOnlineShopSchema();
    layout.autoArrange(s);
    expect(relationshipPaths(s)).toHaveLength(s.Relationships.length);
  });
});

suite('auto arrange · related tables end up together', () => {
  test('a child sits to the right of its parent', () => {
    const s = chainSchema(5);
    layout.autoArrange(s);
    for (let i = 0; i + 1 < s.Tables.length; i++) {
      expect(s.Tables[i + 1].X).toBeGreaterThan(s.Tables[i].X);
    }
  });

  test('the layout is compact rather than spread out', () => {
    const s = sampleSchema.createOnlineShopSchema();
    layout.autoArrange(s);
    const bounds = geometry.getAllTablesBounds(s);
    const area = s.Tables.reduce((sum, t) => sum + t.Width * geometry.getTableHeight(t), 0);
    // Tables should fill a decent share of the box they sit in. The old grid
    // left them at roughly a fifth of it.
    expect(area / (bounds.w * bounds.h)).toBeGreaterThan(0.3);
  });

  test('the same schema always lays out the same way', () => {
    const a = sampleSchema.createOnlineShopSchema();
    const b = sampleSchema.createOnlineShopSchema();
    layout.autoArrange(a);
    layout.autoArrange(b);
    const at = (s) => s.Tables.map((t) => `${t.Name}:${t.X},${t.Y}`).join('|');
    expect(at(a)).toBe(at(b));
  });

  test('arranging twice does not drift', () => {
    const s = sampleSchema.createOnlineShopSchema();
    layout.autoArrange(s);
    const first = s.Tables.map((t) => `${t.X},${t.Y}`).join('|');
    layout.autoArrange(s);
    expect(s.Tables.map((t) => `${t.X},${t.Y}`).join('|')).toBe(first);
  });
});

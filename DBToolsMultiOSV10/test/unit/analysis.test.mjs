// Normalization analyzer (1NF–5NF) and the index advisor.
import { suite, test, expect } from '../helpers/runner.mjs';
import { indexAdvisor, normalization, sampleSchema, schema } from '../helpers/core.mjs';

const { analyze, analyzeLevels, levelPasses, cumulativeLevelsUpTo, formatLevelsLabel, getLevelLabel } =
  normalization;

/** Build a one-table schema from column specs. */
function withColumns(...columns) {
  const s = schema.newSchema('t');
  s.Tables.push(schema.newTable({ Name: 't', Columns: columns.map((c) => schema.newColumn(c)) }));
  return s;
}

suite('normalization · labels', () => {
  test('level labels', () => {
    expect(getLevelLabel('NF1')).toBe('1NF');
    expect(getLevelLabel('BCNF')).toBe('BCNF');
    expect(getLevelLabel('NF5')).toBe('5NF');
  });

  test('cumulative levels', () => {
    expect(cumulativeLevelsUpTo('NF3').join(',')).toBe('NF1,NF2,NF3');
    expect(cumulativeLevelsUpTo('NF5')).toHaveLength(6);
    expect(cumulativeLevelsUpTo('NF1')).toHaveLength(1);
  });

  test('levels label keeps catalogue order', () => {
    expect(formatLevelsLabel(['NF3', 'NF1'])).toBe('1NF · 3NF');
    expect(formatLevelsLabel([])).toBe('1NF');
  });
});

suite('normalization · 1NF', () => {
  test('a missing primary key is an error', () => {
    const issues = analyzeLevels(withColumns({ Name: 'a', DataType: 'TEXT' }), ['NF1']);
    const errors = issues.filter((i) => i.Severity === 'Error');
    expect(errors).toHaveLength(1);
    expect(errors[0].Level).toBe('NF1');
    expect(levelPasses(withColumns({ Name: 'a', DataType: 'TEXT' }), 'NF1')).toBeFalsy();
  });

  test('a table with a PK passes 1NF', () => {
    const s = withColumns({ Name: 'id', DataType: 'INTEGER', IsPrimaryKey: true });
    expect(levelPasses(s, 'NF1')).toBeTruthy();
  });

  test('repeating groups are detected', () => {
    const s = withColumns(
      { Name: 'id', DataType: 'INTEGER', IsPrimaryKey: true },
      { Name: 'phone1', DataType: 'TEXT' },
      { Name: 'phone2', DataType: 'TEXT' },
      { Name: 'phone3', DataType: 'TEXT' },
    );
    const hit = analyzeLevels(s, ['NF1']).find((i) => i.Message.includes('반복 그룹'));
    expect(hit).toBeTruthy();
    expect(hit.AffectedColumns).toContain('phone1');
    expect(hit.AffectedColumns).toContain('phone3');
  });

  test('two numbered columns are not enough for a group', () => {
    const s = withColumns(
      { Name: 'id', DataType: 'INTEGER', IsPrimaryKey: true },
      { Name: 'phone1', DataType: 'TEXT' },
    );
    expect(analyzeLevels(s, ['NF1']).some((i) => i.Message.includes('반복 그룹'))).toBeFalsy();
  });

  test('non-atomic types are flagged as info', () => {
    const s = withColumns(
      { Name: 'id', DataType: 'INTEGER', IsPrimaryKey: true },
      { Name: 'meta', DataType: 'JSONB' },
    );
    const hit = analyzeLevels(s, ['NF1']).find((i) => i.Severity === 'Info');
    expect(hit.AffectedColumns).toBe('meta');
  });
});

suite('normalization · 2NF/3NF/BCNF', () => {
  test('a composite primary key raises a 2NF warning', () => {
    const s = withColumns(
      { Name: 'a', DataType: 'INTEGER', IsPrimaryKey: true },
      { Name: 'b', DataType: 'INTEGER', IsPrimaryKey: true },
    );
    const hit = analyzeLevels(s, ['NF2']).find((i) => i.Level === 'NF2');
    expect(hit.Severity).toBe('Warning');
  });

  test('levels not selected are not reported', () => {
    const s = withColumns(
      { Name: 'a', DataType: 'INTEGER', IsPrimaryKey: true },
      { Name: 'b', DataType: 'INTEGER', IsPrimaryKey: true },
    );
    expect(analyzeLevels(s, ['NF1']).filter((i) => i.Level === 'NF2')).toHaveLength(0);
  });

  test('transitive dependency is a 3NF warning', () => {
    const s = withColumns(
      { Name: 'id', DataType: 'INTEGER', IsPrimaryKey: true },
      { Name: 'dept_id', DataType: 'INTEGER' },
      { Name: 'dept_name', DataType: 'TEXT' },
    );
    const hit = analyzeLevels(s, ['NF3']).find((i) => i.Level === 'NF3');
    expect(hit.AffectedColumns).toBe('dept_id, dept_name');
  });

  test('a declared foreign key still yields the transitive 3NF finding', () => {
    const s = schema.newSchema('fk');
    const dept = schema.newTable({
      Name: 'dept',
      Columns: [schema.newColumn({ Name: 'id', DataType: 'INTEGER', IsPrimaryKey: true })],
    });
    const emp = schema.newTable({
      Name: 'emp',
      Columns: [
        schema.newColumn({ Name: 'id', DataType: 'INTEGER', IsPrimaryKey: true }),
        schema.newColumn({ Name: 'dept_id', DataType: 'INTEGER' }),
        schema.newColumn({ Name: 'dept_name', DataType: 'TEXT' }),
      ],
    });
    s.Tables.push(dept, emp);
    s.Relationships.push(
      schema.newRelationship({
        SourceTableId: dept.Id, SourceColumnId: dept.Columns[0].Id,
        TargetTableId: emp.Id, TargetColumnId: emp.Columns[1].Id,
      }),
    );
    // dept_id is a real FK, but dept_name still depends on it transitively,
    // so the finding is correct — the FK only excludes dept_id itself from
    // being treated as the dependent attribute.
    const hits = analyzeLevels(s, ['NF3']).filter((i) => i.Table === 'emp');
    expect(hits).toHaveLength(1);
    expect(hits[0].AffectedColumns).toBe('dept_id, dept_name');
  });

  test('BCNF flags a non-superkey determinant', () => {
    const s = withColumns(
      { Name: 'id', DataType: 'INTEGER', IsPrimaryKey: true },
      { Name: 'dept_id', DataType: 'INTEGER' },
      { Name: 'dept_name', DataType: 'TEXT' },
    );
    const hit = analyzeLevels(s, ['BCNF']).find((i) => i.Level === 'BCNF');
    expect(hit.AffectedColumns).toBe('dept_id');
  });
});

suite('normalization · 4NF/5NF', () => {
  test('two independent multi-valued attributes raise a 4NF warning', () => {
    const s = withColumns(
      { Name: 'id', DataType: 'INTEGER', IsPrimaryKey: true },
      { Name: 'emp_skills', DataType: 'TEXT' },
      { Name: 'emp_hobbies', DataType: 'TEXT' },
    );
    const hit = analyzeLevels(s, ['NF4']).find((i) => i.Level === 'NF4');
    expect(hit.Severity).toBe('Warning');
  });

  test('one multi-valued attribute is not enough', () => {
    const s = withColumns(
      { Name: 'id', DataType: 'INTEGER', IsPrimaryKey: true },
      { Name: 'emp_skills', DataType: 'TEXT' },
    );
    expect(analyzeLevels(s, ['NF4']).filter((i) => i.Level === 'NF4')).toHaveLength(0);
  });

  test('a three-way join table is a 5NF finding on the join table only', () => {
    const s = schema.newSchema('5nf');
    const parents = ['p1', 'p2', 'p3'].map((name) =>
      schema.newTable({
        Name: name,
        Columns: [schema.newColumn({ Name: 'id', DataType: 'INTEGER', IsPrimaryKey: true })],
      }),
    );
    const triad = schema.newTable({
      Name: 'triad',
      Columns: ['p1_id', 'p2_id', 'p3_id'].map((n) =>
        schema.newColumn({ Name: n, DataType: 'INTEGER', IsPrimaryKey: true }),
      ),
    });
    s.Tables.push(...parents, triad);
    // Source = parent (referenced PK), Target = the join table's FK column.
    parents.forEach((parent, i) =>
      s.Relationships.push(
        schema.newRelationship({
          SourceTableId: parent.Id, SourceColumnId: parent.Columns[0].Id,
          TargetTableId: triad.Id, TargetColumnId: triad.Columns[i].Id,
        }),
      ),
    );
    const issues = analyzeLevels(s, ['NF5']);
    expect(issues.some((i) => i.Table === 'triad')).toBeTruthy();
    expect(issues.some((i) => i.Table === 'p1')).toBeFalsy();
  });
});

suite('normalization · sample schema', () => {
  test('the OnlineShop sample is clean at every level', () => {
    expect(analyze(sampleSchema.createOnlineShopSchema())).toHaveLength(0);
  });

  test('an empty selection falls back to 1NF', () => {
    const s = withColumns({ Name: 'a', DataType: 'TEXT' });
    expect(analyzeLevels(s, [])).toHaveLength(analyzeLevels(s, ['NF1']).length);
  });

  test('a schema with no tables produces no issues', () => {
    expect(analyze(schema.newSchema('empty'))).toHaveLength(0);
  });
});

suite('index advisor', () => {
  const suggestions = indexAdvisor.analyzeIndexes(sampleSchema.createOnlineShopSchema());
  const find = (table, column) => suggestions.find((s) => s.Table === table && s.Column === column);

  test('primary keys are already indexed', () => {
    expect(find('users', 'id').Kind).toBe('AlreadyIndexed');
  });

  test('unique columns are already indexed', () => {
    expect(find('users', 'email').Kind).toBe('AlreadyIndexed');
  });

  test('foreign key columns are required', () => {
    for (const [t, c] of [['orders', 'user_id'], ['products', 'category_id'],
                          ['order_items', 'order_id'], ['order_items', 'product_id']]) {
      expect(find(t, c).Kind).toBe('Required', `${t}.${c}`);
    }
  });

  test('a required suggestion carries a runnable CREATE INDEX', () => {
    expect(find('orders', 'user_id').Recommendation)
      .toBe('CREATE INDEX idx_orders_user_id ON orders (user_id);');
  });

  test('_date style names are only a suggestion', () => {
    expect(find('orders', 'order_date').Kind).toBe('Consider');
  });

  test('a bare "status" does not match the _status suffix', () => {
    expect(find('orders', 'status')).toBe(undefined);
  });

  test('a column with no matching pattern is skipped', () => {
    const s = withColumns(
      { Name: 'id', DataType: 'INTEGER', IsPrimaryKey: true },
      { Name: 'memo', DataType: 'TEXT' },
    );
    expect(indexAdvisor.analyzeIndexes(s).some((x) => x.Column === 'memo')).toBeFalsy();
  });

  test('the IsForeignKey flag alone marks a column required', () => {
    const s = withColumns(
      { Name: 'id', DataType: 'INTEGER', IsPrimaryKey: true },
      { Name: 'other', DataType: 'INTEGER', IsForeignKey: true },
    );
    expect(indexAdvisor.analyzeIndexes(s).find((x) => x.Column === 'other').Kind).toBe('Required');
  });
});

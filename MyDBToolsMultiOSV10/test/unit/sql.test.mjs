// SQL generation, statement splitting and the DDL parser.
import { suite, test, expect } from '../helpers/runner.mjs';
import { exportHelper, sampleSchema, schema, sqlDdl, sqlExporter } from '../helpers/core.mjs';

const { exportSql } = sqlExporter;
const { cloneForTarget, splitStatements, getBaseFileName } = exportHelper;
const { importSqlDdl, detectTargetDb, stripComments } = sqlDdl;

const TARGETS = ['PostgreSQL', 'MySQL', 'MariaDB', 'SqlServer', 'SQLite'];

suite('SQL export · dialects', () => {
  const sample = sampleSchema.createOnlineShopSchema();

  test('PostgreSQL uses double quotes, ALTER TABLE and COMMENT ON', () => {
    const sql = exportSql(cloneForTarget(sample, 'PostgreSQL'));
    expect(sql).toContain('"users"');
    expect(sql).toContain('ALTER TABLE');
    expect(sql).toContain('COMMENT ON TABLE');
  });

  test('MySQL and MariaDB use backticks and InnoDB', () => {
    for (const target of ['MySQL', 'MariaDB']) {
      const sql = exportSql(cloneForTarget(sample, target));
      expect(sql).toContain('`users`');
      expect(sql).toContain('ENGINE=InnoDB');
    }
  });

  test('SQL Server uses bracket quoting', () => {
    expect(exportSql(cloneForTarget(sample, 'SqlServer'))).toContain('[users]');
  });

  test('SQLite inlines foreign keys instead of ALTER TABLE', () => {
    const sql = exportSql(cloneForTarget(sample, 'SQLite'));
    expect(sql).toContain('FOREIGN KEY (');
    expect(sql).notToContain('ALTER TABLE');
  });

  test('the foreign key is declared on the child and references the parent', () => {
    const sql = exportSql(cloneForTarget(sample, 'PostgreSQL'));
    expect(sql).toMatch(
      /ALTER TABLE "products"\s*\n\s*ADD CONSTRAINT "fk_products_category"\s*\n\s*FOREIGN KEY \("category_id"\)\s*\n\s*REFERENCES "categories"\("id"\);/,
    );
  });

  test('retargeting keeps the declared column types verbatim', () => {
    // Matches DBToolsWinV10: CloneForTarget only swaps the dialect.
    expect(exportSql(cloneForTarget(sample, 'MySQL'))).toContain('BIGSERIAL');
  });
});

suite('SQL export · column DDL', () => {
  test('a single primary key is inline; a composite one is a table constraint', () => {
    const s = schema.newSchema('c');
    s.TargetDb = 'PostgreSQL';
    s.Tables.push(
      schema.newTable({
        Name: 'link',
        Columns: [
          schema.newColumn({ Name: 'a_id', DataType: 'BIGINT', IsPrimaryKey: true, IsNullable: false }),
          schema.newColumn({ Name: 'b_id', DataType: 'BIGINT', IsPrimaryKey: true, IsNullable: false }),
        ],
      }),
    );
    const sql = exportSql(s);
    expect(sql).toContain('PRIMARY KEY ("a_id", "b_id")');
    expect(/"a_id" BIGINT PRIMARY KEY/.test(sql)).toBeFalsy();
  });

  test('NOT NULL, UNIQUE and DEFAULT are emitted', () => {
    const s = schema.newSchema('c');
    s.TargetDb = 'PostgreSQL';
    s.Tables.push(
      schema.newTable({
        Name: 't',
        Columns: [
          schema.newColumn({ Name: 'a', DataType: 'VARCHAR', Length: 10, IsNullable: false, IsUnique: true }),
          schema.newColumn({ Name: 'b', DataType: 'INTEGER', DefaultValue: '7' }),
        ],
      }),
    );
    const sql = exportSql(s);
    expect(sql).toContain('"a" VARCHAR(10) NOT NULL UNIQUE');
    expect(sql).toContain('DEFAULT 7');
  });

  test('PostgreSQL promotes an auto-increment PK to SERIAL', () => {
    const s = schema.newSchema('c');
    s.TargetDb = 'PostgreSQL';
    s.Tables.push(
      schema.newTable({
        Name: 't',
        Columns: [schema.newColumn({ Name: 'id', DataType: 'INTEGER', IsPrimaryKey: true, IsAutoIncrement: true })],
      }),
    );
    expect(exportSql(s)).toContain('"id" SERIAL PRIMARY KEY');
  });

  test("single quotes in comments are doubled", () => {
    const s = schema.newSchema('q');
    s.TargetDb = 'PostgreSQL';
    s.Tables.push(
      schema.newTable({
        Name: 'orders',
        Comment: "it's a comment",
        Columns: [schema.newColumn({ Name: 'id', DataType: 'INTEGER', IsPrimaryKey: true, Comment: "o'clock" })],
      }),
    );
    const sql = exportSql(s);
    expect(sql).toContain("IS 'it''s a comment'");
    expect(sql).toContain("IS 'o''clock'");
  });
});

suite('statement splitter', () => {
  test('splits on top-level semicolons', () => {
    expect(splitStatements('SELECT 1; SELECT 2;')).toHaveLength(2);
  });

  test('ignores semicolons inside quotes', () => {
    expect(splitStatements("SELECT ';'; SELECT 2;")).toHaveLength(2);
    expect(splitStatements('SELECT "a;b"; SELECT 2;')).toHaveLength(2);
  });

  test('drops empty and comment-only statements', () => {
    expect(splitStatements('SELECT 1;   ')).toHaveLength(1);
    expect(splitStatements('-- just a comment\n;SELECT 1;')).toHaveLength(1);
    expect(splitStatements('')).toHaveLength(0);
    expect(splitStatements('   ')).toHaveLength(0);
  });
});

suite('export helper', () => {
  test('base file name strips characters a filesystem rejects', () => {
    expect(getBaseFileName({ Name: 'a/b:c' })).toBe('a_b_c');
    expect(getBaseFileName({ Name: '   ' })).toBe('schema');
    expect(getBaseFileName(null)).toBe('schema');
  });

  test('cloneForTarget does not mutate the source', () => {
    const s = sampleSchema.createOnlineShopSchema();
    const clone = cloneForTarget(s, 'MySQL');
    expect(clone.TargetDb).toBe('MySQL');
    expect(s.TargetDb).toBe('PostgreSQL');
  });
});

suite('DDL parser · dialect detection', () => {
  test('detects each dialect from its fingerprints', () => {
    expect(detectTargetDb('CREATE TABLE a (id BIGSERIAL);')).toBe('PostgreSQL');
    expect(detectTargetDb('CREATE TABLE a (id INT IDENTITY(1,1));')).toBe('SqlServer');
    expect(detectTargetDb('CREATE TABLE a (id INT AUTO_INCREMENT) ENGINE=InnoDB;')).toBe('MySQL');
    expect(detectTargetDb('-- MariaDB\nCREATE TABLE a (id INT AUTO_INCREMENT) ENGINE=InnoDB;')).toBe('MariaDB');
    expect(detectTargetDb('CREATE TABLE a (id INTEGER PRIMARY KEY AUTOINCREMENT);')).toBe('SQLite');
    expect(detectTargetDb('CREATE TABLE a (id INT);')).toBe('MySQL', 'default');
  });
});

suite('DDL parser · comments', () => {
  test('line and block comments are removed', () => {
    expect(stripComments('SELECT 1; -- note\nSELECT 2;')).notToContain('note');
    expect(stripComments('SELECT /* note */ 1;')).notToContain('note');
  });

  test('comment markers inside string literals survive', () => {
    expect(stripComments("SELECT '-- not a comment';")).toContain('-- not a comment');
    expect(stripComments('SELECT "a /* b */ c";')).toContain('/* b */');
  });
});

suite('DDL parser · columns and constraints', () => {
  test('IF NOT EXISTS and quoted identifiers', () => {
    const s = importSqlDdl('CREATE TABLE IF NOT EXISTS "t" ("id" INTEGER PRIMARY KEY, "n" VARCHAR(10) NOT NULL);', 'x');
    expect(s.Tables).toHaveLength(1);
    expect(s.Tables[0].Name).toBe('t');
    expect(s.Tables[0].Columns[1].IsNullable).toBe(false);
  });

  test('attached type dimensions populate Length / Precision / Scale', () => {
    const s = importSqlDdl('CREATE TABLE t (a VARCHAR(255), b DECIMAL(12,2), c INTEGER);', 'x');
    const [a, b, c] = s.Tables[0].Columns;
    expect(a.DataType).toBe('VARCHAR');
    expect(a.Length).toBe(255);
    expect(b.Precision).toBe(12);
    expect(b.Scale).toBe(2);
    expect(c.Length).toBe(null);
  });

  test('defaults are unwrapped from quotes', () => {
    const s = importSqlDdl("CREATE TABLE t (id INT PRIMARY KEY, s VARCHAR(20) DEFAULT 'PENDING', n INT DEFAULT 1);", 'x');
    expect(s.Tables[0].Columns[1].DefaultValue).toBe('PENDING');
    expect(s.Tables[0].Columns[2].DefaultValue).toBe('1');
  });

  test('a table-level PRIMARY KEY marks its columns', () => {
    const s = importSqlDdl('CREATE TABLE t (a INT, b INT, PRIMARY KEY (a, b));', 'x');
    expect(s.Tables[0].Columns.filter((c) => c.IsPrimaryKey)).toHaveLength(2);
  });

  test('UNIQUE and AUTO_INCREMENT are picked up', () => {
    const s = importSqlDdl('CREATE TABLE t (id INT PRIMARY KEY AUTO_INCREMENT, e VARCHAR(9) UNIQUE);', 'x');
    expect(s.Tables[0].Columns[0].IsAutoIncrement).toBeTruthy();
    expect(s.Tables[0].Columns[1].IsUnique).toBeTruthy();
  });

  test('a repeated CREATE TABLE keeps the first definition', () => {
    const s = importSqlDdl('CREATE TABLE t (id INT); CREATE TABLE t (id INT, extra INT);', 'x');
    expect(s.Tables).toHaveLength(1);
    expect(s.Tables[0].Columns).toHaveLength(1);
  });
});

suite('DDL parser · foreign keys', () => {
  test('an inline constraint inside CREATE TABLE is resolved', () => {
    const s = importSqlDdl(
      `CREATE TABLE parent (id INTEGER PRIMARY KEY);
       CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER,
         CONSTRAINT fk_child FOREIGN KEY (parent_id) REFERENCES parent(id));`,
      'x',
    );
    expect(s.Relationships).toHaveLength(1);
    expect(s.Relationships[0].Name).toBe('fk_child');
    const child = s.Tables.find((t) => t.Name === 'child');
    expect(child.Columns.find((c) => c.Name === 'parent_id').IsForeignKey).toBeTruthy();
  });

  test('a forward reference to a table declared later still resolves', () => {
    const s = importSqlDdl(
      `CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER,
         FOREIGN KEY (parent_id) REFERENCES parent(id));
       CREATE TABLE parent (id INTEGER PRIMARY KEY);`,
      'x',
    );
    expect(s.Relationships).toHaveLength(1);
  });

  test('Source is the parent and Target the child', () => {
    const s = importSqlDdl(
      `CREATE TABLE parent (id INTEGER PRIMARY KEY);
       CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER,
         FOREIGN KEY (parent_id) REFERENCES parent(id));`,
      'x',
    );
    const rel = s.Relationships[0];
    expect(s.Tables.find((t) => t.Id === rel.SourceTableId).Name).toBe('parent');
    expect(s.Tables.find((t) => t.Id === rel.TargetTableId).Name).toBe('child');
  });

  test('duplicate declarations are de-duplicated', () => {
    const s = importSqlDdl(
      `CREATE TABLE parent (id INTEGER PRIMARY KEY);
       CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER,
         FOREIGN KEY (parent_id) REFERENCES parent(id));
       ALTER TABLE child ADD CONSTRAINT fk2 FOREIGN KEY (parent_id) REFERENCES parent(id);`,
      'x',
    );
    expect(s.Relationships).toHaveLength(1);
  });

  test('a constraint naming an unknown table is ignored', () => {
    const s = importSqlDdl(
      'CREATE TABLE child (id INTEGER PRIMARY KEY, p INTEGER, FOREIGN KEY (p) REFERENCES ghost(id));',
      'x',
    );
    expect(s.Relationships).toHaveLength(0);
  });
});

suite('SQL round trip', () => {
  const sample = sampleSchema.createOnlineShopSchema();

  for (const target of TARGETS) {
    test(`${target}: export then import preserves the schema`, () => {
      const back = importSqlDdl(exportSql(cloneForTarget(sample, target)), 'RoundTrip');
      expect(back.Tables).toHaveLength(5);
      expect(back.Relationships).toHaveLength(4);

      const users = back.Tables.find((t) => t.Name === 'users');
      expect(users.Columns).toHaveLength(4);
      expect(users.Columns.find((c) => c.Name === 'id').IsPrimaryKey).toBeTruthy();
      const email = users.Columns.find((c) => c.Name === 'email');
      expect(email.IsUnique).toBeTruthy();
      expect(email.Length).toBe(255);

      const price = back.Tables.find((t) => t.Name === 'products').Columns.find((c) => c.Name === 'price');
      expect(price.Precision).toBe(12);
      expect(price.Scale).toBe(2);
    });
  }

  test('a composite key survives the round trip', () => {
    const s = schema.newSchema('c');
    s.TargetDb = 'PostgreSQL';
    s.Tables.push(
      schema.newTable({
        Name: 'link',
        Columns: [
          schema.newColumn({ Name: 'a_id', DataType: 'BIGINT', IsPrimaryKey: true, IsNullable: false }),
          schema.newColumn({ Name: 'b_id', DataType: 'BIGINT', IsPrimaryKey: true, IsNullable: false }),
        ],
      }),
    );
    const back = importSqlDdl(exportSql(s), 'c');
    expect(back.Tables[0].Columns.filter((c) => c.IsPrimaryKey)).toHaveLength(2);
  });
});

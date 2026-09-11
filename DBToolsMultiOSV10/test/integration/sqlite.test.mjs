// End-to-end: build a real SQLite database from the schema, then read it back.
// This is what proves the generated DDL is executable rather than merely
// plausible-looking text.
import { suite, test, expect } from '../helpers/runner.mjs';
import initSqlJs from 'sql.js';
import { exportHelper, sampleSchema, schema, sqlExporter, sqliteDatabase, sqliteSchema } from '../helpers/core.mjs';

const SQL = await initSqlJs();
const sample = sampleSchema.createOnlineShopSchema();

/** Run a query and return rows as arrays. */
function rows(db, sql) {
  const stmt = db.prepare(sql);
  const out = [];
  try {
    while (stmt.step()) out.push(stmt.get());
  } finally {
    stmt.free();
  }
  return out;
}

function openBuiltDatabase() {
  const sql = sqlExporter.exportSql(sqliteDatabase.toSqliteSchema(sample));
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON;');
  const failures = [];
  for (const statement of exportHelper.splitStatements(sql)) {
    try {
      db.run(statement);
    } catch (err) {
      failures.push(`${statement.split('\n')[0]} -> ${err.message}`);
    }
  }
  return { db, failures };
}

suite('SQLite · generated DDL executes', () => {
  test('every statement runs without error', () => {
    const { db, failures } = openBuiltDatabase();
    expect(failures).toHaveLength(0);
    db.close();
  });

  test('all five tables are created', () => {
    const { db } = openBuiltDatabase();
    const names = rows(db, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .map((r) => r[0]);
    expect(names).toHaveLength(5);
    for (const t of ['users', 'categories', 'products', 'orders', 'order_items']) {
      expect(names).toContain(t);
    }
    db.close();
  });

  test('NOW() is translated so the CREATE TABLE parses', () => {
    const { db } = openBuiltDatabase();
    const createdAt = rows(db, 'PRAGMA table_info("users")').find((r) => r[1] === 'created_at');
    expect(String(createdAt[4]).toUpperCase()).toBe('CURRENT_TIMESTAMP');
    db.close();
  });

  test('column constraints survive', () => {
    const { db } = openBuiltDatabase();
    const cols = rows(db, 'PRAGMA table_info("users")');
    const email = cols.find((r) => r[1] === 'email');
    expect(email[3]).toBe(1, 'NOT NULL');
    expect(String(email[2])).toContain('255');
    expect(cols.find((r) => r[1] === 'id')[5]).toBeGreaterThan(0, 'primary key');
    db.close();
  });
});

suite('SQLite · foreign keys point the right way', () => {
  function foreignKeys(db, table) {
    return rows(db, `PRAGMA foreign_key_list("${table}")`).map((r) => ({ parent: r[2], from: r[3] }));
  }

  test('the child table declares the constraint', () => {
    const { db } = openBuiltDatabase();
    const products = foreignKeys(db, 'products');
    expect(products).toHaveLength(1);
    expect(products[0].from).toBe('category_id');
    expect(products[0].parent).toBe('categories');

    expect(foreignKeys(db, 'orders')[0]).toEqual({ parent: 'users', from: 'user_id' });

    const items = foreignKeys(db, 'order_items');
    expect(items).toHaveLength(2);
    expect(items.some((f) => f.from === 'order_id' && f.parent === 'orders')).toBeTruthy();
    expect(items.some((f) => f.from === 'product_id' && f.parent === 'products')).toBeTruthy();
    db.close();
  });

  test('parent tables declare none', () => {
    const { db } = openBuiltDatabase();
    expect(foreignKeys(db, 'categories')).toHaveLength(0);
    expect(foreignKeys(db, 'users')).toHaveLength(0);
    db.close();
  });

  test('the database enforces them at insert time', () => {
    const { db } = openBuiltDatabase();
    db.run("INSERT INTO categories (id, name) VALUES (1, 'Books');");
    db.run("INSERT INTO products (id, name, price, category_id, is_active) VALUES (1, 'A', 9.99, 1, 1);");

    let rejected = false;
    try {
      db.run("INSERT INTO products (id, name, price, category_id, is_active) VALUES (2, 'B', 1.0, 999, 1);");
    } catch {
      rejected = true;
    }
    expect(rejected).toBeTruthy('a dangling foreign key was accepted');
    db.close();
  });
});

const dbBytes = await sqliteDatabase.exportSqliteDatabase(sample);

suite('SQLite · file round trip', () => {
  const bytes = dbBytes;

  test('the exported file carries the SQLite magic header', () => {
    expect(new TextDecoder().decode(bytes.slice(0, 15))).toBe('SQLite format 3');
    expect(sqliteSchema.hasSqliteHeader(bytes)).toBeTruthy();
  });

  test('reading it back recovers tables and relationships', async () => {
    const back = await sqliteSchema.importSqliteSchema(bytes, 'RoundTrip');
    expect(back.Tables).toHaveLength(5);
    expect(back.Relationships).toHaveLength(4);
  });

  test('the recovered relationship keeps Source = parent', async () => {
    const back = await sqliteSchema.importSqliteSchema(bytes, 'RoundTrip');
    const products = back.Tables.find((t) => t.Name === 'products');
    const categoryId = products.Columns.find((c) => c.Name === 'category_id');
    expect(categoryId.IsForeignKey).toBeTruthy();
    const rel = back.Relationships.find((r) => r.TargetColumnId === categoryId.Id);
    expect(back.Tables.find((t) => t.Id === rel.SourceTableId).Name).toBe('categories');
  });

  test('UNIQUE, length and precision survive the round trip', async () => {
    const back = await sqliteSchema.importSqliteSchema(bytes, 'RoundTrip');
    const email = back.Tables.find((t) => t.Name === 'users').Columns.find((c) => c.Name === 'email');
    expect(email.IsUnique).toBeTruthy();
    expect(email.Length).toBe(255);
    const price = back.Tables.find((t) => t.Name === 'products').Columns.find((c) => c.Name === 'price');
    expect(price.Precision).toBe(12);
    expect(price.Scale).toBe(2);
  });

  test('a non-database file is reported clearly', async () => {
    const junk = new TextEncoder().encode('this is definitely not a database');
    await expect(() => sqliteSchema.importSqliteSchema(junk, 'junk')).toThrow();
  });
});

suite('SQLite · type parsing', () => {
  test('parseType splits dimensions off the type name', () => {
    expect(sqliteSchema.parseType('VARCHAR(255)')).toEqual({ dataType: 'VARCHAR', length: 255, precision: null, scale: null });
    expect(sqliteSchema.parseType('DECIMAL(12,2)')).toEqual({ dataType: 'DECIMAL', length: null, precision: 12, scale: 2 });
    expect(sqliteSchema.parseType('INTEGER')).toEqual({ dataType: 'INTEGER', length: null, precision: null, scale: null });
    expect(sqliteSchema.parseType('')).toEqual({ dataType: 'TEXT', length: null, precision: null, scale: null });
  });

  test('extension detection', () => {
    expect(sqliteSchema.isSqliteExtension('.db')).toBeTruthy();
    expect(sqliteSchema.isSqliteExtension('.SQLITE3')).toBeTruthy();
    expect(sqliteSchema.isSqliteExtension('.sql')).toBeFalsy();
  });

  test('an empty schema still exports a valid database', async () => {
    const empty = schema.newSchema('empty');
    const out = await sqliteDatabase.exportSqliteDatabase(empty);
    expect(new TextDecoder().decode(out.slice(0, 15))).toBe('SQLite format 3');
  });
});

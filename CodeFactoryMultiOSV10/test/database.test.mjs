import test from 'node:test';
import assert from 'node:assert/strict';

import { maskSource, buildLineStarts } from '../src/core/text.js';
import { extractFunctions } from '../src/core/functions.js';
import { extractSchema, extractCatalogs, analyzeTableAccess, analyzeCatalogAccess, crudLabel, CRUD } from '../src/core/database.js';
import { sqlSource, javaSource, csharpSource } from './fixtures.mjs';

function makeFile(path, languageId, text) {
  return { path, languageId, text, masked: maskSource(text, languageId), lineStarts: buildLineStarts(text) };
}

test('SQL DDL yields tables, columns, keys and nullability', () => {
  const { tables } = extractSchema([makeFile('/p/schema.sql', 'sql', sqlSource)]);
  const users = tables.find((table) => table.name === 'users');

  assert.ok(users, 'the users table is found');
  assert.deepEqual(users.columns.map((c) => c.name), ['id', 'name', 'email', 'team_id']);

  const id = users.columns.find((c) => c.name === 'id');
  assert.equal(id.isPrimaryKey, true);
  assert.equal(id.dataType, 'INTEGER');

  const name = users.columns.find((c) => c.name === 'name');
  assert.equal(name.isNullable, false, 'NOT NULL is respected');
  assert.equal(users.columns.find((c) => c.name === 'email').isNullable, true);
});

test('table-level and inline foreign keys both produce relations', () => {
  const { tables, relations } = extractSchema([makeFile('/p/schema.sql', 'sql', sqlSource)]);

  const teamId = tables.find((t) => t.name === 'users').columns.find((c) => c.name === 'team_id');
  assert.equal(teamId.isForeignKey, true, 'the table-level FOREIGN KEY clause is applied to the column');
  assert.equal(teamId.referencedTable, 'teams');

  const customerId = tables.find((t) => t.name === 'orders').columns.find((c) => c.name === 'customer_id');
  assert.equal(customerId.isForeignKey, true, 'the inline REFERENCES is applied');

  const labels = relations.map((rel) => rel.label);
  assert.ok(labels.some((label) => label.includes('team_id → teams.id')));
  assert.ok(labels.some((label) => label.includes('customer_id → users.id')));
});

test('JPA entities are read from annotations, with the mapped table name', () => {
  const { tables } = extractSchema([makeFile('/p/Order.java', 'java', javaSource)]);
  const orders = tables.find((table) => table.name === 'orders');

  assert.ok(orders, '@Table(name = "orders") names the table');
  assert.equal(orders.entityTypeName, 'Order');
  assert.equal(orders.sourceKind, 'jpa');
  assert.ok(orders.columns.some((c) => c.name === 'order_id' && c.isPrimaryKey), '@Id + @Column name is used');
  assert.ok(orders.columns.some((c) => c.name === 'customer_id' && c.isForeignKey), '@JoinColumn is a foreign key');
});

test('Prisma models are read as tables', () => {
  const prisma = `
datasource db { provider = "postgresql" }

model Post {
  id       Int    @id
  title    String
  authorId Int
  author   User   @relation(fields: [authorId], references: [id])
}
`;
  const { tables } = extractSchema([makeFile('/p/schema.prisma', 'sql', prisma)]);
  const post = tables.find((table) => table.name === 'Post');

  assert.ok(post);
  assert.equal(post.sourceKind, 'prisma');
  assert.ok(post.columns.some((c) => c.name === 'id' && c.isPrimaryKey));
  assert.ok(post.columns.some((c) => c.name === 'author' && c.isForeignKey));
});

test('EF Core DbSets and [Table] entities are found', () => {
  const efcore = `
public class AppContext : DbContext
{
    public DbSet<Customer> Customers { get; set; }
}

[Table("customer_records")]
public class Customer
{
    [Key]
    public int Id { get; set; }
    public string Name { get; set; }
}
`;
  const { tables } = extractSchema([makeFile('/p/Context.cs', 'csharp', efcore)]);
  assert.ok(tables.some((t) => t.name === 'Customers' && t.sourceKind === 'efcore'));
  assert.ok(tables.some((t) => t.name === 'customer_records' && t.entityTypeName === 'Customer'));
});

test('Django models are read as tables', () => {
  const django = `
from django.db import models

class Article(models.Model):
    title = models.CharField(max_length=200)
    slug = models.SlugField(primary_key=True)
    author = models.ForeignKey('User', on_delete=models.CASCADE)
`;
  const { tables } = extractSchema([makeFile('/p/models.py', 'python', django)]);
  const article = tables.find((t) => t.name === 'Article');

  assert.ok(article);
  assert.ok(article.columns.some((c) => c.name === 'slug' && c.isPrimaryKey));
  assert.ok(article.columns.some((c) => c.name === 'author' && c.isForeignKey));
});

test('SQL access in a function body is attributed to that function with the right CRUD bits', () => {
  const file = makeFile('/p/UserRepository.cs', 'csharp', csharpSource);
  const functions = extractFunctions(file);
  const { tables } = extractSchema([makeFile('/p/schema.sql', 'sql', sqlSource)]);
  const { accesses } = analyzeTableAccess(functions, tables);

  const save = accesses.find((a) => a.functionDisplayName === 'Save');
  assert.ok(save, 'the INSERT in Save() is attributed to Save');
  assert.ok(save.operations & CRUD.create, 'INSERT is a create');
  assert.equal(save.kind, 'write');

  const load = accesses.find((a) => a.functionDisplayName === 'LoadName');
  assert.ok(load, 'the SELECT in LoadName() is attributed to LoadName');
  assert.ok(load.operations & CRUD.read);
  assert.equal(load.kind, 'read');
});

test('column-level access records which columns a function names', () => {
  const file = makeFile('/p/repo.js', 'javascript', 'function fetchUsers() {\n  return db.query("SELECT name, email FROM users WHERE id = ?");\n}\n');
  const functions = extractFunctions(file);
  const { tables } = extractSchema([makeFile('/p/schema.sql', 'sql', sqlSource)]);
  const { columnAccesses } = analyzeTableAccess(functions, tables);

  const columns = columnAccesses.map((a) => a.columnName);
  assert.ok(columns.includes('name'));
  assert.ok(columns.includes('email'));
  assert.ok(!columns.includes('team_id'), 'a column the body never mentions is not reported');
});

test('ORM calls are attributed by receiver name', () => {
  const file = makeFile('/p/svc.js', 'javascript', 'function listOrders() {\n  return Order.findAll({ where: { id: 1 } });\n}\nfunction removeOrder(id) {\n  return Order.destroy(id);\n}\n');
  const functions = extractFunctions(file);
  const tables = [{ id: 'table:orders', name: 'orders', entityTypeName: 'Order', accessAliases: ['Order'], columns: [] }];
  const { accesses } = analyzeTableAccess(functions, tables);

  const list = accesses.find((a) => a.functionDisplayName === 'listOrders');
  const remove = accesses.find((a) => a.functionDisplayName === 'removeOrder');

  assert.ok(list && list.operations & CRUD.read);
  assert.ok(remove && remove.operations & CRUD.delete);
});

test('a function with no database code produces no access rows', () => {
  const file = makeFile('/p/pure.js', 'javascript', 'function add(a, b) {\n  return a + b;\n}\n');
  const { tables } = extractSchema([makeFile('/p/schema.sql', 'sql', sqlSource)]);
  const { accesses } = analyzeTableAccess(extractFunctions(file), tables);
  assert.deepEqual(accesses, []);
});

test('connection strings and SQLite paths become catalogs', () => {
  const catalogs = extractCatalogs([
    makeFile('/p/db.cs', 'csharp', 'var cs = "Server=localhost;Initial Catalog=ShopDb;User Id=sa;";\nvar conn = new SqlConnection(cs);\n'),
    makeFile('/p/db.py', 'python', 'import sqlite3\nconn = sqlite3.connect("data/local.sqlite")\n'),
    makeFile('/p/db.js', 'javascript', 'const pool = createPool("postgres://user@host:5432/analytics");\n'),
  ]);

  const names = catalogs.map((c) => c.name);
  assert.ok(names.includes('ShopDb'), 'SQL Server Initial Catalog');
  assert.ok(names.includes('local.sqlite'), 'SQLite file');
  assert.ok(names.includes('analytics'), 'Postgres URL database');

  assert.equal(catalogs.find((c) => c.name === 'analytics').dialect, 'postgresql');
  assert.equal(catalogs.find((c) => c.name === 'local.sqlite').dialect, 'sqlite');
});

test('catalog access links a connecting function to its database', () => {
  const file = makeFile('/p/db.cs', 'csharp', 'void Connect() {\n    var c = new SqlConnection("Server=x;Initial Catalog=ShopDb;");\n}\n');
  const functions = extractFunctions(file);
  const catalogs = extractCatalogs([file]);
  const accesses = analyzeCatalogAccess(functions, catalogs);

  assert.equal(accesses.length, 1);
  assert.equal(accesses[0].functionDisplayName, 'Connect');
});

test('crudLabel renders the operation mask', () => {
  assert.equal(crudLabel(0), '-');
  assert.equal(crudLabel(CRUD.read), 'R');
  assert.equal(crudLabel(CRUD.create | CRUD.read | CRUD.update | CRUD.delete), 'CRUD');
  assert.equal(crudLabel(CRUD.create | CRUD.delete), 'CD');
});

test('duplicate table definitions from two sources are merged, not doubled', () => {
  const dbSet = 'public DbSet<Customer> Customers { get; set; }\n';
  const entity = '[Table("Customers")]\npublic class Customer { [Key] public int Id { get; set; } }\n';
  const { tables } = extractSchema([makeFile('/p/a.cs', 'csharp', dbSet), makeFile('/p/b.cs', 'csharp', entity)]);

  const matching = tables.filter((t) => t.name.toLowerCase() === 'customers');
  assert.equal(matching.length, 1, 'the two sources describe one table');
  assert.ok(matching[0].columns.length > 0, 'the columns from the entity survive the merge');
});

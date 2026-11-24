// Schema model, data types and serialization.
import { suite, test, expect } from '../helpers/runner.mjs';
import { dataTypes, schema, serializer, sampleSchema } from '../helpers/core.mjs';

suite('dataTypes', () => {
  test('each target DB exposes its own type list', () => {
    expect(dataTypes.getTypes('SQLite')).toHaveLength(13);
    expect(dataTypes.getTypes('PostgreSQL')).toHaveLength(38);
    expect(dataTypes.getTypes('MySQL')).toHaveLength(32);
    expect(dataTypes.getTypes('MariaDB')).toHaveLength(33);
    expect(dataTypes.getTypes('SqlServer')).toHaveLength(29);
    expect(dataTypes.getTypes('VectorDb')).toHaveLength(6);
  });

  test('an unknown DB falls back to the SQLite list', () => {
    expect(dataTypes.getTypes('Nope')).toHaveLength(13);
  });

  test('length applies to character and binary types only', () => {
    for (const t of ['VARCHAR', 'char', 'NVARCHAR', 'VARBINARY', 'VECTOR']) {
      expect(dataTypes.typeHasLength(t)).toBeTruthy(t);
    }
    for (const t of ['INTEGER', 'BOOLEAN', 'DATE', 'JSON']) {
      expect(dataTypes.typeHasLength(t)).toBeFalsy(t);
    }
  });

  test('precision and scale apply to numeric types', () => {
    for (const t of ['DECIMAL', 'numeric', 'FLOAT', 'DOUBLE PRECISION', 'MONEY']) {
      expect(dataTypes.typeHasPrecisionScale(t)).toBeTruthy(t);
    }
    expect(dataTypes.typeHasPrecisionScale('VARCHAR')).toBeFalsy();
  });

  test('auto-increment keyword is per dialect', () => {
    expect(dataTypes.getAutoIncrementKeyword('PostgreSQL', 'BIGSERIAL')).toBe('');
    expect(dataTypes.getAutoIncrementKeyword('PostgreSQL', 'INTEGER')).toBe('GENERATED ALWAYS AS IDENTITY');
    expect(dataTypes.getAutoIncrementKeyword('MySQL', 'INT')).toBe('AUTO_INCREMENT');
    expect(dataTypes.getAutoIncrementKeyword('MariaDB', 'INT')).toBe('AUTO_INCREMENT');
    expect(dataTypes.getAutoIncrementKeyword('SqlServer', 'INT')).toBe('IDENTITY(1,1)');
    expect(dataTypes.getAutoIncrementKeyword('SQLite', 'INTEGER')).toBe('');
  });
});

suite('schema model', () => {
  test('getTypeDisplay renders length, precision and scale', () => {
    const c = (p) => schema.getTypeDisplay(schema.newColumn(p));
    expect(c({ DataType: 'VARCHAR', Length: 50 })).toBe('VARCHAR(50)');
    expect(c({ DataType: 'DECIMAL', Precision: 12, Scale: 2 })).toBe('DECIMAL(12,2)');
    expect(c({ DataType: 'DECIMAL', Precision: 8 })).toBe('DECIMAL(8)');
    expect(c({ DataType: 'TEXT' })).toBe('TEXT');
  });

  test('new entities get distinct ids', () => {
    const ids = new Set([schema.newTable().Id, schema.newTable().Id, schema.newColumn().Id]);
    expect(ids.size).toBe(3);
  });

  test('cloneSchema is a deep copy', () => {
    const original = sampleSchema.createOnlineShopSchema();
    const copy = schema.cloneSchema(original);
    copy.Tables[0].Name = 'changed';
    copy.Tables[0].Columns[0].Name = 'changed';
    copy.Relationships[0].RoutePoints.push({ X: 1, Y: 2 });
    expect(original.Tables[0].Name).toBe('users');
    expect(original.Tables[0].Columns[0].Name).toBe('id');
    expect(original.Relationships[0].RoutePoints).toHaveLength(0);
  });

  test('ensureInitialized fills missing collections', () => {
    const s = { Name: 'x', TargetDb: 'SQLite' };
    schema.ensureInitialized(s);
    expect(s.Tables).toHaveLength(0);
    expect(s.Relationships).toHaveLength(0);
  });

  test('removeColumn drops the column and its relationships', () => {
    const s = sampleSchema.createOnlineShopSchema();
    const users = s.Tables.find((t) => t.Name === 'users');
    const id = users.Columns.find((c) => c.Name === 'id');
    expect(schema.removeColumn(s, users.Id, id.Id)).toBeTruthy();
    expect(s.Relationships).toHaveLength(3);
    expect(users.Columns.some((c) => c.Name === 'id')).toBeFalsy();
  });

  test('removeColumn on a missing target is a no-op', () => {
    const s = sampleSchema.createOnlineShopSchema();
    expect(schema.removeColumn(s, 'nope', 'nope')).toBeFalsy();
    expect(s.Relationships).toHaveLength(4);
  });

  test('removeTable drops relationships on both sides', () => {
    const s = sampleSchema.createOnlineShopSchema();
    const orders = s.Tables.find((t) => t.Name === 'orders');
    expect(schema.removeTable(s, orders.Id)).toBeTruthy();
    expect(s.Tables).toHaveLength(4);
    // orders is the child of fk_orders_user and the parent of fk_order_items_order.
    expect(s.Relationships).toHaveLength(2);
  });

  test('foreign key helpers read the Target (child) side', () => {
    const s = sampleSchema.createOnlineShopSchema();
    const products = s.Tables.find((t) => t.Name === 'products');
    const categories = s.Tables.find((t) => t.Name === 'categories');
    const categoryId = products.Columns.find((c) => c.Name === 'category_id');
    const categoriesId = categories.Columns.find((c) => c.Name === 'id');

    expect(schema.isOutgoingForeignKey(s, products.Id, categoryId.Id)).toBeTruthy('child holds the FK');
    expect(schema.isOutgoingForeignKey(s, categories.Id, categoriesId.Id)).toBeFalsy('parent PK is not an FK');
    expect(schema.getForeignKeyColumnIds(s, products.Id).has(categoryId.Id)).toBeTruthy();
  });

  test('primaryKeyCount counts PK columns', () => {
    const s = sampleSchema.createOnlineShopSchema();
    expect(schema.primaryKeyCount(s.Tables[0])).toBe(1);
  });
});

suite('serializer', () => {
  test('round trip preserves the schema', () => {
    const original = sampleSchema.createOnlineShopSchema();
    const back = serializer.deserialize(serializer.serializeToString(original));
    expect(serializer.areEquivalent(original, back)).toBeTruthy();
    expect(back.Tables).toHaveLength(5);
    expect(back.Relationships).toHaveLength(4);
  });

  test('a UTF-8 BOM from DBToolsWinV10 is tolerated', () => {
    const text = '﻿' + serializer.serializeToString(sampleSchema.createOnlineShopSchema());
    expect(serializer.deserialize(text).Tables).toHaveLength(5);
  });

  test('null fields are omitted, matching WhenWritingNull', () => {
    const s = sampleSchema.createOnlineShopSchema();
    const json = JSON.parse(serializer.serializeToString(s));
    const username = json.Tables[0].Columns[1];
    expect(Object.prototype.hasOwnProperty.call(username, 'Comment')).toBeTruthy('has a comment');
    const created = json.Tables[0].Columns[3];
    expect(Object.prototype.hasOwnProperty.call(created, 'Comment')).toBeFalsy('null comment omitted');
  });

  test('non-schema JSON is rejected', async () => {
    await expect(() => serializer.deserialize('{"foo":1}')).toThrow();
  });

  test('areEquivalent ignores object identity but not content', () => {
    const a = sampleSchema.createOnlineShopSchema();
    const b = schema.cloneSchema(a);
    expect(serializer.areEquivalent(a, b)).toBeTruthy();
    b.Tables[0].Name = 'other';
    expect(serializer.areEquivalent(a, b)).toBeFalsy();
    expect(serializer.areEquivalent(null, null)).toBeTruthy();
    expect(serializer.areEquivalent(a, null)).toBeFalsy();
  });
});

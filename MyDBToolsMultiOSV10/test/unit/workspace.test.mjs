// The workspace file: every open tab in one document.
import { suite, test, expect } from '../helpers/runner.mjs';
import { sampleSchema, schema, workspace } from '../helpers/core.mjs';

const { buildWorkspace, serializeWorkspace, deserializeWorkspace, isWorkspaceFile } = workspace;

function twoDocuments() {
  const shop = sampleSchema.createOnlineShopSchema();
  const blank = schema.newSchema('작업 중');
  blank.Tables.push(
    schema.newTable({
      Name: 'notes',
      Columns: [schema.newColumn({ Name: 'id', DataType: 'INTEGER', IsPrimaryKey: true })],
    }),
  );
  return [
    { path: 'C:/work/OnlineShop.mdprj', schema: shop },
    { path: null, schema: blank },
  ];
}

suite('workspace · round trip', () => {
  test('every open tab comes back', () => {
    const docs = twoDocuments();
    const text = serializeWorkspace(buildWorkspace(docs, 1));
    const back = deserializeWorkspace(text);
    expect(back.entries).toHaveLength(2);
    expect(back.entries[0].schema.Name).toBe('OnlineShop');
    expect(back.entries[1].schema.Name).toBe('작업 중');
  });

  test('the file each tab came from is remembered', () => {
    const back = deserializeWorkspace(serializeWorkspace(buildWorkspace(twoDocuments(), 0)));
    expect(back.entries[0].path).toBe('C:/work/OnlineShop.mdprj');
    expect(back.entries[1].path).toBeFalsy('a tab with no file has no path');
  });

  test('the tab that was in front is remembered', () => {
    expect(deserializeWorkspace(serializeWorkspace(buildWorkspace(twoDocuments(), 1))).activeIndex).toBe(1);
    expect(deserializeWorkspace(serializeWorkspace(buildWorkspace(twoDocuments(), 0))).activeIndex).toBe(0);
  });

  test('an out-of-range active tab is brought back in range', () => {
    const text = serializeWorkspace(buildWorkspace(twoDocuments(), 99));
    expect(deserializeWorkspace(text).activeIndex).toBe(1);
    expect(deserializeWorkspace(serializeWorkspace(buildWorkspace(twoDocuments(), -5))).activeIndex).toBe(0);
  });

  test('the schemas survive intact, tables and relationships alike', () => {
    const back = deserializeWorkspace(serializeWorkspace(buildWorkspace(twoDocuments(), 0)));
    const shop = back.entries[0].schema;
    expect(shop.Tables).toHaveLength(5);
    expect(shop.Relationships).toHaveLength(4);
    expect(shop.TargetDb).toBe('PostgreSQL');
    const products = shop.Tables.find((t) => t.Name === 'products');
    expect(products.Columns.find((c) => c.Name === 'price').Precision).toBe(12);
  });

  test('saving does not disturb the documents it was given', () => {
    const docs = twoDocuments();
    const before = JSON.stringify(docs[0].schema);
    serializeWorkspace(buildWorkspace(docs, 0));
    expect(JSON.stringify(docs[0].schema)).toBe(before);
  });
});

suite('workspace · bad input', () => {
  test('a file that is not JSON is reported, not swallowed', async () => {
    await expect(() => deserializeWorkspace('this is not a workspace')).toThrow();
  });

  test('JSON that is not a workspace is reported', async () => {
    await expect(() => deserializeWorkspace('{"Tables":[]}')).toThrow();
  });

  test('a workspace with nothing openable is reported', async () => {
    await expect(() => deserializeWorkspace('{"Version":1,"Documents":[]}')).toThrow();
  });

  test('one unreadable tab does not cost the rest of the session', () => {
    const text = serializeWorkspace(buildWorkspace(twoDocuments(), 0));
    const stored = JSON.parse(text);
    stored.Documents.splice(1, 0, { Path: null, Schema: 'nonsense' });
    const back = deserializeWorkspace(JSON.stringify(stored));
    expect(back.entries).toHaveLength(2);
  });

  test('a leading byte order mark is tolerated', () => {
    const text = '\uFEFF' + serializeWorkspace(buildWorkspace(twoDocuments(), 0));
    expect(deserializeWorkspace(text).entries).toHaveLength(2);
  });
});

suite('workspace · file names', () => {
  test('recognised by extension, whatever the case', () => {
    expect(isWorkspaceFile('session.mdwsp')).toBeTruthy();
    expect(isWorkspaceFile('C:/work/SESSION.MDWSP')).toBeTruthy();
  });

  test('a project file is not a workspace', () => {
    expect(isWorkspaceFile('OnlineShop.mdprj')).toBeFalsy();
    expect(isWorkspaceFile('notes.json')).toBeFalsy();
  });
});

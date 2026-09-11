// Port of Models/DbSchema.cs, DbTable.cs, DbColumn.cs helpers
import { v4 as uuid } from 'uuid';
import type { DbColumn, DbRelationship, DbSchema, DbTable } from '../types';

export function newColumn(partial: Partial<DbColumn> = {}): DbColumn {
  return {
    Id: uuid(),
    Name: 'column',
    DataType: 'VARCHAR',
    Length: null,
    Precision: null,
    Scale: null,
    IsPrimaryKey: false,
    IsAutoIncrement: false,
    IsNullable: true,
    IsUnique: false,
    IsForeignKey: false,
    DefaultValue: null,
    Comment: null,
    ...partial,
  };
}

export function newTable(partial: Partial<DbTable> = {}): DbTable {
  return {
    Id: uuid(),
    Name: 'new_table',
    Comment: null,
    Columns: [],
    X: 0,
    Y: 0,
    Width: 210,
    ...partial,
  };
}

export function newRelationship(partial: Partial<DbRelationship> = {}): DbRelationship {
  return {
    Id: uuid(),
    Name: '',
    Type: 'OneToMany',
    LineStyle: 'Straight',
    RoutePoints: [],
    SourceTableId: '',
    SourceColumnId: '',
    TargetTableId: '',
    TargetColumnId: '',
    ...partial,
  };
}

export function newSchema(name: string): DbSchema {
  return { Name: name, TargetDb: 'SQLite', Tables: [], Relationships: [] };
}

/** Port of DbColumn.GetTypeDisplay() */
export function getTypeDisplay(col: DbColumn): string {
  let text = col.DataType ?? '';
  if (col.Length != null) text += '(' + col.Length + ')';
  else if (col.Precision != null && col.Scale != null) text += '(' + col.Precision + ',' + col.Scale + ')';
  else if (col.Precision != null) text += '(' + col.Precision + ')';
  return text;
}

export function ensureInitialized(schema: DbSchema): DbSchema {
  schema.Tables ??= [];
  schema.Relationships ??= [];
  for (const t of schema.Tables) {
    t.Columns ??= [];
    t.Width ??= 210;
    t.X ??= 0;
    t.Y ??= 0;
    for (const c of t.Columns) {
      c.Id ??= uuid();
      if (c.IsNullable === undefined) c.IsNullable = true;
    }
  }
  for (const r of schema.Relationships) {
    r.RoutePoints ??= [];
    r.LineStyle ??= 'Straight';
    r.Type ??= 'OneToMany';
    r.Name ??= '';
  }
  return schema;
}

export function cloneSchema(schema: DbSchema): DbSchema {
  ensureInitialized(schema);
  return {
    Name: schema.Name,
    TargetDb: schema.TargetDb,
    Tables: schema.Tables.map((t) => ({ ...t, Columns: t.Columns.map((c) => ({ ...c })) })),
    Relationships: schema.Relationships.map((r) => ({
      ...r,
      RoutePoints: (r.RoutePoints ?? []).map((p) => ({ ...p })),
    })),
  };
}

export function findTable(schema: DbSchema, id: string): DbTable | undefined {
  return schema.Tables.find((t) => t.Id === id);
}

export function findColumn(schema: DbSchema, tableId: string, columnId: string): DbColumn | undefined {
  return findTable(schema, tableId)?.Columns.find((c) => c.Id === columnId);
}

export function removeColumn(schema: DbSchema, tableId: string, columnId: string): boolean {
  const table = findTable(schema, tableId);
  if (!table) return false;
  const before = table.Columns.length;
  table.Columns = table.Columns.filter((c) => c.Id !== columnId);
  if (table.Columns.length === before) return false;
  schema.Relationships = schema.Relationships.filter(
    (r) => r.SourceColumnId !== columnId && r.TargetColumnId !== columnId,
  );
  return true;
}

export function removeTable(schema: DbSchema, tableId: string): boolean {
  const before = schema.Tables.length;
  schema.Tables = schema.Tables.filter((t) => t.Id !== tableId);
  if (schema.Tables.length === before) return false;
  schema.Relationships = schema.Relationships.filter(
    (r) => r.SourceTableId !== tableId && r.TargetTableId !== tableId,
  );
  return true;
}

export function primaryKeyCount(t: DbTable): number {
  return (t.Columns ?? []).filter((c) => c.IsPrimaryKey).length;
}

/**
 * Relationship endpoint convention, set by the importers and the sample schema:
 *   Source = the parent table and its referenced (primary key) column
 *   Target = the child table and the column that holds the foreign key
 * Every consumer below reads relationships through these helpers so the
 * convention is stated in exactly one place.
 */

/** True when the column participates in any relationship (either endpoint). */
export function isForeignKeyColumn(schema: DbSchema, col: DbColumn): boolean {
  return schema.Relationships.some((r) => r.SourceColumnId === col.Id || r.TargetColumnId === col.Id);
}

/** True when the column holds a foreign key — the child side, drawn as "FK". */
export function isOutgoingForeignKey(schema: DbSchema, tableId: string, columnId: string): boolean {
  return schema.Relationships.some((r) => r.TargetTableId === tableId && r.TargetColumnId === columnId);
}

/** Relationships in which `tableId` is the child (it holds the foreign key). */
export function getOutgoingRelationships(schema: DbSchema, tableId: string): DbRelationship[] {
  return schema.Relationships.filter((r) => r.TargetTableId === tableId);
}

/** Ids of the columns of `tableId` that hold a foreign key. */
export function getForeignKeyColumnIds(schema: DbSchema, tableId: string): Set<string> {
  return new Set(getOutgoingRelationships(schema, tableId).map((r) => r.TargetColumnId));
}

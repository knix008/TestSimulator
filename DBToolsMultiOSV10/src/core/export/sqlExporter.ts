// Port of Export/SqlExporter.cs
import type { DbColumn, DbRelationship, DbSchema, DbTable, DbTargetType } from '../../types';
import { getAutoIncrementKeyword, typeHasLength, typeHasPrecisionScale } from '../dataTypes';
import { findColumn, findTable } from '../schema';

function getQuotePair(db: DbTargetType): [string, string] {
  switch (db) {
    case 'MySQL':
    case 'MariaDB':
      return ['`', '`'];
    case 'SqlServer':
      return ['[', ']'];
    default:
      return ['"', '"'];
  }
}

function quote(db: DbTargetType, identifier: string): string {
  const [open, close] = getQuotePair(db);
  return open + identifier + close;
}

function escapeString(s: string): string {
  return s.split("'").join("''");
}

function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

function getColumnType(col: DbColumn, db: DbTargetType): string {
  const upper = (col.DataType || '').toUpperCase();
  if (db === 'PostgreSQL' && col.IsPrimaryKey && col.IsAutoIncrement) {
    if (upper === 'INTEGER' || upper === 'INT') return 'SERIAL';
    if (upper === 'BIGINT') return 'BIGSERIAL';
    if (upper === 'SMALLINT') return 'SMALLSERIAL';
  }
  if (typeHasLength(upper) && col.Length != null) return `${col.DataType}(${col.Length})`;
  if (typeHasPrecisionScale(upper)) {
    if (col.Precision != null && col.Scale != null) return `${col.DataType}(${col.Precision},${col.Scale})`;
    if (col.Precision != null) return `${col.DataType}(${col.Precision})`;
  }
  return col.DataType;
}

function getColumnDdl(col: DbColumn, table: DbTable, schema: DbSchema): string {
  const db = schema.TargetDb;
  // The emitted type, which may differ from col.DataType — PostgreSQL promotes
  // an auto-increment INTEGER PK to SERIAL. The auto-increment keyword must be
  // derived from that effective type, or the column would come out as
  // "SERIAL GENERATED ALWAYS AS IDENTITY", which PostgreSQL rejects.
  const effectiveType = getColumnType(col, db);
  let sb = `${quote(db, col.Name)} ${effectiveType}`;
  const pkColumns = table.Columns.filter((c) => c.IsPrimaryKey);

  if (col.IsPrimaryKey) {
    if (pkColumns.length === 1 && col.IsAutoIncrement) {
      const keyword = getAutoIncrementKeyword(db, effectiveType);
      if (keyword) sb += ` ${keyword}`;
    }
    if (pkColumns.length === 1) sb += ' PRIMARY KEY';
    sb += ' NOT NULL';
  } else {
    if (!col.IsNullable) sb += ' NOT NULL';
    if (col.IsUnique) sb += ' UNIQUE';
  }

  if (col.DefaultValue && col.DefaultValue.trim()) sb += ` DEFAULT ${col.DefaultValue}`;
  if ((db === 'MySQL' || db === 'MariaDB') && col.Comment && col.Comment.trim()) {
    sb += ` COMMENT '${escapeString(col.Comment)}'`;
  }
  return sb;
}

function appendCreateTable(lines: string[], table: DbTable, schema: DbSchema): void {
  const db = schema.TargetDb;
  if (table.Comment && table.Comment.trim()) lines.push(`-- ${table.Comment}`);
  lines.push(`CREATE TABLE ${quote(db, table.Name)} (`);

  const parts: string[] = table.Columns.map((c) => `    ${getColumnDdl(c, table, schema)}`);

  const pkColumns = table.Columns.filter((c) => c.IsPrimaryKey);
  if (pkColumns.length > 1) {
    parts.push(`    PRIMARY KEY (${pkColumns.map((c) => quote(db, c.Name)).join(', ')})`);
  }

  if (db === 'SQLite') {
    // Source is the parent (referenced PK), Target is this child table's FK column.
    for (const rel of schema.Relationships.filter((r) => r.TargetTableId === table.Id)) {
      const childCol = table.Columns.find((c) => c.Id === rel.TargetColumnId);
      const parentTable = findTable(schema, rel.SourceTableId);
      const parentCol = findColumn(schema, rel.SourceTableId, rel.SourceColumnId);
      if (childCol && parentTable && parentCol) {
        parts.push(
          `    FOREIGN KEY (${quote(db, childCol.Name)}) REFERENCES ${quote(db, parentTable.Name)}(${quote(
            db,
            parentCol.Name,
          )})`,
        );
      }
    }
  }

  lines.push(parts.join(',\n'));

  let tail = ')';
  if (db === 'MySQL' || db === 'MariaDB') {
    tail += ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4';
    if (table.Comment && table.Comment.trim()) tail += ` COMMENT='${escapeString(table.Comment)}'`;
  }
  lines.push(`${tail};`);

  if (db === 'PostgreSQL') {
    for (const col of table.Columns.filter((c) => c.Comment && c.Comment.trim())) {
      lines.push(
        `COMMENT ON COLUMN ${quote(db, table.Name)}.${quote(db, col.Name)} IS '${escapeString(col.Comment!)}';`,
      );
    }
    if (table.Comment && table.Comment.trim()) {
      lines.push(`COMMENT ON TABLE ${quote(db, table.Name)} IS '${escapeString(table.Comment)}';`);
    }
  }
}

function appendForeignKey(lines: string[], rel: DbRelationship, schema: DbSchema): void {
  const db = schema.TargetDb;
  // The constraint is declared on the child (Target) and references the parent (Source).
  const childTable = findTable(schema, rel.TargetTableId);
  const parentTable = findTable(schema, rel.SourceTableId);
  const childCol = findColumn(schema, rel.TargetTableId, rel.TargetColumnId);
  const parentCol = findColumn(schema, rel.SourceTableId, rel.SourceColumnId);
  if (!childTable || !parentTable || !childCol || !parentCol) return;

  const name =
    rel.Name && rel.Name.trim() ? rel.Name : `fk_${childTable.Name}_${childCol.Name}`;
  lines.push(`ALTER TABLE ${quote(db, childTable.Name)}`);
  lines.push(`    ADD CONSTRAINT ${quote(db, name)}`);
  lines.push(`    FOREIGN KEY (${quote(db, childCol.Name)})`);
  lines.push(`    REFERENCES ${quote(db, parentTable.Name)}(${quote(db, parentCol.Name)});`);
  lines.push('');
}

export function exportSql(schema: DbSchema, now: Date = new Date()): string {
  const lines: string[] = [];
  lines.push('-- Generated by DBTools');
  lines.push(`-- Database: ${schema.Name}`);
  lines.push(`-- Target:   ${schema.TargetDb}`);
  lines.push(`-- Date:     ${formatTimestamp(now)}`);
  lines.push('');

  for (const table of schema.Tables) {
    appendCreateTable(lines, table, schema);
    lines.push('');
  }

  if (schema.TargetDb !== 'SQLite') {
    for (const rel of schema.Relationships) appendForeignKey(lines, rel, schema);
  }

  return lines.join('\n');
}

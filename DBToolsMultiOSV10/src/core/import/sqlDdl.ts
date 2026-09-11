// Port of Import/SqlDdlSchemaImporter.cs + SchemaRelationshipBuilder.cs
import type { DbColumn, DbSchema, DbTable, DbTargetType } from '../../types';
import { autoArrange } from '../layout';
import { ensureInitialized, newColumn, newRelationship, newSchema, newTable } from '../schema';

const ALTER_FK_RE =
  /ALTER\s+TABLE\s+([[`"]?\w+[\]`"]?)\s+ADD\s+(?:CONSTRAINT\s+([[`"]?\w+[\]`"]?)\s+)?FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+([[`"]?\w+[\]`"]?)\s*\(([^)]+)\)/gi;

const INLINE_FK_RE =
  /(?:CONSTRAINT\s+([[`"]?\w+[\]`"]?)\s+)?FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+([[`"]?\w+[\]`"]?)\s*\(([^)]+)\)/i;

function unquoteIdentifier(value: string): string {
  return (value ?? '').trim().replace(/^[`"[\]]+|[`"[\]]+$/g, '');
}

function skipWhitespace(sql: string, index: number): number {
  while (index < sql.length && /\s/.test(sql[index])) index++;
  return index;
}

function isIdentifierChar(ch: string): boolean {
  return /[A-Za-z0-9]/.test(ch) || ch === '$' || ch === '.' || ch === '_';
}

interface Cursor {
  i: number;
}

function tryReadIdentifier(sql: string, cursor: Cursor): string | null {
  cursor.i = skipWhitespace(sql, cursor.i);
  if (cursor.i >= sql.length) return null;
  const ch = sql[cursor.i];
  if (ch === '"' || ch === '[' || ch === '`') {
    const closing = ch === '[' ? ']' : ch;
    const end = sql.indexOf(closing, cursor.i + 1);
    if (end < 0) return null;
    const identifier = sql.substring(cursor.i + 1, end);
    cursor.i = end + 1;
    return identifier;
  }
  const start = cursor.i;
  while (cursor.i < sql.length && isIdentifierChar(sql[cursor.i])) cursor.i++;
  if (start === cursor.i) return null;
  return unquoteIdentifier(sql.substring(start, cursor.i));
}

function tryReadBalancedBody(sql: string, cursor: Cursor): string | null {
  let depth = 1;
  const start = cursor.i;
  while (cursor.i < sql.length && depth > 0) {
    const ch = sql[cursor.i++];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
  }
  if (depth !== 0) return null;
  return sql.substring(start, cursor.i - 1);
}

/** Strip line and block comments while respecting quoted strings/identifiers. */
export function stripComments(sql: string): string {
  let out = '';
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    const next = i + 1 < sql.length ? sql[i + 1] : '\0';
    if (!inSingle && !inDouble && !inBacktick && ch === '-' && next === '-') {
      i += 2;
      while (i < sql.length && sql[i] !== '\n') i++;
    } else if (!inSingle && !inDouble && !inBacktick && ch === '/' && next === '*') {
      i += 2;
      while (i + 1 < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i += 2;
    } else if (!inDouble && !inBacktick && ch === "'") {
      inSingle = !inSingle;
      out += ch;
      i++;
    } else if (!inSingle && !inBacktick && ch === '"') {
      inDouble = !inDouble;
      out += ch;
      i++;
    } else if (!inSingle && !inDouble && ch === '`') {
      inBacktick = !inBacktick;
      out += ch;
      i++;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

export function detectTargetDb(sql: string): DbTargetType {
  if (/\bBIGSERIAL\b|\bSERIAL\b|COMMENT\s+ON\s+(TABLE|COLUMN)/i.test(sql)) return 'PostgreSQL';
  if (/\bIDENTITY\s*\(|\[dbo\]\./i.test(sql)) return 'SqlServer';
  if (/\bAUTO_INCREMENT\b|ENGINE\s*=\s*InnoDB/i.test(sql)) {
    return /\bMariaDB\b/i.test(sql) ? 'MariaDB' : 'MySQL';
  }
  if (/\bAUTOINCREMENT\b/i.test(sql)) return 'SQLite';
  return 'MySQL';
}

function splitColumnList(value: string): string[] {
  return value
    .split(',')
    .map((c) => unquoteIdentifier(c.trim()))
    .filter((c) => !!c.trim());
}

/** Split a CREATE TABLE body on top-level commas. */
function splitDefinitions(body: string): string[] {
  const list: string[] = [];
  let current = '';
  let depth = 0;
  for (const ch of body) {
    if (ch === '(') depth++;
    else if (ch === ')' && depth > 0) depth--;
    if (ch === ',' && depth === 0) {
      list.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.length > 0) list.push(current);
  return list;
}

function readTypeSuffix(tokens: string[], state: { i: number }): string {
  let sb = '';
  while (state.i < tokens.length) {
    sb += tokens[state.i];
    if (tokens[state.i].includes(')')) {
      state.i++;
      break;
    }
    state.i++;
  }
  return sb;
}

function parseTypeDimensions(typeSuffix: string, column: DbColumn): void {
  const m = /\(([^)]+)\)/.exec(typeSuffix);
  if (!m) return;
  const value = m[1];
  if (value.includes(',')) {
    const [a, b] = value.split(',', 2);
    const precision = parseInt(a.trim(), 10);
    const scale = parseInt(b.trim(), 10);
    if (!Number.isNaN(precision)) column.Precision = precision;
    if (!Number.isNaN(scale)) column.Scale = scale;
  } else {
    const length = parseInt(value.trim(), 10);
    if (!Number.isNaN(length)) column.Length = length;
  }
}

function tryParseColumn(definition: string, targetDb: DbTargetType): DbColumn | null {
  const cursor: Cursor = { i: 0 };
  const name = tryReadIdentifier(definition, cursor);
  if (!name) return null;

  const column = newColumn({ Name: name });
  cursor.i = skipWhitespace(definition, cursor.i);
  const rest = definition.substring(cursor.i).trim();
  if (!rest) {
    column.DataType = 'TEXT';
    column.IsNullable = true;
    return column;
  }

  const tokens = rest.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  const state = { i: 0 };
  column.DataType = tokens[state.i++].toUpperCase();
  if (state.i < tokens.length && tokens[state.i].startsWith('(')) {
    // Spaced form: "DECIMAL (12, 2)".
    const suffix = readTypeSuffix(tokens, state);
    column.DataType += suffix;
    parseTypeDimensions(suffix, column);
  }
  // Attached form: "VARCHAR(255)". Split the dimensions off the type name so
  // Length / Precision / Scale are populated and stay editable in the UI.
  const attached = /^([^(]+)(\([^)]*\).*)$/.exec(column.DataType);
  if (attached) {
    column.DataType = attached[1].trim();
    parseTypeDimensions(attached[2], column);
  }

  const flags = tokens.slice(state.i).join(' ').toUpperCase();
  if (flags.includes('PRIMARY KEY')) {
    column.IsPrimaryKey = true;
    column.IsNullable = false;
  }

  const explicitAutoIncrement =
    flags.includes('AUTO_INCREMENT') || flags.includes('AUTOINCREMENT') || /\bIDENTITY\s*\(/i.test(flags);
  const pgSerial =
    targetDb === 'PostgreSQL' &&
    column.IsPrimaryKey &&
    ['SERIAL', 'BIGSERIAL', 'SMALLSERIAL'].includes(column.DataType);
  if (explicitAutoIncrement || pgSerial) column.IsAutoIncrement = true;

  // Match whole words. A leading-space test (as the original used) misses the
  // keyword when it is the column's only modifier — "e VARCHAR(9) UNIQUE".
  if (flags.includes('NOT NULL')) column.IsNullable = false;
  else if (/\bNULL\b/.test(flags) && !column.IsPrimaryKey) column.IsNullable = true;
  else column.IsNullable = !column.IsPrimaryKey;

  if (/\bUNIQUE\b/.test(flags)) column.IsUnique = true;

  const defaultMatch = /DEFAULT\s+('[^']*'|\S+)/i.exec(rest);
  if (defaultMatch) column.DefaultValue = defaultMatch[1].replace(/^'|'$/g, '');

  return column;
}

/** Port of SchemaRelationshipBuilder.AddForeignKey. */
function addForeignKey(
  schema: DbSchema,
  tableMap: Map<string, DbTable>,
  parentTableName: string,
  parentColumnName: string,
  childTableName: string,
  childColumnName: string,
  constraintName?: string | null,
): void {
  ensureInitialized(schema);
  const parentTable = tableMap.get(parentTableName.toLowerCase());
  const childTable = tableMap.get(childTableName.toLowerCase());
  if (!parentTable || !childTable) return;

  const parentCol = parentTable.Columns.find(
    (c) => c.Name.toLowerCase() === parentColumnName.toLowerCase(),
  );
  const childCol = childTable.Columns.find(
    (c) => c.Name.toLowerCase() === childColumnName.toLowerCase(),
  );
  if (!parentCol || !childCol) return;

  const exists = schema.Relationships.some(
    (r) =>
      r.SourceTableId === parentTable.Id &&
      r.SourceColumnId === parentCol.Id &&
      r.TargetTableId === childTable.Id &&
      r.TargetColumnId === childCol.Id,
  );
  if (exists) return;

  childCol.IsForeignKey = true;
  schema.Relationships.push(
    newRelationship({
      Name:
        constraintName && constraintName.trim()
          ? constraintName
          : `fk_${childTable.Name}_${childCol.Name}`,
      Type: 'OneToMany',
      SourceTableId: parentTable.Id,
      SourceColumnId: parentCol.Id,
      TargetTableId: childTable.Id,
      TargetColumnId: childCol.Id,
    }),
  );
}

/** A foreign key found while parsing, resolved once every table is known. */
interface PendingForeignKey {
  parentTable: string;
  parentColumn: string;
  childTable: string;
  childColumn: string;
  constraintName: string | null;
}

function collectForeignKeyMatch(
  match: RegExpExecArray | RegExpMatchArray | null,
  childTable: string,
  pending: PendingForeignKey[],
): void {
  if (!match) return;
  const constraintName = match[1] ? unquoteIdentifier(match[1]) : null;
  const fkCols = splitColumnList(match[2]);
  const parentTableName = unquoteIdentifier(match[3]);
  const pkCols = splitColumnList(match[4]);
  const count = Math.min(fkCols.length, pkCols.length);
  for (let i = 0; i < count; i++) {
    pending.push({
      parentTable: parentTableName,
      parentColumn: pkCols[i],
      childTable,
      childColumn: fkCols[i],
      constraintName,
    });
  }
}

function applyTableConstraint(table: DbTable, definition: string, pending: PendingForeignKey[]): void {
  if (definition.toUpperCase().includes('FOREIGN KEY')) {
    collectForeignKeyMatch(INLINE_FK_RE.exec(definition), table.Name, pending);
    return;
  }
  const match = /PRIMARY\s+KEY\s*\(([^)]+)\)/i.exec(definition);
  if (!match) return;
  for (const colName of splitColumnList(match[1])) {
    const col = table.Columns.find((c) => c.Name.toLowerCase() === colName.toLowerCase());
    if (col) {
      col.IsPrimaryKey = true;
      col.IsNullable = false;
    }
  }
}

function parseTableBody(
  table: DbTable,
  body: string,
  targetDb: DbTargetType,
  pending: PendingForeignKey[],
): void {
  for (const raw of splitDefinitions(body)) {
    if (!raw.trim()) continue;
    const text = raw.trim();
    const upper = text.toUpperCase();
    if (
      upper.startsWith('CONSTRAINT ') ||
      upper.startsWith('PRIMARY KEY') ||
      upper.startsWith('UNIQUE ') ||
      upper.startsWith('KEY ') ||
      upper.startsWith('INDEX ') ||
      upper.startsWith('FOREIGN KEY')
    ) {
      applyTableConstraint(table, text, pending);
    } else if (INLINE_FK_RE.test(text)) {
      collectForeignKeyMatch(INLINE_FK_RE.exec(text), table.Name, pending);
    } else {
      const column = tryParseColumn(text, targetDb);
      if (column) table.Columns.push(column);
    }
  }
}

function parseCreateTables(
  sql: string,
  schema: DbSchema,
  tableMap: Map<string, DbTable>,
  targetDb: DbTargetType,
  pending: PendingForeignKey[],
): void {
  let index = 0;
  const upperSql = sql.toUpperCase();
  for (;;) {
    const found = upperSql.indexOf('CREATE TABLE', index);
    if (found < 0) break;
    const cursor: Cursor = { i: found + 'CREATE TABLE'.length };
    cursor.i = skipWhitespace(sql, cursor.i);
    if (sql.substring(cursor.i, cursor.i + 13).toUpperCase() === 'IF NOT EXISTS') {
      cursor.i += 13;
      cursor.i = skipWhitespace(sql, cursor.i);
    }
    const tableName = tryReadIdentifier(sql, cursor);
    if (!tableName) {
      index = found + 12;
      continue;
    }
    cursor.i = skipWhitespace(sql, cursor.i);
    if (cursor.i >= sql.length || sql[cursor.i] !== '(') {
      index = found + 12;
      continue;
    }
    cursor.i++;
    const body = tryReadBalancedBody(sql, cursor);
    if (body == null) break;
    index = cursor.i;

    if (!tableMap.has(tableName.toLowerCase())) {
      const table = newTable({ Name: tableName });
      parseTableBody(table, body, targetDb, pending);
      schema.Tables.push(table);
      tableMap.set(tableName.toLowerCase(), table);
    }
  }
}

function parseAlterForeignKeys(sql: string, pending: PendingForeignKey[]): void {
  ALTER_FK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ALTER_FK_RE.exec(sql)) !== null) {
    const childTableName = unquoteIdentifier(m[1]);
    const constraintName = m[2] ? unquoteIdentifier(m[2]) : null;
    const fkCols = splitColumnList(m[3]);
    const parentTableName = unquoteIdentifier(m[4]);
    const pkCols = splitColumnList(m[5]);
    const count = Math.min(fkCols.length, pkCols.length);
    for (let i = 0; i < count; i++) {
      pending.push({
        parentTable: parentTableName,
        parentColumn: pkCols[i],
        childTable: childTableName,
        childColumn: fkCols[i],
        constraintName,
      });
    }
  }
}

/** Import a SQL DDL script into a schema. `name` is used as the schema name. */
export function importSqlDdl(sqlText: string, name: string): DbSchema {
  const sql = stripComments(sqlText);
  const targetDb = detectTargetDb(sql);
  const schema = newSchema(name);
  schema.TargetDb = targetDb;

  const tableMap = new Map<string, DbTable>();
  // Foreign keys are resolved only after every CREATE TABLE has been read, so a
  // constraint may reference a table that is declared later in the script — or
  // the very table it appears in, which is how SQLite emits its FKs.
  const pending: PendingForeignKey[] = [];
  parseCreateTables(sql, schema, tableMap, targetDb, pending);
  parseAlterForeignKeys(sql, pending);
  for (const fk of pending) {
    addForeignKey(
      schema,
      tableMap,
      fk.parentTable,
      fk.parentColumn,
      fk.childTable,
      fk.childColumn,
      fk.constraintName,
    );
  }
  autoArrange(schema);
  return schema;
}

// Port of Export/SqliteDatabaseExporter.cs — builds a real .db file with sql.js.
import type { DbSchema } from '../../types';
import { getSqlJs } from '../import/sqlJs';
import { exportSql } from './sqlExporter';
import { cloneForTarget, splitStatements } from './schemaExportHelper';

/**
 * Default expressions that other engines understand but SQLite cannot parse.
 * Retargeting a schema keeps column types and defaults verbatim, so a
 * PostgreSQL `DEFAULT NOW()` would otherwise make CREATE TABLE fail outright.
 * Only the .db writer applies this — the SQL text export stays verbatim.
 */
const DEFAULT_EXPRESSION_MAP: [RegExp, string][] = [
  [/^NOW\(\)$/i, 'CURRENT_TIMESTAMP'],
  [/^GETDATE\(\)$/i, 'CURRENT_TIMESTAMP'],
  [/^SYSDATETIME\(\)$/i, 'CURRENT_TIMESTAMP'],
  [/^CURRENT_TIMESTAMP\(\)$/i, 'CURRENT_TIMESTAMP'],
  [/^CURRENT_DATE\(\)$/i, 'CURRENT_DATE'],
  [/^CURRENT_TIME\(\)$/i, 'CURRENT_TIME'],
  [/^NEWID\(\)$/i, "(lower(hex(randomblob(16))))"],
  [/^GEN_RANDOM_UUID\(\)$/i, "(lower(hex(randomblob(16))))"],
  [/^UUID\(\)$/i, "(lower(hex(randomblob(16))))"],
];

function translateDefault(expression: string): string {
  const trimmed = expression.trim();
  for (const [pattern, replacement] of DEFAULT_EXPRESSION_MAP) {
    if (pattern.test(trimmed)) return replacement;
  }
  return expression;
}

/** Retarget to SQLite and make the column defaults valid for SQLite. */
export function toSqliteSchema(schema: DbSchema): DbSchema {
  const clone = cloneForTarget(schema, 'SQLite');
  for (const table of clone.Tables) {
    for (const column of table.Columns) {
      if (column.DefaultValue) column.DefaultValue = translateDefault(column.DefaultValue);
    }
  }
  return clone;
}

export async function exportSqliteDatabase(schema: DbSchema): Promise<Uint8Array> {
  if (!schema) throw new Error('스키마가 필요합니다.');

  const sql = exportSql(toSqliteSchema(schema));
  const SQL = await getSqlJs();
  const db = new SQL.Database();
  try {
    db.run('PRAGMA foreign_keys = ON;');
    const failures: string[] = [];
    for (const statement of splitStatements(sql)) {
      if (!statement.trim()) continue;
      try {
        db.run(statement);
      } catch (err) {
        // Report every offending statement rather than only the first.
        const head = statement.split('\n')[0];
        failures.push(`${head} → ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (failures.length > 0) {
      throw new Error(
        `SQLite 데이터베이스를 만들 수 없습니다:\n${failures.join('\n')}`,
      );
    }

    // A database that never allocated a page exports as zero bytes, which is
    // not a readable SQLite file. Touching a header field forces page 1 out so
    // an empty schema still yields a valid (if empty) database.
    let bytes = db.export();
    if (bytes.length === 0) {
      db.run('PRAGMA user_version = 0;');
      bytes = db.export();
    }
    return bytes;
  } finally {
    db.close();
  }
}

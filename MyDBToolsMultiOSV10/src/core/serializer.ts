// Port of Serialization/SchemaSerializer.cs — .mdprj is indented UTF-8 JSON
import type { DbSchema } from '../types';
import { ensureInitialized } from './schema';

/** Mirrors System.Text.Json WriteIndented + DefaultIgnoreCondition.WhenWritingNull. */
export function serializeToString(schema: DbSchema): string {
  ensureInitialized(schema);
  return JSON.stringify(schema, (_k, v) => (v === null ? undefined : v), 2);
}

export function deserialize(json: string): DbSchema {
  // DBToolsWinV10 writes .mdprj with File.WriteAllText(..., Encoding.UTF8),
  // which emits a BOM that JSON.parse rejects.
  const text = json.charCodeAt(0) === 0xfeff ? json.slice(1) : json;
  const schema = JSON.parse(text) as DbSchema;
  if (!schema || typeof schema !== 'object' || !Array.isArray((schema as DbSchema).Tables)) {
    throw new Error('스키마 파일을 읽을 수 없습니다.');
  }
  return ensureInitialized(schema);
}

export function areEquivalent(left: DbSchema | null, right: DbSchema | null): boolean {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return serializeToString(left) === serializeToString(right);
}

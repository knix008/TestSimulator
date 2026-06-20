/** MySQL/MariaDB DATETIME columns reject ISO-8601 strings with a `Z` suffix. */
export function toSqlDateTime(value: Date = new Date()): string {
  return value.toISOString().slice(0, 19).replace("T", " ");
}

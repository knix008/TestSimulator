export function isSystemDefaultProjectRow(row) {
  if (!row) return false;
  if (Number(row.is_system_default) === 1) return true;
  return String(row.code || '').toUpperCase() === 'DEFAULT';
}

export async function getSystemDefaultProject(db) {
  const flagged = await db.prepare(
    'SELECT id FROM projects WHERE is_system_default = 1 ORDER BY id ASC LIMIT 1',
  ).get();
  if (flagged) return flagged;

  return db.prepare(
    "SELECT id FROM projects WHERE code = 'DEFAULT' ORDER BY id ASC LIMIT 1",
  ).get();
}

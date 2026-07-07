import { formatTcCode } from './testCaseCodeAllocator.js';

export async function renumberTestCaseCodes(db) {
  const all = await db
    .prepare('SELECT id FROM test_cases ORDER BY requirement_id ASC, id ASC')
    .all();

  if (all.length === 0) return [];

  const assigned = [];

  await db.transaction(async (tx) => {
    for (const row of all) {
      await tx.prepare('UPDATE test_cases SET code = ? WHERE id = ?').run(`__tmp_tc_${row.id}`, row.id);
    }

    let sequence = 1;
    for (const row of all) {
      const code = formatTcCode(sequence);
      sequence += 1;
      await tx.prepare('UPDATE test_cases SET code = ?, updated_at = datetime(\'now\') WHERE id = ?').run(code, row.id);
      assigned.push({ id: row.id, code });
    }
  });

  return assigned;
}

export function tempTestCaseCode() {
  return `__tmp_tc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

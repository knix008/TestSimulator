const REQ_CODE_PATTERN = /^REQ-(\d+)$/i;

export function formatReqCode(sequence) {
  return `REQ-${String(sequence).padStart(2, '0')}`;
}

export async function renumberRequirementCodes(db, projectId) {
  const all = await db
    .prepare('SELECT id FROM requirements WHERE project_id = ? ORDER BY category ASC, id ASC')
    .all(projectId);

  if (all.length === 0) return [];

  const assigned = [];

  await db.transaction(async (tx) => {
    for (const r of all) {
      await tx.prepare('UPDATE requirements SET code = ? WHERE id = ?').run(`__tmp_${r.id}`, r.id);
    }

    let sequence = 1;
    for (const r of all) {
      const code = formatReqCode(sequence);
      sequence += 1;
      await tx.prepare('UPDATE requirements SET code = ?, updated_at = datetime(\'now\') WHERE id = ?').run(code, r.id);
      assigned.push({ id: r.id, code });
    }
  });

  return assigned;
}

export function tempCode() {
  return `__tmp_new_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function isReqCode(value) {
  return REQ_CODE_PATTERN.test(String(value || '').trim());
}

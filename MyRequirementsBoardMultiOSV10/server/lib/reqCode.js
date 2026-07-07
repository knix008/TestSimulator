export async function renumberRequirementCodes(db, projectId) {
  const all = await db
    .prepare('SELECT id, category FROM requirements WHERE project_id = ? ORDER BY id ASC')
    .all(projectId);

  await db.transaction(async (tx) => {
    for (const r of all) {
      await tx.prepare('UPDATE requirements SET code = ? WHERE id = ?').run(`__tmp_${r.id}`, r.id);
    }

    const counters = {};
    for (const r of all) {
      const prefix = sanitizePrefix(r.category);
      counters[prefix] = (counters[prefix] || 0) + 1;
      const code = `${prefix}-${String(counters[prefix]).padStart(2, '0')}`;
      await tx.prepare('UPDATE requirements SET code = ?, updated_at = datetime(\'now\') WHERE id = ?').run(code, r.id);
    }
  });
}

function sanitizePrefix(category) {
  const cleaned = (category || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return cleaned || 'REQ';
}

export function tempCode() {
  return `__tmp_new_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const REQ_CODE_PATTERN = /^REQ-(\d+)$/i;

export function formatReqCode(sequence) {
  return `REQ-${String(sequence).padStart(2, '0')}`;
}

/** 이전 카테고리 접두사 자동 코드 (GUI-01, 기기/등록-01 등) */
export function isLegacyAutoCode(value) {
  const text = String(value || '').trim();
  if (!text || isReqCode(text)) return false;
  if (/^RFP_/i.test(text) || /^SRS-/i.test(text)) return false;
  if (/[/\\]/.test(text) && /-\d{2,}$/.test(text)) return true;
  if (/^[A-Za-z][A-Za-z0-9]*-\d{2,}$/.test(text)) return true;
  if (/^[\uAC00-\uD7A3]+-\d{2,}$/u.test(text)) return true;
  return false;
}

export async function renumberRequirementCodes(db, projectId) {
  const all = await db
    .prepare('SELECT id FROM requirements WHERE project_id = ? ORDER BY id ASC')
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

export function needsRequirementRenumber(code) {
  const text = String(code || '').trim();
  if (!text) return true;
  if (text.startsWith('__')) return true;
  if (isLegacyAutoCode(text)) return true;
  return !isReqCode(text);
}

export async function ensureRequirementCodes(db, projectId) {
  const rows = await db.prepare('SELECT code FROM requirements WHERE project_id = ?').all(projectId);
  if (rows.some((row) => needsRequirementRenumber(row.code))) {
    return renumberRequirementCodes(db, projectId);
  }
  return null;
}

export async function repairAllProjectRequirementCodes(db) {
  const projects = await db.prepare('SELECT id FROM projects').all();
  for (const project of projects) {
    await ensureRequirementCodes(db, project.id);
  }
}

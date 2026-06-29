import { query, queryOne, execute } from '../db.js';
import { logRequirementIdChange } from './requirementHistory.js';

const REQ_ID_PATTERN = /^REQ-(\d+)$/i;
const TEMP_PREFIX = '__REQ_SHIFT_';

export function parseStandardReqNum(reqId) {
  const m = String(reqId).trim().match(REQ_ID_PATTERN);
  return m ? parseInt(m[1], 10) : null;
}

export function formatStandardReqId(num) {
  return `REQ-${String(num).padStart(3, '0')}`;
}

export async function getNextStandardReqId() {
  const rows = await query('SELECT req_id FROM requirements');
  let max = 0;
  for (const row of rows) {
    const n = parseStandardReqNum(row.req_id);
    if (n !== null && n > max) max = n;
  }
  return formatStandardReqId(max + 1);
}

async function shiftStandardReqIdsFrom(targetNum, excludeDbId = null, userId = null) {
  const rows = await query('SELECT id, req_id FROM requirements');
  const toShift = rows
    .filter((row) => {
      if (excludeDbId != null && Number(row.id) === Number(excludeDbId)) return false;
      const n = parseStandardReqNum(row.req_id);
      return n !== null && n >= targetNum;
    })
    .map((row) => ({ id: row.id, num: parseStandardReqNum(row.req_id), oldReqId: row.req_id }));

  if (toShift.length === 0) return 0;

  for (const item of toShift) {
    await execute(
      'UPDATE requirements SET req_id = ? WHERE id = ?',
      [`${TEMP_PREFIX}${item.id}__`, item.id]
    );
  }

  for (const item of toShift.sort((a, b) => a.num - b.num)) {
    const newReqId = formatStandardReqId(item.num + 1);
    await execute(
      'UPDATE requirements SET req_id = ? WHERE id = ?',
      [newReqId, item.id]
    );
    if (userId) {
      await logRequirementIdChange(item.id, item.oldReqId, newReqId, userId, 'id_shift');
    }
  }

  return toShift.length;
}

export async function renumberAllStandardReqIds(userId = null) {
  const rows = await query('SELECT id, req_id FROM requirements');
  const standard = rows
    .map((row) => ({ id: row.id, num: parseStandardReqNum(row.req_id), oldReqId: row.req_id }))
    .filter((item) => item.num !== null)
    .sort((a, b) => a.num - b.num);

  if (standard.length === 0) return 0;

  for (const item of standard) {
    await execute(
      'UPDATE requirements SET req_id = ? WHERE id = ?',
      [`${TEMP_PREFIX}${item.id}__`, item.id]
    );
  }

  let renumberedCount = 0;
  for (let i = 0; i < standard.length; i++) {
    const newId = formatStandardReqId(i + 1);
    const oldId = formatStandardReqId(standard[i].num);
    await execute(
      'UPDATE requirements SET req_id = ? WHERE id = ?',
      [newId, standard[i].id]
    );
    if (newId !== oldId) {
      renumberedCount++;
      if (userId) {
        await logRequirementIdChange(standard[i].id, standard[i].oldReqId, newId, userId, 'id_renumber');
      }
    }
  }

  return renumberedCount;
}

export async function resolveReqIdForCreate(reqId, userId = null) {
  const trimmed = String(reqId).trim();
  if (!trimmed) throw Object.assign(new Error('reqId required'), { status: 400 });

  const targetNum = parseStandardReqNum(trimmed);
  if (targetNum === null) {
    const existing = await queryOne('SELECT id FROM requirements WHERE req_id = ?', [trimmed]);
    if (existing) throw Object.assign(new Error('Requirement ID already exists'), { status: 409 });
    return { reqId: trimmed, shiftedCount: 0 };
  }

  const normalized = formatStandardReqId(targetNum);
  const existing = await queryOne('SELECT id FROM requirements WHERE req_id = ?', [normalized]);
  let shiftedCount = 0;
  if (existing) {
    shiftedCount = await shiftStandardReqIdsFrom(targetNum, null, userId);
  }
  return { reqId: normalized, shiftedCount };
}

export async function resolveReqIdForUpdate(dbId, newReqId, oldReqId, userId = null) {
  const trimmed = String(newReqId).trim();
  if (!trimmed) throw Object.assign(new Error('reqId required'), { status: 400 });
  if (trimmed === oldReqId) return { reqId: oldReqId, shiftedCount: 0 };

  const targetNum = parseStandardReqNum(trimmed);
  if (targetNum === null) {
    const dup = await queryOne(
      'SELECT id FROM requirements WHERE req_id = ? AND id != ?',
      [trimmed, dbId]
    );
    if (dup) throw Object.assign(new Error('Requirement ID already exists'), { status: 409 });
    return { reqId: trimmed, shiftedCount: 0 };
  }

  const normalized = formatStandardReqId(targetNum);
  const dup = await queryOne(
    'SELECT id FROM requirements WHERE req_id = ? AND id != ?',
    [normalized, dbId]
  );
  let shiftedCount = 0;
  if (dup) {
    shiftedCount = await shiftStandardReqIdsFrom(targetNum, dbId, userId);
  }
  return { reqId: normalized, shiftedCount };
}

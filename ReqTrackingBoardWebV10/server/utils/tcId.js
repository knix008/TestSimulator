import { query, queryOne, execute } from '../db.js';

const TC_ID_PATTERN = /^TC-(\d+)$/i;
const TEMP_PREFIX = '__TC_SHIFT_';

export function parseStandardTcNum(tcId) {
  const m = String(tcId).trim().match(TC_ID_PATTERN);
  return m ? parseInt(m[1], 10) : null;
}

export function formatStandardTcId(num) {
  return `TC-${String(num).padStart(3, '0')}`;
}

export async function getNextStandardTcId() {
  const rows = await query('SELECT tc_id FROM test_cases');
  let max = 0;
  for (const row of rows) {
    const n = parseStandardTcNum(row.tc_id);
    if (n !== null && n > max) max = n;
  }
  return formatStandardTcId(max + 1);
}

async function shiftStandardTcIdsFrom(targetNum, excludeDbId = null) {
  const rows = await query('SELECT id, tc_id FROM test_cases');
  const toShift = rows
    .filter((row) => {
      if (excludeDbId != null && Number(row.id) === Number(excludeDbId)) return false;
      const n = parseStandardTcNum(row.tc_id);
      return n !== null && n >= targetNum;
    })
    .map((row) => ({ id: row.id, num: parseStandardTcNum(row.tc_id) }));

  if (toShift.length === 0) return 0;

  for (const item of toShift) {
    await execute(
      'UPDATE test_cases SET tc_id = ? WHERE id = ?',
      [`${TEMP_PREFIX}${item.id}__`, item.id]
    );
  }

  for (const item of toShift.sort((a, b) => a.num - b.num)) {
    const newTcId = formatStandardTcId(item.num + 1);
    await execute(
      'UPDATE test_cases SET tc_id = ? WHERE id = ?',
      [newTcId, item.id]
    );
  }

  return toShift.length;
}

export async function renumberAllStandardTcIds() {
  const rows = await query('SELECT id, tc_id FROM test_cases');
  const standard = rows
    .map((row) => ({ id: row.id, num: parseStandardTcNum(row.tc_id) }))
    .filter((item) => item.num !== null)
    .sort((a, b) => a.num - b.num);

  if (standard.length === 0) return 0;

  for (const item of standard) {
    await execute(
      'UPDATE test_cases SET tc_id = ? WHERE id = ?',
      [`${TEMP_PREFIX}${item.id}__`, item.id]
    );
  }

  let renumberedCount = 0;
  for (let i = 0; i < standard.length; i++) {
    const newId = formatStandardTcId(i + 1);
    const oldId = formatStandardTcId(standard[i].num);
    await execute(
      'UPDATE test_cases SET tc_id = ? WHERE id = ?',
      [newId, standard[i].id]
    );
    if (newId !== oldId) renumberedCount++;
  }

  return renumberedCount;
}

export async function resolveTcIdForCreate(tcId) {
  const trimmed = String(tcId || '').trim();
  const resolved = trimmed || (await getNextStandardTcId());

  const targetNum = parseStandardTcNum(resolved);
  if (targetNum === null) {
    const existing = await queryOne('SELECT id FROM test_cases WHERE tc_id = ?', [resolved]);
    if (existing) throw Object.assign(new Error('Test case ID already exists'), { status: 409 });
    return { tcId: resolved, shiftedCount: 0 };
  }

  const normalized = formatStandardTcId(targetNum);
  const existing = await queryOne('SELECT id FROM test_cases WHERE tc_id = ?', [normalized]);
  let shiftedCount = 0;
  if (existing) {
    shiftedCount = await shiftStandardTcIdsFrom(targetNum, null);
  }
  return { tcId: normalized, shiftedCount };
}

export async function resolveTcIdForUpdate(dbId, newTcId, oldTcId) {
  const trimmed = String(newTcId).trim();
  if (!trimmed) throw Object.assign(new Error('tcId required'), { status: 400 });
  if (trimmed === oldTcId) return { tcId: oldTcId, shiftedCount: 0 };

  const targetNum = parseStandardTcNum(trimmed);
  if (targetNum === null) {
    const dup = await queryOne(
      'SELECT id FROM test_cases WHERE tc_id = ? AND id != ?',
      [trimmed, dbId]
    );
    if (dup) throw Object.assign(new Error('Test case ID already exists'), { status: 409 });
    return { tcId: trimmed, shiftedCount: 0 };
  }

  const normalized = formatStandardTcId(targetNum);
  const dup = await queryOne(
    'SELECT id FROM test_cases WHERE tc_id = ? AND id != ?',
    [normalized, dbId]
  );
  let shiftedCount = 0;
  if (dup) {
    shiftedCount = await shiftStandardTcIdsFrom(targetNum, dbId);
  }
  return { tcId: normalized, shiftedCount };
}

// issue_history writer. Called by the services inside the same transaction as the change, so the reports
// (which read only this table) never miss a step. Append only.
import { newId } from '../ids.js';

/**
 * @param {import('../db/base.js').Db} db
 * @param {string} issueId
 * @param {string|null} userId
 * @param {number} at epoch ms
 * @param {Array<{ field: string, from_value?: any, to_value?: any, from_label?: any, to_label?: any }>} entries
 */
export async function writeHistory(db, issueId, userId, at, entries) {
  if (!entries || !entries.length) return;
  const str = (v) => (v == null ? null : typeof v === 'string' ? v : JSON.stringify(v));
  await db.insertMany('issue_history', entries.map((e) => ({
    id: newId(), issue_id: issueId, user_id: userId || null, field: e.field,
    from_value: str(e.from_value), to_value: str(e.to_value), from_label: str(e.from_label), to_label: str(e.to_label), at,
  })));
}

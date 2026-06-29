import { query } from '../db.js';

export function memberOwnerLabel(member) {
  const displayName = String(member.display_name ?? member.displayName ?? '').trim();
  const username = String(member.username ?? '').trim();
  return displayName || username;
}

export async function validateRequirementOwner(owner, projectId) {
  const trimmed = String(owner ?? '').trim();
  if (!trimmed) return '';

  const rows = await query(
    `SELECT u.username, u.display_name
     FROM project_members pm
     JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = ?`,
    [projectId]
  );

  const lower = trimmed.toLowerCase();
  const match = rows.find((row) => {
    const label = memberOwnerLabel(row);
    return label.toLowerCase() === lower
      || String(row.username ?? '').trim().toLowerCase() === lower
      || String(row.display_name ?? '').trim().toLowerCase() === lower;
  });

  if (!match) {
    throw Object.assign(new Error('Owner must be a project participant'), { status: 400 });
  }

  return memberOwnerLabel(match);
}

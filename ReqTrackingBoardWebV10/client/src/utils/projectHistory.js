const HISTORY_FIELD_KEYS = {
  code: 'code',
  name: 'name',
  description: 'description',
  status: 'status',
  role: 'role',
  permission: 'permission',
};

function formatRole(value, t) {
  if (value === 'project_admin') return t('projects.projectAdmin');
  if (value === 'member') return t('projects.member');
  return value;
}

function formatPermission(value, t) {
  if (value === 'edit') return t('users.permissionEdit');
  if (value === 'view') return t('users.permissionView');
  return value;
}

export function formatProjectHistorySummary(entry, t) {
  const snap = entry.changes?.snapshot;
  const member = entry.changes?.member;

  if (entry.action === 'create') {
    return snap ? `${snap.code} — ${snap.name}` : t('projects.historyActions.create');
  }
  if (entry.action === 'delete') {
    return snap ? `${snap.code} — ${snap.name}` : t('projects.historyActions.delete');
  }
  if (entry.action === 'member_add' || entry.action === 'member_remove') {
    const who = snap?.displayName || snap?.username || `#${snap?.userId}`;
    const role = formatRole(snap?.role, t);
    const permission = formatPermission(snap?.permission, t);
    return `${who} (${role}, ${permission || '-'})`;
  }
  if (entry.action === 'member_update') {
    const who = member?.displayName || member?.username || '';
    const parts = [];
    if (entry.changes?.role) {
      parts.push(`${t('projects.role')}: "${formatRole(entry.changes.role.old, t)}" → "${formatRole(entry.changes.role.new, t)}"`);
    }
    if (entry.changes?.permission) {
      parts.push(`${t('users.permission')}: "${formatPermission(entry.changes.permission.old, t)}" → "${formatPermission(entry.changes.permission.new, t)}"`);
    }
    return who ? `${who} — ${parts.join('; ')}` : parts.join('; ') || '-';
  }
  if (entry.action === 'join_approve' || entry.action === 'join_reject') {
    const who = snap?.displayName || snap?.username || `#${snap?.userId}`;
    return who;
  }

  const parts = Object.entries(entry.changes || {})
    .filter(([key]) => key !== 'snapshot' && key !== 'member')
    .map(([key, val]) => {
      const label = t(`projects.historyFields.${HISTORY_FIELD_KEYS[key] || key}`);
      const oldVal = key === 'status' ? t(`status.${val.old}`) : val.old;
      const newVal = key === 'status' ? t(`status.${val.new}`) : val.new;
      return `${label}: "${oldVal}" → "${newVal}"`;
    });
  return parts.length ? parts.join('; ') : '-';
}

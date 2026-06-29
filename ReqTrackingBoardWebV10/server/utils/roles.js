export const USER_ROLES = ['user', 'admin'];
export const USER_PERMISSIONS = ['view', 'edit'];

export function isAdminRole(role) {
  return role === 'admin';
}

export function resolveUserRolePermission(role, permission) {
  const nextRole = USER_ROLES.includes(role) ? role : 'user';
  if (nextRole === 'admin') {
    return { role: 'admin', permission: 'view' };
  }
  return {
    role: 'user',
    permission: USER_PERMISSIONS.includes(permission) ? permission : 'view',
  };
}

export function canEditContent(user) {
  if (!user) return false;
  if (isAdminRole(user.role)) return true;
  return user.permission === 'edit';
}

export function mapContentPermission(row) {
  if (isAdminRole(row.role)) return null;
  return row.permission || 'view';
}

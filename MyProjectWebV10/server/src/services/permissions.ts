export type UserRole = 'admin' | 'user';

export interface UserPermissions {
  canRead: boolean;
  canModify: boolean;
}

export function normalizePermissions(
  canRead: boolean,
  canModify: boolean,
  role: UserRole = 'user',
): UserPermissions {
  if (role === 'admin') {
    return { canRead: true, canModify: true };
  }
  if (canModify) {
    return { canRead: true, canModify: true };
  }
  return { canRead, canModify: false };
}

export function permissionsFromSession(user: {
  role: UserRole;
  canRead?: boolean;
  canModify?: boolean;
  bootstrap?: boolean;
}): UserPermissions {
  if (user.bootstrap || user.role === 'admin') {
    return { canRead: true, canModify: true };
  }
  return normalizePermissions(Boolean(user.canRead), Boolean(user.canModify), user.role);
}

export function canRead(user: Parameters<typeof permissionsFromSession>[0]): boolean {
  return permissionsFromSession(user).canRead;
}

export function canModify(user: Parameters<typeof permissionsFromSession>[0]): boolean {
  return permissionsFromSession(user).canModify;
}

export function formatPermissionSummary(permissions: UserPermissions): string {
  const parts: string[] = [];
  if (permissions.canRead) parts.push('읽기');
  if (permissions.canModify) parts.push('수정');
  return parts.length > 0 ? parts.join(', ') : '없음';
}

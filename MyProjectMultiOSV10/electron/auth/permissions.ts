import type { UserRole } from './userTypes';

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
